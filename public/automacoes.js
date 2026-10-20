/* Automações do Instagram · Aprova All Toral
   Comentário em post/Reels ou resposta de story com uma palavra → DM automática. */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const shortUrl = (u) => { try { const x = new URL(u); return x.hostname.replace("www.", "") + x.pathname.replace(/\/$/, ""); } catch (e) { return u; } };
function fmt(s) { const d = new Date(s); if (isNaN(d)) return ""; return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3200); }
const ICON = {
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M8 8h11v11H8zM5 16V5h11"/></svg>',
};

const S = {
  pass: store.get("aprov_admin"), loginErr: "", ready: false, loadErr: "",
  clients: [], accounts: {}, counts: {}, cfg: null, unknown: [],
  cid: null, data: null, loading: false,
  tab: "rules", q: "", src: "todas", status: "todas",
  ed: null, testRes: null, tokenOpen: false, busy: false,
};

async function api(path, opts = {}) {
  const headers = { authorization: "Bearer " + (S.pass || "") };
  let body = opts.body;
  if (body) { headers["content-type"] = "application/json"; body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, { method: opts.method || "GET", headers, body }); } catch (e) { throw new Error("Sem conexão. Confira a internet e tente de novo."); }
  let data = {};
  try { data = await r.json(); } catch (e) {}
  if (r.status === 401) { S.pass = null; store.set("aprov_admin", null); S.loginErr = "Entre com a senha do painel do Aprova."; render(); }
  if (!r.ok) throw new Error(data.error || "Não deu certo. Tente de novo.");
  return data;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copiado"); } catch (e) { toast("Selecione e copie: " + text); }
}

/* ---------- moldura ---------- */
function bar() {
  return `<header class="bar"><div class="wrap"><a class="bar-brand is-link" href="/admin" style="text-decoration:none" title="Voltar para as aprovações"><img class="bar-larot" src="/larot.png" alt="" width="56" height="56"><div class="bar-t"><small>ALL TORAL</small><b>Automações do <em>Instagram</em></b></div></a>
  <div class="bar-r">${S.pass ? `<button class="btn sm" data-act="cfg" style="background:#fff;border-color:#fff;color:var(--pink-deep)">Configurar app</button>` : ""}</div></div></header>`;
}
function foot() { return `<footer class="foot"><div class="wrap"><img src="/logo.svg" alt="ALL TORAL" style="height:36px"><span>Estúdio criativo · Automações</span><span>@all.toral</span></div></footer>`; }
const av = (c) => `<span class="au-av" style="background:${esc(c.color || "#fff")}">${c.logoId ? `<img src="/api/media/${esc(c.logoId)}" alt="">` : esc(initials(c.name))}</span>`;

/* ---------- telas ---------- */
function render() {
  const m = $("#main");
  if (!S.pass) { m.innerHTML = bar() + loginView() + foot(); $("#pw")?.focus(); return; }
  if (!S.ready) { m.innerHTML = bar() + `<div class="wrap center-msg"><div><p class="eyebrow">Carregando</p><h1>${S.loadErr ? "Não deu para abrir" : "Buscando os clientes"}</h1>${S.loadErr ? `<p style="color:var(--muted)">${esc(S.loadErr)}</p><p><button class="btn pri" data-act="reload">Tentar de novo</button></p>` : ""}</div></div>` + foot(); return; }
  m.innerHTML = bar() + `<div class="wrap au-layout"><aside class="au-side">${sideView()}</aside><main class="au-main">${mainView()}</main></div>` + foot();
}
function loginView() {
  return `<div class="wrap center-msg"><form class="login" id="login"><p class="eyebrow">Painel do estúdio</p><h1>Entre no <em style="color:var(--pink)">Aprova</em></h1>
  <label class="field"><span>Senha do painel</span><input type="password" id="pw" autocomplete="current-password" required></label>
  ${S.loginErr ? `<p class="err">${esc(S.loginErr)}</p>` : ""}<button class="btn pri" type="submit">Entrar</button></form></div>`;
}
function sideView() {
  const list = S.clients.map((c) => {
    const acc = S.accounts[c.id];
    return `<button class="au-cbtn" data-act="client" data-id="${c.id}" aria-current="${c.id === S.cid}">${av(c)}<span class="nm">${esc(c.name)}</span><span class="ct" title="${acc ? "Instagram conectado" : "Instagram não conectado"}"><i class="au-dot ${acc ? "on" : ""}"></i>${S.counts[c.id] || 0}</span></button>`;
  }).join("");
  return `<p class="eyebrow">Estúdio criativo</p><h2>Seus <em>clientes</em></h2><div class="au-clients">${list || `<p class="au-hint">Nenhum cliente ainda. Cadastre no painel de aprovações.</p>`}</div>
  <p class="au-hint">Os clientes são os mesmos do Aprova. O ponto verde mostra quem já tem o Instagram conectado.</p>`;
}
function mainView() {
  const c = S.clients.find((x) => x.id === S.cid);
  if (!c) return `<div class="emptybox"><h3>Escolha um cliente</h3><p>Cada cliente tem as próprias automações e a própria conta do Instagram.</p></div>`;
  const cfgOk = S.cfg?.appId && S.cfg?.hasSecret;
  const d = S.data;
  let html = `<div class="au-head"><div><p class="eyebrow">Automações do cliente</p><h1>${esc(c.name)}</h1>${c.handle ? `<div class="handle">${esc(c.handle)}</div>` : ""}</div>
    <div class="actions"><button class="btn pri" data-act="new">+ Nova automação</button></div></div>`;
  if (!cfgOk) html += `<div class="au-conn warn"><div class="t"><b>Falta configurar o app da Meta</b><span>Sem ele o Instagram não avisa o Aprova dos comentários. É uma vez só, para todos os clientes.</span></div><button class="btn pri" data-act="cfg">Configurar app</button></div>`;
  if (!d) return html + `<div class="emptybox"><p>Carregando automações…</p></div>`;
  const acc = d.account;
  if (acc) {
    const days = Math.round((new Date(acc.expiresAt) - Date.now()) / 86400000);
    html += `<div class="au-conn ${acc.lastError ? "warn" : "ok"}"><div class="t"><b>Instagram conectado: @${esc(acc.username)}</b><span>${acc.lastError ? esc(acc.lastError) : `O acesso se renova sozinho todo dia${days > 0 ? ` (válido por mais ${days} dias)` : ""}.`}</span></div>
      <button class="btn sm" data-act="connect">Reconectar</button><button class="btn sm danger" data-act="disconnect">${S.armed === "disc" ? "Confirmar" : "Desconectar"}</button></div>`;
  } else {
    html += `<div class="au-conn"><div class="t"><b>Conecte o Instagram de ${esc(c.name)}</b><span>A conta precisa ser profissional (Comercial ou Criador de conteúdo). Você entra com o login do Instagram do cliente e autoriza o Aprova.</span></div>
      <button class="btn pri" data-act="connect" ${cfgOk ? "" : "disabled"}>Conectar Instagram</button><button class="btn sm ghost" data-act="token-open">Colar token</button>
      ${S.tokenOpen ? `<form class="tok" id="tokForm"><input type="text" id="tok" placeholder="Token de acesso gerado no painel da Meta (começa com IG...)"><button class="btn sm pri" type="submit">Conectar com token</button></form>` : ""}</div>`;
  }
  const r = d.rules;
  const sent = r.reduce((t, x) => t + (x.stats?.sent || 0), 0);
  html += `<div class="au-stats"><div class="au-stat"><b>${r.length}</b><span>automações</span></div><div class="au-stat"><b>${r.filter((x) => x.active).length}</b><span>ativas</span></div>
    <div class="au-stat"><b>${r.filter((x) => x.source !== "story").length}</b><span>em posts</span></div><div class="au-stat"><b>${r.filter((x) => x.source === "story").length}</b><span>em stories</span></div>
    <div class="au-stat"><b>${sent}</b><span>DMs enviadas</span></div></div>`;
  const tab = (k, l) => `<button class="au-tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-k="${k}">${l}</button>`;
  html += `<div class="au-tabs" role="tablist">${tab("rules", "Automações")}${tab("log", "Atividade")}${tab("test", "Testar palavra")}</div>`;
  if (S.tab === "log") return html + logView(d.log);
  if (S.tab === "test") return html + testView();
  return html + rulesView(r);
}
function seg(group, cur, opts) { return `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="${group}" data-k="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`; }
function rulesView(rules) {
  if (!rules.length) return `<div class="emptybox"><h3>Nenhuma automação ainda</h3><p>Escolha se vale para um post ou um story, defina a palavra que as pessoas vão mandar e escreva a mensagem que chega na DM.</p><button class="btn pri" data-act="new">+ Criar a primeira</button></div>`;
  const cnt = {};
  rules.forEach((a) => a.keywords.forEach((k) => { const key = (a.source === "story" ? "s:" : "p:") + norm(k) + "|" + (a.url || ""); cnt[key] = (cnt[key] || 0) + 1; }));
  const q = norm(S.q);
  const list = rules
    .filter((a) => S.src === "todas" || (S.src === "story" ? a.source === "story" : a.source !== "story"))
    .filter((a) => S.status === "todas" || (S.status === "ativas" ? a.active : !a.active))
    .filter((a) => !q || norm([a.name, a.url, a.keywords.join(" "), a.dm].join(" ")).includes(q));
  const rows = list.map((a) => `<div class="au-row">
    <div style="min-width:0"><div><span class="au-src ${a.source === "story" ? "story" : ""}">${a.source === "story" ? "Story" : "Post"}</span><button class="au-title" data-act="edit" data-id="${a.id}">${esc(a.name)}</button></div>
      ${a.url ? `<a class="au-url" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(shortUrl(a.url))}</a>` : `<span class="au-url">${a.source === "story" ? "Qualquer story ativo" : "Qualquer publicação"}</span>`}
      <span class="au-meta">${a.stats?.sent ? `${a.stats.sent} DM${a.stats.sent > 1 ? "s" : ""} · última ${fmt(a.stats.last)}` : "Nenhuma DM enviada ainda"}</span></div>
    <div class="kws">${a.keywords.map((k) => { const dup = cnt[(a.source === "story" ? "s:" : "p:") + norm(k) + "|" + (a.url || "")] > 1; return `<span class="au-kw ${dup ? "dup" : ""}" ${dup ? 'title="Palavra repetida em outra automação igual"' : ""}>${esc(k)}</span>`; }).join("")}</div>
    <button class="au-pill ${a.active ? "on" : "off"}" data-act="toggle" data-id="${a.id}" title="Clique para ${a.active ? "pausar" : "ativar"}">${a.active ? "Ativa" : "Pausada"}</button>
    <div class="au-acts"><button class="au-ib" data-act="dup" data-id="${a.id}" aria-label="Duplicar" title="Duplicar">${ICON.copy}</button><button class="au-ib" data-act="edit" data-id="${a.id}" aria-label="Editar" title="Editar">${ICON.edit}</button></div></div>`).join("");
  return `<div class="au-tools"><input type="text" id="q" placeholder="Buscar por palavra, nome ou URL" value="${esc(S.q)}" aria-label="Buscar">
    ${seg("src", S.src, [["todas", "Tudo"], ["post", "Posts"], ["story", "Stories"]])}${seg("status", S.status, [["todas", "Todas"], ["ativas", "Ativas"], ["pausadas", "Pausadas"]])}</div>
    ${list.length ? `<div class="au-list">${rows}</div>` : `<div class="emptybox"><p>Nada encontrado com esse filtro.</p></div>`}`;
}
function logView(log) {
  if (!log.length) return `<div class="emptybox"><h3>Nada por aqui ainda</h3><p>Assim que alguém comentar ou responder um story da conta conectada, aparece aqui o que chegou e se a DM foi enviada. Se você comentou e nada apareceu, o Instagram ainda não está mandando os avisos: confira o passo 5 em Configurar app.</p></div>`;
  return `<div class="au-log">${log.map((l) => `<div class="au-li"><time>${fmt(l.at)}</time>
    <div class="tx"><span class="au-src ${l.source === "story" ? "story" : ""}">${l.source === "story" ? "Story" : "Post"}</span>${l.user ? `<b>@${esc(l.user)}</b> ` : ""}${l.text ? `<q>${esc(l.text)}</q>` : ""}${l.rule ? `<div class="au-meta">Automação: ${esc(l.rule)}</div>` : ""}</div>
    <span class="au-st ${l.ok === true ? "ok" : l.ok === false ? "bad" : "mid"}">${esc(l.status)}</span></div>`).join("")}</div>
    <p class="au-hint">Mostra as últimas 80 interações. Atualize a página para ver as novas.</p>`;
}
function testView() {
  const r = S.testRes;
  return `<form class="au-test" id="testForm"><p style="margin:0">Digite um comentário ou resposta de story e veja qual automação responderia. Nada é enviado.</p>
    <div class="row">${seg("tsrc", S.tsrc || "post", [["post", "Comentário em post"], ["story", "Resposta de story"]])}</div>
    <div class="row"><input type="text" id="testText" placeholder="Ex.: quero a AGENDA por favor" value="${esc(S.testText || "")}"><button class="btn pri" type="submit">Testar</button></div>
    ${r ? (r.length ? `<div>${r.map((h) => `<p style="margin:4px 0"><span class="au-st ok">Responde</span> <b>${esc(h.name)}</b> pela palavra <span class="au-kw">${esc(h.keyword)}</span>${h.specific ? " (se for na publicação escolhida)" : ""}</p>`).join("")}</div>` : `<p style="margin:0"><span class="au-st bad">Nenhuma automação responde</span></p>`) : ""}</form>`;
}

/* ---------- editor ---------- */
function openEditor(rule) {
  S.ed = rule ? { ...rule, keywords: [...rule.keywords], err: "", del: false } : { id: null, source: "post", name: "", url: "", mediaId: "", keywords: [], match: "contem", active: true, dm: "", button: "", link: "", reply: "", notes: "", err: "", del: false };
  S.ed.pick = null;
  renderSheet();
  $("#eName")?.focus();
}
function closeSheet() { S.ed = null; S.cfgOpen = false; $("#sheet").hidden = true; $("#sheet").innerHTML = ""; }
function renderSheet() {
  const sh = $("#sheet");
  if (S.cfgOpen) { sh.innerHTML = cfgView(); sh.hidden = false; return; }
  const e = S.ed;
  if (!e) { sh.hidden = true; return; }
  const st = e.source === "story";
  const c = S.clients.find((x) => x.id === S.cid) || {};
  const others = (S.data?.rules || []).filter((a) => a.id !== e.id && a.source === e.source && (a.url || "") === (e.url || ""));
  const clash = e.keywords.filter((k) => others.some((a) => a.keywords.some((x) => norm(x) === norm(k))));
  sh.innerHTML = `<div class="panel au-panel" role="dialog" aria-modal="true" aria-labelledby="edT">
  <div class="panel-h"><div class="t"><span class="eyebrow">${st ? "Resposta de story → DM" : "Comentário → DM"}</span><h2 id="edT">${e.id ? "Editar automação" : "Nova automação"}</h2></div><button class="x" data-act="close" aria-label="Fechar">✕</button></div>
  <div class="au-ed"><form class="au-form" id="edForm" novalidate>
    <label class="field"><span>Nome da automação</span><input type="text" id="eName" maxlength="80" value="${esc(e.name)}" placeholder="Ex.: Agenda do estúdio"></label>
    <div class="field"><span>Onde a automação dispara</span>${seg("esrc", e.source, [["post", "Post ou Reels"], ["story", "Stories"]])}
      <small class="hint">${st ? "Dispara quando alguém responde ao story com a palavra. A resposta já chega na DM." : "Dispara quando alguém comenta a palavra na publicação."}</small></div>
    <div class="field"><span>${st ? "Story" : "Publicação"}</span>
      <input type="url" id="eUrl" value="${esc(e.url)}" placeholder="${st ? "https://www.instagram.com/stories/marca/..." : "https://www.instagram.com/p/..."}">
      <small class="hint">${st ? "Deixe em branco para valer em qualquer story ativo. Stories somem em 24h." : "Deixe em branco para valer em qualquer publicação."} ${S.data?.account ? `<button type="button" class="link" data-act="pick">Escolher da conta</button>` : ""}</small>
      ${e.pick ? pickView(e.pick) : ""}</div>
    <div class="field"><span>Palavras-chave</span>
      <div class="au-kwbox" id="kwBox">${e.keywords.map((k, i) => `<span class="au-kw">${esc(k)}<button type="button" data-act="kwdel" data-i="${i}" aria-label="Remover ${esc(k)}">×</button></span>`).join("")}<input type="text" id="eKw" placeholder="Digite e aperte Enter"></div>
      <small class="hint">Separe por vírgula ou Enter. Maiúsculas, minúsculas e acentos não fazem diferença.</small>
      ${clash.length ? `<span class="au-warn">Já usada em outra automação igual: ${esc(clash.join(", "))}</span>` : ""}</div>
    <div class="fgrid"><label class="field"><span>Regra</span><select id="eMatch"><option value="contem" ${e.match !== "exata" ? "selected" : ""}>Contém a palavra</option><option value="exata" ${e.match === "exata" ? "selected" : ""}>É exatamente a palavra</option></select></label>
      <label class="field"><span>Status</span><label class="au-switch"><input type="checkbox" id="eActive" ${e.active ? "checked" : ""}> <span>${e.active ? "Ativa" : "Pausada"}</span></label></label></div>
    <div class="field"><span>Mensagem na DM</span><textarea id="eDm" rows="5" maxlength="640" placeholder="Oi {nome}! Aqui está o link que você pediu">${esc(e.dm)}</textarea>
      <div class="au-vars"><button type="button" data-act="var" data-v="{nome}">{nome}</button><button type="button" data-act="var" data-v="{usuario}">{usuario}</button><button type="button" data-act="var" data-v="{palavra}">{palavra}</button></div></div>
    <div class="fgrid"><label class="field"><span>Texto do botão (até 20 letras)</span><input type="text" id="eBtn" maxlength="20" value="${esc(e.button)}" placeholder="Quero agendar"></label>
      <label class="field"><span>Link do botão</span><input type="url" id="eLink" value="${esc(e.link)}" placeholder="https://..."></label></div>
    ${st ? "" : `<label class="field"><span>Resposta pública no comentário</span><input type="text" id="eReply" maxlength="300" value="${esc(e.reply)}" placeholder="Te mandei na DM!"><small class="hint">Opcional. Aparece embaixo do comentário da pessoa.</small></label>`}
    <label class="field"><span>Observações internas</span><input type="text" id="eNotes" maxlength="300" value="${esc(e.notes)}"></label>
    ${e.err ? `<p class="err">${esc(e.err)}</p>` : ""}
    <div class="au-foot"><div>${e.id ? `<button type="button" class="btn danger ${e.del ? "armed" : ""}" data-act="del">${e.del ? "Confirmar exclusão" : "Excluir"}</button>` : ""}</div>
      <div class="r"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn pri" ${S.busy ? "disabled" : ""}>${S.busy ? "Salvando…" : "Salvar automação"}</button></div></div>
  </form>
  <aside class="au-prev" aria-label="Prévia da DM"><p class="eyebrow">Prévia da DM</p><div class="au-phone"><div class="top">${av(c)}<span>${esc((c.handle || c.name || "").replace(/^@/, ""))}</span></div>
    <div class="au-pmeta">${st ? "Respondeu ao seu story" : "Comentou no seu post"}</div><div class="au-bub in" id="pIn"></div><div class="au-bub out" id="pDm"></div><div class="au-pbtn" id="pBtn"></div></div></aside></div></div>`;
  sh.hidden = false;
  preview();
}
function pickView(p) {
  if (p.loading) return `<p class="hint">Buscando publicações…</p>`;
  if (p.err) return `<p class="err">${esc(p.err)}</p>`;
  if (!p.items.length) return `<p class="hint">${S.ed.source === "story" ? "Nenhum story ativo agora." : "Nenhuma publicação encontrada."}</p>`;
  return `<div class="au-pick">${p.items.map((m, i) => `<button type="button" data-act="pickone" data-i="${i}" aria-pressed="${S.ed.mediaId === m.id}" title="${esc(m.caption || m.permalink)}">${m.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span>${esc(m.caption || m.type || "Publicação")}</span></button>`).join("")}</div>`;
}
function readForm() {
  const e = S.ed; if (!e || !$("#edForm")) return;
  e.name = $("#eName").value; e.url = $("#eUrl").value.trim(); e.match = $("#eMatch").value; e.active = $("#eActive").checked;
  e.dm = $("#eDm").value; e.button = $("#eBtn").value; e.link = $("#eLink").value.trim(); e.reply = $("#eReply")?.value || ""; e.notes = $("#eNotes").value;
  const kw = $("#eKw").value; if (kw.trim()) { addKw(kw); $("#eKw").value = ""; }
}
function addKw(raw) { raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => { if (!S.ed.keywords.some((x) => norm(x) === norm(k))) S.ed.keywords.push(k.toUpperCase()); }); }
function preview() {
  const e = S.ed; if (!e || !$("#pDm")) return;
  const kw = e.keywords[0] || "QUERO";
  const dm = ($("#eDm")?.value || "").trim() || "Sua mensagem aparece aqui.";
  $("#pIn").textContent = kw.toLowerCase();
  $("#pDm").textContent = dm.replace(/\{nome\}/g, "Ana").replace(/\{usuario\}/g, "@ana.souza").replace(/\{palavra\}/g, kw);
  const b = ($("#eBtn")?.value || "").trim(); $("#pBtn").hidden = !b; $("#pBtn").textContent = b;
}
async function saveRule() {
  readForm();
  const e = S.ed;
  if (!e.keywords.length) { e.err = "Adicione pelo menos uma palavra-chave."; return renderSheet(); }
  if (!e.dm.trim()) { e.err = "Escreva a mensagem da DM."; return renderSheet(); }
  if (e.url && !/^https?:\/\//i.test(e.url)) { e.err = "A URL precisa começar com https://"; return renderSheet(); }
  if ((e.button && !e.link) || (!e.button && e.link)) { e.err = "Para ter botão, preencha o texto e o link."; return renderSheet(); }
  S.busy = true; renderSheet();
  const body = { source: e.source, name: e.name, url: e.url, mediaId: e.mediaId, keywords: e.keywords, match: e.match, active: e.active, dm: e.dm, button: e.button, link: e.link, reply: e.reply, notes: e.notes };
  try {
    const r = e.id ? await api(`/api/admin/auto/clients/${S.cid}/rules/${e.id}`, { method: "PUT", body }) : await api(`/api/admin/auto/clients/${S.cid}/rules`, { method: "POST", body });
    S.busy = false; closeSheet(); await loadClient(); toast(r.warn || (e.id ? "Automação atualizada" : "Automação criada"));
  } catch (err) { S.busy = false; e.err = err.message; renderSheet(); }
}

/* ---------- configurar o app da Meta ---------- */
function cfgView() {
  const c = S.cfg || {};
  const cp = (label, v) => `<div class="au-copy"><code>${esc(v)}</code><button type="button" class="btn sm" data-act="copy" data-v="${esc(v)}">Copiar</button></div>`;
  return `<div class="panel au-panel" role="dialog" aria-modal="true" aria-labelledby="cfT"><div class="panel-h"><div class="t"><span class="eyebrow">Uma vez só, para todos os clientes</span><h2 id="cfT">Configurar o app da Meta</h2></div><button class="x" data-act="close" aria-label="Fechar">✕</button></div>
  <div class="au-form">
    <ol class="au-steps">
      <li><div><p>Entre em <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, clique em <b>Criar app</b>, escolha o caso de uso <b>Gerenciar mensagens e conteúdo no Instagram</b> e crie.</p></div></li>
      <li><div><p>No app, abra <b>Instagram → Configuração da API com login do Instagram</b>. Copie o <b>ID do app do Instagram</b> e a <b>Chave secreta do app do Instagram</b> e cole abaixo.</p></div></li>
      <li><div><p>Em <b>Configurar login comercial do Instagram</b>, cole este endereço em <b>URLs de redirecionamento OAuth</b>:</p>${cp("", c.redirectUri)}</div></li>
      <li><div><p>Em <b>Configurar webhooks</b>, cole a <b>URL de callback</b> e o <b>Token de verificação</b> abaixo, clique em <b>Verificar e salvar</b> e ative os campos <b>comments</b> e <b>messages</b>.</p>${cp("", c.callbackUrl)}${c.verifyToken ? cp("", c.verifyToken) : `<p class="hint">O token de verificação aparece aqui depois que você salvar o ID e a chave.</p>`}</div></li>
      <li><div><p>Volte aqui, escolha o cliente e clique em <b>Conectar Instagram</b>. Depois comente a palavra num post de teste e veja a aba <b>Atividade</b>.</p></div></li>
    </ol>
    <div class="fieldset" style="margin-top:6px"><legend>Para publicar o app</legend>
      <p style="margin:0">Em <b>Configurações do app → Básico</b> e em <b>Configurar login comercial do Instagram</b>, preencha:</p>
      <div><p class="hint" style="margin:0">URL da Política de Privacidade</p>${cp("", c.privacyUrl)}</div>
      <div><p class="hint" style="margin:0">URL dos Termos de Serviço</p>${cp("", c.termsUrl)}</div>
      <div><p class="hint" style="margin:0">URL de cancelamento de autorização (Deauthorize)</p>${cp("", c.deauthUrl)}</div>
      <div><p class="hint" style="margin:0">URL de solicitação de exclusão de dados</p>${cp("", c.deletionUrl)}</div>
      <div><p class="hint" style="margin:0">Ícone do app (1024 × 1024)</p><div class="au-copy"><a class="btn sm" href="${esc(c.iconUrl)}" target="_blank" rel="noopener">Abrir ícone para baixar</a></div></div>
      <p class="hint" style="margin:0">Categoria: <b>Negócios e páginas</b>. E-mail de contato: o seu e-mail do estúdio.</p>
    </div>
    <div class="au-note"><b>Para funcionar com qualquer seguidor</b>, o app precisa estar no modo <b>Publicado</b> com acesso avançado às permissões de mensagens e comentários, o que pede a <b>Análise do app</b> da Meta. Antes disso, as automações só respondem a contas adicionadas como testadoras no app (em <b>Funções do app</b>). Dá para testar tudo assim e pedir a análise depois.</div>
    ${c.fromEnv ? `<p class="hint">O ID e a chave estão definidos nas variáveis do Cloudflare.</p>` : `<form id="cfgForm" class="fgrid">
      <label class="field"><span>ID do app do Instagram</span><input type="text" id="cAppId" inputmode="numeric" value="${esc(c.appId || "")}" placeholder="Só números"></label>
      <label class="field"><span>Chave secreta do app do Instagram</span><input type="text" id="cSecret" autocomplete="off" placeholder="${c.hasSecret ? "Salva. Cole outra só para trocar" : "Cole a chave secreta"}"></label>
      <div class="full"><button class="btn pri" type="submit">Salvar</button></div></form>`}
    ${S.unknown?.length ? `<div><p class="eyebrow">Avisos de contas não conectadas</p>${S.unknown.map((l) => `<p class="hint" style="margin:4px 0">${fmt(l.at)} · conta ${esc(l.igId)}: ${esc(l.status)}</p>`).join("")}</div>` : ""}
  </div></div>`;
}

/* ---------- dados ---------- */
async function load() {
  S.ready = false; S.loadErr = ""; render();
  try {
    const r = await api("/api/admin/auto/overview");
    Object.assign(S, { clients: r.clients, accounts: r.accounts, counts: r.counts, cfg: r.cfg, unknown: r.unknown || [] });
    S.ready = true;
    const p = new URLSearchParams(location.search);
    const want = p.get("c") || store.get("auto_cid");
    S.cid = S.clients.some((c) => c.id === want) ? want : S.clients[0]?.id || null;
    if (p.get("ok")) toast("Instagram conectado: " + p.get("ok"));
    if (p.get("erro")) toast(p.get("erro"));
    if (p.toString()) history.replaceState({}, "", "/automacoes");
    render();
    if (S.cid) loadClient();
  } catch (e) { if (S.pass) { S.loadErr = e.message; render(); } }
}
async function loadClient() {
  const cid = S.cid; if (!cid) return;
  store.set("auto_cid", cid);
  try {
    const r = await api(`/api/admin/auto/clients/${cid}`);
    if (cid !== S.cid) return;
    S.data = r; S.accounts[cid] = r.account; S.counts[cid] = r.rules.length;
  } catch (e) { toast(e.message); }
  render();
}

/* ---------- ações ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  const rule = () => S.data?.rules.find((r) => r.id === id);
  if (act !== "disconnect") S.armed = null;
  switch (act) {
    case "reload": load(); break;
    case "client": if (S.cid !== id) { S.cid = id; S.data = null; S.tab = "rules"; S.q = ""; S.testRes = null; S.tokenOpen = false; render(); loadClient(); } break;
    case "tab": S.tab = b.dataset.k; render(); break;
    case "src": S.src = b.dataset.k; render(); break;
    case "status": S.status = b.dataset.k; render(); break;
    case "tsrc": S.tsrc = b.dataset.k; S.testText = $("#testText")?.value || ""; S.testRes = null; render(); break;
    case "new": openEditor(null); break;
    case "edit": openEditor(rule()); break;
    case "close": closeSheet(); break;
    case "cfg": S.cfgOpen = true; renderSheet(); break;
    case "copy": copy(b.dataset.v); break;
    case "token-open": S.tokenOpen = !S.tokenOpen; render(); $("#tok")?.focus(); break;
    case "connect":
      try { const r = await api(`/api/admin/auto/clients/${S.cid}/connect-url`, { method: "POST" }); location.href = r.url; } catch (e) { toast(e.message); }
      break;
    case "disconnect":
      if (S.armed !== "disc") { S.armed = "disc"; render(); break; }
      S.armed = null;
      try { await api(`/api/admin/auto/clients/${S.cid}/account`, { method: "DELETE" }); toast("Instagram desconectado"); loadClient(); } catch (e) { toast(e.message); }
      break;
    case "toggle": {
      const r = rule(); if (!r) break;
      try { await api(`/api/admin/auto/clients/${S.cid}/rules/${r.id}`, { method: "PUT", body: { active: !r.active } }); toast(r.active ? "Automação pausada" : "Automação ativada"); loadClient(); } catch (e) { toast(e.message); }
      break;
    }
    case "dup": {
      const r = rule(); if (!r) break;
      try { await api(`/api/admin/auto/clients/${S.cid}/rules`, { method: "POST", body: { ...r, name: r.name + " (cópia)", active: false } }); toast("Cópia criada, pausada"); loadClient(); } catch (e) { toast(e.message); }
      break;
    }
    /* editor */
    case "esrc": readForm(); S.ed.source = b.dataset.k; S.ed.url = ""; S.ed.mediaId = ""; S.ed.pick = null; renderSheet(); break;
    case "kwdel": readForm(); S.ed.keywords.splice(Number(b.dataset.i), 1); renderSheet(); break;
    case "var": { const t = $("#eDm"); const s = t.selectionStart ?? t.value.length; t.value = t.value.slice(0, s) + b.dataset.v + t.value.slice(t.selectionEnd ?? s); t.focus(); preview(); break; }
    case "pick":
      readForm(); S.ed.pick = { loading: true, items: [] }; renderSheet();
      try { const r = await api(`/api/admin/auto/clients/${S.cid}/media?kind=${S.ed.source}`); if (S.ed) { S.ed.pick = { items: r.media }; renderSheet(); } }
      catch (e) { if (S.ed) { S.ed.pick = { err: e.message, items: [] }; renderSheet(); } }
      break;
    case "pickone": { readForm(); const m = S.ed.pick.items[Number(b.dataset.i)]; S.ed.url = m.permalink; S.ed.mediaId = m.id; if (!S.ed.name.trim() && m.caption) S.ed.name = m.caption.slice(0, 40); renderSheet(); break; }
    case "del":
      if (!S.ed.del) { S.ed.del = true; renderSheet(); break; }
      try { await api(`/api/admin/auto/clients/${S.cid}/rules/${S.ed.id}`, { method: "DELETE" }); closeSheet(); toast("Automação excluída"); loadClient(); } catch (e) { toast(e.message); }
      break;
  }
});
document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "login") {
    const p = $("#pw").value; S.pass = p;
    try { await api("/api/admin/login", { method: "POST" }); store.set("aprov_admin", p); S.loginErr = ""; load(); }
    catch (e) { S.pass = null; S.loginErr = e.message === "Senha incorreta" ? "Senha incorreta" : e.message; render(); }
  }
  if (f.id === "edForm") saveRule();
  if (f.id === "tokForm") {
    try { const r = await api(`/api/admin/auto/clients/${S.cid}/token`, { method: "POST", body: { token: $("#tok").value } }); S.tokenOpen = false; toast("Instagram conectado: @" + r.account.username); loadClient(); } catch (e) { toast(e.message); }
  }
  if (f.id === "cfgForm") {
    try { const r = await api("/api/admin/auto/cfg", { method: "PUT", body: { appId: $("#cAppId").value, appSecret: $("#cSecret").value } }); S.cfg = { ...S.cfg, ...r.cfg }; renderSheet(); render(); toast("App salvo"); } catch (e) { toast(e.message); }
  }
  if (f.id === "testForm") {
    S.testText = $("#testText").value;
    try { const r = await api(`/api/admin/auto/clients/${S.cid}/test`, { method: "POST", body: { text: S.testText, source: S.tsrc || "post" } }); S.testRes = r.hits; render(); $("#testText")?.focus(); } catch (e) { toast(e.message); }
  }
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "q") { S.q = ev.target.value; const pos = ev.target.selectionStart; render(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); }
  if (["eDm", "eBtn"].includes(ev.target.id)) preview();
});
document.addEventListener("change", (ev) => { if (ev.target.id === "eActive") ev.target.parentElement.querySelector("span").textContent = ev.target.checked ? "Ativa" : "Pausada"; });
document.addEventListener("keydown", (ev) => {
  if (ev.target.id === "eKw" && (ev.key === "Enter" || ev.key === ",")) { ev.preventDefault(); readForm(); renderSheet(); $("#eKw").focus(); }
  else if (ev.target.id === "eKw" && ev.key === "Backspace" && !ev.target.value && S.ed?.keywords.length) { readForm(); S.ed.keywords.pop(); renderSheet(); $("#eKw").focus(); }
  if (ev.key === "Escape" && !$("#sheet").hidden) closeSheet();
});
$("#sheet").addEventListener("click", (ev) => { if (ev.target.id === "sheet") closeSheet(); });

if (S.pass) load(); else render();
