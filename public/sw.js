/* Nawkiran Payments — free Web Push service worker (no third-party SDK). */

const CACHE_NAME = "nawkiran-payments-cache-v4";
const PUSH_CONFIG_CACHE = "nawkiran-push-config-v1";
const PUSH_CONFIG_KEY = "/__nawkiran_push_config__";
const STATIC_ASSETS = ["/favicon.ico", "/icon-192.png", "/badge-72.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) =>
          key !== CACHE_NAME && key !== PUSH_CONFIG_CACHE ? caches.delete(key) : undefined
        )
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  const staticAsset =
    requestUrl.pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|gif|ico)$/.test(requestUrl.pathname);

  if (!staticAsset) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request));
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Nawkiran",
    body: "You have a payment update",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    url: "/open",
    tag: "nawkiran-payment",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      // keep defaults
    }
  }

  // Keep each lifecycle event (request / approve / deny / paid) as its own
  // notification slot via the server-provided tag (nk:req|appr|deny|paid:…).
  const options = {
    body: data.body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/badge-72.png",
    vibrate: [120, 60, 120],
    data: {
      url: data.url || "/open",
      dateOfArrival: Date.now(),
      tag: data.tag || "nawkiran-payment",
    },
    tag: data.tag || "nawkiran-payment",
    renotify: true,
    requireInteraction: false,
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
            // navigate() is not available on all mobile browsers
            if (typeof client.navigate === "function") {
              return client.navigate(targetUrl).then((c) => (c || client).focus());
            }
            return client.focus().then(() => {
              client.postMessage({ type: "nawkiran-navigate", url: path });
            });
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "nawkiran-push-config") return;
  const publicKey = String(event.data.publicKey || "").trim();
  if (!publicKey) return;
  event.waitUntil(
    caches
      .open(PUSH_CONFIG_CACHE)
      .then((cache) => cache.put(PUSH_CONFIG_KEY, new Response(publicKey)))
  );
});

function pushKeyBytes(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function reportRotatedSubscription(subscription, oldEndpoint) {
  const body = JSON.stringify({ subscription: subscription.toJSON(), oldEndpoint });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("/api/push/subscription", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => null);
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Could not persist rotated push subscription");
}

/**
 * Browser rotated the push endpoint (common on mobile). Ask open clients to
 * re-subscribe so the server gets the new keys. Without this, push silently dies.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    caches
      .match(PUSH_CONFIG_KEY, { cacheName: PUSH_CONFIG_CACHE })
      .then((response) => response?.text())
      .then(async (publicKey) => {
        if (!publicKey) throw new Error("Missing push configuration");
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: pushKeyBytes(publicKey),
        });
        await reportRotatedSubscription(subscription, event.oldSubscription?.endpoint ?? null);
      })
      .catch(() =>
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
          for (const client of list) {
            client.postMessage({ type: "nawkiran-push-resubscribe" });
          }
        })
      )
  );
});
