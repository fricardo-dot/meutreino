import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useActiveSession } from '@/hooks/useActiveSession';
import { useDatabase } from '@/hooks/useDatabase';
import { scheduledWorkoutsRepository } from '@/repositories/scheduled-workouts.repository';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { workoutsRepository } from '@/repositories/workouts.repository';
import {
  calendarService,
  type CalendarDay,
  type WeekStatus,
} from '@/services/calendar.service';
import { trainingCycleService } from '@/services/training-cycle.service';
import { colors, radius, spacing, typography } from '@/theme';
import type { WorkoutRow } from '@/types/db';

/**
 * Tela Calendário — painel principal do app.
 *
 * Mostra a semana com a programação de treinos:
 *  - Dias passados: "✔ Concluído <nome>" (com lixeira), "não treinado" ou "Sem treino"
 *  - Hoje: destacado + botão ▶ Iniciar (se houver treino programado)
 *  - Futuros: programação do ciclo (escolher treino / descanso / limpar)
 *
 * Banner de sessão em andamento no topo (Continuar/Descartar).
 * Navegação ← → entre semanas + botão "Hoje".
 *
 * Se a semana atual não tem programação, mostra banner "Nova semana" com
 * opção de distribuir o ciclo automaticamente ou montar manualmente.
 */
export default function CalendarioScreen() {
  const { db, status } = useDatabase();
  const { activeSession, reload: reloadActive } = useActiveSession();
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => calendarService.getWeekStart());
  const [weekStatus, setWeekStatus] = useState<WeekStatus | null>(null);
  const [monthLabel, setMonthLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Picker de dia (programação manual de um dia específico).
  const [schedulePicker, setSchedulePicker] =
    useState<{ dateISO: string; dayOfWeek: number } | null>(null);
  // Picker de dia passado (marcar treino feito retroativamente).
  const [pastPicker, setPastPicker] = useState<string | null>(null);
  // Modal "Nova semana" (continuar/reiniciar ciclo + distribuir).
  const [showWeekStartModal, setShowWeekStartModal] = useState(false);

  const [cycleWorkouts, setCycleWorkouts] = useState<WorkoutRow[]>([]);
  // Próximo treino (continuar) e primeiro treino (reiniciar) — pro modal.
  const [continueWorkoutId, setContinueWorkoutId] = useState<number | null>(null);
  const [continueWorkoutName, setContinueWorkoutName] = useState<string | null>(null);
  const [restartWorkoutName, setRestartWorkoutName] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [deletingSession, setDeletingSession] =
    useState<{ sessionId: number; dateISO: string } | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);

  // Guarda contra reabrir o modal "Nova semana" pra mesma semana.
  const offeredWeekRef = useRef<string | null>(null);

  const isCurrentWeek = (start: Date) =>
    toLocalISODate(start) === toLocalISODate(calendarService.getWeekStart());

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    const built = await calendarService.buildWeek(db, weekStart);
    const ws = await calendarService.getWeekStatus(db, weekStart);
    setDays(built);
    setWeekStatus(ws);
    setMonthLabel(calendarService.getMonthLabel(weekStart));
    setLoading(false);

    // Calcula continue/restart (nomes pro modal) — só interessa pra semana atual.
    if (isCurrentWeek(weekStart)) {
      const lastCompleted = await sessionsRepository.getLastCompleted(db);
      const nextId = await trainingCycleService.getNextWorkoutId(
        db,
        lastCompleted?.workout_id ?? null,
      );
      setContinueWorkoutId(nextId);
      if (nextId != null) {
        const w = await workoutsRepository.getById(db, nextId);
        setContinueWorkoutName(w?.name ?? null);
      } else {
        setContinueWorkoutName(null);
      }
      const firstId = await trainingCycleService.getFirstWorkoutId(db);
      if (firstId != null) {
        const w = await workoutsRepository.getById(db, firstId);
        setRestartWorkoutName(w?.name ?? null);
      } else {
        setRestartWorkoutName(null);
      }

      // Auto-abre o modal "Nova semana" uma vez por semana sem programação.
      if (!ws.hasSchedule && offeredWeekRef.current !== ws.weekStartISO) {
        offeredWeekRef.current = ws.weekStartISO;
        setShowWeekStartModal(true);
      }
    }
  }, [db, status, weekStart]);

  // Carrega a lista de workouts do ciclo uma vez (pickers).
  useEffect(() => {
    if (status !== 'ready' || !db) return;
    void (async () => {
      const list = await workoutsRepository.listCycleWorkouts(db);
      setCycleWorkouts(list);
    })();
  }, [db, status]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function goPrevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
    setLoading(true);
  }

  function goNextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
    setLoading(true);
  }

  function goToday() {
    setWeekStart(calendarService.getWeekStart());
    setLoading(true);
  }

  async function handleStart(workoutId: number) {
    if (!db) return;
    setStarting(true);
    try {
      const sessionId = await sessionsRepository.startSession(db, workoutId);
      await reloadActive();
      router.push(`/registrar/${sessionId}`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  /** Marca um treino como feito num dia passado (não hoje). */
  async function handleMarkPast(dateISO: string, workoutId: number) {
    if (!db) return;
    try {
      await sessionsRepository.logPastSession(db, workoutId, dateISO);
      setPastPicker(null);
      await load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  /** Programa um treino pra um dia da semana atual. */
  async function handleScheduleWorkout(
    _dateISO: string,
    dayOfWeek: number,
    workoutId: number,
  ) {
    if (!db || !weekStatus) return;
    try {
      // Salva o treino escolhido neste dia.
      await scheduledWorkoutsRepository.scheduleWorkout(
        db,
        weekStatus.weekStartISO,
        dayOfWeek,
        workoutId,
      );
      // Reprograma os dias SEGUINTES (que ainda não são descanso) com a
      // sequência correta do ciclo a partir do treino escolhido.
      await rescheduleFollowingDays(dayOfWeek, workoutId);
      setSchedulePicker(null);
      await load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Reprograma os dias seguintes da semana (dayOfWeek+1 em diante) que não
   * sejam descanso, seguindo a sequência do ciclo a partir do workoutId.
   */
  async function rescheduleFollowingDays(fromDay: number, startWorkoutId: number) {
    if (!db || !weekStatus) return;
    const sequence = await trainingCycleService.getCycleSequence(db, startWorkoutId);
    // sequence[0] = o próprio dia, sequence[1] = próximo, etc.
    for (let d = fromDay + 1; d <= 4; d++) {
      // Só reprograma dias úteis (Seg-Sex) que NÃO estão marcados como descanso.
      const existing = await scheduledWorkoutsRepository.listByWeek(db, weekStatus.weekStartISO);
      const day = existing.find((s) => s.day_of_week === d);
      if (day && day.is_rest_day === 1) continue; // pula dias de descanso
      const seqIndex = (d - fromDay) % sequence.length;
      if (sequence[seqIndex] != null) {
        await scheduledWorkoutsRepository.scheduleWorkout(
          db,
          weekStatus.weekStartISO,
          d,
          sequence[seqIndex],
        );
      }
    }
  }

  /** Marca um dia da semana atual como descanso. */
  async function handleScheduleRest(_dateISO: string, dayOfWeek: number) {
    if (!db || !weekStatus) return;
    try {
      await scheduledWorkoutsRepository.scheduleRestDay(
        db,
        weekStatus.weekStartISO,
        dayOfWeek,
      );
      setSchedulePicker(null);
      await load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  /** Limpa a programação de um dia da semana atual. */
  async function handleClearDay(_dateISO: string, dayOfWeek: number) {
    if (!db || !weekStatus) return;
    try {
      await scheduledWorkoutsRepository.clearDay(db, weekStatus.weekStartISO, dayOfWeek);
      setSchedulePicker(null);
      await load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Distribui o ciclo automaticamente pela semana (Seg-Sex treinos, Sáb-Dom
   * descanso).
   *
   * @param restart true = reiniciar do primeiro; false = continuar do próximo.
   */
  async function handleAutoFill(restart: boolean) {
    if (!db) return;
    setAutoFilling(true);
    try {
      const startId = restart
        ? await trainingCycleService.getFirstWorkoutId(db)
        : continueWorkoutId;
      await calendarService.autoFillWeek(db, weekStart, startId);
      setShowWeekStartModal(false);
      await load();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoFilling(false);
    }
  }

  function handleDiscard() {
    if (!db || !activeSession) return;
    setShowDiscardConfirm(true);
  }

  async function confirmDiscard() {
    if (!db || !activeSession) return;
    setShowDiscardConfirm(false);
    await sessionsRepository.cancelSession(db, activeSession.id);
    await reloadActive();
  }

  async function confirmDeleteSession() {
    if (!db || !deletingSession) return;
    await sessionsRepository.deleteSession(db, deletingSession.sessionId);
    setDeletingSession(null);
    void load();
  }

  // "Nova semana" só aparece na semana atual sem programação.
  const showNewWeekBanner =
    !!weekStatus &&
    !weekStatus.hasSchedule &&
    isCurrentWeek(weekStart);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent.base} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Cabeçalho: mês + navegação */}
      <View style={styles.header}>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <View style={styles.navRow}>
          <Pressable onPress={goPrevWeek} style={styles.navBtn} hitSlop={8}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Pressable onPress={goToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>Hoje</Text>
          </Pressable>
          <Pressable onPress={goNextWeek} style={styles.navBtn} hitSlop={8}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={days}
        keyExtractor={(item) => item.date}
        ListHeaderComponent={
          activeSession ? (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Treino em andamento</Text>
              <Text style={styles.bannerName}>{activeSession.name}</Text>
              <View style={styles.bannerActions}>
                <Pressable
                  style={styles.bannerContinue}
                  onPress={() => router.push(`/registrar/${activeSession.id}`)}
                >
                  <Text style={styles.bannerContinueText}>Continuar treino</Text>
                </Pressable>
                <Pressable style={styles.bannerDiscard} onPress={handleDiscard}>
                  <Text style={styles.bannerDiscardText}>Descartar</Text>
                </Pressable>
              </View>
            </View>
          ) : showNewWeekBanner ? (
            <View style={styles.newWeekBanner}>
              <Text style={styles.newWeekEmoji}>🎉</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.newWeekTitle}>Nova semana sem programação</Text>
                <Text style={styles.newWeekSubtitle}>
                  Distribua o ciclo automaticamente ou monte dia a dia.
                </Text>
              </View>
              <Pressable
                style={styles.autoFillBtn}
                onPress={() => setShowWeekStartModal(true)}
              >
                <Text style={styles.autoFillBtnText}>Montar semana</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <DayCard
            day={item}
            hasActiveSession={!!activeSession}
            starting={starting}
            onStart={handleStart}
            onMarkPast={(dateISO, workoutId) => {
              if (workoutId) {
                // Veio com workoutId — registra direto sem abrir picker.
                void handleMarkPast(dateISO, workoutId);
              } else {
                // Sem workoutId — abre picker pra escolher qual treino.
                setPastPicker(dateISO);
              }
            }}
            onOpenSchedulePicker={(dateISO, dayOfWeek) =>
              setSchedulePicker({ dateISO, dayOfWeek })
            }
            onDeleteSession={(sessionId, dateISO) =>
              setDeletingSession({ sessionId, dateISO })
            }
          />
        )}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
      />

      {/* Picker de programação: escolher treino / descanso / limpar pra um dia */}
      <SchedulePicker
        visible={schedulePicker !== null}
        picker={schedulePicker}
        workouts={cycleWorkouts}
        onClose={() => setSchedulePicker(null)}
        onPickWorkout={(workoutId) =>
          schedulePicker &&
          handleScheduleWorkout(schedulePicker.dateISO, schedulePicker.dayOfWeek, workoutId)
        }
        onPickRest={() =>
          schedulePicker &&
          handleScheduleRest(schedulePicker.dateISO, schedulePicker.dayOfWeek)
        }
        onClear={() =>
          schedulePicker && handleClearDay(schedulePicker.dateISO, schedulePicker.dayOfWeek)
        }
      />

      {/* Picker de dia passado: marcar treino feito retroativamente */}
      <PastSessionPicker
        visible={pastPicker !== null}
        dateISO={pastPicker}
        workouts={cycleWorkouts}
        onClose={() => setPastPicker(null)}
        onPick={(workoutId) => pastPicker && handleMarkPast(pastPicker, workoutId)}
      />

      {/* Modal "Nova semana" — continuar/reiniciar ciclo */}
      <NewWeekModal
        visible={showWeekStartModal}
        continueWorkoutName={continueWorkoutName}
        restartWorkoutName={restartWorkoutName}
        autoFilling={autoFilling}
        onAutoFillContinue={() => handleAutoFill(false)}
        onAutoFillRestart={() => handleAutoFill(true)}
        onManual={() => setShowWeekStartModal(false)}
        onClose={() => setShowWeekStartModal(false)}
      />

      <ConfirmDialog
        visible={errorMsg !== null}
        title="Erro"
        message={errorMsg ?? ''}
        confirmText="OK"
        cancelText="OK"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />

      <ConfirmDialog
        visible={showDiscardConfirm}
        title="Descartar treino?"
        message="A sessão será cancelada. As séries registradas permanecem no histórico."
        confirmText="Descartar"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmDiscard}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      <ConfirmDialog
        visible={deletingSession !== null}
        title="Excluir treino deste dia?"
        message="A sessão e todas as séries registradas serão permanentemente removidas. O dia voltará a ficar disponível pra registrar outro treino."
        confirmText="Excluir"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeletingSession(null)}
      />
    </View>
  );
}

/**
 * Cartão de um dia do calendário — renderiza conforme o status.
 */
function DayCard({
  day,
  hasActiveSession,
  starting,
  onStart,
  onMarkPast,
  onOpenSchedulePicker,
  onDeleteSession,
}: {
  day: CalendarDay;
  hasActiveSession: boolean;
  starting: boolean;
  onStart: (workoutId: number) => void;
  onMarkPast: (dateISO: string, workoutId?: number) => void;
  onOpenSchedulePicker: (dateISO: string, dayOfWeek: number) => void;
  onDeleteSession: (sessionId: number, dateISO: string) => void;
}) {
  const isToday = day.isToday;

  const cardStyle = [
    styles.card,
    isToday && styles.cardToday,
    day.status === 'completed' && styles.cardCompleted,
  ];

  // Dia passado sem treino é tocável (Pressable) pra abrir o picker retroativo.
  if (day.status === 'no_session') {
    return (
      <Pressable
        style={[...cardStyle, styles.cardMuted]}
        onPress={() => onMarkPast(day.date)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.dayLabel}>
            {day.dayLabel} {day.dayNumber}
          </Text>
        </View>
        <Text style={styles.noSessionText}>Sem treino</Text>
        <Text style={styles.tapPastHint}>+ Marcar treino feito</Text>
      </Pressable>
    );
  }

  return (
    <View style={cardStyle}>
      <View style={styles.cardHeader}>
        <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
          {day.dayLabel} {day.dayNumber}
        </Text>
        {isToday && day.status === 'completed' ? (
          <View style={styles.badgeRow}>
            <Text style={styles.todayBadge}>★ HOJE</Text>
            <Text style={styles.completedBadge}>✔ Concluído</Text>
          </View>
        ) : isToday ? (
          <Text style={styles.todayBadge}>★ HOJE</Text>
        ) : day.status === 'completed' ? (
          <Text style={styles.completedBadge}>✔ Concluído</Text>
        ) : null}
      </View>

      {/* Conteúdo por status */}
      {day.status === 'completed' && day.sessionId ? (
        <View style={styles.completedBody}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => router.push(`/registrar/${day.sessionId}`)}
          >
            <Text style={styles.workoutName}>{day.workoutName}</Text>
            <Text style={styles.tapHint}>Toque para ver o treino</Text>
          </Pressable>
          <Pressable
            style={styles.deleteSessionBtn}
            onPress={() => onDeleteSession(day.sessionId!, day.date)}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.status.danger} />
          </Pressable>
        </View>
      ) : day.status === 'scheduled' ? (
        isToday ? (
          hasActiveSession ? (
            <Text style={styles.mutedText}>
              Sessão em andamento — use o botão acima
            </Text>
          ) : (
            <View>
              <Text style={styles.workoutName}>{day.workoutName}</Text>
              <Text style={styles.scheduledHint}>Treino programado</Text>
              <Pressable
                style={[styles.startBtn, starting && styles.startBtnDisabled]}
                onPress={() => onStart(day.workoutId!)}
                disabled={starting}
              >
                <Text style={styles.startBtnText}>
                  {starting ? 'Iniciando...' : '▶ Iniciar'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.chooseBtn}
                onPress={() => onOpenSchedulePicker(day.date, day.dayOfWeek)}
              >
                <Text style={styles.chooseBtnText}>↻ Trocar treino</Text>
              </Pressable>
            </View>
          )
        ) : day.isPast ? (
          // Passado: tinha programação mas não treinou — pode marcar como feito ou trocar.
          <View>
            <View style={styles.scheduledFutureBody}>
              <View style={{ flex: 1 }}>
                <Text style={styles.workoutNameMuted}>{day.workoutName}</Text>
                <Text style={styles.notTrainedHint}>não treinado</Text>
              </View>
              <Pressable
                style={styles.swapBtn}
                onPress={() => onOpenSchedulePicker(day.date, day.dayOfWeek)}
              >
                <Text style={styles.swapBtnText}>Trocar</Text>
              </Pressable>
            </View>
            {day.workoutId ? (
              <Pressable
                style={styles.markPastBtn}
                onPress={() => onMarkPast(day.date, day.workoutId!)}
              >
                <Text style={styles.markPastBtnText}>✓ Marcar como treinado</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          // Futuro: programado, pode trocar.
          <View style={styles.scheduledFutureBody}>
            <Text style={styles.workoutName}>{day.workoutName}</Text>
            <Pressable
              style={styles.swapBtn}
              onPress={() => onOpenSchedulePicker(day.date, day.dayOfWeek)}
            >
              <Text style={styles.swapBtnText}>Trocar</Text>
            </Pressable>
          </View>
        )
      ) : day.status === 'rest' ? (
        <View style={styles.restBody}>
          <Text style={styles.restText}>😴 Descanso</Text>
          <Pressable
            style={styles.swapBtn}
            onPress={() => onOpenSchedulePicker(day.date, day.dayOfWeek)}
          >
            <Text style={styles.swapBtnText}>Trocar</Text>
          </Pressable>
        </View>
      ) : day.status === 'empty' ? (
        // Futuro sem programação: escolher treino ou descanso.
        <View style={styles.emptyBody}>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => onOpenSchedulePicker(day.date, day.dayOfWeek)}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.accent.base} />
            <Text style={styles.emptyBtnText}>Escolher treino</Text>
          </Pressable>
          <Pressable
            style={styles.restChoiceBtn}
            onPress={() => onOpenSchedulePicker(day.date, day.dayOfWeek)}
          >
            <Text style={styles.restChoiceText}>😴 Descanso</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Picker de programação de um dia (bottom sheet).
 * Lista treinos do ciclo, descanso e limpar.
 */
function SchedulePicker({
  visible,
  picker,
  workouts,
  onClose,
  onPickWorkout,
  onPickRest,
  onClear,
}: {
  visible: boolean;
  picker: { dateISO: string; dayOfWeek: number } | null;
  workouts: WorkoutRow[];
  onClose: () => void;
  onPickWorkout: (workoutId: number) => void;
  onPickRest: () => void;
  onClear: () => void;
}) {
  const dayLabel = (() => {
    if (!picker) return '';
    const [, , dayNum] = picker.dateISO.split('-');
    return `${dayNum}`;
  })();

  const title = picker
    ? `Treino de ${labelOfDayOfWeek(picker.dayOfWeek)} ${dayLabel}`
    : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.pickerTitle}>{title}</Text>
          <Text style={styles.pickerSubtitle}>Escolha o treino deste dia:</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {workouts.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                Nenhum treino no ciclo. Cadastre fichas e defina a ordem do ciclo.
              </Text>
            ) : (
              workouts.map((w) => (
                <Pressable
                  key={w.id}
                  style={styles.pickerItem}
                  onPress={() => onPickWorkout(w.id)}
                >
                  <Text style={styles.pickerItemName}>{w.name}</Text>
                  {w.division ? (
                    <Text style={styles.pickerItemMeta}>{w.division}</Text>
                  ) : null}
                </Pressable>
              ))
            )}

            <Pressable style={styles.pickerRestItem} onPress={onPickRest}>
              <Text style={styles.restText}>😴 Descanso</Text>
            </Pressable>

            {picker ? (
              <Pressable style={styles.pickerClearItem} onPress={onClear}>
                <Text style={styles.pickerClearText}>Limpar</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Pressable style={styles.pickerCancel} onPress={onClose}>
            <Text style={styles.pickerCancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Modal "Nova semana" — continuar/reiniciar ciclo + distribuir.
 */
function NewWeekModal({
  visible,
  continueWorkoutName,
  restartWorkoutName,
  autoFilling,
  onAutoFillContinue,
  onAutoFillRestart,
  onManual,
  onClose,
}: {
  visible: boolean;
  continueWorkoutName: string | null;
  restartWorkoutName: string | null;
  autoFilling: boolean;
  onAutoFillContinue: () => void;
  onAutoFillRestart: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        <Pressable
          style={[styles.pickerSheet, styles.newWeekSheet]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.newWeekModalTitle}>Nova semana! 🎉</Text>
          <Text style={styles.newWeekModalSubtitle}>Como deseja começar?</Text>

          <Pressable
            style={[styles.newWeekOption, styles.newWeekOptionPrimary]}
            onPress={onAutoFillContinue}
            disabled={autoFilling || continueWorkoutName == null}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.newWeekOptionTitle}>Continuar ciclo</Text>
              <Text style={styles.newWeekOptionSub}>
                {continueWorkoutName
                  ? `Começa por ${continueWorkoutName}`
                  : 'Sem treinos no ciclo'}
              </Text>
            </View>
            <Ionicons name="play" size={20} color={colors.accent.base} />
          </Pressable>

          <Pressable
            style={[styles.newWeekOption, styles.newWeekOptionPrimary]}
            onPress={onAutoFillRestart}
            disabled={autoFilling || restartWorkoutName == null}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.newWeekOptionTitle}>Reiniciar ciclo</Text>
              <Text style={styles.newWeekOptionSub}>
                {restartWorkoutName
                  ? `Começa por ${restartWorkoutName}`
                  : 'Sem treinos no ciclo'}
              </Text>
            </View>
            <Ionicons name="refresh" size={20} color={colors.accent.base} />
          </Pressable>

          <Text style={styles.newWeekFooterHint}>
            Distribui automaticamente o ciclo de Seg-Sex e deixa Sáb-Dom como
            descanso.
          </Text>

          <Pressable style={styles.pickerManualBtn} onPress={onManual}>
            <Text style={styles.pickerManualText}>Montar manualmente</Text>
          </Pressable>

          <Pressable style={styles.pickerCancel} onPress={onClose}>
            <Text style={styles.pickerCancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Modal pra escolher qual treino foi feito num dia passado.
 */
function PastSessionPicker({
  visible,
  dateISO,
  workouts,
  onClose,
  onPick,
}: {
  visible: boolean;
  dateISO: string | null;
  workouts: WorkoutRow[];
  onClose: () => void;
  onPick: (workoutId: number) => void;
}) {
  // Formata "2026-07-14" → "14/07 (SEG)"
  const dateLabel = (() => {
    if (!dateISO) return '';
    const [, month, dayNum] = dateISO.split('-');
    const d = new Date(dateISO + 'T12:00:00');
    const labels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return `${dayNum}/${month} (${labels[d.getDay()]})`;
  })();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.pickerTitle}>
            {dateISO === toLocalISODate(new Date()) ? 'Treino de hoje' : `Marcar treino de ${dateLabel}`}
          </Text>
          <Text style={styles.pickerSubtitle}>
            {dateISO === toLocalISODate(new Date())
              ? 'Escolha qual treino quer iniciar:'
              : 'Qual treino você fez neste dia?'}
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {workouts.map((w) => (
              <Pressable
                key={w.id}
                style={styles.pickerItem}
                onPress={() => onPick(w.id)}
              >
                <Text style={styles.pickerItemName}>{w.name}</Text>
                {w.division ? (
                  <Text style={styles.pickerItemMeta}>{w.division}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.pickerCancel} onPress={onClose}>
            <Text style={styles.pickerCancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.base },
  center: { flex: 1, backgroundColor: colors.background.base, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthLabel: { color: colors.text.primary, fontSize: 20, fontWeight: '700' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navArrow: { color: colors.accent.base, fontSize: typography.size['2xl'], fontWeight: '300' },
  todayBtn: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  todayBtnText: { color: colors.accent.base, fontSize: 13, fontWeight: '600' },
  banner: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.accent.base,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bannerTitle: { color: colors.accent.base, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  bannerName: { color: colors.text.primary, fontSize: 20, fontWeight: '600', marginTop: spacing.xs },
  bannerActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  bannerContinue: {
    flex: 1,
    backgroundColor: colors.accent.base,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  bannerContinueText: { color: colors.background.base, fontWeight: '700', fontSize: 15 },
  bannerDiscard: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bannerDiscardText: { color: colors.status.danger, fontWeight: '600', fontSize: 15 },

  // ── Banner "Nova semana" ────────────────────────────────────────────────
  newWeekBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.accent.base,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  newWeekEmoji: { fontSize: 24 },
  newWeekTitle: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
  newWeekSubtitle: { color: colors.text.secondary, fontSize: typography.size.xs, marginTop: 2 },
  autoFillBtn: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  autoFillBtnText: { color: colors.background.base, fontWeight: '700', fontSize: 13 },

  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 10,
  },
  cardToday: {
    borderColor: colors.accent.base,
    borderWidth: 2,
    backgroundColor: colors.background.elevated,
    // Compensa o borderWidth extra (2 vs 1) pra não reduzir o conteúdo.
    padding: 15,
  },
  cardCompleted: {
    borderColor: colors.background.border,
  },
  cardMuted: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dayLabel: { color: colors.text.secondary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  dayLabelToday: { color: colors.accent.base },
  todayBadge: { color: colors.accent.base, fontSize: 11, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  completedBadge: { color: colors.status.success, fontSize: 11, fontWeight: '600' },
  completedBody: { marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center' },
  deleteSessionBtn: {
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  workoutName: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600' },
  workoutNameMuted: { color: colors.text.muted, fontSize: typography.size.lg, fontWeight: '600', fontStyle: 'italic' },
  tapHint: { color: colors.text.muted, fontSize: 13, marginTop: 2 },
  scheduledHint: { color: colors.accent.base, fontSize: 13, marginTop: 2, fontWeight: '500' },
  notTrainedHint: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2, fontStyle: 'italic' },
  markPastBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent.soft,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  markPastBtnText: { color: colors.accent.base, fontSize: 13, fontWeight: '600' },
  scheduledFutureBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // ── Botão "Trocar" (texto, nos dias programados) ────────────────────────
  swapBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  swapBtnText: { color: colors.text.secondary, fontSize: 13, fontWeight: '500' },

  // ── Dia de descanso ─────────────────────────────────────────────────────
  restBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  restText: { color: colors.text.muted, fontSize: typography.size.md, fontWeight: '500' },

  // ── Dia vazio (escolher treino / descanso) ──────────────────────────────
  emptyBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  emptyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent.base,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  emptyBtnText: { color: colors.accent.base, fontSize: typography.size.sm, fontWeight: '600' },
  restChoiceBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
  },
  restChoiceText: { color: colors.text.muted, fontSize: typography.size.sm },

  startBtn: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: colors.background.base, fontSize: typography.size.md, fontWeight: '700' },
  chooseBtn: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chooseBtnText: { color: colors.text.secondary, fontSize: 13, fontWeight: '500' },
  mutedText: { color: colors.text.secondary, fontSize: typography.size.sm },
  noSessionText: { color: colors.text.muted, fontSize: typography.size.sm, fontStyle: 'italic' },
  tapPastHint: { color: colors.accent.base, fontSize: 13, marginTop: 6, fontWeight: '500' },
  upcomingText: { color: colors.text.muted, fontSize: typography.size.lg },

  // ── Picker (bottom sheet) ───────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    padding: spacing.xl,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.background.border,
  },
  pickerTitle: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '700' },
  pickerSubtitle: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  pickerEmpty: { color: colors.text.muted, fontSize: typography.size.sm, marginBottom: spacing.md },
  pickerItem: {
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
  },
  pickerItemName: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
  pickerItemMeta: { color: colors.text.muted, fontSize: 13, marginTop: 2 },
  pickerRestItem: {
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
  },
  pickerClearItem: {
    padding: 14,
    alignItems: 'center',
  },
  pickerClearText: { color: colors.status.danger, fontSize: 15, fontWeight: '500' },
  pickerManualBtn: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.accent.base,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  pickerManualText: { color: colors.accent.base, fontSize: 15, fontWeight: '700' },
  pickerCancel: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerCancelText: { color: colors.text.secondary, fontSize: typography.size.md },

  // ── Modal "Nova semana" ─────────────────────────────────────────────────
  newWeekSheet: {
    paddingBottom: 28,
  },
  newWeekModalTitle: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: '700' },
  newWeekModalSubtitle: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  newWeekOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  newWeekOptionPrimary: {
    borderColor: colors.accent.base,
  },
  newWeekOptionTitle: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '700' },
  newWeekOptionSub: { color: colors.text.secondary, fontSize: 13, marginTop: 2 },
  newWeekFooterHint: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
});

/** Converte Date → "YYYY-MM-DD" (local, sem timezone). */
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Label curto do dia da semana a partir do índice (0=Seg). */
function labelOfDayOfWeek(dayOfWeek: number): string {
  const labels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  return labels[dayOfWeek] ?? '';
}
