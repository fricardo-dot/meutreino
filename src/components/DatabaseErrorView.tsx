import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import { spacing } from '@/theme';
import { typography } from '@/theme';

/**
 * Tela de carregamento do banco.
 * Exibida enquanto as migrations rodam na primeira abertura.
 */
export function DatabaseLoadingView() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent.base} />
      <Text style={styles.text}>Preparando seu banco de treinos…</Text>
    </View>
  );
}

/**
 * Tela de erro de inicialização do banco.
 *
 * Em vez de um crash em branco, mostra uma mensagem útil + botão de tentar
 * de novo. O erro original é exibido em mono para facilitar o diagnóstico.
 */
export function DatabaseErrorView({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>⚠️</Text>
      </View>
      <Text style={styles.title}>Não foi possível abrir o app</Text>
      <Text style={styles.message}>{error.message}</Text>

      <View style={styles.detailsBox}>
        <Text style={styles.detailsText}>
          {error instanceof Error && error.cause
            ? String((error as Error & { cause?: unknown }).cause)
            : 'Causa desconhecida.'}
        </Text>
      </View>

      <View style={styles.retryButton}>
        <Text style={styles.retryText} onPress={onRetry}>
          Tentar de novo
        </Text>
      </View>
    </View>
  );
}

const baseContainer = {
  flex: 1,
  backgroundColor: colors.background.base,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: spacing['2xl'],
};

const styles = StyleSheet.create({
  container: baseContainer,
  text: {
    ...typography.variants.body,
    color: colors.text.secondary,
    marginTop: spacing.lg,
  },
  iconWrap: { marginBottom: spacing.lg },
  icon: { fontSize: 48 },
  title: {
    ...typography.variants.h2,
    color: colors.text.primary,
    textAlign: 'center',
  },
  message: {
    ...typography.variants.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  detailsBox: {
    width: '100%',
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
  },
  detailsText: {
    ...typography.variants.mono,
    color: colors.text.muted,
    fontFamily: 'monospace',
  },
  retryButton: {
    marginTop: spacing['2xl'],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    backgroundColor: colors.accent.base,
  },
  retryText: {
    ...typography.variants.body,
    fontWeight: '700',
    color: colors.background.base,
  },
});
