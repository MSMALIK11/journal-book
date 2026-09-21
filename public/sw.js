/* Trading Journal PWA — push alerts + offline shell hint */
const CACHE = "jb-pwa-v1"
const SHELL = ["/", "/live-sync", "/manifest.webmanifest", "/icons/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.pathname.startsWith("/api/")) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/live-sync"))),
  )
})

self.addEventListener("push", (event) => {
  let payload = {
    title: "Trading Journal",
    body: "New trade activity",
    url: "/live-sync",
    tag: "jb-trade",
  }

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() }
    }
  } catch {
    // ignore malformed payloads
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: payload.tag || "jb-trade",
      renotify: true,
      vibrate: [180, 80, 180, 80, 240],
      data: { url: payload.url || "/live-sync" },
      actions: [{ action: "open", title: "Open Live Sync" }],
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const path = event.notification.data?.url || "/live-sync"
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
