/* Deixa o app instalável e abre rápido. Dados (/api) sempre vêm da internet. */
const CACHE = "aprovacoes-20261020155537";
const SHELL = ["/", "/index.html", "/app.js", "/plan.js", "/digital.js", "/guide.js", "/style.css", "/larot.png", "/stickers/aprovado.png", "/stickers/alteracao.png", "/stickers/reprovado.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const isPage = e.request.mode === "navigate";
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((r) => { if (r.ok && !isPage) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(isPage ? "/index.html" : e.request))
  );
});

/* ---------- avisos no celular ---------- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Aprova All Toral", {
    body: d.body || "Chegou novidade para você aprovar.",
    icon: "/icons/larot-192.png",
    badge: "/icons/badge-96.png",
    tag: d.tag || "aprova",
    renotify: true,
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const w of list) { if (w.url.startsWith(target) && "focus" in w) return w.focus(); }
    for (const w of list) { if ("navigate" in w && "focus" in w) return w.navigate(target).then((x) => (x || w).focus()); }
    return self.clients.openWindow(target);
  }));
});
