import type { AppDatabase } from '@/types/app-database';

import { scheduledWorkoutsRepository, type ScheduledWorkoutWithPlan } from '@/repositories/scheduled-workouts.repository';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { trainingCycleService } from './training-cycle.service';

/**
 * Um dia do calendário — estrutura limpa para a UI renderizar.
 * A tela não deve conter lógica; apenas consome este array.
 */
export interface CalendarDay {
  /** ISO date "2026-07-17" (sem hora). */
  date: string;
  /** Label curto do dia da semana: "SEG", "TER", "QUI"... */
  dayLabel: string;
  /** Número do dia: "17". */
  dayNumber: string;
  /** True se este dia é hoje. */
  isToday: boolean;
  /** True se é um dia passado (não editável). */
  isPast: boolean;
  /**
   * - 'completed' → houve sessão concluída neste dia
   * - 'scheduled' → treino programado (futuro ou hoje não-iniciado)
   * - 'rest'      → dia de descanso programado
   * - 'empty'     → sem programação (livre pra escolher)
   * - 'no_session'→ dia passado sem treino registrado
   */
  status: 'completed' | 'scheduled' | 'rest' | 'empty' | 'no_session';
  /** Nome do treino (feito, programado ou null). */
  workoutName: string | null;
  /** ID do workout. */
  workoutId: number | null;
  /** ID da sessão concluída (se completed) — para abrir o diário. */
  sessionId: number | null;
  /** Índice do dia na semana (0=Seg, 1=Ter...). */
  dayOfWeek: number;
}

/** Informações sobre o estado da semana (para UI mostrar banner etc). */
export interface WeekStatus {
  /** A semana tem programação (scheduled_workouts)? */
  hasSchedule: boolean;
  /** ISO date da segunda-feira da semana. */
  weekStartISO: string;
}

const DAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * CalendarService — monta a semana visível do calendário.
 *
 * 3 camadas de prioridade (em ordem):
 *  1. Sessão concluída → 'completed'
 *  2. Programação da semana → 'scheduled' ou 'rest'
 *  3. Sem nada → 'empty' (futuro) ou 'no_session' (passado)
 */
export const calendarService = {
  /**
   * Monta os 7 dias (Seg-Dom) de uma semana, começando em `weekStart`.
   */
  async buildWeek(db: AppDatabase, weekStart: Date): Promise<CalendarDay[]> {
    const days: CalendarDay[] = [];

    // Limites da semana em ISO (para a query).
    const fromISO = toISODate(weekStart) + ' 00:00:00';
    const weekEnd = addDays(weekStart, 7);
    const toISO = toISODate(weekEnd) + ' 00:00:00';
    const weekStartISO = toISODate(weekStart);

    // Camada 1: Sessões concluídas da semana.
    const sessions = await sessionsRepository.listByDateRange(db, fromISO, toISO);

    // Camada 2: Programação da semana (scheduled_workouts).
    const schedule = await scheduledWorkoutsRepository.listByWeek(db, weekStartISO);

    const todayISO = toISODate(new Date());

    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const dateISO = toISODate(date);
      const isToday = dateISO === todayISO;
      const isPast = dateISO < todayISO;

      // Camada 1: sessão concluída?
      // Importante: started_at vem em UTC do SQLite. Precisa converter pra
      // data local antes de comparar, senão treinos noturnos (após 21h no
      // Brasil, UTC-3) aparecem no dia seguinte.
      const session = sessions.find(
        (s) => utcToLocalISODate(s.started_at) === dateISO,
      );

      if (session) {
        days.push({
          date: dateISO,
          dayLabel: DAY_LABELS[i],
          dayNumber: String(date.getDate()),
          isToday,
          isPast,
          status: 'completed',
          workoutName: session.name,
          workoutId: session.workout_id,
          sessionId: session.id,
          dayOfWeek: i,
        });
        continue;
      }

      // Camada 2: programação (sempre, mesmo em dias passados que não treinei).
      const scheduled = schedule.find((s) => s.day_of_week === i);

      if (scheduled) {
        if (scheduled.is_rest_day === 1) {
          days.push({
            date: dateISO,
            dayLabel: DAY_LABELS[i],
            dayNumber: String(date.getDate()),
            isToday,
            isPast,
            status: 'rest',
            workoutName: null,
            workoutId: null,
            sessionId: null,
            dayOfWeek: i,
          });
        } else {
          days.push({
            date: dateISO,
            dayLabel: DAY_LABELS[i],
            dayNumber: String(date.getDate()),
            isToday,
            isPast,
            status: 'scheduled',
            workoutName: scheduled.workout_name,
            workoutId: scheduled.workout_id,
            sessionId: null,
            dayOfWeek: i,
          });
        }
        continue;
      }

      // Camada 3: sem sessão e sem programação.
      if (isPast) {
        days.push({
          date: dateISO,
          dayLabel: DAY_LABELS[i],
          dayNumber: String(date.getDate()),
          isToday,
          isPast,
          status: 'no_session',
          workoutName: null,
          workoutId: null,
          sessionId: null,
          dayOfWeek: i,
        });
      } else {
        days.push({
          date: dateISO,
          dayLabel: DAY_LABELS[i],
          dayNumber: String(date.getDate()),
          isToday,
          isPast,
          status: 'empty',
          workoutName: null,
          workoutId: null,
          sessionId: null,
          dayOfWeek: i,
        });
      }
    }

    return days;
  },

  /**
   * Verifica o estado da semana (tem programação?).
   */
  async getWeekStatus(db: AppDatabase, weekStart: Date): Promise<WeekStatus> {
    const weekStartISO = toISODate(weekStart);
    const hasSchedule = await scheduledWorkoutsRepository.hasSchedule(db, weekStartISO);
    return { hasSchedule, weekStartISO };
  },

  /**
   * Auto-preenche a semana distribuíndo o ciclo a partir de um workout.
   *
   * @param startWorkoutId null = reiniciar (do primeiro), number = continuar
   */
  async autoFillWeek(
    db: AppDatabase,
    weekStart: Date,
    startWorkoutId: number | null,
  ): Promise<void> {
    const weekStartISO = toISODate(weekStart);
    const sequence = await trainingCycleService.getCycleSequence(db, startWorkoutId);
    await scheduledWorkoutsRepository.autoFillWeek(db, weekStartISO, sequence);
  },

  /**
   * Retorna a segunda-feira da semana de uma data (ou de hoje).
   */
  getWeekStart(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Dom, 1=Seg...
    const diff = day === 0 ? -6 : 1 - day; // volta pra segunda
    d.setDate(d.getDate() + diff);
    return d;
  },

  /**
   * Label do cabeçalho: "Julho 2026".
   */
  getMonthLabel(weekStart: Date): string {
    const d = weekStart;
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  },
};

// ── Helpers de data (sem libs externas) ─────────────────────────────────

/** Soma dias a uma data (retorna nova Date). */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Converte Date → "YYYY-MM-DD" (local, sem timezone). */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converte um timestamp UTC do SQLite ("2026-07-29 00:30:00") pra data
 * local no formato "YYYY-MM-DD".
 *
 * O SQLite guarda CURRENT_TIMESTAMP em UTC. Se comparar direto com a data
 * local, treinos noturnos (após 21h no Brasil, UTC-3) aparecem no dia
 * seguinte. Esta função converte corretamente.
 */
function utcToLocalISODate(utcTimestamp: string): string {
  // O SQLite retorna "2026-07-29 00:30:00" (sem timezone info).
  // Interpretamos como UTC adicionando "Z" ou usando Date diretamente.
  const normalized = utcTimestamp.replace(' ', 'T');
  const hasTZ = normalized.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(normalized);
  const date = hasTZ ? new Date(normalized) : new Date(normalized + 'Z');
  return toISODate(date);
}
