import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useActiveSession } from '@/hooks/useActiveSession';
import { useDatabase } from '@/hooks/useDatabase';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { workoutsRepository } from '@/repositories/workouts.repository';
import type { WorkoutRow } from '@/types/db';
import { calendarService, type CalendarDay } from '@/services/calendar.service';

/**
 * Tela Calendário — painel principal do app.
 *
 * Mostra a semana atual com o treino de cada dia:
 *  - Dias passados: "✔ Concluído <nome>" ou "Sem treino"
 *  - Hoje: destacado + treino sugerido do ciclo + botão Iniciar
 *  - Futuros: "—"
 *
 * Banner de sessão em andamento no topo (Continuar/Descartar).
 * Navegação ← → entre semanas + botão "Hoje".
 */
export default function CalendarioScreen() {
  const { db, status } = useDatabase();
  const { activeSession, reload: reloadActive } = useActiveSession();
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => calendarService.getWeekStart());
  const [monthLabel, setMonthLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [cycleWorkouts, setCycleWorkouts] = useState<WorkoutRow[]>([]);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    const built = await calendarService.buildWeek(db, weekStart);
    setDays(built);
    setMonthLabel(calendarService.getMonthLabel(weekStart));
    setLoading(false);
  }, [db, status, weekStart]);

  // Carrega a lista de workouts do ciclo uma vez (para o picker de dia passado).
  useEffect(() => {
    if (status !== 'ready' || !db) return;
    void (async () => {
      const list = await workoutsRepository.listCycleWorkouts(db);
      setCycleWorkouts(list);
    })();
  }, [db, status]);

  async function handleMarkPast(dateISO: string, workoutId: number) {
    if (!db) return;
    try {
      const todayISO = toLocalISODate(new Date());
      if (dateISO === todayISO) {
        // Escolha de treino pra HOJE: inicia sessão ativa (pra registrar séries).
        const sessionId = await sessionsRepository.startSession(db, workoutId);
        await reloadActive();
        setPickerDate(null);
        router.push(`/registrar/${sessionId}`);
      } else {
        // Dia passado: registra como concluído (avança o ciclo).
        await sessionsRepository.logPastSession(db, workoutId, dateISO);
        setPickerDate(null);
        await load();
      }
    } catch (e) {
      Alert.alert(
        'Não foi possível registrar',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

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
      Alert.alert(
        'Não foi possível iniciar',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setStarting(false);
    }
  }

  function handleDiscard() {
    if (!db || !activeSession) return;
    Alert.alert(
      'Descartar treino?',
      'A sessão será cancelada. As séries registradas permanecem no histórico.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            await sessionsRepository.cancelSession(db, activeSession.id);
            await reloadActive();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#B4FF39" size="large" />
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
          ) : null
        }
        renderItem={({ item }) => (
          <DayCard
            day={item}
            hasActiveSession={!!activeSession}
            starting={starting}
            onStart={handleStart}
            onMarkPast={(dateISO) => setPickerDate(dateISO)}
            onChooseWorkout={(dateISO) => setPickerDate(dateISO)}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
      />

      {/* Modal pra escolher qual treino você fez num dia passado */}
      <PastSessionPicker
        visible={pickerDate !== null}
        dateISO={pickerDate}
        workouts={cycleWorkouts}
        onClose={() => setPickerDate(null)}
        onPick={(workoutId) => pickerDate && handleMarkPast(pickerDate, workoutId)}
      />
    </View>
  );
}

/**
 * Cartão de um dia do calendário.
 */
function DayCard({
  day,
  hasActiveSession,
  starting,
  onStart,
  onMarkPast,
  onChooseWorkout,
}: {
  day: CalendarDay;
  hasActiveSession: boolean;
  starting: boolean;
  onStart: (workoutId: number) => void;
  onMarkPast: (dateISO: string) => void;
  onChooseWorkout?: (dateISO: string) => void;
}) {
  const isToday = day.isToday;
  const isPastNoSession = day.status === 'no_session';

  const cardStyle = [
    styles.card,
    isToday && styles.cardToday,
    day.status === 'completed' && styles.cardCompleted,
  ];

  // Dia passado sem treino é tocável (Pressable) pra abrir o picker.
  if (isPastNoSession) {
    return (
      <Pressable style={[...cardStyle, styles.cardMuted]} onPress={() => onMarkPast(day.date)}>
        <View style={styles.cardHeader}>
          <Text style={styles.dayLabel}>{day.dayLabel} {day.dayNumber}</Text>
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
        {isToday ? (
          <Text style={styles.todayBadge}>★ HOJE</Text>
        ) : day.status === 'completed' ? (
          <Text style={styles.completedBadge}>✔ Concluído</Text>
        ) : null}
      </View>

      {/* Conteúdo por status */}
      {day.status === 'completed' && day.sessionId ? (
        <Pressable
          onPress={() => router.push(`/registrar/${day.sessionId}`)}
          style={styles.completedBody}
        >
          <Text style={styles.workoutName}>{day.workoutName}</Text>
          <Text style={styles.tapHint}>Toque para ver o treino</Text>
        </Pressable>
      ) : day.status === 'today' && !hasActiveSession && day.suggestedWorkoutId ? (
        <View>
          <Text style={styles.workoutName}>{day.workoutName ?? 'Treino'}</Text>
          <Text style={styles.suggestedHint}>Próximo treino do ciclo</Text>
          <View style={styles.todayActions}>
            <Pressable
              style={[styles.startBtn, { flex: 1 }, starting && styles.startBtnDisabled]}
              onPress={() => onStart(day.suggestedWorkoutId!)}
              disabled={starting}
            >
              <Text style={styles.startBtnText}>
                {starting ? 'Iniciando...' : '▶ Iniciar'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.viewBtn}
              onPress={() => router.push(`/treino/${day.workoutId ?? day.suggestedWorkoutId}`)}
            >
              <Text style={styles.viewBtnText}>Ver</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.chooseBtn}
            onPress={() => onChooseWorkout?.(day.date)}
          >
            <Text style={styles.chooseBtnText}>↻ Escolher outro treino</Text>
          </Pressable>
        </View>
      ) : day.status === 'today' && hasActiveSession ? (
        <Text style={styles.mutedText}>Sessão em andamento — use o botão acima</Text>
      ) : day.status === 'no_session' ? (
        // Caso coberto pelo Pressable acima (não chega aqui).
        null
      ) : (
        <Text style={styles.upcomingText}>—</Text>
      )}
    </View>
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
            {dateISO === toLocalISODate(new Date())
              ? 'Treino de hoje'
              : `Marcar treino de ${dateLabel}`}
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
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthLabel: { color: '#F5F5F7', fontSize: 20, fontWeight: '700' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navArrow: { color: '#B4FF39', fontSize: 28, fontWeight: '300' },
  todayBtn: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  todayBtnText: { color: '#B4FF39', fontSize: 13, fontWeight: '600' },
  banner: {
    backgroundColor: '#1E1E27',
    borderWidth: 1,
    borderColor: '#B4FF39',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  bannerTitle: { color: '#B4FF39', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  bannerName: { color: '#F5F5F7', fontSize: 20, fontWeight: '600', marginTop: 4 },
  bannerActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  bannerContinue: {
    flex: 1,
    backgroundColor: '#B4FF39',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bannerContinueText: { color: '#0B0B0F', fontWeight: '700', fontSize: 15 },
  bannerDiscard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerDiscardText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },
  card: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardToday: {
    borderColor: '#B4FF39',
    borderWidth: 2,
    backgroundColor: '#1E1E27',
    // Compensa o borderWidth extra (2 vs 1) pra não reduzir o conteúdo.
    padding: 15,
  },
  cardCompleted: {
    borderColor: '#2A2A35',
  },
  cardMuted: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayLabel: { color: '#A1A1AA', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  dayLabelToday: { color: '#B4FF39' },
  todayBadge: { color: '#B4FF39', fontSize: 11, fontWeight: '700' },
  completedBadge: { color: '#22C55E', fontSize: 11, fontWeight: '600' },
  completedBody: { marginTop: 4 },
  workoutName: { color: '#F5F5F7', fontSize: 18, fontWeight: '600' },
  tapHint: { color: '#6B6B76', fontSize: 13, marginTop: 2 },
  suggestedHint: { color: '#B4FF39', fontSize: 13, marginTop: 2, fontWeight: '500' },
  startBtn: {
    backgroundColor: '#B4FF39',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: '#0B0B0F', fontSize: 16, fontWeight: '700' },
  todayActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  viewBtn: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnText: { color: '#A1A1AA', fontSize: 16, fontWeight: '600' },
  chooseBtn: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chooseBtnText: { color: '#A1A1AA', fontSize: 13, fontWeight: '500' },
  mutedText: { color: '#A1A1AA', fontSize: 14 },
  noSessionText: { color: '#6B6B76', fontSize: 14, fontStyle: 'italic' },
  tapPastHint: { color: '#B4FF39', fontSize: 13, marginTop: 6, fontWeight: '500' },
  upcomingText: { color: '#6B6B76', fontSize: 18 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#15151C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  pickerTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '700' },
  pickerSubtitle: { color: '#A1A1AA', fontSize: 14, marginTop: 4, marginBottom: 16 },
  pickerItem: {
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  pickerItemName: { color: '#F5F5F7', fontSize: 16, fontWeight: '600' },
  pickerItemMeta: { color: '#6B6B76', fontSize: 13, marginTop: 2 },
  pickerCancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerCancelText: { color: '#A1A1AA', fontSize: 16 },
});

/** Converte Date → "YYYY-MM-DD" (local, sem timezone). */
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
