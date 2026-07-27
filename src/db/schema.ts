/**
 * Definições de schema SQL.
 *
 * Cada constante aqui é uma string SQL CRUA que NÃO deve ser alterada depois
 * de publicada — correções devem entrar como uma nova migration. As strings
 * deste arquivo servem como fonte de documentação e são referenciadas pelas
 * migrations em `migrations.ts`.
 *
 * IMPORTANTE: a migration v1 contém apenas a tabela temporária de teste de
 * persistência. O schema definitivo (7 tabelas) entra na v2.
 */

/**
 * v1 — Tabela temporária para validar persistência do SQLite.
 *
 * `app_metadata` é propositalmente genérica (chave/valor) e NÃO faz parte do
 * schema de domínio. Ela existe apenas para o teste de gravação/leitura do
 * valor 12.5 na Fase 1 e pode ser reaproveitada depois para preferências
 * simples do app.
 */
export const SQL_CREATE_APP_METADATA = /* sql */ `
  CREATE TABLE IF NOT EXISTS app_metadata (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

/**
 * v2 — Schema de domínio completo (7 tabelas + 13 índices).
 *
 * Regras de integridade incorporadas:
 *  - Arquivamento em vez de exclusão de exercícios (`is_active`).
 *  - Histórico completo de recordes via `is_current` + índice único parcial.
 *  - No máximo UMA sessão em andamento (índice único parcial em `sessions`).
 *  - Snapshots obrigatórios de nome (`sessions.name`, `session_exercises.exercise_name`).
 *  - CHECKs numéricos (peso >= 0, reps >= 0, rir 0-3, sort_order >= 0, etc.).
 *  - Carga sempre REAL (12.5 kg é válido).
 *  - Foreign keys habilitadas em `client.ts` (PRAGMA foreign_keys = ON).
 *
 * Esta constante é IMUTÁVEL após publicada — correções entram como migration v3.
 */
export const SQL_CREATE_DOMAIN_TABLES_V2 = /* sql */ `
  -- ───────────────────────────────────────────────────────────────────────
  -- 1. exercises — banco de exercícios (com arquivamento)
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS exercises (
    id                INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name              TEXT NOT NULL,
    muscle_group      TEXT NOT NULL,
    secondary_muscles TEXT,
    equipment         TEXT,
    difficulty        TEXT,
    instructions      TEXT,
    common_mistakes   TEXT,
    video_url         TEXT,
    is_custom         INTEGER NOT NULL DEFAULT 1 CHECK(is_custom IN (0, 1)),
    is_active         INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- 2. workouts — fichas de treino (planejado)
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS workouts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name        TEXT NOT NULL,
    division    TEXT,
    notes       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- 3. workout_exercises — template planejado (imutável durante a sessão)
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS workout_exercises (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    workout_id          INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id         INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    sort_order          INTEGER NOT NULL CHECK(sort_order >= 0),
    target_sets         INTEGER NOT NULL CHECK(target_sets > 0),
    target_reps         TEXT NOT NULL,
    target_rest_seconds INTEGER CHECK(target_rest_seconds IS NULL OR target_rest_seconds >= 0),
    notes               TEXT,
    UNIQUE(workout_id, sort_order)
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- 4. sessions — sessões realizadas
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    workout_id       INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    name             TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'em_andamento'
                       CHECK(status IN ('em_andamento','concluida','cancelada')),
    started_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at         TEXT,
    duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds >= 0),
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- 5. session_exercises — snapshot executado (modificável durante a sessão)
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS session_exercises (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    session_id          INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id         INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    workout_exercise_id INTEGER REFERENCES workout_exercises(id) ON DELETE SET NULL,
    exercise_name       TEXT NOT NULL,
    sort_order          INTEGER NOT NULL CHECK(sort_order >= 0),
    is_skipped          INTEGER NOT NULL DEFAULT 0 CHECK(is_skipped IN (0, 1)),
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, sort_order)
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- 6. session_sets — cada série registrada (⭐ núcleo do app)
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS session_sets (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    session_exercise_id  INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    set_number           INTEGER NOT NULL CHECK(set_number > 0),
    weight               REAL NOT NULL CHECK(weight >= 0),
    reps                 INTEGER NOT NULL CHECK(reps >= 0),
    rir                  INTEGER CHECK(rir IS NULL OR rir BETWEEN 0 AND 3),
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_exercise_id, set_number)
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- 7. personal_records — histórico completo de recordes
  -- ───────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS personal_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    exercise_id    INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    pr_type        TEXT NOT NULL CHECK(pr_type IN ('max_weight','max_reps','estimated_1rm','max_volume')),
    value          REAL NOT NULL CHECK(value >= 0),
    session_set_id INTEGER NOT NULL REFERENCES session_sets(id) ON DELETE RESTRICT,
    session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    is_current     INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0, 1)),
    achieved_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- Índices
  -- ───────────────────────────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises(muscle_group);
  CREATE INDEX IF NOT EXISTS idx_exercises_active ON exercises(is_active);

  CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  -- ⭐ No máximo UMA sessão em andamento por banco (índice único parcial).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_session
    ON sessions(status) WHERE status = 'em_andamento';

  CREATE INDEX IF NOT EXISTS idx_session_exercises_session ON session_exercises(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_exercises_exercise ON session_exercises(exercise_id);

  CREATE INDEX IF NOT EXISTS idx_session_sets_session_exercise ON session_sets(session_exercise_id);
  CREATE INDEX IF NOT EXISTS idx_session_sets_created_at ON session_sets(created_at);

  CREATE INDEX IF NOT EXISTS idx_pr_exercise ON personal_records(exercise_id);
  CREATE INDEX IF NOT EXISTS idx_pr_session ON personal_records(session_id);
  -- ⭐ Apenas 1 recorde vigente por exercício+tipo, sem apagar o histórico.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_current_unique
    ON personal_records(exercise_id, pr_type) WHERE is_current = 1;
`;

/**
 * v3 — Ajustes de schema (aditivos, preservam a v2).
 *
 *  1. Índice único parcial normalizando nome (LOWER(TRIM)) em exercises.
 *     - "Supino Reto", "supino reto" e " Supino Reto " entram em conflito.
 *     - Só se aplica a exercícios ativos (permite recriar arquivados).
 *
 *  2. Coluna updated_at em session_sets, para suportar edição futura.
 *     - Não usamos DEFAULT CURRENT_TIMESTAMP no ALTER (SQLite restringe).
 *     - Backfill explícito com UPDATE para linhas existentes.
 *
 * Esta constante é IMUTÁVEL após publicada — correções entram como v4.
 */
export const SQL_MIGRATION_V3 = /* sql */ `
  -- ───────────────────────────────────────────────────────────────────────
  -- 1. Unicidade do nome do exercício (normalizada: LOWER(TRIM))
  -- ───────────────────────────────────────────────────────────────────────
  CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name_unique
    ON exercises(LOWER(TRIM(name))) WHERE is_active = 1;

  -- ───────────────────────────────────────────────────────────────────────
  -- 2. updated_at em session_sets (para edição futura de séries)
  --    Sem DEFAULT no ALTER — SQLite não aceita CURRENT_TIMESTAMP aqui.
  --    Backfill abaixo preenche linhas existentes.
  -- ───────────────────────────────────────────────────────────────────────
  ALTER TABLE session_sets ADD COLUMN updated_at TEXT;

  UPDATE session_sets SET updated_at = created_at WHERE updated_at IS NULL;
`;

/**
 * v4 — Arquiva exercícios pré-cadastrados antigos que não fazem parte da
 * rotina personalizada do usuário.
 *
 * Critério: arquiva (is_active = 0) exercícios com `is_custom = 0` cujo nome
 * normalizado NÃO está na lista dos novos exercícios personalizados.
 *
 * Preserva:
 *  - Exercícios customizados do usuário (is_custom = 1) — nunca toca.
 *  - Exercícios pré-cadastrados que continuam na nova lista — não arquiva.
 *  - Histórico de sessões (o arquivamento não deleta, só esconde da seleção).
 *
 * Esta constante é IMUTÁVEL após publicada.
 */
export const SQL_MIGRATION_V4 = /* sql */ `
  -- Lista dos exercícios que PERMANECEM ativos (rotina do usuário).
  -- Todos os outros pré-cadastrados (is_custom = 0) serão arquivados.
  UPDATE exercises SET is_active = 0
  WHERE is_custom = 0
    AND is_active = 1
    AND LOWER(TRIM(name)) NOT IN (
      'supino reto com barra',
      'supino inclinado halteres',
      'supino inclinado barra',
      'crucifixo maquina',
      'paralelas',
      'barra fixa pronada',
      'barra fixa supinada',
      'puxada alta',
      'puxada neutra',
      'remada curvada',
      'remada baixa',
      'agachamento livre',
      'agachamento bulgaro',
      'leg press',
      'cadeira extensora',
      'hip thrust',
      'levantamento romeno',
      'levantamento terra',
      'mesa flexora',
      'flexora sentado',
      'panturrilha em pe',
      'panturrilha sentado',
      'desenvolvimento com halteres',
      'desenvolvimento maquina',
      'elevacao lateral',
      'elevacao lateral na polia',
      'face pull',
      'rosca direta',
      'rosca scott',
      'rosca martelo',
      'triceps corda',
      'triceps frances',
      'triceps testa',
      'abdominal na polia'
    );
`;

/**
 * v5 — Reset completo dos dados de teste.
 *
 * ⚠️ Esta migration é DESTRUTIVA (apaga dados). Foi solicitada para limpar
 * tudo que foi criado durante os testes iniciais do app (exercícios antigos
 * genéricos, treinos de teste) e deixar apenas a rotina personalizada do
 * usuário, que será recriada pelo seed logo em seguida.
 *
 * Ordem respeita FKs: deleta filhos antes dos pais.
 * Preserva apenas `app_metadata` (sem o flag de seed de fichas, para forçar
 * recriação).
 *
 * Após esta migration, o `ensureSeedData` roda e recria tudo limpo.
 *
 * Esta constante é IMUTÁVEL após publicada.
 */
export const SQL_MIGRATION_V5_RESET = /* sql */ `
  -- Deleta dados em ordem respeitando FKs (filhos primeiro).
  DELETE FROM personal_records;
  DELETE FROM session_sets;
  DELETE FROM session_exercises;
  DELETE FROM sessions;
  DELETE FROM workout_exercises;
  DELETE FROM workouts;
  DELETE FROM exercises;

  -- Reseta o flag de seed de fichas para forçar recriação limpa.
  DELETE FROM app_metadata WHERE key = 'seed_workouts_v1';

  -- Reinicia o AUTOINCREMENT para IDs limpos.
  DELETE FROM sqlite_sequence WHERE name IN (
    'exercises', 'workouts', 'workout_exercises',
    'sessions', 'session_exercises', 'session_sets', 'personal_records'
  );
`;

/**
 * v6 — Coluna `cycle_order` em workouts.
 *
 * Permite definir a ordem do ciclo de treinos sem depender do nome (que pode
 * ser renomeado). Workouts com `cycle_order IS NULL` não participam do ciclo.
 *
 * Backfill one-time: mapeia os 5 seed workouts por nome (normalizado) para
 * cycle_order 1-5. Após isso, `cycle_order` é a fonte de verdade.
 *
 * Esta constante é IMUTÁVEL após publicada.
 */
export const SQL_MIGRATION_V6 = /* sql */ `
  -- Adiciona cycle_order (sem DEFAULT — NULL significa "não participa do ciclo").
  ALTER TABLE workouts ADD COLUMN cycle_order INTEGER;

  -- Backfill one-time dos seed workouts por nome normalizado.
  UPDATE workouts SET cycle_order = 1 WHERE cycle_order IS NULL AND LOWER(TRIM(name)) = 'superior a';
  UPDATE workouts SET cycle_order = 2 WHERE cycle_order IS NULL AND LOWER(TRIM(name)) = 'inferior a';
  UPDATE workouts SET cycle_order = 3 WHERE cycle_order IS NULL AND LOWER(TRIM(name)) = 'superior b';
  UPDATE workouts SET cycle_order = 4 WHERE cycle_order IS NULL AND LOWER(TRIM(name)) = 'inferior b';
  UPDATE workouts SET cycle_order = 5 WHERE cycle_order IS NULL AND LOWER(TRIM(name)) = 'superior c';
`;

/**
 * v7 — Dados do usuário e histórico de peso corporal.
 *
 * - `user_profile`: 1 linha (singleton) com peso/altura/alvo.
 * - `body_weight_entries`: histórico de pesagens (uma por dia) pra gráfico
 *   de evolução. UNIQUE(date) impede duplicar pesagem do mesmo dia.
 */
export const SQL_MIGRATION_V7 = /* sql */ `
  CREATE TABLE IF NOT EXISTS user_profile (
    id              INTEGER PRIMARY KEY CHECK(id = 1),
    name            TEXT,
    birth_date      TEXT,
    sex             TEXT CHECK(sex IS NULL OR sex IN ('M', 'F')),
    height_cm       REAL CHECK(height_cm IS NULL OR (height_cm > 0 AND height_cm < 300)),
    target_weight_kg REAL CHECK(target_weight_kg IS NULL OR target_weight_kg > 0),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS body_weight_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    weight_kg   REAL NOT NULL CHECK(weight_kg > 0 AND weight_kg < 500),
    date        TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
  );

  CREATE INDEX IF NOT EXISTS idx_body_weight_date ON body_weight_entries(date);
`;

/**
 * v8 — Programação semanal de treinos (scheduled_workouts).
 *
 * Permite que o usuário pré-programe qual treino fará em cada dia da semana.
 * day_of_week: 0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo.
 * is_rest_day: 1 = marcado como descanso (sem treino); 0 = treino programado.
 * UNIQUE(week_start_date, day_of_week): 1 entrada por dia por semana.
 */
export const SQL_MIGRATION_V8 = /* sql */ `
  CREATE TABLE IF NOT EXISTS scheduled_workouts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    week_start_date TEXT NOT NULL,
    day_of_week     INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    workout_id      INTEGER REFERENCES workouts(id) ON DELETE CASCADE,
    is_rest_day     INTEGER NOT NULL DEFAULT 0 CHECK(is_rest_day IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(week_start_date, day_of_week)
  );

  CREATE INDEX IF NOT EXISTS idx_scheduled_week ON scheduled_workouts(week_start_date);
`;
