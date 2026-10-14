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
  /* descreve o elemento circulado, para o estúdio achar o ponto exato no código */
  function clip(t, n) { return String(t || "").replace(/\s+/g, " ").trim().slice(0, n); }
  function part(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    var cls = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(function (c) { return c && c.length < 40 && !/^(\d|_|css-|sc-|jsx-)/.test(c) && !/[:\[\]\/]/.test(c); }).slice(0, 2);
    if (cls.length) s += "." + cls.join(".");
    var p = el.parentElement;
    if (p) { var same = [].filter.call(p.children, function (c) { return c.tagName === el.tagName; }); if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")"; }
    return s;
  }
  function describe(el) {
    if (!el || el === document.documentElement || el === document.body) return null;
    /* sobe de um <span>/<path> solto até algo que faça sentido sozinho */
    var t = el;
    while (t.parentElement && t.parentElement !== document.body && /^(span|b|strong|i|em|path|svg|use|g|small|br)$/i.test(t.tagName)) t = t.parentElement;
    var chain = [], c = t;
    while (c && c !== document.body && chain.length < 5) { chain.unshift(part(c)); if (c.id) break; c = c.parentElement; }
    var box = t.closest("section,header,footer,nav,main,article,aside,form") || null, head = box && box.querySelector("h1,h2,h3");
    var r = t.getBoundingClientRect();
    return {
      sel: chain.join(" > ").slice(0, 400),
      tag: t.tagName.toLowerCase(),
      text: clip(t.innerText || t.textContent || "", 240),
      alt: clip(t.getAttribute("alt") || t.getAttribute("aria-label") || "", 160),
      src: clip(t.currentSrc || t.getAttribute("src") || (getComputedStyle(t).backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || "", 300),
      href: clip(t.getAttribute("href") || (t.closest("a") || {}).href || "", 300),
      section: box ? clip((box.id ? "#" + box.id + " " : "") + (head ? head.innerText || head.textContent : ""), 160) : "",
      w: Math.round(r.width), h: Math.round(r.height)
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
    else if (m.aprova === "pick" && typeof m.x === "number") {
      var el = null;
      try { el = describe(document.elementFromPoint(m.x, m.y)); } catch (e) {}
      try { parent.postMessage({ aprova: "picked", id: m.id, el: el }, "*"); } catch (e) {}
    }
  });
  send("hello");
})();
