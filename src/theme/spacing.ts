/**
 * Escala de espaçamento do app.
 *
 * Use SEMPRE estes valores (ou múltiplos claros) em vez de números mágicos.
 * Mantém o ritmo visual consistente entre telas.
 */
export const spacing = {
  /** 4px */
  xs: 4,
  /** 8px */
  sm: 8,
  /** 12px */
  md: 12,
  /** 16px — espaçamento padrão */
  lg: 16,
  /** 20px */
  xl: 20,
  /** 24px */
  '2xl': 24,
  /** 32px */
  '3xl': 32,
  /** 40px */
  '4xl': 40,
  /** 48px */
  '5xl': 48,
} as const;

export type AppSpacing = typeof spacing;
