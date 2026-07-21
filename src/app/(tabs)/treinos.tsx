import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useDatabase } from '@/hooks/useDatabase';
import { workoutsRepository } from '@/repositories/workouts.repository';
import type { WorkoutRow } from '@/types/db';

/**
 * Tela "Meus Treinos" — lista as fichas ativas.
 *
 * - Toque numa ficha → abre o editor (/treino/[id]).
 * - Botão "Novo treino" → cria uma ficha vazia e abre o editor.
 */
export default function TreinosScreen() {
  const { db, status } = useDatabase();
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    const list = await workoutsRepository.listActive(db);
    setWorkouts(list);
    setLoading(false);
  }, [db, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleNewWorkout() {
    if (!db) return;
    setCreating(true);
    try {
      const id = await workoutsRepository.create(db, {
        name: 'Novo treino',
        division: null,
        notes: null,
      });
      router.push(`/treino/${id}`);
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(workout: WorkoutRow) {
    Alert.alert(
      'Excluir treino?',
      `"${workout.name}" será removido da sua lista. O histórico de sessões já realizadas permanece.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            if (!db) return;
            await workoutsRepository.archive(db, workout.id);
            void load();
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
      <View style={styles.header}>
        <Text style={styles.title}>Meus Treinos</Text>
        <Pressable style={styles.newButton} onPress={handleNewWorkout} disabled={creating}>
          <Text style={styles.newButtonText}>{creating ? '...' : '+ Novo'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={workouts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/treino/${item.id}`)}
          >
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.division ? <Text style={styles.cardSub}>{item.division}</Text> : null}
              </View>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
                hitSlop={8}
              >
                <Text style={styles.deleteIcon}>🗑</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nenhuma ficha ainda</Text>
            <Text style={styles.emptyText}>
              Toque em "+ Novo" para criar seu primeiro treino.
            </Text>
          </View>
        }
        contentContainerStyle={{ padding: 16, paddingTop: 48 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#F5F5F7', fontSize: 28, fontWeight: '700' },
  newButton: {
    backgroundColor: '#B4FF39',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  newButtonText: { color: '#0B0B0F', fontSize: 14, fontWeight: '700' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  deleteBtn: {
    paddingLeft: 12,
    paddingVertical: 4,
  },
  deleteIcon: { fontSize: 16 },
  cardTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '600' },
  cardSub: { color: '#A1A1AA', fontSize: 14, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#A1A1AA', fontSize: 14, marginTop: 8, textAlign: 'center' },
});
