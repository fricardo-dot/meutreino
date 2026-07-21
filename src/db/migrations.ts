import { SQL_CREATE_APP_METADATA, SQL_CREATE_DOMAIN_TABLES_V2, SQL_MIGRATION_V3, SQL_MIGRATION_V4, SQL_MIGRATION_V5_RESET, SQL_MIGRATION_V6, SQL_MIGRATION_V7 } from './schema';

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
];

/** Versão alvo atual do schema (maior version das migrations). */
export const TARGET_DB_VERSION = migrations[migrations.length - 1].version;
