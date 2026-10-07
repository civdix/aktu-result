// Service Worker for AKTU Student News Push Notifications
// Operates via native Chrome/Browser Web Push API (100% free, zero resource drain)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'AKTU News Alert',
    body: 'A new university circular or result update has been published.',
    url: '/news',
    icon: '/favicon-96x96.png',
    badge: '/favicon-48x48.png'
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/favicon-96x96.png',
    badge: data.badge || '/favicon-48x48.png',
    data: {
      url: data.url || '/news'
    },
    vibrate: [100, 50, 100],
    tag: data.tag || 'aktu-news-update',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/news';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open on this origin, focus and navigate it
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(fullUrl);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })
  );
});
