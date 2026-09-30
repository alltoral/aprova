

const STATUSES = ["pendente", "aprovado", "alteracao", "reprovado", "ajustado"];
const CHUNK = 1900000; /* cada parte enviada ao servidor (limite de 2 MB por linha do D1) */
const MAX_FILE = 200 * 1024 * 1024; /* limite por arquivo (vídeos) */
const NETWORKS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "pinterest", "x", "whatsapp"];
const FORMATS = ["4x5", "1x1", "9x16", "16x9"];
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
    color,
    networks: Array.isArray(body.networks) ? [...new Set(body.networks.filter((n) => NETWORKS.includes(n)))] : prev?.networks || ["instagram"],
    ads: typeof body.ads === "boolean" ? body.ads : !!prev?.ads,
    logoId: typeof body.logoId === "string" && prev?.id && body.logoId.startsWith(prev.id + "/") ? body.logoId : body.logoId === "" ? "" : prev?.logoId || "",
    createdAt: prev?.createdAt || now(),
    updatedAt: now(),
  };
}

function publicClient(c) {
  const { token: _t, ...rest } = c;
  return rest;
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
        return json({ client: publicClient(client), posts });
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

      if (a === "clients" && !b && method === "GET") {
        const clients = await listJSON(db, "clients/");
        const withCounts = await Promise.all(
          clients.map(async (cl) => {
            const posts = (await listJSON(db, `posts/${cl.id}/`)).filter((p) => p.visible !== false);
            const counts = { pendente: 0, aprovado: 0, alteracao: 0, reprovado: 0, ajustado: 0 };
            posts.forEach((p) => counts[STATUSES.includes(p.review?.status) ? p.review.status : "pendente"]++);
            return { ...cl, counts };
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
          return json({ client, posts });
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
            prev.review = e === "clear" ? { ...(prev.review || {}), history: prev.review?.history || [] } : addHistory(prev, { kind: "review", status: "pendente", note: "Nova versão enviada pelo estúdio", byLabel: "ALL TORAL", at: now() });
            Object.assign(prev.review, { status: "pendente", note: "", at: now(), byLabel: "ALL TORAL" });
            await db.setJSON(key, prev);
            return json({ post: prev });
          }
          if (e === "adjusted" && method === "POST") {
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
