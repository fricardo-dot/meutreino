import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StepperInput } from '@/components/StepperInput';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useDatabase } from '@/hooks/useDatabase';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { sessionSetsRepository } from '@/repositories/session-sets.repository';
import { autofillService } from '@/services/autofill.service';
import { workoutEngine, type SaveSetResult } from '@/services/workout-engine';
import type { SessionExerciseRow, SessionRow, SessionSetRow } from '@/types/db';

/**
 * Formata número pra input: 80 → "80", 12.5 → "12.5", 0 → "0".
 * Remove zeros à direita desnecessários.
 */
function formatNumber(n: number): string {
  if (n === 0) return '0';
  return String(n);
}

/**
 * ⭐ Tela de sessão ao vivo — o coração do app.
 *
 * Objetivo: registrar uma série em menos de 3 segundos, sem modal, sem
 * navegação, sem popup.
 *
 * Fluxo por exercício:
 *   [peso] [reps] [RIR]  [Salvar Série]
 *      ↓
 *   "✓ Série registrada" + cronômetro de descanso aparece
 *
 * A persistência é garantida mesmo fechando o app no meio do treino
 * (a sessão fica 'em_andamento' e é recuperável pela tela Início).
 */
export default function RegistrarSessaoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const { db, status } = useDatabase();

  const [session, setSession] = useState<SessionRow | null>(null);
  const [exercises, setExercises] = useState<SessionExerciseRow[]>([]);
  const [setsByExercise, setSetsByExercise] = useState<Record<number, SessionSetRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const restTimer = useRestTimer();

  const load = useCallback(async () => {
    if (status !== 'ready' || !db || Number.isNaN(sessionId)) return;
    const s = await sessionsRepository.getById(db, sessionId);
    setSession(s);
    if (s) {
      const exs = await db.getAllAsync<SessionExerciseRow>(
        `SELECT * FROM session_exercises WHERE session_id = ? ORDER BY sort_order;`,
        [sessionId],
      );
      setExercises(exs);
      const map: Record<number, SessionSetRow[]> = {};
      for (const ex of exs) {
        map[ex.id] = await sessionSetsRepository.listBySessionExercise(db, ex.id);
      }
      setSetsByExercise(map);
    }
    setLoading(false);
  }, [db, status, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleComplete() {
    if (!db || !session) return;
    Alert.alert('Concluir treino?', 'A sessão será finalizada.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Concluir',
        onPress: async () => {
          setCompleting(true);
          await sessionsRepository.completeSession(db, session.id);
          setCompleting(false);
          router.replace('/historico');
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#B4FF39" size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#A1A1AA' }}>Sessão não encontrada.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.dismiss()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.sessionName}>{session.name}</Text>
          <Text style={styles.sessionStatus}>
            {session.status === 'em_andamento'
              ? 'Em andamento'
              : session.status === 'concluida'
                ? 'Concluído · editável'
                : 'Cancelada · editável'}
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {restTimer.isActive && session.status === 'em_andamento' && (
        <View style={styles.restBar}>
          <Text style={styles.restLabel}>Descanso</Text>
          <Text style={styles.restTime}>{restTimer.remaining}s</Text>
          <Pressable onPress={restTimer.cancel} hitSlop={8}>
            <Text style={styles.restSkip}>Pular</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={exercises}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ExerciseBlock
            sessionExercise={item}
            sessionId={session.id}
            sets={setsByExercise[item.id] ?? []}
            restSeconds={90}
            onSaved={() => void load()}
            restTimer={restTimer}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      />

      <View style={styles.footer}>
        {session.status === 'em_andamento' ? (
          <Pressable
            style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
            onPress={handleComplete}
            disabled={completing}
          >
            <Text style={styles.completeBtnText}>
              {completing ? 'Concluindo...' : 'Concluir treino'}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.backFooterBtn} onPress={() => router.dismiss()}>
            <Text style={styles.backFooterBtnText}>Voltar</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Bloco de um exercício na sessão: lista as séries já feitas + inputs rápidos.
 */
function ExerciseBlock({
  sessionExercise,
  sessionId,
  sets,
  restSeconds,
  onSaved,
  restTimer,
}: {
  sessionExercise: SessionExerciseRow;
  sessionId: number;
  sets: SessionSetRow[];
  restSeconds: number;
  onSaved: () => void;
  restTimer: ReturnType<typeof useRestTimer>;
}) {
  const { db } = useDatabase();
  const [weight, setWeight] = useState('0');
  const [reps, setReps] = useState('0');
  const [rir, setRir] = useState('');
  const [lastResult, setLastResult] = useState<SaveSetResult | null>(null);
  const [saving, setSaving] = useState(false);

  const nextSetNumber = sets.length + 1;

  // Autofill: pré-preenche peso/reps/RIR da última série (mesma sessão ou histórica).
  // Roda na montagem e quando o número de séries muda (após salvar).
  useEffect(() => {
    if (!db) return;
    void (async () => {
      const suggestion = await autofillService.suggestNextSet(
        db,
        sessionExercise.exercise_id,
        nextSetNumber,
        sessionExercise.id,
      );
      if (suggestion.hasHistory) {
        setWeight(formatNumber(suggestion.weight));
        setReps(formatNumber(suggestion.reps));
        setRir(suggestion.rir !== null ? String(suggestion.rir) : '');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sessionExercise.id, sessionExercise.exercise_id, nextSetNumber]);

  async function handleSave() {
    if (!db) return;
    const w = parseFloat(weight.replace(',', '.')) || 0;
    const r = parseInt(reps, 10) || 0;
    const rirVal = rir === '' ? null : Math.min(3, Math.max(0, parseInt(rir, 10) || 0));

    setSaving(true);
    try {
      const result = await workoutEngine.saveSet(db, {
        sessionExerciseId: sessionExercise.id,
        exerciseId: sessionExercise.exercise_id,
        sessionId,
        setNumber: nextSetNumber,
        weight: w,
        reps: r,
        rir: rirVal,
        restSeconds,
      });
      setLastResult(result);
      if (result.restEndsAt) restTimer.start(result.restEndsAt);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setWeight('0');
    setReps('0');
    setRir('');
    setLastResult(null);
  }

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{sessionExercise.exercise_name}</Text>

      {/* Séries já registradas */}
      {sets.length > 0 && (
        <View style={styles.setsTable}>
          {sets.map((s) => (
            <View key={s.id} style={styles.setRow}>
              <Text style={styles.setNumber}>{s.set_number}</Text>
              <Text style={styles.setDetail}>{s.weight} kg</Text>
              <Text style={styles.setDetail}>{s.reps} reps</Text>
              <Text style={styles.setDetail}>{s.rir !== null ? `RIR ${s.rir}` : '—'}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Inputs rápidos com steppers +/− */}
      <View style={styles.inputRow}>
        <StepperInput
          label="PESO"
          value={weight}
          onChange={setWeight}
          suffix="kg"
          step={2.5}
          decimals={1}
          keyboardType="decimal-pad"
          flex={1.4}
        />
        <StepperInput
          label="REPS"
          value={reps}
          onChange={setReps}
          step={1}
          decimals={0}
          keyboardType="number-pad"
          flex={1.1}
        />
        <StepperInput
          label="RIR"
          value={rir || '0'}
          onChange={setRir}
          step={1}
          decimals={0}
          min={0}
          max={3}
          keyboardType="number-pad"
          flex={0.9}
        />
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.resetBtn, saving && styles.actionBtnDisabled]}
          onPress={handleReset}
          disabled={saving}
          hitSlop={8}
        >
          <Ionicons name="refresh" size={22} color="#A1A1AA" />
        </Pressable>
        <Pressable
          style={[styles.saveBtn, saving && styles.actionBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Salvando...' : `Salvar série ${nextSetNumber}`}
          </Text>
        </Pressable>
      </View>

      {lastResult ? (
        <Text style={styles.savedFeedback}>
          ✓ Série registrada
          {lastResult.brokenPRs.length > 0 ? `  🏆 PR: ${lastResult.brokenPRs.join(', ')}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { color: '#B4FF39', fontSize: 28, fontWeight: '300' },
  titleWrap: { flex: 1, alignItems: 'center' },
  sessionName: { color: '#F5F5F7', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  sessionStatus: { color: '#6B6B76', fontSize: 12, marginTop: 2, fontWeight: '500' },
  restBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E27',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: '#2A2A35',
    borderBottomWidth: 1,
  },
  restLabel: { color: '#6B6B76', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  restTime: { color: '#B4FF39', fontSize: 22, fontWeight: '700' },
  restSkip: { color: '#A1A1AA', fontSize: 14, fontWeight: '500' },
  block: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  blockTitle: { color: '#F5F5F7', fontSize: 17, fontWeight: '600', marginBottom: 12 },
  setsTable: { marginBottom: 12 },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopColor: '#2A2A35',
    borderTopWidth: 1,
  },
  setNumber: { color: '#B4FF39', fontWeight: '700', width: 36 },
  setDetail: { color: '#A1A1AA', fontSize: 14, flex: 1 },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  inputLabel: { color: '#6B6B76', fontSize: 12, marginBottom: 4, fontWeight: '500' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  input: { color: '#F5F5F7', fontSize: 18, fontWeight: '600', paddingVertical: 10, flex: 1 },
  inputSuffix: { color: '#6B6B76', fontSize: 12 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#B4FF39',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#0B0B0F', fontSize: 16, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  resetBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedFeedback: { color: '#22C55E', fontSize: 13, marginTop: 10, textAlign: 'center', fontWeight: '500' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#0B0B0F',
    borderTopColor: '#2A2A35',
    borderTopWidth: 1,
  },
  completeBtn: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#B4FF39',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.5 },
  completeBtnText: { color: '#B4FF39', fontSize: 16, fontWeight: '700' },
  backFooterBtn: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  backFooterBtnText: { color: '#A1A1AA', fontSize: 16, fontWeight: '600' },
});
