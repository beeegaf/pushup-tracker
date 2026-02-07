const CACHE_NAME = 'pushup-tracker-v1';
const ASSETS_TO_CACHE = [
  '/pushup-tracker/',
  '/pushup-tracker/index.html',
  '/pushup-tracker/style.css',
  '/pushup-tracker/app.js',
  '/pushup-tracker/firebase-config.js',
  '/pushup-tracker/manifest.json',
  '/pushup-tracker/icon-192.svg',
  '/pushup-tracker/icon-512.svg'
];

// Install: cache all app assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Don't cache Firebase/Google API requests
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com')) {
    return; // Let these go straight to network
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Return cached version, but also fetch fresh copy for next time
        fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {}); // Ignore network errors (offline)
        return cached;
      }
      return fetch(event.request);
    })
  );
});

// Push notifications from server
self.addEventListener('push', event => {
  let data = { title: 'Pushup Tracker', body: 'Time to do some pushups!' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Pushup Tracker', {
      body: data.body || 'Time to do some pushups!',
      icon: '/pushup-tracker/icon-192.svg',
      badge: '/pushup-tracker/icon-192.svg',
      vibrate: [200, 100, 200],
      data: { url: '/pushup-tracker/' }
    })
  );
});

// Handle notification click — open the app
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If app is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes('/pushup-tracker/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow('/pushup-tracker/');
    })
  );
});
