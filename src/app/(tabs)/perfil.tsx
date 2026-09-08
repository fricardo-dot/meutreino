import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { WeightChart } from '@/components/WeightChart';
import { useDatabase } from '@/hooks/useDatabase';
import { bodyWeightRepository } from '@/repositories/body-weight.repository';
import { userProfileRepository } from '@/repositories/user-profile.repository';
import { backupService } from '@/services/backup.service';
import { calendarService } from '@/services/calendar.service';
import { generateWeeklyReport } from '@/services/report.service';
import { statsService, type GeneralStats, type MuscleGroupVolume } from '@/services/stats.service';
import { colors, radius, spacing, typography } from '@/theme';
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
  const [editingProfile, setEditingProfile] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [weightHistory, setWeightHistory] = useState<BodyWeightEntryRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importData, setImportData] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [importSummaryMsg, setImportSummaryMsg] = useState<string | null>(null);

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

    // Histórico de peso (últimos 30) para o gráfico de evolução.
    const wh = await bodyWeightRepository.listHistory(db, 30);
    setWeightHistory(wh);

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

  async function handleExport() {
    if (!db) return;
    if (Platform.OS !== 'web') {
      setErrorMsg('Exportação disponível apenas na versão web por enquanto.');
      return;
    }
    try {
      const json = await backupService.exportData(db);
      // Create a blob and download it (works on web)
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meutreino-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMsg(`Erro ao exportar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleGenerateReport() {
    if (!db) return;
    setGeneratingReport(true);
    try {
      const weekStart = calendarService.getWeekStart(new Date());
      const markdown = await generateWeeklyReport(db, weekStart, 1);

      if (Platform.OS === 'web') {
        // Na web: copia pra área de transferência + baixa arquivo.
        try {
          await navigator.clipboard.writeText(markdown);
        } catch {
          // Clipboard pode falhar sem HTTPS — ignora.
        }
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = new Date().toISOString().slice(0, 10);
        a.download = `meutreino-relatorio-${today}.md`;
        a.click();
        URL.revokeObjectURL(url);
        setErrorMsg('Relatório gerado! Arquivo baixado e copiado pra área de transferência.');
      } else {
        setErrorMsg('Relatório disponível apenas na versão web por enquanto.');
      }
    } catch (error) {
      setErrorMsg(`Erro ao gerar relatório: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setGeneratingReport(false);
    }
  }

  function handleImportClick() {
    if (Platform.OS !== 'web') {
      setErrorMsg('Importação disponível apenas na versão web por enquanto.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      setImportData(text);
      setShowImportConfirm(true);
    };
    input.click();
  }

  async function confirmImport() {
    if (!db || !importData) return;
    setShowImportConfirm(false);
    try {
      const summary = await backupService.importData(db, importData);
      const total = Object.values(summary).reduce((acc, n) => acc + (n ?? 0), 0);
      setImportData(null);
      setImportSummaryMsg(`Importação concluída: ${total} registro(s) restaurado(s).`);
      void load();
    } catch (error) {
      setImportData(null);
      setErrorMsg(`Erro ao importar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function confirmReset() {
    if (!db) return;
    setShowResetConfirm(false);
    await db.execAsync(`
      DELETE FROM personal_records;
      DELETE FROM session_sets;
      DELETE FROM session_exercises;
      DELETE FROM sessions;
    `);
    void load();
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent.base} size="large" />
      </View>
    );
  }

  const imc = computeIMC(latestWeight?.weight_kg ?? null, profile?.height_cm ?? null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing['5xl'], paddingBottom: spacing['5xl'] }}>
      {/* Cabeçalho */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Olá,</Text>
          <Text style={styles.name}>{profile?.name || 'Atleta'}</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => setEditingProfile(true)}>
          <Ionicons name="settings-outline" size={22} color={colors.text.secondary} />
        </Pressable>
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

      {/* Gráfico de evolução do peso */}
      <SectionTitle>Evolução do peso</SectionTitle>
      <View style={styles.chartCard}>
        <WeightChart
          entries={weightHistory.map((e) => ({ date: e.date, weight_kg: e.weight_kg }))}
          targetWeight={profile?.target_weight_kg}
        />
      </View>

      {/* Estatísticas gerais — cards grandes */}
      <SectionTitle>Estatísticas</SectionTitle>
      <View style={styles.statsGrid}>
        <StatCard big value={String(stats?.totalSessions ?? 0)} label="treinos" />
        <StatCard big value={String(stats?.totalSets ?? 0)} label="séries" />
        <StatCard big value={formatVolume(stats?.totalVolumeKg ?? 0)} label="volume total" />
        <StatCard big value={formatDuration(stats?.totalDurationSeconds ?? 0)} label="tempo treinado" />
        <StatCard big value={String(stats?.sessionsLast7Days ?? 0)} label="treinos / 7 dias" />
      </View>

      {/* Botão resetar estatísticas */}
      {(stats?.totalSessions ?? 0) > 0 ? (
        <Pressable
          style={styles.resetBtn}
          onPress={() => setShowResetConfirm(true)}
        >
          <Text style={styles.resetBtnText}>Resetar estatísticas</Text>
        </Pressable>
      ) : null}

      <ConfirmDialog
        visible={showResetConfirm}
        title="Resetar estatísticas?"
        message="Apaga TODAS as sessões, séries e recordes. Seus treinos (fichas) e exercícios NÃO são afetados. Esta ação não pode ser desfeita."
        confirmText="Resetar tudo"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />

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

      {/* Relatório da semana em Markdown */}
      <SectionTitle>Relatório da semana</SectionTitle>
      <Text style={styles.reportHint}>
        Gera um resumo dos treinos da semana em texto formatado (Markdown)
        pra você enviar à sua IA e receber feedback.
      </Text>
      <Pressable
        style={[styles.exportBtn, generatingReport && { opacity: 0.5 }]}
        onPress={handleGenerateReport}
        disabled={generatingReport}
      >
        <Text style={styles.exportBtnText}>
          {generatingReport ? 'Gerando...' : '📋 Gerar relatório'}
        </Text>
      </Pressable>

      {/* Backup dos dados */}
      <SectionTitle>Backup dos dados</SectionTitle>
      <View style={styles.backupRow}>
        <Pressable style={styles.exportBtn} onPress={handleExport}>
          <Text style={styles.exportBtnText}>Exportar</Text>
        </Pressable>
        <Pressable style={styles.importBtn} onPress={handleImportClick}>
          <Text style={styles.importBtnText}>Importar</Text>
        </Pressable>
      </View>

      {/* Dialogs de erro / importação */}
      <ConfirmDialog
        visible={errorMsg !== null}
        title="Aviso"
        message={errorMsg ?? ''}
        confirmText="OK"
        cancelText="Cancelar"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
      <ConfirmDialog
        visible={showImportConfirm}
        title="Importar backup?"
        message="Substituirá todos os dados atuais."
        confirmText="Importar"
        cancelText="Cancelar"
        destructive
        onConfirm={confirmImport}
        onCancel={() => {
          setShowImportConfirm(false);
          setImportData(null);
        }}
      />
      <ConfirmDialog
        visible={importSummaryMsg !== null}
        title="Backup importado"
        message={importSummaryMsg ?? ''}
        confirmText="OK"
        cancelText="Fechar"
        onConfirm={() => setImportSummaryMsg(null)}
        onCancel={() => setImportSummaryMsg(null)}
      />

      {/* Pesagem modal */}
      {/* Modal unificado: nome, altura, alvo, pesagem de hoje */}
      <ProfileEditModal
        visible={editingProfile}
        profile={profile}
        latestWeight={latestWeight}
        onClose={() => setEditingProfile(false)}
        onSave={async (input) => {
          if (!db) return;
          const { today_weight_kg, ...profileInput } = input;
          // Atualiza dados do perfil.
          await userProfileRepository.update(db, profileInput);
          // Salva pesagem de hoje (se informada).
          if (today_weight_kg && today_weight_kg > 0) {
            const today = new Date();
            const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            await bodyWeightRepository.upsert(db, { weight_kg: today_weight_kg, date: dateISO });
          }
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

/**
 * Modal unificado: dados pessoais + pesagem de hoje.
 */
function ProfileEditModal({
  visible,
  profile,
  latestWeight,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: UserProfileRow | null;
  latestWeight: BodyWeightEntryRow | null;
  onClose: () => void;
  onSave: (input: {
    name?: string | null;
    height_cm?: number | null;
    target_weight_kg?: number | null;
    today_weight_kg?: number | null;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [target, setTarget] = useState('');
  const [todayWeight, setTodayWeight] = useState('');

  useEffect(() => {
    if (visible && profile) {
      setName(profile.name ?? '');
      setHeight(profile.height_cm ? String(profile.height_cm) : '');
      setTarget(profile.target_weight_kg ? String(profile.target_weight_kg) : '');
      setTodayWeight(latestWeight ? String(latestWeight.weight_kg) : '');
    }
  }, [visible, profile, latestWeight]);

  function handleSave() {
    onSave({
      name: name.trim() || null,
      height_cm: height ? parseFloat(height.replace(',', '.')) : null,
      target_weight_kg: target ? parseFloat(target.replace(',', '.')) : null,
      today_weight_kg: todayWeight ? parseFloat(todayWeight.replace(',', '.')) : null,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Meus dados</Text>
          <Text style={styles.modalSubtitle}>Nome, medidas e pesagem de hoje</Text>

          <Text style={styles.fieldLabel}>Nome</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="Seu nome"
            placeholderTextColor={colors.text.muted}
          />

          <View style={styles.fieldRow}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={styles.fieldLabel}>Altura (cm)</Text>
              <TextInput
                style={styles.fieldInput}
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                placeholder="178"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Peso-alvo (kg)</Text>
              <TextInput
                style={styles.fieldInput}
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder="80"
                placeholderTextColor={colors.text.muted}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Peso de hoje (kg)</Text>
          <TextInput
            style={[styles.fieldInput, styles.weightInputHighlight]}
            value={todayWeight}
            onChangeText={setTodayWeight}
            keyboardType="decimal-pad"
            placeholder="Ex: 78.5"
            placeholderTextColor={colors.text.muted}
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
  return `${Math.round(value * 10) / 10} kg`;
}

// ── Estilos ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.base },
  center: { flex: 1, backgroundColor: colors.background.base, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hello: { color: colors.text.secondary, fontSize: typography.size.sm },
  name: { color: colors.text.primary, fontSize: 26, fontWeight: '700' },
  bioRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  bioCard: {
    flex: 1,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  bioLabel: { color: colors.text.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: spacing.xs },
  bioValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  bioValue: { color: colors.text.primary, fontSize: 20, fontWeight: '700' },
  bioSubtitle: { color: colors.text.muted, fontSize: typography.size.xs },
  targetHint: { color: colors.accent.base, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.lg, fontWeight: '500' },
  sectionTitle: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '700', marginTop: spacing['2xl'], marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  statValue: { color: colors.accent.base, fontSize: typography.size.xl, fontWeight: '700' },
  statValueBig: { fontSize: 32 },
  statLabel: { color: colors.text.secondary, fontSize: 13, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  muscleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  muscleRowBorder: { borderTopColor: colors.background.border, borderTopWidth: 1 },
  muscleName: { color: colors.text.primary, fontSize: 15, fontWeight: '600' },
  muscleStats: { color: colors.text.secondary, fontSize: 13 },
  prExercise: { color: colors.text.primary, fontSize: typography.size.sm, fontWeight: '600' },
  prType: { color: colors.text.muted, fontSize: typography.size.xs, marginTop: 2 },
  prValue: { color: colors.accent.base, fontSize: typography.size.md, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    padding: spacing.xl,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.background.border,
  },
  modalTitle: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '700' },
  modalSubtitle: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  modalInput: {
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text.primary,
    fontSize: typography.size.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  fieldLabel: { color: colors.text.muted, fontSize: typography.size.xs, fontWeight: '600', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: 6 },
  fieldInput: {
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.md,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-end' },
  weightInputHighlight: {
    borderColor: colors.accent.base,
    borderWidth: 2,
  },
  resetBtn: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  resetBtnText: { color: colors.status.danger, fontSize: 13, fontWeight: '600' },
  modalSaveBtn: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  modalSaveBtnText: { color: colors.background.base, fontSize: typography.size.md, fontWeight: '700' },
  chartCard: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
  reportHint: { color: colors.text.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  exportBtn: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.md,
    paddingVertical: 14,
    flex: 1,
    alignItems: 'center',
  },
  exportBtnText: { color: colors.background.base, fontSize: 15, fontWeight: '700' },
  importBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    flex: 1,
    alignItems: 'center',
  },
  importBtnText: { color: colors.text.secondary, fontSize: 15, fontWeight: '600' },
});
