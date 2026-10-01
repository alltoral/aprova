/* Planejamento, avisos e adesivos novos do Larot · Aprova All Toral */

const LK = n => `/stickers/larot/${n}.webp`;
const lk = (n, alt = "", cls = "") => `<img class="lk ${cls}" src="${LK(n)}" alt="${esc(alt)}" draggable="false">`;
const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const PERIODS = {
  semanal:   { tag: "Semanal",   noun: "semana",   da: "da semana",   done: "Semana aprovada!", days: 7 },
  quinzenal: { tag: "Quinzenal", noun: "quinzena", da: "da quinzena", done: "Quinzena aprovada!", days: 15 },
  mensal:    { tag: "Mensal",    noun: "mês",      da: "do mês",      done: "Mês aprovado!", days: 0 }
};
const IFMT = ["Post", "Carrossel", "Reels", "Stories", "Anúncio"];
const FMT_CLS = { Post: "f-post", Carrossel: "f-car", Reels: "f-reels", Stories: "f-sto", "Anúncio": "f-ads" };
const IDEA_ST = {
  pendente:  { label: "Aguardando você", cls: "wait" },
  aprovado:  { label: "Ideia aprovada", cls: "ok" },
  alteracao: { label: "Ajuste pedido", cls: "adj" },
  reprovado: { label: "Repensar", cls: "bad" },
  ajustado:  { label: "Ajuste feito", cls: "fix" }
};
const ideaSt = i => i.review?.status || "pendente";
const isOpenIdea = i => ["pendente", "ajustado"].includes(ideaSt(i));
const planOpen = p => (p.ideas || []).filter(isOpenIdea).length;
/* como o cliente é chamado nos avisos: o apelido do cadastro, ou o nome */
const firstName = c => String(c?.nickname || c?.name || "").replace(/^exemplo\s*·\s*/i, "").trim();
const pad2 = n => String(n).padStart(2, "0");
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toDay = s => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + "T12:00"); return isNaN(d) ? null : d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = (ms) => matchMedia("(prefers-reduced-motion: reduce)").matches ? sleep(Math.min(ms, 150)) : sleep(ms);

function fmtRange(a, b) {
  const x = toDay(a), y = toDay(b);
  if (!x) return "";
  if (!y || dayKey(x) === dayKey(y)) return `${pad2(x.getDate())} de ${MONTHS[x.getMonth()]}`;
  if (x.getMonth() === y.getMonth()) return `${pad2(x.getDate())} a ${pad2(y.getDate())} de ${MONTHS[x.getMonth()]}`;
  return `${pad2(x.getDate())} de ${MONTHS[x.getMonth()].slice(0, 3)} a ${pad2(y.getDate())} de ${MONTHS[y.getMonth()].slice(0, 3)}`;
}
function fmtDeadline(s) {
  if (!s) return "";
  const d = new Date(s); if (isNaN(d)) return s;
  const today = new Date(); const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((d0 - t0) / 864e5);
  const hh = s.length > 10 ? ` · ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "";
  if (diff === 0) return "hoje" + hh;
  if (diff === 1) return "amanhã" + hh;
  if (diff === -1) return "ontem" + hh;
  return `${DOW[d.getDay()]}, ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}${hh}`;
}
function dueInfo(plan) {
  if (!plan?.deadline || !planOpen(plan)) return null;
  const left = Date.parse(plan.deadline) - Date.now();
  if (isNaN(left) || left > 48 * 36e5) return null;
  return { late: left < 0, label: left < 0 ? "Prazo vencido" : "Prazo " + fmtDeadline(plan.deadline).split(" · ")[0] };
}
function periodEnd(period, start) {
  const s = toDay(start); if (!s) return "";
  if (period === "mensal") return dayKey(s.getDate() === 1 ? new Date(s.getFullYear(), s.getMonth() + 1, 0) : addDays(s, 29));
  return dayKey(addDays(s, (PERIODS[period]?.days || 7) - 1));
}
function nextStart(period) {
  const t = new Date();
  if (period === "mensal") return dayKey(new Date(t.getFullYear(), t.getMonth() + 1, 1));
  const d = addDays(t, ((8 - t.getDay()) % 7) || 7); /* próxima segunda */
  return dayKey(d);
}
function planTitle(p) { const P = PERIODS[p.period] || PERIODS.semanal; return `${P.tag} · ${fmtRange(p.start, p.end)}`; }

/* ======================= CLIENTE ======================= */
function visiblePlans() { return (S.plans || []).filter(p => p.visible !== false); }
function activePlan() {
  return visiblePlans().filter(p => planOpen(p) > 0).sort((a, b) => String(b.sentAt || "").localeCompare(String(a.sentAt || "")))[0] || null;
}
function newArts() {
  const prev = S.visits?.prev; if (!prev) return [];
  return visiblePosts().filter(p => !p.published && ["pendente", "ajustado"].includes(statusOf(p.id)) && p.sentAt && p.sentAt > prev);
}
function clientNotifs() {
  const out = [];
  visiblePlans().forEach(p => {
    const n = planOpen(p); if (!n) return;
    const P = PERIODS[p.period] || PERIODS.semanal; const due = dueInfo(p);
    out.push({ icon: due ? "bora-aprovar" : "planejamento-conteudo", act: "plan-open", id: p.id,
      title: !p.seenAt ? `Chegou o planejamento ${P.da}!` : due ? `${due.label}: faltam ${n} ${n === 1 ? "ideia" : "ideias"}` : `Planejamento ${P.da} esperando você`,
      text: `${fmtRange(p.start, p.end)} · ${n} ${n === 1 ? "ideia" : "ideias"} para aprovar` });
    (p.ideas || []).filter(i => ideaSt(i) === "ajustado").forEach(i => out.push({ icon: "ajuste-feito", act: "plan-idea", id: p.id, idea: i.id, title: "Ajuste feito na ideia", text: i.title }));
  });
  const arts = newArts();
  if (arts.length) out.push({ icon: "arte-nova", act: "goto-new", title: arts.length === 1 ? "Chegou arte nova" : `Chegaram ${arts.length} artes novas`, text: "Toque para ver e aprovar" });
  visiblePosts().filter(p => !p.published && statusOf(p.id) === "ajustado" && !arts.includes(p)).forEach(p => out.push({ icon: "ajuste-feito", act: "nf-open", id: p.id, title: "Ajuste feito", text: p.title }));
  return out;
}
function bellBtn() {
  const n = clientNotifs().length;
  return `<button class="bell" data-act="notifs" aria-label="Avisos${n ? `: ${n} novos` : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${n ? `<span class="bell-n">${n}</span>` : ""}</button>`;
}

/* bloco do topo: lembrete de prazo ou aviso amarelo do planejamento */
function clientTop(c) {
  const p = activePlan(); let html = "";
  if (p) {
    const P = PERIODS[p.period] || PERIODS.semanal; const n = planOpen(p); const due = dueInfo(p);
    if (due) {
      html += `<div class="plan-due"><div class="pd-t"><span class="eb-y">${esc(due.label)}</span><b>Faltam ${n} ${n === 1 ? "ideia" : "ideias"} ${P.da}</b><span>Leva uns minutinhos. A arte só começa depois do seu ok.</span><button class="btn yel" data-act="plan-open" data-id="${p.id}">Continuar aprovando</button></div>${lk("bora-aprovar", "Bora aprovar?", "pd-stk")}</div>`;
    } else {
      const total = (p.ideas || []).length;
      html += `<div class="plan-notice"><div class="pn-t"><span class="pn-tag">${p.seenAt ? "Planejamento" : "Novo · Planejamento"}</span>
        <h2>Seu planejamento ${P.da} ${p.seenAt ? "está esperando você." : "chegou."}</h2>
        <p>${total} ${total === 1 ? "ideia" : "ideias"} com legenda pra você aprovar antes da gente criar as artes.${n < total ? ` Faltam ${n}.` : ""}</p>
        <div class="pn-meta"><span>${esc(fmtRange(p.start, p.end))}</span><span>${total} ${total === 1 ? "ideia" : "ideias"}</span>${p.deadline ? `<span>Prazo: ${esc(fmtDeadline(p.deadline))}</span>` : ""}</div>
        <button class="btn dark2" data-act="plan-open" data-id="${p.id}">Aprovar planejamento →</button></div>${lk("planejamento-conteudo", "Planejamento de conteúdo", "pn-stk")}</div>`;
    }
  }
  return html;
}
/* depois do pedir conteúdo: tudo em dia, artes novas e o mês em números */
function clientExtras(c) {
  let html = "";
  const pend = visiblePosts().filter(p => !p.published && ["pendente", "ajustado"].includes(statusOf(p.id))).length;
  const open = visiblePlans().reduce((t, p) => t + planOpen(p), 0);
  const arts = newArts();
  if (arts.length) {
    html += `<section class="new-arts" id="artes-novas"><div class="na-h"><div><span class="eyebrow">${arts.length} ${arts.length === 1 ? "arte esperando" : "artes esperando"} você</span><h2 class="display">Artes <em>novas</em></h2></div>${lk("arte-nova", "Chegou arte nova", "na-stk")}</div><div class="grid">${arts.map(postCard).join("")}</div></section>`;
  } else if (!pend && !open && (visiblePosts().length || visiblePlans().length)) {
    html += `<section class="all-done">${lk("tudo-pronto", "Tudo pronto", "ad-stk")}<h2 class="display">Tudo em <em>dia!</em></h2><p>Quando chegar conteúdo novo, ele aparece aqui.</p></section>`;
  }
  html += monthCard();
  return html;
}
function monthCard() {
  const pubs = visiblePosts().filter(p => p.published?.at);
  if (!pubs.length) return "";
  const now = new Date(); let y = now.getFullYear(), m = now.getMonth();
  const inMonth = (s, yy, mm) => { const d = new Date(s); return d.getFullYear() === yy && d.getMonth() === mm; };
  let list = pubs.filter(p => inMonth(p.published.at, y, m));
  if (!list.length) { m--; if (m < 0) { m = 11; y--; } list = pubs.filter(p => inMonth(p.published.at, y, m)); }
  if (!list.length) return "";
  const reels = list.filter(p => (p.media || []).some(isVideo)).length;
  const waits = list.map(p => { const h = (p.review?.history || []).find(x => x.kind === "review" && x.status === "aprovado"); const from = p.sentAt || p.createdAt; return h && from ? (Date.parse(h.at) - Date.parse(from)) : null; }).filter(x => x != null && x >= 0);
  let third = `<div class="ms ms-g"><b>${list.filter(p => statusOf(p.id) === "aprovado").length}</b><span>aprovados</span></div>`;
  if (waits.length) {
    const avg = waits.reduce((a, b) => a + b, 0) / waits.length; const hrs = avg / 36e5;
    third = `<div class="ms ms-g"><b>${hrs < 24 ? Math.max(1, Math.round(hrs)) + "h" : Math.round(hrs / 24) + (Math.round(hrs / 24) === 1 ? " dia" : " dias")}</b><span>pra aprovar</span></div>`;
  }
  return `<section class="month"><div class="mo-h"><div><span class="eyebrow">${MONTHS[m]}</span><h2>Seu mês com a ALL TORAL</h2></div>${lk("mes-em-numeros", "Seu mês em números", "mo-stk")}</div>
    <div class="mo-g"><div class="ms ms-p"><b>${list.length}</b><span>${list.length === 1 ? "publicado" : "publicados"}</span></div><div class="ms ms-y"><b>${reels}</b><span>Reels</span></div>${third}</div></section>`;
}

/* pop-ups ao abrir a página */
function afterClientLoad() {
  if (S.isOwner || S.popDone) return; S.popDone = true;
  if (S.wantPlan) { S.wantPlan = false; history.replaceState({}, "", "/c/" + S.token); const p = activePlan() || visiblePlans()[0]; if (p) { openPlanView(p.id); return; } }
  if (!S.visits?.welcomed) { S.editor = { kind: "welcome", sheetCls: "sheet-c" }; renderSheet(); return; }
  const p = activePlan();
  let dismissed = null; try { dismissed = sessionStorage.getItem("aprov_plan_pop"); } catch (e) {}
  if (p && !p.seenAt && dismissed !== p.id) { S.editor = { kind: "planpop", planId: p.id, sheetCls: "sheet-c" }; renderSheet(); }
}
function onPlanClose(e) {
  if (e.kind === "welcome" && !S.visits?.welcomed) { S.visits = { ...(S.visits || {}), welcomed: true }; api(`/api/c/${S.token}/welcomed`, { method: "POST" }).catch(() => {}); setTimeout(() => { if (!S.editor) { S.popDone = false; afterClientLoad(); } }, 350); }
  if (e.kind === "planpop") { try { sessionStorage.setItem("aprov_plan_pop", e.planId); } catch (x) {} }
  if (e.kind === "planview" && S.mode === "client") render();
}
function welcomeSheet() {
  const c = S.client || {};
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="wh">${lk("bem-vindo", "Bem-vindo ao Aprova", "m-stk")}
    <h2 id="wh">Oi${firstName(c) ? ", " + esc(firstName(c)) : ""}! Aqui você aprova <em>tudo</em>.</h2>
    <ol class="steps3"><li><span>1</span>Primeiro você aprova as ideias e legendas do planejamento.</li><li><span>2</span>Depois chegam as artes e vídeos prontos para o seu ok.</li><li><span>3</span>Precisa de algo? Peça conteúdo por aqui mesmo.</li></ol>
    <button class="btn dark2 wide" data-act="close">Bora começar</button></div>`;
}
function planPopSheet() {
  const p = (S.plans || []).find(x => x.id === S.editor.planId); if (!p) return "";
  const n = (p.ideas || []).length;
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pph">${lk("conteudo-estrategico", "Conteúdo estratégico", "m-stk")}
    <h2 id="pph">Psiu${firstName(S.client) ? ", " + esc(firstName(S.client)) : ""}! Seu <em>planejamento</em> chegou.</h2>
    <p>${n} ${n === 1 ? "ideia" : "ideias"} com legenda ${esc((PERIODS[p.period] || PERIODS.semanal).da)} (${esc(fmtRange(p.start, p.end))}). Aprove antes da gente criar as artes.${p.deadline ? ` Prazo: ${esc(fmtDeadline(p.deadline))}.` : ""}</p>
    <button class="btn dark2 wide" data-act="plan-open" data-id="${p.id}">Ver planejamento</button><button class="btn ghost wide" data-act="close">Agora não</button></div>`;
}
function briefSentSheet() {
  const r = S.editor.req || {};
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="bsh">${lk("briefing-enviado", "Briefing enviado", "m-stk big")}
    <h2 id="bsh">Recebemos o seu <em>pedido!</em></h2><p>O estúdio já foi avisado. Você acompanha o andamento por aqui, em “Pedir conteúdo”.</p>
    <div class="bs-box"><span class="eyebrow">Seu pedido</span><b>${esc(r.tema || (r.mensagem || "").slice(0, 60) || "Pedido de conteúdo")}</b><small>${esc([r.tipo, r.rede, r.prazo ? "para " + fmtShortDay(r.prazo) : ""].filter(Boolean).join(" · "))}</small></div>
    <button class="btn dark2 wide" data-act="close">Voltar para a página</button></div>`;
}
function showBriefSent(req) { S.editor = { kind: "briefsent", req, sheetCls: "sheet-c" }; renderSheet(); }
function notifsSheet() {
  const list = clientNotifs();
  return `<div class="modal notifs" role="dialog" aria-modal="true" aria-labelledby="nh"><div class="nf-h"><h2 id="nh">Avisos</h2><button class="x dark" data-act="close" aria-label="Fechar">✕</button></div>
    ${list.length ? `<div class="nf-list">${list.map(n => `<button class="nf" data-act="${n.act}" data-id="${esc(n.id || "")}" ${n.idea ? `data-idea="${esc(n.idea)}"` : ""}>${lk(n.icon, "", "nf-stk")}<span><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span><i aria-hidden="true">›</i></button>`).join("")}</div>`
      : `<div class="nf-empty">${lk("tudo-pronto", "Tudo pronto", "m-stk")}<p>Nada novo por aqui. Quando chegar algo, avisamos.</p></div>`}</div>`;
}

/* ---------- planejamento do cliente: carregando → calendário → uma ideia por vez → fim ---------- */
async function openPlanView(id, ideaId) {
  const p = (S.plans || []).find(x => x.id === id); if (!p) return;
  S.open = null;
  S.editor = { kind: "planview", planId: id, step: "loading", sheetCls: "sheet-plan" }; renderSheet();
  if (!S.isOwner && !p.seenAt) api(`/api/c/${S.token}/plan-seen`, { method: "POST", body: { planId: id } }).then(r => { const i = S.plans.findIndex(x => x.id === id); if (i >= 0 && r.plan) S.plans[i] = r.plan; }).catch(() => {});
  await wait(900);
  if (S.editor?.kind !== "planview" || S.editor.planId !== id) return;
  if (ideaId) { const k = (p.ideas || []).findIndex(i => i.id === ideaId); S.editor.idx = Math.max(0, k); S.editor.step = "card"; }
  else S.editor.step = "cal";
  S.editor.keepScroll = false; renderSheet();
}
const curPlan = () => (S.plans || []).find(x => x.id === S.editor?.planId);
function planViewSheet() {
  const e = S.editor, p = curPlan(); if (!p) return "";
  const P = PERIODS[p.period] || PERIODS.semanal;
  if (e.step === "loading") return `<div class="pv pv-load" role="dialog" aria-modal="true" aria-label="Abrindo o planejamento"><div class="ring">${lk("planejamento-andamento", "Planejamento em andamento", "ring-stk")}</div><h2>Abrindo a sua <em>${P.noun}</em>…</h2><p>Separando ${(p.ideas || []).length} ${(p.ideas || []).length === 1 ? "ideia" : "ideias"} no calendário</p><div class="dots3"><i></i><i></i><i></i></div></div>`;
  const head = (sub, title, right = "") => `<div class="pv-h"><button class="x dark" data-act="${e.step === "card" ? "plan-cal" : "close"}" aria-label="${e.step === "card" ? "Voltar ao calendário" : "Fechar"}">${e.step === "card" ? "‹" : "✕"}</button><div class="t"><small>${esc(sub)}</small><b>${title}</b></div>${right}</div>`;
  const decided = (p.ideas || []).length - planOpen(p);
  if (e.step === "cal") {
    const others = visiblePlans();
    return `<div class="pv" role="dialog" aria-modal="true" aria-labelledby="pvt">${head(S.client?.name || "", `<span id="pvt">Planejamento</span>`, `<span class="pv-count">${decided}/${(p.ideas || []).length}</span>`)}
      <div class="pv-body"><div class="ptags" role="tablist">${Object.entries(PERIODS).map(([k, v]) => { const pl = k === p.period ? p : others.filter(x => x.period === k)[0]; return `<button role="tab" aria-selected="${k === p.period}" ${pl ? `data-act="plan-switch" data-id="${pl.id}"` : "disabled"}>${v.tag}</button>`; }).join("")}</div>
      <span class="eyebrow">Pauta ${P.da}</span><h2 class="pv-title">${esc(fmtRange(p.start, p.end))}</h2>
      ${p.note ? `<div class="pv-note"><b>Recado do estúdio</b>${esc(p.note)}</div>` : ""}
      ${calendarHTML(p)}
      <div class="legend"><span><i class="dot" style="background:var(--pink)"></i>Post</span><span><i class="dot" style="background:#141014"></i>Reels</span><span><i class="dot" style="background:#e0c400"></i>Carrossel</span><span><i class="dot" style="background:#7a5af8"></i>Stories</span><span class="lg-ok">◯ aprovada</span></div>
      <div class="pv-list">${(p.ideas || []).map((i, k) => `<button class="pvl" data-act="plan-card" data-i="${k}"><span class="pvl-d"><small>${i.date ? DOW[new Date(i.date).getDay()] : ""}</small><b>${i.date ? pad2(new Date(i.date).getDate()) : "–"}</b></span><span class="fpill ${FMT_CLS[i.format] || "f-post"}">${esc(i.format)}</span><span class="pvl-t">${esc(i.title)}</span><span class="ist ${IDEA_ST[ideaSt(i)].cls}">${esc(IDEA_ST[ideaSt(i)].label)}</span></button>`).join("")}</div>
      </div><div class="pv-foot"><div><b>${decided} de ${(p.ideas || []).length} ${(p.ideas || []).length === 1 ? "ideia decidida" : "ideias decididas"}</b><small>${planOpen(p) ? `Faltam ${planOpen(p)} ${P.da}` : "Tudo decidido"}</small></div>${!S.isOwner ? `<button class="btn yel" data-act="plan-start">${planOpen(p) ? (decided ? "Continuar" : "Aprovar ideias") : "Rever ideias"}</button>` : ""}</div></div>`;
  }
  if (e.step === "done") {
    const cnt = st => (p.ideas || []).filter(i => ideaSt(i) === st).length;
    const ok = cnt("aprovado");
    return `<div class="pv" role="dialog" aria-modal="true" aria-labelledby="pvd">${head(`${P.noun} · ${fmtRange(p.start, p.end)}`, "Tudo decidido", `<span class="pv-count ok">${(p.ideas || []).length}/${(p.ideas || []).length}</span>`)}
      <div class="pv-body pv-done">${progressBar(p)}${lk("ta-no-plano", "Tá no plano!", "done-stk")}
      <h2 id="pvd">${ok === (p.ideas || []).length ? esc(P.done).replace(/ (\S+)$/, " <em>$1</em>") : "Tudo <em>decidido!</em>"}</h2>
      <p>${ok === (p.ideas || []).length ? "Agora o time começa a criar as artes e os vídeos. Elas chegam aqui pra você aprovar." : "O estúdio já recebeu seus ajustes. As ideias aprovadas já vão para a criação."}</p>
      <div class="done-n"><div class="ms ms-g"><b>${ok}</b><span>${ok === 1 ? "aprovada" : "aprovadas"}</span></div><div class="ms ms-y"><b>${cnt("alteracao")}</b><span>com ajuste</span></div><div class="ms"><b>${cnt("reprovado")}</b><span>repensar</span></div></div>
      <button class="btn dark2 wide" data-act="close">Voltar para a página</button><button class="link" data-act="plan-cal">Ver o calendário</button></div></div>`;
  }
  /* card: uma ideia por vez */
  const ideas = p.ideas || []; const i = ideas[Math.min(e.idx || 0, ideas.length - 1)]; if (!i) return "";
  const st = ideaSt(i); const k = ideas.indexOf(i);
  const hist = (i.review?.history || []).filter(h => h.note).slice(-3).reverse();
  return `<div class="pv" role="dialog" aria-modal="true" aria-labelledby="pvc">${head(`${P.noun} · ${fmtRange(p.start, p.end)}`, `Ideia ${k + 1} de ${ideas.length}`, `<span class="pv-count">${(p.ideas || []).length - planOpen(p)} ok</span>`)}
    <div class="pv-body">${progressBar(p, k)}
    <div class="deck"><div class="deck-b2"></div><div class="deck-b1"></div>
    <article class="icard ${e.fly ? "fly-" + e.fly : ""}" id="icard">
      ${st !== "pendente" ? `<div class="ic-stk">${st === "ajustado" ? lk("ajuste-feito", "Ajuste feito") : sticker(st)}</div>` : ""}
      <div class="ic-top"><span class="fpill ${FMT_CLS[i.format] || "f-post"}">${esc(i.format)}</span><span class="ic-date">${i.date ? esc(fmtDate(i.date)) : "Sem data"}</span></div>
      <h2 id="pvc">${esc(i.title)}</h2>
      ${i.idea ? `<div class="ic-b"><span class="eyebrow">A ideia</span><p>${esc(i.idea)}</p></div>` : ""}
      <div class="ic-b"><span class="eyebrow">Legenda</span><div class="ic-cap">${i.caption ? esc(i.caption) : `<span class="muted">Legenda ainda não escrita</span>`}${i.hashtags ? `<span class="tags">${esc(i.hashtags)}</span>` : ""}</div></div>
      ${st === "ajustado" ? `<p class="adj-note">O estúdio ajustou esta ideia. Confira e decida de novo.</p>` : ""}
      ${hist.length ? `<div class="ic-hist">${hist.map(h => `<div><b>${esc(h.byLabel || "Cliente")}</b> <small>${esc(fmtStamp(h.at))}</small><p>${esc(h.note)}</p></div>`).join("")}</div>` : ""}
    </article></div>
    <div class="ic-nav"><button class="btn sm ghost" data-act="plan-step" data-d="-1" ${k === 0 ? "disabled" : ""}>‹ Anterior</button><span>${S.isOwner ? "" : "Toque num adesivo para decidir"}</span><button class="btn sm ghost" data-act="plan-step" data-d="1" ${k === ideas.length - 1 ? "disabled" : ""}>Próxima ›</button></div>
    ${S.isOwner ? "" : e.ask ? askBox(e) : `<div class="dec">
      <button class="dec-b" data-act="idea-dec" data-s="reprovado" aria-pressed="${st === "reprovado"}" ${S.busy ? "disabled" : ""}>${sticker("reprovado")}<span>Repensar</span></button>
      <button class="dec-b" data-act="idea-dec" data-s="alteracao" aria-pressed="${st === "alteracao"}" ${S.busy ? "disabled" : ""}>${sticker("alteracao")}<span>Ajustar</span></button>
      <button class="dec-b big" data-act="idea-dec" data-s="aprovado" aria-pressed="${st === "aprovado"}" ${S.busy ? "disabled" : ""}>${sticker("aprovado")}<span>Aprovar</span></button></div>`}
    ${e.err ? `<p class="err" style="text-align:center">${esc(e.err)}</p>` : ""}
    </div></div>`;
}
function askBox(e) {
  const adj = e.ask === "alteracao";
  const chips = adj ? ["Legenda", "Tema", "Formato", "Data"] : [];
  return `<div class="askbox"><label class="field"><span>${adj ? "O que você quer ajustar?" : "Quer contar o que esperava? (opcional)"}</span>
    ${chips.length ? `<div class="ask-chips">${chips.map(c => `<button class="chip" data-act="ask-chip" data-k="${c}" aria-pressed="${(e.chips || []).includes(c)}">${c}</button>`).join("")}</div>` : ""}
    <textarea id="idea-note" rows="3" placeholder="${adj ? "Ex.: troca a banana por morango" : "Ex.: queria algo mais de bastidores"}">${esc(e.note || "")}</textarea></label>
    <label class="field"><span>Seu nome</span><input type="text" id="who" value="${esc(S.who)}" placeholder="Quem está decidindo" autocomplete="name"></label>
    <div class="actions"><button class="btn ghost" data-act="ask-cancel">Cancelar</button><button class="btn pri" data-act="ask-send" ${S.busy ? "disabled" : ""}>${adj ? "Enviar ajuste" : "Repensar a ideia"}</button></div></div>`;
}
function progressBar(p, cur) {
  return `<div class="pbar">${(p.ideas || []).map((i, k) => `<i class="${IDEA_ST[ideaSt(i)].cls}${k === cur ? " cur" : ""}"></i>`).join("")}</div>`;
}
function calendarHTML(p) {
  const s = toDay(p.start), en = toDay(p.end) || s; if (!s) return "";
  const byDay = {}; (p.ideas || []).forEach((i, k) => { if (!i.date) return; const d = i.date.slice(0, 10); (byDay[d] = byDay[d] || []).push([i, k]); });
  const col = { Post: "var(--pink)", Reels: "#141014", Carrossel: "#e0c400", Stories: "#7a5af8", "Anúncio": "#1f9d5c" };
  let html = ""; let y = s.getFullYear(), m = s.getMonth();
  const endM = en.getFullYear() * 12 + en.getMonth();
  for (let guard = 0; y * 12 + m <= endM && guard < 3; guard++) {
    const first = new Date(y, m, 1); const days = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let b = 0; b < first.getDay(); b++) cells += `<span class="cd empty"></span>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${pad2(m + 1)}-${pad2(d)}`; const inR = key >= dayKey(s) && key <= dayKey(en); const its = byDay[key] || [];
      const dots = its.slice(0, 3).map(([i]) => { const st = ideaSt(i); return `<i style="background:${col[i.format] || "var(--pink)"}" class="${st === "aprovado" ? "r-ok" : st === "alteracao" || st === "reprovado" ? "r-adj" : ""}"></i>`; }).join("");
      cells += its.length ? `<button class="cd ${inR ? "in" : ""} has" data-act="plan-card" data-i="${its[0][1]}" aria-label="Dia ${d}: ${its.map(([i]) => esc(i.title)).join(", ")}"><b>${d}</b><span class="cdots">${dots}</span></button>` : `<span class="cd ${inR ? "in" : ""}"><b>${d}</b></span>`;
    }
    html += `<div class="cal"><div class="cal-m">${MONTHS[m]} ${y !== new Date().getFullYear() ? y : ""}</div><div class="cal-w"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="cal-g">${cells}</div></div>`;
    m++; if (m > 11) { m = 0; y++; }
  }
  return html;
}
async function decideIdea(status, note) {
  const e = S.editor, p = curPlan(); if (!p || S.busy) return;
  const i = (p.ideas || [])[e.idx || 0]; if (!i) return;
  S.busy = true; e.err = "";
  const prev = JSON.parse(JSON.stringify(i.review || { status: "pendente", history: [] }));
  i.review = { ...prev, status, at: new Date().toISOString(), byLabel: S.who || "" };
  e.fly = status === "aprovado" ? "r" : status === "reprovado" ? "l" : "u"; e.ask = null; renderSheet();
  try {
    const r = await api(`/api/c/${S.token}/plan-review`, { method: "POST", body: { planId: p.id, ideaId: i.id, status, note: note || "", name: S.who } });
    const k = S.plans.findIndex(x => x.id === p.id); if (k >= 0) S.plans[k] = r.plan;
    await wait(380);
    const np = curPlan(); const ideas = np.ideas || [];
    const next = ideas.findIndex((x, j) => j > (e.idx || 0) && isOpenIdea(x));
    const any = ideas.findIndex(isOpenIdea);
    e.fly = null; e.note = ""; e.chips = [];
    if (next >= 0) e.idx = next; else if (any >= 0) e.idx = any; else { e.step = "done"; e.keepScroll = false; }
    toast(status === "aprovado" ? "Ideia aprovada" : status === "alteracao" ? "Ajuste enviado para o estúdio" : "Pedido para repensar enviado");
  } catch (err) { i.review = prev; e.fly = null; e.err = err.message; }
  S.busy = false; renderSheet(); render();
}

/* ======================= ESTÚDIO ======================= */
function plansAdmin() {
  const list = S.plans || []; const c = S.client || {};
  const card = p => {
    const ideas = p.ideas || []; const cnt = st => ideas.filter(i => ideaSt(i) === st).length;
    const asks = ideas.filter(i => ["alteracao", "reprovado"].includes(ideaSt(i)));
    return `<article class="pl ${p.visible === false ? "draft" : ""}">
      <div class="pl-h"><span class="fpill ${p.visible === false ? "f-draft" : "f-post"}">${p.visible === false ? "Rascunho" : (PERIODS[p.period] || PERIODS.semanal).tag}</span><small>${p.visible === false ? "Só você vê" : p.seenAt ? "Visto em " + esc(fmtStamp(p.seenAt)) : "Cliente ainda não abriu"}</small></div>
      <h3>${esc(fmtRange(p.start, p.end))}</h3>
      ${progressBar(p)}
      <div class="pl-n"><span><b>${cnt("aprovado")}</b> aprovadas</span><span><b>${planOpen(p)}</b> aguardando</span><span><b>${cnt("alteracao")}</b> ajustes</span><span><b>${cnt("reprovado")}</b> repensar</span>${p.deadline ? `<span>Prazo ${esc(fmtDeadline(p.deadline))}</span>` : ""}</div>
      ${asks.length ? `<div class="pl-asks">${asks.slice(0, 3).map(i => `<div><b>${esc(i.title)}</b>${i.review?.note ? `<p>“${esc(i.review.note)}”</p>` : `<p class="muted">${esc(IDEA_ST[ideaSt(i)].label)}</p>`}</div>`).join("")}</div>` : ""}
      <div class="rq-a"><button class="btn sm pri" data-act="plan-edit" data-id="${p.id}">Abrir e editar</button><button class="btn sm" data-act="plan-preview" data-id="${p.id}">Ver como o cliente</button>${p.visible !== false ? `<button class="btn sm" data-act="copy-link" data-link="${esc(location.origin + "/c/" + (c.token || "") + "/planejamento")}" data-msg="Link do planejamento copiado">Copiar link</button>` : ""}<button class="link ${S.armed === "pl" + p.id ? "danger" : ""}" data-act="plan-del" data-id="${p.id}">${S.armed === "pl" + p.id ? "confirmar exclusão" : "Excluir"}</button></div></article>`;
  };
  return `<section class="reqs plans-a"><div class="section-h"><h2>Plane<em>jamento</em></h2><span class="eyebrow">${list.length ? `${list.length} ${list.length === 1 ? "planejamento" : "planejamentos"} · padrão ${esc((PERIODS[c.planPeriod] || PERIODS.semanal).tag.toLowerCase())}` : "Aprovação de ideias e legendas antes da arte"}</span></div>
    ${list.length ? `<div class="rq-list">${list.map(card).join("")}</div>` : `<div class="pl-empty"><p>Suba o planejamento da semana, quinzena ou mês. O cliente aprova as ideias e legendas antes da gente criar as artes.</p><button class="btn yel" data-act="plan-new">+ Novo planejamento</button></div>`}</section>`;
}

function newPlanEditor() {
  const period = S.client?.planPeriod || "semanal"; const start = nextStart(period);
  return { kind: "plan", step: "periodo", id: null, sheetCls: "sheet-plan-a", data: { period, start, end: periodEnd(period, start), deadline: "", note: "", ideas: [] }, warn: [] };
}
function planEditSheet() {
  const e = S.editor, d = e.data; const c = S.client || {};
  const steps = ["periodo", "lendo", "conferir", "enviado"]; const si = steps.indexOf(e.step);
  const top = `<div class="pa-h"><span class="eyebrow">${e.id ? "Planejamento" : "Novo planejamento"} · ${esc(c.name || "")}</span><button class="x dark" data-act="close" aria-label="Fechar">✕</button></div>
    ${e.id ? "" : `<div class="pa-steps">${steps.map((s, k) => `<i class="${k <= si ? "on" : ""}"></i>`).join("")}</div>`}`;
  if (e.step === "periodo") {
    return `<div class="pa" role="dialog" aria-modal="true" aria-labelledby="pah">${top}<h2 id="pah">Qual é o <em>período</em>?</h2>
      <div class="field"><span>Formato do planejamento</span><div class="ptags big">${Object.entries(PERIODS).map(([k, v]) => `<button data-act="pa-period" data-k="${k}" aria-selected="${d.period === k}">${v.tag}</button>`).join("")}</div><span class="hint">Fica salvo como padrão de ${esc(c.name || "cliente")}. Dá para trocar a qualquer momento.</span></div>
      <div class="fgrid"><label class="field"><span>Começa em</span><input type="date" data-pa="start" value="${esc(d.start)}"></label><label class="field"><span>Termina em</span><input type="date" data-pa="end" value="${esc(d.end)}"></label>
      <label class="field full"><span>Prazo para o cliente aprovar</span><input type="datetime-local" data-pa="deadline" value="${esc(d.deadline)}"></label></div>
      <div class="field"><span>Ideias e legendas</span>
        <label class="pa-drop" for="pa-file"><b>⇪</b><strong>Arraste ou escolha o arquivo do planejamento</strong><small>.txt ou .md · uma ideia por bloco, separadas por ---</small></label><input class="sr" id="pa-file" type="file" accept=".txt,.md,.text,text/plain,text/markdown" data-plan-file>
        <div class="pa-alt"><a class="link" href="/modelo-planejamento.txt" download="modelo-planejamento.txt">Baixar modelo</a><button class="link" data-act="pa-paste-toggle">${e.paste ? "Fechar" : "Colar o texto"}</button><button class="link" data-act="pa-manual">Adicionar ideia por ideia</button></div>
        ${e.paste ? `<textarea id="pa-paste" rows="8" placeholder="Cole aqui o planejamento que o squad gerou">${esc(e.pasteText || "")}</textarea><div class="actions"><button class="btn pri" data-act="pa-read">Ler texto</button></div>` : ""}
      </div>
      <pre class="pa-sample"><b>Data:</b> 08/10 09:00\n<b>Formato:</b> Post\n<b>Ideia:</b> Café da manhã de 3 ingredientes\n<b>Descrição:</b> Receita rápida, foto de cima\n<b>Legenda:</b> 3 ingredientes, 5 minutos e um café…\n<i>---</i></pre>
      ${e.err ? `<p class="err">${esc(e.err)}</p>` : ""}
      <div class="pa-foot"><button class="btn ghost" data-act="close">Cancelar</button></div></div>`;
  }
  if (e.step === "lendo") {
    const pr = e.prog || [];
    return `<div class="pa" role="dialog" aria-modal="true" aria-labelledby="pah">${top}<h2 id="pah">Lendo o <em>planejamento</em>…</h2>
      <div class="pa-load"><div><b>A Rita e o time estão organizando as ideias${c.name ? " de " + esc(firstName(c)) : ""}.</b><div class="pa-bar"><i style="width:${e.pct || 5}%"></i></div><small>${e.pct || 5}%</small></div>${lk("time-de-criacao", "Está com o time de criação", "pa-load-stk")}</div>
      <ol class="pa-prog">${pr.map(x => `<li class="${x.st}"><i aria-hidden="true">${x.st === "ok" ? "✓" : ""}</i><div><b>${esc(x.t)}</b><small>${esc(x.s || "")}</small></div></li>`).join("")}</ol>
      <p class="hint" style="margin-top:auto">Pode fechar esta janela que nada se perde até você enviar.</p></div>`;
  }
  if (e.step === "enviado") {
    const p = (S.plans || []).find(x => x.id === e.id) || d;
    const link = `${location.origin}/c/${c.token || ""}/planejamento`;
    const msg = `Oi${firstName(c) ? ", " + firstName(c) : ""}! O planejamento ${(PERIODS[p.period] || PERIODS.semanal).da} (${fmtRange(p.start, p.end)}) já está no Aprova pra você aprovar as ideias e legendas antes da gente criar as artes: ${link}`;
    return `<div class="pa pa-sent" role="dialog" aria-modal="true" aria-labelledby="pah">${top}${lk("planejamento-enviado", "Planejamento enviado", "sent-stk")}
      <h2 id="pah">Planejamento <em>enviado!</em></h2><p>${esc(firstName(c) || "O cliente")} vê o aviso amarelo e o pop-up assim que abrir a página. Mande o link para avisar agora.</p>
      <div class="actions center"><a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Avisar no WhatsApp</a><button class="btn" data-act="copy-link" data-link="${esc(msg)}" data-msg="Mensagem copiada">Copiar mensagem</button></div>
      <div class="sent-n"><div><b>${(p.ideas || []).length}</b>ideias</div><div><b>${esc(fmtRange(p.start, p.end))}</b>período</div>${p.deadline ? `<div><b>${esc(fmtDeadline(p.deadline))}</b>prazo</div>` : ""}</div>
      <button class="link" data-act="close">Fechar</button></div>`;
  }
  /* conferir / editar */
  const ideas = d.ideas || []; const by = f => ideas.filter(i => i.format === f).length;
  const warn = planWarnings(d);
  return `<div class="pa" role="dialog" aria-modal="true" aria-labelledby="pah">${top}
    <div class="pa-title"><h2 id="pah">${e.id ? `${esc((PERIODS[d.period] || PERIODS.semanal).tag)} · <em>${esc(fmtRange(d.start, d.end))}</em>` : `<em>${ideas.length} ${ideas.length === 1 ? "ideia" : "ideias"}</em> ${ideas.length === 1 ? "pronta" : "prontas"}.<br>Confere?`}</h2>${e.id ? "" : lk("tudo-pronto", "Tudo pronto", "pa-title-stk")}</div>
    <div class="pa-chips"><span class="fpill f-post">${esc((PERIODS[d.period] || PERIODS.semanal).tag)} · ${esc(fmtRange(d.start, d.end))}</span>${IFMT.filter(by).map(f => `<span class="fpill f-gray">${by(f)} ${esc(f === "Carrossel" && by(f) > 1 ? "Carrosséis" : f === "Post" && by(f) > 1 ? "Posts" : f)}</span>`).join("")}</div>
    ${e.id ? `<div class="fgrid"><label class="field"><span>Começa em</span><input type="date" data-pa="start" value="${esc(d.start)}"></label><label class="field"><span>Termina em</span><input type="date" data-pa="end" value="${esc(d.end)}"></label><label class="field full"><span>Prazo para aprovar</span><input type="datetime-local" data-pa="deadline" value="${esc(d.deadline)}"></label></div>` : ""}
    ${warn.length ? `<div class="pa-warn"><b>${warn.length} ${warn.length === 1 ? "aviso" : "avisos"}:</b> ${warn.map(esc).join(" · ")}</div>` : ""}
    <div class="pa-ideas">${ideas.map((i, k) => ideaRow(i, k, e)).join("")}</div>
    <button class="btn sm" data-act="pa-add">+ Adicionar ideia</button>
    <label class="field"><span>Recado para ${esc(firstName(c) || "o cliente")} (opcional)</span><textarea data-pa="note" rows="2" placeholder="Ex.: montei a quinzena pensando no lançamento do desafio">${esc(d.note || "")}</textarea></label>
    ${e.err ? `<p class="err">${esc(e.err)}</p>` : ""}
    <div class="pa-foot">${e.id ? `<button class="btn danger ${S.armed === "pl" + e.id ? "armed" : ""}" data-act="plan-del" data-id="${e.id}">${S.armed === "pl" + e.id ? "Confirmar exclusão" : "Excluir"}</button>` : `<button class="btn ghost" data-act="pa-back">Voltar</button>`}<span class="sp"></span>
      ${!e.id || d.visible === false ? `<button class="btn" data-act="pa-save" data-vis="0" ${S.busy ? "disabled" : ""}>Salvar rascunho</button>` : ""}
      <button class="btn pri" data-act="pa-save" data-vis="1" ${S.busy || !ideas.length ? "disabled" : ""}>${S.busy ? "Enviando…" : e.id && d.visible !== false ? "Salvar planejamento" : `Enviar para ${esc(firstName(c) || "o cliente")}`}</button></div></div>`;
}
function ideaRow(i, k, e) {
  const st = ideaSt(i); const open = e.openIdx === k;
  const hist = (i.review?.history || []).filter(h => h.note && h.byLabel !== "ALL TORAL").slice(-2).reverse();
  const d = i.date ? new Date(i.date) : null;
  return `<div class="pi ${open ? "open" : ""}">
    <button class="pi-row" data-act="pa-toggle" data-i="${k}" aria-expanded="${open}"><span class="pvl-d"><small>${d && !isNaN(d) ? DOW[d.getDay()] : ""}</small><b>${d && !isNaN(d) ? pad2(d.getDate()) : "–"}</b></span><span class="fpill ${FMT_CLS[i.format] || "f-post"}">${esc(i.format)}</span><span class="pi-t"><b>${esc(i.title || "Ideia sem título")}</b><small>${esc((i.caption || i.idea || "Sem legenda").replace(/\s+/g, " ").slice(0, 90))}</small></span>${e.id && st !== "pendente" ? `<span class="ist ${IDEA_ST[st].cls}">${esc(IDEA_ST[st].label)}</span>` : ""}<span class="pi-ed">${open ? "Fechar" : "Editar"}</span></button>
    ${hist.length ? `<div class="pi-hist">${hist.map(h => `<p><b>${esc(h.byLabel || "Cliente")}:</b> ${esc(h.note)}</p>`).join("")}</div>` : ""}
    ${open ? `<div class="pi-form fgrid">
      <label class="field"><span>Data e hora</span><input type="datetime-local" data-pi="${k}.date" value="${esc(i.date || "")}"></label>
      <div class="field"><span>Formato</span><div class="seg">${IFMT.map(f => `<button data-act="pi-fmt" data-i="${k}" data-k="${f}" aria-pressed="${i.format === f}">${f}</button>`).join("")}</div></div>
      <label class="field full"><span>Ideia (título)</span><input type="text" data-pi="${k}.title" value="${esc(i.title || "")}"></label>
      <label class="field full"><span>Descrição da ideia / roteiro</span><textarea data-pi="${k}.idea" rows="3">${esc(i.idea || "")}</textarea></label>
      <label class="field full"><span>Legenda</span><textarea data-pi="${k}.caption" rows="5">${esc(i.caption || "")}</textarea></label>
      <label class="field full"><span>Hashtags</span><input type="text" data-pi="${k}.hashtags" value="${esc(i.hashtags || "")}"></label>
      <div class="actions full">${e.id && ["alteracao", "reprovado"].includes(st) ? `<span class="hint">Ao salvar com mudanças, a ideia volta para o cliente como “Ajuste feito”.</span>` : ""}<span class="sp"></span><button class="link danger" data-act="pi-del" data-i="${k}">Remover ideia</button></div>
    </div>` : ""}</div>`;
}
function planWarnings(d) {
  const w = []; const ideas = d.ideas || [];
  ideas.forEach(i => { if ((i.caption || "").length > 2200) w.push(`a legenda de “${i.title}” passou de 2.200 caracteres`); });
  const noCap = ideas.filter(i => !(i.caption || "").trim()).length; if (noCap) w.push(`${noCap} ${noCap === 1 ? "ideia está" : "ideias estão"} sem legenda`);
  const out = ideas.filter(i => i.date && d.start && d.end && (i.date.slice(0, 10) < d.start || i.date.slice(0, 10) > d.end)).length; if (out) w.push(`${out} ${out === 1 ? "data está" : "datas estão"} fora do período`);
  const noDate = ideas.filter(i => !i.date).length; if (noDate) w.push(`${noDate} sem data`);
  return w;
}

/* leitura do arquivo do planejamento */
const PLAN_KEYS = { "data": "date", "dia": "date", "data e hora": "date", "formato": "format", "tipo": "format", "ideia": "title", "titulo": "title", "tema": "title", "assunto": "title", "pauta": "title", "descricao": "idea", "descricao da ideia": "idea", "roteiro": "idea", "conceito": "idea", "briefing": "idea", "legenda": "caption", "texto": "caption", "copy": "caption", "hashtags": "hashtags" };
const PLAN_MULTI = ["idea", "caption"];
function parsePlanText(text) {
  return splitBriefs(text).map(block => {
    const out = {}; let cur = null;
    block.split("\n").forEach(line => {
      if (/^\s*#/.test(line)) return;
      const m = line.match(/^\s*([^:]{2,24}):\s*(.*)$/); const k = m && PLAN_KEYS[nrm(m[1])];
      if (k) { cur = k; out[k] = (m[2] || "").trim(); return; }
      if (cur && PLAN_MULTI.includes(cur)) out[cur] = (out[cur] ? out[cur] + "\n" : "") + line;
    });
    Object.keys(out).forEach(k => { out[k] = String(out[k]).replace(/^\n+|\s+$/g, ""); if (!out[k]) delete out[k]; });
    if (out.format) { const f = nrm(out.format); out.format = /reel|video/.test(f) ? "Reels" : /carross/.test(f) ? "Carrossel" : /stor/.test(f) ? "Stories" : /anunc|ads|pago/.test(f) ? "Anúncio" : "Post"; }
    if (out.date) out.date = toISODate(out.date, true) || "";
    return out;
  }).filter(i => i.title || i.caption || i.idea).map(i => ({ id: "", date: i.date || "", format: i.format || "Post", title: i.title || (i.idea || i.caption || "").split("\n")[0].slice(0, 80), idea: i.idea || "", caption: i.caption || "", hashtags: i.hashtags || "" }));
}
function spreadDates(d) {
  const s = toDay(d.start), en = toDay(d.end); if (!s || !en) return 0;
  const free = d.ideas.filter(i => !i.date); if (!free.length) return 0;
  const span = Math.max(1, Math.round((en - s) / 864e5) + 1);
  free.forEach((i, k) => { const day = addDays(s, Math.floor(k * span / free.length)); i.date = dayKey(day) + "T12:00"; });
  return free.length;
}
async function runPlanParse(text) {
  const e = S.editor; if (!e) return;
  e.step = "lendo"; e.err = ""; e.pct = 8; e.keepScroll = false;
  e.prog = [{ t: "Arquivo recebido", s: e.fileName || "texto colado", st: "ok" }, { t: "Separando as ideias", s: "", st: "run" }, { t: "Montando o calendário", s: "", st: "wait" }, { t: "Conferindo legendas", s: "tamanho, hashtags e datas", st: "wait" }];
  renderSheet(); await wait(450);
  let ideas = parsePlanText(text);
  if (!ideas.length || ideas.every(i => !i.caption)) {
    e.prog[1].s = "Texto solto: a IA está lendo"; e.pct = 25; renderSheet();
    try { const r = await api("/api/admin/parse-plan", { method: "POST", body: { text } }); if (r.ideas?.length) ideas = r.ideas.map(i => ({ ...i, id: "", date: i.date ? toISODate(i.date, true) || "" : "" })); } catch (err) {}
  }
  if (S.editor !== e) return;
  if (!ideas.length) { e.step = "periodo"; e.err = "Não encontrei ideias nesse texto. Use o modelo de planejamento ou adicione ideia por ideia."; renderSheet(); return; }
  e.prog[1] = { ...e.prog[1], s: `${ideas.length} ${ideas.length === 1 ? "ideia encontrada" : "ideias encontradas"}`, st: "ok" }; e.prog[2].st = "run"; e.pct = 55; renderSheet(); await wait(500);
  e.data.ideas = [...(e.data.ideas || []), ...ideas];
  const spread = spreadDates(e.data);
  e.data.ideas.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  e.prog[2] = { ...e.prog[2], s: `Distribuindo de ${fmtRange(e.data.start, e.data.end)}${spread ? ` · ${spread} sem data foram espalhadas` : ""}`, st: "ok" }; e.prog[3].st = "run"; e.pct = 82; renderSheet(); await wait(450);
  const w = planWarnings(e.data);
  e.prog[3] = { ...e.prog[3], s: w.length ? `${w.length} ${w.length === 1 ? "ponto" : "pontos"} para conferir` : "Tudo certo", st: "ok" }; e.pct = 100; renderSheet(); await wait(400);
  if (S.editor !== e) return;
  e.step = "conferir"; e.keepScroll = false; renderSheet();
}
async function savePlan(visible) {
  const e = S.editor; if (!e || S.busy) return;
  const d = JSON.parse(JSON.stringify(e.data)); d.visible = visible;
  if (!d.ideas.length) { e.err = "Adicione pelo menos uma ideia."; renderSheet(); return; }
  S.busy = true; e.err = ""; renderSheet();
  try {
    const r = e.id ? await api(`/api/admin/clients/${S.clientId}/plans/${e.id}`, { method: "PUT", body: d }) : await api(`/api/admin/clients/${S.clientId}/plans`, { method: "POST", body: d });
    const i = (S.plans || []).findIndex(x => x.id === r.plan.id); if (i >= 0) S.plans[i] = r.plan; else S.plans = [r.plan, ...(S.plans || [])];
    if (r.client) S.client = { ...S.client, ...r.client };
    S.busy = false;
    const wasSent = e.id && e.data.visible !== false;
    if (visible && !wasSent) { e.id = r.plan.id; e.data = r.plan; e.step = "enviado"; e.keepScroll = false; renderSheet(); render(); }
    else { closeSheet(); render(); toast(visible ? "Planejamento salvo" : "Rascunho salvo"); }
  } catch (err) { S.busy = false; e.err = err.message; renderSheet(); }
}

/* ---------- painel: precisa da sua atenção ---------- */
function adminAlerts(list) {
  const cards = [];
  list.forEach(c => {
    const a = c.alerts || {};
    (a.due || []).forEach(d => cards.push({ t: Date.parse(d.deadline), html: `<button class="al al-due" data-act="go" data-id="${c.id}"><span class="al-t"><span class="eyebrow">${Date.parse(d.deadline) < Date.now() ? "Venceu " : "Vence "}${esc(fmtDeadline(d.deadline))}</span><b>Planejamento de ${esc(firstName(c))}</b><small>${d.open} de ${d.total} ${d.total === 1 ? "ideia" : "ideias"} sem resposta</small></span>${lk("prazo-estourando", "Prazo estourando", "al-stk")}</button>` }));
    if (a.reply) { const r = a.reply; const what = r.kind === "comment" ? "comentou" : r.status === "alteracao" ? "pediu ajuste" : r.status === "reprovado" ? "pediu para repensar" : "respondeu"; cards.push({ t: Date.parse(r.at), html: `<button class="al" data-act="go" data-id="${c.id}"><span class="al-t"><span class="eyebrow">${esc(fmtStamp(r.at))}</span><b>${esc(firstName(c))} ${what}</b><small>${r.note ? "“" + esc(r.note.slice(0, 70)) + "” · " : ""}${esc(r.title || "")}</small></span>${lk("cliente-respondeu", "Cliente respondeu", "al-stk")}</button>` }); }
    (a.posted || []).forEach(p => cards.push({ t: Date.parse(p.at), html: `<button class="al" data-act="go" data-id="${c.id}"><span class="al-t"><span class="eyebrow">${esc(fmtStamp(p.at))}</span><b>Post de ${esc(c.name)}</b><small>${esc(p.title)} foi ao ar</small></span>${lk("postado", "Postado", "al-stk")}</button>` }));
  });
  if (!cards.length) return "";
  cards.sort((x, y) => (y.t || 0) - (x.t || 0));
  const due = cards.filter(x => x.html.includes("al-due")); const rest = cards.filter(x => !x.html.includes("al-due"));
  const show = [...due, ...rest].slice(0, 6);
  return `<section class="alerts"><div class="section-h"><h2>Precisa da sua <em>atenção</em></h2><span class="eyebrow">${cards.length} ${cards.length === 1 ? "aviso" : "avisos"}</span></div><div class="al-grid">${show.map(x => x.html).join("")}</div></section>`;
}
function cardWaiting(c) {
  const k = c.counts || {}; const pend = (k.pendente || 0) + (k.ajustado || 0) + (k.ideias || 0);
  if (!pend) return "";
  const last = c.alerts?.lastVisit; const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
  if (last && days < 3) return "";
  return `<div class="cw"><span>${last ? `Sem abrir a página há ${days} dias` : "Ainda não abriu o link"}</span>${lk("sem-pressa", "Sem pressa, tô esperando", "cw-stk")}</div>`;
}

const PLAN_SHEETS = { welcome: welcomeSheet, planpop: planPopSheet, briefsent: briefSentSheet, notifs: notifsSheet, planview: planViewSheet, plan: planEditSheet };

/* ---------- cliques ---------- */
function planClick(a, b) {
  const e = S.editor;
  switch (a) {
    case "plan-open": closeSheet(); openPlanView(b.dataset.id); break;
    case "plan-idea": closeSheet(); openPlanView(b.dataset.id, b.dataset.idea); break;
    case "plan-switch": openPlanView(b.dataset.id); break;
    case "plan-cal": if (e) { e.step = "cal"; e.ask = null; e.keepScroll = false; renderSheet(); } break;
    case "plan-card": if (e) { e.idx = Number(b.dataset.i); e.step = "card"; e.ask = null; e.keepScroll = false; renderSheet(); } break;
    case "plan-start": { const p = curPlan(); if (!p) break; const k = (p.ideas || []).findIndex(isOpenIdea); e.idx = k >= 0 ? k : 0; e.step = "card"; e.keepScroll = false; renderSheet(); break; }
    case "plan-step": { const p = curPlan(); const n = (p?.ideas || []).length; const k = (e.idx || 0) + Number(b.dataset.d); if (k >= 0 && k < n) { e.idx = k; e.ask = null; renderSheet(); } break; }
    case "idea-dec": { const s = b.dataset.s; if (s === "aprovado") decideIdea(s); else { e.ask = s; e.chips = []; e.note = ""; renderSheet(); setTimeout(() => $("#idea-note")?.focus(), 40); } break; }
    case "ask-chip": { const k = b.dataset.k; e.chips = (e.chips || []).includes(k) ? e.chips.filter(x => x !== k) : [...(e.chips || []), k]; e.note = $("#idea-note")?.value || ""; renderSheet(); break; }
    case "ask-cancel": e.ask = null; renderSheet(); break;
    case "ask-send": { const note = ($("#idea-note")?.value || "").trim(); const full = [(e.chips || []).length ? "Ajustar: " + e.chips.join(", ") : "", note].filter(Boolean).join(" · "); if (e.ask === "alteracao" && !full) { e.err = "Conte o que você quer ajustar."; renderSheet(); break; } decideIdea(e.ask, full); break; }
    case "notifs": S.open = null; S.editor = { kind: "notifs", sheetCls: "sheet-c" }; renderSheet(); break;
    case "nf-open": { const id = b.dataset.id; closeSheet(); openPost(id); break; }
    case "goto-new": closeSheet(); setTimeout(() => document.getElementById("artes-novas")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); break;
    /* estúdio */
    case "plan-new": S.open = null; S.editor = newPlanEditor(); renderSheet(); break;
    case "plan-edit": { const p = (S.plans || []).find(x => x.id === b.dataset.id); if (p) { S.editor = { kind: "plan", step: "conferir", id: p.id, sheetCls: "sheet-plan-a", data: JSON.parse(JSON.stringify(p)), openIdx: null }; renderSheet(); } break; }
    case "plan-preview": openPlanView(b.dataset.id); break;
    case "plan-del": { const id = b.dataset.id; if (S.armed !== "pl" + id) { S.armed = "pl" + id; S.editor ? renderSheet() : render(); break; }
      api(`/api/admin/clients/${S.clientId}/plans/${id}`, { method: "DELETE" }).then(() => { S.plans = S.plans.filter(x => x.id !== id); S.armed = null; if (S.editor) closeSheet(); render(); toast("Planejamento excluído"); }).catch(err => toast(err.message)); break; }
    case "pa-period": { const d = e.data; d.period = b.dataset.k; if (!e.id) { d.start = d.start || nextStart(d.period); } d.end = periodEnd(d.period, d.start); renderSheet(); break; }
    case "pa-paste-toggle": e.paste = !e.paste; renderSheet(); if (e.paste) setTimeout(() => $("#pa-paste")?.focus(), 40); break;
    case "pa-read": { const t = ($("#pa-paste")?.value || "").trim(); if (!t) { e.err = "Cole o texto do planejamento."; renderSheet(); break; } e.fileName = "texto colado"; runPlanParse(t); break; }
    case "pa-manual": e.data.ideas = [...(e.data.ideas || []), { id: "", date: e.data.start ? e.data.start + "T12:00" : "", format: "Post", title: "", idea: "", caption: "", hashtags: "" }]; e.openIdx = e.data.ideas.length - 1; e.step = "conferir"; e.keepScroll = false; renderSheet(); break;
    case "pa-add": e.data.ideas.push({ id: "", date: e.data.start ? e.data.start + "T12:00" : "", format: "Post", title: "", idea: "", caption: "", hashtags: "" }); e.openIdx = e.data.ideas.length - 1; renderSheet(); setTimeout(() => document.querySelector(".pi.open input[type=text]")?.focus(), 40); break;
    case "pa-back": e.step = "periodo"; e.keepScroll = false; renderSheet(); break;
    case "pa-toggle": { const k = Number(b.dataset.i); e.openIdx = e.openIdx === k ? null : k; renderSheet(); break; }
    case "pi-fmt": e.data.ideas[Number(b.dataset.i)].format = b.dataset.k; renderSheet(); break;
    case "pi-del": e.data.ideas.splice(Number(b.dataset.i), 1); e.openIdx = null; renderSheet(); break;
    case "pa-save": savePlan(b.dataset.vis === "1"); break;
  }
}
document.addEventListener("input", ev => {
  const t = ev.target, e = S.editor; if (!e) return;
  if (t.dataset.pa && e.kind === "plan") { e.data[t.dataset.pa] = t.value; if (t.dataset.pa === "start" && !e.id) { e.data.end = periodEnd(e.data.period, t.value); const endIn = document.querySelector('[data-pa="end"]'); if (endIn) endIn.value = e.data.end; } }
  if (t.dataset.pi && e.kind === "plan") { const [k, f] = t.dataset.pi.split("."); const i = e.data.ideas[Number(k)]; if (i) i[f] = t.value; }
  if (t.id === "pa-paste") e.pasteText = t.value;
  if (t.id === "idea-note") e.note = t.value;
});
document.addEventListener("change", ev => {
  const t = ev.target;
  if (t.matches("[data-plan-file]") && t.files[0] && S.editor?.kind === "plan") {
    const f = t.files[0]; t.value = "";
    if (f.size > 300000) { S.editor.err = "Arquivo grande demais. Use um .txt de até 300 KB."; renderSheet(); return; }
    S.editor.fileName = f.name;
    f.text().then(txt => runPlanParse(txt)).catch(() => { if (S.editor) { S.editor.err = "Não consegui ler esse arquivo. Salve como .txt e tente de novo."; renderSheet(); } });
  }
});
/* arrastar o arquivo para a área */
document.addEventListener("dragover", ev => { const z = ev.target.closest?.(".pa-drop"); if (z) { ev.preventDefault(); z.classList.add("over"); } });
document.addEventListener("dragleave", ev => { const z = ev.target.closest?.(".pa-drop"); if (z && !z.contains(ev.relatedTarget)) z.classList.remove("over"); });
document.addEventListener("drop", ev => { const z = ev.target.closest?.(".pa-drop"); if (!z) return; ev.preventDefault(); const f = ev.dataTransfer.files?.[0]; if (f && S.editor?.kind === "plan") { S.editor.fileName = f.name; f.text().then(runPlanParse); } });
/* deslizar o card da ideia no celular: direita aprova, esquerda pede para repensar */
let icX = null, icY = null;
document.addEventListener("touchstart", ev => { if (ev.target.closest?.("#icard") && ev.touches.length === 1) { icX = ev.touches[0].clientX; icY = ev.touches[0].clientY; } }, { passive: true });
document.addEventListener("touchend", ev => {
  if (icX == null) return; const dx = ev.changedTouches[0].clientX - icX, dy = ev.changedTouches[0].clientY - icY; icX = null;
  if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) || S.isOwner || S.editor?.kind !== "planview" || S.editor.ask) return;
  if (dx > 0) decideIdea("aprovado"); else { S.editor.ask = "reprovado"; S.editor.chips = []; renderSheet(); }
}, { passive: true });
