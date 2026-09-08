/**
 * Service Worker do MeuTreino — cache offline.
 *
 * Estratégia:
 *  - Pré-cacheia recursos críticos na instalação (manifest, WASM, ícone).
 *  - Cache-first para recursos estáticos (WASM, ícones, manifest).
 *  - Stale-while-revalidate para bundles JS/CSS (atualiza em background).
 *  - Network-first para navegação (HTML) com fallback pro cache.
 *
 * IMPORTANTE: o nome do cache (CACHE_VERSION) deve mudar quando você quiser
 * forçar todos os usuários a baixar versões novas.
 *
 * IMPORTANTE 2: a app é servida num subpath no GitHub Pages (/meutreino/) e na
 * raiz em dev. Nenhum caminho aqui pode ser absoluto — todos derivam de `BASE`.
 */

const CACHE_VERSION = 'meutreino-v2';

/**
 * Diretório onde este SW está servido, com barra no fim.
 *  - dev:  "/"
 *  - prod: "/meutreino/"
 *
 * Todo caminho do SW é montado a partir daqui. Escrever "/index.html" direto
 * funciona em dev e falha em produção, sem erro visível.
 */
const BASE = self.location.pathname.replace(/[^/]*$/, '');

/** Monta um caminho absoluto correto a partir do BASE. */
const path = (file) => BASE + file;

const PRECACHE_URLS = [
  BASE,
  path('index.html'),
  path('manifest.json'),
  path('sql-wasm.wasm'),
  path('icon-1024.png'),
];

// ── Install: pré-cacheia recursos críticos ────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll falha inteiro se um recurso falhar — usa add individual pra isolar.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn('[SW] Falha pré-cacheando', url, err),
          ),
        ),
      ),
    ),
  );
  // Força o SW ativo imediatamente.
  self.skipWaiting();
});

// ── Activate: limpa caches antigos ────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  // Assume controle de todas as abas imediatamente.
  self.clients.claim();
});

// ── Fetch: estratégia por tipo de recurso ─────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET (POST, etc).
  if (request.method !== 'GET') return;

  // Ignora cross-origin (HMR do Metro, etc).
  if (url.origin !== self.location.origin) return;

  // WASM, ícones, manifest: cache-first (esses mudam raramente).
  if (
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname === path('manifest.json')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Bundles JS/CSS: stale-while-revalidate (resposta rápida + atualiza bg).
  if (
    url.pathname.includes('/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Navegação (HTML): network-first, fallback pro index.html cacheado.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Default: tenta rede, fallback pro cache.
  event.respondWith(networkFirst(request));
});

// ── Estratégias ────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline e recurso não cacheado', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirstWithFallback(request) {
  try {
    // `cache: 'no-cache'` obriga o navegador a revalidar com o servidor antes
    // de reaproveitar o HTML do cache HTTP.
    //
    // Sem isso, o `Cache-Control: max-age=600` que o GitHub Pages devolve para
    // o HTML fazia este fetch ser servido pelo cache do navegador: por até 10
    // minutos depois de um deploy o usuário continuava recebendo o index.html
    // da versão anterior — que aponta para um bundle que o deploy novo já
    // apagou, resultando em 404 e app quebrado até o cache expirar.
    //
    // Revalidar é barato: quando nada mudou, o servidor responde 304 e nada
    // é baixado de novo. Passamos a URL (e não o Request) porque um Request
    // com mode 'navigate' não pode ser reconstruído com outras opções.
    const response = await fetch(request.url, { cache: 'no-cache' });
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline: tenta a página cacheada, senão index.html (SPA fallback).
    const cached = await caches.match(request);
    if (cached) return cached;
    const indexCached = await caches.match(path('index.html'));
    if (indexCached) return indexCached;
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}
