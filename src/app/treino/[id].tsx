import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useDatabase } from '@/hooks/useDatabase';
import { exercisesRepository } from '@/repositories/exercises.repository';
import { sessionsRepository } from '@/repositories/sessions.repository';
import { workoutExercisesRepository, type WorkoutExerciseWithExercise } from '@/repositories/workout-exercises.repository';
import type { ExerciseRow, WorkoutRow } from '@/types/db';
import { workoutsRepository } from '@/repositories/workouts.repository';

/**
 * Editor de ficha de treino.
 *
 * - Edita nome da ficha.
 * - Lista os exercícios da ficha com séries/reps.
 * - Adiciona exercícios via modal de seleção.
 * - Botão "Iniciar treino" → cria sessão (snapshot) e abre registrar/[sessionId].
 */
export default function TreinoDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const { db, status } = useDatabase();

  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [items, setItems] = useState<WorkoutExerciseWithExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameDraft, setNameDraft] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db || Number.isNaN(workoutId)) return;
    const [w, list] = await Promise.all([
      workoutsRepository.getById(db, workoutId),
      workoutExercisesRepository.listByWorkout(db, workoutId),
    ]);
    setWorkout(w);
    setNameDraft(w?.name ?? '');
    setItems(list);
    setLoading(false);
  }, [db, status, workoutId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName() {
    if (!db || !workout) return;
    if (nameDraft.trim() && nameDraft !== workout.name) {
      await workoutsRepository.update(db, workout.id, { name: nameDraft.trim() });
    }
  }

  async function handleAddExercise(exerciseId: number) {
    if (!db || !workout) return;
    await workoutExercisesRepository.add(db, {
      workout_id: workout.id,
      exercise_id: exerciseId,
      target_sets: 3,
      target_reps: '8-12',
      target_rest_seconds: 90,
    });
    setPickerVisible(false);
    void load();
  }

  async function handleRemove(itemId: number) {
    if (!db) return;
    await workoutExercisesRepository.remove(db, itemId);
    void load();
  }

  async function handleStart() {
    if (!db || !workout) return;
    setStarting(true);
    try {
      const sessionId = await sessionsRepository.startSession(db, workout.id);
      router.replace(`/registrar/${sessionId}`);
    } catch (e) {
      Alert.alert(
        'Não foi possível iniciar',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setStarting(false);
    }
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Voltar</Text>
        </Pressable>
      </View>

      <View style={styles.titleWrap}>
        <TextInput
          style={styles.titleInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onBlur={saveName}
          placeholder="Nome do treino"
          placeholderTextColor="#6B6B76"
        />
        {workout?.division ? (
          <Text style={styles.division}>{workout.division}</Text>
        ) : null}
      </View>

      {/* Ordem no ciclo de treinos */}
      <View style={styles.cycleWrap}>
        <Text style={styles.cycleLabel}>ORDEM NO CICLO</Text>
        <Text style={styles.cycleValue}>
          {workout?.cycle_order
            ? `Posição ${workout.cycle_order} — este é o ${ordinal(workout.cycle_order)} treino do ciclo`
            : 'Fora do ciclo (não é sugerido automaticamente)'}
        </Text>
        <Pressable
          style={styles.cycleToggleBtn}
          onPress={async () => {
            if (!db || !workout) return;
            if (workout.cycle_order !== null) {
              await workoutsRepository.updateCycleOrder(db, workout.id, null);
              void load();
            } else {
              const all = await workoutsRepository.listActive(db);
              const max = all.reduce(
                (acc, w) => (w.cycle_order && w.cycle_order > acc ? w.cycle_order : acc),
                0,
              );
              await workoutsRepository.updateCycleOrder(db, workout.id, max + 1);
              void load();
            }
          }}
        >
          <Text style={styles.cycleToggleText}>
            {workout?.cycle_order ? 'Remover do ciclo' : 'Adicionar ao ciclo'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.exercise_name}</Text>
              <Text style={styles.cardMeta}>
                {item.muscle_group} · {item.equipment ?? '—'}
              </Text>
              <Text style={styles.cardPlan}>
                {item.target_sets}x {item.target_reps}
                {item.target_rest_seconds ? ` · descanso ${item.target_rest_seconds}s` : ''}
              </Text>
            </View>
            <Pressable onPress={() => handleRemove(item.id)} hitSlop={8}>
              <Text style={styles.removeBtn}>✕</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ficha vazia</Text>
            <Text style={styles.emptyText}>
              Adicione exercícios com o botão abaixo.
            </Text>
          </View>
        }
        ListFooterComponent={
          <Pressable style={styles.addBtn} onPress={() => setPickerVisible(true)}>
            <Text style={styles.addBtnText}>+ Adicionar exercício</Text>
          </Pressable>
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      />

      <View style={styles.footer}>
        <Pressable
          style={[styles.startBtn, items.length === 0 && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={items.length === 0 || starting}
        >
          <Text style={styles.startBtnText}>
            {starting ? 'Iniciando...' : 'Iniciar treino'}
          </Text>
        </Pressable>
      </View>

      <ExercisePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPick={handleAddExercise}
      />
    </View>
  );
}

/**
 * Modal simples para escolher um exercício do banco.
 */
function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exerciseId: number) => void;
}) {
  const { db, status } = useDatabase();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!visible || status !== 'ready' || !db) return;
    void (async () => {
      const list = filter
        ? await exercisesRepository.searchByName(db, filter)
        : await exercisesRepository.listActive(db);
      setExercises(list);
    })();
  }, [visible, db, status, filter]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.pickerScreen}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Escolha um exercício</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.pickerClose}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.searchInput}
          value={filter}
          onChangeText={setFilter}
          placeholder="Buscar exercício..."
          placeholderTextColor="#6B6B76"
        />
        <FlatList
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Pressable
              style={styles.pickerItem}
              onPress={() => onPick(item.id)}
            >
              <Text style={styles.pickerItemName}>{item.name}</Text>
              <Text style={styles.pickerItemMeta}>
                {item.muscle_group} · {item.equipment ?? '—'}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 8 },
  back: { color: '#B4FF39', fontSize: 16, fontWeight: '600' },
  titleWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  titleInput: {
    color: '#F5F5F7',
    fontSize: 24,
    fontWeight: '700',
    padding: 0,
  },
  division: { color: '#A1A1AA', fontSize: 14, marginTop: 2 },
  card: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: { color: '#F5F5F7', fontSize: 16, fontWeight: '600' },
  cardMeta: { color: '#6B6B76', fontSize: 13, marginTop: 2 },
  cardPlan: { color: '#B4FF39', fontSize: 14, marginTop: 6, fontWeight: '500' },
  removeBtn: { color: '#EF4444', fontSize: 18, paddingLeft: 12 },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#A1A1AA', fontSize: 14, marginTop: 8, textAlign: 'center' },
  addBtn: {
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnText: { color: '#B4FF39', fontSize: 15, fontWeight: '600' },
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
  startBtn: {
    backgroundColor: '#B4FF39',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: '#0B0B0F', fontSize: 16, fontWeight: '700' },
  cycleWrap: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cycleLabel: {
    color: '#6B6B76',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cycleValue: { color: '#F5F5F7', fontSize: 14, lineHeight: 20 },
  cycleToggleBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: '#B4FF39',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cycleToggleText: { color: '#B4FF39', fontSize: 13, fontWeight: '600' },
  pickerScreen: { flex: 1, backgroundColor: '#0B0B0F' },
  pickerHeader: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerTitle: { color: '#F5F5F7', fontSize: 20, fontWeight: '700' },
  pickerClose: { color: '#A1A1AA', fontSize: 20 },
  searchInput: {
    margin: 16,
    marginTop: 8,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 16,
  },
  pickerItem: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  pickerItemName: { color: '#F5F5F7', fontSize: 16, fontWeight: '500' },
  pickerItemMeta: { color: '#6B6B76', fontSize: 13, marginTop: 2 },
});

/** 1 → "1º", 2 → "2º", 3 → "3º"... */
function ordinal(n: number): string {
  return `${n}º`;
}
