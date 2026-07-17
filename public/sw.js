/* Nawkiran Payments — free Web Push service worker (no third-party SDK). */

self.addEventListener("push", (event) => {
  let data = {
    title: "Nawkiran Payments",
    body: "You have a payment update",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    url: "/open",
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }

  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/badge-72.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/open",
      dateOfArrival: Date.now(),
    },
    tag: data.tag || "nawkiran-payment",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path =
    (event.notification.data && event.notification.data.url) || "/open";
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
