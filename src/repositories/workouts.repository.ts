import type { AppDatabase } from '@/types/app-database';
import type { DbExecutor } from '@/types/db-executor';

import type { WorkoutInput, WorkoutRow } from '@/types/db';

/** Ficha com a contagem de exercícios, para listagens de resumo. */
export interface WorkoutWithCount extends WorkoutRow {
  exercise_count: number;
}

/**
 * Repositório de acesso à tabela `workouts` (fichas de treino).
 *
 * Fichas podem ser arquivadas (`is_active = 0`) em vez de deletadas — o
 * histórico de sessões que as referenciam permanece acessível.
 */
export const workoutsRepository = {
  /**
   * Lista as fichas ativas DO PACOTE ATIVO, ordenadas por cycle_order
   * (NULLs por último, alfabético).
   *
   * O recorte por pacote é o que faz arquivar um mesociclo sumir com as fichas
   * dele de toda a UI de uma vez, sem tocar no histórico de sessões.
   */
  async listActive(db: DbExecutor): Promise<WorkoutRow[]> {
    return db.getAllAsync<WorkoutRow>(
      `SELECT * FROM workouts
       WHERE is_active = 1
         AND pack_id = (SELECT id FROM workout_packs WHERE is_active = 1)
       ORDER BY
         CASE WHEN cycle_order IS NULL THEN 1 ELSE 0 END,
         cycle_order NULLS LAST,
         name COLLATE NOCASE;`,
    );
  },

  /**
   * Lista as fichas ativas de UM pacote, com quantos exercícios cada uma tem.
   *
   * Serve para espiar um pacote arquivado sem reativá-lo — por isso recebe o
   * `packId` em vez de assumir o ativo, ao contrário de `listActive`.
   */
  async listByPack(db: DbExecutor, packId: number): Promise<WorkoutWithCount[]> {
    return db.getAllAsync<WorkoutWithCount>(
      `SELECT
         w.*,
         (SELECT COUNT(*) FROM workout_exercises we
           WHERE we.workout_id = w.id) AS exercise_count
       FROM workouts w
       WHERE w.is_active = 1 AND w.pack_id = ?
       ORDER BY
         CASE WHEN w.cycle_order IS NULL THEN 1 ELSE 0 END,
         w.cycle_order,
         w.name COLLATE NOCASE;`,
      [packId],
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
  async create(db: DbExecutor, input: WorkoutInput): Promise<number> {
    // Ficha nova nasce no pacote ativo. Sem isto ela ficaria órfã e não
    // apareceria em lugar nenhum.
    const result = await db.runAsync(
      `INSERT INTO workouts (name, division, notes, cycle_order, pack_id)
       VALUES (?, ?, ?, ?, (SELECT id FROM workout_packs WHERE is_active = 1));`,
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
  async listCycleWorkouts(db: DbExecutor): Promise<WorkoutRow[]> {
    return db.getAllAsync<WorkoutRow>(
      `SELECT * FROM workouts
       WHERE is_active = 1 AND cycle_order IS NOT NULL
         AND pack_id = (SELECT id FROM workout_packs WHERE is_active = 1)
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
