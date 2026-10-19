import { vapid, cleanSub, saveSub, dropSub, countSubs, pushClient, queuePush, pushItemFrom } from "./push.js";


const STATUSES = ["pendente", "aprovado", "alteracao", "reprovado", "ajustado"];
const CHUNK = 1900000; /* cada parte enviada ao servidor (limite de 2 MB por linha do D1) */
const MAX_FILE = 200 * 1024 * 1024; /* limite por arquivo (vídeos) */
const NETWORKS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "pinterest", "x", "whatsapp"];
const FORMATS = ["4x5", "1x1", "9x16", "16x9"];
const PLAN_PERIODS = ["semanal", "quinzenal", "mensal"];
const IDEA_FORMATS = ["Post", "Carrossel", "Reels", "Stories", "Anúncio"];
const IDEA_STATUSES = ["pendente", "aprovado", "alteracao", "reprovado", "ajustado"];
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "video/mp4", "video/quicktime"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (message, status = 400) => json({ error: message }, status);

const rid = (n = 10) => {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
};
const token = () => {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const safeId = (s) => typeof s === "string" && /^[a-z0-9]{4,40}$/.test(s);
const str = (v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const now = () => new Date().toISOString();

const okCache = new Set();
async function hashPass(pw, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 10000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function checkPass(pw, saved) {
  const k = saved.hash + "|" + pw;
  if (okCache.has(k)) return true;
  const ok = sameText(await hashPass(pw, saved.salt), saved.hash);
  if (ok) okCache.add(k);
  return ok;
}
function sameText(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

/* ---------- armazenamento no Cloudflare D1 ----------
   Uma tabela guarda tudo: documentos JSON (clientes, peças) e as partes dos arquivos. */
let ready = null;
function setup(DB) {
  if (!ready) ready = DB.prepare("CREATE TABLE IF NOT EXISTS kv (ns TEXT NOT NULL, k TEXT NOT NULL, j TEXT, b BLOB, PRIMARY KEY (ns, k))").run().catch((e) => { ready = null; throw e; });
  return ready;
}
function makeStore(DB, ns) {
  const end = (p) => p + "\uffff";
  return {
    async get(k, o) {
      const row = await DB.prepare("SELECT j, b FROM kv WHERE ns = ? AND k = ?").bind(ns, k).first();
      if (!row) return null;
      if (o?.type === "json") return row.j == null ? null : JSON.parse(row.j);
      if (row.b == null) return null;
      return row.b instanceof ArrayBuffer ? row.b : new Uint8Array(row.b).buffer;
    },
    async setJSON(k, o) {
      await DB.prepare("INSERT INTO kv (ns, k, j, b) VALUES (?, ?, ?, NULL) ON CONFLICT (ns, k) DO UPDATE SET j = excluded.j, b = NULL").bind(ns, k, JSON.stringify(o)).run();
    },
    async set(k, buf) {
      await DB.prepare("INSERT INTO kv (ns, k, j, b) VALUES (?, ?, NULL, ?) ON CONFLICT (ns, k) DO UPDATE SET b = excluded.b, j = NULL").bind(ns, k, buf).run();
    },
    async delete(k) {
      await DB.prepare("DELETE FROM kv WHERE ns = ? AND k = ?").bind(ns, k).run();
    },
    async deletePrefix(p) {
      await DB.prepare("DELETE FROM kv WHERE ns = ? AND k >= ? AND k < ?").bind(ns, p, end(p)).run();
    },
    async list({ prefix }) {
      const { results } = await DB.prepare("SELECT k FROM kv WHERE ns = ? AND k >= ? AND k < ?").bind(ns, prefix, end(prefix)).all();
      return { blobs: results.map((r) => ({ key: r.k })) };
    },
    async listJSON(prefix) {
      const { results } = await DB.prepare("SELECT j FROM kv WHERE ns = ? AND k >= ? AND k < ? AND j IS NOT NULL").bind(ns, prefix, end(prefix)).all();
      return results.map((r) => JSON.parse(r.j));
    },
  };
}
/* pedido de conteúdo feito pelo cliente */
const REQ_FIELDS = ["tipo", "rede", "tema", "objetivo", "mensagem", "infos", "publico", "referencias", "prazo", "obs"];
function cleanRequest(body, clientId) {
  const out = { id: rid(10), clientId, at: now(), status: "novo", by: str(body.name, 80).trim() };
  REQ_FIELDS.forEach((k) => { out[k] = str(body[k], k === "mensagem" || k === "infos" || k === "obs" || k === "referencias" ? 3000 : 300).trim(); });
  return out;
}
const sortReqs = (list) => list.sort((x, y) => String(y.at).localeCompare(String(x.at)));

async function listJSON(store, prefix) {
  return store.listJSON(prefix);
}

const sortPosts = (list) =>
  list.sort(
    (a, b) =>
      String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
      String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );

function cleanPost(body, prev, clientId) {
  const sponsored = body.sponsored === true || body.kind === "ads";
  const network = NETWORKS.includes(body.network) ? body.network : "instagram";
  const media = Array.isArray(body.media)
    ? body.media
        .filter((m) => m && typeof m.id === "string" && m.id.startsWith(clientId + "/"))
        .slice(0, 10)
        .map((m) => ({ id: m.id, type: str(m.type, 60) }))
    : [];
  const ad = body.ad && sponsored ? body.ad : null;
  const out = {
    id: prev?.id,
    clientId,
    network,
    sponsored,
    format: FORMATS.includes(body.format) ? body.format : "4x5",
    title: str(body.title, 160) || (sponsored ? "Anúncio sem título" : "Post sem título"),
    date: str(body.date, 20),
    media,
    cover: body.cover && typeof body.cover.id === "string" && body.cover.id.startsWith(clientId + "/") && /^image\//.test(body.cover.type || "") ? { id: body.cover.id, type: str(body.cover.type, 60) } : null,
    caption: str(body.caption, 5000),
    hashtags: str(body.hashtags, 1000),
    location: str(body.location, 120),
    studioNote: str(body.studioNote, 2000),
    visible: body.visible !== false,
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
    review: prev?.review || { status: "pendente", history: [] },
    published: prev?.published || null,
    sentAt: prev?.sentAt || (body.visible !== false ? now() : null),
  };
  if (ad) {
    const keys = ["objetivo", "posicionamentos", "local", "idadeMin", "idadeMax", "genero", "publicoCustom", "interesses", "orcamento", "orcTipo", "inicio", "fim", "headline", "cta", "descricao", "url"];
    out.ad = Object.fromEntries(keys.map((k) => [k, str(ad[k], 1000)]));
  }
  return out;
}

/* ---------- produtos digitais: sites, páginas de venda e aplicativos ---------- */
const CLIENT_KINDS = ["social", "digital"];
const SERVICES = ["site", "landing", "app", "sistema"];
const PROJECT_TYPES = ["site", "landing", "app", "sistema"];
const DEVICES = ["desktop", "mobile"];
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };
function cleanUrl(v) {
  const s = str(v, 600).trim();
  if (!s) return "";
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
}
const mediaRef = (m, clientId, imageOnly) => m && typeof m.id === "string" && m.id.startsWith(clientId + "/") && (!imageOnly || /^image\//.test(m.type || "")) ? { id: m.id, type: str(m.type, 60) } : null;
function cleanProject(body, prev, clientId) {
  const shots = (Array.isArray(body.shots) ? body.shots : []).slice(0, 20).map((s) => {
    const m = mediaRef(s, clientId, true); if (!m) return null;
    return { ...m, label: str(s.label, 80).trim(), device: DEVICES.includes(s.device) ? s.device : "desktop", w: num(s.w, 1, 20000) || 0, h: num(s.h, 1, 100000) || 0 };
  }).filter(Boolean);
  const visible = body.visible !== false;
  return {
    id: prev?.id,
    clientId,
    type: PROJECT_TYPES.includes(body.type) ? body.type : prev?.type || "site",
    title: str(body.title, 160).trim() || "Projeto sem título",
    url: cleanUrl(body.url),
    repo: cleanUrl(body.repo),
    device: DEVICES.includes(body.device) ? body.device : "desktop",
    studioNote: str(body.studioNote, 3000),
    shots,
    version: prev?.version || 1,
    visible,
    notes: prev?.notes || [],
    review: prev?.review || { status: "pendente", history: [] },
    delivered: prev?.delivered || null,
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
    sentAt: prev?.sentAt || (visible ? now() : null),
  };
}
/* marcação: um círculo no site (posição na página, na tela visível ou numa tela enviada) com o comentário */
function cleanShape(s) {
  if (!s || typeof s !== "object") return null;
  const mode = ["doc", "view", "shot"].includes(s.mode) ? s.mode : null;
  if (!mode) return null;
  const big = mode === "doc" ? 100000 : 1;
  const out = { mode, x: num(s.x, 0, big), y: num(s.y, 0, big), w: num(s.w, 0, big), h: num(s.h, 0, big) };
  if ([out.x, out.y, out.w, out.h].some((v) => v == null)) return null;
  if (mode === "doc") { out.vw = num(s.vw, 200, 4000) || 1280; out.path = str(s.path, 300); }
  if (mode === "view") out.vw = num(s.vw, 200, 4000) || 1280;
  if (mode === "shot") { if (!/^[a-z0-9]{4,40}\/[a-z0-9]{8,40}$/.test(s.shot || "")) return null; out.shot = s.shot; }
  return out;
}
const openNotes = (p) => (p.notes || []).filter((n) => !n.resolved).length;

/* ---------- guia visual: cores, fontes, logos e regras para o cliente aprovar ---------- */
const GUIDE_SECTIONS = ["geral", "resumo", "logo", "cores", "fontes", "elementos", "social", "voz", "regras"];
function cleanGuide(body, prev, clientId) {
  const colors = (Array.isArray(body.colors) ? body.colors : []).slice(0, 24).map((c) => ({
    name: str(c?.name, 60).trim(), hex: /^#[0-9a-f]{6}$/i.test(c?.hex || "") ? c.hex.toLowerCase() : "#000000", role: str(c?.role, 160).trim(),
  }));
  const fonts = (Array.isArray(body.fonts) ? body.fonts : []).slice(0, 8).map((f) => ({
    name: str(f?.name, 80).trim(), role: str(f?.role, 80).trim(), weights: str(f?.weights, 80).trim(), sample: str(f?.sample, 200).trim(), google: f?.google !== false,
  })).filter((f) => f.name);
  const imgs = (list, max) => (Array.isArray(list) ? list : []).slice(0, max).map((m) => { const r = mediaRef(m, clientId, true); return r ? { ...r, label: str(m.label, 80).trim(), bg: ["light", "dark", "brand"].includes(m.bg) ? m.bg : "light" } : null; }).filter(Boolean);
  const visible = body.visible !== false;
  return {
    clientId,
    title: str(body.title, 120).trim() || "Guia visual",
    intro: str(body.intro, 3000),
    logos: imgs(body.logos, 12),
    colors,
    fonts,
    elements: imgs(body.elements, 24),
    summary: imgs(body.summary ? [body.summary] : [], 1)[0] || null,
    bio: str(body.bio, 500),
    templates: imgs(body.templates, 12),
    profiles: imgs(body.profiles, 4),
    voice: str(body.voice, 3000),
    dos: str(body.dos, 3000),
    donts: str(body.donts, 3000),
    version: prev?.version || 1,
    visible,
    review: prev?.review || { status: "pendente", history: [] },
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
    sentAt: prev?.sentAt || (visible ? now() : null),
  };
}

function cleanClient(body, prev) { return withKind(cleanClientRaw(body, prev)); }
function cleanClientRaw(body, prev) {
  const color = /^#[0-9a-f]{6}$/i.test(body.color || "") ? body.color : "#e55496";
  let handle = str(body.handle, 60).trim();
  if (handle && !handle.startsWith("@")) handle = "@" + handle;
  return {
    id: prev?.id,
    token: prev?.token,
    name: str(body.name, 120).trim(),
    handle,
    nicho: str(body.nicho, 80),
    nickname: typeof body.nickname === "string" ? str(body.nickname, 60).trim() : prev?.nickname || "",
    agendaUrl: typeof body.agendaUrl === "string" ? cleanUrl(body.agendaUrl) : prev?.agendaUrl || "",
    kinds: (() => { const k = Array.isArray(body.kinds) ? [...new Set(body.kinds.filter((x) => CLIENT_KINDS.includes(x)))] : CLIENT_KINDS.includes(body.kind) ? [body.kind] : prev?.kinds || [prev?.kind || "social"]; return k.length ? k : ["social"]; })(),
    services: Array.isArray(body.services) ? [...new Set(body.services.filter((s) => SERVICES.includes(s)))] : prev?.services || [],
    color,
    networks: Array.isArray(body.networks) ? [...new Set(body.networks.filter((n) => NETWORKS.includes(n)))] : prev?.networks || ["instagram"],
    ads: typeof body.ads === "boolean" ? body.ads : !!prev?.ads,
    logoId: typeof body.logoId === "string" && prev?.id && body.logoId.startsWith(prev.id + "/") ? body.logoId : body.logoId === "" ? "" : prev?.logoId || "",
    planPeriod: PLAN_PERIODS.includes(body.planPeriod) ? body.planPeriod : prev?.planPeriod || "semanal",
    visits: prev?.visits || null,
    welcomedAt: prev?.welcomedAt || null,
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
  };
}

/* compatibilidade: "kind" continua existindo (social quando o cliente tem redes sociais) */
function withKind(c) { c.kind = (c.kinds || []).includes("social") ? "social" : "digital"; return c; }
function publicClient(c) {
  const { token: _t, ...rest } = c;
  return rest;
}

/* ---------- planejamento: ideias e legendas aprovadas antes da arte ---------- */
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
function cleanIdea(x, prev) {
  const fmt = IDEA_FORMATS.includes(x?.format) ? x.format : "Post";
  return {
    id: prev?.id || (safeId(x?.id) ? x.id : rid(8)),
    date: str(x?.date, 20),
    format: fmt,
    title: str(x?.title, 160).trim() || "Ideia sem título",
    idea: str(x?.idea, 2000),
    caption: str(x?.caption, 5000),
    hashtags: str(x?.hashtags, 1000),
    review: prev?.review || { status: "pendente", history: [] },
  };
}
const ideaText = (i) => [i.date, i.format, i.title, i.idea, i.caption, i.hashtags].join("|");
function cleanPlan(body, prev, clientId) {
  const prevIdeas = new Map((prev?.ideas || []).map((i) => [i.id, i]));
  const ideas = (Array.isArray(body.ideas) ? body.ideas : []).slice(0, 1000).map((x) => {
    const old = safeId(x?.id) ? prevIdeas.get(x.id) : null;
    const idea = cleanIdea(x, old);
    /* o estúdio mexeu numa ideia que o cliente pediu ajuste: volta para ele como "ajuste feito" */
    const st = old?.review?.status;
    if (old && (st === "alteracao" || st === "reprovado") && ideaText(old) !== ideaText(idea)) {
      idea.review = addHistory(idea, { kind: "review", status: "ajustado", note: "Ajuste feito pelo estúdio", byLabel: "ALL TORAL", at: now() });
      Object.assign(idea.review, { status: "ajustado", note: "", at: now(), byLabel: "ALL TORAL" });
    }
    return idea;
  });
  ideas.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  const visible = body.visible !== false;
  return {
    id: prev?.id,
    clientId,
    period: PLAN_PERIODS.includes(body.period) ? body.period : prev?.period || "semanal",
    start: isDay(body.start) ? body.start : prev?.start || "",
    end: isDay(body.end) ? body.end : prev?.end || "",
    deadline: str(body.deadline, 20),
    note: str(body.note, 2000),
    ideas,
    visible,
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
    sentAt: prev?.sentAt || (visible ? now() : null),
    seenAt: prev?.seenAt || null,
  };
}
const sortProjects = (list) => list.sort((a, b) => String(b.sentAt || b.createdAt || "").localeCompare(String(a.sentAt || a.createdAt || "")));
const sortPlans = (list) => list.sort((a, b) => String(b.start || b.createdAt).localeCompare(String(a.start || a.createdAt)));
const openIdeas = (plan) => (plan.ideas || []).filter((i) => ["pendente", "ajustado"].includes(i.review?.status || "pendente")).length;

/* registra a visita do cliente: "prev" é a visita anterior (para saber o que chegou de novo) */
async function touchVisit(db, client) {
  const v = client.visits || { last: null, prev: null };
  const t = Date.now();
  const last = v.last ? Date.parse(v.last) : 0;
  let changed = false;
  if (!last || t - last > 30 * 60 * 1000) { v.prev = v.last || null; changed = true; }
  if (changed || t - last > 5 * 60 * 1000) {
    v.last = now();
    client.visits = v;
    await db.setJSON(`clients/${client.id}`, client);
  }
  return v;
}

/* avisos do painel: cliente respondeu, prazo estourando, postado e cliente sumido */
function alertsFor(client, posts, plans, seen = {}, projects = [], guide = null) {
  const t = Date.now(); const day = 24 * 60 * 60 * 1000;
  const replies = [];
  projects.forEach((p) => {
    (p.review?.history || []).forEach((h) => { if (h.byLabel !== "ALL TORAL" && h.at) replies.push({ at: h.at, who: h.byLabel || client.name, status: h.status, kind: h.kind, note: h.note || "", title: p.title, where: "project", id: p.id }); });
    (p.notes || []).forEach((n) => {
      if (n.by === "client") replies.push({ at: n.at, who: n.byLabel || client.name, status: "alteracao", kind: "comment", note: n.text || "", title: p.title, where: "project", id: p.id });
      (n.replies || []).forEach((r) => { if (r.by === "client") replies.push({ at: r.at, who: r.byLabel || client.name, status: "alteracao", kind: "comment", note: r.text || "", title: p.title, where: "project", id: p.id }); });
    });
  });
  if (guide) (guide.review?.history || []).forEach((h) => { if (h.byLabel !== "ALL TORAL" && h.at) replies.push({ at: h.at, who: h.byLabel || client.name, status: h.status, kind: h.kind, note: h.note || "", title: guide.title || "Guia visual", where: "guide", id: "guide" }); });
  posts.forEach((p) => (p.review?.history || []).forEach((h) => { if (h.byLabel !== "ALL TORAL" && h.at) replies.push({ at: h.at, who: h.byLabel || client.name, status: h.status, kind: h.kind, note: h.note || "", title: p.title, where: "post", id: p.id }); }));
  plans.forEach((pl) => (pl.ideas || []).forEach((i) => (i.review?.history || []).forEach((h) => { if (h.byLabel !== "ALL TORAL" && h.at && (h.note || h.status !== "aprovado")) replies.push({ at: h.at, who: h.byLabel || client.name, status: h.status, kind: h.kind, note: h.note || "", title: i.title, where: "plan", id: pl.id }); })));
  replies.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const key = (k) => `${client.id}:${k}`;
  /* "já vi" numa resposta do cliente vale para ela e para as anteriores */
  const seenReply = seen[key("r")] || "";
  replies.forEach((r) => { r.key = key(`r@${r.at}`); });
  const reply = replies.find((r) => r.at > seenReply && t - Date.parse(r.at) < 3 * day && (r.note || ["alteracao", "reprovado"].includes(r.status))) || null;
  const due = plans.filter((pl) => pl.visible !== false && pl.deadline && openIdeas(pl) > 0 && Date.parse(pl.deadline) - t < day)
    .map((pl) => ({ id: pl.id, deadline: pl.deadline, open: openIdeas(pl), total: (pl.ideas || []).length, start: pl.start, end: pl.end, period: pl.period, key: key(`d:${pl.id}:${pl.deadline}:${openIdeas(pl)}`) }))
    .filter((d) => !seen[d.key]);
  const posted = posts.filter((p) => p.published?.at && t - Date.parse(p.published.at) < day).map((p) => ({ id: p.id, title: p.title, at: p.published.at, key: key(`p:${p.id}:${p.published.at}`) })).filter((p) => !seen[p.key]);
  return { reply, due, posted, lastVisit: client.visits?.last || null };
}

function addHistory(post, entry) {
  const review = post.review || { status: "pendente", history: [] };
  review.history = [...(review.history || []), entry].slice(-80);
  return review;
}

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function handle(req, env) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method;
  await setup(env.DB);
  const db = makeStore(env.DB, "db");
  const media = makeStore(env.DB, "media");

  try {
    /* ---------- arquivos (links impossíveis de adivinhar) ---------- */
    if (parts[0] === "media" && method === "GET" && parts.length === 3) {
      const [, cid, file] = parts;
      if (!safeId(cid) || !/^[a-z0-9]{8,40}$/.test(file)) return fail("Arquivo não encontrado", 404);
      const meta = await media.get(`${cid}/${file}`, { type: "json" });
      if (!meta || !meta.done) return fail("Arquivo não encontrado", 404);
      const { size, chunks, type } = meta;
      const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" };
      const dl = (url.searchParams.get("dl") || "").replace(/[^\w .()-]+/g, "").slice(0, 100);
      if (dl) base["content-disposition"] = `attachment; filename="${dl}"`;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
      if (range && (range[1] || range[2])) {
        let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        let end = range[1] && range[2] ? Number(range[2]) : size - 1;
        if (start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
        const ci = Math.floor(start / CHUNK);
        end = Math.min(end, size - 1, (ci + 1) * CHUNK - 1);
        const buf = await media.get(`${cid}/${file}/${ci}`, { type: "arrayBuffer" });
        if (!buf) return fail("Arquivo incompleto", 404);
        const part = buf.slice(start - ci * CHUNK, end - ci * CHUNK + 1);
        return new Response(part, { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(part.byteLength) } });
      }
      if (chunks === 1) {
        const buf = await media.get(`${cid}/${file}/0`, { type: "arrayBuffer" });
        return new Response(buf, { headers: { ...base, "content-length": String(size) } });
      }
      const stream = new ReadableStream({
        async start(ctrl) {
          for (let i = 0; i < chunks; i++) {
            const buf = await media.get(`${cid}/${file}/${i}`, { type: "arrayBuffer" });
            if (!buf) break;
            ctrl.enqueue(new Uint8Array(buf));
          }
          ctrl.close();
        },
      });
      return new Response(stream, { headers: { ...base, "content-length": String(size) } });
    }

    /* ---------- avisos no celular: chave pública do servidor ---------- */
    if (parts[0] === "push" && parts[1] === "key" && method === "GET") return json({ key: (await vapid(db)).pub });

    /* ---------- área do cliente: só enxerga o próprio token ---------- */
    if (parts[0] === "c" && parts[1]) {
      const t = parts[1];
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return fail("Link inválido", 404);
      const ref = await db.get(`tokens/${t}`, { type: "json" });
      if (!ref) return fail("Este link não existe mais. Peça ao estúdio o link atualizado.", 404);
      const client = await db.get(`clients/${ref.clientId}`, { type: "json" });
      if (!client || client.token !== t) return fail("Este link não existe mais. Peça ao estúdio o link atualizado.", 404);

      /* o celular do cliente ativa ou desativa os avisos */
      if (method === "POST" && (parts[2] === "push-sub" || parts[2] === "push-unsub") && parts.length === 3) {
        const body = await readBody(req);
        const sub = cleanSub(body.subscription);
        if (!sub) return fail("Não deu para ativar os avisos neste aparelho.");
        if (parts[2] === "push-sub") await saveSub(db, client.id, sub, req.headers.get("user-agent"));
        else await dropSub(db, client.id, sub.endpoint);
        return json({ ok: true });
      }

      if (method === "GET" && parts.length === 2) {
        const posts = sortPosts((await listJSON(db, `posts/${client.id}/`)).filter((p) => p.visible !== false));
        const requests = sortReqs(await listJSON(db, `requests/${client.id}/`));
        const plans = sortPlans((await listJSON(db, `plans/${client.id}/`)).filter((p) => p.visible !== false));
        const projects = sortProjects((await listJSON(db, `projects/${client.id}/`)).filter((p) => p.visible !== false));
        const g = await db.get(`guides/${client.id}`, { type: "json" });
        const guide = g && g.visible !== false ? g : null;
        const visits = await touchVisit(db, client);
        return json({ client: publicClient(client), posts, requests, plans, projects, guide, visits: { prev: visits.prev, welcomed: !!client.welcomedAt } });
      }
      /* ---------- produtos digitais: aprovação e marcações do cliente ---------- */
      if (method === "POST" && parts[2] && parts[2].startsWith("project-") && parts.length === 3) {
        const body = await readBody(req);
        if (!safeId(body.projectId)) return fail("Projeto não encontrado", 404);
        const key = `projects/${client.id}/${body.projectId}`;
        const project = await db.get(key, { type: "json" });
        if (!project || project.visible === false) return fail("Projeto não encontrado", 404);
        const name = str(body.name, 80).trim() || client.name;
        const at = now();
        const action = parts[2];
        if (action === "project-review") {
          const status = body.status; const note = str(body.note, 4000).trim();
          if (!["aprovado", "alteracao", "reprovado"].includes(status)) return fail("Escolha um sticker");
          if (project.review?.status === status && !note) return json({ project });
          project.review = addHistory(project, { kind: "review", status, note, byLabel: name, at, v: project.version });
          Object.assign(project.review, { status, note, byLabel: name, at });
        } else if (action === "project-comment") {
          const note = str(body.note, 4000).trim();
          if (!note) return fail("Escreva o comentário");
          project.review = addHistory(project, { kind: "comment", status: project.review?.status || "pendente", note, byLabel: name, at, v: project.version });
        } else if (action === "project-note") {
          const text = str(body.text, 3000).trim();
          if (!text) return fail("Escreva o que você quer mudar nesse ponto");
          const shape = cleanShape(body.shape);
          if (!shape) return fail("Marque o ponto no site antes de enviar");
          if (shape.mode === "shot" && !(project.shots || []).some((s) => s.id === shape.shot)) return fail("Essa tela não existe mais. Atualize a página.");
          const notes = project.notes || [];
          if (notes.length >= 300) return fail("Este projeto já tem muitas considerações. Fale com o estúdio.");
          const n = notes.reduce((m, x) => Math.max(m, x.n || 0), 0) + 1;
          const el = body.el && typeof body.el === "object" ? Object.fromEntries(["sel", "tag", "text", "alt", "src", "href", "section"].map((k) => [k, str(String(body.el[k] || ""), k === "sel" || k === "src" || k === "href" ? 400 : 240)]).filter(([, v]) => v)) : null;
          /* foto da tela no momento do círculo (vem do ajudante do site) */
          let snap = null;
          const sm = typeof body.snap === "string" && /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.snap);
          if (sm && sm[1].length < 560000) {
            const bin = Uint8Array.from(atob(sm[1]), (ch) => ch.charCodeAt(0));
            if (bin[0] === 0xff && bin[1] === 0xd8) {
              const file = rid(20);
              await media.set(`${client.id}/${file}/0`, bin.buffer);
              await media.setJSON(`${client.id}/${file}`, { type: "image/jpeg", size: bin.byteLength, chunks: 1, got: 1, done: true });
              snap = `${client.id}/${file}`;
            }
          }
          notes.push({ id: rid(8), n, by: "client", byLabel: name, at, text, shape, ...(el && Object.keys(el).length ? { el } : {}), ...(snap ? { snap } : {}), device: DEVICES.includes(body.device) ? body.device : "desktop", v: project.version, resolved: false, replies: [] });
          project.notes = notes;
        } else if (action === "project-note-reply" || action === "project-note-del") {
          const note = (project.notes || []).find((x) => x.id === body.noteId);
          if (!note) return fail("Consideração não encontrada", 404);
          if (action === "project-note-reply") {
            const text = str(body.text, 3000).trim();
            if (!text) return fail("Escreva a resposta");
            note.replies = [...(note.replies || []), { by: "client", byLabel: name, at, text }].slice(-40);
            if (note.resolved) note.resolved = false;
          } else {
            if (note.by !== "client" || (note.replies || []).some((r) => r.by === "studio")) return fail("Essa consideração já foi respondida pelo estúdio e não pode ser apagada.");
            project.notes = project.notes.filter((x) => x.id !== note.id);
            if (note.snap && note.snap.startsWith(client.id + "/")) { await media.deletePrefix(note.snap + "/"); await media.delete(note.snap); }
          }
        } else return fail("Rota não encontrada", 404);
        project.updatedAt = at;
        await db.setJSON(key, project);
        return json({ project });
      }
      /* ---------- guia visual: aprovação do cliente ---------- */
      if (method === "POST" && (parts[2] === "guide-review" || parts[2] === "guide-comment") && parts.length === 3) {
        const body = await readBody(req);
        const key = `guides/${client.id}`;
        const guide = await db.get(key, { type: "json" });
        if (!guide || guide.visible === false) return fail("Guia não encontrado", 404);
        const name = str(body.name, 80).trim() || client.name;
        const note = str(body.note, 4000).trim();
        const section = GUIDE_SECTIONS.includes(body.section) ? body.section : "geral";
        const at = now();
        if (parts[2] === "guide-review") {
          const status = body.status;
          if (!["aprovado", "alteracao", "reprovado"].includes(status)) return fail("Escolha um sticker");
          if (guide.review?.status === status && !note) return json({ guide });
          guide.review = addHistory(guide, { kind: "review", status, note, section, byLabel: name, at, v: guide.version });
          Object.assign(guide.review, { status, note, byLabel: name, at });
        } else {
          if (!note) return fail("Escreva o comentário");
          guide.review = addHistory(guide, { kind: "comment", status: guide.review?.status || "pendente", note, section, byLabel: name, at, v: guide.version });
        }
        await db.setJSON(key, guide);
        return json({ guide });
      }
      if (method === "POST" && parts[2] === "welcomed" && parts.length === 3) {
        if (!client.welcomedAt) { client.welcomedAt = now(); await db.setJSON(`clients/${client.id}`, client); }
        return json({ ok: true });
      }
      if (method === "POST" && parts[2] === "plan-seen" && parts.length === 3) {
        const body = await readBody(req);
        if (!safeId(body.planId)) return fail("Planejamento não encontrado", 404);
        const key = `plans/${client.id}/${body.planId}`;
        const plan = await db.get(key, { type: "json" });
        if (!plan || plan.visible === false) return fail("Planejamento não encontrado", 404);
        if (!plan.seenAt) { plan.seenAt = now(); await db.setJSON(key, plan); }
        return json({ plan });
      }
      if (method === "POST" && parts[2] === "plan-review" && parts.length === 3) {
        const body = await readBody(req);
        if (!safeId(body.planId) || !safeId(body.ideaId)) return fail("Ideia não encontrada", 404);
        const key = `plans/${client.id}/${body.planId}`;
        const plan = await db.get(key, { type: "json" });
        if (!plan || plan.visible === false) return fail("Planejamento não encontrado", 404);
        const idea = (plan.ideas || []).find((i) => i.id === body.ideaId);
        if (!idea) return fail("Ideia não encontrada", 404);
        const status = body.status;
        const note = str(body.note, 4000).trim();
        const name = str(body.name, 80).trim() || client.name;
        const at = now();
        if (status === "comment") {
          if (!note) return fail("Escreva o comentário");
          idea.review = addHistory(idea, { kind: "comment", status: idea.review?.status || "pendente", note, byLabel: name, at });
        } else {
          if (!["aprovado", "alteracao", "reprovado"].includes(status)) return fail("Escolha um sticker");
          idea.review = addHistory(idea, { kind: "review", status, note, byLabel: name, at });
          Object.assign(idea.review, { status, note, byLabel: name, at });
        }
        if (!plan.seenAt) plan.seenAt = at;
        plan.doneAt = openIdeas(plan) === 0 ? plan.doneAt || at : null;
        await db.setJSON(key, plan);
        return json({ plan });
      }
      if (method === "POST" && parts[2] === "request" && parts.length === 3) {
        const body = await readBody(req);
        const r = cleanRequest(body, client.id);
        if (!r.tema && !r.mensagem) return fail("Conte o tema ou a mensagem principal do conteúdo");
        const open = (await listJSON(db, `requests/${client.id}/`)).filter((x) => x.status !== "feito");
        if (open.length >= 30) return fail("Você já tem muitos pedidos em aberto. Fale com o estúdio.");
        await db.setJSON(`requests/${client.id}/${r.id}`, r);
        return json({ request: r });
      }
      if (method === "POST" && (parts[2] === "review" || parts[2] === "comment")) {
        const body = await readBody(req);
        const postId = body.postId;
        if (!safeId(postId)) return fail("Peça não encontrada", 404);
        const key = `posts/${client.id}/${postId}`;
        const post = await db.get(key, { type: "json" });
        if (!post || post.visible === false) return fail("Peça não encontrada", 404);
        const note = str(body.note, 4000).trim();
        const name = str(body.name, 80).trim() || client.name;
        const at = now();
        if (parts[2] === "review") {
          const status = body.status;
          if (!["aprovado", "alteracao", "reprovado"].includes(status)) return fail("Escolha um sticker");
          if (post.review?.status === status && !note) return json({ post });
          const review = addHistory(post, { kind: "review", status, note, byLabel: name, at });
          Object.assign(review, { status, note, byLabel: name, at });
          post.review = review;
        } else {
          if (!note) return fail("Escreva o comentário");
          post.review = addHistory(post, { kind: "comment", status: post.review?.status || "pendente", note, byLabel: name, at });
        }
        await db.setJSON(key, post);
        return json({ post });
      }
      return fail("Rota não encontrada", 404);
    }

    /* ---------- área do estúdio: exige a senha ---------- */
    if (parts[0] === "admin") {
      /* senha do painel: a do Cloudflare (ADMIN_PASSWORD), se existir; senão, a criada no primeiro acesso */
      const saved = env.ADMIN_PASSWORD ? null : await db.get("cfg/admin", { type: "json" });
      const configured = !!env.ADMIN_PASSWORD || !!saved;
      if (parts[1] === "status" && method === "GET") return json({ configured });
      if (parts[1] === "setup" && method === "POST") {
        if (configured) return fail("A senha do painel já foi criada.", 409);
        const body = await readBody(req);
        const pw = typeof body.password === "string" ? body.password : "";
        if (pw.length < 6) return fail("Use uma senha com pelo menos 6 caracteres.");
        const salt = rid(16);
        await db.setJSON("cfg/admin", { salt, hash: await hashPass(pw, salt), createdAt: now() });
        return json({ ok: true });
      }
      if (!configured) return fail("Crie a senha do painel para começar.", 428);
      const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const valid = !!given && (env.ADMIN_PASSWORD ? sameText(given, env.ADMIN_PASSWORD) : await checkPass(given, saved));
      if (!valid) return fail("Senha incorreta", 401);
      const [, a, b, c, d, e] = parts;

      if (a === "login") return json({ ok: true });

      /* lê um texto livre (briefing) e devolve os campos da peça */
      if (a === "parse" && method === "POST") {
        if (!env.AI) return json({ fields: null });
        const body = await readBody(req);
        const text = str(body.text, 8000);
        if (!text.trim()) return json({ fields: null });
        const ask = `Extraia deste briefing os dados de UM post de rede social e responda SOMENTE com um objeto JSON válido, sem comentários.
Chaves possíveis (omita as que não aparecem no texto, não invente nada):
title, network (instagram, facebook, tiktok, linkedin, youtube, pinterest, x ou whatsapp), sponsored (true se for anúncio pago), format (4x5, 1x1, 9x16 ou 16x9), date (AAAA-MM-DDTHH:MM), caption (legenda completa, mantendo quebras de linha), hashtags, location, studioNote,
ad: { objetivo, posicionamentos, local, idadeMin, idadeMax, genero (Todos, Mulheres ou Homens), publicoCustom, interesses, orcamento, orcTipo (por dia ou total), inicio (AAAA-MM-DD), fim (AAAA-MM-DD), headline, cta, descricao, url }
Briefing:
"""
${text}
"""`;
        const pick = (raw) => {
          const t = typeof raw === "object" && raw ? JSON.stringify(raw) : String(raw || "");
          const m = t.match(/\{[\s\S]*\}/);
          if (!m) return null;
          try { return JSON.parse(m[0]); } catch { return null; }
        };
        for (const model of ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"]) {
          try {
            const r = await env.AI.run(model, { messages: [{ role: "user", content: ask }], max_tokens: 1500 });
            const o = pick(r?.response ?? r);
            if (!o) continue;
            const keys = ["title", "network", "format", "date", "caption", "hashtags", "location", "studioNote"];
            const adKeys = ["objetivo", "posicionamentos", "local", "idadeMin", "idadeMax", "genero", "publicoCustom", "interesses", "orcamento", "orcTipo", "inicio", "fim", "headline", "cta", "descricao", "url"];
            const fields = {};
            keys.forEach((k) => { if (o[k] != null && o[k] !== "") fields[k] = str(String(o[k]), 5000); });
            if (o.sponsored === true || o.sponsored === "true") fields.sponsored = true;
            if (o.ad && typeof o.ad === "object") {
              const ad = {};
              adKeys.forEach((k) => { if (o.ad[k] != null && o.ad[k] !== "") ad[k] = str(String(o.ad[k]), 1000); });
              if (Object.keys(ad).length) fields.ad = ad;
            }
            return json({ fields });
          } catch (err) { /* tenta o próximo modelo */ }
        }
        return json({ fields: null });
      }

      /* lê um planejamento em texto livre e devolve a lista de ideias */
      if (a === "parse-plan" && method === "POST") {
        if (!env.AI) return json({ ideas: null });
        const body = await readBody(req);
        const text = str(body.text, 60000);
        if (!text.trim()) return json({ ideas: null });
        const ask = `Este texto é um planejamento de conteúdo para redes sociais. Separe cada conteúdo planejado e responda SOMENTE com um array JSON válido, sem comentários.
Cada item: { "date": "AAAA-MM-DDTHH:MM" (se houver), "format": "Post" | "Carrossel" | "Reels" | "Stories" | "Anúncio", "title": "assunto curto", "idea": "descrição da ideia ou roteiro", "caption": "legenda completa, mantendo quebras de linha", "hashtags": "" }
Não invente conteúdo que não está no texto.
Texto:
"""
${text}
"""`;
        for (const [model, max] of [["@cf/meta/llama-3.3-70b-instruct-fp8-fast", 16000], ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", 3500], ["@cf/meta/llama-3.1-8b-instruct", 3500]]) {
          try {
            const r = await env.AI.run(model, { messages: [{ role: "user", content: ask }], max_tokens: max });
            const raw = r?.response ?? r;
            const t = typeof raw === "object" && raw ? JSON.stringify(raw) : String(raw || "");
            const m = t.match(/\[[\s\S]*\]/);
            if (!m) continue;
            const arr = JSON.parse(m[0]);
            if (!Array.isArray(arr) || !arr.length) continue;
            return json({ ideas: arr.slice(0, 1000).map((x) => cleanIdea(x, null)) });
          } catch (err) { /* tenta o próximo modelo */ }
        }
        return json({ ideas: null });
      }

      /* lê a imagem do guia visual (prancha da marca) e devolve cores, fontes e regras */
      if (a === "guide-read" && method === "POST") {
        if (!env.AI) return json({ guide: null });
        const body = await readBody(req);
        const img = typeof body.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.image) && body.image.length < 3000000 ? body.image : "";
        if (!img) return fail("Envie uma imagem PNG, JPG ou WEBP");
        const ask = `Esta imagem é o guia visual (manual de marca) de uma empresa. Leia tudo o que está escrito e o que aparece nela e responda SOMENTE com um objeto JSON válido, sem comentários, em português do Brasil:
{ "title": "nome da marca", "intro": "conceito da marca em 1 a 3 frases, se estiver escrito", "colors": [ { "name": "nome da cor", "hex": "#rrggbb", "role": "onde usar" } ], "fonts": [ { "name": "nome exato da fonte", "role": "Títulos, Textos, Destaques...", "weights": "400, 700", "sample": "frase de exemplo mostrada" } ], "elements": ["elementos gráficos que aparecem: padrões, ícones, formas, fotos"], "voice": "tom de voz, se houver", "dos": ["regras do que pode"], "donts": ["regras do que não pode"] }
Use os códigos HEX escritos na imagem quando houver. Se não houver, estime pela cor que aparece. Não invente fontes nem regras que não aparecem; omita o que não existir.`;
        const pick = (raw) => {
          const t = typeof raw === "object" && raw ? JSON.stringify(raw) : String(raw || "");
          const m = t.match(/\{[\s\S]*\}/);
          if (!m) return null;
          try { return JSON.parse(m[0]); } catch { return null; }
        };
        const list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => str(String(x || ""), 300).replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
        const models = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/mistralai/mistral-small-3.1-24b-instruct"];
        for (const model of models) {
          try {
            const r = await env.AI.run(model, { messages: [{ role: "user", content: [{ type: "text", text: ask }, { type: "image_url", image_url: { url: img } }] }], max_tokens: 2000 });
            const o = pick(r?.response ?? r?.result?.response ?? r);
            if (!o) continue;
            const guide = {
              title: str(String(o.title || ""), 120).trim(),
              intro: str(String(o.intro || ""), 3000).trim(),
              colors: (Array.isArray(o.colors) ? o.colors : []).slice(0, 24).map((c) => {
                let hex = String(c?.hex || "").trim().toLowerCase();
                if (/^#?[0-9a-f]{3}$/.test(hex)) hex = "#" + hex.replace("#", "").split("").map((x) => x + x).join("");
                if (/^[0-9a-f]{6}$/.test(hex)) hex = "#" + hex;
                return /^#[0-9a-f]{6}$/.test(hex) ? { name: str(String(c?.name || ""), 60).trim(), hex, role: str(String(c?.role || ""), 160).trim() } : null;
              }).filter(Boolean),
              fonts: (Array.isArray(o.fonts) ? o.fonts : []).slice(0, 8).map((f) => ({ name: str(String(f?.name || ""), 80).trim(), role: str(String(f?.role || ""), 80).trim(), weights: str(String(f?.weights || ""), 80).trim(), sample: str(String(f?.sample || ""), 200).trim() })).filter((f) => f.name),
              elements: list(o.elements).slice(0, 12),
              voice: str(String(o.voice || ""), 3000).trim(),
              dos: list(o.dos).slice(0, 20).join("\n"),
              donts: list(o.donts).slice(0, 20).join("\n"),
            };
            if (!guide.colors.length && !guide.fonts.length && !guide.title) continue;
            return json({ guide });
          } catch (err) { /* tenta o próximo modelo */ }
        }
        return json({ guide: null });
      }

      /* sugestão de assunto para o título: lê a arte (miniatura) e a legenda com a IA do Cloudflare */
      if (a === "title" && method === "POST") {
        if (!env.AI) return json({ subject: "" });
        const body = await readBody(req);
        const caption = str(body.caption, 1500);
        const img = typeof body.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.image) && body.image.length < 400000 ? body.image : "";
        const ask = `Você cria títulos internos para organizar posts de redes sociais de uma agência.
Escreva só o assunto deste post em português do Brasil, com 2 a 6 palavras, sem aspas, sem emojis, sem hashtags, sem ponto final e sem as palavras post, reels, carrossel ou anúncio.
Exemplo: Apartamento à venda no Bem Viver
${caption ? "Legenda do post: " + caption : "O post ainda não tem legenda."}`;
        const clean = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean)[0]?.replace(/^["'“”*#\-\s]+|["'“”*.\s]+$/g, "").replace(/^(assunto|título|titulo)\s*:\s*/i, "").slice(0, 70) || "";
        const models = [
          ["@cf/meta/llama-4-scout-17b-16e-instruct", () => ({ messages: [{ role: "user", content: img ? [{ type: "text", text: ask }, { type: "image_url", image_url: { url: img } }] : ask }], max_tokens: 40 })],
          ["@cf/meta/llama-3.1-8b-instruct", () => ({ messages: [{ role: "user", content: ask }], max_tokens: 40 })],
        ];
        for (const [model, input] of models) {
          if (!img && !caption) break;
          try {
            const r = await env.AI.run(model, input());
            const subject = clean(r?.response ?? r?.result?.response ?? r);
            if (subject) return json({ subject });
          } catch (err) { /* tenta o próximo modelo */ }
        }
        return json({ subject: "" });
      }

      /* avisos do painel já vistos: somem até acontecer algo novo */
      if (a === "dismiss" && method === "POST") {
        const body = await readBody(req);
        const keys = (Array.isArray(body.keys) ? body.keys : []).filter((k) => typeof k === "string" && k.length < 300).slice(0, 100);
        const seen = (await db.get("cfg/dismissed", { type: "json" })) || {};
        const t = Date.now();
        Object.keys(seen).forEach((k) => { if (!k.endsWith(":r") && t - Date.parse(seen[k]) > 40 * 24 * 60 * 60 * 1000) delete seen[k]; });
        keys.forEach((k) => {
          const m = /^([a-z0-9]+):r@(.+)$/.exec(k);
          if (m) { const rk = `${m[1]}:r`; if (!seen[rk] || seen[rk] < m[2]) seen[rk] = m[2]; }
          else seen[k] = now();
        });
        await db.setJSON("cfg/dismissed", seen);
        return json({ ok: true });
      }

      if (a === "clients" && !b && method === "GET") {
        const seen = (await db.get("cfg/dismissed", { type: "json" })) || {};
        const clients = await listJSON(db, "clients/");
        const withCounts = await Promise.all(
          clients.map(async (cl) => {
            const all = (await listJSON(db, `posts/${cl.id}/`)).filter((p) => p.visible !== false);
            const posts = all.filter((p) => !p.published);
            const counts = { pendente: 0, aprovado: 0, alteracao: 0, reprovado: 0, ajustado: 0 };
            posts.forEach((p) => counts[STATUSES.includes(p.review?.status) ? p.review.status : "pendente"]++);
            const reqs = (await listJSON(db, `requests/${cl.id}/`)).filter((r) => r.status === "novo").length;
            const plans = (await listJSON(db, `plans/${cl.id}/`)).filter((p) => p.visible !== false);
            const planOpen = plans.reduce((t, p) => t + openIdeas(p), 0);
            const projects = (await listJSON(db, `projects/${cl.id}/`)).filter((p) => p.visible !== false);
            const live = projects.filter((p) => !p.delivered);
            live.forEach((p) => counts[STATUSES.includes(p.review?.status) ? p.review.status : "pendente"]++);
            const g = await db.get(`guides/${cl.id}`, { type: "json" });
            const guide = g && g.visible !== false ? g : null;
            return { ...cl, counts: { ...counts, publicado: all.length - posts.length + (projects.length - live.length), pedidos: reqs, ideias: planOpen, notas: live.reduce((t, p) => t + openNotes(p), 0), projetos: projects.length, guia: guide ? guide.review?.status || "pendente" : null }, alerts: alertsFor(cl, all, plans, seen, projects, guide) };
          })
        );
        return json({ clients: withCounts.sort((x, y) => x.name.localeCompare(y.name)) });
      }

      if (a === "clients" && !b && method === "POST") {
        const body = await readBody(req);
        const client = cleanClient(body, null);
        if (!client.name) return fail("Dê um nome para o cliente");
        client.id = rid(10);
        client.token = token();
        client.logoId = "";
        await db.setJSON(`clients/${client.id}`, client);
        await db.setJSON(`tokens/${client.token}`, { clientId: client.id });
        return json({ client });
      }

      if (a === "clients" && safeId(b)) {
        const client = await db.get(`clients/${b}`, { type: "json" });
        if (!client) return fail("Cliente não encontrado", 404);

        if (!c && method === "GET") {
          const posts = sortPosts(await listJSON(db, `posts/${b}/`));
          const requests = sortReqs(await listJSON(db, `requests/${b}/`));
          const plans = sortPlans(await listJSON(db, `plans/${b}/`));
          const projects = sortProjects(await listJSON(db, `projects/${b}/`));
          const guide = await db.get(`guides/${b}`, { type: "json" });
          return json({ client, posts, requests, plans, projects, guide, pushDevices: await countSubs(db, b) });
        }
        /* aviso de teste no celular do cliente */
        if (c === "push-test" && method === "POST") {
          const r = await pushClient(db, client, { title: "Teste do Aprova", body: "Os avisos estão funcionando. Quando chegar algo para aprovar, você fica sabendo por aqui.", url: `/c/${client.token}`, tag: `aprova-${client.id}` }, url.origin);
          return json(r);
        }
        /* ---------- guia visual (estúdio) ---------- */
        if (c === "guide") {
          const key = `guides/${b}`;
          const prev = await db.get(key, { type: "json" });
          if (!d && method === "PUT") {
            const body = await readBody(req);
            const guide = cleanGuide(body, prev, b);
            if (!guide.colors.length && !guide.fonts.length && !guide.logos.length && !guide.summary) return fail("Coloque pelo menos uma cor, uma fonte, um logo ou a imagem do guia");
            if (body.newVersion && prev) {
              const was = prev.review?.status;
              const to = was === "alteracao" || was === "reprovado" ? "ajustado" : "pendente";
              guide.version = (prev.version || 1) + 1; guide.sentAt = now(); guide.visible = true;
              guide.review = addHistory(guide, { kind: "review", status: to, note: to === "ajustado" ? `Versão ${guide.version} com os ajustes` : `Versão ${guide.version} enviada`, byLabel: "ALL TORAL", at: now(), v: guide.version });
              Object.assign(guide.review, { status: to, note: "", at: now(), byLabel: "ALL TORAL" });
            }
            await db.setJSON(key, guide);
            return json({ guide });
          }
          if (!prev) return fail("Guia não encontrado", 404);
          if (!d && method === "DELETE") { await db.delete(key); return json({ ok: true }); }
          if (method === "POST" && ["adjusted", "resend", "clear", "comment"].includes(d)) {
            if (d === "comment") {
              const body = await readBody(req); const note = str(body.note, 4000).trim();
              if (!note) return fail("Escreva o comentário");
              prev.review = addHistory(prev, { kind: "comment", status: prev.review?.status || "pendente", note, section: GUIDE_SECTIONS.includes(body.section) ? body.section : "geral", byLabel: "ALL TORAL", at: now(), v: prev.version });
            } else if (d === "clear") {
              Object.assign(prev.review, { status: "pendente", note: "", at: now(), byLabel: "ALL TORAL" });
            } else {
              const to = d === "adjusted" ? "ajustado" : "pendente";
              prev.version = (prev.version || 1) + 1; prev.sentAt = now(); prev.visible = true;
              prev.review = addHistory(prev, { kind: "review", status: to, note: d === "adjusted" ? "Guia ajustado pelo estúdio" : "Nova versão do guia enviada", byLabel: "ALL TORAL", at: now(), v: prev.version });
              Object.assign(prev.review, { status: to, note: "", at: now(), byLabel: "ALL TORAL" });
            }
            await db.setJSON(key, prev);
            return json({ guide: prev });
          }
        }
        /* ---------- produtos digitais (estúdio) ---------- */
        if (c === "projects" && !d && method === "POST") {
          const body = await readBody(req);
          const project = cleanProject(body, null, b);
          if (!project.url && !project.shots.length) return fail("Coloque o link do site ou envie pelo menos uma tela");
          project.id = rid(10);
          await db.setJSON(`projects/${b}/${project.id}`, project);
          return json({ project });
        }
        if (c === "projects" && safeId(d)) {
          const key = `projects/${b}/${d}`;
          const prev = await db.get(key, { type: "json" });
          if (!prev) return fail("Projeto não encontrado", 404);
          if (!e && method === "PUT") {
            const body = await readBody(req);
            const project = cleanProject(body, prev, b);
            if (!project.url && !project.shots.length) return fail("Coloque o link do site ou envie pelo menos uma tela");
            if (body.newVersion) {
              const was = prev.review?.status;
              const to = was === "alteracao" || was === "reprovado" ? "ajustado" : "pendente";
              project.version = (prev.version || 1) + 1; project.sentAt = now(); project.visible = true;
              project.review = addHistory(project, { kind: "review", status: to, note: to === "ajustado" ? `Versão ${project.version} com os ajustes` : `Versão ${project.version} enviada`, byLabel: "ALL TORAL", at: now(), v: project.version });
              Object.assign(project.review, { status: to, note: "", at: now(), byLabel: "ALL TORAL" });
            }
            await db.setJSON(key, project);
            return json({ project });
          }
          if (!e && method === "DELETE") { await db.delete(key); return json({ ok: true }); }
          if (e === "notes" && method === "POST") {
            const note = (prev.notes || []).find((x) => x.id === parts[6]);
            if (!note) return fail("Consideração não encontrada", 404);
            const body = await readBody(req);
            if (parts[7] === "resolve") note.resolved = !!body.resolved;
            else if (parts[7] === "reply") {
              const text = str(body.text, 3000).trim();
              if (!text) return fail("Escreva a resposta");
              note.replies = [...(note.replies || []), { by: "studio", byLabel: "ALL TORAL", at: now(), text }].slice(-40);
              if (body.resolve) note.resolved = true;
            } else if (parts[7] === "delete") prev.notes = prev.notes.filter((x) => x.id !== note.id);
            else return fail("Rota não encontrada", 404);
            prev.updatedAt = now();
            await db.setJSON(key, prev);
            return json({ project: prev });
          }
          if (method === "POST" && ["adjusted", "clear", "comment", "delivered"].includes(e)) {
            const body = await readBody(req);
            if (e === "comment") {
              const note = str(body.note, 4000).trim();
              if (!note) return fail("Escreva o comentário");
              prev.review = addHistory(prev, { kind: "comment", status: prev.review?.status || "pendente", note, byLabel: "ALL TORAL", at: now(), v: prev.version });
            } else if (e === "clear") {
              Object.assign(prev.review, { status: "pendente", note: "", at: now(), byLabel: "ALL TORAL" });
            } else if (e === "delivered") {
              prev.delivered = body.delivered ? { at: now() } : null;
            } else {
              prev.sentAt = now();
              prev.review = addHistory(prev, { kind: "review", status: "ajustado", note: "Ajustes feitos pelo estúdio", byLabel: "ALL TORAL", at: now(), v: prev.version });
              Object.assign(prev.review, { status: "ajustado", note: "", at: now(), byLabel: "ALL TORAL" });
            }
            await db.setJSON(key, prev);
            return json({ project: prev });
          }
        }
        if (c === "plans" && !d && method === "POST") {
          const body = await readBody(req);
          const plan = cleanPlan(body, null, b);
          if (!plan.ideas.length) return fail("Adicione pelo menos uma ideia ao planejamento");
          if (JSON.stringify(plan).length > 1900000) return fail("Esse planejamento ficou grande demais para salvar de uma vez. Divida em dois planejamentos.");
          plan.id = rid(10);
          await db.setJSON(`plans/${b}/${plan.id}`, plan);
          if (client.planPeriod !== plan.period) { client.planPeriod = plan.period; client.updatedAt = now(); await db.setJSON(`clients/${b}`, client); }
          return json({ plan, client });
        }
        if (c === "plans" && safeId(d)) {
          const key = `plans/${b}/${d}`;
          const prev = await db.get(key, { type: "json" });
          if (!prev) return fail("Planejamento não encontrado", 404);
          if (!e && method === "PUT") {
            const body = await readBody(req);
            const plan = cleanPlan(body, prev, b);
            if (!plan.ideas.length) return fail("Adicione pelo menos uma ideia ao planejamento");
          if (JSON.stringify(plan).length > 1900000) return fail("Esse planejamento ficou grande demais para salvar de uma vez. Divida em dois planejamentos.");
            plan.doneAt = openIdeas(plan) === 0 ? prev.doneAt || now() : null;
            await db.setJSON(key, plan);
            return json({ plan });
          }
          if (!e && method === "DELETE") { await db.delete(key); return json({ ok: true }); }
          const ideaId = parts[6];
          const idea = safeId(ideaId) ? (prev.ideas || []).find((i) => i.id === ideaId) : null;
          if (e === "ideas" && idea && parts[7] === "adjusted" && method === "POST") {
            idea.review = addHistory(idea, { kind: "review", status: "ajustado", note: "Ajuste feito pelo estúdio", byLabel: "ALL TORAL", at: now() });
            Object.assign(idea.review, { status: "ajustado", note: "", at: now(), byLabel: "ALL TORAL" });
            prev.doneAt = null;
            await db.setJSON(key, prev);
            return json({ plan: prev });
          }
          if (e === "ideas" && idea && parts[7] === "comment" && method === "POST") {
            const body = await readBody(req);
            const note = str(body.note, 4000).trim();
            if (!note) return fail("Escreva o comentário");
            idea.review = addHistory(idea, { kind: "comment", status: idea.review?.status || "pendente", note, byLabel: "ALL TORAL", at: now() });
            await db.setJSON(key, prev);
            return json({ plan: prev });
          }
        }
        if (c === "requests" && safeId(d)) {
          const key = `requests/${b}/${d}`;
          const r = await db.get(key, { type: "json" });
          if (!r) return fail("Pedido não encontrado", 404);
          if (method === "DELETE") { await db.delete(key); return json({ ok: true }); }
          if (method === "POST") {
            const body = await readBody(req);
            if (!["novo", "producao", "feito"].includes(body.status)) return fail("Status inválido");
            r.status = body.status; r.updatedAt = now();
            await db.setJSON(key, r);
            return json({ request: r });
          }
        }
        if (!c && method === "PUT") {
          const body = await readBody(req);
          const next = cleanClient(body, client);
          if (!next.name) return fail("Dê um nome para o cliente");
          await db.setJSON(`clients/${b}`, next);
          return json({ client: next });
        }
        if (!c && method === "DELETE") {
          await db.deletePrefix(`posts/${b}/`);
          await db.deletePrefix(`requests/${b}/`);
          await db.deletePrefix(`plans/${b}/`);
          await db.deletePrefix(`projects/${b}/`);
          await db.delete(`guides/${b}`);
          await media.deletePrefix(`${b}/`);
          if (client.token) await db.delete(`tokens/${client.token}`);
          await db.delete(`clients/${b}`);
          return json({ ok: true });
        }
        if (c === "token" && method === "POST") {
          if (client.token) await db.delete(`tokens/${client.token}`);
          client.token = token();
          client.updatedAt = now();
          await db.setJSON(`clients/${b}`, client);
          await db.setJSON(`tokens/${client.token}`, { clientId: b });
          return json({ client });
        }
        if (c === "upload" && method === "POST" && !d) {
          /* inicia um envio: {type, size} */
          const body = await readBody(req);
          const type = str(body.type, 60);
          const size = Number(body.size);
          if (!MEDIA_TYPES.includes(type)) return fail("Formato não aceito. Use JPG, PNG, WEBP, GIF, SVG, MP4 ou MOV.");
          if (!(size > 0)) return fail("Arquivo vazio");
          if (size > MAX_FILE) return fail("Arquivo grande demais. O limite é 200 MB por arquivo.");
          const file = rid(20);
          const chunks = Math.ceil(size / CHUNK);
          await media.setJSON(`${b}/${file}`, { type, size, chunks, got: 0, done: false });
          return json({ id: `${b}/${file}`, type, chunks, chunkSize: CHUNK });
        }
        if (c === "upload" && method === "PUT" && /^[a-z0-9]{8,40}$/.test(d || "") && /^\d+$/.test(e || "")) {
          /* recebe uma parte */
          const meta = await media.get(`${b}/${d}`, { type: "json" });
          if (!meta || meta.done) return fail("Envio não encontrado", 404);
          const i = Number(e);
          if (i >= meta.chunks) return fail("Parte inválida");
          const buf = await req.arrayBuffer();
          const expected = i === meta.chunks - 1 ? meta.size - i * CHUNK : CHUNK;
          if (buf.byteLength !== expected) return fail("Parte com tamanho errado. Tente enviar de novo.");
          await media.set(`${b}/${d}/${i}`, buf);
          if (i === meta.chunks - 1) {
            const { blobs } = await media.list({ prefix: `${b}/${d}/` });
            if (blobs.length < meta.chunks) return fail("Faltaram partes do arquivo. Tente enviar de novo.");
            meta.done = true;
            await media.setJSON(`${b}/${d}`, meta);
          }
          return json({ ok: true, done: i === meta.chunks - 1 });
        }
        if (c === "posts" && !d && method === "POST") {
          const body = await readBody(req);
          const post = cleanPost(body, null, b);
          post.id = rid(10);
          await db.setJSON(`posts/${b}/${post.id}`, post);
          return json({ post });
        }
        if (c === "posts" && safeId(d)) {
          const key = `posts/${b}/${d}`;
          const prev = await db.get(key, { type: "json" });
          if (!prev) return fail("Peça não encontrada", 404);
          if (!e && method === "PUT") {
            const body = await readBody(req);
            const post = cleanPost(body, prev, b);
            const ids = (x) => [...(x.media || []).map((m) => m.id), x.cover?.id || ""].join("|");
            const was = post.review?.status;
            if (ids(post) !== ids(prev) && was && was !== "pendente" && was !== "ajustado") {
              const to = was === "alteracao" || was === "reprovado" ? "ajustado" : "pendente";
              post.sentAt = now();
              post.review = addHistory(post, { kind: "review", status: to, note: to === "ajustado" ? "Conteúdo ajustado pelo estúdio" : "Nova arte enviada pelo estúdio", byLabel: "ALL TORAL", at: now() });
              Object.assign(post.review, { status: to, note: "", at: now(), byLabel: "ALL TORAL" });
            }
            await db.setJSON(key, post);
            return json({ post });
          }
          if (!e && method === "DELETE") {
            await db.delete(key);
            return json({ ok: true });
          }
          if ((e === "resend" || e === "clear") && method === "POST") {
            /* remover o sticker é bastidor: não entra no histórico */
            if (e === "resend") prev.sentAt = now();
            prev.review = e === "clear" ? { ...(prev.review || {}), history: prev.review?.history || [] } : addHistory(prev, { kind: "review", status: "pendente", note: "Nova versão enviada pelo estúdio", byLabel: "ALL TORAL", at: now() });
            Object.assign(prev.review, { status: "pendente", note: "", at: now(), byLabel: "ALL TORAL" });
            await db.setJSON(key, prev);
            return json({ post: prev });
          }
          if (e === "published" && method === "POST") {
            const body = await readBody(req);
            prev.published = body.published ? { at: now() } : null;
            await db.setJSON(key, prev);
            return json({ post: prev });
          }
          if (e === "adjusted" && method === "POST") {
            prev.sentAt = now();
            prev.review = addHistory(prev, { kind: "review", status: "ajustado", note: "Conteúdo ajustado pelo estúdio", byLabel: "ALL TORAL", at: now() });
            Object.assign(prev.review, { status: "ajustado", note: "", at: now(), byLabel: "ALL TORAL" });
            await db.setJSON(key, prev);
            return json({ post: prev });
          }
          if (e === "comment" && method === "POST") {
            const body = await readBody(req);
            const note = str(body.note, 4000).trim();
            if (!note) return fail("Escreva o comentário");
            prev.review = addHistory(prev, { kind: "comment", status: prev.review?.status || "pendente", note, byLabel: "ALL TORAL", at: now() });
            await db.setJSON(key, prev);
            return json({ post: prev });
          }
        }
      }
      return fail("Rota não encontrada", 404);
    }

    return fail("Rota não encontrada", 404);
  } catch (err) {
    console.error(err);
    return fail("Algo deu errado no servidor. Tente de novo em instantes.", 500);
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const res = await handle(req, env);
      /* o estúdio mandou algo para o cliente: avisa no celular dele */
      const m = /^\/api\/admin\/clients\/([^/]+)\/(posts|plans|projects|guide)(\/|$)/.exec(url.pathname);
      if (m && res.ok && (req.method === "POST" || req.method === "PUT") && ctx?.waitUntil) {
        try {
          const item = pushItemFrom(m[2], await res.clone().json());
          if (item) {
            const db = makeStore(env.DB, "db");
            ctx.waitUntil(db.get(`clients/${m[1]}`, { type: "json" }).then((client) => queuePush(db, client, item, url.origin)).catch(() => {}));
          }
        } catch { /* resposta sem JSON */ }
      }
      return res;
    }
    return env.ASSETS.fetch(req);
  },
};
