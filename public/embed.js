/* Aprova All Toral · ajudante de marcações
   Cole no site (antes do </body>):  <script src="https://SEU-APROVA/embed.js" async></script>
   Só funciona quando o site está aberto dentro do Aprova. Fora dele, não faz nada.
   Ele conta ao Aprova a posição da rolagem, para os círculos do cliente ficarem presos no lugar certo da página. */
(function () {
  if (window.top === window || window.__aprovaEmbed) return;
  window.__aprovaEmbed = true;
  var parent = window.parent;
  function info(type) {
    var d = document.documentElement, b = document.body || d;
    return {
      aprova: type,
      path: location.pathname + location.search + location.hash,
      sx: window.scrollX || d.scrollLeft || 0,
      sy: window.scrollY || d.scrollTop || 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
      dw: Math.max(d.scrollWidth, b.scrollWidth || 0),
      dh: Math.max(d.scrollHeight, b.scrollHeight || 0)
    };
  }
  var queued = false;
  function send(type) {
    if (queued && type === "scroll") return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      queued = false;
      try { parent.postMessage(info(type || "scroll"), "*"); } catch (e) {}
    });
  }
  window.addEventListener("scroll", function () { send("scroll"); }, { passive: true });
  window.addEventListener("resize", function () { send("scroll"); });
  window.addEventListener("hashchange", function () { send("hello"); });
  window.addEventListener("popstate", function () { send("hello"); });
  window.addEventListener("load", function () { send("hello"); });
  /* páginas que mudam de rota sem recarregar (React, Vue…) */
  var last = location.href;
  setInterval(function () { if (location.href !== last) { last = location.href; send("hello"); } }, 500);
  if (window.ResizeObserver) { try { new ResizeObserver(function () { send("scroll"); }).observe(document.documentElement); } catch (e) {} }
  window.addEventListener("message", function (ev) {
    if (ev.source !== parent || !ev.data || typeof ev.data !== "object") return;
    var m = ev.data;
    if (m.aprova === "ping") send("hello");
    else if (m.aprova === "scrollTo" && typeof m.y === "number") window.scrollTo({ top: Math.max(0, m.y), left: 0, behavior: m.smooth ? "smooth" : "auto" });
    else if (m.aprova === "scrollBy" && typeof m.dy === "number") window.scrollBy(0, m.dy);
  });
  send("hello");
})();
