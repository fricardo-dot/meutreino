import { type ReactNode } from 'react';
import { type StyleProp, ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';
import { spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Se true, conteúdo rola verticalmente quando ultrapassa a tela. */
  scroll?: boolean;
}

/**
 * Container padrão de tela.
 *
 * Garante fundo dark, safe-area e espaçamento horizontal consistente.
 * Use `<Screen scroll>` em telas com listas/conteúdo longo.
 */
export function Screen({ children, style, scroll = false }: ScreenProps) {
  const content = (
    <View style={[{ flex: 1, paddingHorizontal: spacing.lg }, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.base }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingVertical: spacing.xl }}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
