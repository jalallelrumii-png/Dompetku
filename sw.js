// ====================================================
// DOMPETKU SERVICE WORKER v2.0
// Full offline support + background sync + push notif
// ====================================================

const CACHE_NAME = 'dompetku-v2.0.0';
const STATIC_CACHE = 'dompetku-static-v2';
const DYNAMIC_CACHE = 'dompetku-dynamic-v2';

// Files to cache on install (App Shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  console.log('[SW] Installing Dompetku Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static assets...');
      // Cache one by one to avoid total failure if one CDN fails
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err)))
      );
    }).then(() => {
      console.log('[SW] Install complete!');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activated! Claiming clients...');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// ===== FETCH (Cache Strategy) =====
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Strategy: Cache First for static assets, Network First for HTML
  if (request.destination === 'document') {
    // HTML → Network first, fallback to cache
    event.respondWith(networkFirstStrategy(request));
  } else if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    // Assets → Cache first, fallback to network
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Others → Stale while revalidate
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ===== CACHE STRATEGIES =====

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline - resource not cached', { status: 503 });
  }
}

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return offline page (the app itself)
    const fallback = await caches.match('/index.html');
    return fallback || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);
  return cached || await fetchPromise;
}

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  // Placeholder for future server sync
  console.log('[SW] Syncing transactions in background...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE', message: 'Data berhasil disinkronkan!' });
  });
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Ada notifikasi dari Dompetku!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Buka App' },
      { action: 'dismiss', title: 'Tutup' }
    ],
    tag: 'dompetku-notif',
    requireInteraction: false
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '💰 Dompetku', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// ===== MESSAGE HANDLER =====
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('[SW] Dompetku Service Worker loaded ✅');

