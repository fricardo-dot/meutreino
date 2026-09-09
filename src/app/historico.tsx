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

import { mensagemDeErro } from '@/types/errors.helpers';
import { LoadErrorView } from '@/components/LoadErrorView';
import { useDatabase } from '@/hooks/useDatabase';
import { sessionsRepository, type SessionSummary } from '@/repositories/sessions.repository';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Histórico de sessões concluídas.
 *
 * Cada item mostra: nome · data · duração · n° exercícios · n° séries.
 * Facilita localizar um treino específico no passado.
 */
export default function HistoricoScreen() {
  const { db, status } = useDatabase();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    try {
      const list = await sessionsRepository.listRecent(db, 50);
      setSessions(list);
      // Deu certo: se havia erro de uma tentativa anterior, ele sai.
      setLoadError(null);
    } catch (error) {
      setLoadError(mensagemDeErro(error));
    } finally {
      setLoading(false);
    }
  }, [db, status]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Voltar</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Histórico</Text>

      <FlatList
        data={sessions}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.cardStats}>
              <Stat label={formatDate(item.started_at)} />
              <Stat label={`${formatDuration(item.duration_seconds)} min`} />
              <Stat label={`${item.exercise_count} ex`} />
              <Stat label={`${item.set_count} séries`} />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nenhuma sessão concluída</Text>
            <Text style={styles.emptyText}>
              Conclua um treino para vê-lo aqui.
            </Text>
          </View>
        }
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'] }}
      />
    </View>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statText}>{label}</Text>
    </View>
  );
}

/** Formata "2026-07-14 16:40" → "14/07". */
function formatDate(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

/** Converte segundos → minutos (arredondado). */
function formatDuration(seconds: number | null): string {
  if (!seconds) return '0';
  return String(Math.round(seconds / 60));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.base },
  center: { flex: 1, backgroundColor: colors.background.base, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: spacing['5xl'], paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { color: colors.accent.base, fontSize: typography.size.md, fontWeight: '600' },
  title: { color: colors.text.primary, fontSize: typography.size['2xl'], fontWeight: '700', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: 10,
  },
  cardTitle: { color: colors.text.primary, fontSize: 17, fontWeight: '600', marginBottom: 10 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    backgroundColor: colors.background.base,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statText: { color: colors.text.secondary, fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: spacing['3xl'] },
  emptyTitle: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600' },
  emptyText: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.sm, textAlign: 'center' },
});
