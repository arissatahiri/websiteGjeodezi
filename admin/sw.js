/* Admin PWA — cache shell + push njoftime */
const CACHE = "gjeodeti-admin-v1";
const PRECACHE = [
  "/admin/",
  "/admin/index.html",
  "/admin/css/admin.css?v=pwa1",
  "/admin/js/admin.js?v=pwa1",
  "/admin/manifest.webmanifest",
  "/admin/icons/icon-192.png",
  "/admin/icons/icon-512.png",
  "/assets/logo.png",
  "/assets/logo-header-white.png?v=2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* API gjithmonë nga rrjeti */
  if (url.pathname.startsWith("/api/")) return;

  /* Navigim admin → network first, pastaj cache */
  if (req.mode === "navigate" || url.pathname.startsWith("/admin")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/admin/index.html"))
        )
    );
    return;
  }

  /* Assets: cache first */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Gjeodeti I.T", body: "Njoftim i ri", url: "/admin/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      data.body = event.data.text();
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Gjeodeti I.T", {
      body: data.body || "",
      icon: "/admin/icons/icon-192.png",
      badge: "/admin/icons/icon-192.png",
      tag: data.tag || "gjeodeti",
      data: { url: data.url || "/admin/" },
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
