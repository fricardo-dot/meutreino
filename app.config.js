/**
 * Configuração dinâmica do Expo.
 *
 * A configuração ESTÁTICA vive em `app.json` e chega aqui pelo argumento
 * `config`. Este arquivo só acrescenta o que depende do ambiente — não
 * duplique campos entre os dois, senão o `app.json` vira letra morta (quando
 * este arquivo exporta um objeto pronto, o Expo ignora o `app.json` inteiro).
 *
 * `experiments.baseUrl` (definido no build via env BASE_URL) faz o Expo Router
 * gerar todos os assets e rotas com o prefixo correto do subpath do GitHub
 * Pages. Em dev (BASE_URL vazio) fica na raiz.
 */
const baseUrl = process.env.BASE_URL || '';

export default ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl,
  },
  extra: {
    ...config.extra,
    baseUrl,
  },
});
