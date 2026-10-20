/* Reuniões · Aprova All Toral
   Grava a reunião (ou lê um arquivo), transcreve em partes e monta resumo, tarefas e checklist. */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const two = (n) => String(n).padStart(2, "0");
const dt = (s) => { const d = new Date(s); return isNaN(d) ? "" : `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`; };
const hm = (s) => { const d = new Date(s); return isNaN(d) ? "" : `${two(d.getHours())}h${two(d.getMinutes())}`; };
const clock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`; };
const dur = (sec) => { const m = Math.round((sec || 0) / 60); return m < 1 ? "menos de 1 min" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? two(m % 60) : ""}`; };
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3400); }
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>';
const SEG = 45; /* segundos de áudio por parte enviada */
const RATE = 16000;

const S = {
  pass: store.get("aprov_admin"), loginErr: "", ready: false, loadErr: "",
  meetings: [], clients: [], quota: null, filter: store.get("mt_filter") || "",
  view: "list", cur: null, transcript: "", tab: "check", armed: null,
  rec: null, up: null, logoSvg: "",
};

async function api(path, opts = {}) {
  const headers = { authorization: "Bearer " + (S.pass || "") };
  let body = opts.body;
  if (body instanceof Blob) headers["content-type"] = body.type || "application/octet-stream";
  else if (body) { headers["content-type"] = "application/json"; body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, { method: opts.method || "GET", headers, body }); } catch (e) { throw new Error("Sem conexão. Confira a internet."); }
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (r.status === 401) { S.pass = null; store.set("aprov_admin", null); S.loginErr = "Entre com a senha do painel do Aprova."; render(); }
  if (!r.ok) { const e = new Error(data.error || "Não deu certo. Tente de novo."); e.status = r.status; throw e; }
  return data;
}
const client = (id) => S.clients.find((c) => c.id === id);
const isLead = (m) => !client(m?.clientId);
const nameOf = (m) => client(m?.clientId)?.name || m?.lead || "";
const leadAv = (cls = "") => `<span class="mt-av ${cls} lead">L</span>`;
const av = (c, cls = "") => `<span class="mt-av ${cls}" style="background:${esc(c?.color || "#fff")}">${c?.logoId ? `<img src="/api/media/${esc(c.logoId)}" alt="">` : esc(initials(c?.name || "?"))}</span>`;

/* ---------- moldura ---------- */
function bar() {
  return `<header class="bar"><div class="wrap"><a class="bar-brand is-link" href="/admin" style="text-decoration:none;color:inherit" title="Voltar para as aprovações"><img class="bar-larot" src="/larot.png" alt="" width="56" height="56"><div class="bar-t"><small>ALL TORAL</small><b>Suas <em>reuniões</em></b></div></a><div class="bar-r"></div></div></header>`;
}
function foot() { return `<footer class="foot"><div class="wrap"><img src="/logo.svg" alt="ALL TORAL" style="height:40px"><span>Estúdio criativo · Reuniões</span><span>@all.toral</span></div></footer>`; }

function render() {
  const m = $("#main");
  if (!S.pass) { m.innerHTML = bar() + loginView() + foot(); $("#pw")?.focus(); return; }
  if (!S.ready) { m.innerHTML = bar() + `<div class="wrap center-msg"><div><p class="eyebrow">Carregando</p><h1>${S.loadErr ? "Não deu para abrir" : "Buscando as reuniões"}</h1>${S.loadErr ? `<p style="color:var(--muted)">${esc(S.loadErr)}</p><p><button class="btn pri" data-act="reload">Tentar de novo</button></p>` : ""}</div></div>` + foot(); return; }
  let body = "";
  if (S.view === "rec") body = recView();
  else if (S.view === "up") body = upView();
  else if (S.view === "meet" && S.cur) body = meetView();
  else body = listView();
  const keep = document.activeElement?.id;
  m.innerHTML = bar() + `<main class="wrap mt-main">${body}</main>` + foot();
  if (keep && $("#" + keep) && keep !== "pw") $("#" + keep).focus();
}
function loginView() {
  return `<div class="wrap center-msg"><form class="login" id="login"><p class="eyebrow">Painel do estúdio</p><h1>Entre no <em style="color:var(--pink)">Aprova</em></h1>
  <label class="field"><span>Senha do painel</span><input type="password" id="pw" autocomplete="current-password" required></label>
  ${S.loginErr ? `<p class="err">${esc(S.loginErr)}</p>` : ""}<button class="btn pri" type="submit">Entrar</button></form></div>`;
}

/* ---------- lista ---------- */
function statusPill(m) {
  if (S.rec && S.rec.id === m.id) return `<span class="mt-st rec"><i></i>Gravando</span>`;
  if (m.status === "gravando") return `<span class="mt-st warn">Interrompida</span>`;
  if (m.status === "fila") return `<span class="mt-st warn">Na fila</span>`;
  const open = (m.summary?.tarefas || []).filter((t) => !t.feito).length;
  return `<span class="mt-st">${open ? `${open} ${open === 1 ? "tarefa aberta" : "tarefas abertas"}` : "Pronta"}</span>`;
}
function listView() {
  const used = new Set(S.meetings.map((m) => m.clientId));
  const chips = [`<button class="mt-chip plain" data-act="filter" data-id="" aria-pressed="${!S.filter}">Todas</button>`]
    .concat(S.clients.filter((c) => used.has(c.id)).map((c) => `<button class="mt-chip" data-act="filter" data-id="${c.id}" aria-pressed="${S.filter === c.id}">${av(c)}${esc(c.name)}</button>`))
    .concat(S.meetings.some(isLead) ? [`<button class="mt-chip lead" data-act="filter" data-id="lead" aria-pressed="${S.filter === "lead"}">${leadAv()}Leads</button>`] : []);
  const list = S.meetings.filter((m) => !S.filter || (S.filter === "lead" ? isLead(m) : m.clientId === S.filter));
  const cards = list.map((m) => {
    const c = client(m.clientId);
    return `<button class="mt-card ${c ? "" : "lead"}" data-act="open" data-id="${m.id}"><div class="sw" style="${c ? `background:${esc(c.color || "var(--pink)")}` : ""}"></div><div class="bd">
      <div class="who">${c ? av(c) : leadAv()}<span>${c ? esc(c.name) : `Lead${m.lead ? " · " + esc(m.lead) : ""}`}</span></div>
      <h3>${esc(m.title || "Reunião sem título")}</h3>
      <div class="meta"><span>${dt(m.createdAt)} às ${hm(m.createdAt)}</span><span>${dur(m.seconds)}</span></div>${statusPill(m)}</div></button>`;
  }).join("");
  return `<div class="mt-head"><div><p class="eyebrow">Estúdio criativo</p><h1>Suas <em>reuniões</em></h1><p>Grave a call ou envie o áudio. O Aprova transcreve, resume e monta o checklist para mandar ao cliente.</p>${quotaLine()}</div>
    <div><button class="btn pri" data-act="new">+ Nova reunião</button></div></div>
    ${S.meetings.length ? `<div class="mt-filter">${chips.join("")}</div>` : ""}
    ${list.length ? `<div class="mt-grid">${cards}</div>` : `<div class="emptybox"><h3>Nenhuma reunião ainda</h3><p>Comece uma gravação na próxima call ou envie o áudio de uma reunião que já aconteceu.</p><button class="btn pri" data-act="new">+ Nova reunião</button></div>`}`;
}

function quotaLine() {
  const q = S.quota; if (!q) return "";
  const h = Math.floor(q.minutesLeft / 60), mi = q.minutesLeft % 60;
  return `<p class="mt-quota">Grátis hoje: ${q.minutesLeft ? `cerca de ${h ? h + "h" + (mi ? two(mi) : "") : mi + " min"} de reunião` : "cota do dia usada. O que gravar agora é transcrito sozinho a partir das 21h"}.</p>`;
}

/* ---------- nova reunião ---------- */
const canTab = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
let NEW = null;
function openNew() {
  NEW = { clientId: S.filter && S.filter !== "lead" ? S.filter : "", lead: "", title: "", link: "", mode: "rec", tab: false, file: null };
  renderNew();
}
function renderNew() {
  const sh = $("#sheet");
  const opts = `<option value="">Lead (não é cliente)</option>` + S.clients.map((c) => `<option value="${c.id}" ${NEW.clientId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  sh.innerHTML = `<div class="panel" style="max-width:640px" role="dialog" aria-modal="true" aria-labelledby="nt"><div class="panel-h"><div class="t"><p class="eyebrow">Nova reunião</p><h2 id="nt">Como vai ser a captação?</h2></div><button class="x" data-act="close" aria-label="Fechar">×</button></div>
  <form class="form" id="newForm">
    <div class="fgrid">
      <label class="field"><span>Cliente</span><select id="nClient">${opts}</select></label>
      ${NEW.clientId ? "" : `<label class="field"><span>Nome do lead</span><input type="text" id="nLead" maxlength="80" placeholder="Ex.: Clínica Sorriso" value="${esc(NEW.lead)}"></label>`}
      <label class="field ${NEW.clientId ? "" : "full"}"><span>Assunto (opcional)</span><input type="text" id="nTitle" maxlength="120" placeholder="A IA sugere se ficar vazio" value="${esc(NEW.title)}"></label>
      <label class="field full"><span>Link do Meet (opcional)</span><input type="url" id="nLink" placeholder="https://meet.google.com/abc-defg-hij" value="${esc(NEW.link)}"></label>
    </div>
    <div class="mt-pick">
      <button type="button" class="mt-opt" data-act="mode" data-k="rec" aria-pressed="${NEW.mode === "rec"}"><b>Gravar agora</b><span>O microfone deste aparelho ouve a call. Funciona no celular e no computador.</span></button>
      <button type="button" class="mt-opt" data-act="mode" data-k="up" aria-pressed="${NEW.mode === "up"}"><b>Enviar arquivo</b><span>Áudio ou vídeo de uma reunião que já aconteceu.</span></button>
    </div>
    ${NEW.mode === "rec" ? `
      ${canTab() ? `<label class="mt-check"><input type="checkbox" id="nTab" ${NEW.tab ? "checked" : ""}><span><b>Captar também o som da aba do Meet</b><br><span style="color:var(--muted);font-size:13px">Pega a voz do cliente mesmo com fone. Ao começar, escolha a aba do Meet e marque "Compartilhar áudio da aba".</span></span></label>` : ""}
      <div class="mt-note"><b>Para captar os dois lados:</b> deixe a call no alto-falante, ou grave num segundo aparelho (o celular ao lado do computador). Com fone de ouvido, o microfone só ouve a sua voz. Mantenha esta tela aberta e acesa enquanto grava.</div>`
    : `<label class="field"><span>Arquivo da reunião</span><input type="file" id="nFile" accept="audio/*,video/*,.m4a,.mp3,.mp4,.wav,.webm,.ogg,.aac,.mov"></label>
      <div class="mt-note">Vale gravação do celular, do Meet ou de qualquer app. Reuniões longas levam alguns minutos para transcrever; deixe a tela aberta até terminar.</div>`}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn pri" type="submit">${NEW.mode === "rec" ? "Começar a gravar" : "Transcrever arquivo"}</button><button class="btn ghost" type="button" data-act="close">Cancelar</button></div>
  </form></div>`;
  sh.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheet() { $("#sheet").hidden = true; $("#sheet").innerHTML = ""; document.body.style.overflow = ""; }
function readNew() {
  NEW.clientId = $("#nClient")?.value || "";
  NEW.title = $("#nTitle")?.value.trim() || "";
  NEW.lead = NEW.clientId ? "" : ($("#nLead")?.value.trim() ?? NEW.lead ?? "");
  NEW.link = $("#nLink")?.value.trim() || "";
  NEW.tab = !!$("#nTab")?.checked;
  NEW.file = $("#nFile")?.files?.[0] || null;
}

/* ---------- áudio: utilidades ---------- */
function downsample(buf, rate) {
  if (rate === RATE) return buf;
  const ratio = rate / RATE, n = Math.floor(buf.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(buf.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += buf[j];
    out[i] = s / ((b - a) || 1);
  }
  return out;
}
function wav(samples) {
  const v = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0, o = 44; i < samples.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([v], { type: "audio/wav" });
}
const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, a.length / 4)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sendPart(id, seq, blob, secs, t) {
  for (let i = 0; ; i++) {
    try { return await api(`/api/admin/meet/${id}/audio?seq=${seq}&s=${Math.round(secs)}&t=${Math.round(t)}`, { method: "POST", body: blob }); }
    catch (e) { if (e.status === 401 || e.status === 404 || i >= 8) throw e; await sleep(Math.min(20000, 1500 * 2 ** i)); }
  }
}

/* ---------- gravação ao vivo ---------- */
async function startRec() {
  readNew();
  const R = { streams: [], chunks: [], len: 0, seq: 0, queue: [], sending: false, sent: 0, live: [], paused: false, elapsed: 0, last: 0, level: 0, err: "", stopping: false };
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não libera o microfone. Abra o Aprova no Safari, Chrome ou Edge.");
    if (NEW.tab) {
      try {
        const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (d.getAudioTracks().length) R.streams.push(d); else { d.getTracks().forEach((t) => t.stop()); toast("A aba foi compartilhada sem áudio. Gravando só o microfone."); }
      } catch (e) { toast("Sem o som da aba. Gravando só o microfone."); }
    }
    R.streams.push(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
  } catch (e) {
    R.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    toast(e.name === "NotAllowedError" ? "Libere o microfone para o Aprova nas configurações do navegador." : e.message || "Não deu para abrir o microfone.");
    return;
  }
  let meeting;
  try { meeting = (await api("/api/admin/meet", { method: "POST", body: { clientId: NEW.clientId, lead: NEW.lead, title: NEW.title, link: NEW.link, source: "gravacao" } })).meeting; }
  catch (e) { R.streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); toast(e.message); return; }
  S.meetings.unshift(meeting);
  R.id = meeting.id;
  const AC = window.AudioContext || window.webkitAudioContext;
  R.ctx = new AC();
  await R.ctx.resume();
  R.rate = R.ctx.sampleRate;
  const mix = R.ctx.createGain();
  mix.channelCount = 1; mix.channelCountMode = "explicit"; mix.channelInterpretation = "speakers";
  R.streams.forEach((s) => R.ctx.createMediaStreamSource(s).connect(mix));
  const proc = R.ctx.createScriptProcessor(4096, 1, 1);
  const mute = R.ctx.createGain(); mute.gain.value = 0;
  mix.connect(proc); proc.connect(mute); mute.connect(R.ctx.destination);
  proc.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0);
    R.level = Math.min(1, rms(d) * 6);
    if (R.paused || R.stopping) return;
    R.chunks.push(new Float32Array(d));
    R.len += d.length;
    if (R.len >= R.rate * SEG) cut(R);
  };
  R.proc = proc;
  R.streams.forEach((s) => s.getTracks().forEach((t) => (t.onended = () => { if (S.rec === R && !R.stopping && t.kind === "audio" && s === R.streams[R.streams.length - 1]) { R.err = "O microfone foi desligado."; stopRec(); } })));
  R.t0 = performance.now();
  R.timer = setInterval(() => tick(R), 250);
  S.rec = R;
  wake(true);
  closeSheet();
  if (NEW.link && /^https:\/\/meet\.google\.com\//.test(NEW.link) && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) window.open(NEW.link, "_blank", "noopener");
  S.view = "rec"; render();
}
function tick(R) {
  const n = performance.now();
  if (!R.paused && !R.stopping) R.elapsed += (n - (R.lastTick || n)) / 1000;
  R.lastTick = n;
  const t = $("#recTime"); if (t) t.textContent = clock(R.elapsed);
  const l = $("#recLevel"); if (l) l.style.width = (R.paused ? 0 : Math.round(R.level * 100)) + "%";
}
function cut(R) {
  if (!R.len) return;
  const all = new Float32Array(R.len); let o = 0;
  R.chunks.forEach((c) => { all.set(c, o); o += c.length; });
  R.chunks = []; R.len = 0;
  const s = downsample(all, R.rate);
  if (s.length < RATE * 1.5) return;
  if (rms(s) < 0.0025) return; /* silêncio: não manda */
  R.queue.push({ seq: R.seq++, blob: wav(s), secs: s.length / RATE, t: R.elapsed });
  pump(R);
}
async function pump(R) {
  if (R.sending) return;
  R.sending = true;
  while (R.queue.length) {
    const p = R.queue[0];
    try {
      const r = await sendPart(R.id, p.seq, p.blob, p.secs, p.t);
      R.queue.shift(); R.sent++;
      if (r.pending) { R.pend = (R.pend || 0) + 1; R.live.push({ t: p.t - p.secs, text: "", pending: true }); }
      else if (r.text) R.live.push({ t: p.t - p.secs, text: r.text });
      if (S.view === "rec" && S.rec === R) render();
    } catch (e) { R.err = e.message; R.sending = false; if (S.view === "rec") render(); setTimeout(() => pump(R), 15000); return; }
  }
  R.sending = false;
  if (S.view === "rec" && S.rec === R) render();
}
async function stopRec() {
  const R = S.rec;
  if (!R || R.stopping) return;
  R.stopping = true;
  cut(R);
  R.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  try { R.proc.disconnect(); R.ctx.close(); } catch (e) {}
  render();
  while (R.queue.length || R.sending) { await sleep(500); if (!R.sending && R.queue.length) pump(R); }
  clearInterval(R.timer);
  wake(false);
  await finish(R.id);
  S.rec = null;
}
function recView() {
  const R = S.rec;
  if (!R) return listView();
  const m = S.meetings.find((x) => x.id === R.id);
  const c = client(m?.clientId);
  const wait = R.queue.length;
  return `<div class="mt-head"><div><p class="eyebrow">${esc(nameOf(m) || "Reunião")}</p><h1>${R.stopping ? "Montando o <em>resumo</em>" : "Gravando a <em>reunião</em>"}</h1></div></div>
  <section class="mt-rec" aria-live="polite">
    <p class="eyebrow"><span class="mt-dot ${R.paused || R.stopping ? "off" : ""}"></span>${R.stopping ? "Finalizando" : R.paused ? "Pausado" : "Gravando"}</p>
    <div class="mt-time" id="recTime">${clock(R.elapsed)}</div>
    <div class="mt-level" aria-hidden="true"><i id="recLevel"></i></div>
    <div class="acts">${R.stopping ? `<span class="q">Enviando o resto do áudio e lendo a conversa. Leva uns instantes.</span>` : `
      <button class="btn" data-act="pause">${R.paused ? "Retomar" : "Pausar"}</button>
      <button class="btn dark" data-act="stop">Encerrar e resumir</button>
      ${m?.link ? `<a class="btn" href="${esc(m.link)}" target="_blank" rel="noopener">Abrir o Meet</a>` : ""}`}</div>
    <span class="q">${R.sent} ${R.sent === 1 ? "parte transcrita" : "partes transcritas"}${wait ? ` · ${wait} na fila` : ""}</span>
  </section>
  ${R.err ? `<div class="mt-err">${esc(R.err)} O áudio fica guardado aqui e vai de novo sozinho.</div>` : ""}
  <div class="mt-note"><b>Deixe esta tela aberta e acesa.</b> Se o aparelho bloquear ou você trocar de app no celular, a gravação para. A cada ${SEG} segundos o trecho é transcrito e aparece abaixo.</div>
  <div class="mt-sec"><h2>Transcrição <em>ao vivo</em></h2>${R.live.length ? `<div class="mt-live">${R.live.slice().reverse().map((x) => `<p><small>${clock(x.t)}</small>${x.pending ? `<span style="color:var(--muted)">Áudio guardado. A cota grátis de hoje acabou, este trecho é transcrito sozinho a partir das 21h.</span>` : esc(x.text)}</p>`).join("")}</div>` : `<div class="emptybox" style="margin:0"><p>O primeiro trecho aparece em até ${SEG} segundos.</p></div>`}</div>`;
}
let LOCK = null;
async function wake(on) {
  try {
    if (on && navigator.wakeLock) LOCK = await navigator.wakeLock.request("screen");
    if (!on && LOCK) { await LOCK.release(); LOCK = null; }
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.rec && !S.rec.stopping) wake(true); });
window.addEventListener("beforeunload", (e) => { if (S.rec || S.up) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- arquivo ---------- */
async function startUpload() {
  readNew();
  const f = NEW.file;
  if (!f) { toast("Escolha o arquivo da reunião."); return; }
  if (f.size > 900 * 1024 * 1024) { toast("Arquivo grande demais. Envie só o áudio (m4a ou mp3)."); return; }
  closeSheet();
  S.up = { name: f.name, step: "Lendo o arquivo", done: 0, total: 0, err: "" };
  S.view = "up"; render();
  let samples;
  try {
    const arr = await f.arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, RATE, RATE);
    const ab = await new Promise((ok, no) => { const p = off.decodeAudioData(arr, ok, no); if (p && p.then) p.then(ok, no); });
    if (ab.numberOfChannels === 1) samples = ab.getChannelData(0);
    else { samples = new Float32Array(ab.length); for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < d.length; i++) samples[i] += d[i] / ab.numberOfChannels; } }
    if (ab.sampleRate !== RATE) samples = downsample(samples, ab.sampleRate);
  } catch (e) {
    S.up.err = "Não deu para ler este arquivo neste navegador. Tente exportar como m4a ou mp3."; render(); return;
  }
  let meeting;
  try { meeting = (await api("/api/admin/meet", { method: "POST", body: { clientId: NEW.clientId, lead: NEW.lead, title: NEW.title, link: NEW.link, source: "arquivo" } })).meeting; S.meetings.unshift(meeting); }
  catch (e) { S.up.err = e.message; render(); return; }
  const parts = [];
  for (let i = 0, seq = 0; i < samples.length; i += RATE * SEG) {
    const s = samples.subarray(i, Math.min(samples.length, i + RATE * SEG));
    if (s.length < RATE * 1.5 || rms(s) < 0.0025) continue;
    parts.push({ seq: seq++, start: i, end: i + s.length });
  }
  S.up.total = parts.length; S.up.step = "Transcrevendo"; render();
  const total = samples.length / RATE;
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const p = parts[next++];
      await sendPart(meeting.id, p.seq, wav(samples.subarray(p.start, p.end)), (p.end - p.start) / RATE, p.end / RATE === total ? total : p.end / RATE);
      S.up.done++; if (S.view === "up") render();
    }
  };
  try { await Promise.all([worker(), worker(), worker()]); }
  catch (e) { S.up.err = e.message + " Abra a reunião e use Refazer resumo com o que já foi transcrito."; render(); return; }
  try { await api(`/api/admin/meet/${meeting.id}`, { method: "PUT", body: {} }); } catch (e) {}
  S.up.step = "Montando o resumo"; render();
  S.up = null;
  await finish(meeting.id, total);
}
function upView() {
  const U = S.up;
  if (!U) return listView();
  const pct = U.total ? Math.round((U.done / U.total) * 100) : 4;
  return `<div class="mt-head"><div><p class="eyebrow">${esc(U.name)}</p><h1>${esc(U.step)}</h1></div></div>
  <div class="mt-box"><div class="mt-prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
  <p style="margin:0;color:var(--muted)">${U.total ? `${U.done} de ${U.total} partes transcritas` : "Preparando o áudio"}</p></div>
  ${U.err ? `<div class="mt-err">${esc(U.err)}</div><p><button class="btn" data-act="home">Voltar para as reuniões</button></p>` : `<div class="mt-note"><b>Deixe esta tela aberta</b> até terminar.</div>`}`;
}

/* ---------- resumo ---------- */
async function finish(id, seconds) {
  try {
    const r = await api(`/api/admin/meet/${id}/finish`, { method: "POST" });
    if (r.quota) S.quota = r.quota;
    replace(r.meeting);
    await openMeet(id, "check");
  } catch (e) { toast(e.message); S.view = "list"; render(); }
}
function replace(m) { const i = S.meetings.findIndex((x) => x.id === m.id); if (i >= 0) S.meetings[i] = m; else S.meetings.unshift(m); if (S.cur?.id === m.id) S.cur = m; }
async function openMeet(id, tab) {
  try {
    const r = await api(`/api/admin/meet/${id}`);
    S.cur = r.meeting; S.transcript = r.transcript; replace(r.meeting);
    S.view = "meet"; S.tab = tab || (S.cur.status === "gravando" || S.cur.status === "fila" ? "trans" : "check"); S.armed = null;
    render(); scrollTo(0, 0);
  } catch (e) { toast(e.message); }
}
let saveT = null;
function saveSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const m = S.cur; if (!m) return;
    try { const r = await api(`/api/admin/meet/${m.id}`, { method: "PUT", body: { title: m.title, clientId: m.clientId, lead: m.lead || "", summary: m.summary } }); replace({ ...r.meeting }); } catch (e) { toast(e.message); }
  }, 600);
}
const sm = () => (S.cur.summary ||= { resumo: "", pontos: [], decisoes: [], tarefas: [], proxima: "" });

function meetView() {
  const m = S.cur, c = client(m.clientId), s = m.summary;
  const opts = `<option value="" ${c ? "" : "selected"}>Lead (não é cliente)</option>` + S.clients.map((x) => `<option value="${x.id}" ${m.clientId === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  const tab = (k, l) => `<button class="mt-tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-k="${k}">${l}</button>`;
  let html = `<div><button class="mt-back" data-act="home">← Todas as reuniões</button></div>
  <div class="mt-head"><div style="min-width:0;flex:1 1 360px"><p class="eyebrow">${dt(m.createdAt)} às ${hm(m.createdAt)} · ${dur(m.seconds)}</p>
    <input type="text" id="mTitle" value="${esc(m.title)}" placeholder="Reunião sem título" aria-label="Assunto da reunião" style="font-family:var(--f-display);font-size:clamp(28px,5vw,46px);font-weight:700;letter-spacing:-.02em;border:0;padding:4px 0;background:transparent;box-shadow:none">
    <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap">${c ? av(c, "lg") : leadAv("lg")}<select id="mClient" style="width:auto;border-radius:999px" aria-label="Cliente">${opts}</select>${c ? "" : `<input type="text" id="mLead" value="${esc(m.lead || "")}" placeholder="Nome do lead" maxlength="80" aria-label="Nome do lead" style="width:220px;border-radius:999px">`}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="redo">Refazer resumo</button><button class="btn danger ${S.armed === "del" ? "armed" : ""}" data-act="del">${S.armed === "del" ? "Confirmar exclusão" : "Apagar"}</button></div></div>
  ${m.status === "gravando" ? `<div class="mt-err">Esta gravação foi interrompida antes de terminar. O que foi captado está na transcrição. Use <b>Refazer resumo</b> para gerar o checklist com ele.</div>` : ""}
  ${m.status === "fila" ? `<div class="mt-err" style="background:#fffbd6;border-color:#f1e27a">A cota grátis de IA de hoje acabou. O áudio está guardado e o Aprova termina a transcrição e o checklist sozinho a partir das 21h (horário de Brasília). Nada é cobrado.</div>` : ""}
  ${m.error ? `<div class="mt-err">${esc(m.error)}</div>` : ""}
  <div class="mt-tabs" role="tablist">${tab("check", "Checklist")}${tab("sum", "Resumo")}${tab("trans", "Transcrição")}</div>`;
  if (S.tab === "sum") html += sumView(s);
  else if (S.tab === "trans") html += `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="copy-trans">Copiar transcrição</button></div><div class="mt-trans">${esc(S.transcript || "Nada transcrito ainda.")}</div>`;
  else html += checkView(m);
  return html;
}
function sumView(s) {
  if (!s || (!s.resumo && !s.pontos?.length)) return `<div class="emptybox"><p>Sem resumo ainda.</p><button class="btn pri" data-act="redo">Gerar resumo</button></div>`;
  const ul = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<div class="mt-cols" style="grid-template-columns:minmax(0,1fr)"><div class="mt-sec"><h2>O que foi <em>tratado</em></h2>
    <textarea id="sResumo" rows="5" aria-label="Resumo">${esc(s.resumo)}</textarea></div>
    ${s.pontos?.length ? `<div class="mt-sec"><h2>Assuntos</h2>${ul(s.pontos)}</div>` : ""}
    ${s.decisoes?.length ? `<div class="mt-sec"><h2>Decisões</h2>${ul(s.decisoes)}</div>` : ""}
    <div class="mt-sec"><h2>Próxima <em>reunião</em></h2><input type="text" id="sProx" value="${esc(s.proxima)}" placeholder="Ex.: quinta, 14h"></div>
    <div><button class="btn sm" data-act="copy-sum">Copiar resumo</button></div></div>`;
}
function taskRow(t) {
  return `<div class="mt-task ${t.feito ? "done" : ""}" data-id="${t.id}">
    <button class="ck" data-act="tdone" data-id="${t.id}" aria-label="${t.feito ? "Desmarcar" : "Marcar como feita"}" aria-pressed="${t.feito}">${CHECK}</button>
    <textarea class="tx" rows="1" data-f="texto" data-id="${t.id}" aria-label="Tarefa">${esc(t.texto)}</textarea>
    <button class="mt-ib" data-act="tdel" data-id="${t.id}" aria-label="Remover tarefa">${TRASH}</button>
    <div class="sub"><select data-f="quem" data-id="${t.id}" aria-label="Responsável">${["ALL TORAL", "Cliente", "Ambos"].map((q) => `<option ${t.quem === q ? "selected" : ""}>${q}</option>`).join("")}</select>
    <input type="text" data-f="prazo" data-id="${t.id}" value="${esc(t.prazo)}" placeholder="Prazo" aria-label="Prazo"></div></div>`;
}
function checkView(m) {
  const ts = sm().tarefas;
  const g = (q, label) => { const list = ts.filter((t) => t.quem === q); return list.length ? `<p class="mt-glabel">${label}</p>${list.map(taskRow).join("")}` : ""; };
  const cname = nameOf(m) || (isLead(m) ? "o lead" : "Cliente");
  return `<div class="mt-cols"><div class="mt-sec"><h2>Tarefas <em>combinadas</em></h2><p style="color:var(--muted);font-size:14px">Ajuste o texto, quem faz e o prazo. Tudo salva sozinho e aparece no checklist ao lado.</p>
    <div class="mt-tasks">${ts.length ? g("ALL TORAL", "Com a ALL TORAL") + g("Cliente", "Com " + esc(cname)) + g("Ambos", "Juntos") : `<div class="emptybox" style="margin:0"><p>Nenhuma tarefa encontrada nesta reunião.</p></div>`}</div>
    <div><button class="btn sm" data-act="tadd">+ Adicionar tarefa</button></div></div>
    <aside class="mt-prev"><div class="frame" id="ckPrev">${cardHTML(m, 0.4)}</div>
    <div class="acts"><button class="btn pri" data-act="png">Baixar PNG</button>${navigator.canShare ? `<button class="btn" data-act="share">Enviar</button>` : ""}<button class="btn" data-act="copy-check">Copiar texto</button></div>
    <p style="color:var(--muted);font-size:12.5px;margin:0">No celular, Enviar abre o WhatsApp direto com a imagem.</p></aside></div>`;
}

/* ---------- peça do checklist ---------- */
function cardHTML(m, scale) {
  const s = m.summary || {}, ts = s.tarefas || [];
  const cname = nameOf(m);
  const lead = isLead(m);
  const item = (t) => `<div class="ck-i ${t.feito ? "done" : ""}"><div class="b">${t.feito ? CHECK : ""}</div><div><div class="t">${esc(t.texto)}</div>${t.prazo ? `<span class="p">${esc(t.prazo)}</span>` : ""}</div></div>`;
  const grp = (q, l, cls) => { const list = ts.filter((t) => t.quem === q); return list.length ? `<div class="ck-g ${cls}"><h2>${esc(l)}</h2>${list.map(item).join("")}</div>` : ""; };
  const d = new Date(m.createdAt);
  const inner = `<div class="ck-card ${lead ? "dark" : ""}"><div class="ck-top">${S.logoSvg}<div class="r"><small>Checklist</small><b>${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}</b></div></div>
    <div class="ck-body"><div class="ck-h"><small>${esc(cname || (lead ? "Lead" : "Reunião"))}</small><h1>Próximos <em>passos</em></h1>${m.title ? `<p>${esc(m.title)}</p>` : ""}</div>
    ${grp("ALL TORAL", "Com a ALL TORAL", "") || ""}${grp("Cliente", cname ? "Com " + cname : "Com você", "cli")}${grp("Ambos", "Juntos", "")}
    ${!ts.length ? `<p style="font-size:26px;color:#6c6270">Nenhuma tarefa por enquanto.</p>` : ""}
    ${s.proxima ? `<div class="ck-next"><b>Próxima reunião:</b> ${esc(s.proxima)}</div>` : ""}</div>
    <div class="ck-foot"><span>ALL TORAL · Estúdio criativo</span><span>@all.toral</span></div></div>`;
  if (!scale) return inner;
  return `<div style="width:${1080 * scale}px;max-width:100%;overflow:hidden"><div style="transform:scale(${scale});transform-origin:0 0;width:1080px">${inner}</div></div>`;
}
function fitPreview() {
  const f = $("#ckPrev"); if (!f) return;
  const w = f.clientWidth || 400, sc = w / 1080;
  const box = f.firstElementChild, in1 = box?.firstElementChild;
  if (!in1) return;
  in1.style.transform = `scale(${sc})`;
  box.style.width = w + "px";
  box.style.height = in1.firstElementChild.offsetHeight * sc + "px";
}
let h2c = null;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  return (h2c ||= new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/vendor/html2canvas.min.js"; s.onload = () => ok(window.html2canvas); s.onerror = () => { h2c = null; no(new Error("Não carregou o gerador de imagem.")); }; document.head.appendChild(s); }));
}
async function renderPNG() {
  const h = await loadH2C();
  await document.fonts?.ready;
  const box = $("#shot");
  box.innerHTML = cardHTML(S.cur, 0);
  const canvas = await h(box.firstElementChild, { scale: 1, backgroundColor: "#ffffff", useCORS: true, logging: false });
  box.innerHTML = "";
  return await new Promise((ok) => canvas.toBlob(ok, "image/png"));
}
function fileName() {
  const m = S.cur;
  const d = new Date(m.createdAt);
  return `checklist-${(nameOf(m) || "reuniao").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${two(d.getDate())}-${two(d.getMonth() + 1)}.png`;
}
function checkText() {
  const m = S.cur, s = m.summary || {}, ts = s.tarefas || [], cname = nameOf(m) || "você";
  const d = new Date(m.createdAt);
  const g = (q, l) => { const list = ts.filter((t) => t.quem === q); return list.length ? `\n*${l}*\n` + list.map((t) => `${t.feito ? "✅" : "▢"} ${t.texto}${t.prazo ? ` (${t.prazo})` : ""}`).join("\n") + "\n" : ""; };
  return `*Checklist da reunião ${two(d.getDate())}/${two(d.getMonth() + 1)}*${m.title ? `\n${m.title}` : ""}\n${g("ALL TORAL", "Com a ALL TORAL")}${g("Cliente", "Com " + cname)}${g("Ambos", "Juntos")}${s.proxima ? `\n*Próxima reunião:* ${s.proxima}` : ""}`.trim();
}
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg || "Copiado"); } catch (e) { toast("Não deu para copiar neste navegador."); } }

/* ---------- eventos ---------- */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) { if (ev.target.id === "sheet") closeSheet(); return; }
  const act = el.dataset.act, id = el.dataset.id;
  if (act !== "del") S.armed = null;
  switch (act) {
    case "reload": load(); break;
    case "filter": S.filter = id; store.set("mt_filter", id || null); render(); break;
    case "new": if (S.rec) { S.view = "rec"; render(); toast("Já tem uma gravação em andamento."); break; } openNew(); break;
    case "close": closeSheet(); break;
    case "mode": readNew(); NEW.mode = el.dataset.k; renderNew(); break;
    case "open": if (S.rec?.id === id) { S.view = "rec"; render(); } else openMeet(id); break;
    case "home": S.view = S.rec ? "rec" : "list"; S.cur = null; if (!S.rec) S.up = null; render(); break;
    case "pause": if (S.rec) { S.rec.paused = !S.rec.paused; if (!S.rec.paused) cut(S.rec); render(); } break;
    case "stop": stopRec(); break;
    case "tab": S.tab = el.dataset.k; render(); fitPreview(); break;
    case "tdone": { const t = sm().tarefas.find((x) => x.id === id); if (t) { t.feito = !t.feito; saveSoon(); render(); fitPreview(); } break; }
    case "tdel": sm().tarefas = sm().tarefas.filter((x) => x.id !== id); saveSoon(); render(); fitPreview(); break;
    case "tadd": { const nid = "t" + Date.now().toString(36); sm().tarefas.push({ id: nid, texto: "Nova tarefa", quem: "ALL TORAL", prazo: "", feito: false }); saveSoon(); render(); fitPreview(); const n = document.querySelector(`.tx[data-id="${nid}"]`); n?.focus(); n?.select(); break; }
    case "redo": {
      el.disabled = true; el.textContent = "Lendo a reunião…";
      try { const r = await api(`/api/admin/meet/${S.cur.id}/finish`, { method: "POST" }); if (r.quota) S.quota = r.quota; replace(r.meeting); S.cur = r.meeting; toast(r.meeting.status === "fila" ? "Cota grátis de hoje usada. Fica pronto a partir das 21h." : "Resumo refeito"); } catch (e) { toast(e.message); }
      render(); fitPreview(); break;
    }
    case "del":
      if (S.armed !== "del") { S.armed = "del"; render(); setTimeout(() => { if (S.armed === "del") { S.armed = null; if (S.view === "meet") render(); } }, 4000); break; }
      try { await api(`/api/admin/meet/${S.cur.id}`, { method: "DELETE" }); S.meetings = S.meetings.filter((x) => x.id !== S.cur.id); S.cur = null; S.view = "list"; S.armed = null; render(); toast("Reunião apagada"); } catch (e) { toast(e.message); }
      break;
    case "png": try { el.disabled = true; const b = await renderPNG(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { toast(e.message || "Não deu para gerar a imagem."); } el.disabled = false; break;
    case "share": try {
      el.disabled = true; const b = await renderPNG(); const f = new File([b], fileName(), { type: "image/png" });
      if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: checkText() }); else toast("Este aparelho não envia imagem direto. Use Baixar PNG.");
    } catch (e) { if (e.name !== "AbortError") toast(e.message || "Não deu para enviar."); } el.disabled = false; break;
    case "copy-check": copy(checkText(), "Checklist copiado para colar no WhatsApp"); break;
    case "copy-trans": copy(S.transcript, "Transcrição copiada"); break;
    case "copy-sum": { const s = S.cur.summary || {}; copy([S.cur.title, s.resumo, s.decisoes?.length ? "Decisões:\n" + s.decisoes.map((x) => "• " + x).join("\n") : "", s.proxima ? "Próxima reunião: " + s.proxima : ""].filter(Boolean).join("\n\n"), "Resumo copiado"); break; }
  }
});
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (ev.target.id === "login") {
    const p = $("#pw").value; S.pass = p;
    try { await api("/api/admin/login", { method: "POST" }); store.set("aprov_admin", p); S.loginErr = ""; load(); }
    catch (e) { S.pass = null; S.loginErr = e.message; render(); }
  }
  if (ev.target.id === "newForm") { readNew(); NEW.mode === "rec" ? startRec() : startUpload(); }
});
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (!S.cur) return;
  if (t.id === "mTitle") { S.cur.title = t.value; saveSoon(); return; }
  if (t.id === "mLead") { S.cur.lead = t.value; saveSoon(); refreshPrev(); return; }
  if (t.id === "sResumo") { sm().resumo = t.value; saveSoon(); return; }
  if (t.id === "sProx") { sm().proxima = t.value; saveSoon(); refreshPrev(); return; }
  if (t.dataset.f && t.dataset.id) {
    const task = sm().tarefas.find((x) => x.id === t.dataset.id); if (!task) return;
    task[t.dataset.f] = t.value;
    if (t.classList.contains("tx")) grow(t);
    saveSoon(); refreshPrev();
  }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "nClient") { readNew(); renderNew(); return; }
  if (t.id === "mClient" && S.cur) { S.cur.clientId = t.value; saveSoon(); render(); fitPreview(); }
  if (t.dataset.f === "quem" && S.cur) { render(); fitPreview(); }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
function grow(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
let prevT = null;
function refreshPrev() { clearTimeout(prevT); prevT = setTimeout(() => { const f = $("#ckPrev"); if (f && S.cur) { f.innerHTML = cardHTML(S.cur, 0.4); fitPreview(); } }, 250); }
window.addEventListener("resize", fitPreview);
new MutationObserver(() => { document.querySelectorAll(".mt-task .tx").forEach(grow); fitPreview(); }).observe($("#main"), { childList: true });

async function load() {
  S.ready = false; S.loadErr = ""; render();
  try {
    const [r, logo] = await Promise.all([api("/api/admin/meet"), fetch("/logo.svg").then((x) => x.text()).catch(() => "")]);
    S.meetings = r.meetings; S.clients = r.clients; S.quota = r.quota || null;
    S.logoSvg = logo.replace(/<\?xml[\s\S]*?\?>/, "").replace(/<!DOCTYPE[\s\S]*?>/, "").replace(/viewBox="[^"]*"/, 'viewBox="364 156 1272 1690"').replace(/width="100%" height="100%"/, "");
    S.ready = true;
    if (S.filter && S.filter !== "lead" && !S.clients.some((c) => c.id === S.filter)) S.filter = "";
    const q = new URLSearchParams(location.search).get("r");
    if (q && S.meetings.some((m) => m.id === q)) return openMeet(q);
    render();
  } catch (e) { S.loadErr = e.message; render(); }
}
render();
if (S.pass) load();
