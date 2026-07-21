/**
 * Paleta de cores do app — tema dark.
 *
 * Organização:
 *  - background: superfícies (tela, card, elevado)
 *  - accent: cor de marca (verde-limão vibrante, estilo fitness)
 *  - text: textos sobre o background
 *  - status: feedback (success, warning, danger, info)
 *
 * Os valores são em HEX. Para opacidade, use a sintaxe HEX8 do React Native
 * (ex.: `${accent}33` para ~20%).
 */
export const colors = {
  background: {
    /** Fundo principal da tela */
    base: '#0B0B0F',
    /** Cards, listas, inputs */
    surface: '#15151C',
    /** Superfície elevada (modais, toasts, cabeçalhos) */
    elevated: '#1E1E27',
    /** Borda sutil entre elementos */
    border: '#2A2A35',
  },

  /** Cor de marca — usada em CTAs, seleção, foco */
  accent: {
    base: '#B4FF39',
    /** Texto/ícone sobre fundo escuro com contraste reduzido */
    muted: '#7FBF2A',
    /** Fundo de um elemento pressionado (overlay) */
    press: '#8FD128',
    /** Fundo translúcido de badge/destaque (~15% opacidade) */
    soft: 'rgba(180, 255, 57, 0.15)',
    /** Borda translúcida (~30% opacidade) */
    borderSoft: 'rgba(180, 255, 57, 0.30)',
  },

  text: {
    /** Texto principal */
    primary: '#F5F5F7',
    /** Texto secundário (legenda, metadados) */
    secondary: '#A1A1AA',
    /** Texto desabilitado/placeholder */
    muted: '#6B6B76',
  },

  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  },

  /** Overlay para fundos de modal/backdrop */
  overlay: 'rgba(0, 0, 0, 0.6)',

  /**
   * Sombra sutil pra cards elevados. Espalhar via:
   *   shadowColor: colors.shadow, shadowOffset:{width:0,height:2},
   *   shadowOpacity: 0.5, shadowRadius: 6, elevation: 3
   */
  shadow: '#000000',
} as const;

export type AppColors = typeof colors;
