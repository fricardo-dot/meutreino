import type { AppDatabase } from '@/types/app-database';

import type { DbExecutor } from '@/types/db-executor';
import type { SessionSetInput, SessionSetRow } from '@/types/db';

/**
 * Repositório de acesso a `session_sets`.
 *
 * Aceita `DbExecutor` (a conexão ou uma transação dela) em todos os métodos
 * para que o WorkoutEngine possa salvar série + PR atomicamente.
 */
export const sessionSetsRepository = {
  /**
   * Upsert: insere uma série nova OU atualiza uma existente
   * (mesmo session_exercise_id + set_number).
   *
   * O `updated_at` é sempre renovado em caso de atualização, via
   * CURRENT_TIMESTAMP (não no client, para consistência com o servidor de
   * tempo do SQLite).
   *
   * @returns id da linha inserida ou atualizada (necessário para FKs de PR).
   *          A consulta do id acontece em seguida, dentro da mesma transação,
   *          para cobrir tanto INSERT quanto UPDATE com segurança.
   */
  async upsert(
    executor: DbExecutor,
    input: SessionSetInput,
  ): Promise<number> {
    await executor.runAsync(
      `INSERT INTO session_sets
        (session_exercise_id, set_number, weight, reps, rir, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_exercise_id, set_number) DO UPDATE SET
         weight     = excluded.weight,
         reps       = excluded.reps,
         rir        = excluded.rir,
         notes      = excluded.notes,
         updated_at = CURRENT_TIMESTAMP;`,
      [
        input.session_exercise_id,
        input.set_number,
        input.weight,
        input.reps,
        input.rir ?? null,
        input.notes ?? null,
      ],
    );

    const row = await executor.getFirstAsync<{ id: number }>(
      `SELECT id FROM session_sets
       WHERE session_exercise_id = ? AND set_number = ?;`,
      [input.session_exercise_id, input.set_number],
    );
    return row?.id ?? 0;
  },

  /**
   * Lista as séries de um exercício da sessão, em ordem.
   */
  async listBySessionExercise(
    db: AppDatabase,
    sessionExerciseId: number,
  ): Promise<SessionSetRow[]> {
    return db.getAllAsync<SessionSetRow>(
      `SELECT * FROM session_sets
       WHERE session_exercise_id = ?
       ORDER BY set_number;`,
      [sessionExerciseId],
    );
  },

  /**
   * Busca a última série registrada de um exercício (em qualquer sessão
   * concluída ou em andamento), para autofill da próxima sessão.
   *
   * Ordena por created_at DESC — considera a ocorrência mais recente.
   * Retorna null se o exercício nunca foi treinado.
   *
   * Usado pelo AutofillService; o repositório só executa a consulta.
   */
  async getLastSetForExercise(
    db: AppDatabase,
    exerciseId: number,
  ): Promise<SessionSetRow | null> {
    const row = await db.getFirstAsync<SessionSetRow>(
      `SELECT ss.*
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.exercise_id = ?
       ORDER BY ss.created_at DESC
       LIMIT 1;`,
      [exerciseId],
    );
    return row ?? null;
  },

  /**
   * Séries de um exercício nos últimos treinos concluídos, do mais recente ao
   * mais antigo. O limite é por TREINO, para nunca cortar um deles ao meio.
   */
  async listHistoryByExercise(
    db: DbExecutor,
    exerciseId: number,
    maxTreinos: number,
  ): Promise<{
    session_id: number;
    session_name: string;
    started_at: string;
    weight: number;
    reps: number;
  }[]> {
    return db.getAllAsync(
      `SELECT s.id AS session_id, s.name AS session_name, s.started_at,
              ss.weight, ss.reps
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         JOIN sessions s ON s.id = se.session_id
        WHERE se.exercise_id = ?
          AND s.status = 'concluida'
          AND s.id IN (
            SELECT DISTINCT s2.id
              FROM sessions s2
              JOIN session_exercises se2 ON se2.session_id = s2.id
              JOIN session_sets ss2 ON ss2.session_exercise_id = se2.id
             WHERE se2.exercise_id = ? AND s2.status = 'concluida'
             ORDER BY s2.started_at DESC
             LIMIT ?
          )
        ORDER BY s.started_at DESC, ss.set_number;`,
      [exerciseId, exerciseId, maxTreinos],
    );
  },

  /**
   * Remove uma série (edição futura).
   */
  async remove(db: AppDatabase, setId: number): Promise<void> {
    await db.runAsync('DELETE FROM session_sets WHERE id = ?;', [setId]);
  },

  /**
   * Remove TODAS as séries de um exercício da sessão.
   * Usado pra "começar do zero" um exercício dentro da sessão.
   *
   * NÃO chame direto: os recordes que apontam para estas séries usam
   * ON DELETE RESTRICT e precisam sair antes. Use
   * `workoutEngine.resetSessionExerciseSets`, que faz os dois numa transação.
   */
  async removeAllFromSessionExercise(
    executor: DbExecutor,
    sessionExerciseId: number,
  ): Promise<void> {
    await executor.runAsync(
      'DELETE FROM session_sets WHERE session_exercise_id = ?;',
      [sessionExerciseId],
    );
  },
};
