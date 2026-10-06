// Service worker : affiche les notifications, même quand l'appli est fermée.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Nos sons", {
      body: data.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/badge-72.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: self.registration.scope },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of windows) {
      if (w.url.startsWith(self.registration.scope) && "focus" in w) return w.focus();
    }
    return self.clients.openWindow(url);
  })());
});
