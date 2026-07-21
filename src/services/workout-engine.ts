import type { AppDatabase } from '@/types/app-database';

import { personalRecordsRepository, type NewPR } from '@/repositories/personal-records.repository';
import { sessionSetsRepository } from '@/repositories/session-sets.repository';
import type { PrType } from '@/types/db';
import { calculateEpley1RM, calculateSetVolume } from './one-rm';

/**
 * Resumo do resultado de salvar uma série — informa à UI se houve PR.
 */
export interface SaveSetResult {
  /** Calculado a partir de peso × reps. */
  volume: number;
  /** Estimativa Epley, ou null se não aplicável. */
  estimated1RM: number | null;
  /** Quais recordes foram batidos nesta série. */
  brokenPRs: PrType[];
  /** Horário (epoch ms) em que o descanso termina. null se sem descanso. */
  restEndsAt: number | null;
}

/**
 * Entrada para saveSet — o que a UI coleta ao registrar uma série.
 */
export interface SaveSetInput {
  sessionExerciseId: number;
  exerciseId: number;
  sessionId: number;
  setNumber: number;
  weight: number;
  reps: number;
  rir?: number | null;
  notes?: string | null;
  /** Descanso planejado em segundos. Se null/0, não inicia descanso. */
  restSeconds?: number | null;
}

/**
 * ⭐ WorkoutEngine — núcleo da lógica de treino.
 *
 * Centraliza regras de negócio para que os repositórios fiquem apenas com
 * persistência. Aqui moram:
 *  - salvar série (atômico com detecção de PR);
 *  - cálculo de volume e 1RM;
 *  - início do descanso (timestamp-based);
 *  - futuro: sugestão de progressão, periodização.
 *
 * A atomicidade série+PR é garantida por uma única transação: se algo falhar
 * entre salvar a série e registrar o PR, ambos sofrem ROLLBACK. Nunca fica
 * série sem PR correspondente.
 */
export const workoutEngine = {
  /**
   * Salva uma série e detecta recordes, ATÔMICAMENTE.
   *
   * Fluxo dentro de `withTransactionAsync`:
   *   1. upsert da série (via sessionSetsRepository.upsert);
   *   2. cálculo de volume e 1RM;
   *   3. leitura dos PRs vigentes do exercício;
   *   4. comparação — quais tipos foram superados?
   *   5. replaceCurrentPRs (desativa vigentes + insere novos);
   *   6. COMMIT.
   *
   * Em caso de exceção, a transação faz ROLLBACK — série e PRs consistentes.
   */
  async saveSet(db: AppDatabase, input: SaveSetInput): Promise<SaveSetResult> {
    const volume = calculateSetVolume(input.weight, input.reps);
    const estimated1RM = calculateEpley1RM(input.weight, input.reps);

    const restEndsAt =
      input.restSeconds && input.restSeconds > 0
        ? Date.now() + input.restSeconds * 1000
        : null;

    let brokenPRs: PrType[] = [];

    await db.withTransactionAsync(async () => {
      // 1. Salva a série dentro da transação e obtém o id real da linha.
      const sessionSetId = await sessionSetsRepository.upsert(db, {
        session_exercise_id: input.sessionExerciseId,
        set_number: input.setNumber,
        weight: input.weight,
        reps: input.reps,
        rir: input.rir ?? null,
        notes: input.notes ?? null,
      });

      // 2-3. Lê PRs vigentes para comparar.
      const currentPRs = await personalRecordsRepository.getCurrentPRs(
        db,
        input.exerciseId,
      );

      // 4. Detecta quais recordes foram batidos.
      const candidates = buildPRCandidates(input, volume, estimated1RM);
      const typesToReplace: PrType[] = [];
      const newRecords: NewPR[] = [];

      for (const candidate of candidates) {
        const previous = currentPRs.find(
          (p) => p.pr_type === candidate.prType,
        );
        // Bate PR se não há anterior, ou se o novo supera o anterior.
        const isPR = !previous || candidate.value > previous.value;
        if (isPR) {
          brokenPRs.push(candidate.prType);
          typesToReplace.push(candidate.prType);
          newRecords.push({
            exerciseId: input.exerciseId,
            prType: candidate.prType,
            value: candidate.value,
            sessionSetId,
            sessionId: input.sessionId,
          });
        }
      }

      // 5. Substitui os vigentes superados e insere os novos.
      await personalRecordsRepository.replaceCurrentPRs(
        db,
        newRecords,
        typesToReplace,
      );
    });

    return { volume, estimated1RM, brokenPRs, restEndsAt };
  },
};

/**
 * Constrói os candidatos a PR a partir de uma série.
 * Ignora valores 0 (não faz sentido PR de volume/1RM em série sem carga).
 */
function buildPRCandidates(
  input: SaveSetInput,
  volume: number,
  estimated1RM: number | null,
): Array<{ prType: PrType; value: number }> {
  const candidates: Array<{ prType: PrType; value: number }> = [
    { prType: 'max_weight', value: input.weight },
    { prType: 'max_reps', value: input.reps },
  ];
  if (volume > 0) {
    candidates.push({ prType: 'max_volume', value: volume });
  }
  if (estimated1RM !== null) {
    candidates.push({ prType: 'estimated_1rm', value: estimated1RM });
  }
  return candidates;
}
