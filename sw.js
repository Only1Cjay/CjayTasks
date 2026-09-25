/* ============================================================
   CjayTasks — Service Worker
   Aggressive caching for offline use.
   Bump CACHE_VERSION whenever you push changes.
   ============================================================ */

const CACHE_VERSION = 'v1.1.3';
const CACHE_NAME = 'cjaytasks-' + CACHE_VERSION;

const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_ASSETS).catch(() => {});
      await Promise.all(
        EXTERNAL_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
      return self.skipWaiting();
    })
  );
});

/* ============================================================
   ACTIVATE
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('cjaytasks-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if(req.method !== 'GET') return;

  // Google APIs — network only
  if(url.hostname.includes('googleapis.com') ||
     url.hostname.includes('accounts.google.com') ||
     url.hostname.includes('apis.google.com') ||
     url.hostname.includes('gstatic.com')){
    return;
  }

  // Fonts / icons CDN — cache-first
  if(url.hostname.includes('fonts.googleapis.com') ||
     url.hostname.includes('fonts.gstatic.com') ||
     url.hostname.includes('cdnjs.cloudflare.com')){
    event.respondWith(cacheFirst(req));
    return;
  }

  // Same-origin — stale-while-revalidate
  if(url.origin === self.location.origin){
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Everything else — network with cache fallback
  event.respondWith(networkWithCacheFallback(req));
});

/* ============================================================
   STRATEGIES
   ============================================================ */
async function cacheFirst(req){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if(cached) return cached;
  try{
    const fresh = await fetch(req);
    if(fresh && fresh.status === 200) cache.put(req, fresh.clone());
    return fresh;
  }catch(e){
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(fresh => {
    if(fresh && fresh.status === 200){
      cache.put(req, fresh.clone());
    }
    return fresh;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkWithCacheFallback(req){
  try{
    const fresh = await fetch(req);
    if(fresh && fresh.status === 200){
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  }catch(e){
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    return cached || Response.error();
  }
}

/* ============================================================
   MESSAGE HANDLING
   ============================================================ */
self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
