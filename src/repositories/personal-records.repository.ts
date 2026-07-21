import type { AppDatabase } from '@/types/app-database';

import type { DbExecutor } from '@/types/db-executor';
import type { PersonalRecordRow, PrType } from '@/types/db';

/**
 * Novo PR detectado pelo WorkoutEngine, pronto para persistir.
 */
export interface NewPR {
  exerciseId: number;
  prType: PrType;
  value: number;
  sessionSetId: number;
  sessionId: number;
}

/**
 * Repositório de acesso a `personal_records`.
 *
 * Aceita `DbExecutor` para operar dentro da mesma transação que salvou a
 * série (no WorkoutEngine.saveSet), garantindo atomicidade série+PR.
 */
export const personalRecordsRepository = {
  /**
   * Retorna os recordes VIGENTES (is_current = 1) de um exercício.
   * No máximo 4: max_weight, max_reps, estimated_1rm, max_volume.
   */
  async getCurrentPRs(
    executor: DbExecutor,
    exerciseId: number,
  ): Promise<PersonalRecordRow[]> {
    return executor.getAllAsync<PersonalRecordRow>(
      `SELECT * FROM personal_records
       WHERE exercise_id = ? AND is_current = 1;`,
      [exerciseId],
    );
  },

  /**
   * Substitui os recordes vigentes por novos, ATÔMICAMENTE.
   *
   * Deve ser chamado DENTRO da transação do WorkoutEngine.saveSet:
   *   1. Desativa os vigentes dos tipos que serão substituídos.
   *   2. Insere os novos como vigentes.
   *
   * O histórico (is_current = 0) nunca é apagado.
   *
   * @param newRecords pode ser vazio (nenhum PR batido) — nesse caso só
   *                   desativa os vigentes dos tipos informados em `typesToReplace`.
   * @param typesToReplace tipos que devem ser desativados antes de inserir.
   */
  async replaceCurrentPRs(
    executor: DbExecutor,
    newRecords: NewPR[],
    typesToReplace: PrType[],
  ): Promise<void> {
    if (typesToReplace.length === 0 && newRecords.length === 0) return;

    // Agrupa por exerciseId para desativar os vigentes corretos.
    const exerciseIds = [...new Set(newRecords.map((r) => r.exerciseId))];

    for (const exerciseId of exerciseIds) {
      const types = typesToReplace.length > 0 ? typesToReplace : newRecords
        .filter((r) => r.exerciseId === exerciseId)
        .map((r) => r.prType);

      if (types.length === 0) continue;

      const placeholders = types.map(() => '?').join(', ');
      await executor.runAsync(
        `UPDATE personal_records SET is_current = 0
         WHERE exercise_id = ? AND is_current = 1
           AND pr_type IN (${placeholders});`,
        [exerciseId, ...types],
      );
    }

    for (const record of newRecords) {
      await executor.runAsync(
        `INSERT INTO personal_records
          (exercise_id, pr_type, value, session_set_id, session_id, is_current)
         VALUES (?, ?, ?, ?, ?, 1);`,
        [
          record.exerciseId,
          record.prType,
          record.value,
          record.sessionSetId,
          record.sessionId,
        ],
      );
    }
  },

  /**
   * Lista todo o histórico de recordes de um exercício (vigentes e antigos).
   * Para a tela de evolução de PRs.
   */
  async listHistoryByExercise(
    db: AppDatabase,
    exerciseId: number,
  ): Promise<PersonalRecordRow[]> {
    return db.getAllAsync<PersonalRecordRow>(
      `SELECT * FROM personal_records
       WHERE exercise_id = ?
       ORDER BY achieved_at DESC;`,
      [exerciseId],
    );
  },
};
