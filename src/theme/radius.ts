/**
 * Escala de border-radius — unifica o app.
 *
 * Toda borda arredondada deve usar um destes tokens, nunca número mágico.
 * Evita o drift histórico (telas usando 10, 12, 14, 16, 20 sem padrão).
 */
export const radius = {
  /** 10px — inputs, chips pequenos */
  sm: 10,
  /** 12px — botões, picker items */
  md: 12,
  /** 14px — cards de lista (padrão) */
  lg: 14,
  /** 16px — cards grandes, banners */
  xl: 16,
  /** 20px — top corners de bottom-sheet, pills */
  pill: 20,
} as const;

export type AppRadius = typeof radius;
