/* Nafis service worker.
 *
 * Two jobs only: an offline fallback page, and showing push notifications.
 * Pages are never cached: they hold private, per-user content, and a shared
 * phone must not show someone else's feed or messages offline.
 */
const CACHE = "nafis-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

// Network first for page loads; the offline page only when the network fails.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});

function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/notifications";
}

// Payloads are built by the server and never contain what anyone wrote.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Nafis";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: typeof data.lang === "string" ? data.lang : undefined,
      tag,
      renotify: Boolean(tag),
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        try {
          await client.focus();
          await client.navigate(target.href);
          return;
        } catch {
          // Not controlled by this worker yet: open a fresh window instead.
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
