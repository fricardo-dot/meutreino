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
 */

const CACHE_VERSION = 'meutreino-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sql-wasm.wasm',
  '/icon-1024.png',
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
    url.pathname === '/manifest.json'
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
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline: tenta a página cacheada, senão index.html (SPA fallback).
    const cached = await caches.match(request);
    if (cached) return cached;
    const indexCached = await caches.match('/index.html');
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
