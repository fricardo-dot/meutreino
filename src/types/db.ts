/**
 * Tipos TypeScript que espelham as tabelas do banco de dados.
 *
 * Convenção: interfaces terminadas em `Row` representam exatamente uma linha
 * retornada pelo SQLite (todas as colunas). Booleanos do SQLite (0/1) ficam
 * como `number` aqui — a conversão para `boolean` acontece no repositório.
 *
 * Os `*Input` são os dados para inserção: omitimos id/timestamps que o banco
 * preenche automaticamente.
 */

/** Grupos musculares principais. */
export type MuscleGroup =
  | 'peito'
  | 'costas'
  | 'pernas'
  | 'ombros'
  | 'braços'
  | 'core';

/** Equipamentos comuns. */
export type Equipment =
  | 'barra'
  | 'halteres'
  | 'máquina'
  | 'cabo'
  | 'peso do corpo'
  | 'kettlebell'
  | 'elástico';

/** Nível de dificuldade. */
export type Difficulty = 'iniciante' | 'intermediário' | 'avançado';

/** Status de uma sessão. */
export type SessionStatus = 'em_andamento' | 'concluida' | 'cancelada';

/** Tipos de recorde pessoal. */
export type PrType = 'max_weight' | 'max_reps' | 'estimated_1rm' | 'max_volume';

// ─────────────────────────────────────────────────────────────────────────────
// exercises
// ─────────────────────────────────────────────────────────────────────────────
export interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  secondary_muscles: string | null;
  equipment: string | null;
  difficulty: string | null;
  instructions: string | null;
  common_mistakes: string | null;
  video_url: string | null;
  is_custom: number; // 0 | 1
  is_active: number; // 0 | 1
  created_at: string;
}

/** Dados para criar um exercício personalizado. */
export interface ExerciseInput {
  name: string;
  muscle_group: string;
  secondary_muscles?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  instructions?: string | null;
  common_mistakes?: string | null;
  video_url?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// workouts
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkoutRow {
  id: number;
  name: string;
  division: string | null;
  notes: string | null;
  is_active: number; // 0 | 1
  cycle_order: number | null; // posição no ciclo; NULL = não participa
  created_at: string;
  updated_at: string;
}

export interface WorkoutInput {
  name: string;
  division?: string | null;
  notes?: string | null;
  cycle_order?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// workout_exercises
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkoutExerciseRow {
  id: number;
  workout_id: number;
  exercise_id: number;
  sort_order: number;
  target_sets: number;
  target_reps: string;
  target_rest_seconds: number | null;
  notes: string | null;
}

export interface WorkoutExerciseInput {
  workout_id: number;
  exercise_id: number;
  sort_order: number;
  target_sets: number;
  target_reps: string;
  target_rest_seconds?: number | null;
  notes?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// sessions
// ─────────────────────────────────────────────────────────────────────────────
export interface SessionRow {
  id: number;
  workout_id: number | null;
  name: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// session_exercises
// ─────────────────────────────────────────────────────────────────────────────
export interface SessionExerciseRow {
  id: number;
  session_id: number;
  exercise_id: number;
  workout_exercise_id: number | null;
  exercise_name: string;
  sort_order: number;
  is_skipped: number; // 0 | 1
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// session_sets
// ─────────────────────────────────────────────────────────────────────────────
export interface SessionSetRow {
  id: number;
  session_exercise_id: number;
  set_number: number;
  weight: number; // REAL — sempre decimal
  reps: number;
  rir: number | null; // 0-3
  notes: string | null;
  created_at: string;
}

export interface SessionSetInput {
  session_exercise_id: number;
  set_number: number;
  weight: number;
  reps: number;
  rir?: number | null;
  notes?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// personal_records
// ─────────────────────────────────────────────────────────────────────────────
export interface PersonalRecordRow {
  id: number;
  exercise_id: number;
  pr_type: PrType;
  value: number;
  session_set_id: number;
  session_id: number;
  is_current: number; // 0 | 1
  achieved_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// user_profile (singleton — id sempre 1)
// ─────────────────────────────────────────────────────────────────────────────
export interface UserProfileRow {
  id: 1;
  name: string | null;
  birth_date: string | null;
  sex: 'M' | 'F' | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfileInput {
  name?: string | null;
  birth_date?: string | null;
  sex?: 'M' | 'F' | null;
  height_cm?: number | null;
  target_weight_kg?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// body_weight_entries
// ─────────────────────────────────────────────────────────────────────────────
export interface BodyWeightEntryRow {
  id: number;
  weight_kg: number;
  date: string; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
}

export interface BodyWeightEntryInput {
  weight_kg: number;
  date: string;
  notes?: string | null;
}
