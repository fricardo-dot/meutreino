import type { AppDatabase } from '@/types/app-database';

/** Linha da tabela scheduled_workouts. */
export interface ScheduledWorkoutRow {
  id: number;
  week_start_date: string;
  day_of_week: number;
  workout_id: number | null;
  is_rest_day: number; // 0 | 1
  created_at: string;
}

/** Item de programação com nome do workout (pra UI). */
export interface ScheduledWorkoutWithPlan extends ScheduledWorkoutRow {
  workout_name: string | null;
}

/**
 * Repositório de acesso a `scheduled_workouts` (programação semanal).
 *
 * Permite pré-programar qual treino o usuário fará em cada dia da semana.
 * day_of_week: 0=Segunda, 1=Terça, ..., 6=Domingo.
 *
 * UNIQUE(week_start_date, day_of_week) garante 1 entrada por dia — todas as
 * escritas usam UPSERT.
 */
export const scheduledWorkoutsRepository = {
  /**
   * Lista a programação de uma semana inteira, com nome do workout.
   * Retorna array vazio se a semana ainda não foi programada.
   */
  async listByWeek(
    db: AppDatabase,
    weekStartISO: string,
  ): Promise<ScheduledWorkoutWithPlan[]> {
    return db.getAllAsync<ScheduledWorkoutWithPlan>(
      `SELECT sw.*, w.name AS workout_name
       FROM scheduled_workouts sw
       LEFT JOIN workouts w ON w.id = sw.workout_id
       WHERE sw.week_start_date = ?
       ORDER BY sw.day_of_week;`,
      [weekStartISO],
    );
  },

  /**
   * Programa um treino para um dia da semana (UPSERT).
   * Se já existe entrada pra este dia, substitui.
   */
  async scheduleWorkout(
    db: AppDatabase,
    weekStartISO: string,
    dayOfWeek: number,
    workoutId: number,
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO scheduled_workouts (week_start_date, day_of_week, workout_id, is_rest_day)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(week_start_date, day_of_week) DO UPDATE SET
         workout_id = excluded.workout_id,
         is_rest_day = 0;`,
      [weekStartISO, dayOfWeek, workoutId],
    );
  },

  /**
   * Marca um dia como descanso (sem treino). UPSERT.
   * workout_id fica NULL.
   */
  async scheduleRestDay(
    db: AppDatabase,
    weekStartISO: string,
    dayOfWeek: number,
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO scheduled_workouts (week_start_date, day_of_week, workout_id, is_rest_day)
       VALUES (?, ?, NULL, 1)
       ON CONFLICT(week_start_date, day_of_week) DO UPDATE SET
         workout_id = NULL,
         is_rest_day = 1;`,
      [weekStartISO, dayOfWeek],
    );
  },

  /**
   * Limpa a programação de um dia específico (remove a entrada).
   */
  async clearDay(
    db: AppDatabase,
    weekStartISO: string,
    dayOfWeek: number,
  ): Promise<void> {
    await db.runAsync(
      'DELETE FROM scheduled_workouts WHERE week_start_date = ? AND day_of_week = ?;',
      [weekStartISO, dayOfWeek],
    );
  },

  /**
   * Limpa TODA a programação de uma semana.
   */
  async clearWeek(db: AppDatabase, weekStartISO: string): Promise<void> {
    await db.runAsync(
      'DELETE FROM scheduled_workouts WHERE week_start_date = ?;',
      [weekStartISO],
    );
  },

  /**
   * Verifica se a semana já tem alguma programação.
   * Retorna true se existe pelo menos 1 entrada.
   */
  async hasSchedule(db: AppDatabase, weekStartISO: string): Promise<boolean> {
    const row = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM scheduled_workouts WHERE week_start_date = ?;',
      [weekStartISO],
    );
    return (row?.c ?? 0) > 0;
  },

  /**
   * Distribui o ciclo automaticamente nos 5 dias úteis (Seg-Sex),
   * começando pelo workoutId informado. Sáb e Dom viram descanso.
   *
   * Limpa a semana antes de preencher (substitui qualquer programação anterior).
   *
   * @param startWorkoutIds array ordenado de workoutIds do ciclo, começando
   *                        pelo que deve ir na segunda. Ex: [3, 4, 5, 1, 2]
   *                        significa Seg=workout 3, Ter=workout 4, etc.
   */
  async autoFillWeek(
    db: AppDatabase,
    weekStartISO: string,
    startWorkoutIds: number[],
  ): Promise<void> {
    await this.clearWeek(db, weekStartISO);

    // Dias 0-4 (Seg-Sex): treinos do ciclo (até 5).
    for (let i = 0; i < Math.min(5, startWorkoutIds.length); i++) {
      if (startWorkoutIds[i] != null) {
        await this.scheduleWorkout(db, weekStartISO, i, startWorkoutIds[i]);
      }
    }

    // Dias 5-6 (Sáb-Dom): descanso.
    await this.scheduleRestDay(db, weekStartISO, 5);
    await this.scheduleRestDay(db, weekStartISO, 6);
  },
};
