import type { AppDatabase } from '@/types/app-database';

import type { WorkoutExerciseInput, WorkoutExerciseRow } from '@/types/db';

/**
 * Versão estendida de WorkoutExerciseRow com dados do exercise (nome, grupo).
 * Usada para renderizar a ficha sem uma segunda consulta por exercício.
 */
export interface WorkoutExerciseWithExercise extends WorkoutExerciseRow {
  exercise_name: string;
  muscle_group: string;
  equipment: string | null;
}

/**
 * Repositório de acesso à tabela `workout_exercises` (template planejado).
 *
 * O template é imutável durante uma sessão — mudanças feitas durante o treino
 * afetam apenas `session_exercises`. Aqui operamos a versão "planejada".
 */
export const workoutExercisesRepository = {
  /**
   * Lista os exercícios de uma ficha em ordem, com dados do exercise.
   */
  async listByWorkout(
    db: AppDatabase,
    workoutId: number,
  ): Promise<WorkoutExerciseWithExercise[]> {
    return db.getAllAsync<WorkoutExerciseWithExercise>(
      `SELECT
         we.*,
         e.name         AS exercise_name,
         e.muscle_group AS muscle_group,
         e.equipment    AS equipment
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       WHERE we.workout_id = ?
       ORDER BY we.sort_order;`,
      [workoutId],
    );
  },

  /**
   * Adiciona um exercício ao final da ficha (sort_order = próximo disponível).
   * Retorna o novo id.
   */
  async add(
    db: AppDatabase,
    input: Omit<WorkoutExerciseInput, 'sort_order'> & { sort_order?: number },
  ): Promise<number> {
    // Se sort_order não veio, calcula o próximo.
    let sortOrder = input.sort_order;
    if (sortOrder === undefined) {
      const row = await db.getFirstAsync<{ max_sort: number | null }>(
        'SELECT MAX(sort_order) AS max_sort FROM workout_exercises WHERE workout_id = ?;',
        [input.workout_id],
      );
      sortOrder = (row?.max_sort ?? -1) + 1;
    }

    const result = await db.runAsync(
      `INSERT INTO workout_exercises
        (workout_id, exercise_id, sort_order, target_sets, target_reps, target_rest_seconds, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        input.workout_id,
        input.exercise_id,
        sortOrder,
        input.target_sets,
        input.target_reps,
        input.target_rest_seconds ?? null,
        input.notes ?? null,
      ],
    );
    return result.lastInsertRowId as number;
  },

  /**
   * Remove um exercício da ficha.
   */
  async remove(db: AppDatabase, workoutExerciseId: number): Promise<void> {
    await db.runAsync(
      'DELETE FROM workout_exercises WHERE id = ?;',
      [workoutExerciseId],
    );
  },

  /**
   * Atualiza séries/reps/descanso/notas de um exercício da ficha.
   */
  async updatePlan(
    db: AppDatabase,
    id: number,
    input: Partial<Pick<WorkoutExerciseInput, 'target_sets' | 'target_reps' | 'target_rest_seconds' | 'notes'>>,
  ): Promise<void> {
    await db.runAsync(
      `UPDATE workout_exercises SET
        target_sets         = COALESCE(?, target_sets),
        target_reps         = COALESCE(?, target_reps),
        target_rest_seconds = COALESCE(?, target_rest_seconds),
        notes               = COALESCE(?, notes)
       WHERE id = ?;`,
      [
        input.target_sets ?? null,
        input.target_reps ?? null,
        input.target_rest_seconds ?? null,
        input.notes ?? null,
        id,
      ],
    );
  },
};
