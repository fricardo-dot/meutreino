import type { AppDatabase } from '@/types/app-database';
import type { DbExecutor } from '@/types/db-executor';

import type { WorkoutRow } from '@/types/db';

/**
 * TrainingCycleService — cálculo do próximo treino do ciclo.
 *
 * O ciclo é definido pela coluna `workouts.cycle_order` (INTEGER). Workouts
 * com `cycle_order IS NULL` não participam do ciclo.
 *
 * A lógica:
 *   último concluído (cycle_order = N)
 *     → próximo = workout com cycle_order = N+1
 *     → se não existir (chegou no fim), volta pro cycle_order = 1
 *
 * Isto é imune a renomeações — depende só de cycle_order.
 */
export const trainingCycleService = {
  /**
   * Retorna o id do próximo treino do ciclo, dado o workout_id do último
   * concluído.
   *
   * Se `lastCompletedWorkoutId` for null (nenhum treino feito ainda),
   * retorna o primeiro do ciclo (menor cycle_order).
   *
   * Retorna null se não há nenhum workout no ciclo.
   */
  async getNextWorkoutId(
    db: AppDatabase,
    lastCompletedWorkoutId: number | null,
  ): Promise<number | null> {
    // Se não há histórico, começa do primeiro.
    if (lastCompletedWorkoutId === null) {
      return this.getFirstWorkoutId(db);
    }

    // Busca o cycle_order do último concluído.
    const last = await db.getFirstAsync<{ cycle_order: number | null }>(
      'SELECT cycle_order FROM workouts WHERE id = ?;',
      [lastCompletedWorkoutId],
    );

    // Se o último workout não tem cycle_order (ou não existe), começa do 1.
    if (!last || last.cycle_order === null) {
      return this.getFirstWorkoutId(db);
    }

    // Próximo = menor posição MAIOR que a atual, não necessariamente +1.
    //
    // A sequência tem buracos com facilidade: "Remover do ciclo" zera o
    // cycle_order de uma ficha sem reindexar as outras, e arquivar uma ficha
    // deixa o cycle_order intacto mas com is_active = 0. Procurar exatamente
    // `atual + 1` caía no buraco, não achava nada e voltava pro início — o
    // ciclo travava e nunca chegava nas fichas seguintes.
    const next = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM workouts
       WHERE is_active = 1 AND cycle_order > ?
       ORDER BY cycle_order, id LIMIT 1;`,
      [last.cycle_order],
    );
    if (next) return next.id;

    // Passou do fim: volta pro início do ciclo.
    return this.getFirstWorkoutId(db);
  },

  /**
   * Retorna o id do primeiro workout do ciclo (menor cycle_order ativo).
   * Null se nenhum workout participa do ciclo.
   */
  async getFirstWorkoutId(db: AppDatabase): Promise<number | null> {
    const first = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM workouts
       WHERE is_active = 1 AND cycle_order IS NOT NULL
       ORDER BY cycle_order LIMIT 1;`,
    );
    return first?.id ?? null;
  },

  /**
   * Lista todos os workouts do ciclo em ordem (para exibição/edição).
   */
  async listCycleWorkouts(db: DbExecutor): Promise<WorkoutRow[]> {
    return db.getAllAsync<WorkoutRow>(
      `SELECT * FROM workouts
       WHERE is_active = 1 AND cycle_order IS NOT NULL
       ORDER BY cycle_order;`,
    );
  },

  /**
   * Retorna a sequência de workout IDs do ciclo começando a partir de uma
   * posição específica (rodando). Usado pelo auto-fill da programação semanal.
   *
   * Ex: ciclo [A, B, C, D, E], começar do C → [C, D, E, A, B].
   *
   * @param startWorkoutId ID do workout que deve ser o primeiro da sequência.
   *                       Se null, começa do primeiro do ciclo.
   * @returns array de workout IDs na ordem rodada (até 5).
   */
  async getCycleSequence(
    db: DbExecutor,
    startWorkoutId: number | null,
  ): Promise<number[]> {
    const all = await this.listCycleWorkouts(db);
    if (all.length === 0) return [];

    let startIndex = 0;
    if (startWorkoutId !== null) {
      const found = all.findIndex((w) => w.id === startWorkoutId);
      if (found >= 0) startIndex = found;
    }

    // Roda o array começando de startIndex.
    const result: number[] = [];
    for (let i = 0; i < all.length; i++) {
      result.push(all[(startIndex + i) % all.length].id);
    }
    return result;
  },
};
