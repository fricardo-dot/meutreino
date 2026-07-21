/**
 * Tipografia do app.
 *
 * Os tamanhos seguem uma escala baseada em 4px.
 * `fontFamily` fica vazio para usar a fonte do sistema (performance e
 * aparência nativa). Quando introduzirmos uma fonte customizada no futuro,
 * basta apontar `regular`/`medium`/`bold` para o nome registrado.
 */
export const typography = {
  fontFamily: {
    regular: undefined,
    medium: undefined,
    bold: undefined,
  },

  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },

  /** Variantes prontas para uso em textos */
  variants: {
    display: { fontSize: 34, fontWeight: '700' as const, lineHeight: 1.15 },
    h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 1.2 },
    h2: { fontSize: 22, fontWeight: '600' as const, lineHeight: 1.25 },
    h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 1.3 },
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 1.4 },
    bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 1.4 },
    caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 1.4 },
    mono: { fontSize: 14, fontWeight: '500' as const, lineHeight: 1.4 },
  },
} as const;

export type AppTypography = typeof typography;
