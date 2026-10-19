/* Notificações no celular do cliente (Web Push, sem serviço pago)
   - as chaves VAPID são criadas no primeiro uso e ficam guardadas no D1
   - cada celular que ativa os avisos vira uma inscrição em push/s/<cliente>/<id>
   - quando o estúdio envia algo, os avisos são agrupados por alguns segundos e saem numa notificação só */

const te = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...arrs) => { const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; arrs.forEach((a) => { out.set(a, o); o += a.length; }); return out; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

/* chaves do servidor (criadas uma vez) */
let vapidCache = null;
export async function vapid(db) {
  if (vapidCache) return vapidCache;
  let v = await db.get("push/vapid", { type: "json" });
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    v = { pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
    const again = await db.get("push/vapid", { type: "json" }); /* outro pedido pode ter criado ao mesmo tempo */
    if (again) v = again; else await db.setJSON("push/vapid", v);
  }
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  vapidCache = { pub: v.pub, key };
  return vapidCache;
}

async function vapidAuth(db, endpoint, origin) {
  const v = await vapid(db);
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: origin })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.key, te.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

/* criptografia aes128gcm (RFC 8291) */
async function encrypt(sub, payload) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(te.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

async function sendOne(db, sub, payload, origin) {
  const body = await encrypt(sub, JSON.stringify(payload));
  return fetch(sub.endpoint, {
    method: "POST",
    headers: { authorization: await vapidAuth(db, sub.endpoint, origin), "content-encoding": "aes128gcm", "content-type": "application/octet-stream", ttl: "172800", urgency: "high", topic: "aprova" },
    body,
  });
}

const subKey = async (clientId, endpoint) => `push/s/${clientId}/${b64u(await crypto.subtle.digest("SHA-256", te.encode(endpoint))).slice(0, 24)}`;
export function cleanSub(s) {
  if (!s || typeof s !== "object" || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  const k = s.keys || {};
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string" || k.p256dh.length > 200 || k.auth.length > 100) return null;
  try { if (unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length < 16) return null; } catch { return null; }
  return { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}
export async function saveSub(db, clientId, sub, ua) {
  await db.setJSON(await subKey(clientId, sub.endpoint), { ...sub, at: new Date().toISOString(), ua: String(ua || "").slice(0, 160) });
}
export async function dropSub(db, clientId, endpoint) { await db.delete(await subKey(clientId, endpoint)); }
export async function countSubs(db, clientId) { return (await db.listJSON(`push/s/${clientId}/`)).length; }

/* manda para todos os celulares do cliente; inscrições vencidas são apagadas */
export async function pushClient(db, client, payload, origin) {
  const subs = await db.listJSON(`push/s/${client.id}/`);
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const r = await sendOne(db, s, payload, origin);
      if (r.status === 404 || r.status === 410) await dropSub(db, client.id, s.endpoint);
      else if (r.ok) ok++;
    } catch { /* tenta de novo no próximo envio */ }
  }));
  return { ok, total: subs.length };
}

/* ---------- o que vira aviso ---------- */
const KINDS = { posts: ["post", "posts"], plans: ["planejamento", "planejamentos"], projects: ["projeto", "projetos"], guide: ["guia visual", "guias visuais"] };
function message(client, items) {
  const nm = String(client.nickname || client.name || "").trim().split(/\s+/)[0];
  const fresh = items.filter((i) => !i.adjusted), adj = items.filter((i) => i.adjusted);
  const one = (i) => (i.title ? `“${i.title.slice(0, 60)}”` : KINDS[i.kind]?.[0] || "conteúdo");
  let body;
  if (fresh.length === 1 && !adj.length) {
    const i = fresh[0];
    body = i.version > 1 ? `Nova versão de ${one(i)} esperando sua aprovação.` : `${i.kind === "posts" ? "Novo post" : i.kind === "plans" ? "Novo planejamento" : i.kind === "guide" ? "Seu guia visual" : "Novo projeto"} para aprovar: ${one(i)}`;
  } else if (!fresh.length && adj.length === 1) body = `O estúdio fez os ajustes em ${one(adj[0])}. Confere e aprova?`;
  else {
    const by = {};
    items.forEach((i) => { by[i.kind] = (by[i.kind] || 0) + 1; });
    const parts = Object.entries(by).map(([k, n]) => `${n} ${KINDS[k]?.[n === 1 ? 0 : 1] || "itens"}`);
    const list = parts.length > 1 ? parts.slice(0, -1).join(", ") + " e " + parts.at(-1) : parts[0];
    body = `${list} esperando sua aprovação.`;
  }
  return { title: nm ? `${nm}, chegou novidade no Aprova` : "Chegou novidade no Aprova", body };
}

/* junta tudo o que o estúdio mandou em ~15 s numa notificação só */
const WAIT = 15000;
export async function queuePush(db, client, item, origin) {
  if (!client?.token) return;
  if (!(await countSubs(db, client.id))) return;
  const key = `push/q/${client.id}`;
  const q = (await db.get(key, { type: "json" })) || { items: [] };
  const mine = Date.now() + Math.random();
  const items = (Date.now() - (q.first || 0) < 120000 ? q.items : []).filter((x) => !(x.kind === item.kind && x.id === item.id));
  items.push(item);
  await db.setJSON(key, { items: items.slice(-40), at: mine, first: items.length > 1 ? q.first : Date.now() });
  await sleep(WAIT);
  const now = await db.get(key, { type: "json" });
  if (!now || now.at !== mine) return; /* chegou outro depois: ele envia */
  await db.delete(key);
  const m = message(client, now.items);
  await pushClient(db, client, { ...m, url: `/c/${client.token}`, tag: `aprova-${client.id}` }, origin);
}

/* lê a resposta do estúdio e decide se o cliente precisa ser avisado */
export function pushItemFrom(kind, data) {
  const it = data && (data.post || data.plan || data.project || data.guide);
  if (!it || it.visible === false) return null;
  const recent = (t) => t && Date.now() - Date.parse(t) < 20000;
  const base = { kind, id: it.id || kind, title: String(it.title || "").trim(), version: it.version || 1 };
  if (recent(it.sentAt)) return base;
  const r = it.review || {};
  if (r.status === "ajustado" && recent(r.at)) return { ...base, adjusted: true };
  return null;
}
