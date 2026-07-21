import type { AppDatabase } from '@/types/app-database';

import { sessionSetsRepository } from '@/repositories/session-sets.repository';

/**
 * Sugestão de autofill — valores para pré-preencher a próxima série.
 *
 * A UI usa isto para acelerar o registro: o usuário só ajusta se quiser.
 */
export interface AutofillSuggestion {
  weight: number;
  reps: number;
  rir: number | null;
  /** Indica se houve uma série anterior para basear a sugestão. */
  hasHistory: boolean;
}

/**
 * AutofillService — sugere os valores da próxima série de um exercício.
 *
 * Hoje a estratégia é simples: repetir a última série registrada.
 *
 * No futuro pode evoluir para considerar:
 *  - média das últimas 3 sessões;
 *  - melhor execução;
 *  - sugestão de progressão de carga (baseada em RIR e volume);
 *  - deload automático.
 *
 * A consulta continua usando o repositório — o serviço só decide a estratégia.
 */
export const autofillService = {
  /**
   * Sugere peso/reps/RIR para a próxima série de um exercício.
   *
   * @param nextSetNumber número da série que será registrada. Se for > 1,
   *                      considera a série imediatamente anterior da SESSÃO
   *                      atual (andamento). Se for 1, usa o histórico.
   */
  async suggestNextSet(
    db: AppDatabase,
    exerciseId: number,
    nextSetNumber: number,
    sessionExerciseId: number,
  ): Promise<AutofillSuggestion> {
    // Para séries 2+, repete a série anterior da mesma sessão.
    if (nextSetNumber > 1) {
      const prev = await db.getFirstAsync<{
        weight: number;
        reps: number;
        rir: number | null;
      }>(
        `SELECT weight, reps, rir FROM session_sets
         WHERE session_exercise_id = ? AND set_number = ?
         LIMIT 1;`,
        [sessionExerciseId, nextSetNumber - 1],
      );
      if (prev) {
        return {
          weight: prev.weight,
          reps: prev.reps,
          rir: prev.rir,
          hasHistory: true,
        };
      }
    }

    // Caso contrário, usa a última série histórica do exercício.
    const last = await sessionSetsRepository.getLastSetForExercise(db, exerciseId);
    if (last) {
      return {
        weight: last.weight,
        reps: last.reps,
        rir: last.rir,
        hasHistory: true,
      };
    }

    // Sem histórico — valores neutros.
    return { weight: 0, reps: 0, rir: null, hasHistory: false };
  },
};
