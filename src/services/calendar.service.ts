import type { AppDatabase } from '@/types/app-database';
import type { PackRunRow } from '@/types/db';

import { scheduledWorkoutsRepository, type ScheduledWorkoutWithPlan } from '@/repositories/scheduled-workouts.repository';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { packRunsRepository } from '@/repositories/pack-runs.repository';
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
  /**
   * A corrida que o pacote em uso prescreve para este dia da semana, se houver.
   *
   * Não depende de haver ficha: é justamente o que faz a quarta-feira do bloco
   * híbrido — dia sem musculação — deixar de ser um buraco no calendário.
   */
  run: PackRunRow | null;
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

    const weekStartISO = toISODate(weekStart);
    const weekEndDate = addDays(weekStart, 7);
    const weekEndISO = toISODate(weekEndDate);

    // Busca só as sessões que PODEM cair nesta semana local.
    //
    // O filtro fino continua sendo feito no JS logo abaixo, convertendo
    // UTC → local — é o que evita os bugs de timezone com treino noturno. O
    // SQL só corta o volume, com um dia de folga de cada lado para cobrir
    // qualquer fuso.
    //
    // Antes isto era `listRecent(db, 100)`: o comentário dizia "busca TODAS as
    // sessões", mas o limite de 100 fazia sumir do calendário qualquer treino
    // mais antigo que os 100 últimos.
    const margem = 86400000; // 1 dia
    const allSessions = await sessionsRepository.listConcluidasNoIntervalo(
      db,
      toUtcTimestamp(new Date(weekStart.getTime() - margem)),
      toUtcTimestamp(new Date(weekEndDate.getTime() + margem)),
    );

    // Filtra sessões que pertencem a esta semana (em horário local).
    const sessions = allSessions.filter((s) => {
      const localDate = utcToLocalISODate(s.started_at);
      return localDate >= weekStartISO && localDate < weekEndISO;
    });

    // Camada 2: Programação da semana (scheduled_workouts).
    const schedule = await scheduledWorkoutsRepository.listByWeek(db, weekStartISO);

    // Camada paralela: a corrida prescrita para cada dia DA SEMANA (não da
    // data). Não depende de haver ficha programada — é o que faz o dia de
    // corrida existir no calendário mesmo sem musculação nenhuma.
    const corridas = await packRunsRepository.mapaDoPacoteAtivo(db);

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
          run: corridas.get(i) ?? null,
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
            run: corridas.get(i) ?? null,
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
            run: corridas.get(i) ?? null,
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
          run: corridas.get(i) ?? null,
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
          run: corridas.get(i) ?? null,
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
    // Dias que o pacote reserva só para correr não recebem musculação.
    const reservados = await packRunsRepository.diasSomenteCorrida(db);
    await scheduledWorkoutsRepository.autoFillWeek(
      db,
      weekStartISO,
      distribuirNaSemana(sequence, reservados),
    );
  },

  /** Exposto para teste e para quem quiser só saber onde cada treino cairia. */
  distribuirNaSemana,

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

  /**
   * Em que semana do bloco estamos — 1 na semana em que o pacote entrou em uso.
   *
   * Conta por SEMANAS DE CALENDÁRIO, não por múltiplos de sete dias: o bloco
   * vira na segunda-feira junto com a semana de treino, e não na quinta só
   * porque foi numa quinta que o pacote foi ativado. É assim que se lê um
   * programa de 6 a 8 semanas.
   *
   * Recebe o `activated_at` do pacote, que é UTC — daí a conversão para data
   * local antes de qualquer conta (ativar às 22h no Brasil cai no dia seguinte
   * em UTC e adiantaria o bloco em uma semana).
   */
  getSemanaDoBloco(activatedAtUtc: string, hoje: Date = new Date()): number {
    const inicio = this.getWeekStart(
      new Date(`${utcToLocalISODate(activatedAtUtc)}T12:00:00`),
    );
    const atual = this.getWeekStart(hoje);
    const dias = Math.round((atual.getTime() - inicio.getTime()) / 86_400_000);
    return Math.floor(dias / 7) + 1;
  },
};

/** Um treino do ciclo e o dia da semana (0 = segunda) em que ele cai. */
export interface DiaProgramado {
  dayOfWeek: number;
  workoutId: number;
}

/**
 * Espalha os treinos do ciclo de segunda a sexta, com folga entre eles.
 *
 * Antes eles eram enfileirados em dias consecutivos a partir da segunda: um
 * ciclo de quatro fichas ocupava segunda a quinta e deixava a sexta vazia,
 * treinando quatro dias seguidos sem descanso no meio. Nenhum programa de
 * musculação é montado assim, e num bloco híbrido isso ainda atropela o dia
 * reservado para a corrida longa.
 *
 * A regra é ancorar o primeiro na segunda e o último na sexta, espaçando o
 * resto por igual. Dá exatamente as divisões usuais:
 *
 *   1 treino  → Seg
 *   2 treinos → Seg, Sex
 *   3 treinos → Seg, Qua, Sex
 *   4 treinos → Seg, Ter, Qui, Sex
 *   5 treinos → Seg a Sex
 *
 * Os dias que sobram no meio ficam SEM programação, e não marcados como
 * descanso: para o app são dias livres, e o que o usuário faz neles — correr,
 * descansar, outra coisa — ele é quem sabe. Dizer "descanso" num dia em que o
 * pacote manda correr 5 km seria inventar.
 *
 * Ciclo com mais de cinco fichas continua limitado a cinco por semana; as
 * demais entram nas semanas seguintes, porque a sequência continua de onde
 * parou.
 *
 * `diasReservados` tira dias do jogo antes de qualquer conta — são os dias em
 * que o pacote manda SÓ correr. No bloco híbrido isso deixa quatro dias úteis
 * para quatro fichas, e a quarta-feira fica com a corrida longa, que era o
 * caso que a montagem automática atropelava.
 */
function distribuirNaSemana(
  workoutIds: number[],
  diasReservados: number[] = [],
): DiaProgramado[] {
  const DIAS_UTEIS = 5;
  const disponiveis: number[] = [];
  for (let d = 0; d < DIAS_UTEIS; d++) {
    if (!diasReservados.includes(d)) disponiveis.push(d);
  }
  if (disponiveis.length === 0) return [];

  const ids = workoutIds.filter((id) => id != null).slice(0, disponiveis.length);
  if (ids.length === 0) return [];
  if (ids.length === 1) return [{ dayOfWeek: disponiveis[0], workoutId: ids[0] }];

  const ultimo = disponiveis.length - 1;
  return ids.map((workoutId, i) => ({
    dayOfWeek: disponiveis[Math.round((i * ultimo) / (ids.length - 1))],
    workoutId,
  }));
}

// ── Helpers de data (sem libs externas) ─────────────────────────────────

/** Soma dias a uma data (retorna nova Date). */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Converte um instante local para o timestamp UTC no formato do SQLite
 * ("YYYY-MM-DD HH:MM:SS"), que é como CURRENT_TIMESTAMP grava.
 */
function toUtcTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
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
export function utcToLocalISODate(utcTimestamp: string): string {
  // O SQLite retorna "2026-07-29 00:30:00" (sem timezone info).
  // Interpretamos como UTC adicionando "Z" ou usando Date diretamente.
  const normalized = utcTimestamp.replace(' ', 'T');
  const hasTZ = normalized.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(normalized);
  const date = hasTZ ? new Date(normalized) : new Date(normalized + 'Z');
  return toISODate(date);
}
