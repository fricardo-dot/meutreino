import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useDatabase } from '@/hooks/useDatabase';
import { exercisesRepository } from '@/repositories/exercises.repository';
import type { ExerciseRow, MuscleGroup } from '@/types/db';

/**
 * Filtros de grupo muscular disponíveis na barra superior.
 * O primeiro ("Todos") mostra todos os grupos.
 */
const FILTERS: Array<{ label: string; value: MuscleGroup | null }> = [
  { label: 'Todos', value: null },
  { label: 'Peito', value: 'peito' },
  { label: 'Costas', value: 'costas' },
  { label: 'Pernas', value: 'pernas' },
  { label: 'Ombros', value: 'ombros' },
  { label: 'Braços', value: 'braços' },
  { label: 'Core', value: 'core' },
];

/**
 * Tela "Exercícios" — banco de exercícios.
 *
 * - Buscar por nome.
 * - Filtrar por grupo muscular.
 * - Ver detalhes (equipamento, dificuldade, músculos secundários).
 * - Criar exercício personalizado.
 */
export default function ExerciciosScreen() {
  const { db, status } = useDatabase();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MuscleGroup | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExerciseRow | null>(null);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    setLoading(true);
    let list: ExerciseRow[];
    if (search.trim()) {
      list = await exercisesRepository.searchByName(db, search.trim());
    } else {
      list = await exercisesRepository.listActive(db, filter ? { muscleGroup: filter } : undefined);
    }
    setExercises(list);
    setLoading(false);
  }, [db, status, filter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleDeleteExercise(exercise: ExerciseRow) {
    setPendingDelete(exercise);
  }

  async function confirmDelete() {
    if (!db || !pendingDelete) return;
    const exercise = pendingDelete;
    setPendingDelete(null);
    await exercisesRepository.archive(db, exercise.id);
    void load();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercícios</Text>
        <Pressable style={styles.newButton} onPress={() => setCreating(true)}>
          <Text style={styles.newButtonText}>+ Novo</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar exercício..."
          placeholderTextColor="#6B6B76"
        />
      </View>

      <View style={styles.filtersWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <Pressable
                key={f.label}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.value)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#B4FF39" size="large" />
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ExerciseCard exercise={item} onDelete={() => handleDeleteExercise(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nenhum exercício</Text>
              <Text style={styles.emptyText}>
                {search ? 'Tente outra busca.' : 'Crie seu primeiro exercício com "+ Novo".'}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        />
      )}

      <CreateExerciseModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void load();
        }}
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Excluir exercício?"
        message={pendingDelete ? `"${pendingDelete.name}" será removido da sua lista. O histórico de treinos permanece.` : ''}
        confirmText="Excluir"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}

/**
 * Card expansível de um exercício — toca pra ver detalhes.
 */
function ExerciseCard({
  exercise,
  onDelete,
}: {
  exercise: ExerciseRow;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={styles.card}
      onPress={() => setExpanded((v) => !v)}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{exercise.name}</Text>
          <Text style={styles.cardMeta}>
            {exercise.muscle_group}
            {exercise.equipment ? ` · ${exercise.equipment}` : ''}
            {exercise.difficulty ? ` · ${exercise.difficulty}` : ''}
          </Text>
        </View>
        {exercise.is_custom === 1 ? (
          <View style={styles.customBadge}>
            <Text style={styles.customBadgeText}>seu</Text>
          </View>
        ) : null}
        <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteBtn}>
          <Text style={styles.deleteIcon}>🗑</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.details}>
          {exercise.secondary_muscles ? (
            <DetailRow label="Músculos secundários" value={exercise.secondary_muscles} />
          ) : null}
          {exercise.instructions ? (
            <DetailRow label="Como executar" value={exercise.instructions} />
          ) : null}
          {exercise.common_mistakes ? (
            <DetailRow label="Erros comuns" value={exercise.common_mistakes} />
          ) : null}
          {!exercise.secondary_muscles && !exercise.instructions && !exercise.common_mistakes ? (
            <Text style={styles.noDetails}>Sem detalhes cadastrados.</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/**
 * Modal para criar um exercício personalizado.
 */
function CreateExerciseModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { db } = useDatabase();
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('peito');
  const [equipment, setEquipment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reseta quando o modal fecha.
  useEffect(() => {
    if (!visible) {
      setName('');
      setMuscleGroup('peito');
      setEquipment('');
      setError(null);
    }
  }, [visible]);

  async function handleSave() {
    if (!db) return;
    if (!name.trim()) {
      setError('Digite um nome.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await exercisesRepository.create(db, {
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment: equipment.trim() || null,
      });
      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('idx_exercises_name_unique') || msg.toLowerCase().includes('unique')) {
        setError('Já existe um exercício ativo com esse nome.');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalScreen}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Novo exercício</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.modalClose}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.fieldLabel}>Nome</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Ex: Supino na máquina"
            placeholderTextColor="#6B6B76"
          />

          <Text style={styles.fieldLabel}>Grupo muscular</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
            {(['peito','costas','pernas','ombros','braços','core'] as MuscleGroup[]).map((g) => {
              const active = muscleGroup === g;
              return (
                <Pressable
                  key={g}
                  style={[styles.filterChip, active && styles.filterChipActive, { marginHorizontal: 4 }]}
                  onPress={() => setMuscleGroup(g)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Equipamento (opcional)</Text>
          <TextInput
            style={styles.fieldInput}
            value={equipment}
            onChangeText={setEquipment}
            placeholder="Ex: halteres, barra, máquina"
            placeholderTextColor="#6B6B76"
          />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}
        </ScrollView>

        <View style={styles.modalFooter}>
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar exercício'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
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
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchInput: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 16,
  },
  filtersWrap: { height: 48, justifyContent: 'center', marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#B4FF39',
    borderColor: '#B4FF39',
  },
  filterText: { color: '#A1A1AA', fontSize: 14, fontWeight: '500', lineHeight: 18, textAlign: 'center', includeFontPadding: false },
  filterTextActive: { color: '#0B0B0F', fontWeight: '700' },
  card: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { color: '#F5F5F7', fontSize: 17, fontWeight: '600' },
  cardMeta: { color: '#6B6B76', fontSize: 13, marginTop: 3 },
  customBadge: {
    backgroundColor: 'rgba(180, 255, 57, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  customBadgeText: { color: '#B4FF39', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  deleteBtn: { paddingLeft: 12, paddingVertical: 4 },
  deleteIcon: { fontSize: 16 },
  details: {
    marginTop: 12,
    paddingTop: 12,
    borderTopColor: '#2A2A35',
    borderTopWidth: 1,
  },
  detailLabel: { color: '#6B6B76', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  detailValue: { color: '#A1A1AA', fontSize: 14, lineHeight: 20 },
  noDetails: { color: '#6B6B76', fontSize: 13, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#A1A1AA', fontSize: 14, marginTop: 8, textAlign: 'center' },
  modalScreen: { flex: 1, backgroundColor: '#0B0B0F' },
  modalHeader: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { color: '#F5F5F7', fontSize: 22, fontWeight: '700' },
  modalClose: { color: '#A1A1AA', fontSize: 20 },
  fieldLabel: { color: '#6B6B76', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  fieldInput: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 16,
    marginBottom: 8,
  },
  errorText: { color: '#EF4444', fontSize: 14, marginTop: 8 },
  modalFooter: {
    padding: 16,
    paddingBottom: 32,
    borderTopColor: '#2A2A35',
    borderTopWidth: 1,
  },
  saveBtn: {
    backgroundColor: '#B4FF39',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#0B0B0F', fontSize: 16, fontWeight: '700' },
});
