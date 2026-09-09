import { SQL_CREATE_APP_METADATA, SQL_CREATE_DOMAIN_TABLES_V2, SQL_MIGRATION_V3, SQL_MIGRATION_V4, SQL_MIGRATION_V5_RESET, SQL_MIGRATION_V6, SQL_MIGRATION_V7, SQL_MIGRATION_V8 } from './schema';

/**
 * Migrations versionadas do banco de dados.
 *
 * Regras:
 *  1. NUNCA altere uma migration já publicada. Crie uma nova entrada no fim.
 *  2. Cada migration recebe um número de versão inteiro e crescente.
 *  3. As migrations são aplicadas em ordem, apenas as pendentes, controladas
 *     por `PRAGMA user_version`.
 *  4. Cada passo executa DENTRO de uma transação. Se algo falhar, o banco
 *     permanece na versão anterior — nada fica pela metade.
 *
 * Quando o usuário já tiver treinos registrados, adicionar uma migration NUNCA
 * deve destruir dados. As migrations são aditivas.
 */
export interface Migration {
  version: number;
  description: string;
  /** SQL executado dentro de uma transação. */
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Cria tabela temporária app_metadata (teste de persistência).',
    up: SQL_CREATE_APP_METADATA,
  },
  {
    version: 2,
    description:
      'Cria as 7 tabelas de domínio (exercises, workouts, workout_exercises, ' +
      'sessions, session_exercises, session_sets, personal_records) e 13 índices.',
    up: SQL_CREATE_DOMAIN_TABLES_V2,
  },
  {
    version: 3,
    description:
      'Índice único parcial do nome do exercício (LOWER(TRIM)) e coluna ' +
      'updated_at em session_sets com backfill.',
    up: SQL_MIGRATION_V3,
  },
  {
    version: 4,
    description:
      'Arquiva exercícios pré-cadastrados antigos que não fazem parte da ' +
      'rotina personalizada do usuário (preserva custom e histórico).',
    up: SQL_MIGRATION_V4,
  },
  {
    version: 5,
    description:
      'Reset destrutivo dos dados de teste (exercícios/treinos de teste) ' +
      'para deixar apenas a rotina personalizada. Recriada pelo seed.',
    up: SQL_MIGRATION_V5_RESET,
  },
  {
    version: 6,
    description:
      'Adiciona cycle_order em workouts (ordem do ciclo imune a renomeações) ' +
      'com backfill one-time dos seed workouts.',
    up: SQL_MIGRATION_V6,
  },
  {
    version: 7,
    description:
      'Cria tabelas user_profile (dados pessoais + alvo) e body_weight_entries ' +
      '(histórico de pesagens para gráfico de evolução).',
    up: SQL_MIGRATION_V7,
  },
  {
    version: 8,
    description:
      'Cria tabela scheduled_workouts (programação semanal: qual treino em cada dia).',
    up: SQL_MIGRATION_V8,
  },
];

/** Versão alvo atual do schema (maior version das migrations). */
export const TARGET_DB_VERSION = migrations[migrations.length - 1].version;

/**
 * Recusa abrir um banco cuja versão é MAIOR que a que este build entende.
 *
 * Acontece de verdade num PWA: o app fica instalado em mais de um aparelho e
 * um deles pode estar numa versão anterior. Sem esta checagem, o build antigo
 * abria um banco migrado pelo novo, não via migration pendente nenhuma
 * (`m.version > currentVersion` não casa com nada) e ainda assim regravava
 * `PRAGMA user_version` para o alvo dele — rebaixando o banco e passando a
 * escrever com código que não conhece o schema novo.
 *
 * Falhar aqui é o comportamento certo: a tela de erro pede para atualizar o
 * app, e os dados ficam intactos.
 */
export function recusarVersaoFutura(currentVersion: number): void {
  if (currentVersion > TARGET_DB_VERSION) {
    throw new Error(
      `O banco está na versão ${currentVersion}, mais nova que a versão ` +
        `${TARGET_DB_VERSION} que este app entende. Atualize o app.`,
    );
  }
}
