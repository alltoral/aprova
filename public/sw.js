/* Deixa o app instalável e abre rápido. Dados (/api) sempre vêm da internet. */
const CACHE = "aprovacoes-20261001144209";
const SHELL = ["/", "/index.html", "/app.js", "/plan.js", "/style.css", "/larot.png", "/stickers/aprovado.png", "/stickers/alteracao.png", "/stickers/reprovado.png"];
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
