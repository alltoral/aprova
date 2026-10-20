/* Automações do Instagram: comentário em post/Reels ou resposta de story com uma palavra → DM automática.
   Usa a API oficial do Instagram (Instagram API with Instagram Login).
   Tudo fica na mesma tabela kv do D1 que o resto do Aprova usa. */

const IG = "https://graph.instagram.com/v24.0";
const SCOPES = "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments";
const LOG_KEEP = 300;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (message, status = 400) => json({ error: message }, status);
const now = () => new Date().toISOString();
const str = (v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const rid = (n = 12) => {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
};
const safeId = (s) => typeof s === "string" && /^[a-z0-9]{4,40}$/.test(s);
const cleanLink = (v) => {
  const s = str(v, 1000).trim();
  if (!s) return "";
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
};

/* texto normalizado: minúsculas, sem acento, só letras e números */
export const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/* código do post na URL (instagram.com/p/XXXX, /reel/XXXX, /stories/usuario/NNNN) */
export function mediaCode(url) {
  const m = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url || "") || /instagram\.com\/stories\/[^/]+\/(\d+)/.exec(url || "");
  return m ? m[1] : "";
}

function cleanRule(body, prev) {
  const source = body.source === "story" ? "story" : "post";
  const kws = (Array.isArray(body.keywords) ? body.keywords : [])
    .map((k) => str(String(k), 60).trim().toUpperCase())
    .filter((k, i, a) => norm(k) && a.findIndex((x) => norm(x) === norm(k)) === i)
    .slice(0, 50);
  const url = cleanLink(body.url);
  return {
    id: prev?.id || rid(12),
    source,
    name: str(body.name, 80).trim() || (kws[0] ? "Palavra " + kws[0] : "Automação"),
    url,
    mediaId: url && body.mediaId && /^\d{5,30}$/.test(String(body.mediaId)) ? String(body.mediaId) : url && prev?.url === url ? prev?.mediaId || "" : "",
    keywords: kws,
    match: body.match === "exata" ? "exata" : "contem",
    active: body.active !== false,
    dm: str(body.dm, 640).trim(),
    button: str(body.button, 20).trim(),
    link: cleanLink(body.link),
    reply: source === "story" ? "" : str(body.reply, 300).trim(),
    notes: str(body.notes, 300).trim(),
    stats: prev?.stats || { sent: 0, last: null },
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
  };
}

/* ---------- configuração do app da Meta ---------- */
async function getCfg(db, env) {
  const c = (await db.get("auto/cfg", { type: "json" })) || {};
  return {
    appId: env.IG_APP_ID || c.appId || "",
    appSecret: env.IG_APP_SECRET || c.appSecret || "",
    verifyToken: env.IG_VERIFY_TOKEN || c.verifyToken || "",
    fromEnv: !!(env.IG_APP_ID || env.IG_APP_SECRET),
  };
}
const publicAcc = (a) => (a ? { igId: a.igId, username: a.username, connectedAt: a.connectedAt, expiresAt: a.expiresAt, lastError: a.lastError || "" } : null);

/* ---------- chamadas ao Instagram ---------- */
async function igFetch(path, token, opts = {}) {
  const url = path.startsWith("http") ? path : IG + path;
  const r = await fetch(url, {
    method: opts.method || "GET",
    headers: { authorization: "Bearer " + token, ...(opts.body ? { "content-type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok || data.error) {
    const e = data.error || {};
    throw Object.assign(new Error(e.error_user_msg || e.message || "Erro " + r.status + " no Instagram"), { code: e.code, sub: e.error_subcode, status: r.status });
  }
  return data;
}

async function listMedia(acc, kind) {
  const out = [];
  let next = kind === "story"
    ? `${IG}/${acc.igId}/stories?fields=id,permalink,media_type,media_url,thumbnail_url,timestamp&limit=50`
    : `${IG}/${acc.igId}/media?fields=id,permalink,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp&limit=50`;
  for (let i = 0; next && i < 4; i++) {
    const d = await igFetch(next, acc.token);
    (d.data || []).forEach((m) => out.push(m));
    next = d.paging?.next || "";
  }
  return out;
}
async function resolveMediaId(acc, rule) {
  const code = mediaCode(rule.url);
  if (!code) return "";
  const list = await listMedia(acc, rule.source);
  const hit = list.find((m) => mediaCode(m.permalink) === code);
  return hit ? hit.id : "";
}

const fill = (t, v) => String(t || "").replace(/\{nome\}/g, v.nome || v.usuario || "").replace(/\{usuario\}/g, v.usuario ? "@" + v.usuario : "").replace(/\{palavra\}/g, v.palavra || "").replace(/[ \t]{2,}/g, " ").trim();

async function sendDM(acc, recipient, rule, vars) {
  const text = fill(rule.dm, vars) || "Oi!";
  const withButton = rule.button && rule.link;
  const msg = withButton
    ? { attachment: { type: "template", payload: { template_type: "button", text: text.slice(0, 640), buttons: [{ type: "web_url", url: rule.link, title: rule.button.slice(0, 20) }] } } }
    : { text: text.slice(0, 1000) };
  try {
    return await igFetch(`/${acc.igId}/messages`, acc.token, { method: "POST", body: { recipient, message: msg } });
  } catch (e) {
    if (!withButton) throw e;
    /* se o botão não for aceito, manda o link no texto */
    return await igFetch(`/${acc.igId}/messages`, acc.token, { method: "POST", body: { recipient, message: { text: (text + "\n\n" + rule.button + ": " + rule.link).slice(0, 1000) } } });
  }
}

/* ---------- regras ---------- */
function matches(rule, text) {
  const t = norm(text);
  if (!t) return "";
  for (const k of rule.keywords || []) {
    const n = norm(k);
    if (!n) continue;
    if (rule.match === "exata" ? t === n : (" " + t + " ").includes(" " + n + " ")) return k;
  }
  return "";
}
async function findRule(db, acc, clientId, source, mediaId, text) {
  const rules = (await db.listJSON(`auto/rules/${clientId}/`)).filter((r) => r.active && r.source === source);
  const hits = [];
  for (const r of rules) {
    const kw = matches(r, text);
    if (!kw) continue;
    if (r.url) {
      if (!r.mediaId && acc) {
        try {
          const id = await resolveMediaId(acc, r);
          if (id) { r.mediaId = id; await db.setJSON(`auto/rules/${clientId}/${r.id}`, r); }
        } catch { /* tenta de novo no próximo aviso */ }
      }
      if (!mediaId || r.mediaId !== mediaId) continue;
      hits.push({ rule: r, kw, specific: true });
    } else hits.push({ rule: r, kw, specific: false });
  }
  hits.sort((a, b) => Number(b.specific) - Number(a.specific) || String(b.rule.updatedAt).localeCompare(String(a.rule.updatedAt)));
  return hits[0] || null;
}

/* ---------- registro de atividade ---------- */
async function log(db, clientId, entry) {
  const at = now();
  await db.setJSON(`auto/log/${clientId}/${at}-${rid(4)}`, { at, ...entry });
  if (Math.random() < 0.1) {
    const { blobs } = await db.list({ prefix: `auto/log/${clientId}/` });
    const keys = blobs.map((b) => b.key).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - LOG_KEEP))) await db.delete(k);
  }
}
async function readLog(db, clientId, n = 80) {
  return (await db.listJSON(`auto/log/${clientId}/`)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n);
}

/* evita responder duas vezes o mesmo comentário (o Instagram reenvia avisos) */
async function firstTime(DB, id) {
  const r = await DB.prepare("INSERT INTO kv (ns, k, j, b) VALUES ('autoseen', ?, ?, NULL) ON CONFLICT (ns, k) DO NOTHING").bind(id, JSON.stringify({ at: now() })).run();
  return (r.meta?.changes ?? 1) > 0;
}

/* ---------- processamento dos avisos do Instagram ---------- */
async function processEvent(env, db, payload) {
  if (payload?.object !== "instagram") return;
  for (const entry of payload.entry || []) {
    const igId = String(entry.id || "");
    const ref = await db.get(`auto/ig/${igId}`, { type: "json" });
    const clientId = ref?.clientId;
    const acc = clientId ? await db.get(`auto/acc/${clientId}`, { type: "json" }) : null;
    if (!clientId || !acc) { await log(db, "_", { kind: "aviso", ok: false, status: "Conta não conectada a nenhum cliente", igId }); continue; }

    /* comentários em posts e Reels */
    for (const ch of entry.changes || []) {
      if (ch.field !== "comments") continue;
      const v = ch.value || {};
      const from = v.from || {};
      if (!v.id || String(from.id) === igId) continue;
      const base = { source: "post", user: from.username || "", text: str(v.text, 300), mediaId: v.media?.id || "" };
      const hit = await findRule(db, acc, clientId, "post", String(v.media?.id || ""), v.text);
      if (!hit) { await log(db, clientId, { ...base, ok: null, status: "Nenhuma automação com essa palavra" }); continue; }
      if (!(await firstTime(env.DB, "c" + v.id))) continue;
      const vars = { usuario: from.username || "", nome: from.username || "", palavra: hit.kw };
      try {
        await sendDM(acc, { comment_id: v.id }, hit.rule, vars);
        if (hit.rule.reply) {
          try { await igFetch(`/${v.id}/replies`, acc.token, { method: "POST", body: { message: fill(hit.rule.reply, vars) } }); } catch (e) { await log(db, clientId, { ...base, rule: hit.rule.name, ok: false, status: "DM enviada, mas a resposta pública falhou: " + e.message }); }
        }
        await bump(db, clientId, hit.rule.id);
        await log(db, clientId, { ...base, rule: hit.rule.name, ok: true, status: "DM enviada" });
      } catch (e) {
        await log(db, clientId, { ...base, rule: hit.rule.name, ok: false, status: "Erro ao enviar: " + e.message });
      }
    }

    /* respostas de story (chegam como mensagem na DM) */
    for (const m of entry.messaging || []) {
      const msg = m.message;
      if (!msg || msg.is_echo || msg.is_deleted || String(m.sender?.id) === igId) continue;
      const story = msg.reply_to?.story;
      if (!story) continue;
      const sender = String(m.sender?.id || "");
      let prof = {};
      try { prof = await igFetch(`/${sender}?fields=name,username`, acc.token); } catch { /* perfil indisponível */ }
      const base = { source: "story", user: prof.username || "", text: str(msg.text, 300), mediaId: story.id || "" };
      const hit = await findRule(db, acc, clientId, "story", String(story.id || ""), msg.text);
      if (!hit) { await log(db, clientId, { ...base, ok: null, status: "Nenhuma automação com essa palavra" }); continue; }
      if (!(await firstTime(env.DB, "m" + (msg.mid || sender + m.timestamp)))) continue;
      const vars = { usuario: prof.username || "", nome: (prof.name || "").split(" ")[0] || prof.username || "", palavra: hit.kw };
      try {
        await sendDM(acc, { id: sender }, hit.rule, vars);
        await bump(db, clientId, hit.rule.id);
        await log(db, clientId, { ...base, rule: hit.rule.name, ok: true, status: "DM enviada" });
      } catch (e) {
        await log(db, clientId, { ...base, rule: hit.rule.name, ok: false, status: "Erro ao enviar: " + e.message });
      }
    }
  }
}
async function bump(db, clientId, ruleId) {
  const k = `auto/rules/${clientId}/${ruleId}`;
  const r = await db.get(k, { type: "json" });
  if (!r) return;
  r.stats = { sent: (r.stats?.sent || 0) + 1, last: now() };
  await db.setJSON(k, r);
}

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ---------- conexão da conta ---------- */
async function saveAccount(db, clientId, token, expiresIn) {
  const me = await igFetch(`/me?fields=user_id,username`, token);
  const igId = String(me.user_id || me.id);
  const prev = await db.get(`auto/acc/${clientId}`, { type: "json" });
  if (prev?.igId && prev.igId !== igId) await db.delete(`auto/ig/${prev.igId}`);
  const other = await db.get(`auto/ig/${igId}`, { type: "json" });
  if (other?.clientId && other.clientId !== clientId) await db.delete(`auto/acc/${other.clientId}`);
  const acc = {
    igId, username: me.username || "", token, tokenAt: now(), connectedAt: now(),
    expiresAt: new Date(Date.now() + (Number(expiresIn) || 60 * 86400) * 1000).toISOString(), lastError: "",
  };
  try { await igFetch(`/me/subscribed_apps?subscribed_fields=comments,messages`, token, { method: "POST" }); }
  catch (e) { acc.lastError = "Não deu para ativar os avisos da conta: " + e.message; }
  await db.setJSON(`auto/acc/${clientId}`, acc);
  await db.setJSON(`auto/ig/${igId}`, { clientId });
  return acc;
}
async function longLived(cfg, shortToken) {
  const r = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(cfg.appSecret)}&access_token=${encodeURIComponent(shortToken)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(d.error?.message || "Não deu para gerar o token de longa duração");
  return d;
}

/* ---------- rotas públicas: /api/ig/... ---------- */
export async function igRoute(req, env, ctx, db) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/ig\/?/, "");
  const cfg = await getCfg(db, env);

  if (path === "webhook" && req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && cfg.verifyToken && url.searchParams.get("hub.verify_token") === cfg.verifyToken;
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Token de verificação incorreto", { status: 403 });
  }
  if (path === "webhook" && req.method === "POST") {
    const raw = await req.text();
    const sig = (req.headers.get("x-hub-signature-256") || "").replace(/^sha256=/, "");
    if (!cfg.appSecret || !sig || !same(await hmacHex(cfg.appSecret, raw), sig)) return new Response("Assinatura inválida", { status: 401 });
    let payload = null;
    try { payload = JSON.parse(raw); } catch { return new Response("ok"); }
    const work = processEvent(env, db, payload).catch((e) => console.error("auto", e));
    if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
    return new Response("ok");
  }
  if (path === "oauth" && req.method === "GET") {
    const back = (q) => Response.redirect(url.origin + "/automacoes?" + q, 302);
    const state = url.searchParams.get("state") || "";
    const st = /^[a-z0-9]{16,40}$/.test(state) ? await db.get(`auto/state/${state}`, { type: "json" }) : null;
    if (!st) return back("erro=" + encodeURIComponent("O link de conexão expirou. Tente conectar de novo."));
    await db.delete(`auto/state/${state}`);
    const clientId = st.clientId;
    if (url.searchParams.get("error")) return back(`c=${clientId}&erro=` + encodeURIComponent("A conexão foi cancelada no Instagram."));
    const code = (url.searchParams.get("code") || "").replace(/#_$/, "");
    try {
      const form = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: "authorization_code", redirect_uri: url.origin + "/api/ig/oauth", code });
      const r = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      const short = d.access_token || d.data?.[0]?.access_token;
      if (!short) throw new Error(d.error_message || d.error?.message || "O Instagram não devolveu o token");
      const ll = await longLived(cfg, short);
      const acc = await saveAccount(db, clientId, ll.access_token, ll.expires_in);
      return back(`c=${clientId}&ok=` + encodeURIComponent("@" + acc.username));
    } catch (e) {
      return back(`c=${clientId}&erro=` + encodeURIComponent("Não deu para conectar: " + e.message));
    }
  }
  return fail("Rota não encontrada", 404);
}

/* ---------- rotas do painel (já autenticadas): /api/admin/auto/... ---------- */
export async function autoAdmin(req, env, db, parts, url) {
  const method = req.method;
  const [a, cid, b, c] = parts;
  const body = method === "GET" || method === "DELETE" ? {} : await req.json().catch(() => ({}));
  const cfg = await getCfg(db, env);

  if (a === "overview" && method === "GET") {
    const clients = (await db.listJSON("clients/")).map((x) => ({ id: x.id, name: x.name, handle: x.handle || "", color: x.color, logoId: x.logoId || "", networks: x.networks || [] }));
    const accounts = {};
    const counts = {};
    for (const cl of clients) {
      accounts[cl.id] = publicAcc(await db.get(`auto/acc/${cl.id}`, { type: "json" }));
      counts[cl.id] = (await db.list({ prefix: `auto/rules/${cl.id}/` })).blobs.length;
    }
    return json({
      clients: clients.sort((x, y) => x.name.localeCompare(y.name, "pt")), accounts, counts,
      cfg: { appId: cfg.appId, hasSecret: !!cfg.appSecret, verifyToken: cfg.verifyToken, fromEnv: cfg.fromEnv, callbackUrl: url.origin + "/api/ig/webhook", redirectUri: url.origin + "/api/ig/oauth" },
      unknown: await readLog(db, "_", 10),
    });
  }
  if (a === "cfg" && method === "PUT") {
    if (cfg.fromEnv) return fail("O app está configurado pelas variáveis do Cloudflare. Mude por lá.");
    const prev = (await db.get("auto/cfg", { type: "json" })) || {};
    const appId = str(body.appId, 40).trim();
    if (appId && !/^\d{5,30}$/.test(appId)) return fail("O ID do app tem só números.");
    const next = {
      appId: appId || prev.appId || "",
      appSecret: str(body.appSecret, 100).trim() || prev.appSecret || "",
      verifyToken: prev.verifyToken || rid(24),
      updatedAt: now(),
    };
    await db.setJSON("auto/cfg", next);
    return json({ ok: true, cfg: { appId: next.appId, hasSecret: !!next.appSecret, verifyToken: next.verifyToken } });
  }

  if (a !== "clients" || !safeId(cid)) return fail("Rota não encontrada", 404);
  const client = await db.get(`clients/${cid}`, { type: "json" });
  if (!client) return fail("Cliente não encontrado", 404);
  const acc = await db.get(`auto/acc/${cid}`, { type: "json" });

  if (!b && method === "GET") {
    const rules = (await db.listJSON(`auto/rules/${cid}/`)).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    return json({ account: publicAcc(acc), rules, log: await readLog(db, cid) });
  }
  if (b === "connect-url" && method === "POST") {
    if (!cfg.appId || !cfg.appSecret) return fail("Configure o app da Meta antes de conectar (botão Configurar app).");
    const state = rid(24);
    await db.setJSON(`auto/state/${state}`, { clientId: cid, at: now() });
    const q = new URLSearchParams({ enable_fb_login: "0", force_authentication: "1", client_id: cfg.appId, redirect_uri: url.origin + "/api/ig/oauth", response_type: "code", scope: SCOPES, state });
    return json({ url: "https://www.instagram.com/oauth/authorize?" + q.toString() });
  }
  if (b === "token" && method === "POST") {
    let t = str(body.token, 600).trim();
    if (!/^[A-Za-z0-9_.|-]{40,600}$/.test(t)) return fail("Esse token não parece válido. Copie o token inteiro gerado no painel da Meta.");
    let exp = 60 * 86400;
    if (cfg.appSecret) {
      try { const ll = await longLived(cfg, t); t = ll.access_token; exp = ll.expires_in; } catch { /* já era de longa duração */ }
    }
    try { return json({ account: publicAcc(await saveAccount(db, cid, t, exp)) }); }
    catch (e) { return fail("O Instagram recusou esse token: " + e.message); }
  }
  if (b === "account" && method === "DELETE") {
    if (acc?.igId) await db.delete(`auto/ig/${acc.igId}`);
    await db.delete(`auto/acc/${cid}`);
    return json({ ok: true });
  }
  if (b === "media" && method === "GET") {
    if (!acc) return fail("Conecte o Instagram do cliente para ver as publicações.");
    try {
      const kind = url.searchParams.get("kind") === "story" ? "story" : "post";
      const list = (await listMedia(acc, kind)).slice(0, kind === "story" ? 50 : 60);
      return json({ media: list.map((m) => ({ id: m.id, permalink: m.permalink || "", caption: str(m.caption || "", 140), type: m.media_product_type || m.media_type || "", thumb: m.thumbnail_url || (m.media_type === "VIDEO" ? "" : m.media_url) || "", at: m.timestamp || "" })) });
    } catch (e) { return fail("Não deu para buscar as publicações: " + e.message); }
  }
  if (b === "test" && method === "POST") {
    const source = body.source === "story" ? "story" : "post";
    const rules = (await db.listJSON(`auto/rules/${cid}/`)).filter((r) => r.active && r.source === source);
    const hits = rules.map((r) => ({ r, kw: matches(r, body.text) })).filter((x) => x.kw);
    return json({ hits: hits.map((x) => ({ id: x.r.id, name: x.r.name, keyword: x.kw, specific: !!x.r.url })) });
  }
  if (b === "rules" && !c && method === "POST") {
    const rule = cleanRule(body, null);
    if (!rule.keywords.length) return fail("Adicione pelo menos uma palavra-chave.");
    if (!rule.dm) return fail("Escreva a mensagem da DM.");
    let warn = "";
    if (rule.url && !rule.mediaId && acc) { try { rule.mediaId = await resolveMediaId(acc, rule); } catch { /* resolve depois */ } if (!rule.mediaId) warn = "Não achei essa publicação no Instagram do cliente. Confira a URL."; }
    await db.setJSON(`auto/rules/${cid}/${rule.id}`, rule);
    return json({ rule, warn });
  }
  if (b === "rules" && safeIdLong(c)) {
    const k = `auto/rules/${cid}/${c}`;
    const prev = await db.get(k, { type: "json" });
    if (!prev) return fail("Automação não encontrada", 404);
    if (method === "DELETE") { await db.delete(k); return json({ ok: true }); }
    if (method === "PUT") {
      const rule = cleanRule({ ...prev, ...body }, prev);
      if (!rule.keywords.length) return fail("Adicione pelo menos uma palavra-chave.");
      if (!rule.dm) return fail("Escreva a mensagem da DM.");
      let warn = "";
      if (rule.url && !rule.mediaId && acc) { try { rule.mediaId = await resolveMediaId(acc, rule); } catch { /* resolve depois */ } if (!rule.mediaId) warn = "Não achei essa publicação no Instagram do cliente. Confira a URL."; }
      await db.setJSON(k, rule);
      return json({ rule, warn });
    }
  }
  return fail("Rota não encontrada", 404);
}
const safeIdLong = (s) => typeof s === "string" && /^[a-z0-9]{8,40}$/.test(s);

/* ---------- renovação diária dos tokens (valem 60 dias) ---------- */
export async function refreshTokens(db) {
  const accs = await db.list({ prefix: "auto/acc/" });
  for (const { key } of accs.blobs) {
    const acc = await db.get(key, { type: "json" });
    if (!acc?.token) continue;
    if (Date.now() - new Date(acc.tokenAt).getTime() < 7 * 86400 * 1000) continue;
    try {
      const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(acc.token)}`);
      const d = await r.json().catch(() => ({}));
      if (!d.access_token) throw new Error(d.error?.message || "sem token");
      acc.token = d.access_token;
      acc.tokenAt = now();
      acc.expiresAt = new Date(Date.now() + (Number(d.expires_in) || 60 * 86400) * 1000).toISOString();
      acc.lastError = "";
    } catch (e) {
      acc.lastError = "Não deu para renovar o acesso: " + e.message + ". Conecte de novo.";
    }
    await db.setJSON(key, acc);
  }
}
