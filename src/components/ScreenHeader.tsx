import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import { typography } from '@/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Ação à direita (botão, ícone). */
  right?: ReactNode;
}

/**
 * Cabeçalho padrão de tela.
 *
 * Título grande + subtário opcional + ação à direita.
 */
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.titles}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 4,
  },
  titles: { flex: 1 },
  title: {
    ...typography.variants.h1,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.variants.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
});
