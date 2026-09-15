import type {
  AppDatabase,
  DbTransaction,
  SqlParameter,
} from '@/types/app-database';
import type { DbExecutor } from '@/types/db-executor';

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
  // `workout_packs` vem ANTES de `workouts`: a ficha referencia o pacote, e a
  // importação insere na ordem desta lista justamente para o pai existir.
  'workout_packs',
  // Mesma razão: `pack_runs` referencia o pacote.
  'pack_runs',
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
 * Dois casos de uso, e o segundo é o exigente: restaurar num aparelho vazio, e
 * MESCLAR dois aparelhos que foram usados em paralelo. A exportação serializa
 * tudo num JSON; a importação casa cada linha pelo `uid` (v11), traduz as
 * chaves estrangeiras do arquivo para os ids locais e grava, tudo numa
 * transação só — ou entra inteiro, ou nada.
 *
 * `ON CONFLICT DO UPDATE` sobrou apenas para `user_profile` e `app_metadata`,
 * cujas chaves já são as mesmas nos dois aparelhos. Para o resto ele não serve:
 * a chave primária é AUTOINCREMENT local e não identifica linha entre
 * aparelhos — casar por ela fazia uma sobrescrever a outra.
 *
 * Compatibilidade (frente e verso):
 *  - Tabelas ausentes do JSON são puladas (backup antigo restaurando em DB novo).
 *  - Colunas ausentes do DB alvo são puladas (backup novo restaurando em DB antigo).
 *  - Tabelas do JSON inexistentes no DB são puladas com aviso.
 *  - Arquivo sem `uid` (anterior à v11) ainda importa: a identidade vem da
 *    chave natural de cada tabela.
 */
/** O que um arquivo de backup contem, lido sem importar nada. */
export interface BackupInfo {
  /** Quando foi gerado (ISO, UTC). */
  exportedAt: string;
  /** Quantas linhas por tabela. */
  linhas: Partial<Record<BackupTableName, number>>;
  /** Total de linhas do arquivo. */
  total: number;
}

export const backupService = {
  /**
   * Lê o cabeçalho de um backup SEM aplicar nada.
   *
   * Existe para a confirmação poder dizer de QUANDO é o arquivo. Sem isso, a
   * pergunta "importar?" é feita às cegas: num fluxo de dois aparelhos, o
   * risco não é perder dado (a importação mescla, não substitui) e sim
   * mesclar o arquivo errado e não perceber.
   *
   * @throws pelas mesmas validações da importação — formato inválido é
   *         recusado aqui, antes de qualquer escrita.
   */
  descrever(json: string): BackupInfo {
    const payload = parseBackup(json);
    const linhas: Partial<Record<BackupTableName, number>> = {};
    let total = 0;
    for (const [tabela, rows] of Object.entries(payload.data)) {
      if (!Array.isArray(rows)) continue;
      linhas[tabela as BackupTableName] = rows.length;
      total += rows.length;
    }
    return { exportedAt: payload.exportedAt, linhas, total };
  },

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
   * Importa um JSON de backup, MESCLANDO com o que já existe.
   *
   * Mesclar de verdade exige responder "esta linha do arquivo é a mesma linha
   * que já tenho aqui?" — e `id` não responde isso. Ele é AUTOINCREMENT local:
   * a primeira sessão criada no celular e a primeira criada no PC nascem ambas
   * com id 1 sem terem nada a ver uma com a outra. Casar por id fazia uma
   * sobrescrever a outra, e sumia treino registrado.
   *
   * Quem responde é o `uid` (migration v11), sorteado no aparelho que criou a
   * linha. O id do arquivo deixa de ser gravado: cada linha nova recebe um id
   * LOCAL, e as chaves estrangeiras do arquivo são traduzidas para esses ids
   * enquanto a importação avança — por isso a ordem de {@link BACKUP_TABLES},
   * com pai antes de filho, deixou de ser só conveniência e virou requisito.
   *
   * Backup ANTIGO (sem uid) continua importável: aí a identidade vem da chave
   * natural de cada tabela (o nome do exercício, o horário de início da
   * sessão, a data da pesagem). É também o que faz os catálogos dos dois
   * aparelhos convergirem em vez de duplicarem.
   *
   * Tudo dentro de UMA transação: ou entra inteiro, ou nada.
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

    await db.withTransactionAsync(async (tx) => {
      /** Por tabela: id COMO VEIO NO ARQUIVO -> id local correspondente. */
      const mapas = new Map<BackupTableName, Map<number, number>>();

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

        // Os pacotes do arquivo trazem consigo qual estava ativo. Se o aparelho
        // local também tem um ativo, os dois coexistiriam por um instante e o
        // índice único derrubaria a importação inteira. Zerar antes deixa a
        // decisão com o arquivo; `reconciliarPacotes` garante que sobre um.
        if (table === 'workout_packs' && rows.length > 0) {
          await tx.runAsync('UPDATE workout_packs SET is_active = 0;');
        }

        summary[table] = await importarTabela(tx, table, rows, dbColumns, mapas);
      }

      await reconciliarPacotes(tx);
      await reconciliarRecordes(tx);
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
/**
 * Deixa o estado dos pacotes consistente depois de importar.
 *
 * Duas situações que o arquivo pode criar:
 *
 *  - NENHUM pacote ativo — o arquivo trouxe pacotes todos arquivados, ou
 *    trouxe pacotes e nenhum marcado como ativo. Sem um ativo, a aba Treinos
 *    fica vazia e ficha nova nasce órfã.
 *
 *  - Fichas com `pack_id` nulo — backup ANTIGO, gerado antes dos pacotes
 *    existirem. A ficha entra no banco mas não aparece em tela nenhuma,
 *    porque toda consulta da UI filtra pelo pacote ativo. É o mesmo backfill
 *    que a migration v9 faz, aplicado ao que acabou de chegar.
 */
async function reconciliarPacotes(tx: DbTransaction): Promise<void> {
  const ativo = await tx.getFirstAsync<{ id: number }>(
    'SELECT id FROM workout_packs WHERE is_active = 1 LIMIT 1;',
  );

  if (!ativo) {
    // Sem ativo: promove o mais recente. Se nem isso existir, o banco não tem
    // pacote nenhum — cria um para as fichas terem onde morar.
    const candidato = await tx.getFirstAsync<{ id: number }>(
      'SELECT id FROM workout_packs ORDER BY archived_at DESC, id DESC LIMIT 1;',
    );
    if (candidato) {
      await tx.runAsync(
        'UPDATE workout_packs SET is_active = 1, archived_at = NULL WHERE id = ?;',
        [candidato.id],
      );
    } else {
      await tx.runAsync(
        "INSERT INTO workout_packs (name, is_active) VALUES ('Meu treino', 1);",
      );
    }
  }

  await tx.runAsync(
    `UPDATE workouts
        SET pack_id = (SELECT id FROM workout_packs WHERE is_active = 1)
      WHERE pack_id IS NULL;`,
  );
}

/**
 * Como cada tabela é identificada entre aparelhos.
 *
 * `fks` diz quais colunas apontam para outra tabela — são traduzidas do id do
 * arquivo para o id local antes de gravar.
 *
 * `natural` é a identidade de reserva, usada quando o `uid` não resolve:
 * backup gerado antes da v11, ou a mesma coisa criada dos dois lados sem uma
 * saber da outra (o catálogo de exercícios do seed é o caso clássico). Sem
 * ela, importar duplicaria tudo que os dois aparelhos têm em comum.
 *
 * `porChavePrimaria` marca as duas tabelas que não precisam de nada disso:
 * `app_metadata` tem chave textual, igual nos dois aparelhos, e `user_profile`
 * é linha única — mesclar perfil é sobrescrever mesmo.
 */
interface RegraDeMesclagem {
  fks?: Partial<Record<string, BackupTableName>>;
  natural?: { coluna: string; sql?: string; norm?: (v: SqlParameter) => SqlParameter }[];
  porChavePrimaria?: true;
}

const REGRAS: Record<BackupTableName, RegraDeMesclagem> = {
  exercises: {
    // O índice único já é em LOWER(TRIM(name)): a comparação aqui é a mesma.
    natural: [{
      coluna: 'name',
      sql: 'LOWER(TRIM(name))',
      norm: (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    }],
  },
  workout_packs: { natural: [{ coluna: 'name' }] },
  pack_runs: {
    fks: { pack_id: 'workout_packs' },
    natural: [{ coluna: 'pack_id' }, { coluna: 'day_of_week' }],
  },
  workouts: {
    fks: { pack_id: 'workout_packs' },
    natural: [{ coluna: 'pack_id' }, { coluna: 'name' }],
  },
  workout_exercises: {
    fks: { workout_id: 'workouts', exercise_id: 'exercises' },
    natural: [{ coluna: 'workout_id' }, { coluna: 'exercise_id' }, { coluna: 'sort_order' }],
  },
  sessions: {
    fks: { workout_id: 'workouts' },
    // `started_at` tem segundos: dois treinos não começam no mesmo instante.
    natural: [{ coluna: 'started_at' }],
  },
  session_exercises: {
    fks: {
      session_id: 'sessions',
      exercise_id: 'exercises',
      workout_exercise_id: 'workout_exercises',
    },
    natural: [{ coluna: 'session_id' }, { coluna: 'sort_order' }],
  },
  session_sets: {
    fks: { session_exercise_id: 'session_exercises' },
    natural: [{ coluna: 'session_exercise_id' }, { coluna: 'set_number' }],
  },
  personal_records: {
    fks: {
      exercise_id: 'exercises',
      session_set_id: 'session_sets',
      session_id: 'sessions',
    },
    natural: [{ coluna: 'exercise_id' }, { coluna: 'pr_type' }, { coluna: 'achieved_at' }],
  },
  user_profile: { porChavePrimaria: true },
  body_weight_entries: { natural: [{ coluna: 'date' }] },
  scheduled_workouts: {
    fks: { workout_id: 'workouts' },
    natural: [{ coluna: 'week_start_date' }, { coluna: 'day_of_week' }],
  },
  app_metadata: { porChavePrimaria: true },
};

/**
 * Importa uma tabela e devolve quantas linhas entraram.
 *
 * Alimenta `mapas` com a tradução id-do-arquivo -> id-local desta tabela, que
 * as tabelas filhas usam logo em seguida.
 */
async function importarTabela(
  tx: DbTransaction,
  table: BackupTableName,
  rows: unknown[],
  dbColumns: string[],
  mapas: Map<BackupTableName, Map<number, number>>,
): Promise<number> {
  const regra = REGRAS[table];
  const mapa = new Map<number, number>();
  mapas.set(table, mapa);

  if (regra.porChavePrimaria) {
    return upsertPorChavePrimaria(tx, table, rows, dbColumns);
  }

  const temUid = dbColumns.includes('uid');
  /** Linhas locais já reivindicadas por alguma linha do arquivo. */
  const usados = new Set<number>();
  let importadas = 0;

  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      console.warn(`[backup] Linha inválida em "${table}" — pulando.`);
      continue;
    }
    const origem = row as Record<string, unknown>;

    const valores: Record<string, SqlParameter> = {};
    for (const c of dbColumns) {
      if (c in origem) valores[c] = toSqlValue(origem[c]);
    }
    if (Object.keys(valores).length === 0) continue;

    if (!traduzirFks(table, valores, mapas)) {
      // Filho cujo pai não veio no arquivo: gravar manteria o id do arquivo,
      // que aqui aponta para outra coisa qualquer. Melhor não entrar.
      console.warn(`[backup] Linha órfã em "${table}" — pulando.`);
      continue;
    }

    const idLocal = await acharLocal(tx, table, valores, temUid, usados);

    if (!(await liberarIndicesUnicos(tx, table, valores, idLocal))) continue;

    // O id do arquivo NUNCA é gravado: ele vale só no aparelho que o gerou.
    const colunas = Object.keys(valores).filter((c) => c !== 'id');
    if (colunas.length === 0) continue;

    let idFinal: number;
    if (idLocal !== null) {
      await tx.runAsync(
        `UPDATE ${table} SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?;`,
        [...colunas.map((c) => valores[c]), idLocal],
      );
      idFinal = idLocal;
    } else {
      const r = await tx.runAsync(
        `INSERT INTO ${table} (${colunas.join(', ')})
         VALUES (${colunas.map(() => '?').join(', ')});`,
        colunas.map((c) => valores[c]),
      );
      idFinal = r.lastInsertRowId;
    }

    usados.add(idFinal);
    if (typeof origem.id === 'number') mapa.set(origem.id, idFinal);
    importadas += 1;
  }

  return importadas;
}

/**
 * Traduz as FKs da linha, do id do arquivo para o id local.
 *
 * @returns `false` se alguma referência não tem correspondente — linha órfã.
 */
function traduzirFks(
  table: BackupTableName,
  valores: Record<string, SqlParameter>,
  mapas: Map<BackupTableName, Map<number, number>>,
): boolean {
  for (const [coluna, tabelaPai] of Object.entries(REGRAS[table].fks ?? {})) {
    const valor = valores[coluna];
    if (valor === undefined || valor === null || tabelaPai === undefined) continue;

    const mapaPai = mapas.get(tabelaPai);
    // Arquivo antigo que nem trazia essa tabela: mantém o valor como veio,
    // que é o comportamento de antes desta mudança.
    if (!mapaPai) continue;

    const local = mapaPai.get(Number(valor));
    if (local === undefined) return false;
    valores[coluna] = local;
  }
  return true;
}

/**
 * Acha a linha local correspondente: primeiro pelo `uid`, depois pela chave
 * natural. `null` quando é linha nova aqui.
 *
 * `usados` impede que duas linhas do arquivo caiam na mesma linha local — dois
 * pacotes de mesmo nome, por exemplo, em que a segunda apagaria a primeira.
 */
async function acharLocal(
  tx: DbTransaction,
  table: BackupTableName,
  valores: Record<string, SqlParameter>,
  temUid: boolean,
  usados: Set<number>,
): Promise<number | null> {
  if (temUid && typeof valores.uid === 'string') {
    const achado = await tx.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${table} WHERE uid = ? LIMIT 1;`,
      [valores.uid],
    );
    if (achado) return achado.id;
  }

  const natural = REGRAS[table].natural;
  if (!natural || natural.length === 0) return null;

  const condicoes: string[] = [];
  const params: SqlParameter[] = [];
  for (const chave of natural) {
    const valor = valores[chave.coluna];
    // Sem a coluna na linha do arquivo não dá para afirmar identidade.
    if (valor === undefined) return null;
    const expr = chave.sql ?? chave.coluna;
    if (valor === null) {
      condicoes.push(`${expr} IS NULL`);
      continue;
    }
    condicoes.push(`${expr} = ?`);
    params.push(chave.norm ? chave.norm(valor) : valor);
  }

  const candidatos = await tx.getAllAsync<{ id: number }>(
    `SELECT id FROM ${table} WHERE ${condicoes.join(' AND ')} ORDER BY id;`,
    params,
  );
  return candidatos.find((c) => !usados.has(c.id))?.id ?? null;
}

/**
 * Abre espaço nos índices únicos parciais antes de gravar.
 *
 * Dois casos, os dois capazes de derrubar a importação inteira:
 *
 *  - **sessão em andamento**: só pode haver uma. Se o arquivo traz uma e aqui
 *    já existe OUTRA, a do arquivo é pulada — treino em andamento é do momento
 *    e do aparelho, e abortar a importação por causa dele seria pior;
 *
 *  - **recorde vigente**: um por exercício+tipo. O do arquivo entra e o local
 *    sai de vigente; `reconciliarRecordes` decide no fim quem é o maior.
 *
 * @returns `false` quando a linha deve ser pulada.
 */
async function liberarIndicesUnicos(
  tx: DbTransaction,
  table: BackupTableName,
  valores: Record<string, SqlParameter>,
  idLocal: number | null,
): Promise<boolean> {
  if (table === 'sessions' && valores.status === 'em_andamento') {
    const emAndamento = await tx.getFirstAsync<{ id: number }>(
      "SELECT id FROM sessions WHERE status = 'em_andamento' LIMIT 1;",
    );
    if (emAndamento && emAndamento.id !== idLocal) {
      console.warn('[backup] Já há um treino em andamento aqui — pulando o do arquivo.');
      return false;
    }
  }

  if (table === 'personal_records' && Number(valores.is_current) === 1) {
    await tx.runAsync(
      `UPDATE personal_records SET is_current = 0
        WHERE exercise_id = ? AND pr_type = ? AND is_current = 1
          AND id IS NOT ?;`,
      [valores.exercise_id ?? null, valores.pr_type ?? null, idLocal],
    );
  }

  return true;
}

/**
 * Caminho das tabelas cuja chave já é a mesma nos dois aparelhos.
 *
 * `app_metadata` é chave textual; `user_profile` é linha única. Upsert por
 * chave primária, como sempre foi.
 */
async function upsertPorChavePrimaria(
  tx: DbTransaction,
  table: BackupTableName,
  rows: unknown[],
  dbColumns: string[],
): Promise<number> {
  const pkCols = await getPrimaryKey(tx, table);
  let importadas = 0;

  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      console.warn(`[backup] Linha inválida em "${table}" — pulando.`);
      continue;
    }
    const origem = row as Record<string, unknown>;
    const cols = dbColumns.filter((c) => c in origem);
    if (cols.length === 0) continue;

    const params = cols.map((c) => toSqlValue(origem[c]));
    const temPk = pkCols.length > 0 && pkCols.every((c) => cols.includes(c));
    const atualizaveis = cols.filter((c) => !pkCols.includes(c));

    // UPSERT, não REPLACE: REPLACE apaga a linha conflitante antes de inserir
    // e dispara as FKs — abortava por RESTRICT e apagava filhos por CASCADE.
    let sql: string;
    if (!temPk) {
      sql = `INSERT INTO ${table} (${cols.join(', ')})
             VALUES (${cols.map(() => '?').join(', ')});`;
    } else if (atualizaveis.length === 0) {
      sql = `INSERT INTO ${table} (${cols.join(', ')})
             VALUES (${cols.map(() => '?').join(', ')})
             ON CONFLICT(${pkCols.join(', ')}) DO NOTHING;`;
    } else {
      sql = `INSERT INTO ${table} (${cols.join(', ')})
             VALUES (${cols.map(() => '?').join(', ')})
             ON CONFLICT(${pkCols.join(', ')}) DO UPDATE SET
               ${atualizaveis.map((c) => `${c} = excluded.${c}`).join(', ')};`;
    }

    await tx.runAsync(sql, params);
    importadas += 1;
  }

  return importadas;
}

/**
 * Deixa um único recorde vigente por exercício+tipo, e que seja o maior.
 *
 * Os dois aparelhos podem ter recordes diferentes marcados como vigentes para
 * o mesmo exercício. Durante o laço o do arquivo entra e o local sai de
 * vigente; aqui a decisão é refeita olhando o VALOR, que é o que define um
 * recorde. Empate desempata pela data mais recente.
 */
async function reconciliarRecordes(tx: DbTransaction): Promise<void> {
  await tx.runAsync('UPDATE personal_records SET is_current = 0 WHERE is_current = 1;');
  await tx.runAsync(
    `UPDATE personal_records SET is_current = 1
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY exercise_id, pr_type
                   ORDER BY value DESC, achieved_at DESC, id DESC
                 ) AS posicao
            FROM personal_records
        )
        WHERE posicao = 1
      );`,
  );
}

async function getTableColumns(
  db: DbExecutor,
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
  db: DbExecutor,
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
