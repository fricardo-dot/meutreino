/**
 * Configuração dinâmica do Expo.
 *
 * `experiments.baseUrl` (definido no build via env BASE_URL) faz o Expo Router
 * gerar todos os assets e rotas com o prefixo correto do subpath do GitHub
 * Pages. Em dev (BASE_URL vazio) fica na raiz.
 */
const baseUrl = process.env.BASE_URL || '';

export default {
  expo: {
    name: 'MeuTreino',
    slug: 'MeuTreino',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'meutreino',
    userInterfaceStyle: 'dark',
    ios: { supportsTablet: true },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0B0B0F',
        foregroundImage: './assets/images/android-icon-foreground.png',
      },
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: ['expo-router'],
    experiments: {
      baseUrl,
    },
    extra: {
      baseUrl,
    },
  },
};

