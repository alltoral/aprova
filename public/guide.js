/* Guia visual: cores, fontes, logos e regras que o estúdio monta e o cliente aprova · Aprova All Toral
   Vale para os dois tipos de cliente (redes sociais e produtos digitais). */

const GSECTIONS = { geral: "Guia todo", resumo: "Resumo", logo: "Logo", cores: "Cores", fontes: "Fontes", elementos: "Elementos", social: "Rede social", voz: "Tom de voz", regras: "Como usar" };
const BGS = { light: "Fundo claro", dark: "Fundo escuro", brand: "Cor da marca" };
const guideSt = () => S.guide?.review?.status || "pendente";
const newGuide = () => ({ title: "Guia visual", intro: "", logos: [], colors: [{ name: "Principal", hex: (S.client?.color || "#e55496").toLowerCase(), role: "Fundos de destaque, botões e títulos" }], fonts: [{ name: "", role: "Títulos", weights: "", sample: "" }], elements: [], summary: null, bio: "", templates: [], profiles: [], voice: "", dos: "", donts: "" });

/* fontes do Google para mostrar o exemplo com a fonte de verdade */
const loadedFonts = new Set();
function loadFonts(list) {
  (list || []).forEach(f => {
    const name = String(f?.name || "").trim(); if (!name || loadedFonts.has(name) || f.google === false) return;
    loadedFonts.add(name);
    const w = [...new Set(String(f.weights || "").match(/\d{3}/g) || [])].filter(x => +x >= 100 && +x <= 900).sort();
    const base = "https://fonts.googleapis.com/css2?display=swap&family=" + encodeURIComponent(name).replace(/%20/g, "+");
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = w.length ? `${base}:wght@${w.join(";")}` : base;
    link.onerror = () => { if (w.length) { const l2 = document.createElement("link"); l2.rel = "stylesheet"; l2.href = base; document.head.appendChild(l2); } };
    document.head.appendChild(link);
  });
}
const fontCss = f => `font-family:'${String(f.name || "").replace(/['"<>;]/g, "")}',var(--f-body)`;
const swatchInk = hex => inkFor(/^#[0-9a-f]{6}$/i.test(hex || "") ? hex : "#000000");
const gWeights = f => [...new Set(String(f.weights || "").match(/\d{3}/g) || [])].slice(0, 4);

/* bloco na página do cliente */
function guideBlock(c) {
  const g = S.guide;
  if (S.isOwner && !g) return `<button class="gb-empty" data-act="guide-edit"><span class="gb-plus">+</span><span><b>Guia visual</b><small>Cadastre logo, cores e fontes para ${esc(c.name)} aprovar antes da produção.</small></span></button>`;
  if (!g || (!S.isOwner && g.visible === false)) return "";
  loadFonts(g.fonts);
  const st = guideSt(); const logo = (g.logos || [])[0];
  return `<section class="gb ${S.isOwner ? "" : "gb-c"}"><button class="gb-main" data-act="guide-open">
    <div class="gb-cover" style="background:${esc(g.colors?.[0]?.hex || c.color || "#e55496")};color:${swatchInk(g.colors?.[0]?.hex || c.color)}">${logo ? `<img src="${blob(logo.id)}" alt="">` : `<span>${esc(initials(c.name))}</span>`}</div>
    <div class="gb-t"><span class="eyebrow">${g.visible === false ? "Rascunho · só você vê" : `Guia visual · versão ${g.version || 1}`}</span><b>${S.isOwner ? esc(g.title || "Guia visual") : "Seu <em>guia visual</em>"}</b>
      <div class="gb-sw">${(g.colors || []).slice(0, 8).map(x => `<i style="background:${esc(x.hex)}" title="${esc(x.name)} ${esc(x.hex)}"></i>`).join("")}</div>
      <small>${(g.fonts || []).map(f => `<span style="${fontCss(f)}">${esc(f.name)}</span>`).join(" · ") || "Sem fontes"}</small></div>
    <span class="pill" style="background:${ST[st].color};color:${ST[st].ink}">${st === "pendente" && !S.isOwner ? "Aguardando você" : ST[st].label}</span></button>
    ${S.isOwner ? `<div class="gb-act"><button class="btn sm" data-act="guide-edit">Editar</button><button class="btn sm ghost" data-act="guide-open">Ver como o cliente</button></div>` : ""}</section>`;
}

/* ---------- editor do guia (estúdio) ---------- */
function guideForm() {
  const e = S.editor, d = e.data; loadFonts(d.fonts);
  const sent = !!S.guide && S.guide.visible !== false;
  const isVec = m => /svg/.test(m.type || "");
  const imgList = (k, label, i, m) => `<div class="g-img ${m.bg || ""} ${k}" ${m.bg === "brand" ? `style="--brand:${esc(d.colors?.[0]?.hex || "#e55496")}"` : ""}><button class="g-x" data-act="g-rm" data-k="${k}" data-i="${i}" aria-label="Remover">✕</button><img src="${blob(m.id)}" alt="">
    ${k === "logos" ? `<select data-gl="${k}.${i}.bg" aria-label="Fundo">${Object.entries(BGS).map(([v, l]) => `<option value="${v}" ${m.bg === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      ${e.vec === i ? `<span class="hint">Vetorizando…</span>` : e.vecUndo?.i === i ? `<button class="link" data-act="g-vec-undo" data-i="${i}">Desfazer vetor</button>` : isVec(m) ? `<span class="g-tag">Vetor</span>` : `<button class="btn sm ghost" data-act="g-vec" data-i="${i}" ${e.vec != null ? "disabled" : ""}>Vetorizar</button>`}`
    : label ? `<input type="text" data-gl="${k}.${i}.label" value="${esc(m.label)}" placeholder="${label}" aria-label="${label} ${i + 1}">` : ""}</div>`;
  const up = (k, txt, one) => `<label class="g-img add" for="g-up-${k}">${e.uploading === k ? `Enviando… ${e.progress || 0}%` : txt}</label><input class="sr" id="g-up-${k}" type="file" accept="image/png,image/jpeg,image/webp${k === "logos" || k === "elements" ? ",image/svg+xml" : ""}" ${one ? "" : "multiple"} data-g-upload="${k}" ${e.uploading ? "disabled" : ""}>`;
  return `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="gh" style="max-width:860px">
  <div class="panel-h"><div class="t"><span class="eyebrow">${esc(S.client?.name || "Cliente")}</span><h2 id="gh">${S.guide ? "Editar guia visual" : "Novo guia visual"}</h2></div><button class="x" data-act="close" aria-label="Fechar">✕</button></div>
  <div class="form g-form">
    <label class="g-auto ${e.reading ? "busy" : ""}" for="g-up-auto"><span class="g-auto-ic" aria-hidden="true">${e.reading ? "…" : "✦"}</span><span><b>${e.reading ? esc(e.reading) : "Preencher com a imagem do guia"}</b><small>Envie a prancha do guia visual pronta. O Aprova lê as cores, fontes, elementos e regras e preenche tudo aqui embaixo. Depois é só conferir.</small></span></label>
    <input class="sr" id="g-up-auto" type="file" accept="image/png,image/jpeg,image/webp" data-g-auto ${e.reading || e.uploading ? "disabled" : ""}>
    <div class="fgrid">
      <label class="field full"><span>Nome do guia</span><input type="text" data-g="title" value="${esc(d.title)}" placeholder="Guia visual"></label>
      <label class="field full"><span>Conceito da marca (abre o guia)</span><textarea rows="3" data-g="intro" placeholder="Ex.: Uma marca acolhedora e direta, com cores quentes e tipografia firme.">${esc(d.intro)}</textarea></label>
    </div>
    <h3 class="g-h">Resumo do guia</h3><p class="hint">A prancha com tudo em uma imagem. Fica na capa do guia, ao lado do logo, e abre grande quando o cliente toca.</p>
    <div class="g-imgs g-sum">${d.summary ? imgList("summary", "", 0, d.summary) : up("summary", "+ Enviar a imagem do resumo", true)}</div>
    <h3 class="g-h">Logo</h3><p class="hint">Versão principal primeiro. Envie também as versões para fundo escuro e na cor da marca, se tiver. Logo em baixa qualidade? Use Vetorizar.</p>
    <div class="g-imgs">${(d.logos || []).map((m, i) => imgList("logos", "Nome da versão", i, m)).join("")}${up("logos", "+ Enviar logo")}</div>
    <h3 class="g-h">Cores</h3>
    <div class="g-colors">${(d.colors || []).map((x, i) => `<div class="g-color"><input type="color" data-gc="${i}.hex" value="${esc(x.hex)}" aria-label="Cor ${i + 1}"><input type="text" data-gc="${i}.hex" class="mono" value="${esc(x.hex)}" aria-label="Código da cor ${i + 1}" maxlength="7"><input type="text" data-gc="${i}.name" value="${esc(x.name)}" placeholder="Nome (ex.: Rosa All)" aria-label="Nome da cor ${i + 1}"><input type="text" data-gc="${i}.role" value="${esc(x.role)}" placeholder="Onde usar (ex.: botões e destaques)" aria-label="Uso da cor ${i + 1}" class="wide"><button class="g-x in" data-act="g-rm" data-k="colors" data-i="${i}" aria-label="Remover cor ${i + 1}">✕</button></div>`).join("")}
      <button class="btn sm" data-act="g-add" data-k="colors">+ Cor</button></div>
    <h3 class="g-h">Fontes</h3><p class="hint">Escreva o nome igual ao do Google Fonts (ex.: Montserrat, Playfair Display) para o cliente ver o exemplo com a fonte de verdade.</p>
    <div class="g-fonts">${(d.fonts || []).map((f, i) => `<div class="g-font"><button class="g-x" data-act="g-rm" data-k="fonts" data-i="${i}" aria-label="Remover fonte ${i + 1}">✕</button><div class="g-font-f"><input type="text" data-gf="${i}.name" value="${esc(f.name)}" placeholder="Nome da fonte" aria-label="Fonte ${i + 1}"><input type="text" data-gf="${i}.role" value="${esc(f.role)}" placeholder="Uso (Títulos, Textos…)" aria-label="Uso da fonte ${i + 1}"><input type="text" data-gf="${i}.weights" value="${esc(f.weights)}" placeholder="Pesos (400, 700)" aria-label="Pesos da fonte ${i + 1}"><input type="text" data-gf="${i}.sample" value="${esc(f.sample)}" placeholder="Frase de exemplo" aria-label="Frase de exemplo ${i + 1}" class="wide"></div>
      ${f.name ? `<div class="g-font-prev" style="${fontCss(f)}">${esc(f.sample || f.name)}</div>` : ""}</div>`).join("")}
      <button class="btn sm" data-act="g-add" data-k="fonts">+ Fonte</button></div>
    <h3 class="g-h">Rede social</h3><p class="hint">Mostra para o cliente como o perfil vai ficar. A foto do perfil usa o logo e o @ do cadastro do cliente.</p>
    <label class="field full"><span>Bio do perfil</span><textarea rows="3" data-g="bio" placeholder="Ex.: Pilates para todas as idades ✦ Agende sua aula experimental">${esc(d.bio || "")}</textarea></label>
    <p class="hint" style="margin:0"><b>Templates dos posts</b> (aparecem no grid do perfil, na ordem)</p>
    <div class="g-imgs">${(d.templates || []).map((m, i) => imgList("templates", "", i, m)).join("")}${(d.templates || []).length < 12 ? up("templates", "+ Enviar templates") : ""}</div>
    <p class="hint" style="margin:0"><b>Perfil pronto</b> (opcional: print ou mockup do perfil inteiro)</p>
    <div class="g-imgs">${(d.profiles || []).map((m, i) => imgList("profiles", "", i, m)).join("")}${(d.profiles || []).length < 4 ? up("profiles", "+ Enviar mockup") : ""}</div>
    <div class="fgrid" style="margin-top:18px">
      <label class="field full"><span>Tom de voz</span><textarea rows="3" data-g="voice" placeholder="Ex.: Próximo e simples, fala com você, sem gírias.">${esc(d.voice)}</textarea></label>
      <label class="field"><span>Pode</span><textarea rows="4" data-g="dos" placeholder="Uma regra por linha">${esc(d.dos)}</textarea></label>
      <label class="field"><span>Não pode</span><textarea rows="4" data-g="donts" placeholder="Uma regra por linha">${esc(d.donts)}</textarea></label>
    </div>
    ${e.err ? `<p class="err">${esc(e.err)}</p>` : ""}
    <div class="form-foot">${S.guide ? `<button class="btn danger ${S.armed === "guide" ? "armed" : ""}" data-act="g-del">${S.armed === "guide" ? "Excluir o guia" : "Excluir"}</button>` : ""}<span class="sp"></span>
      ${sent ? `<button class="btn" data-act="g-save" data-vis="1" ${S.busy || e.uploading ? "disabled" : ""}>Salvar</button><button class="btn pri" data-act="g-save" data-vis="1" data-nv="1" ${S.busy || e.uploading ? "disabled" : ""}>Enviar nova versão</button>`
      : `<button class="btn" data-act="g-save" data-vis="0" ${S.busy || e.uploading ? "disabled" : ""}>Salvar rascunho</button><button class="btn pri" data-act="g-save" data-vis="1" ${S.busy || e.uploading ? "disabled" : ""}>Enviar para o cliente</button>`}</div>
  </div></div>`;
}
async function saveGuide(vis, newVersion) {
  const e = S.editor; const d = { ...e.data, visible: vis, newVersion: !!newVersion };
  d.colors = (d.colors || []).filter(x => /^#[0-9a-f]{6}$/i.test(x.hex || ""));
  d.fonts = (d.fonts || []).filter(x => String(x.name || "").trim());
  if (!d.colors.length && !d.fonts.length && !(d.logos || []).length && !d.summary) { e.err = "Coloque pelo menos uma cor, uma fonte, um logo ou a imagem do guia."; renderSheet(); return; }
  S.busy = true; renderSheet();
  try {
    const r = await api(`/api/admin/clients/${S.clientId}/guide`, { method: "PUT", body: d });
    S.guide = r.guide; S.busy = false; closeSheet(); render();
    toast(!vis ? "Guia salvo como rascunho" : newVersion ? `Versão ${r.guide.version} do guia enviada` : "Guia enviado para o cliente");
  } catch (x) { S.busy = false; e.err = x.message; renderSheet(); }
}
async function uploadGuide(k, files) {
  const e = S.editor; const max = { logos: 12, elements: 24, templates: 12, profiles: 4, summary: 1 }[k] || 12;
  const list = [...files].filter(f => /^image\//.test(f.type)).slice(0, max - (k === "summary" ? (e.data.summary ? 1 : 0) : (e.data[k] || []).length));
  if (!list.length) { e.err = "Envie imagens (PNG, JPG, WEBP ou SVG)."; renderSheet(); return; }
  e.uploading = k; e.err = ""; renderSheet();
  for (const f of list) {
    try { const r = await uploadOne(f, pc => { if (S.editor === e) { e.progress = pc; renderSheet(); } }); const m = { id: r.id, type: r.type, label: k === "elements" ? f.name.replace(/\.[^.]+$/, "").replace(/whatsapp image.*|img[-_ ]?\d+.*|^\d[\d\-_ .]*$/i, "").slice(0, 60) : "", bg: "light" }; if (k === "summary") e.data.summary = m; else e.data[k] = [...(e.data[k] || []), m]; }
    catch (x) { e.err = x.message; }
    if (S.editor === e) renderSheet();
  }
  if (S.editor === e) { e.uploading = false; e.progress = 0; renderSheet(); }
}

/* ---------- preencher o guia a partir de uma imagem ----------
   1) PNG com os dados embutidos (chunk iTXt/tEXt "aprova-guide"): leitura exata, inclusive recortes de logo e elementos.
   2) Qualquer outra imagem: a IA lê cores, fontes e regras; as cores também saem da própria imagem. */
async function pngGuideMeta(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    const dv = new DataView(buf.buffer); let p = 8;
    while (p + 8 < buf.length) {
      const len = dv.getUint32(p), type = String.fromCharCode(...buf.slice(p + 4, p + 8)), data = buf.subarray(p + 8, p + 8 + len);
      if (type === "tEXt" || type === "iTXt") {
        const z = data.indexOf(0); const kw = new TextDecoder("latin1").decode(data.subarray(0, z));
        if (kw === "aprova-guide") {
          let rest = data.subarray(z + 1), dec = new TextDecoder("latin1");
          if (type === "iTXt") { if (rest[0] !== 0) return null; rest = rest.subarray(2); const l = rest.indexOf(0); rest = rest.subarray(l + 1); const t = rest.indexOf(0); rest = rest.subarray(t + 1); dec = new TextDecoder("utf-8"); }
          return JSON.parse(dec.decode(rest));
        }
      }
      if (type === "IEND") break;
      p += 12 + len;
    }
  } catch (x) { /* sem dados embutidos */ }
  return null;
}
function imagePalette(cv) {
  const { width: w, height: h } = cv; const px = cv.getContext("2d").getImageData(0, 0, w, h).data; const count = new Map();
  for (let i = 0; i < px.length; i += 4) { if (px[i + 3] < 200) continue; const k = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4); count.set(k, (count.get(k) || 0) + 1); }
  const hex = k => "#" + [k >> 8, (k >> 4) & 15, k & 15].map(v => (v * 16 + 8).toString(16).padStart(2, "0")).join("");
  const out = [];
  [...count.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    if (out.length >= 6 || n < (w * h) / 400) return;
    const c = [k >> 8, (k >> 4) & 15, k & 15];
    if (out.some(o => Math.hypot(o.c[0] - c[0], o.c[1] - c[1], o.c[2] - c[2]) < 3)) return;
    out.push({ c, hex: hex(k) });
  });
  const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 15;
  return out.sort((a, b) => (sat(b.c) > .25) - (sat(a.c) > .25)).map((o, i) => ({ name: i ? "" : "Principal", hex: o.hex, role: "" }));
}
async function cropUpload(bmp, box, label) {
  const [x, y, w, h] = (box || []).map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w < 8 || h < 8) return null;
  const cv = document.createElement("canvas"); cv.width = Math.round(w); cv.height = Math.round(h);
  cv.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, "image/png"));
  if (!blob) return null;
  const r = await uploadOne(new File([blob], (label || "recorte") + ".png", { type: "image/png" }), null);
  return { id: r.id, type: r.type };
}
async function readGuideImage(file) {
  const e = S.editor; if (!e || e.kind !== "guide") return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { e.err = "Envie a imagem do guia em PNG, JPG ou WEBP."; renderSheet(); return; }
  const step = t => { if (S.editor === e) { e.reading = t; renderSheet(); } };
  e.err = ""; step("Lendo a imagem…");
  try {
    const bmp = await createImageBitmap(file);
    let meta = file.type === "image/png" ? await pngGuideMeta(file) : null; const exact = !!meta;
    if (!meta) {
      const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
      const ctx = cv.getContext("2d"); ctx.fillStyle = m.bg === "dark" ? "#141014" : m.bg === "brand" ? (e.data.colors?.[0]?.hex || "#e55496") : "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      const small = document.createElement("canvas"); small.width = 160; small.height = Math.max(1, Math.round(160 * cv.height / cv.width)); small.getContext("2d").drawImage(cv, 0, 0, small.width, small.height);
      const palette = imagePalette(small);
      step("A IA está lendo cores, fontes e regras…");
      let image = cv.toDataURL("image/jpeg", .85); if (image.length > 2900000) image = cv.toDataURL("image/jpeg", .6);
      const r = await api("/api/admin/guide-read", { method: "POST", body: { image } }).catch(() => ({ guide: null }));
      meta = r.guide || {};
      if (!(meta.colors || []).length) meta.colors = palette;
    }
    const d = e.data; const lines = v => Array.isArray(v) ? v.join("\n") : String(v || "");
    ["title", "intro", "voice", "bio"].forEach(k => { if (meta[k]) d[k] = String(meta[k]); });
    ["dos", "donts"].forEach(k => { const t = lines(meta[k]).trim(); if (t) d[k] = t; });
    const colors = (meta.colors || []).filter(c => /^#[0-9a-f]{6}$/i.test(c?.hex || "")).map(c => ({ name: String(c.name || ""), hex: c.hex.toLowerCase(), role: String(c.role || "") }));
    if (colors.length) d.colors = colors.slice(0, 24);
    const fonts = (meta.fonts || []).filter(f => f?.name).map(f => ({ name: String(f.name), role: String(f.role || ""), weights: String(f.weights || ""), sample: String(f.sample || "") }));
    if (fonts.length) { d.fonts = fonts.slice(0, 8); loadFonts(d.fonts); }
    step("Guardando a imagem no guia…");
    const board = await uploadOne(file, null);
    d.summary = { id: board.id, type: board.type, label: "", bg: "light" };
    if (exact) {
      for (const l of (meta.logos || []).slice(0, 12 - (d.logos || []).length)) { const m = await cropUpload(bmp, l.box, l.label).catch(() => null); if (m) d.logos = [...(d.logos || []), { ...m, label: "", bg: ["light", "dark", "brand"].includes(l.bg) ? l.bg : "light" }]; }
      if (false) for (const el of (meta.elements || []).filter(x => x && typeof x === "object").slice(0, 23)) { const m = await cropUpload(bmp, el.box, el.label).catch(() => null); if (m) d.elements = [...(d.elements || []), { ...m, label: String(el.label || "").slice(0, 80), bg: "light" }].slice(0, 24); }
    }
    if (S.editor === e) { e.reading = ""; renderSheet(); }
    toast(exact ? "Guia preenchido com os dados da imagem" : colors.length || fonts.length ? "Guia preenchido pela imagem. Confira antes de enviar" : "Não deu para ler tudo. A imagem foi guardada, complete o que faltar");
  } catch (x) { if (S.editor === e) { e.reading = ""; e.err = x.message || "Não deu para ler a imagem"; renderSheet(); } }
}

/* ---------- logo em baixa: vetoriza no navegador (ImageTracer, domínio público) ---------- */
function loadTracer() {
  if (window.ImageTracer) return Promise.resolve(window.ImageTracer);
  return new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "/vendor/imagetracer.js"; sc.onload = () => ok(window.ImageTracer); sc.onerror = () => no(new Error("Não deu para carregar o vetorizador")); document.head.appendChild(sc); });
}
async function vectorizeLogo(i) {
  const e = S.editor, m = e?.data?.logos?.[i]; if (!m || e.vec != null) return;
  e.vec = i; e.err = ""; renderSheet();
  try {
    const [T, bmp] = await Promise.all([loadTracer(), fetch(blob(m.id)).then(r => r.blob()).then(b => createImageBitmap(b))]);
    const sc = Math.min(4, 1200 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
    const ctx = cv.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.fillStyle = m.bg === "dark" ? "#141014" : m.bg === "brand" ? (e.data.colors?.[0]?.hex || "#e55496") : "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    /* cor do fundo: a mais comum nas bordas; sai do vetor para o logo ficar transparente */
    const px = id.data, edge = new Map(), at = (x, y) => (y * cv.width + x) * 4;
    for (let x = 0; x < cv.width; x += 3) [0, cv.height - 1].forEach(y => { const o = at(x, y); if (px[o + 3] > 200) { const k = (px[o] >> 3) << 10 | (px[o + 1] >> 3) << 5 | px[o + 2] >> 3; edge.set(k, (edge.get(k) || 0) + 1); } });
    let bg = null, top = 0; edge.forEach((n, k) => { if (n > top) { top = n; bg = [(k >> 10) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]; } });
    if (top < cv.width / 3 * 0.5) bg = null;
    let svg = T.imagedataToSVG(id, { numberofcolors: 12, colorsampling: 2, colorquantcycles: 5, mincolorratio: 0, ltres: 0.5, qtres: 0.5, pathomit: 8, rightangleenhance: true, blurradius: 0, strokewidth: 0, linefilter: true, roundcoords: 1, viewbox: false, desc: false });
    if (bg) svg = svg.replace(/<path[^>]*fill="rgb\((\d+),(\d+),(\d+)\)"[^>]*\/>/g, (all, r, g, b) => Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 36 ? "" : all);
    svg = svg.replace(/<path[^>]*opacity="0"[^>]*\/>/g, "").replace(/<svg width="(\d+)" height="(\d+)"/, '<svg width="$1" height="$2" viewBox="0 0 $1 $2"').replace(/ desc="[^"]*"/, "");
    const file = new File([svg], "logo.svg", { type: "image/svg+xml" });
    const r = await uploadOne(file, null, { raw: true });
    if (S.editor !== e) return;
    e.vecUndo = { i, prev: { ...m } }; e.data.logos[i] = { ...m, id: r.id, type: r.type };
    toast("Logo vetorizado. Confira e, se não gostar, desfaça");
  } catch (x) { e.err = x.message || "Não deu para vetorizar"; }
  e.vec = null; if (S.editor === e) renderSheet();
}

/* ---------- capa do guia: mesma cor do fundo do logo, para o logo se misturar ---------- */
const HERO_BG = new Map(), HERO_SOLID = new Set();
function heroBg(m, main) {
  const fall = m.bg === "dark" ? "#141014" : m.bg === "light" ? "#ffffff" : main;
  if (HERO_BG.has(m.id)) return HERO_BG.get(m.id) || main;
  HERO_BG.set(m.id, null);
  const apply = (hex, solid) => { HERO_BG.set(m.id, hex); if (solid) HERO_SOLID.add(m.id);
    /* foto de perfil: logo com fundo liso preenche o círculo inteiro */
    document.querySelectorAll(`.ig-av[data-avof="${CSS.escape(m.id)}"]`).forEach(el => { el.style.background = hex; el.classList.toggle("fill", !!solid); }); document.querySelectorAll(`.gv-cover[data-hero="${CSS.escape(m.id)}"]`).forEach(el => { el.style.background = hex; el.style.color = swatchInk(hex); el.querySelector(".gv-hero")?.setAttribute("data-bg", hex); }); if (hex !== fall) document.querySelectorAll(`.gv-lg[data-bgof="${CSS.escape(m.id)}"]`).forEach(el => { el.style.background = hex; el.querySelector("img").style.background = hex; el.dataset.bg = hex; }); };
  const img = new Image();
  img.onload = () => {
    try {
      const n = 48, cv = document.createElement("canvas"); cv.width = n; cv.height = n;
      const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, n, n); const px = ctx.getImageData(0, 0, n, n).data;
      let r = 0, g = 0, b = 0, a = 0, k = 0; const pts = [];
      for (let i = 0; i < n; i++) [[i, 0], [i, n - 1], [0, i], [n - 1, i]].forEach(([x, y]) => { const o = (y * n + x) * 4; pts.push([px[o], px[o + 1], px[o + 2], px[o + 3]]); });
      pts.forEach(p => { r += p[0]; g += p[1]; b += p[2]; a += p[3]; k++; });
      if (a / k < 200) return apply(fall); /* fundo transparente: fica a cor da versão escolhida */
      r /= k; g /= k; b /= k;
      const spread = pts.reduce((t, p) => t + Math.hypot(p[0] - r, p[1] - g, p[2] - b), 0) / k;
      if (spread > 28) return apply(fall); /* foto ou fundo com desenho: não dá para misturar */
      apply("#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join(""), true);
    } catch (x) { /* sem leitura de pixels */ }
  };
  img.src = blob(m.id);
  return main;
}

/* ---------- zoom: imagem grande por cima de tudo ---------- */
function zoomImage(src, bg) {
  if (!src) return; document.querySelector(".gz")?.remove();
  const z = document.createElement("div"); z.className = "gz"; z.setAttribute("role", "dialog"); z.setAttribute("aria-label", "Imagem ampliada");
  z.innerHTML = `<button class="x" aria-label="Fechar">✕</button><div class="gz-in ${esc(bg)}" ${bg && bg.startsWith("#") ? `style="background:${esc(bg)}"` : ""}><img src="${esc(src)}" alt=""></div>`;
  const close = () => { z.remove(); document.removeEventListener("keydown", key, true); };
  const key = ev => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
  z.addEventListener("click", ev => { if (ev.target === z || ev.target.closest(".x")) close(); });
  document.addEventListener("keydown", key, true); document.body.appendChild(z); z.querySelector(".x").focus();
}

/* ---------- guia aberto (cliente aprova; estúdio confere) ---------- */
function guideView() {
  const g = S.guide, c = S.client || {}, e = S.editor; if (!g) return "";
  loadFonts(g.fonts);
  const st = guideSt(); const r = g.review || {};
  const main = g.colors?.[0]?.hex || c.color || "#e55496";
  const hist = (r.history || []).filter(h => h.note).slice().reverse();
  const bySec = k => hist.filter(h => (h.section || "geral") === k && h.kind === "comment");
  const sec = (k, title, body) => body ? `<section class="gv-sec" id="gv-${k}"><div class="gv-sec-h"><h2>${title}</h2>${S.isOwner ? "" : `<button class="btn sm ghost" data-act="g-ask" data-k="${k}">Comentar</button>`}</div>${body}
    ${bySec(k).length ? `<div class="gv-notes">${bySec(k).map(h => `<div class="gv-note ${h.byLabel === "ALL TORAL" ? "studio" : ""}"><b>${esc(nameOf(h))}</b> <small>${esc(fmtStamp(h.at))}${h.v ? ` · v${h.v}` : ""}</small><p>${esc(h.note)}</p></div>`).join("")}</div>` : ""}
    ${e.ask === k ? `<div class="gv-ask"><textarea id="g-note" rows="3" placeholder="O que você quer mudar em ${esc(title.toLowerCase())}?">${esc(e.note || "")}</textarea>${S.who || S.isOwner ? "" : `<input type="text" id="who" placeholder="Seu nome" autocomplete="name">`}<div class="actions"><button class="btn sm brand" data-act="g-send" data-k="${k}">Enviar</button><button class="btn sm ghost" data-act="g-ask" data-k="">Cancelar</button></div></div>` : ""}</section>` : "";
  const lines = t => String(t || "").split("\n").map(x => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const logos = g.logos || [];
  const hero = logos[0];
  const summary = g.summary || (g.elements || [])[0];
  const hb = hero ? heroBg(hero, main) : main;
  const zoom = (m, bg, cls, inner) => `<button class="gv-z ${cls || ""}" data-act="g-zoom" data-src="${blob(m.id)}" data-bg="${esc(bg || "")}" aria-label="Ampliar">${inner || `<img src="${blob(m.id)}" alt="" loading="lazy">`}</button>`;
  const handle = c.handle || "@" + String(c.name || "marca").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "");
  const avBg = HERO_BG.get(hero?.id) || (hero?.bg === "dark" ? "#141014" : hero?.bg === "brand" ? main : "#fff");
  const avatar = hero ? `<span class="ig-av ${HERO_SOLID.has(hero.id) ? "fill" : ""}" data-avof="${esc(hero.id)}" style="background:${esc(avBg)}"><img src="${blob(hero.id)}" alt=""></span>` : `<span class="ig-av" style="background:${esc(main)};color:${swatchInk(main)}">${esc(initials(c.name || "M"))}</span>`;
  const social = (g.templates || []).length || g.bio || (g.profiles || []).length ? `<div class="gv-social">
      ${(g.templates || []).length || g.bio ? `<div class="ig"><div class="ig-top"><b>${esc(handle.replace(/^@/, ""))}</b></div>
        <div class="ig-head">${avatar}<div class="ig-n"><span><b>${(g.templates || []).length}</b>posts</span><span><b>—</b>seguidores</span><span><b>—</b>seguindo</span></div></div>
        <div class="ig-bio"><b>${esc(c.name || g.title)}</b>${g.bio ? `<p>${esc(g.bio)}</p>` : ""}</div>
        <div class="ig-btns"><span style="background:${esc(main)};color:${swatchInk(main)}">Seguir</span><span>Mensagem</span></div>
        <div class="ig-hl">${(g.colors || []).slice(0, 5).map(x => `<i style="background:${esc(x.hex)}"></i>`).join("")}</div>
        <div class="ig-grid">${(g.templates || []).map(m => zoom(m, "", "ig-t")).join("")}</div></div>` : ""}
      ${(g.profiles || []).length ? `<div class="gv-prof">${g.profiles.map(m => zoom(m, "", "gv-pf")).join("")}</div>` : ""}</div>` : "";
  return `<div class="gv" role="dialog" aria-modal="true" aria-labelledby="gvh">
    <header class="gv-cover" ${hero ? `data-hero="${esc(hero.id)}"` : ""} style="background:${esc(hb)};color:${swatchInk(hb)}"><button class="x" data-act="close" aria-label="Fechar">✕</button>
      <div class="gv-cover-t"><span class="eyebrow">Guia visual · versão ${g.version || 1}</span>
      <h1 id="gvh" class="display">${esc(c.name || g.title)}</h1>${g.intro ? `<p>${esc(g.intro)}</p>` : ""}
      <span class="pill" style="background:${ST[st].color};color:${ST[st].ink}">${ST[st].long}</span>
      ${summary ? `<button class="gv-sumbtn" data-act="g-zoom" data-src="${blob(summary.id)}"><img src="${blob(summary.id)}" alt=""><span><b>Resumo do guia visual</b><small>Toque para ver tudo em uma página</small></span></button>` : ""}</div>
      ${hero ? `<button class="gv-hero" data-act="g-zoom" data-src="${blob(hero.id)}" data-bg="${esc(hb)}" aria-label="Ampliar o logo"><img src="${blob(hero.id)}" alt="Logo ${esc(c.name)}"></button>` : ""}</header>
    <div class="gv-body">
      ${sec("logo", "Logo", logos.length ? `<div class="gv-logos">${logos.map(m => { heroBg(m, main); const k = HERO_BG.get(m.id); const bgc = k && k !== (m.bg === "dark" ? "#141014" : m.bg === "light" ? "#ffffff" : main) ? k : m.bg === "brand" ? main : ""; return zoom(m, bgc || m.bg, `gv-lg ${m.bg}`, `<img src="${blob(m.id)}" alt="Logo" style="${bgc ? `background:${esc(bgc)}` : ""}">`).replace('class="gv-z', `data-bgof="${esc(m.id)}" ${bgc ? `style="background:${esc(bgc)}"` : ""} class="gv-z`); }).join("")}</div>` : "")}
      ${sec("cores", "Cores", (g.colors || []).length ? `<div class="gv-colors">${g.colors.map(x => `<button class="gv-c" data-act="copy-link" data-link="${esc(x.hex)}" data-msg="Cor ${esc(x.hex)} copiada" title="Copiar ${esc(x.hex)}"><span class="gv-c-sw" style="background:${esc(x.hex)};color:${swatchInk(x.hex)}"><b>${esc(x.name || "Cor")}</b></span><span class="gv-c-t"><code>${esc(x.hex.toUpperCase())}</code><small>${esc(x.role || "")}</small></span></button>`).join("")}</div>` : "")}
      ${sec("fontes", "Fontes", (g.fonts || []).length ? `<div class="gv-fonts">${g.fonts.map(f => `<div class="gv-f"><div class="gv-f-h"><b>${esc(f.name)}</b><small>${esc(f.role || "")}${gWeights(f).length ? " · pesos " + gWeights(f).join(", ") : ""}</small></div><p class="gv-f-big" style="${fontCss(f)}">Aa</p><p class="gv-f-s" style="${fontCss(f)}">${esc(f.sample || "Uma marca bem cuidada fala por si.")}</p><p class="gv-f-abc" style="${fontCss(f)}">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</p>${gWeights(f).length > 1 ? `<div class="gv-f-w">${gWeights(f).map(w => `<span style="${fontCss(f)};font-weight:${w}">${w}</span>`).join("")}</div>` : ""}</div>`).join("")}</div>` : "")}
      ${sec("social", "Na rede social", social)}
      ${sec("voz", "Tom de voz", g.voice ? `<p class="gv-p">${esc(g.voice)}</p>` : "")}
      ${sec("regras", "Como usar", lines(g.dos).length || lines(g.donts).length ? `<div class="gv-rules">${lines(g.dos).length ? `<div class="gv-do"><h3>Pode</h3><ul>${lines(g.dos).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${lines(g.donts).length ? `<div class="gv-dont"><h3>Não pode</h3><ul>${lines(g.donts).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>` : "")}
      <section class="gv-sec gv-rev"><h2>${S.isOwner ? "Aprovação do <em>cliente</em>" : "Sua <em>aprovação</em>"}</h2>
        <div class="current"><span class="pill" style="background:${ST[st].color};color:${ST[st].ink}">${ST[st].long}</span>${r.at && st !== "pendente" ? `<span>por ${esc(nameOf(r))} · ${esc(fmtStamp(r.at))}</span>` : ""}</div>
        ${r.note && hasStk(st) ? `<div class="studio-note" style="border-color:${ST[st].color}">${esc(r.note)}</div>` : ""}
        ${S.isOwner ? `<div class="actions">${st === "alteracao" || st === "reprovado" ? `<button class="btn pri sm" data-act="g-adjusted">Marcar como ajustado</button>` : ""}<button class="btn sm" data-act="guide-edit">Editar guia</button>${hasStk(st) ? `<button class="btn sm ghost" data-act="g-clear">Tirar sticker</button>` : ""}</div>
          <label class="field" style="margin-top:12px"><span>Responder o cliente</span><textarea id="g-note" rows="2" placeholder="Escreva para o cliente">${esc(e.ask === "geral" ? e.note || "" : "")}</textarea></label><div class="actions"><button class="btn sm brand" data-act="g-send" data-k="geral">Responder</button></div>`
        : `${st === "ajustado" ? `<p class="adj-note">O estúdio ajustou o guia. Confira e escolha o sticker de novo.</p>` : ""}<p class="hint">Gostou do guia? Escolha o sticker. Se quiser mudar algo, use “Comentar” na parte certa ou o sticker de ajustes.</p>
          <div class="gv-stks">${DECISIONS.map(s => `<button class="opt" data-act="g-pick" data-s="${s}" aria-pressed="${st === s}" aria-label="${ST[s].long}" ${S.busy ? "disabled" : ""}><span class="mini">${sticker(s)}</span><small>${ST[s].label}</small></button>`).join("")}</div>
          ${e.ask === "geral" ? `<div class="gv-ask"><textarea id="g-note" rows="3" placeholder="O que precisa ajustar no guia?">${esc(e.note || "")}</textarea>${S.who ? "" : `<input type="text" id="who" placeholder="Seu nome" autocomplete="name">`}<div class="actions"><button class="btn sm brand" data-act="g-send" data-k="geral" data-s="${esc(e.askStatus || "")}">Enviar</button><button class="btn sm ghost" data-act="g-ask" data-k="">Depois</button></div></div>` : ""}`}
        ${hist.length ? `<div class="block"><h3>Comentários e histórico</h3><div class="history">${hist.map(h => `<div class="hi"><i class="dot" style="background:${h.kind === "comment" ? "var(--pink)" : ST[h.status]?.color || "#888"};margin-top:6px"></i><div><div><b>${h.kind === "comment" ? "Comentário" : esc(ST[h.status]?.long || h.status)}</b> · ${esc(nameOf(h))}${h.section && h.section !== "geral" ? ` · ${esc(GSECTIONS[h.section] || "")}` : ""}</div><div class="when">${esc(fmtStamp(h.at))}</div><p>${esc(h.note)}</p></div></div>`).join("")}</div></div>` : ""}
      </section>
    </div></div>`;
}
async function guideReview(status, note) {
  if (S.busy) return; const e = S.editor; S.busy = true; renderSheet();
  try { const r = await api(`/api/c/${S.token}/guide-review`, { method: "POST", body: { status, note: note || "", name: S.who } }); S.guide = r.guide; toast(ST[status].long); if (status === "alteracao" && !note) { e.ask = "geral"; e.askStatus = "alteracao"; } else { e.ask = null; e.note = ""; } }
  catch (x) { toast(x.message); }
  S.busy = false; render(); if (S.editor === e) renderSheet();
}
async function guideComment(section) {
  const e = S.editor; const note = ($("#g-note")?.value || "").trim();
  if (!note) { toast("Escreva o comentário"); $("#g-note")?.focus(); return; }
  if (S.busy) return; S.busy = true;
  try {
    const r = S.isOwner ? await api(`/api/admin/clients/${S.clientId}/guide/comment`, { method: "POST", body: { note, section } })
      : await api(`/api/c/${S.token}/guide-comment`, { method: "POST", body: { note, section, name: S.who } });
    S.guide = r.guide; e.ask = null; e.note = ""; toast(S.isOwner ? "Resposta enviada" : "Comentário enviado para o estúdio");
  } catch (x) { toast(x.message); }
  S.busy = false; render(); if (S.editor === e) renderSheet();
}
async function guideAdmin(action, msg) {
  if (S.busy) return; S.busy = true; const e = S.editor;
  try { const r = await api(`/api/admin/clients/${S.clientId}/guide/${action}`, { method: "POST" }); S.guide = r.guide; toast(msg); } catch (x) { toast(x.message); }
  S.busy = false; render(); if (S.editor === e) renderSheet();
}

if (typeof PLAN_SHEETS !== "undefined") Object.assign(PLAN_SHEETS, { guide: guideForm, guideview: guideView });

function guideClick(a, b) {
  const e = S.editor;
  switch (a) {
    case "guide-edit": closeSheet(); S.editor = { kind: "guide", data: S.guide ? JSON.parse(JSON.stringify(S.guide)) : newGuide(), err: "" }; if (!S.editor.data.summary && S.editor.data.elements?.length) { S.editor.data.summary = { ...S.editor.data.elements[0], label: "" }; S.editor.data.elements = S.editor.data.elements.slice(1); } if (!S.editor.data.fonts?.length) S.editor.data.fonts = []; renderSheet(); break;
    case "guide-open": closeSheet(); S.editor = { kind: "guideview", sheetCls: "sheet-gv", ask: null, note: "" }; renderSheet(); break;
    case "g-add": if (b.dataset.k === "colors") e.data.colors.push({ name: "", hex: "#141014", role: "" }); else e.data.fonts.push({ name: "", role: e.data.fonts.length ? "Textos" : "Títulos", weights: "", sample: "" }); renderSheet(); break;
    case "g-rm": if (b.dataset.k === "summary") e.data.summary = null; else e.data[b.dataset.k].splice(Number(b.dataset.i), 1); if (b.dataset.k === "logos") e.vecUndo = null; renderSheet(); break;
    case "g-vec": vectorizeLogo(Number(b.dataset.i)); break;
    case "g-vec-undo": { const u = e.vecUndo; if (u && e.data.logos[u.i]) e.data.logos[u.i] = u.prev; e.vecUndo = null; renderSheet(); break; }
    case "g-zoom": zoomImage(b.dataset.src, b.dataset.bg || ""); break;
    case "g-save": saveGuide(b.dataset.vis === "1", b.dataset.nv === "1"); break;
    case "g-del": if (S.armed !== "guide") { S.armed = "guide"; renderSheet(); break; }
      api(`/api/admin/clients/${S.clientId}/guide`, { method: "DELETE" }).then(() => { S.guide = null; S.armed = null; closeSheet(); render(); toast("Guia excluído"); }).catch(x => toast(x.message)); break;
    case "g-ask": e.ask = b.dataset.k || null; e.askStatus = ""; e.note = ""; renderSheet(); if (e.ask) setTimeout(() => $("#g-note")?.focus(), 40); break;
    case "g-send": { const k = b.dataset.k || "geral"; if (b.dataset.s === "alteracao" && !S.isOwner) { const note = ($("#g-note")?.value || "").trim(); if (!note) { toast("Conte o que precisa ajustar"); break; } guideComment(k); break; } guideComment(k); break; }
    case "g-pick": { const s = b.dataset.s; if (guideSt() === s && s !== "alteracao") { toast("O guia já está com esse sticker"); break; } guideReview(s); break; }
    case "g-adjusted": guideAdmin("adjusted", "Guia marcado como ajustado"); break;
    case "g-clear": guideAdmin("clear", "Sticker removido"); break;
  }
}
document.addEventListener("input", ev => {
  const e = S.editor, t = ev.target; if (!e) return;
  if (e.kind === "guide") {
    if (t.dataset.g) e.data[t.dataset.g] = t.value;
    const set = (arr, path) => { const [i, f] = path.split("."); const o = arr[Number(i)]; if (o) o[f] = t.value; };
    if (t.dataset.gc) { set(e.data.colors, t.dataset.gc); if (t.dataset.gc.endsWith(".hex") && /^#[0-9a-f]{6}$/i.test(t.value)) { const twin = [...document.querySelectorAll(`[data-gc="${t.dataset.gc}"]`)].find(x => x !== t); if (twin) twin.value = t.value.toLowerCase(); } }
    if (t.dataset.gf) { set(e.data.fonts, t.dataset.gf); const i = Number(t.dataset.gf.split(".")[0]); const f = e.data.fonts[i]; const pv = t.closest(".g-font")?.querySelector(".g-font-prev"); if (pv && f) { pv.textContent = f.sample || f.name; } }
    if (t.dataset.gl) { const [k, i, f] = t.dataset.gl.split("."); const o = e.data[k]?.[Number(i)]; if (o) o[f] = t.value; }
  }
  if (e.kind === "guideview" && t.id === "g-note") e.note = t.value;
});
document.addEventListener("change", ev => {
  const t = ev.target, e = S.editor; if (e?.kind !== "guide") return;
  if (t.matches("[data-g-upload]") && t.files.length) { const f = [...t.files]; t.value = ""; uploadGuide(t.dataset.gUpload, f); }
  if (t.matches("[data-g-auto]") && t.files.length) { const f = t.files[0]; t.value = ""; readGuideImage(f); }
  if (t.dataset.gf && t.dataset.gf.endsWith(".name")) { loadFonts(e.data.fonts); renderSheet(); }
  if (t.dataset.gl && t.dataset.gl.endsWith(".bg")) renderSheet();
});
