

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

function cleanClient(body, prev) {
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
  const ideas = (Array.isArray(body.ideas) ? body.ideas : []).slice(0, 60).map((x) => {
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
function alertsFor(client, posts, plans, seen = {}) {
  const t = Date.now(); const day = 24 * 60 * 60 * 1000;
  const replies = [];
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

    /* ---------- área do cliente: só enxerga o próprio token ---------- */
    if (parts[0] === "c" && parts[1]) {
      const t = parts[1];
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return fail("Link inválido", 404);
      const ref = await db.get(`tokens/${t}`, { type: "json" });
      if (!ref) return fail("Este link não existe mais. Peça ao estúdio o link atualizado.", 404);
      const client = await db.get(`clients/${ref.clientId}`, { type: "json" });
      if (!client || client.token !== t) return fail("Este link não existe mais. Peça ao estúdio o link atualizado.", 404);

      if (method === "GET" && parts.length === 2) {
        const posts = sortPosts((await listJSON(db, `posts/${client.id}/`)).filter((p) => p.visible !== false));
        const requests = sortReqs(await listJSON(db, `requests/${client.id}/`));
        const plans = sortPlans((await listJSON(db, `plans/${client.id}/`)).filter((p) => p.visible !== false));
        const visits = await touchVisit(db, client);
        return json({ client: publicClient(client), posts, requests, plans, visits: { prev: visits.prev, welcomed: !!client.welcomedAt } });
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
        const text = str(body.text, 12000);
        if (!text.trim()) return json({ ideas: null });
        const ask = `Este texto é um planejamento de conteúdo para redes sociais. Separe cada conteúdo planejado e responda SOMENTE com um array JSON válido, sem comentários.
Cada item: { "date": "AAAA-MM-DDTHH:MM" (se houver), "format": "Post" | "Carrossel" | "Reels" | "Stories" | "Anúncio", "title": "assunto curto", "idea": "descrição da ideia ou roteiro", "caption": "legenda completa, mantendo quebras de linha", "hashtags": "" }
Não invente conteúdo que não está no texto.
Texto:
"""
${text}
"""`;
        for (const model of ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"]) {
          try {
            const r = await env.AI.run(model, { messages: [{ role: "user", content: ask }], max_tokens: 3500 });
            const raw = r?.response ?? r;
            const t = typeof raw === "object" && raw ? JSON.stringify(raw) : String(raw || "");
            const m = t.match(/\[[\s\S]*\]/);
            if (!m) continue;
            const arr = JSON.parse(m[0]);
            if (!Array.isArray(arr) || !arr.length) continue;
            return json({ ideas: arr.slice(0, 60).map((x) => cleanIdea(x, null)) });
          } catch (err) { /* tenta o próximo modelo */ }
        }
        return json({ ideas: null });
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
            return { ...cl, counts: { ...counts, publicado: all.length - posts.length, pedidos: reqs, ideias: planOpen }, alerts: alertsFor(cl, all, plans, seen) };
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
          return json({ client, posts, requests, plans });
        }
        if (c === "plans" && !d && method === "POST") {
          const body = await readBody(req);
          const plan = cleanPlan(body, null, b);
          if (!plan.ideas.length) return fail("Adicione pelo menos uma ideia ao planejamento");
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
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handle(req, env);
    return env.ASSETS.fetch(req);
  },
};
