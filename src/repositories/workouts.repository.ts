import type { AppDatabase } from '@/types/app-database';

import type { WorkoutInput, WorkoutRow } from '@/types/db';

/**
 * Repositório de acesso à tabela `workouts` (fichas de treino).
 *
 * Fichas podem ser arquivadas (`is_active = 0`) em vez de deletadas — o
 * histórico de sessões que as referenciam permanece acessível.
 */
export const workoutsRepository = {
  /**
   * Lista fichas ativas, ordenadas por nome.
   */
  async listActive(db: AppDatabase): Promise<WorkoutRow[]> {
    return db.getAllAsync<WorkoutRow>(
      `SELECT * FROM workouts
       WHERE is_active = 1
       ORDER BY name COLLATE NOCASE;`,
    );
  },

  /**
   * Busca uma ficha pelo id (ativa ou arquivada). Retorna null se não existir.
   */
  async getById(db: AppDatabase, id: number): Promise<WorkoutRow | null> {
    const row = await db.getFirstAsync<WorkoutRow>(
      'SELECT * FROM workouts WHERE id = ?;',
      [id],
    );
    return row ?? null;
  },

  /**
   * Cria uma ficha. Retorna o novo id.
   */
  async create(db: AppDatabase, input: WorkoutInput): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO workouts (name, division, notes, cycle_order)
       VALUES (?, ?, ?, ?);`,
      [
        input.name,
        input.division ?? null,
        input.notes ?? null,
        input.cycle_order ?? null,
      ],
    );
    return result.lastInsertRowId as number;
  },

  /**
   * Lista workouts que participam do ciclo (cycle_order NOT NULL), ordenados.
   */
  async listCycleWorkouts(db: AppDatabase): Promise<WorkoutRow[]> {
    return db.getAllAsync<WorkoutRow>(
      `SELECT * FROM workouts
       WHERE is_active = 1 AND cycle_order IS NOT NULL
       ORDER BY cycle_order;`,
    );
  },

  /**
   * Atualiza nome, divisão e notas de uma ficha.
   */
  async update(
    db: AppDatabase,
    id: number,
    input: Partial<WorkoutInput>,
  ): Promise<void> {
    await db.runAsync(
      `UPDATE workouts SET
        name       = COALESCE(?, name),
        division   = COALESCE(?, division),
        notes      = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?;`,
      [input.name ?? null, input.division ?? null, input.notes ?? null, id],
    );
  },

  /**
   * Arquiva uma ficha (soft delete).
   */
  async archive(db: AppDatabase, id: number): Promise<void> {
    await db.runAsync(
      'UPDATE workouts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
      [id],
    );
  },

  /**
   * Atualiza a posição (cycle_order) de uma ficha no ciclo.
   * NULL = remove do ciclo.
   */
  async updateCycleOrder(
    db: AppDatabase,
    id: number,
    cycleOrder: number | null,
  ): Promise<void> {
    await db.runAsync(
      'UPDATE workouts SET cycle_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
      [cycleOrder, id],
    );
  },
};
