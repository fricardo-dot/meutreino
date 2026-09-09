import type { AppDatabase, SqlParameter } from '@/types/app-database';

/**
 * Versão do formato de backup.
 *
 * Incrementar quando o layout do JSON mudar de forma incompatível. A UI pode
 * usar este número para recusar arquivos muito novos (ou migrar antigos).
 */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Tabelas exportadas/importadas, na ordem respeitando FKs (pais antes de
 * filhos). Esta é a ordem tanto do SELECT (export) quanto do INSERT (import),
 * garantindo que, ao importar, toda linha filha encontre seu pai já inserido.
 *
 * Notas:
 *  - `exercises` aparece uma única vez (no topo) — basta.
 *  - `app_metadata` fica por último (não tem FK; é chave/valor genérica).
 */
export const BACKUP_TABLES = [
  'exercises',
  'workouts',
  'workout_exercises',
  'sessions',
  'session_exercises',
  'session_sets',
  'personal_records',
  'user_profile',
  'body_weight_entries',
  'scheduled_workouts',
  'app_metadata',
] as const;

/** Nome de tabela participante do backup. */
export type BackupTableName = (typeof BACKUP_TABLES)[number];

/**
 * Layout do arquivo de backup (o JSON serializado).
 */
export interface BackupPayload {
  /** Versão do formato (esperado: {@link BACKUP_FORMAT_VERSION}). */
  version: number;
  /** ISO timestamp de quando o backup foi gerado. */
  exportedAt: string;
  /** Dados por tabela — cada tabela é um array de linhas. */
  data: Partial<Record<BackupTableName, Record<string, unknown>[]>>;
}

/**
 * Resumo da importação — contagem de linhas inseridas/atualizadas por tabela.
 * Tabelas ausentes do JSON ou inexistentes no DB não aparecem aqui.
 */
export type ImportSummary = Partial<Record<BackupTableName, number>>;

/**
 * BackupService — exportação/importação de TODOS os dados do app.
 *
 * Caso de uso: o usuário troca de aparelho ou reinstala e precisa restaurar
 * treinos, histórico, recordes e perfil. A exportação serializa tudo num JSON;
 * a importação faz upsert (`INSERT OR REPLACE`) dentro de uma transação, de
 * modo que a restauração seja atômica (tudo ou nada).
 *
 * Compatibilidade (frente e verso):
 *  - Tabelas ausentes do JSON são puladas (backup antigo restaurando em DB novo).
 *  - Colunas ausentes do DB alvo são puladas (backup novo restaurando em DB antigo).
 *  - Tabelas do JSON inexistentes no DB são puladas com aviso.
 */
export const backupService = {
  /**
   * Exporta TODAS as tabelas do app num JSON.
   *
   * Faz `SELECT *` em cada tabela de {@link BACKUP_TABLES} e monta um payload
   * versionado. Retorna a string JSON pronta para a UI compartilhar/salvar.
   *
   * @returns string JSON com `{ version, exportedAt, data }`.
   */
  async exportData(db: AppDatabase): Promise<string> {
    const data: BackupPayload['data'] = {};

    for (const table of BACKUP_TABLES) {
      // SELECT * é suficiente: queremos TODAS as colunas, sem filtros.
      // O nome da tabela vem de BACKUP_TABLES (lista fixa, não entrada do
      // usuário), então interpolar aqui é seguro contra injeção.
      data[table] = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${table};`,
      );
    }

    const payload: BackupPayload = {
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    };

    return JSON.stringify(payload);
  },

  /**
   * Importa um JSON de backup, restaurando todas as tabelas.
   *
   * - Tudo dentro de UMA transação (`withTransactionAsync`): ou tudo entra,
   *   ou nada (rollback em caso de erro).
   * - Usa `INSERT OR REPLACE` (upsert): linhas existentes com o mesmo id são
   *   sobrescritas; os IDs originais são preservados.
   * - As tabelas são inseridas na ordem de {@link BACKUP_TABLES} (pais antes
   *   de filhos) para satisfazer as FKs.
   * - Para cada tabela, consulta `PRAGMA table_info` para descobrir as colunas
   *   do DB alvo e importar apenas as colunas que existem (forward compat).
   *
   * @param jsonString conteúdo do arquivo de backup (gerado por `exportData`).
   * @returns resumo com a contagem de linhas importadas por tabela.
   * @throws se o JSON for inválido ou não tiver o formato esperado.
   */
  async importData(
    db: AppDatabase,
    jsonString: string,
  ): Promise<ImportSummary> {
    const payload = parseBackup(jsonString);
    const summary: ImportSummary = {};

    await db.withTransactionAsync(async () => {
      for (const table of BACKUP_TABLES) {
        const rows = payload.data[table];

        // Tabela ausente do backup (backup antigo) — pula silenciosamente.
        if (!Array.isArray(rows)) continue;

        // Colunas que existem no DB alvo. Se vier vazio, a tabela não existe
        // neste DB (backup novo restaurando em app antigo) — avisa e pula.
        const dbColumns = await getTableColumns(db, table);
        if (dbColumns.length === 0) {
          console.warn(
            `[backup] Tabela "${table}" não existe no banco — pulando.`,
          );
          continue;
        }

        const pkCols = await getPrimaryKey(db, table);

        let imported = 0;
        for (const row of rows) {
          // Linha que não é objeto (arquivo corrompido ou de outra origem)
          // faria o `c in row` abaixo lançar TypeError. Pula e segue.
          if (typeof row !== 'object' || row === null || Array.isArray(row)) {
            console.warn(`[backup] Linha inválida em "${table}" — pulando.`);
            continue;
          }

          // Apenas colunas presentes tanto no DB quanto na linha (ordem do DB).
          // Isto descarta automaticamente colunas desconhecidas do JSON
          // (forward compat) e tolera linhas com colunas opcionais ausentes.
          const cols = dbColumns.filter((c) => c in row);
          if (cols.length === 0) continue;

          const placeholders = cols.map(() => '?').join(', ');
          const params = cols.map((c) => toSqlValue(row[c]));

          // UPSERT, não REPLACE.
          //
          // `INSERT OR REPLACE` parece um upsert mas não é: o SQLite APAGA a
          // linha conflitante antes de inserir a nova, e o DELETE dispara as
          // foreign keys. Com o schema deste app isso dava dois estragos:
          //   - apagar um `exercise` referenciado por `workout_exercises`
          //     (ON DELETE RESTRICT) abortava a importação inteira;
          //   - apagar um `workout` levava junto, por ON DELETE CASCADE, os
          //     `workout_exercises` e `scheduled_workouts` locais — some
          //     silenciosamente o que não estivesse no arquivo importado.
          //
          // `ON CONFLICT DO UPDATE` atualiza a linha no lugar: nenhum DELETE,
          // nenhuma cascata. Se a linha do backup colidir com OUTRA linha por
          // um índice único que não seja a PK (dois exercícios de mesmo nome
          // com ids diferentes, por exemplo), a importação falha e a transação
          // inteira é desfeita — o usuário mantém os dados que tinha, que é
          // muito melhor que apagá-los em silêncio.
          const temPk = pkCols.length > 0 && pkCols.every((c) => cols.includes(c));
          const colsParaAtualizar = cols.filter((c) => !pkCols.includes(c));

          let sql: string;
          if (!temPk) {
            // Sem PK na linha (não ocorre neste schema): insere e deixa o
            // SQLite atribuir o id.
            sql = `INSERT INTO ${table} (${cols.join(', ')})
                   VALUES (${placeholders});`;
          } else if (colsParaAtualizar.length === 0) {
            // A linha só traz a própria PK — não há o que atualizar.
            sql = `INSERT INTO ${table} (${cols.join(', ')})
                   VALUES (${placeholders})
                   ON CONFLICT(${pkCols.join(', ')}) DO NOTHING;`;
          } else {
            sql = `INSERT INTO ${table} (${cols.join(', ')})
                   VALUES (${placeholders})
                   ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET
                     ${colsParaAtualizar
                       .map((c) => `${c} = excluded.${c}`)
                       .join(', ')};`;
          }

          await db.runAsync(sql, params);
          imported += 1;
        }

        summary[table] = imported;
      }
    });

    return summary;
  },
};

/**
 * Lê os nomes das colunas de uma tabela via `PRAGMA table_info`.
 * Retorna `[]` se a tabela não existir no DB.
 *
 * Nota: PRAGMA não aceita bind de parâmetro; `table` vem de BACKUP_TABLES
 * (lista fixa), então a interpolação é segura.
 */
async function getTableColumns(
  db: AppDatabase,
  table: BackupTableName,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table});`,
  );
  return rows.map((r) => r.name);
}

/**
 * Colunas que formam a chave primária da tabela, na ordem declarada.
 *
 * Usada como alvo do UPSERT na importação. Quase todas as tabelas usam `id`;
 * `app_metadata` usa `key`.
 */
async function getPrimaryKey(
  db: AppDatabase,
  table: BackupTableName,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string; pk: number }>(
    `PRAGMA table_info(${table});`,
  );
  return rows
    .filter((r) => r.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((r) => r.name);
}

/**
 * Normaliza um valor lido do JSON para algo bindável em SQL.
 *
 * - `null`        -> `null`
 * - number/string -> como estão
 * - boolean       -> `0`/`1` (o SQLite guarda booleanos como inteiro)
 * - array/objeto  -> JSON string (defensivo; não ocorre neste schema)
 */
function toSqlValue(value: unknown): SqlParameter {
  if (value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}

/**
 * Faz parse e valida o formato do backup.
 * @throws se o JSON for inválido ou não tiver a estrutura esperada.
 */
function parseBackup(jsonString: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new Error('Backup inválido: JSON malformado.', { cause: error });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error('Backup inválido: a raiz não é um objeto.');
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) {
    throw new Error('Backup inválido: campo "version" ausente ou inválido.');
  }

  // Recusa formato mais novo do que este app entende.
  //
  // Antes o `version` só precisava ser um número — nunca era comparado com
  // BACKUP_FORMAT_VERSION. Um arquivo de formato futuro, com semântica
  // diferente, era aceito: as colunas reconhecidas entravam, as demais eram
  // descartadas em silêncio, e a UI anunciava "importação concluída" sobre um
  // banco parcialmente sobrescrito.
  //
  // Formato ANTIGO continua aceito de propósito: a importação já tolera
  // colunas ausentes, e recusar um backup velho deixaria o usuário sem saída.
  if (obj.version > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Este backup foi criado por uma versão mais nova do app ` +
        `(formato v${obj.version}; este app entende até v${BACKUP_FORMAT_VERSION}). ` +
        `Atualize o app para importar este arquivo.`,
    );
  }
  if (typeof obj.exportedAt !== 'string') {
    throw new Error('Backup inválido: campo "exportedAt" ausente ou inválido.');
  }
  if (
    typeof obj.data !== 'object' ||
    obj.data === null ||
    Array.isArray(obj.data)
  ) {
    throw new Error('Backup inválido: campo "data" ausente ou inválido.');
  }

  return obj as unknown as BackupPayload;
}
