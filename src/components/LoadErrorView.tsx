import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

/**
 * Tela de "não consegui carregar", com botão de tentar de novo.
 *
 * Existe porque todo `load()` das telas era disparado com `void load()` e o
 * `setLoading(false)` ficava no fim do corpo: uma leitura que rejeitasse
 * deixava a tela girando o indicador para sempre, sem dizer nada e sem saída.
 *
 * Diferente do `DatabaseErrorView`, que cobre falha na ABERTURA do banco e
 * substitui o app inteiro, este cobre falha ao carregar UMA tela.
 */
export function LoadErrorView({
  mensagem,
  onRetry,
}: {
  mensagem: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.titulo}>Não foi possível carregar</Text>
      <Text style={styles.mensagem}>{mensagem}</Text>
      <Pressable style={styles.botao} onPress={onRetry}>
        <Text style={styles.botaoTexto}>Tentar de novo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  icon: { fontSize: 40, marginBottom: spacing.md },
  titulo: {
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  mensagem: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  botao: {
    marginTop: spacing['2xl'],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent.base,
  },
  botaoTexto: {
    color: colors.background.base,
    fontSize: typography.size.sm,
    fontWeight: '700',
  },
});
