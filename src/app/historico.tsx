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

import { useDatabase } from '@/hooks/useDatabase';
import { sessionsRepository, type SessionSummary } from '@/repositories/sessions.repository';

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

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    const list = await sessionsRepository.listRecent(db, 50);
    setSessions(list);
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
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
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
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 8 },
  back: { color: '#B4FF39', fontSize: 16, fontWeight: '600' },
  title: { color: '#F5F5F7', fontSize: 28, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  card: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: '#2A2A35',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: { color: '#F5F5F7', fontSize: 17, fontWeight: '600', marginBottom: 10 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    backgroundColor: '#0B0B0F',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statText: { color: '#A1A1AA', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyTitle: { color: '#F5F5F7', fontSize: 18, fontWeight: '600' },
  emptyText: { color: '#A1A1AA', fontSize: 14, marginTop: 8, textAlign: 'center' },
});
