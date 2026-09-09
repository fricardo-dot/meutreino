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

import { mensagemDeErro } from '@/types/errors.helpers';
import { LoadErrorView } from '@/components/LoadErrorView';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useDatabase } from '@/hooks/useDatabase';
import { exercisesRepository } from '@/repositories/exercises.repository';
import { colors, radius, spacing, typography } from '@/theme';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MuscleGroup | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExerciseRow | null>(null);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    try {
      setLoading(true);
      let list: ExerciseRow[];
      if (search.trim()) {
        list = await exercisesRepository.searchByName(db, search.trim());
      } else {
        list = await exercisesRepository.listActive(db, filter ? { muscleGroup: filter } : undefined);
      }
      setExercises(list);
    } catch (error) {
      setLoadError(mensagemDeErro(error));
    } finally {
      setLoading(false);
    }
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
          placeholderTextColor={colors.text.muted}
        />
      </View>

      <View style={styles.filtersWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, alignItems: 'center' }}
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
          <ActivityIndicator color={colors.accent.base} size="large" />
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
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'] }}
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
    <View style={{ marginTop: spacing.sm }}>
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

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
          <Text style={styles.fieldLabel}>Nome</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Ex: Supino na máquina"
            placeholderTextColor={colors.text.muted}
          />

          <Text style={styles.fieldLabel}>Grupo muscular</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
            {(['peito','costas','pernas','ombros','braços','core'] as MuscleGroup[]).map((g) => {
              const active = muscleGroup === g;
              return (
                <Pressable
                  key={g}
                  style={[styles.filterChip, active && styles.filterChipActive, { marginHorizontal: spacing.xs }]}
                  onPress={() => setMuscleGroup(g)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Equipamento (opcional)</Text>
          <TextInput
            style={styles.fieldInput}
            value={equipment}
            onChangeText={setEquipment}
            placeholder="Ex: halteres, barra, máquina"
            placeholderTextColor={colors.text.muted}
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
  screen: { flex: 1, backgroundColor: colors.background.base },
  center: { flex: 1, backgroundColor: colors.background.base, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: spacing['5xl'],
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.text.primary, fontSize: typography.size['2xl'], fontWeight: '700' },
  newButton: {
    backgroundColor: colors.accent.base,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  newButtonText: { color: colors.background.base, fontSize: typography.size.sm, fontWeight: '700' },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  searchInput: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.md,
  },
  filtersWrap: { height: 48, justifyContent: 'center', marginBottom: spacing.sm },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.accent.base,
    borderColor: colors.accent.base,
  },
  filterText: { color: colors.text.secondary, fontSize: typography.size.sm, fontWeight: '500', lineHeight: 18, textAlign: 'center', includeFontPadding: false },
  filterTextActive: { color: colors.background.base, fontWeight: '700' },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { color: colors.text.primary, fontSize: 17, fontWeight: '600' },
  cardMeta: { color: colors.text.muted, fontSize: 13, marginTop: 3 },
  customBadge: {
    backgroundColor: colors.accent.soft,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  customBadgeText: { color: colors.accent.base, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  deleteBtn: { paddingLeft: spacing.md, paddingVertical: spacing.xs },
  deleteIcon: { fontSize: typography.size.md },
  details: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopColor: colors.background.border,
    borderTopWidth: 1,
  },
  detailLabel: { color: colors.text.muted, fontSize: typography.size.xs, fontWeight: '600', marginBottom: 2 },
  detailValue: { color: colors.text.secondary, fontSize: typography.size.sm, lineHeight: 20 },
  noDetails: { color: colors.text.muted, fontSize: 13, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: spacing['5xl'], paddingHorizontal: spacing['3xl'] },
  emptyTitle: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.sm, textAlign: 'center' },
  modalScreen: { flex: 1, backgroundColor: colors.background.base },
  modalHeader: {
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: '700' },
  modalClose: { color: colors.text.secondary, fontSize: 20 },
  fieldLabel: { color: colors.text.muted, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  fieldInput: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.md,
    marginBottom: spacing.sm,
  },
  errorText: { color: colors.status.danger, fontSize: typography.size.sm, marginTop: spacing.sm },
  modalFooter: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    borderTopColor: colors.background.border,
    borderTopWidth: 1,
  },
  saveBtn: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.background.base, fontSize: typography.size.md, fontWeight: '700' },
});
