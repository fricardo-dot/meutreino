/**
 * Configuração dinâmica do Expo — lê EXPO_BASE_URL do ambiente pra servir
 * em subpath (GitHub Pages: /meutreino/).
 *
 * O `web.baseUrl` faz o Expo Router gerar rotas e assets com o prefixo
 * correto, e o DefinePlugin injeta `process.env.EXPO_BASE_URL` no bundle
 * (usado por client.web.ts pra localizar o WASM).
 */
const baseUrl = process.env.EXPO_BASE_URL || '';

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
      baseUrl,
      favicon: './assets/images/favicon.png',
    },
    plugins: ['expo-router'],
    extra: {
      baseUrl,
    },
  },
};
