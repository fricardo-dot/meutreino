import type { DbExecutor } from '@/types/db-executor';

import { sessionSetsRepository } from '@/repositories/session-sets.repository';
import { utcToLocalISODate } from './calendar.service';

/** Um treino em que o exercício foi feito, com as cargas usadas. */
export interface CargasDoTreino {
  sessionId: number;
  /** Data local, `YYYY-MM-DD`. */
  data: string;
  /** Nome da ficha naquele dia. */
  treino: string;
  series: { weight: number; reps: number }[];
}

/**
 * Histórico de cargas de um exercício, do treino mais recente ao mais antigo.
 *
 * Consulta pelo id do exercício, e não por pacote: é o que permite achar as
 * cargas de um bloco arquivado, e é por isso que trocar de pacote não apaga
 * nem esconde nada aqui.
 */
export async function listarCargasDoExercicio(
  db: DbExecutor,
  exerciseId: number,
  maxTreinos = 12,
): Promise<CargasDoTreino[]> {
  const linhas = await sessionSetsRepository.listHistoryByExercise(
    db,
    exerciseId,
    maxTreinos,
  );

  const treinos: CargasDoTreino[] = [];
  for (const linha of linhas) {
    let atual = treinos[treinos.length - 1];
    if (!atual || atual.sessionId !== linha.session_id) {
      atual = {
        sessionId: linha.session_id,
        // `started_at` é UTC; a data mostrada tem que ser a local.
        data: utcToLocalISODate(linha.started_at),
        treino: linha.session_name,
        series: [],
      };
      treinos.push(atual);
    }
    atual.series.push({ weight: linha.weight, reps: linha.reps });
  }
  return treinos;
}
