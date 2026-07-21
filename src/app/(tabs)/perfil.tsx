import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useDatabase } from '@/hooks/useDatabase';
import { bodyWeightRepository } from '@/repositories/body-weight.repository';
import { userProfileRepository } from '@/repositories/user-profile.repository';
import { statsService, type GeneralStats, type MuscleGroupVolume } from '@/services/stats.service';
import type { BodyWeightEntryRow, UserProfileRow } from '@/types/db';

/**
 * Tela Perfil — painel do usuário.
 *
 * Seções:
 *  1. Cabeçalho com nome + peso atual + IMC
 *  2. Cards grandes de estatísticas gerais
 *  3. Volume por grupo muscular
 *  4. Recordes pessoais vigentes
 *  5. Pesagem rápida (registrar peso de hoje)
 */
export default function PerfilScreen() {
  const { db, status } = useDatabase();
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [latestWeight, setLatestWeight] = useState<BodyWeightEntryRow | null>(null);
  const [stats, setStats] = useState<GeneralStats | null>(null);
  const [muscleVolume, setMuscleVolume] = useState<MuscleGroupVolume[]>([]);
  const [prs, setPrs] = useState<Array<{ exercise_name: string; pr_type: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [weighing, setWeighing] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    const [p, w, s, mv] = await Promise.all([
      userProfileRepository.getOrCreate(db),
      bodyWeightRepository.getLatest(db),
      statsService.getGeneralStats(db),
      statsService.getVolumeByMuscleGroup(db),
    ]);
    setProfile(p);
    setLatestWeight(w);
    setStats(s);
    setMuscleVolume(mv);

    // PRs vigentes: busca todos os is_current=1 com nome do exercício.
    const prRows = await db.getAllAsync<{ exercise_name: string; pr_type: string; value: number }>(
      `SELECT e.name AS exercise_name, pr.pr_type, pr.value
       FROM personal_records pr
       JOIN exercises e ON e.id = pr.exercise_id
       WHERE pr.is_current = 1
       ORDER BY e.name, pr.pr_type;`,
    );
    setPrs(prRows);
    setLoading(false);
  }, [db, status]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#B4FF39" size="large" />
      </View>
    );
  }

  const imc = computeIMC(latestWeight?.weight_kg ?? null, profile?.height_cm ?? null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingTop: 48, paddingBottom: 48 }}>
      {/* Cabeçalho */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Olá,</Text>
          <Text style={styles.name}>{profile?.name || 'Atleta'}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => setEditingProfile(true)}>
            <Ionicons name="settings-outline" size={20} color="#A1A1AA" />
          </Pressable>
          <Pressable style={styles.weighBtn} onPress={() => setWeighing(true)}>
            <Text style={styles.weighBtnText}>+ Pesagem</Text>
          </Pressable>
        </View>
      </View>

      {/* Cards de peso/IMC/alvo */}
      <View style={styles.bioRow}>
        <BioCard label="Peso atual" value={latestWeight ? `${latestWeight.weight_kg} kg` : '—'} />
        <BioCard label="IMC" value={imc !== null ? imc.toFixed(1) : '—'} subtitle={imcLabel(imc)} />
        <BioCard label="Altura" value={profile?.height_cm ? `${profile.height_cm}` : '—'} subtitle="cm" />
      </View>
      {profile?.target_weight_kg && latestWeight ? (
        <Text style={styles.targetHint}>
          🎯 Alvo: {profile.target_weight_kg} kg ·{' '}
          {latestWeight.weight_kg > profile.target_weight_kg ? 'faltam' : 'excedem'}{' '}
          {Math.abs(latestWeight.weight_kg - profile.target_weight_kg).toFixed(1)} kg
        </Text>
      ) : null}

      {/* Estatísticas gerais — cards grandes */}
      <SectionTitle>Estatísticas</SectionTitle>
      <View style={styles.statsGrid}>
        <StatCard big value={String(stats?.totalSessions ?? 0)} label="treinos" />
        <StatCard big value={String(stats?.totalSets ?? 0)} label="séries" />
        <StatCard big value={formatVolume(stats?.totalVolumeKg ?? 0)} label="volume total" />
        <StatCard big value={formatDuration(stats?.totalDurationSeconds ?? 0)} label="tempo treinado" />
        <StatCard big value={String(stats?.sessionsLast7Days ?? 0)} label="treinos / 7 dias" />
      </View>

      {/* Volume por grupo muscular */}
      {muscleVolume.length > 0 ? (
        <>
          <SectionTitle>Volume por grupo</SectionTitle>
          <View style={styles.card}>
            {muscleVolume.map((mv, idx) => (
              <View key={mv.muscle_group} style={[styles.muscleRow, idx > 0 && styles.muscleRowBorder]}>
                <Text style={styles.muscleName}>{capitalize(mv.muscle_group)}</Text>
                <Text style={styles.muscleStats}>
                  {mv.total_sets} séries · {formatVolume(mv.total_volume)} kg
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Recordes pessoais */}
      {prs.length > 0 ? (
        <>
          <SectionTitle>Recordes pessoais</SectionTitle>
          <View style={styles.card}>
            {prs.map((pr, idx) => (
              <View key={`${pr.exercise_name}-${pr.pr_type}`} style={[styles.muscleRow, idx > 0 && styles.muscleRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                  <Text style={styles.prType}>{prLabel(pr.pr_type)}</Text>
                </View>
                <Text style={styles.prValue}>{formatPR(pr.pr_type, pr.value)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Pesagem modal */}
      <WeighModal
        visible={weighing}
        currentWeight={latestWeight?.weight_kg?.toString() ?? ''}
        onClose={() => setWeighing(false)}
        onSave={async (weight) => {
          if (!db) return;
          const today = new Date();
          const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          await bodyWeightRepository.upsert(db, { weight_kg: weight, date: dateISO });
          setWeighing(false);
          void load();
        }}
      />

      {/* Modal de edição de perfil (nome, altura, alvo) */}
      <ProfileEditModal
        visible={editingProfile}
        profile={profile}
        onClose={() => setEditingProfile(false)}
        onSave={async (input) => {
          if (!db) return;
          await userProfileRepository.update(db, input);
          setEditingProfile(false);
          void load();
        }}
      />
    </ScrollView>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function BioCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <View style={styles.bioCard}>
      <Text style={styles.bioLabel}>{label}</Text>
      <View style={styles.bioValueRow}>
        <Text style={styles.bioValue}>{value}</Text>
        {subtitle ? <Text style={styles.bioSubtitle}> {subtitle}</Text> : null}
      </View>
    </View>
  );
}

function StatCard({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, big && styles.statValueBig]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function WeighModal({
  visible,
  currentWeight,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentWeight: string;
  onClose: () => void;
  onSave: (weight: number) => void;
}) {
  const [weight, setWeight] = useState(currentWeight);
  useEffect(() => { if (visible) setWeight(currentWeight); }, [visible, currentWeight]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Registrar pesagem</Text>
          <Text style={styles.modalSubtitle}>Qual seu peso hoje?</Text>
          <TextInput
            style={styles.modalInput}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
          />
          <Pressable
            style={styles.modalSaveBtn}
            onPress={() => {
              const w = parseFloat(weight.replace(',', '.'));
              if (Number.isFinite(w) && w > 0) onSave(w);
            }}
          >
            <Text style={styles.modalSaveBtnText}>Salvar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Modal de edição dos dados pessoais (nome, altura, peso-alvo).
 */
function ProfileEditModal({
  visible,
  profile,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: UserProfileRow | null;
  onClose: () => void;
  onSave: (input: { name?: string | null; height_cm?: number | null; target_weight_kg?: number | null }) => void;
}) {
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (visible && profile) {
      setName(profile.name ?? '');
      setHeight(profile.height_cm ? String(profile.height_cm) : '');
      setTarget(profile.target_weight_kg ? String(profile.target_weight_kg) : '');
    }
  }, [visible, profile]);

  function handleSave() {
    onSave({
      name: name.trim() || null,
      height_cm: height ? parseFloat(height.replace(',', '.')) : null,
      target_weight_kg: target ? parseFloat(target.replace(',', '.')) : null,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Meus dados</Text>
          <Text style={styles.modalSubtitle}>Usados pra calcular IMC e acompanhar evolução</Text>

          <Text style={styles.fieldLabel}>Nome</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Seu nome"
            placeholderTextColor="#6B6B76"
          />

          <Text style={styles.fieldLabel}>Altura (cm)</Text>
          <TextInput
            style={styles.fieldInput}
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
            placeholder="Ex: 178"
            placeholderTextColor="#6B6B76"
          />

          <Text style={styles.fieldLabel}>Peso-alvo (kg)</Text>
          <TextInput
            style={styles.fieldInput}
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            placeholder="Ex: 80"
            placeholderTextColor="#6B6B76"
          />

          <Pressable style={styles.modalSaveBtn} onPress={handleSave}>
            <Text style={styles.modalSaveBtnText}>Salvar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeIMC(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

function imcLabel(imc: number | null): string {
  if (imc === null) return '';
  if (imc < 18.5) return 'abaixo';
  if (imc < 25) return 'saudável';
  if (imc < 30) return 'sobrepeso';
  return 'obesidade';
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}min`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prLabel(type: string): string {
  switch (type) {
    case 'max_weight': return 'Maior carga';
    case 'max_reps': return 'Mais repetições';
    case 'estimated_1rm': return '1RM estimado';
    case 'max_volume': return 'Maior volume';
    default: return type;
  }
}

function formatPR(type: string, value: number): string {
  if (type === 'max_reps') return `${value}`;
  return `${value} kg`;
}

// ── Estilos ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hello: { color: '#A1A1AA', fontSize: 14 },
  name: { color: '#F5F5F7', fontSize: 26, fontWeight: '700' },
  weighBtn: {
    backgroundColor: '#B4FF39',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  weighBtnText: { color: '#0B0B0F', fontWeight: '700', fontSize: 14 },
  bioRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bioCard: {
    flex: 1,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 14,
  },
  bioLabel: { color: '#6B6B76', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  bioValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  bioValue: { color: '#F5F5F7', fontSize: 20, fontWeight: '700' },
  bioSubtitle: { color: '#6B6B76', fontSize: 12 },
  targetHint: { color: '#B4FF39', fontSize: 13, marginTop: 8, marginBottom: 16, fontWeight: '500' },
  sectionTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
  },
  statValue: { color: '#B4FF39', fontSize: 22, fontWeight: '700' },
  statValueBig: { fontSize: 32 },
  statLabel: { color: '#A1A1AA', fontSize: 13, marginTop: 4 },
  card: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
  },
  muscleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  muscleRowBorder: { borderTopColor: '#2A2A35', borderTopWidth: 1 },
  muscleName: { color: '#F5F5F7', fontSize: 15, fontWeight: '600' },
  muscleStats: { color: '#A1A1AA', fontSize: 13 },
  prExercise: { color: '#F5F5F7', fontSize: 14, fontWeight: '600' },
  prType: { color: '#6B6B76', fontSize: 12, marginTop: 2 },
  prValue: { color: '#B4FF39', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#15151C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: '#2A2A35',
  },
  modalTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '700' },
  modalSubtitle: { color: '#A1A1AA', fontSize: 14, marginTop: 4, marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#F5F5F7',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  fieldLabel: { color: '#6B6B76', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  fieldInput: {
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 16,
  },
  modalSaveBtn: {
    backgroundColor: '#B4FF39',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  modalSaveBtnText: { color: '#0B0B0F', fontSize: 16, fontWeight: '700' },
});
