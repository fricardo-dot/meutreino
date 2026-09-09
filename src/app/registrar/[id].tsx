import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LoadErrorView } from '@/components/LoadErrorView';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StepperInput } from '@/components/StepperInput';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useDatabase } from '@/hooks/useDatabase';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { sessionSetsRepository } from '@/repositories/session-sets.repository';
import { autofillService } from '@/services/autofill.service';
import { workoutEngine, type SaveSetResult } from '@/services/workout-engine';
import { mensagemDeErro } from '@/types/errors.helpers';
import { colors, radius, spacing, typography } from '@/theme';
import type { SessionExerciseRow, SessionRow, SessionSetRow } from '@/types/db';

/**
 * SessionExerciseRow estendido com dados do plano (workout_exercises) e do
 * exercício (exercises), trazidos via JOIN na carga da sessão.
 */
type SessionExerciseWithPlan = SessionExerciseRow & {
  target_sets: number | null;
  target_reps: string | null;
  target_rest_seconds: number | null;
  equipment: string | null;
};

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
  const [exercises, setExercises] = useState<SessionExerciseWithPlan[]>([]);
  const [setsByExercise, setSetsByExercise] = useState<Record<number, SessionSetRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db || Number.isNaN(sessionId)) return;
    try {
      const s = await sessionsRepository.getById(db, sessionId);
      setSession(s);
      if (s) {
        const exs = await db.getAllAsync<SessionExerciseWithPlan>(
          `SELECT se.*, we.target_sets, we.target_reps, we.target_rest_seconds, e.equipment
           FROM session_exercises se
           LEFT JOIN workout_exercises we ON we.id = se.workout_exercise_id
           LEFT JOIN exercises e ON e.id = se.exercise_id
           WHERE se.session_id = ?
           ORDER BY se.sort_order;`,
          [sessionId],
        );
        setExercises(exs);
        const map: Record<number, SessionSetRow[]> = {};
        for (const ex of exs) {
          map[ex.id] = await sessionSetsRepository.listBySessionExercise(db, ex.id);
        }
        setSetsByExercise(map);
      }
      // Deu certo: se havia erro de uma tentativa anterior, ele sai.
      setLoadError(null);
    } catch (error) {
      setLoadError(mensagemDeErro(error));
    } finally {
      setLoading(false);
    }
  }, [db, status, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleComplete() {
    setShowCompleteConfirm(true);
  }

  async function confirmComplete() {
    if (!db || !session) return;
    setCompleting(true);
    try {
      await sessionsRepository.completeSession(db, session.id);
      setShowCompleteConfirm(false);
      router.replace('/historico');
    } catch (error) {
      // Sem este catch, uma falha de gravação (StaleDatabaseError, por
      // exemplo) deixava `completing` em true para sempre: o botão ficava
      // preso em "Concluindo…" e o diálogo aberto, sem dizer nada.
      setShowCompleteConfirm(false);
      setErrorMsg(mensagemDeErro(error));
    } finally {
      setCompleting(false);
    }
  }

  if (loadError !== null) {

    return (

      <LoadErrorView

        mensagem={loadError}

        onRetry={() => {

          setLoadError(null);

          setLoading(true);

          void load();

        }}

      />

    );

  }


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent.base} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text.secondary }}>Sessão não encontrada.</Text>
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

      <FlatList
        data={exercises}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ExerciseBlock
            sessionExercise={item}
            sessionId={session.id}
            sets={setsByExercise[item.id] ?? []}
            onSaved={() => void load()}
            onError={setErrorMsg}
          />
        )}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
      />

      <View style={styles.footer}>
        {session.status === 'em_andamento' ? (
          <Pressable
            style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
            onPress={() => setShowCompleteConfirm(true)}
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

      <ConfirmDialog
        visible={errorMsg !== null}
        title="Não deu para salvar"
        message={errorMsg ?? ''}
        confirmText="Entendi"
        cancelText="Fechar"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />

      <ConfirmDialog
        visible={showCompleteConfirm}
        title="Concluir treino?"
        message="A sessão será finalizada e vai para o histórico."
        confirmText="Concluir"
        onConfirm={confirmComplete}
        onCancel={() => setShowCompleteConfirm(false)}
      />
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
  onSaved,
  onError,
}: {
  sessionExercise: SessionExerciseWithPlan;
  sessionId: number;
  sets: SessionSetRow[];
  onSaved: () => void;
  /** Reporta falha ao pai, que é quem tem o diálogo de mensagem. */
  onError: (mensagem: string) => void;
}) {
  const { db } = useDatabase();
  const restTimer = useRestTimer();
  const [weight, setWeight] = useState('0');
  const [reps, setReps] = useState('0');
  const [rir, setRir] = useState('');
  const [lastResult, setLastResult] = useState<SaveSetResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  /**
   * Marca que o usuário já mexeu nos campos desta série.
   *
   * A flag de `cancelado` do efeito só dispara no cleanup — desmontar ou
   * trocar de exercício. Digitar não mexe em nenhuma dependência, então
   * sozinha ela NÃO impedia a sugestão de sobrescrever o que foi digitado,
   * que era justamente o caso que ela deveria cobrir.
   */
  const usuarioEditou = useRef(false);

  const nextSetNumber = sets.length + 1;
  const maxSets = sessionExercise.target_sets ?? 99;
  const allDone = nextSetNumber > maxSets;
  const restSeconds = sessionExercise.target_rest_seconds ?? 90;

  // Autofill: pré-preenche peso/reps/RIR da última série (mesma sessão ou histórica).
  // Roda na montagem e quando o número de séries muda (após salvar).
  // Sugestão de autofill.
  //
  // `cancelado` existe porque a consulta é assíncrona e o usuário pode começar
  // a digitar antes de ela voltar: sem isso, a sugestão sobrescrevia o que ele
  // acabara de escrever. Também protege contra aplicar a resposta depois que o
  // bloco desmontou ou trocou de exercício.
  useEffect(() => {
    if (!db) return;
    // Série nova: volta a aceitar sugestão até o usuário digitar algo.
    usuarioEditou.current = false;
    let cancelado = false;
    void (async () => {
      try {
        const suggestion = await autofillService.suggestNextSet(
          db,
          sessionExercise.exercise_id,
          nextSetNumber,
          sessionExercise.id,
        );
        if (cancelado || usuarioEditou.current || !suggestion.hasHistory) return;
        setWeight(formatNumber(suggestion.weight));
        setReps(formatNumber(suggestion.reps));
        setRir(suggestion.rir !== null ? String(suggestion.rir) : '');
      } catch {
        // Sugestão é conveniência: falhar aqui só significa começar do zero,
        // não vale interromper o registro do treino com uma mensagem.
      }
    })();
    return () => {
      cancelado = true;
    };
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
    } catch (error) {
      // Era um try/finally sem catch: a série não era salva, o botão voltava
      // ao normal e NADA aparecia. Quem perdesse a série por conflito entre
      // abas não tinha como saber, nem que era só recarregar.
      onError(mensagemDeErro(error));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (sets.length === 0) {
      // Sem séries pra apagar — só zera os inputs.
      setWeight('0');
      setReps('0');
      setRir('');
      setLastResult(null);
      return;
    }
    // Com séries: abre confirmação customizada (Alert.alert não funciona em PWA iOS).
    setShowResetConfirm(true);
  }

  async function confirmReset() {
    if (!db) return;
    try {
      await workoutEngine.resetSessionExerciseSets(db, sessionExercise.id);
      setWeight('0');
      setReps('0');
      setRir('');
      setLastResult(null);
      setShowResetConfirm(false);
      onSaved();
    } catch (error) {
      setShowResetConfirm(false);
      onError(mensagemDeErro(error));
      return;
    }
  }

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{sessionExercise.exercise_name}</Text>
      {(sessionExercise.target_sets || sessionExercise.target_reps) && (
        <Text style={styles.blockPlan}>
          {sessionExercise.target_sets ?? '?'}x {sessionExercise.target_reps ?? '?'}
          {sessionExercise.target_rest_seconds ? ` · descanso ${sessionExercise.target_rest_seconds}s` : ''}
        </Text>
      )}
      {sessionExercise.equipment ? (
        <Text style={styles.blockMeta}>{sessionExercise.equipment}</Text>
      ) : null}

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

      {/* Cronômetro de descanso (próprio do exercício) */}
      {restTimer.isActive && (
        <View style={styles.restBar}>
          <Text style={styles.restLabel}>Descanso</Text>
          <Text style={styles.restTime}>{restTimer.remaining}s</Text>
          <Pressable onPress={restTimer.cancel} hitSlop={8}>
            <Text style={styles.restSkip}>Pular</Text>
          </Pressable>
        </View>
      )}

      {allDone ? (
        <Text style={styles.allDoneText}>✓ Todas as {maxSets} séries concluídas</Text>
      ) : (
        <>
          {/* Inputs rápidos com steppers +/− */}
          <View style={styles.inputRow}>
            <StepperInput
              label="PESO"
              value={weight}
              onChange={(v) => {
                usuarioEditou.current = true;
                setWeight(v);
              }}
              suffix="kg"
              step={2.5}
              decimals={1}
              keyboardType="decimal-pad"
              flex={1.3}
            />
            <StepperInput
              label="REPS"
              value={reps}
              onChange={(v) => {
                usuarioEditou.current = true;
                setReps(v);
              }}
              step={1}
              decimals={0}
              keyboardType="number-pad"
              flex={1}
            />
            <StepperInput
              label="RIR"
              value={rir || '0'}
              onChange={(v) => {
                usuarioEditou.current = true;
                setRir(v);
              }}
              step={1}
              decimals={0}
              min={0}
              max={3}
              keyboardType="number-pad"
              flex={1}
            />
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.resetBtn, saving && styles.actionBtnDisabled]}
              onPress={handleReset}
              disabled={saving}
              hitSlop={8}
            >
              <Ionicons name="refresh" size={22} color={colors.text.secondary} />
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
        </>
      )}

      {lastResult ? (
        <Text style={styles.savedFeedback}>
          ✓ Série registrada
          {lastResult.brokenPRs.length > 0 ? `  🏆 PR: ${lastResult.brokenPRs.join(', ')}` : ''}
        </Text>
      ) : null}

      <ConfirmDialog
        visible={showResetConfirm}
        title="Apagar todas as séries?"
        message={`Isto vai remover as ${sets.length} séries já registradas deste exercício. Os inputs também serão zerados. Esta ação não pode ser desfeita.`}
        confirmText="Apagar tudo"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.base },
  center: { flex: 1, backgroundColor: colors.background.base, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { color: colors.accent.base, fontSize: typography.size['2xl'], fontWeight: '300' },
  titleWrap: { flex: 1, alignItems: 'center' },
  sessionName: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600', textAlign: 'center' },
  sessionStatus: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2, fontWeight: '500' },
  restBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomColor: colors.background.border,
    borderBottomWidth: 1,
  },
  restLabel: { color: colors.text.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  restTime: { color: colors.accent.base, fontSize: typography.size.xl, fontWeight: '700' },
  restSkip: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: '500' },
  block: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: 14,
  },
  blockTitle: { color: colors.text.primary, fontSize: 17, fontWeight: '600', marginBottom: spacing.md },
  blockPlan: { color: colors.accent.base, fontSize: 13, fontWeight: '500', marginTop: spacing.xs },
  blockMeta: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
  allDoneText: { color: colors.status.success, fontSize: typography.size.sm, fontWeight: '600', textAlign: 'center', paddingVertical: spacing.md },
  setsTable: { marginBottom: spacing.md },
  setRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderTopColor: colors.background.border,
    borderTopWidth: 1,
  },
  setNumber: { color: colors.accent.base, fontWeight: '700', width: 36 },
  setDetail: { color: colors.text.secondary, fontSize: typography.size.sm, flex: 1 },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  inputLabel: { color: colors.text.muted, fontSize: typography.size.xs, marginBottom: spacing.xs, fontWeight: '500' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
  },
  input: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600', paddingVertical: 10, flex: 1 },
  inputSuffix: { color: colors.text.muted, fontSize: typography.size.xs },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.accent.base,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.background.base, fontSize: typography.size.md, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  resetBtn: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedFeedback: { color: colors.status.success, fontSize: 13, marginTop: 10, textAlign: 'center', fontWeight: '500' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    backgroundColor: colors.background.base,
    borderTopColor: colors.background.border,
    borderTopWidth: 1,
  },
  completeBtn: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.accent.base,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.5 },
  completeBtnText: { color: colors.accent.base, fontSize: typography.size.md, fontWeight: '700' },
  backFooterBtn: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  backFooterBtnText: { color: colors.text.secondary, fontSize: typography.size.md, fontWeight: '600' },
});
