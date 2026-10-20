/* Reuniões · Aprova All Toral
   O navegador grava (ou lê um arquivo), manda o áudio em partes de ~45 s,
   o servidor transcreve cada parte e, no fim, monta resumo, tarefas e checklist. */

const WHISPER = "@cf/openai/whisper-large-v3-turbo";
const LLMS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/meta/llama-3.1-8b-instruct"];
const WHO = ["ALL TORAL", "Cliente", "Ambos"];
const MAX_AUDIO = 6 * 1024 * 1024;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (m, s = 400) => json({ error: m }, s);
const now = () => new Date().toISOString();
const str = (v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
const rid = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const safeId = (s) => typeof s === "string" && /^[a-z0-9]{4,40}$/.test(s);
const pad = (n) => String(n).padStart(5, "0");
/* ---------- cota grátis do dia (Workers AI: 10.000 neurons por dia, zera 00:00 UTC) ----------
   O Aprova para antes de chegar no limite. O que passar fica guardado e é transcrito no dia seguinte. */
const DAY_LIMIT = 8000; /* margem para as outras funções de IA do Aprova */
const N_MIN = 46.63; /* whisper turbo, por minuto de áudio */
const sumCost = (chars) => Math.ceil((chars / 3.2) * 0.02667 + 450);
const today = () => new Date().toISOString().slice(0, 10);
async function quota(db) {
  const q = (await db.get("cfg/ai-day", { type: "json" })) || {};
  return q.day === today() ? { day: q.day, used: q.used || 0 } : { day: today(), used: 0 };
}
async function spend(db, n) {
  const q = await quota(db);
  q.used += n;
  await db.setJSON("cfg/ai-day", q);
  return q;
}
async function canSpend(db, n) { const q = await quota(db); return q.used + n <= DAY_LIMIT; }
const quotaInfo = (q) => ({ used: Math.round(q.used), limit: DAY_LIMIT, minutesLeft: Math.max(0, Math.floor((DAY_LIMIT - q.used - 700) / N_MIN)) });

async function body(req) { try { return await req.json(); } catch { return {}; } }

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

/* frases que o Whisper inventa em silêncio */
const JUNK = [/legendas? (pela|por) (comunidade )?amara/i, /obrigad[oa] por assistir/i, /inscreva-se no canal/i, /^\W*(tchau|obrigad[oa])\W*$/i, /^\W*$/];
function clean(text) {
  return String(text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s && !JUNK.some((r) => r.test(s))).join(" ").replace(/\s+/g, " ").trim();
}

function cleanTask(t, i) {
  return { id: safeId(t?.id) ? t.id : rid(8), texto: str(t?.texto, 400).trim(), quem: WHO.includes(t?.quem) ? t.quem : "ALL TORAL", prazo: str(t?.prazo, 60).trim(), feito: t?.feito === true, ordem: Number.isFinite(t?.ordem) ? t.ordem : i };
}
function cleanSummary(o) {
  const list = (v, n, m) => (Array.isArray(v) ? v : []).map((x) => str(typeof x === "string" ? x : x?.texto || "", m).trim()).filter(Boolean).slice(0, n);
  return {
    resumo: str(o?.resumo, 3000).trim(),
    pontos: list(o?.pontos, 20, 400),
    decisoes: list(o?.decisoes, 20, 400),
    tarefas: (Array.isArray(o?.tarefas) ? o.tarefas : []).slice(0, 40).map(cleanTask).filter((t) => t.texto),
    proxima: str(o?.proxima, 300).trim(),
  };
}
const meta = (m) => { const { ...x } = m; return x; };

async function transcript(db, id) {
  const segs = await db.listJSON(`meetseg/${id}/`);
  return segs.sort((a, b) => a.seq - b.seq).map((s) => s.text).filter(Boolean).join("\n");
}

function pickJSON(raw) {
  const t = typeof raw === "object" && raw ? JSON.stringify(raw) : String(raw || "");
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
async function ask(env, prompt, max = 3000) {
  for (const model of LLMS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: max });
      const raw = r?.response ?? r;
      if (raw) return raw;
    } catch (e) { /* tenta o próximo */ }
  }
  return null;
}

async function summarize(env, text, m, clientName) {
  const ctx = `Reunião do estúdio criativo ALL TORAL (branding, social media e apps) com o cliente ${clientName || "do estúdio"}${m.title ? `, assunto: "${m.title}"` : ""}.`;
  let base = text;
  /* reuniões longas: resume em partes antes */
  if (text.length > 28000) {
    const parts = [];
    for (let i = 0; i < text.length; i += 24000) parts.push(text.slice(i, i + 24000));
    const notes = [];
    for (const [i, p] of parts.entries()) {
      const r = await ask(env, `${ctx}\nEste é o trecho ${i + 1} de ${parts.length} da transcrição. Anote em português, em tópicos curtos, tudo que foi discutido, decidido e combinado (quem faz o quê e quando). Não invente nada.\n"""\n${p}\n"""`, 1500);
      notes.push(typeof r === "string" ? r : JSON.stringify(r || ""));
    }
    base = notes.join("\n\n");
  }
  const prompt = `${ctx}
Leia a transcrição abaixo (pode ter erros de reconhecimento de voz) e responda SOMENTE com um objeto JSON válido, em português do Brasil, sem comentários:
{
 "titulo": "assunto da reunião em até 6 palavras",
 "resumo": "3 a 6 frases objetivas sobre o que foi tratado",
 "pontos": ["assuntos discutidos, um por item"],
 "decisoes": ["o que ficou decidido"],
 "tarefas": [{ "texto": "ação concreta, começando com verbo", "quem": "ALL TORAL" | "Cliente" | "Ambos", "prazo": "prazo citado ou vazio" }],
 "proxima": "data ou combinado da próxima reunião, ou vazio"
}
Regras: tarefas só do que foi realmente combinado; "Cliente" quando a ação depende do cliente (enviar material, aprovar, pagar, responder); não invente prazos; escreva sem travessões.
${text.length > 28000 ? "Anotações da reunião" : "Transcrição"}:
"""
${base.slice(0, 60000)}
"""`;
  const raw = await ask(env, prompt, 3000);
  const o = pickJSON(raw);
  if (!o) return null;
  return { titulo: str(o.titulo, 120).trim(), ...cleanSummary(o) };
}

async function whisper(env, db, id, seq, buf) {
  const prev = seq > 0 ? await db.get(`meetseg/${id}/${pad(seq - 1)}`, { type: "json" }) : null;
  const r = await env.AI.run(WHISPER, {
    audio: b64(buf), language: "pt", vad_filter: true, condition_on_previous_text: false,
    initial_prompt: (prev?.text ? prev.text.slice(-200) : "Reunião de trabalho em português do Brasil entre o estúdio ALL TORAL e um cliente."),
  });
  return clean(r?.text);
}

/* ---------- de hora em hora: transcreve o que ficou guardado e fecha as reuniões na fila ---------- */
export async function meetCron(env, db) {
  if (!env.AI) return;
  const { blobs } = await db.list({ prefix: "meetaudio/" });
  let n = 0;
  for (const { key: k } of blobs.sort((a, b) => a.key.localeCompare(b.key))) {
    if (n++ >= 10) return; /* poucos por rodada */
    const [, id, sq] = k.split("/");
    const seg = (await db.get(`meetseg/${id}/${sq}`, { type: "json" })) || { seq: +sq, s: 45 };
    const cost = Math.ceil((seg.s || 45) / 60 * N_MIN);
    if (!(await canSpend(db, cost))) return;
    const buf = await db.get(k);
    if (!buf) { await db.delete(k); continue; }
    try {
      const text = await whisper(env, db, id, +sq, buf);
      await spend(db, cost);
      await db.setJSON(`meetseg/${id}/${sq}`, { ...seg, text, pending: false, at: now() });
      await db.delete(k);
    } catch (e) { return; }
  }
  const queued = (await db.listJSON("meet/")).filter((m) => m.status === "fila");
  for (const m of queued.slice(0, 2)) {
    if ((await db.list({ prefix: `meetaudio/${m.id}/` })).blobs.length) continue;
    const text = await transcript(db, m.id);
    const cost = sumCost(Math.min(text.length, 60000));
    if (!(await canSpend(db, cost))) return;
    const client = m.clientId ? await db.get(`clients/${m.clientId}`, { type: "json" }) : null;
    const s = text.trim().length < 40 ? null : await summarize(env, text, m, client?.name || m.lead);
    await spend(db, cost);
    if (s) { if (!m.title && s.titulo) m.title = s.titulo; delete s.titulo; m.summary = s; m.error = ""; }
    else m.error = text.trim().length < 40 ? "Quase nada foi captado." : "A IA não conseguiu montar o resumo. Tente Refazer resumo.";
    m.status = "pronta"; m.pending = false; m.updatedAt = now();
    await db.setJSON(`meet/${m.id}`, m);
  }
}

/* ---------- rotas /api/admin/meet/... (já autenticadas) ---------- */
export async function meetAdmin(req, env, db, parts, url) {
  const method = req.method;
  const [id, action] = parts;

  if (!id && method === "GET") {
    const all = await db.listJSON("meet/");
    const clients = (await db.listJSON("clients/")).map((c) => ({ id: c.id, name: c.name, color: c.color || "", logoId: c.logoId || "", handle: c.handle || "" })).sort((a, b) => a.name.localeCompare(b.name));
    return json({ meetings: all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(meta), clients, quota: quotaInfo(await quota(db)) });
  }

  if (!id && method === "POST") {
    const b = await body(req);
    const clientId = safeId(b.clientId) ? b.clientId : "";
    const m = { id: rid(10), clientId, lead: clientId ? "" : str(b.lead, 80).trim(), title: str(b.title, 120).trim(), link: str(b.link, 300).trim(), source: b.source === "arquivo" ? "arquivo" : "gravacao", status: "gravando", segs: 0, seconds: 0, createdAt: now(), updatedAt: now(), summary: null, error: "" };
    await db.setJSON(`meet/${m.id}`, m);
    return json({ meeting: m });
  }

  if (!safeId(id)) return fail("Rota não encontrada", 404);
  const key = `meet/${id}`;
  const m = await db.get(key, { type: "json" });
  if (!m) return fail("Reunião não encontrada", 404);

  if (!action && method === "GET") return json({ meeting: m, transcript: await transcript(db, id) });

  if (!action && method === "PUT") {
    const b = await body(req);
    if (typeof b.title === "string") m.title = str(b.title, 120).trim();
    if (typeof b.clientId === "string") m.clientId = safeId(b.clientId) ? b.clientId : "";
    if (typeof b.lead === "string") m.lead = str(b.lead, 80).trim();
    if (typeof b.link === "string") m.link = str(b.link, 300).trim();
    if (b.summary && typeof b.summary === "object") m.summary = { ...(m.summary || {}), ...cleanSummary({ ...(m.summary || {}), ...b.summary }) };
    if (typeof b.transcript === "string") {
      await db.deletePrefix(`meetseg/${id}/`);
      await db.setJSON(`meetseg/${id}/${pad(0)}`, { seq: 0, text: str(b.transcript, 400000) });
    }
    m.updatedAt = now();
    await db.setJSON(key, m);
    return json({ meeting: m });
  }

  if (!action && method === "DELETE") {
    await db.deletePrefix(`meetseg/${id}/`);
    await db.deletePrefix(`meetaudio/${id}/`);
    await db.delete(key);
    return json({ ok: true });
  }

  /* uma parte do áudio (WAV 16 kHz mono) */
  if (action === "audio" && method === "POST") {
    if (!env.AI) return fail("A IA do Cloudflare não está ligada neste Aprova.", 501);
    const seq = Math.max(0, Math.min(99999, parseInt(url.searchParams.get("seq") || "0", 10) || 0));
    const secs = Math.max(0, Math.min(600, Number(url.searchParams.get("s")) || 0));
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return fail("Áudio vazio");
    if (buf.byteLength > MAX_AUDIO) return fail("Parte de áudio grande demais");
    const cost = Math.ceil((secs || 45) / 60 * N_MIN);
    const bump = async () => { m.seconds = Math.max(m.seconds || 0, Math.round(Number(url.searchParams.get("t")) || 0)); m.updatedAt = now(); };
    if (!(await canSpend(db, cost))) {
      /* passou da cota grátis de hoje: guarda o áudio para transcrever amanhã */
      await db.set(`meetaudio/${id}/${pad(seq)}`, buf);
      await db.setJSON(`meetseg/${id}/${pad(seq)}`, { seq, text: "", s: secs, at: now(), pending: true });
      m.pending = true; await bump(); await db.setJSON(key, m);
      return json({ seq, text: "", pending: true });
    }
    let text = "";
    try {
      text = await whisper(env, db, id, seq, buf);
    } catch (e) {
      /* IA indisponível ou sem cota: guarda e o horário seguinte tenta de novo */
      await db.set(`meetaudio/${id}/${pad(seq)}`, buf);
      await db.setJSON(`meetseg/${id}/${pad(seq)}`, { seq, text: "", s: secs, at: now(), pending: true });
      m.pending = true; await bump(); await db.setJSON(key, m);
      return json({ seq, text: "", pending: true });
    }
    await spend(db, cost);
    await db.setJSON(`meetseg/${id}/${pad(seq)}`, { seq, text, s: secs, at: now() });
    const segs = await db.list({ prefix: `meetseg/${id}/` });
    m.segs = segs.blobs.length;
    await bump();
    await db.setJSON(key, m);
    return json({ seq, text });
  }

  /* fecha a reunião: resumo, tarefas e checklist */
  if (action === "finish" && method === "POST") {
    if (!env.AI) return fail("A IA do Cloudflare não está ligada neste Aprova.", 501);
    if ((await db.list({ prefix: `meetaudio/${id}/` })).blobs.length) {
      m.status = "fila"; m.error = ""; m.updatedAt = now(); await db.setJSON(key, m);
      return json({ meeting: m, quota: quotaInfo(await quota(db)) });
    }
    const text = await transcript(db, id);
    if (!(await canSpend(db, sumCost(Math.min(text.length, 60000))))) {
      m.status = "fila"; m.error = ""; m.updatedAt = now(); await db.setJSON(key, m);
      return json({ meeting: m, quota: quotaInfo(await quota(db)) });
    }
    if (text.trim().length < 40) {
      m.status = "pronta"; m.error = "Quase nada foi captado. Confira se o microfone estava ouvindo a reunião.";
      m.summary = m.summary || cleanSummary({});
      await db.setJSON(key, m);
      return json({ meeting: m });
    }
    const client = m.clientId ? await db.get(`clients/${m.clientId}`, { type: "json" }) : null;
    const s = await summarize(env, text, m, client?.name || m.lead);
    await spend(db, sumCost(Math.min(text.length, 60000)));
    if (!s) { m.status = "pronta"; m.error = "A IA não conseguiu montar o resumo. Tente Refazer resumo."; await db.setJSON(key, m); return json({ meeting: m }); }
    const keepDone = new Set((m.summary?.tarefas || []).filter((t) => t.feito).map((t) => t.texto));
    s.tarefas.forEach((t) => { if (keepDone.has(t.texto)) t.feito = true; });
    if (!m.title && s.titulo) m.title = s.titulo;
    delete s.titulo;
    m.summary = s;
    m.status = "pronta"; m.error = ""; m.pending = false; m.updatedAt = now();
    await db.setJSON(key, m);
    return json({ meeting: m, quota: quotaInfo(await quota(db)) });
  }

  return fail("Rota não encontrada", 404);
}
