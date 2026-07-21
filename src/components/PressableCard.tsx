import { type ReactNode, useRef } from 'react';
import { Animated, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/theme';
import { radius } from '@/theme';

// Animated.createAnimatedComponent aceita componentes function como o Pressable.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableCardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Estilo do card (sobreposto ao padrão). */
  style?: StyleProp<ViewStyle>;
  /** Se false, não aplica o feedback de escala (somente card estático). */
  animated?: boolean;
}

/**
 * Card tocável com feedback tátil sutil (escala 0.98 ao pressionar).
 *
 * Substitui o padrão `<Pressable style={card}>` espalhado pelo app, unificando
 * aparência e comportamento. Quando onPress não é passado, é só um View
 * (não responsivo a toque).
 */
export function PressableCard({
  children,
  onPress,
  style,
  animated = true,
}: PressableCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    if (!animated) return;
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }

  function handlePressOut() {
    if (!animated) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }

  const cardStyle = [styles.card, style];

  if (!onPress) {
    return <View style={cardStyle}>{children}</View>;
  }

  return (
    <AnimatedPressable
      style={[cardStyle, { transform: [{ scale }] }]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.background.border,
    padding: 16,
  },
});
