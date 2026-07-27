import type { AppDatabase } from '@/types/app-database';

import { sessionsRepository } from '@/repositories/sessions.repository';
import { workoutsRepository } from '@/repositories/workouts.repository';
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
  /**
   * - 'completed'   → houve sessão concluída neste dia
   * - 'no_session'  → dia passado sem treino registrado ("Sem treino")
   * - 'today'       → hoje (pode sugerir próximo do ciclo)
   * - 'upcoming'    → dia futuro (ainda não definido)
   */
  status: 'completed' | 'no_session' | 'today' | 'upcoming';
  /** Nome do treino feito (se completed) ou sugerido (se today). */
  workoutName: string | null;
  /** ID do workout para iniciar (se today) ou já feito (se completed). */
  workoutId: number | null;
  /** ID da sessão concluída (se completed) — para abrir o diário. */
  sessionId: number | null;
  /** ID do workout sugerido para hoje (próximo do ciclo). */
  suggestedWorkoutId: number | null;
}

const DAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * CalendarService — monta a semana visível do calendário.
 *
 * Toda a lógica mora aqui; a UI só renderiza o array retornado.
 */
export const calendarService = {
  /**
   * Monta os 7 dias (Seg-Dom) de uma semana, começando em `weekStart`.
   *
   * @param weekStart objeto Date representando a segunda-feira da semana.
   * @param db conexão do banco.
   */
  async buildWeek(db: AppDatabase, weekStart: Date): Promise<CalendarDay[]> {
    const days: CalendarDay[] = [];

    // Limites da semana em ISO (para a query).
    const fromISO = toISODate(weekStart) + ' 00:00:00';
    const weekEnd = addDays(weekStart, 7);
    const toISO = toISODate(weekEnd) + ' 00:00:00';

    // Sessões concluídas da semana visível.
    const sessions = await sessionsRepository.listByDateRange(db, fromISO, toISO);

    // Próximo treino sugerido (calculado uma vez; só aparece em "hoje").
    const lastCompleted = await sessionsRepository.getLastCompleted(db);
    const suggestedWorkoutId = await trainingCycleService.getNextWorkoutId(
      db,
      lastCompleted?.workout_id ?? null,
    );
    let suggestedName: string | null = null;
    if (suggestedWorkoutId !== null) {
      const w = await workoutsRepository.getById(db, suggestedWorkoutId);
      suggestedName = w?.name ?? null;
    }

    const todayISO = toISODate(new Date());

    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const dateISO = toISODate(date);
      const dayOfWeek = date.getDay();
      const isToday = dateISO === todayISO;

      // Sessão concluída neste dia?
      const session = sessions.find((s) => s.started_at.slice(0, 10) === dateISO);

      if (session) {
        // Sessão concluída sempre é 'completed', mesmo que seja hoje.
        // 'today' (sem sessão) é o caso de treino sugerido ainda não iniciado.
        days.push({
          date: dateISO,
          dayLabel: DAY_LABELS[dayOfWeek],
          dayNumber: String(date.getDate()),
          isToday,
          status: 'completed',
          workoutName: session.name,
          workoutId: session.workout_id,
          sessionId: session.id,
          suggestedWorkoutId: null,
        });
      } else if (isToday) {
        days.push({
          date: dateISO,
          dayLabel: DAY_LABELS[dayOfWeek],
          dayNumber: String(date.getDate()),
          isToday: true,
          status: 'today',
          workoutName: suggestedName,
          workoutId: suggestedWorkoutId,
          sessionId: null,
          suggestedWorkoutId,
        });
      } else {
        // Passado sem sessão → "Sem treino". Futuro → "upcoming".
        const isPast = dateISO < todayISO;
        days.push({
          date: dateISO,
          dayLabel: DAY_LABELS[dayOfWeek],
          dayNumber: String(date.getDate()),
          isToday: false,
          status: isPast ? 'no_session' : 'upcoming',
          workoutName: null,
          workoutId: null,
          sessionId: null,
          suggestedWorkoutId: null,
        });
      }
    }

    return days;
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
