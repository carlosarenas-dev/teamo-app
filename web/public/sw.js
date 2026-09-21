/* Service Worker de Teamo.
 *
 * El push llega SIN payload: solo sirve de despertador. Aqui leemos el token desde
 * IndexedDB (localStorage no existe en este contexto), pedimos GET /api/state y de ahi
 * sacamos que notificacion mostrar. Asi nos ahorramos el cifrado aes128gcm del payload.
 */

const CACHE = 'woop-v1';
const SHELL = ['/', '/index.html', '/icon-192.png', '/manifest.webmanifest'];

const LEVELS = {
  1: 'libre',
  2: 'algo ocupada',
  3: 'ocupada',
  4: 'muy ocupada',
  5: 'no puedo ahora',
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La API siempre va a la red. El resto: red primero, cache como red de seguridad,
// para que la app abra aunque no haya senal.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/index.html')),
      ),
  );
});

function readToken() {
  return new Promise((resolve) => {
    const request = indexedDB.open('woop', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const get = db.transaction('kv', 'readonly').objectStore('kv').get('deviceToken');
        get.onsuccess = () => {
          resolve(get.result || null);
          db.close();
        };
        get.onerror = () => {
          resolve(null);
          db.close();
        };
      } catch {
        resolve(null);
      }
    };
  });
}

async function buildNotification() {
  const fallback = { title: 'Teamo', body: 'Tienes un aviso nuevo', tag: 'woop' };

  const token = await readToken();
  if (!token) return fallback;

  const response = await fetch('/api/state', {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return fallback;

  const state = await response.json();
  const event = state.lastEvent;
  const who = (state.partner && state.partner.label && state.partner.label.trim()) || 'Tu pareja';

  // Si el ultimo evento es nuestro, el push no era para esto: mostramos algo neutro.
  if (!event || event.mine) return fallback;

  if (event.type === 'woop') {
    return { title: 'Woop', body: `${who} te manda un woop`, tag: 'woop' };
  }
  if (event.type === 'missclick') {
    // Mismo tag que 'status': reemplaza el aviso anterior en vez de acumularse.
    return { title: who, body: 'Fue sin querer — ignora el aviso anterior', tag: 'status' };
  }
  return {
    title: who,
    body: `Nivel ${event.level} de 5 — ${LEVELS[event.level] || ''}`,
    tag: 'status',
  };
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let notification;
      try {
        notification = await buildNotification();
      } catch {
        notification = { title: 'Teamo', body: 'Tienes un aviso nuevo', tag: 'woop' };
      }
      // iOS revoca el permiso de push si un mensaje no acaba mostrando notificacion,
      // asi que este showNotification se ejecuta pase lo que pase.
      await self.registration.showNotification(notification.title, {
        body: notification.body,
        tag: notification.tag,
        renotify: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: notification.tag === 'woop' ? [40, 60, 40] : [30],
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
