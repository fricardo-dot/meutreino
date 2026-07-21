import type { AppDatabase } from '@/types/app-database';

/**
 * Estatísticas gerais do usuário — agregados de todas as sessões concluídas.
 */
export interface GeneralStats {
  /** Total de sessões concluídas. */
  totalSessions: number;
  /** Total de séries registradas. */
  totalSets: number;
  /** Volume total levantado em kg (soma de peso × reps de todas as séries). */
  totalVolumeKg: number;
  /** Tempo total treinado em segundos (soma de duration_seconds). */
  totalDurationSeconds: number;
  /** Frequência: treinos nos últimos 7 dias. */
  sessionsLast7Days: number;
}

/**
 * Volume total por grupo muscular (todas as sessões).
 */
export interface MuscleGroupVolume {
  muscle_group: string;
  total_sets: number;
  total_volume: number;
}

/**
 * StatsService — agregados para a tela Perfil.
 */
export const statsService = {
  /**
   * Calcula estatísticas gerais a partir das sessões concluídas e séries.
   */
  async getGeneralStats(db: AppDatabase): Promise<GeneralStats> {
    const row = await db.getFirstAsync<{
      total_sessions: number;
      total_sets: number;
      total_volume: number;
      total_duration: number | null;
      sessions_7d: number;
    }>(
      `SELECT
         COUNT(DISTINCT s.id)                              AS total_sessions,
         COUNT(ss.id)                                       AS total_sets,
         COALESCE(SUM(ss.weight * ss.reps), 0)              AS total_volume,
         COALESCE(SUM(s.duration_seconds), 0)               AS total_duration,
         COALESCE(SUM(CASE WHEN s.started_at >= datetime('now', '-7 days')
                           THEN 1 ELSE 0 END), 0)           AS sessions_7d
       FROM sessions s
       LEFT JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE s.status = 'concluida';`,
    );

    return {
      totalSessions: row?.total_sessions ?? 0,
      totalSets: row?.total_sets ?? 0,
      totalVolumeKg: row?.total_volume ?? 0,
      totalDurationSeconds: row?.total_duration ?? 0,
      sessionsLast7Days: row?.sessions_7d ?? 0,
    };
  },

  /**
   * Volume total por grupo muscular.
   * JOIN com exercises para saber o grupo de cada série.
   */
  async getVolumeByMuscleGroup(db: AppDatabase): Promise<MuscleGroupVolume[]> {
    return db.getAllAsync<MuscleGroupVolume>(
      `SELECT
         e.muscle_group,
         COUNT(ss.id)              AS total_sets,
         COALESCE(SUM(ss.weight * ss.reps), 0) AS total_volume
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN exercises e ON e.id = se.exercise_id
       JOIN sessions s ON s.id = se.session_id
       WHERE s.status = 'concluida'
       GROUP BY e.muscle_group
       ORDER BY total_volume DESC;`,
    );
  },
};
