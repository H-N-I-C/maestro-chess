/* Maestro service worker.
   Precaches the whole app shell (including the offline Stockfish engine
   assets) on install so the installed PWA works with zero network — no
   Wi-Fi, no LAN, no server — after the first load. Live-coach requests
   (/api/*) always go to the network; everything else is cache-first with
   a navigation fallback to the cached app shell when fully offline.

   It also stamps COOP/COEP headers onto same-origin responses, so static
   hosts that can't set headers (GitHub Pages) still get cross-origin
   isolation and the multithreaded Stockfish build. */
const CACHE = 'maestro-v3';
const MANIFEST_URL = 'precache-manifest.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
        const files = await res.json();
        await cache.addAll(files);
      } catch {
        // best effort — runtime caching below still fills the cache as pages are visited
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isolate(res) {
  // opaque/error responses can't be re-wrapped; redirects must pass through as-is
  if (!res || res.status === 0 || res.type === 'opaqueredirect' || res.redirected) return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return; // network only — live coach needs it
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return isolate(cached);
      try {
        const res = await fetch(event.request);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, res.clone());
        }
        return isolate(res);
      } catch (err) {
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('index.html');
          if (shell) return isolate(shell);
        }
        throw err;
      }
    })()
  );
});
