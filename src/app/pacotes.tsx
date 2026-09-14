import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadErrorView } from '@/components/LoadErrorView';
import { useDatabase } from '@/hooks/useDatabase';
import {
  workoutPacksRepository,
  type WorkoutPackSummary,
} from '@/repositories/workout-packs.repository';
import { mensagemDeErro } from '@/types/errors.helpers';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Pacotes de treino (mesociclos).
 *
 * Um pacote é o conjunto de fichas seguido num período. Ao virar de bloco, o
 * pacote inteiro é arquivado de uma vez e outro entra no lugar — em vez de
 * apagar ou renomear ficha por ficha, perdendo o registro do que era antes.
 *
 * Arquivar nunca apaga nada: as fichas continuam lá e o histórico de sessões
 * segue apontando para elas. Reativar é sempre reversível.
 */
export default function PacotesScreen() {
  const { db, status } = useDatabase();
  const [packs, setPacks] = useState<WorkoutPackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [paraAtivar, setParaAtivar] = useState<WorkoutPackSummary | null>(null);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    try {
      setPacks(await workoutPacksRepository.list(db));
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

  async function criarPacote(nome: string, copiar: boolean) {
    if (!db) return;
    try {
      await workoutPacksRepository.createAndActivate(db, nome, copiar);
      setCriando(false);
      await load();
    } catch (error) {
      setCriando(false);
      setActionError(mensagemDeErro(error));
    }
  }

  async function confirmarAtivacao() {
    if (!db || !paraAtivar) return;
    const alvo = paraAtivar;
    setParaAtivar(null);
    try {
      await workoutPacksRepository.activate(db, alvo.id);
      await load();
    } catch (error) {
      setActionError(mensagemDeErro(error));
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

  const ativo = packs.find((p) => p.is_active === 1) ?? null;
  const arquivados = packs.filter((p) => p.is_active === 0);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Pacotes</Text>
        <Text style={styles.subtitle}>
          Cada pacote é um bloco de treino. Arquivar guarda o bloco inteiro; o
          histórico dos treinos feitos continua intacto.
        </Text>
      </View>

      <FlatList
        data={arquivados}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View>
            {ativo ? (
              <View style={[styles.card, styles.cardAtivo]}>
                <View style={styles.badgeAtivo}>
                  <Text style={styles.badgeAtivoTexto}>EM USO</Text>
                </View>
                <Text style={styles.cardTitulo}>{ativo.name}</Text>
                <Text style={styles.cardSub}>
                  {ativo.workout_count} {ativo.workout_count === 1 ? 'ficha' : 'fichas'}
                </Text>
              </View>
            ) : null}

            <Pressable style={styles.novoBtn} onPress={() => setCriando(true)}>
              <Text style={styles.novoBtnTexto}>+ Novo pacote</Text>
            </Pressable>

            {arquivados.length > 0 ? (
              <Text style={styles.secao}>Arquivados</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>{item.name}</Text>
            <Text style={styles.cardSub}>
              {item.workout_count} {item.workout_count === 1 ? 'ficha' : 'fichas'}
              {item.archived_at ? ` · arquivado em ${formatarData(item.archived_at)}` : ''}
            </Text>
            <Pressable style={styles.reativarBtn} onPress={() => setParaAtivar(item)}>
              <Text style={styles.reativarTexto}>Voltar a usar</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.vazio}>
              Nenhum pacote arquivado ainda. Ao criar um novo, o atual vem para cá.
            </Text>
          )
        }
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'] }}
      />

      <NovoPacoteModal
        visible={criando}
        podeCopiar={ativo !== null && ativo.workout_count > 0}
        nomeAtual={ativo?.name ?? ''}
        onClose={() => setCriando(false)}
        onCriar={criarPacote}
      />

      <ConfirmDialog
        visible={paraAtivar !== null}
        title="Voltar a usar este pacote?"
        message={
          `"${paraAtivar?.name ?? ''}" volta a ser o pacote em uso e ` +
          `"${ativo?.name ?? ''}" vai para os arquivados. A programação da semana ` +
          `é limpa, porque ela aponta para as fichas do pacote que sai. Nada é apagado.`
        }
        confirmText="Trocar"
        cancelText="Cancelar"
        onConfirm={confirmarAtivacao}
        onCancel={() => setParaAtivar(null)}
      />

      <ConfirmDialog
        visible={actionError !== null}
        title="Não deu certo"
        message={actionError ?? ''}
        confirmText="Entendi"
        cancelText="Fechar"
        onConfirm={() => setActionError(null)}
        onCancel={() => setActionError(null)}
      />
    </View>
  );
}

/**
 * Criação de pacote: nome + começar vazio ou copiar o atual.
 *
 * A cópia traz as fichas com exercícios e alvos, para quando o próximo bloco é
 * uma progressão do anterior e não um treino do zero.
 */
function NovoPacoteModal({
  visible,
  podeCopiar,
  nomeAtual,
  onClose,
  onCriar,
}: {
  visible: boolean;
  podeCopiar: boolean;
  nomeAtual: string;
  onClose: () => void;
  onCriar: (nome: string, copiar: boolean) => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(copiar: boolean) {
    if (salvando) return;
    const limpo = nome.trim();
    if (!limpo) {
      setErro('Dê um nome ao pacote, como "Hipertrofia — set/out".');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await onCriar(limpo, copiar);
      setNome('');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={salvando ? () => {} : onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitulo}>Novo pacote</Text>
          <Text style={styles.modalSub}>
            {nomeAtual
              ? `"${nomeAtual}" vai para os arquivados e continua acessível.`
              : 'Este será o seu pacote em uso.'}
          </Text>

          <Text style={styles.label}>NOME</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Ex: Hipertrofia — set/out"
            placeholderTextColor={colors.text.muted}
          />

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          {podeCopiar ? (
            <Pressable
              style={[styles.acaoPrimaria, salvando && styles.desabilitado]}
              onPress={() => void criar(true)}
              disabled={salvando}
            >
              <Text style={styles.acaoPrimariaTexto}>
                {salvando ? 'Criando…' : 'Copiar as fichas de agora'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.acaoSecundaria, salvando && styles.desabilitado]}
            onPress={() => void criar(false)}
            disabled={salvando}
          >
            <Text style={styles.acaoSecundariaTexto}>
              {salvando ? 'Criando…' : 'Começar vazio'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "2026-09-14 10:00:00" (UTC) → "14/09/2026" em data local. */
function formatarData(utc: string): string {
  const normalizado = utc.replace(' ', 'T');
  const temTZ = normalizado.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(normalizado);
  const d = new Date(temTZ ? normalizado : normalizado + 'Z');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.base },
  header: { paddingTop: spacing['5xl'], paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { color: colors.accent.base, fontSize: typography.size.md, fontWeight: '600' },
  title: {
    color: colors.text.primary,
    fontSize: typography.size['2xl'],
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },

  card: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardAtivo: {
    borderColor: colors.accent.borderSoft,
    backgroundColor: colors.accent.soft,
  },
  badgeAtivo: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent.base,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  badgeAtivoTexto: {
    color: colors.background.base,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardTitulo: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600' },
  cardSub: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.xs },
  reativarBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent.base,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  reativarTexto: { color: colors.accent.base, fontSize: 13, fontWeight: '600' },

  novoBtn: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  novoBtnTexto: { color: colors.background.base, fontSize: typography.size.sm, fontWeight: '700' },
  secao: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  vazio: {
    color: colors.text.muted,
    fontSize: typography.size.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.background.elevated,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    padding: spacing['2xl'],
    paddingBottom: spacing['4xl'],
  },
  modalTitulo: { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: '700' },
  modalSub: { color: colors.text.secondary, fontSize: typography.size.sm, marginTop: spacing.xs },
  label: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.md,
  },
  erro: { color: colors.status.danger, fontSize: typography.size.xs, marginTop: spacing.sm },
  acaoPrimaria: {
    backgroundColor: colors.accent.base,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  acaoPrimariaTexto: {
    color: colors.background.base,
    fontSize: typography.size.sm,
    fontWeight: '700',
  },
  acaoSecundaria: {
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  acaoSecundariaTexto: {
    color: colors.text.primary,
    fontSize: typography.size.sm,
    fontWeight: '600',
  },
  desabilitado: { opacity: 0.5 },
});
