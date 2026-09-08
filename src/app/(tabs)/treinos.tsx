import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useDatabase } from '@/hooks/useDatabase';
import { workoutsRepository } from '@/repositories/workouts.repository';
import { colors } from '@/theme';
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
  const [deleting, setDeleting] = useState<WorkoutRow | null>(null);

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

  async function handleMove(index: number, direction: -1 | 1) {
    if (!db) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= workouts.length) return;
    const a = workouts[index];
    const b = workouts[targetIndex];
    if (a.cycle_order === null || b.cycle_order === null) return;
    // Troca os cycle_order entre a e b.
    await workoutsRepository.updateCycleOrder(db, a.id, b.cycle_order);
    await workoutsRepository.updateCycleOrder(db, b.id, a.cycle_order);
    void load();
  }

  async function handleDelete(workout: WorkoutRow) {
    if (!db) return;
    setDeleting(workout);
  }

  async function confirmDelete() {
    if (!db || !deleting) return;
    await workoutsRepository.archive(db, deleting.id);
    setDeleting(null);
    void load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent.base} size="large" />
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
        renderItem={({ item, index }) => {
          const inCycle = item.cycle_order !== null;
          const canMoveUp = inCycle && index > 0 && workouts[index - 1].cycle_order !== null;
          const canMoveDown = inCycle && index < workouts.length - 1 && workouts[index + 1].cycle_order !== null;
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/treino/${item.id}`)}
            >
              <View style={styles.cardRow}>
                {inCycle ? (
                  <View style={styles.cycleBadge}>
                    <Text style={styles.cycleBadgeText}>{item.cycle_order}</Text>
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.division ? <Text style={styles.cardSub}>{item.division}</Text> : null}
                </View>
                {inCycle ? (
                  <View style={styles.moveBtns}>
                    <Pressable
                      style={[styles.moveBtn, !canMoveUp && styles.moveBtnDisabled]}
                      onPress={() => handleMove(index, -1)}
                      disabled={!canMoveUp}
                      hitSlop={4}
                    >
                      <Text style={styles.moveIcon}>↑</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.moveBtn, !canMoveDown && styles.moveBtnDisabled]}
                      onPress={() => handleMove(index, 1)}
                      disabled={!canMoveDown}
                      hitSlop={4}
                    >
                      <Text style={styles.moveIcon}>↓</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item)}
                  hitSlop={8}
                >
                  <Text style={styles.deleteIcon}>🗑</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
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

      <ConfirmDialog
        visible={deleting !== null}
        title="Excluir treino?"
        message={`"${deleting?.name ?? ''}" será removido da sua lista. O histórico de sessões já realizadas permanece.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.base },
  center: { flex: 1, backgroundColor: colors.background.base, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.text.primary, fontSize: 28, fontWeight: '700' },
  newButton: {
    backgroundColor: colors.accent.base,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  newButtonText: { color: colors.background.base, fontSize: 14, fontWeight: '700' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  deleteBtn: {
    paddingLeft: 12,
    paddingVertical: 4,
  },
  deleteIcon: { fontSize: 16 },
  cycleBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cycleBadgeText: { color: colors.accent.base, fontSize: 14, fontWeight: '700' },
  moveBtns: { flexDirection: 'row', gap: 4 },
  moveBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveBtnDisabled: { opacity: 0.3 },
  moveIcon: { color: colors.accent.base, fontSize: 16, fontWeight: '700' },
  cardTitle: { color: colors.text.primary, fontSize: 18, fontWeight: '600' },
  cardSub: { color: colors.text.secondary, fontSize: 14, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text.primary, fontSize: 18, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: 14, marginTop: 8, textAlign: 'center' },
});
