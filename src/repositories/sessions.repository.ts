import type { AppDatabase } from '@/types/app-database';

import type { SessionRow } from '@/types/db';
import { DomainError } from '@/types/errors';

/**
 * Sessão com contagens agregadas, para a lista de histórico.
 */
export interface SessionSummary extends SessionRow {
  exercise_count: number;
  set_count: number;
}

/**
 * Repositório de acesso a `sessions` e `session_exercises`.
 *
 * ⭐ `startSession` é a operação mais crítica do app: cria a sessão e copia
 * o template de `workout_exercises` para `session_exercises` ATÔMICAMENTE.
 * Se a ficha estiver vazia, rejeita ANTES de qualquer INSERT.
 */
export const sessionsRepository = {
  /**
   * Inicia uma sessão a partir de uma ficha.
   *
   * Fluxo atômico:
   *   1. Verifica que não há sessão em_andamento (índice único protegerá).
   *   2. Carrega o template da ficha.
   *   3. Rejeita se a ficha estiver vazia (antes de qualquer INSERT).
   *   4. Cria a sessão.
   *   5. Copia cada workout_exercise para session_exercise (snapshot do nome).
   *
   * Tudo dentro de `withTransactionAsync` — se algo falhar, ROLLBACK.
   * Nunca fica uma sessão sem exercícios.
   *
   * @returns id da sessão criada.
   * @throws {DomainError} EMPTY_WORKOUT se a ficha não tem exercícios.
   */
  async startSession(
    db: AppDatabase,
    workoutId: number,
  ): Promise<number> {
    let createdSessionId = 0;

    await db.withTransactionAsync(async () => {
      // Template da ficha — precisa estar dentro da transação para consistência.
      const template = await db.getAllAsync<{
        id: number;
        exercise_id: number;
        sort_order: number;
        exercise_name: string;
      }>(
        `SELECT we.id, we.exercise_id, we.sort_order, e.name AS exercise_name
         FROM workout_exercises we
         JOIN exercises e ON e.id = we.exercise_id
         WHERE we.workout_id = ?
         ORDER BY we.sort_order;`,
        [workoutId],
      );

      if (template.length === 0) {
        throw new DomainError(
          'EMPTY_WORKOUT',
          'Adicione pelo menos um exercício antes de iniciar o treino.',
        );
      }

      // Nome da ficha para snapshot.
      const workout = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM workouts WHERE id = ?;',
        [workoutId],
      );

      // Cria a sessão.
      const sessionResult = await db.runAsync(
        `INSERT INTO sessions (workout_id, name, status)
         VALUES (?, ?, 'em_andamento');`,
        [workoutId, workout?.name ?? 'Treino avulso'],
      );
      createdSessionId = sessionResult.lastInsertRowId as number;

      // Copia o template para session_exercises (snapshot).
      for (const item of template) {
        await db.runAsync(
          `INSERT INTO session_exercises
            (session_id, exercise_id, workout_exercise_id, exercise_name, sort_order)
           VALUES (?, ?, ?, ?, ?);`,
          [createdSessionId, item.exercise_id, item.id, item.exercise_name, item.sort_order],
        );
      }
    });

    return createdSessionId;
  },

  /**
   * Busca a sessão em andamento (status = 'em_andamento'), ou null.
   * Usado pela tela de recuperação de sessão interrompida.
   */
  async getActiveSession(db: AppDatabase): Promise<SessionRow | null> {
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT * FROM sessions WHERE status = 'em_andamento' ORDER BY started_at DESC LIMIT 1;`,
    );
    return row ?? null;
  },

  /**
   * Marca a sessão como concluída, calculando a duração.
   */
  async completeSession(db: AppDatabase, sessionId: number): Promise<void> {
    await db.runAsync(
      `UPDATE sessions SET
        status           = 'concluida',
        ended_at         = CURRENT_TIMESTAMP,
        duration_seconds = MAX(
          0,
          CAST(strftime('%s', CURRENT_TIMESTAMP) - strftime('%s', started_at) AS INTEGER)
        )
       WHERE id = ? AND status = 'em_andamento';`,
      [sessionId],
    );
  },

  /**
   * Cancela (descarta) a sessão em andamento.
   *
   * NÃO deleta — apenas marca como 'cancelada' com ended_at e duração.
   * Preserva rastreabilidade para investigar abandono de treino.
   */
  async cancelSession(db: AppDatabase, sessionId: number): Promise<void> {
    await db.runAsync(
      `UPDATE sessions SET
        status           = 'cancelada',
        ended_at         = CURRENT_TIMESTAMP,
        duration_seconds = MAX(
          0,
          CAST(strftime('%s', CURRENT_TIMESTAMP) - strftime('%s', started_at) AS INTEGER)
        )
       WHERE id = ? AND status = 'em_andamento';`,
      [sessionId],
    );
  },

  /**
   * Lista sessões concluídas (histórico) com contagens agregadas.
   */
  async listRecent(
    db: AppDatabase,
    limit = 20,
  ): Promise<SessionSummary[]> {
    return db.getAllAsync<SessionSummary>(
      `SELECT
         s.*,
         COUNT(DISTINCT se.id) AS exercise_count,
         COUNT(ss.id)          AS set_count
       FROM sessions s
       LEFT JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE s.status = 'concluida'
       GROUP BY s.id
       ORDER BY s.started_at DESC
       LIMIT ?;`,
      [limit],
    );
  },

  /**
   * Registra uma sessão concluída retroativamente num dia passado.
   *
   * Caso de uso: o usuário treinou na vida real mas não registrou no app.
   * Marca o dia no calendário com o treino que fez, sem precisar registrar
   * cada série (a sessão fica vazia — só pra avançar o ciclo e registrar a data).
   *
   * Snapshot: copia o template de workout_exercises para session_exercises,
   * mas SEM séries registradas.
   *
   * @param workoutId ficha treinada.
   * @param dateISO   data no formato "YYYY-MM-DD" (será usada como started_at).
   * @returns id da sessão criada.
   * @throws {DomainError} EMPTY_WORKOUT se a ficha não tem exercícios.
   */
  async logPastSession(
    db: AppDatabase,
    workoutId: number,
    dateISO: string,
  ): Promise<number> {
    let createdSessionId = 0;
    const startedAt = dateISO + ' 12:00:00';

    await db.withTransactionAsync(async () => {
      const template = await db.getAllAsync<{
        id: number;
        exercise_id: number;
        sort_order: number;
        exercise_name: string;
      }>(
        `SELECT we.id, we.exercise_id, we.sort_order, e.name AS exercise_name
         FROM workout_exercises we
         JOIN exercises e ON e.id = we.exercise_id
         WHERE we.workout_id = ?
         ORDER BY we.sort_order;`,
        [workoutId],
      );

      if (template.length === 0) {
        throw new DomainError(
          'EMPTY_WORKOUT',
          'Esta ficha não tem exercícios.',
        );
      }

      const workout = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM workouts WHERE id = ?;',
        [workoutId],
      );

      const sessionResult = await db.runAsync(
        `INSERT INTO sessions (workout_id, name, status, started_at, ended_at, duration_seconds)
         VALUES (?, ?, 'concluida', ?, ?, 0);`,
        [workoutId, workout?.name ?? 'Treino avulso', startedAt, startedAt],
      );
      createdSessionId = sessionResult.lastInsertRowId as number;

      for (const item of template) {
        await db.runAsync(
          `INSERT INTO session_exercises
            (session_id, exercise_id, workout_exercise_id, exercise_name, sort_order)
           VALUES (?, ?, ?, ?, ?);`,
          [createdSessionId, item.exercise_id, item.id, item.exercise_name, item.sort_order],
        );
      }
    });

    return createdSessionId;
  },

  /**
   * Busca a sessão pelo id.
   */
  async getById(db: AppDatabase, id: number): Promise<SessionRow | null> {
    const row = await db.getFirstAsync<SessionRow>(
      'SELECT * FROM sessions WHERE id = ?;',
      [id],
    );
    return row ?? null;
  },

  /**
   * Última sessão concluída (mais recente). Usada pelo calendário pra
   * calcular o próximo treino do ciclo.
   */
  async getLastCompleted(db: AppDatabase): Promise<SessionRow | null> {
    const row = await db.getFirstAsync<SessionRow>(
      `SELECT * FROM sessions
       WHERE status = 'concluida'
       ORDER BY started_at DESC
       LIMIT 1;`,
    );
    return row ?? null;
  },

  /**
   * Sessões concluídas dentro de um intervalo de datas (ISO).
   * Usada pelo calendário pra preencher os dias da semana visível.
   */
  async listByDateRange(
    db: AppDatabase,
    fromISO: string,
    toISO: string,
  ): Promise<SessionSummary[]> {
    return db.getAllAsync<SessionSummary>(
      `SELECT
         s.*,
         COUNT(DISTINCT se.id) AS exercise_count,
         COUNT(ss.id)          AS set_count
       FROM sessions s
       LEFT JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE s.status = 'concluida'
         AND s.started_at >= ?
         AND s.started_at < ?
       GROUP BY s.id
       ORDER BY s.started_at;`,
      [fromISO, toISO],
    );
  },
};
