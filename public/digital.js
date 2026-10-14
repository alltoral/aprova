/* Produtos digitais: sites, páginas de venda e aplicativos · Aprova All Toral
   O estúdio cadastra a entrega com o link (ou telas), o cliente abre no modo computador ou celular,
   circula o ponto e escreve a consideração. O estúdio responde e marca como resolvido. */

const PTYPES = { site: "Site", landing: "Página de vendas", app: "Aplicativo", sistema: "Sistema" };
const DEV = { desktop: { label: "Computador", w: 1280 }, mobile: { label: "Celular", w: 390, h: 844 } };
const projSt = p => p?.review?.status || "pendente";
const openN = p => (p.notes || []).filter(n => !n.resolved).length;
const visibleProjects = () => (S.projects || []).filter(p => S.isOwner || p.visible !== false);
const projById = id => (S.projects || []).find(p => p.id === id);
const embedTag = () => `<script src="${location.origin}/embed.js" async></script>`;
function applyProject(p) { const i = (S.projects || []).findIndex(x => x.id === p.id); if (i >= 0) S.projects[i] = p; else (S.projects = S.projects || []).unshift(p); }
/* link do repositório do GitHub não mostra o site: sugere o endereço do GitHub Pages */
function ghPages(url) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i.exec(String(url || "").trim());
  if (!m) return "";
  const [, owner, repo] = m;
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${repo.toLowerCase()}/` : `https://${owner.toLowerCase()}.github.io/${repo}/`;
}
const hostOf = u => { try { return new URL(u).host; } catch (e) { return ""; } };

/* pendências que contam no selo do topo do cliente (projetos e guia visual) */
function digitalPending() {
  if (S.isOwner) return 0;
  let n = visibleProjects().filter(p => !p.delivered && ["pendente", "ajustado"].includes(projSt(p))).length;
  if (S.guide && S.guide.visible !== false && ["pendente", "ajustado"].includes(S.guide.review?.status || "pendente")) n++;
  return n;
}

/* ---------- página do cliente de produtos digitais ---------- */
function digitalPage(c) {
  const all = visibleProjects();
  const live = all.filter(p => !p.delivered), done = all.filter(p => p.delivered);
  const cnt = k => live.filter(p => projSt(p) === k).length;
  const notes = live.reduce((t, p) => t + openN(p), 0);
  const link = location.origin + "/c/" + (c.token || "");
  const srv = (c.services || []).map(k => PTYPES[k]).filter(Boolean);
  return bar() + `
  ${S.isOwner ? `<div class="wrap"><button class="back" data-act="home">← Todos os clientes</button></div>` : ""}
  <section class="chero ${S.isOwner ? "" : "chero-client"}" style="margin-top:${S.isOwner ? "14px" : "0"}"><div class="wrap">
    ${avatar(c)}
    <div class="who"><h1 class="display">${esc(c.name)}</h1>${c.handle ? `<span class="handle">${esc(c.handle)}</span>` : srv.length ? `<span class="handle">${esc(srv.join(" · "))}</span>` : ""}</div>
    ${S.isOwner ? `<div class="stats">
      <div class="stat"><b>${cnt("pendente")}</b><span>Aguardando</span></div>
      <div class="stat"><b>${cnt("aprovado")}</b><span>Aprovados</span></div>
      <div class="stat"><b>${cnt("alteracao") + cnt("reprovado")}</b><span>Ajustes</span></div>
      <div class="stat"><b>${notes}</b><span>Considerações</span></div>
    </div>` : `<div class="stats two">
      <div class="stat"><b>${live.length - cnt("aprovado")}</b><span>Aguardando</span></div>
      <div class="stat"><b>${cnt("aprovado")}</b><span>Aprovados</span></div>
    </div>`}
  </div></section>
  <main class="wrap">
    ${S.isOwner ? `<div class="tools"><button class="btn pri" data-act="dp-new">+ Nova entrega</button><button class="btn yel" data-act="guide-edit">${S.guide ? "Editar guia visual" : "+ Guia visual"}</button><button class="btn" data-act="edit-client">Editar cliente</button><span class="sp"></span><button class="btn" data-act="copy-link" data-link="${esc(link)}">Copiar link do cliente</button></div>
      <div class="note-studio">Link do cliente: <code>${esc(link)}</code><br>Quem tiver esse link vê só esta página. Se precisar cortar o acesso, <button class="link ${S.armed === "token" ? "danger" : ""}" data-act="new-token">${S.armed === "token" ? "confirmar: o link antigo para de funcionar" : "gere um link novo"}</button>. Rascunhos ficam visíveis só para você.</div>`
    : `<div class="dp-how"><div><b>Como aprovar</b><ol><li>Abra o projeto e navegue como se fosse o site no ar.</li><li>Toque em <em>Circular e comentar</em>, circule o ponto e escreva o que quer mudar.</li><li>Quando estiver tudo certo, escolha o sticker de aprovado.</li></ol></div><img src="/stickers/larot/bora-aprovar.webp" alt="" width="104" class="dp-how-stk"></div>`}
    ${typeof guideBlock === "function" ? guideBlock(c) : ""}
    <div class="section-h"><h2>${S.isOwner ? "Entregas" : "Seus <em>projetos</em>"}</h2><div class="actions"><span class="eyebrow">${live.length} ${live.length === 1 ? "em aprovação" : "em aprovação"}</span></div></div>
    ${live.length ? `<div class="dp-grid">${live.map(projectCard).join("")}</div>` : `<div class="emptybox"><h3>Nenhum projeto ainda</h3><p>${S.isOwner ? "Cadastre a primeira entrega com o link do site ou do app." : "Assim que o estúdio enviar o site ou o app, ele aparece aqui para você ver e aprovar."}</p>${S.isOwner ? `<button class="btn pri" data-act="dp-new">+ Nova entrega</button>` : ""}</div>`}
    ${done.length ? `<div class="section-h"><h2>Já <em>entregues</em></h2><div class="actions"><span class="eyebrow">${done.length}</span></div></div><div class="dp-grid">${done.map(projectCard).join("")}</div>` : ""}
    <div style="height:48px"></div>
  </main>` + foot();
}
/* clientes com redes sociais e produtos digitais: os projetos entram na mesma página */
function digitalSection(c) {
  const all = visibleProjects(); const live = all.filter(p => !p.delivered), done = all.filter(p => p.delivered);
  if (!S.isOwner && !all.length) return "";
  return `<section class="dp-sec"><div class="section-h"><h2>${S.isOwner ? "Site e <em>apps</em>" : "Seus <em>projetos</em>"}</h2><div class="actions"><span class="eyebrow">${live.length} em aprovação</span>${S.isOwner ? `<button class="btn sm pri" data-act="dp-new">+ Nova entrega</button>` : ""}</div></div>
    ${live.length ? `<div class="dp-grid">${live.map(projectCard).join("")}</div>` : S.isOwner ? `<div class="emptybox"><h3>Nenhuma entrega ainda</h3><p>Cadastre o site ou o app com o link para o cliente ver e circular o que quer mudar.</p></div>` : ""}
    ${done.length ? `<p class="eyebrow" style="margin-top:18px">Já entregues</p><div class="dp-grid">${done.map(projectCard).join("")}</div>` : ""}</section>`;
}
function frameThumb(p) {
  const s = (p.shots || [])[0];
  if (s) return `<img class="dp-thumb-img" src="${blob(s.id)}" alt="" loading="lazy">`;
  const icon = p.type === "app" ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M7 12h6M7 15h4"/></svg>`;
  return `<div class="dp-thumb-ph">${icon}<b>${esc(PTYPES[p.type] || "Site")}</b><span>${esc(hostOf(p.url) || "")}</span><em>Toque para abrir e navegar</em></div>`;
}
function projectCard(p) {
  const st = projSt(p); const n = openN(p);
  return `<button class="dpcard st-${st}" data-act="dp-open" data-id="${p.id}">
    <div class="dp-thumb"><div class="dp-chrome"><i></i><i></i><i></i><span>${esc(hostOf(p.url) || "telas do projeto")}</span></div>${frameThumb(p)}
      ${hasStk(st) ? `<div class="sticker">${sticker(st)}</div>` : st === "ajustado" ? `<div class="sticker"><img src="/stickers/larot/ajuste-feito.webp" alt="Ajuste feito" draggable="false"></div>` : ""}</div>
    <div class="pmeta"><div class="row-badges"><span class="badge">${esc(PTYPES[p.type] || "Site")}</span><span class="badge">Versão ${p.version || 1}</span>${p.visible === false ? `<span class="badge draft">Rascunho</span>` : ""}${p.delivered ? `<span class="pub-tag inline">Entregue</span>` : ""}
      <span class="pill" style="padding:0;color:${st === "pendente" ? "var(--muted)" : st === "alteracao" ? "#8a6d00" : ST[st].color}"><i class="dot" style="background:${ST[st].color}"></i>${ST[st].label}</span></div>
      <div class="t">${esc(p.title)}</div>
      <div class="d"><span>${n ? `${n} ${n === 1 ? "consideração aberta" : "considerações abertas"}` : (p.notes || []).length ? "Considerações resolvidas" : "Sem considerações"}</span></div></div></button>`;
}

/* ---------- editor da entrega (estúdio) ---------- */
function newProject() { return { type: (S.client?.services || [])[0] || "site", title: "", url: "", repo: "", device: "desktop", studioNote: "", shots: [], visible: true }; }
function projectForm() {
  const e = S.editor, d = e.data; const gh = ghPages(d.url);
  const sent = !!e.id && projById(e.id)?.visible !== false;
  return `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="dph" style="max-width:780px">
  <div class="panel-h"><div class="t"><span class="eyebrow">Produto digital</span><h2 id="dph">${e.id ? "Editar entrega" : "Nova entrega"}</h2></div><button class="x" data-act="close" aria-label="Fechar">✕</button></div>
  <div class="form"><div class="fgrid">
    <div class="field full"><span>Tipo</span><div class="netpick">${Object.entries(PTYPES).map(([k, v]) => `<button class="chip" data-act="dp-type" data-k="${k}" aria-pressed="${d.type === k}">${v}</button>`).join("")}</div></div>
    <label class="field full"><span>Nome da entrega</span><input type="text" id="dp-title" data-dp="title" value="${esc(d.title)}" placeholder="Ex.: Página de vendas do curso, Home do site, App de agendamento"></label>
    <label class="field full"><span>Link para o cliente ver</span><input type="url" id="dp-url" data-dp="url" value="${esc(d.url)}" placeholder="https://seu-usuario.github.io/projeto/"><span class="hint">Use o endereço do site no ar: GitHub Pages, Netlify, Vercel ou Cloudflare. O link do repositório (github.com) não mostra o site.</span></label>
    ${gh ? `<div class="field full dp-gh"><span>Esse é o link do repositório</span><p>O GitHub não deixa abrir o repositório dentro de outra página. Se o GitHub Pages estiver ligado, o site fica em <code>${esc(gh)}</code>.</p><button class="btn sm" data-act="dp-use-gh">Usar o link do GitHub Pages</button></div>` : ""}
    <label class="field full"><span>Repositório no GitHub (opcional, só você vê)</span><input type="url" data-dp="repo" value="${esc(d.repo)}" placeholder="https://github.com/alltoral/projeto"></label>
    <div class="field full"><span>Abrir primeiro no</span><div class="netpick">${Object.entries(DEV).map(([k, v]) => `<button class="chip" data-act="dp-dev" data-k="${k}" aria-pressed="${d.device === k}">${v.label}</button>`).join("")}</div><span class="hint">O cliente pode trocar entre computador e celular quando quiser.</span></div>
    <div class="field full"><span>Telas (opcional)</span>
      <div class="dp-shots">${(d.shots || []).map((s, i) => `<div class="dp-shot"><img src="${blob(s.id)}" alt=""><input type="text" data-shot="${i}" value="${esc(s.label)}" placeholder="Nome da tela" aria-label="Nome da tela ${i + 1}"><div class="dp-shot-r"><button class="chip sm" data-act="dp-shot-dev" data-i="${i}">${DEV[s.device]?.label || "Computador"}</button><button class="link danger" data-act="dp-shot-rm" data-i="${i}">Remover</button></div></div>`).join("")}
        <label class="dp-shot add" for="dp-shot-in">${e.uploading ? `Enviando… ${e.progress || 0}%` : "+ Enviar telas"}</label><input class="sr" id="dp-shot-in" type="file" accept="image/png,image/jpeg,image/webp" multiple data-dp-shots ${e.uploading ? "disabled" : ""}></div>
      <span class="hint">Prints da página inteira. O cliente circula direto na imagem, bom para telas de app ou quando o site ainda não está no ar.</span></div>
    <label class="field full"><span>Recado para o cliente</span><textarea rows="3" data-dp="studioNote" placeholder="Ex.: Ainda faltam as fotos finais. Foque no texto e na ordem das seções.">${esc(d.studioNote)}</textarea></label>
    <div class="field full dp-snip"><span>Para os círculos ficarem presos no lugar certo da página</span><p>Cole esta linha no site, antes do <code>&lt;/body&gt;</code>. Ela só funciona quando o site é aberto dentro do Aprova e faz o círculo acompanhar a rolagem.</p><div class="dp-snip-row"><code>${esc(embedTag())}</code><button class="btn sm" data-act="copy-link" data-link="${esc(embedTag())}" data-msg="Linha copiada">Copiar</button></div><span class="hint">Sem ela também funciona: o círculo fica marcado na parte do site que estava na tela.</span></div>
  </div>
  ${e.err ? `<p class="err">${esc(e.err)}</p>` : ""}
  <div class="form-foot">${e.id ? `<button class="btn danger ${S.armed === "dp" ? "armed" : ""}" data-act="dp-del">${S.armed === "dp" ? "Excluir entrega e considerações" : "Excluir"}</button>` : ""}<span class="sp"></span>
    ${sent ? `<button class="btn" data-act="dp-save" data-vis="1" ${S.busy || e.uploading ? "disabled" : ""}>Salvar</button><button class="btn pri" data-act="dp-save" data-vis="1" data-nv="1" ${S.busy || e.uploading ? "disabled" : ""}>Enviar nova versão</button>`
    : `<button class="btn" data-act="dp-save" data-vis="0" ${S.busy || e.uploading ? "disabled" : ""}>Salvar rascunho</button><button class="btn pri" data-act="dp-save" data-vis="1" ${S.busy || e.uploading ? "disabled" : ""}>Enviar para o cliente</button>`}</div>
  ${sent ? `<p class="hint" style="text-align:right;margin:6px 0 0">“Enviar nova versão” avisa o cliente que tem ajuste novo para conferir. “Salvar” só corrige os dados.</p>` : ""}
  </div></div>`;
}
async function saveProject(vis, newVersion) {
  const e = S.editor; const d = { ...e.data, visible: vis, newVersion: !!newVersion };
  if (!String(d.url || "").trim() && !(d.shots || []).length) { e.err = "Coloque o link do site ou envie pelo menos uma tela."; renderSheet(); return; }
  if (ghPages(d.url) && !/github\.io/i.test(d.url)) { e.err = "Esse é o link do repositório. Use o link do GitHub Pages (botão acima) ou o endereço onde o site está no ar."; renderSheet(); return; }
  S.busy = true; renderSheet();
  try {
    const r = e.id ? await api(`/api/admin/clients/${S.clientId}/projects/${e.id}`, { method: "PUT", body: d }) : await api(`/api/admin/clients/${S.clientId}/projects`, { method: "POST", body: d });
    applyProject(r.project); S.busy = false; closeSheet(); render();
    toast(!vis ? "Rascunho salvo" : newVersion ? `Versão ${r.project.version} enviada para o cliente` : e.id ? "Entrega atualizada" : "Entrega enviada para o cliente");
  } catch (err) { S.busy = false; e.err = err.message; renderSheet(); }
}
async function uploadShots(files) {
  const e = S.editor; const list = [...files].filter(f => /^image\//.test(f.type)).slice(0, 20 - (e.data.shots || []).length);
  if (!list.length) { e.err = "Envie imagens (PNG, JPG ou WEBP). O limite é de 20 telas."; renderSheet(); return; }
  e.uploading = true; e.err = ""; renderSheet();
  for (const f of list) {
    try {
      let w = 0, h = 0; try { const bmp = await createImageBitmap(f); w = bmp.width; h = bmp.height; } catch (x) {}
      const r = await uploadOne(f, pc => { if (S.editor === e) { e.progress = pc; renderSheet(); } }, { raw: true });
      e.data.shots = [...(e.data.shots || []), { id: r.id, type: r.type, label: f.name.replace(/\.[^.]+$/, "").slice(0, 60), device: w && h && w < 700 ? "mobile" : "desktop", w, h }];
    } catch (err) { e.err = err.message; }
    if (S.editor === e) renderSheet();
  }
  if (S.editor === e) { e.uploading = false; e.progress = 0; renderSheet(); }
}

/* ---------- visualizador com marcações ---------- */
function openViewer(id, noteId) {
  const p = projById(id); if (!p) return;
  const phone = matchMedia("(max-width:760px)").matches;
  S.open = null;
  S.editor = { kind: "dview", id, device: phone ? "mobile" : (p.device || "desktop"), source: p.url ? "live" : (p.shots[0]?.id || "live"), mark: false, sel: noteId || null, draft: null, helper: false, scroll: null, filter: "open", side: !phone, replyDraft: {}, noteText: "", commentText: "" };
  renderSheet();
}
function curProject() { return S.editor?.kind === "dview" ? projById(S.editor.id) : null; }
function shotsFor(p, dev) { const list = p.shots || []; const m = list.filter(s => s.device === dev); return m.length ? m : list; }

/* o visualizador monta o iframe uma vez só; trocas de painel não recarregam o site */
function dviewSheet(sh) {
  const e = S.editor, p = curProject(); if (!p) { closeSheet(); return; }
  const key = [p.id, e.device, e.source, p.url, p.version].join("|");
  sh.hidden = false; document.body.style.overflow = "hidden";
  sh.setAttribute("style", brandVars(S.client || {})); sh.className = "sheet sheet-dv";
  if (sh.dataset.dv !== key || !sh.querySelector(".dv")) {
    sh.dataset.dv = key; e.helper = false; e.scroll = null;
    sh.innerHTML = dvSkeleton(p);
    const fr = sh.querySelector("#dv-if");
    if (fr) { fr.addEventListener("load", () => { e.loaded = true; try { fr.contentWindow.postMessage({ aprova: "ping" }, "*"); } catch (x) {} dvHint(); }); e.loaded = false; setTimeout(dvHint, 6000); }
    const img = sh.querySelector("#dv-shot-img"); if (img) img.addEventListener("load", () => dvMarks());
  }
  dvHeader(); dvLayout(); dvSide(); dvMarks(); dvToolbar();
}
function dvSkeleton(p) {
  const e = S.editor; const shots = shotsFor(p, e.device);
  const stage = e.source === "live" && p.url
    ? `<div class="dv-fw" id="dv-fw"><iframe id="dv-if" src="${esc(p.url)}" title="${esc(p.title)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads" allow="clipboard-write; fullscreen" referrerpolicy="no-referrer"></iframe></div><div class="dv-ov" id="dv-ov"><div class="dv-marks" id="dv-marks"></div></div><div class="dv-hint" id="dv-hint" hidden></div>`
    : (() => { const s = (p.shots || []).find(x => x.id === e.source) || shots[0]; return s ? `<div class="dv-shot-scroll" id="dv-shot-scroll"><div class="dv-shot ${s.device === "mobile" ? "is-m" : ""}" id="dv-shot"><img id="dv-shot-img" src="${blob(s.id)}" alt="${esc(s.label || "Tela do projeto")}" draggable="false"><div class="dv-ov" id="dv-ov"><div class="dv-marks" id="dv-marks"></div></div></div></div>` : `<div class="emptybox"><h3>Sem telas</h3></div>`; })();
  return `<div class="dv" role="dialog" aria-modal="true" aria-labelledby="dvh">
    <header class="dv-h" id="dv-h"></header>
    <div class="dv-body"><div class="dv-stage ${e.device === "mobile" ? "is-m" : ""}" id="dv-stage">${stage}<div class="dv-tool" id="dv-tool"></div></div>
    <aside class="dv-side" id="dv-side" aria-label="Aprovação e considerações"></aside></div></div>`;
}
function dvHeader() {
  const e = S.editor, p = curProject(), h = $("#dv-h"); if (!h || !p) return;
  const st = projSt(p); const shots = p.shots || [];
  h.innerHTML = `<div class="dv-ttl"><span class="eyebrow">${esc(PTYPES[p.type] || "Site")} · versão ${p.version || 1}</span><h2 id="dvh">${esc(p.title)}</h2></div>
    <div class="seg dv-seg" role="group" aria-label="Ver como">${Object.entries(DEV).map(([k, v]) => `<button data-act="dv-dev" data-k="${k}" aria-pressed="${e.device === k}" title="Ver no ${v.label.toLowerCase()}" aria-label="Ver no ${v.label.toLowerCase()}">${k === "desktop" ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>`}<span>${v.label}</span></button>`).join("")}</div>
    ${shots.length && p.url ? `<label class="dv-src"><span class="sr">Mostrar</span><select id="dv-src"><option value="live" ${e.source === "live" ? "selected" : ""}>Site ao vivo</option>${shots.map(s => `<option value="${esc(s.id)}" ${e.source === s.id ? "selected" : ""}>Tela: ${esc(s.label || "sem nome")}</option>`).join("")}</select></label>`
      : shots.length > 1 ? `<label class="dv-src"><span class="sr">Tela</span><select id="dv-src">${shots.map(s => `<option value="${esc(s.id)}" ${e.source === s.id ? "selected" : ""}>${esc(s.label || "Tela")}</option>`).join("")}</select></label>` : ""}
    ${p.url ? `<a class="btn sm ghost dv-ext" href="${esc(p.url)}" target="_blank" rel="noopener">Abrir em nova aba ↗</a>` : ""}
    ${S.isOwner && (p.notes || []).length ? `<button class="btn sm ghost dv-pdf" data-act="dv-pdf" ${e.pdf ? "disabled" : ""} title="Baixar as considerações em PDF">${e.pdf ? "Gerando…" : "Baixar PDF"}</button>` : ""}
    <span class="pill dv-pill" style="background:${ST[st].color};color:${ST[st].ink}">${ST[st].label}</span>
    <button class="btn sm dv-sidebtn" data-act="dv-side" aria-expanded="${!!e.side}">${openN(p) ? `${openN(p)} ${openN(p) === 1 ? "consideração" : "considerações"}` : "Aprovação"}</button>
    <button class="x" data-act="close" aria-label="Fechar">✕</button>`;
}
/* tamanho do iframe: computador em 1280 px reduzido para caber; celular em 390 × 844 */
function dvLayout() {
  const e = S.editor, stage = $("#dv-stage"), fw = $("#dv-fw"), ov = $("#dv-ov");
  $("#sheet")?.querySelector(".dv")?.classList.toggle("side-open", !!e.side);
  if (!stage || !fw || !ov) return;
  const W0 = stage.clientWidth, H0 = stage.clientHeight; if (!W0 || !H0) return;
  let W, H, s;
  if (e.device === "mobile") {
    if (W0 < 520) { W = W0; H = H0; s = 1; }
    else { W = DEV.mobile.w; H = DEV.mobile.h; s = Math.min(1, (H0 - 24) / H, (W0 - 24) / W); }
  } else { W = DEV.desktop.w; s = Math.min(1, W0 / W); H = Math.round(H0 / s); }
  const left = Math.max(0, (W0 - W * s) / 2), top = e.device === "mobile" && W0 >= 520 ? Math.max(12, (H0 - H * s) / 2) : 0;
  Object.assign(fw.style, { width: W + "px", height: H + "px", transform: `scale(${s})`, left: left + "px", top: top + "px" });
  fw.classList.toggle("phone", e.device === "mobile" && W0 >= 520);
  Object.assign(ov.style, { width: W * s + "px", height: H * s + "px", left: left + "px", top: top + "px" });
  e.box = { W, H, s };
}
function dvHint() {
  const e = S.editor, el = $("#dv-hint"), p = curProject(); if (!el || !p || e?.kind !== "dview") return;
  el.hidden = true;
  if (e.loaded === false) { el.hidden = false; el.innerHTML = `<b>O site está demorando para abrir.</b> Se continuar em branco, o endereço pode não aceitar ser aberto aqui dentro. <a href="${esc(p.url)}" target="_blank" rel="noopener">Abrir em nova aba ↗</a>`; }
}
function dvToolbar() {
  const e = S.editor, el = $("#dv-tool"), p = curProject(); if (!el || !p) return;
  const live = e.source === "live";
  if (S.isOwner) { el.innerHTML = `<span class="dv-tip">${live ? (e.helper ? "Círculos presos na página" : "Círculos marcados na tela visível") : "Marcações nesta tela"} · só o cliente circula</span>`; return; }
  el.innerHTML = `<div class="seg dv-mode" role="group" aria-label="Modo"><button data-act="dv-mode" data-k="0" aria-pressed="${!e.mark}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 2-2 6z"/></svg>Navegar</button><button data-act="dv-mode" data-k="1" aria-pressed="${!!e.mark}"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>Circular e comentar</button></div>
    ${e.mark ? `<span class="dv-tip">${live && !e.helper ? "Arraste para circular. Para rolar o site, volte em Navegar." : "Arraste para circular o ponto ou só toque nele."}</span>` : ""}`;
  $("#dv-ov")?.classList.toggle("marking", !!e.mark);
}
/* posição de cada marcação na tela de agora */
function markRect(n) {
  const e = S.editor, ov = $("#dv-ov"); if (!ov) return null;
  const sh = n.shape || {}; const live = e.source === "live";
  if (sh.mode === "shot") { if (live || sh.shot !== e.source) return null; return { l: sh.x * ov.clientWidth, t: sh.y * ov.clientHeight, w: sh.w * ov.clientWidth, h: sh.h * ov.clientHeight }; }
  if (!live || (n.device || "desktop") !== e.device || !e.box) return null;
  const { W, H, s } = e.box;
  if (sh.mode === "doc") {
    if (!e.helper || !e.scroll) return n.id === e.sel ? { l: sh.x / (sh.vw || W) * W * s, t: Math.min(H * s - 40, 40), w: sh.w * s, h: sh.h * s, approx: true } : null;
    if (sh.path && e.scroll.path && sh.path !== e.scroll.path) return null;
    const k = W / (sh.vw || W);
    return { l: (sh.x * k - e.scroll.sx) * s, t: (sh.y - e.scroll.sy) * s, w: sh.w * k * s, h: sh.h * s };
  }
  if (sh.mode === "view") { if (n.id !== e.sel) return null; return { l: sh.x * W * s, t: sh.y * H * s, w: sh.w * W * s, h: sh.h * H * s, approx: true }; }
  return null;
}
function dvMarks() {
  const e = S.editor, p = curProject(), box = $("#dv-marks"); if (!box || !p) return;
  const notes = (p.notes || []).filter(n => e.filter === "all" || !n.resolved || n.id === e.sel);
  let html = notes.map(n => { const r = markRect(n); if (!r) return "";
    return `<button class="dv-mark ${n.resolved ? "done" : ""} ${n.id === e.sel ? "sel" : ""} ${r.approx ? "approx" : ""}" data-act="dv-note-sel" data-id="${n.id}" style="left:${r.l}px;top:${r.t}px;width:${Math.max(18, r.w)}px;height:${Math.max(18, r.h)}px" aria-label="Consideração ${n.n}: ${esc(n.text.slice(0, 60))}"><span>${n.resolved ? "✓" : n.n}</span></button>`; }).join("");
  if (e.draft) { const d = e.draft.px; html += `<div class="dv-mark draft" style="left:${d.l}px;top:${d.t}px;width:${d.w}px;height:${d.h}px"><span>${(p.notes || []).reduce((m, x) => Math.max(m, x.n || 0), 0) + 1}</span></div>`; }
  box.innerHTML = html;
  dvComposer();
}
function dvComposer() {
  const e = S.editor, ov = $("#dv-ov"); let c = $("#dv-comp");
  if (!e.draft) { c?.remove(); return; }
  if (!c) { c = document.createElement("div"); c.id = "dv-comp"; c.className = "dv-comp"; ov.appendChild(c);
    c.innerHTML = `<label class="field"><span>O que você quer mudar aqui?</span><textarea id="dv-note" rows="3" placeholder="Ex.: trocar essa foto, deixar o botão maior, corrigir o preço"></textarea></label>
      ${S.who ? "" : `<label class="field"><span>Seu nome</span><input type="text" id="who" value="${esc(S.who)}" autocomplete="name" placeholder="Quem está comentando"></label>`}
      <p class="err" id="dv-comp-err" hidden></p>
      <div class="actions"><button class="btn brand" data-act="dv-note-send">Enviar</button><button class="btn ghost" data-act="dv-draft-cancel">Cancelar</button></div>`;
    setTimeout(() => { const t = $("#dv-note"); if (t) { t.value = e.noteText || ""; t.focus({ preventScroll: true }); } }, 20); }
  const d = e.draft.px, W = ov.clientWidth, H = ov.clientHeight, cw = Math.min(300, W - 16);
  let l = d.l + d.w + 12, t = d.t;
  if (l + cw > W - 8) l = d.l - cw - 12;
  if (l < 8) { l = Math.max(8, Math.min(W - cw - 8, d.l)); t = d.t + d.h + 10; }
  t = Math.max(8, Math.min(t, H - 230));
  Object.assign(c.style, { left: l + "px", top: t + "px", width: cw + "px" });
}

/* painel lateral: aprovação, recado e considerações */
function dvSide() {
  const e = S.editor, p = curProject(), el = $("#dv-side"); if (!el || !p) return;
  const keep = el.scrollTop;
  const st = projSt(p); const r = p.review || {};
  const all = (p.notes || []).slice().sort((a, b) => (a.resolved - b.resolved) || (a.n - b.n));
  const openList = all.filter(n => !n.resolved), doneList = all.filter(n => n.resolved);
  const list = e.filter === "done" ? doneList : e.filter === "all" ? all : openList;
  const hist = (r.history || []).filter(h => h.note && (h.kind === "comment" || h.byLabel !== "ALL TORAL" || h.status === "ajustado")).slice().reverse();
  el.innerHTML = `<div class="dv-side-in">
    <section class="dv-rev"><h3>Sua <em>aprovação</em></h3>
      <div class="current"><span class="pill" style="background:${ST[st].color};color:${ST[st].ink}">${ST[st].long}</span>${r.at && st !== "pendente" ? `<span>por ${esc(nameOf(r))} · ${esc(fmtStamp(r.at))}</span>` : ""}</div>
      ${!S.isOwner && st === "ajustado" ? `<p class="adj-note">O estúdio fez os ajustes. Confira e escolha o sticker de novo.</p>` : ""}
      ${S.isOwner ? `<div class="dv-own">${st === "alteracao" || st === "reprovado" ? `<button class="btn pri sm" data-act="dv-adjusted">Marcar como ajustado</button>` : ""}<button class="btn sm" data-act="dp-edit" data-id="${p.id}">Editar / nova versão</button>${hasStk(st) ? `<button class="btn sm ghost" data-act="dv-clear">Tirar sticker</button>` : ""}<button class="btn sm ${p.delivered ? "ghost" : "dark"}" data-act="dv-delivered" data-v="${p.delivered ? 0 : 1}">${p.delivered ? "Desmarcar entregue" : "Marcar como entregue"}</button></div>`
        : `<div class="dv-stks">${DECISIONS.map(s => `<button class="opt" data-act="dv-pick" data-s="${s}" aria-pressed="${st === s}" aria-label="${ST[s].long}" title="${ST[s].long}" ${S.busy ? "disabled" : ""}><span class="mini">${sticker(s)}</span><small>${ST[s].label}</small></button>`).join("")}</div>
        ${openList.length && st !== "aprovado" ? `<p class="hint">Você tem ${openList.length} ${openList.length === 1 ? "consideração aberta" : "considerações abertas"}. O estúdio ajusta e te avisa.</p>` : ""}`}
    </section>
    ${p.studioNote ? `<section><h3>Recado do estúdio</h3><div class="studio-note">${esc(p.studioNote)}</div></section>` : ""}
    <section class="dv-notes"><div class="dv-notes-h"><h3>Considerações</h3><div class="seg sm" role="group"><button data-act="dv-filter" data-k="open" aria-pressed="${e.filter === "open"}">Abertas ${openList.length}</button><button data-act="dv-filter" data-k="done" aria-pressed="${e.filter === "done"}">Resolvidas ${doneList.length}</button></div></div>
      ${!S.isOwner && !e.mark && !all.length ? `<button class="dv-cta" data-act="dv-mode" data-k="1"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg><span><b>Circular e comentar</b><small>Marque o ponto do site que você quer mudar</small></span></button>` : ""}
      ${list.length ? `<ol class="dv-list">${list.map(n => noteItem(n, p)).join("")}</ol>` : all.length ? `<p class="hint">${e.filter === "done" ? "Nenhuma consideração resolvida ainda." : "Nenhuma consideração aberta. 🎉"}</p>` : ""}
    </section>
    <section class="dv-gen"><h3>Comentário geral</h3>
      <textarea id="dv-gen" rows="2" placeholder="${S.isOwner ? "Escreva para o cliente" : "Algo que vale para o projeto todo"}">${esc(e.commentText || "")}</textarea>
      ${!S.isOwner && !S.who ? `<input type="text" id="who" class="dv-who" value="" placeholder="Seu nome" autocomplete="name">` : ""}
      <div class="actions"><button class="btn sm brand" data-act="dv-comment" ${S.busy ? "disabled" : ""}>Enviar</button></div>
      ${hist.length ? `<div class="history">${hist.map(h => `<div class="hi"><i class="dot" style="background:${h.kind === "comment" ? "var(--pink)" : ST[h.status]?.color || "#888"};margin-top:6px"></i><div><div><b>${h.kind === "comment" ? "Comentário" : esc(ST[h.status]?.long || h.status)}</b> · ${esc(nameOf(h))}${h.v ? ` · v${h.v}` : ""}</div><div class="when">${esc(fmtStamp(h.at))}</div>${h.note ? `<p>${esc(h.note)}</p>` : ""}</div></div>`).join("")}</div>` : ""}
    </section></div>`;
  el.scrollTop = keep;
}
function noteItem(n, p) {
  const e = S.editor; const sel = n.id === e.sel;
  const where = n.shape?.mode === "shot" ? `Tela: ${(p.shots || []).find(s => s.id === n.shape.shot)?.label || "imagem"}` : `${DEV[n.device || "desktop"].label}${n.shape?.path && n.shape.path !== "/" ? " · " + n.shape.path.slice(0, 40) : ""}`;
  const canDel = !S.isOwner && n.by === "client" && !(n.replies || []).some(r => r.by === "studio");
  return `<li class="dv-note ${n.resolved ? "done" : ""} ${sel ? "sel" : ""}" id="note-${n.id}">
    <button class="dv-note-main" data-act="dv-note-sel" data-id="${n.id}"><span class="dv-num">${n.resolved ? "✓" : n.n}</span><span class="dv-note-t"><b>${esc(n.byLabel || "Cliente")}</b><small>${esc(fmtStamp(n.at))} · ${esc(where)}${n.v && n.v !== p.version ? ` · versão ${n.v}` : ""}</small><span class="txt">${esc(n.text)}</span></span></button>
    ${(n.replies || []).length ? `<div class="dv-replies">${n.replies.map(r => `<div class="dv-reply ${r.by}"><b>${esc(r.by === "studio" ? "ALL TORAL" : r.byLabel || "Cliente")}</b> <small>${esc(fmtStamp(r.at))}</small><p>${esc(r.text)}</p></div>`).join("")}</div>` : ""}
    ${sel ? `<div class="dv-note-act"><textarea rows="2" data-reply="${n.id}" placeholder="Responder">${esc(e.replyDraft[n.id] || "")}</textarea><div class="actions">
      <button class="btn sm brand" data-act="dv-reply" data-id="${n.id}">Responder</button>
      ${S.isOwner ? `<button class="btn sm ${n.resolved ? "ghost" : "pri"}" data-act="dv-resolve" data-id="${n.id}" data-v="${n.resolved ? 0 : 1}">${n.resolved ? "Reabrir" : "Marcar resolvido"}</button>` : ""}
      ${canDel ? `<button class="link danger" data-act="dv-note-del" data-id="${n.id}">${S.armed === "nd" + n.id ? "Confirmar: apagar" : "Apagar"}</button>` : ""}</div></div>` : ""}
  </li>`;
}

/* desenhar o círculo */
let drawing = null;
document.addEventListener("pointerdown", ev => {
  const e = S.editor; if (e?.kind !== "dview" || !e.mark || S.isOwner) return;
  const ov = ev.target.closest?.("#dv-ov"); if (!ov || ev.target.closest(".dv-comp,.dv-mark:not(.draft)")) return;
  if (e.draft) { e.draft = null; e.noteText = ""; }
  const r = ov.getBoundingClientRect();
  drawing = { ov, r, x0: ev.clientX - r.left, y0: ev.clientY - r.top, id: ev.pointerId };
  try { ov.setPointerCapture(ev.pointerId); } catch (x) {}
  e.draft = { px: { l: drawing.x0, t: drawing.y0, w: 0, h: 0 } }; dvMarks();
  ev.preventDefault();
});
document.addEventListener("pointermove", ev => {
  if (!drawing || ev.pointerId !== drawing.id) return; const e = S.editor; if (!e?.draft) return;
  const x = Math.max(0, Math.min(drawing.r.width, ev.clientX - drawing.r.left)), y = Math.max(0, Math.min(drawing.r.height, ev.clientY - drawing.r.top));
  e.draft.px = { l: Math.min(x, drawing.x0), t: Math.min(y, drawing.y0), w: Math.abs(x - drawing.x0), h: Math.abs(y - drawing.y0) };
  const d = document.querySelector(".dv-mark.draft"); if (d) Object.assign(d.style, { left: e.draft.px.l + "px", top: e.draft.px.t + "px", width: e.draft.px.w + "px", height: e.draft.px.h + "px" });
});
document.addEventListener("pointerup", ev => {
  if (!drawing || ev.pointerId !== drawing.id) return; const e = S.editor; const dr = drawing; drawing = null;
  if (!e?.draft) return;
  const d = e.draft.px;
  if (d.w < 16 && d.h < 16) { const sz = 64; d.l = Math.max(0, dr.x0 - sz / 2); d.t = Math.max(0, dr.y0 - sz / 2); d.w = sz; d.h = sz; }
  d.w = Math.max(d.w, 24); d.h = Math.max(d.h, 24);
  dvMarks();
});
/* converte o círculo da tela para a posição salva */
function draftShape() {
  const e = S.editor, ov = $("#dv-ov"), d = e.draft?.px; if (!d || !ov) return null;
  if (e.source !== "live") return { mode: "shot", shot: e.source, x: d.l / ov.clientWidth, y: d.t / ov.clientHeight, w: d.w / ov.clientWidth, h: d.h / ov.clientHeight };
  const { W, H, s } = e.box || { W: ov.clientWidth, H: ov.clientHeight, s: 1 };
  if (e.helper && e.scroll) return { mode: "doc", x: d.l / s + e.scroll.sx, y: d.t / s + e.scroll.sy, w: d.w / s, h: d.h / s, vw: W, path: e.scroll.path || "" };
  return { mode: "view", x: d.l / (W * s), y: d.t / (H * s), w: d.w / (W * s), h: d.h / (H * s), vw: W };
}
async function sendNote() {
  const e = S.editor, p = curProject(); if (!p || !e.draft || S.busy) return;
  const text = ($("#dv-note")?.value || "").trim(); const err = $("#dv-comp-err");
  if (!text) { if (err) { err.hidden = false; err.textContent = "Escreva o que você quer mudar nesse ponto."; } $("#dv-note")?.focus(); return; }
  const shape = draftShape();
  S.busy = true;
  try {
    const el = shape?.mode === "doc" ? await pickEl(e.draft.px, e.box?.s || 1) : null;
    const r = await api(`/api/c/${S.token}/project-note`, { method: "POST", body: { projectId: p.id, text, shape, el, device: e.device, name: S.who } });
    applyProject(r.project); const last = (r.project.notes || []).at(-1);
    e.draft = null; e.noteText = ""; e.sel = last?.id || null; e.filter = "open"; if (matchMedia("(max-width:760px)").matches) e.side = false;
    toast("Consideração enviada para o estúdio"); render();
  } catch (x) { if (err) { err.hidden = false; err.textContent = x.message; } }
  S.busy = false; if (S.editor === e) { dvHeader(); dvSide(); dvMarks(); }
}
/* pergunta ao ajudante do site qual elemento está no centro do círculo (para o PDF do estúdio) */
const dvPicks = new Map();
function pickEl(d, s) {
  const fr = $("#dv-if"); if (!fr || !d) return Promise.resolve(null);
  const id = Math.random().toString(36).slice(2);
  return new Promise(ok => {
    const t = setTimeout(() => { dvPicks.delete(id); ok(null); }, 700);
    dvPicks.set(id, v => { clearTimeout(t); dvPicks.delete(id); ok(v && typeof v === "object" ? v : null); });
    try { fr.contentWindow.postMessage({ aprova: "pick", id, x: (d.l + d.w / 2) / s, y: (d.t + d.h / 2) / s }, "*"); } catch (x) { clearTimeout(t); ok(null); }
  });
}
async function dvCall(path, body, okMsg) {
  if (S.busy) return; S.busy = true; const e = S.editor;
  try { const r = await api(path, { method: "POST", body }); applyProject(r.project); render(); if (okMsg) toast(okMsg); }
  catch (x) { toast(x.message); }
  S.busy = false; if (S.editor === e && e?.kind === "dview") { dvHeader(); dvSide(); dvMarks(); }
}
function selectNote(id) {
  const e = S.editor, p = curProject(); const n = (p?.notes || []).find(x => x.id === id); if (!n) return;
  e.sel = e.sel === id ? null : id; e.draft = null;
  if (e.sel) {
    const sh = n.shape || {};
    if (sh.mode === "shot" && e.source !== sh.shot) { e.source = sh.shot; e.device = (p.shots || []).find(s => s.id === sh.shot)?.device || e.device; }
    else if (sh.mode !== "shot" && (e.source !== "live" || (n.device || "desktop") !== e.device) && p.url) { e.source = "live"; e.device = n.device || "desktop"; }
  }
  renderSheet();
  if (e.sel) {
    const sh = n.shape || {};
    if (sh.mode === "doc" && e.helper) { try { $("#dv-if")?.contentWindow.postMessage({ aprova: "scrollTo", y: sh.y - 120, smooth: true }, "*"); } catch (x) {} }
    if (sh.mode === "shot") setTimeout(() => { const ov = $("#dv-ov"), sc = $("#dv-shot-scroll"); if (ov && sc) sc.scrollTo({ top: Math.max(0, sh.y * ov.clientHeight - 120), behavior: "smooth" }); }, 80);
    setTimeout(() => document.getElementById("note-" + id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  }
}

/* o site avisa a rolagem pelo ajudante (embed.js) */
window.addEventListener("message", ev => {
  const e = S.editor; if (e?.kind !== "dview") return;
  const fr = $("#dv-if"); if (!fr || ev.source !== fr.contentWindow) return;
  const m = ev.data; if (m && m.aprova === "picked") { dvPicks.get(m.id)?.(m.el); return; }
  if (!m || typeof m !== "object" || (m.aprova !== "hello" && m.aprova !== "scroll")) return;
  const first = !e.helper; e.helper = true; e.loaded = true;
  e.scroll = { sx: +m.sx || 0, sy: +m.sy || 0, path: String(m.path || "").slice(0, 300), dh: +m.dh || 0 };
  $("#dv-hint") && ($("#dv-hint").hidden = true);
  if (first) dvToolbar();
  if (!drawing) dvMarks();
});
/* no modo marcar, a rodinha do mouse ainda rola o site (quando o ajudante está no site) */
document.addEventListener("wheel", ev => {
  const e = S.editor; if (e?.kind !== "dview" || !e.mark || !e.helper || e.source !== "live") return;
  if (!ev.target.closest?.("#dv-ov") || ev.target.closest(".dv-comp")) return;
  ev.preventDefault(); e.draft = null;
  try { $("#dv-if").contentWindow.postMessage({ aprova: "scrollBy", dy: ev.deltaY / (e.box?.s || 1) }, "*"); } catch (x) {}
}, { passive: false });
let dvRsz; window.addEventListener("resize", () => { clearTimeout(dvRsz); dvRsz = setTimeout(() => { if (S.editor?.kind === "dview") { dvLayout(); dvMarks(); } }, 120); });
document.addEventListener("keydown", ev => {
  const e = S.editor; if (e?.kind !== "dview") return;
  if (ev.key === "Escape" && (e.draft || e.mark)) { ev.stopImmediatePropagation(); if (e.draft) { e.draft = null; e.noteText = ""; } else { e.mark = false; dvToolbar(); } dvMarks(); }
}, true);
document.addEventListener("input", ev => {
  const e = S.editor, t = ev.target; if (!e) return;
  if (e.kind === "project") { if (t.dataset.dp) { e.data[t.dataset.dp] = t.value; if (t.dataset.dp === "url") { const had = !!document.querySelector(".dp-gh"); if (had !== !!ghPages(t.value)) { renderSheet(); const u = $("#dp-url"); if (u) { u.focus(); u.setSelectionRange(u.value.length, u.value.length); } } } } if (t.dataset.shot) e.data.shots[Number(t.dataset.shot)].label = t.value; }
  if (e.kind === "dview") { if (t.id === "dv-note") e.noteText = t.value; if (t.id === "dv-gen") e.commentText = t.value; if (t.dataset.reply) e.replyDraft[t.dataset.reply] = t.value; }
});
document.addEventListener("change", ev => {
  const t = ev.target, e = S.editor;
  if (t.matches("[data-dp-shots]") && t.files.length && e?.kind === "project") { const f = [...t.files]; t.value = ""; uploadShots(f); }
  if (t.id === "dv-src" && e?.kind === "dview") { e.source = t.value; e.draft = null; e.sel = null; const p = curProject(); if (t.value !== "live") e.device = (p.shots || []).find(s => s.id === t.value)?.device || e.device; renderSheet(); }
});

/* boas-vindas do cliente de produto digital */
function digitalAfterLoad() {
  if (S.isOwner || S.popDone) return; S.popDone = true;
  if (!S.visits?.welcomed) { S.editor = { kind: "dwelcome", sheetCls: "sheet-c" }; renderSheet(); }
}
function dWelcomeSheet() {
  const c = S.client || {}; const nm = String(c.nickname || c.name || "").trim();
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dwh"><img class="lk m-stk" src="/stickers/larot/bem-vindo.webp" alt="Bem-vindo ao Aprova" draggable="false">
    <h2 id="dwh">Oi${nm ? ", " + esc(nm) : ""}! Aqui você aprova <em>seu projeto</em>.</h2>
    <ol class="steps3"><li><span>1</span>Abra o projeto e navegue no modo computador ou celular.</li><li><span>2</span>Circule o que quer mudar e escreva a consideração.</li><li><span>3</span>Quando estiver tudo certo, dê o sticker de aprovado.</li></ol>
    <button class="btn dark2 wide" data-act="close">Bora começar</button></div>`;
}
function onDigitalClose(e) {
  if (e.kind === "dwelcome" && !S.visits?.welcomed) { S.visits = { ...(S.visits || {}), welcomed: true }; api(`/api/c/${S.token}/welcomed`, { method: "POST" }).catch(() => {}); }
  if (e.kind === "dview") { const sh = $("#sheet"); if (sh) delete sh.dataset.dv; drawing = null; }
}

if (typeof PLAN_SHEETS !== "undefined") Object.assign(PLAN_SHEETS, { project: projectForm, dwelcome: dWelcomeSheet });
const SELF_SHEETS = { dview: dviewSheet };

/* ---------- cliques ---------- */
function digitalClick(a, b) {
  const e = S.editor;
  switch (a) {
    case "dp-new": S.open = null; S.editor = { kind: "project", id: null, data: newProject(), err: "" }; renderSheet(); setTimeout(() => $("#dp-title")?.focus(), 30); break;
    case "dp-edit": { const p = projById(b.dataset.id); if (p) { closeSheet(); S.editor = { kind: "project", id: p.id, data: JSON.parse(JSON.stringify(p)), err: "" }; renderSheet(); } break; }
    case "dp-type": e.data.type = b.dataset.k; renderSheet(); break;
    case "dp-dev": e.data.device = b.dataset.k; renderSheet(); break;
    case "dp-use-gh": e.data.url = ghPages(e.data.url); renderSheet(); break;
    case "dp-shot-rm": e.data.shots.splice(Number(b.dataset.i), 1); renderSheet(); break;
    case "dp-shot-dev": { const s = e.data.shots[Number(b.dataset.i)]; s.device = s.device === "mobile" ? "desktop" : "mobile"; renderSheet(); break; }
    case "dp-save": saveProject(b.dataset.vis === "1", b.dataset.nv === "1"); break;
    case "dp-del": if (S.armed !== "dp") { S.armed = "dp"; renderSheet(); break; }
      api(`/api/admin/clients/${S.clientId}/projects/${e.id}`, { method: "DELETE" }).then(() => { S.projects = S.projects.filter(x => x.id !== e.id); S.armed = null; closeSheet(); render(); toast("Entrega excluída"); }).catch(x => toast(x.message)); break;
    case "dp-open": openViewer(b.dataset.id); break;
    /* visualizador */
    case "dv-dev": if (e.device !== b.dataset.k) { e.device = b.dataset.k; e.draft = null; const p = curProject(); if (e.source !== "live") { const s = shotsFor(p, e.device)[0]; if (s) e.source = s.id; } renderSheet(); } break;
    case "dv-mode": e.mark = b.dataset.k === "1"; e.draft = null; if (e.mark && matchMedia("(max-width:760px)").matches) e.side = false; renderSheet(); if (e.mark) toast("Arraste para circular o ponto"); break;
    case "dv-side": e.side = !e.side; renderSheet(); break;
    case "dv-pdf": notesPdf(); break;
    case "dv-filter": e.filter = b.dataset.k; dvSide(); dvMarks(); break;
    case "dv-note-sel": selectNote(b.dataset.id); break;
    case "dv-note-send": sendNote(); break;
    case "dv-draft-cancel": e.draft = null; e.noteText = ""; dvMarks(); break;
    case "dv-pick": { const p = curProject(); const s = b.dataset.s; if (!p || S.isOwner) break; if (projSt(p) === s && s !== "alteracao") { toast("Esse projeto já está com esse sticker"); break; }
      if (s === "alteracao" && !openN(p) && !(e.commentText || "").trim()) { e.commentText = ""; toast("Conte o que precisa mudar: circule no site ou escreva no comentário geral"); }
      dvCall(`/api/c/${S.token}/project-review`, { projectId: p.id, status: s, name: S.who }, ST[s].long);
      if (s === "aprovado") setTimeout(() => celebrate(), 200); break; }
    case "dv-comment": { const p = curProject(); const note = ($("#dv-gen")?.value || "").trim(); if (!note) { toast("Escreva o comentário"); $("#dv-gen")?.focus(); break; }
      const path = S.isOwner ? `/api/admin/clients/${S.clientId}/projects/${p.id}/comment` : `/api/c/${S.token}/project-comment`;
      e.commentText = ""; dvCall(path, S.isOwner ? { note } : { projectId: p.id, note, name: S.who }, "Comentário enviado"); break; }
    case "dv-reply": { const p = curProject(); const id = b.dataset.id; const text = (e.replyDraft[id] || "").trim(); if (!text) { toast("Escreva a resposta"); break; }
      e.replyDraft[id] = "";
      dvCall(S.isOwner ? `/api/admin/clients/${S.clientId}/projects/${p.id}/notes/${id}/reply` : `/api/c/${S.token}/project-note-reply`, S.isOwner ? { text } : { projectId: p.id, noteId: id, text, name: S.who }, "Resposta enviada"); break; }
    case "dv-resolve": { const p = curProject(); dvCall(`/api/admin/clients/${S.clientId}/projects/${p.id}/notes/${b.dataset.id}/resolve`, { resolved: b.dataset.v === "1" }, b.dataset.v === "1" ? "Marcado como resolvido" : "Consideração reaberta"); break; }
    case "dv-note-del": { const id = b.dataset.id; if (S.armed !== "nd" + id) { S.armed = "nd" + id; dvSide(); break; } S.armed = null; const p = curProject(); e.sel = null; dvCall(`/api/c/${S.token}/project-note-del`, { projectId: p.id, noteId: id }, "Consideração apagada"); break; }
    case "dv-adjusted": { const p = curProject(); dvCall(`/api/admin/clients/${S.clientId}/projects/${p.id}/adjusted`, {}, "Marcado como ajustado"); break; }
    case "dv-clear": { const p = curProject(); dvCall(`/api/admin/clients/${S.clientId}/projects/${p.id}/clear`, {}, "Sticker removido"); break; }
    case "dv-delivered": { const p = curProject(); dvCall(`/api/admin/clients/${S.clientId}/projects/${p.id}/delivered`, { delivered: b.dataset.v === "1" }, b.dataset.v === "1" ? "Marcado como entregue" : "Entrega desmarcada"); break; }
  }
}
/* aprovado: sticker do Larot pulando na tela */
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = document.createElement("div"); el.className = "dv-yay"; el.innerHTML = sticker("aprovado"); document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

/* ---------- PDF das considerações (só o estúdio): para passar os ajustes adiante ---------- */
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "/vendor/jspdf.umd.min.js"; sc.onload = () => ok(window.jspdf); sc.onerror = () => no(new Error("Não deu para carregar o gerador de PDF")); document.head.appendChild(sc); });
}
/* recorte da tela enviada com o círculo desenhado por cima */
async function shotCrop(shot, sh, n) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = blob(shot.id); });
  const W = img.naturalWidth, H = img.naturalHeight;
  const bx = sh.x * W, by = sh.y * H, bw = Math.max(8, sh.w * W), bh = Math.max(8, sh.h * H);
  const pad = Math.max(bw, bh) * 1.1 + Math.min(W, H) * .08;
  const cx = Math.max(0, bx - pad), cy = Math.max(0, by - pad), cw = Math.min(W, bx + bw + pad) - cx, ch = Math.min(H, by + bh + pad) - cy;
  const k = Math.min(1, 900 / cw, 700 / ch), cv = document.createElement("canvas"); cv.width = Math.round(cw * k); cv.height = Math.round(ch * k);
  const ctx = cv.getContext("2d"); ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cv.width, cv.height);
  ctx.strokeStyle = "#e0245e"; ctx.lineWidth = 4; ctx.beginPath();
  ctx.ellipse((bx - cx + bw / 2) * k, (by - cy + bh / 2) * k, bw * k / 2 + 6, bh * k / 2 + 6, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#e0245e"; ctx.beginPath(); ctx.arc((bx - cx) * k + 4, (by - cy) * k + 4, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), (bx - cx) * k + 4, (by - cy) * k + 4);
  return { data: cv.toDataURL("image/jpeg", .85), w: cv.width, h: cv.height };
}
async function notesPdf() {
  const e = S.editor, p = curProject(); if (!p || e.pdf) return;
  e.pdf = true; dvHeader();
  try {
    const { jsPDF } = await loadJsPdf();
    const doc = new jsPDF({ unit: "pt", format: "a4" }); const PW = 595, PH = 842, M = 44, TW = PW - M * 2;
    const clean = t => String(t || "").normalize("NFC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/[^\u0009\u000a\u0020-\u00ff]/g, "");
    let y = M;
    const need = h => { if (y + h > PH - M) { doc.addPage(); y = M; } };
    const text = (t, o = {}) => {
      const size = o.size || 10.5; doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...(o.color || [20, 16, 20]));
      const x = M + (o.indent || 0), lines = doc.splitTextToSize(clean(t), TW - (o.indent || 0)); const lh = size * 1.35;
      lines.forEach(l => { need(lh); doc.text(l, x, y + size); y += lh; }); y += o.after ?? 4;
    };
    const kv = (k, v, indent) => { if (v) text(`${k}: ${v}`, { size: 9.5, color: [90, 80, 88], indent, after: 2 }); };
    const notes = (p.notes || []).slice().sort((a, b) => (a.resolved - b.resolved) || a.n - b.n);
    const open = notes.filter(n => !n.resolved).length;
    /* capa */
    doc.setFillColor(229, 84, 150); doc.rect(0, 0, PW, 8, "F");
    text("ALL TORAL · Aprova", { size: 9, bold: true, color: [194, 50, 122], after: 6 });
    text(`Considerações · ${p.title}`, { size: 20, bold: true, after: 6 });
    text(`${S.client?.name || ""} · ${PTYPES[p.type] || "Site"} · versão ${p.version || 1}`, { size: 11, color: [90, 80, 88], after: 2 });
    if (p.url) text(p.url, { size: 10, color: [194, 50, 122], after: 2 });
    text(`${open} em aberto · ${notes.length - open} resolvidas · gerado em ${fmtStamp(new Date().toISOString())}`, { size: 10, color: [90, 80, 88], after: 14 });
    doc.setDrawColor(240, 214, 228); doc.line(M, y, PW - M, y); y += 16;
    for (const n of notes) {
      const sh = n.shape || {}, el = n.el || {};
      need(90);
      const tag = n.resolved ? "RESOLVIDA" : "EM ABERTO";
      doc.setFillColor(...(n.resolved ? [223, 245, 232] : [253, 227, 239])); doc.roundedRect(M, y, 26, 20, 4, 4, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 16, 20); doc.text(String(n.n), M + 13, y + 14, { align: "center" });
      doc.setFontSize(8.5); doc.setTextColor(...(n.resolved ? [29, 122, 74] : [194, 50, 122])); doc.text(tag, M + 34, y + 9);
      doc.setFont("helvetica", "normal"); doc.setTextColor(90, 80, 88); doc.text(clean(`${n.byLabel || "Cliente"} · ${fmtStamp(n.at)} · versão ${n.v || 1} · ${DEV[n.device]?.label || "Computador"}`), M + 34, y + 19);
      y += 30;
      text(n.text, { size: 11.5, after: 6 });
      if (sh.mode === "doc") {
        kv("Página", sh.path || "/");
        kv("Posição", `${Math.round(sh.x)} px da esquerda, ${Math.round(sh.y)} px do topo da página (círculo de ${Math.round(sh.w)} x ${Math.round(sh.h)} px, tela de ${sh.vw || 1280} px)`);
      } else if (sh.mode === "view") kv("Posição na tela visível", `${Math.round(sh.x * 100)}% da esquerda, ${Math.round(sh.y * 100)}% do topo (tela de ${sh.vw || 1280} px)`);
      else if (sh.mode === "shot") { const shot = (p.shots || []).find(s => s.id === sh.shot); kv("Tela", shot?.label || "Tela enviada"); }
      kv("Seção", el.section); kv("Elemento", el.sel); kv("Texto no elemento", el.text); kv("Imagem", [el.alt, el.src].filter(Boolean).join(" · ")); kv("Link", el.href);
      if (sh.mode === "shot") {
        const shot = (p.shots || []).find(s => s.id === sh.shot);
        if (shot) try { const c = await shotCrop(shot, sh, n.n); const w = Math.min(TW, c.w * .6), h = c.h * w / c.w; need(h + 8); doc.addImage(c.data, "JPEG", M, y + 4, w, h); y += h + 12; } catch (x) { /* sem imagem */ }
      }
      (n.replies || []).forEach(r => text(`${r.by === "studio" ? "ALL TORAL" : r.byLabel || "Cliente"} (${fmtStamp(r.at)}): ${r.text}`, { size: 9.5, color: r.by === "studio" ? [194, 50, 122] : [60, 52, 58], indent: 14, after: 2 }));
      y += 8; need(12); doc.setDrawColor(240, 214, 228); doc.line(M, y, PW - M, y); y += 14;
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 140, 148); doc.text(clean(`${p.title} · página ${i} de ${pages}`), PW - M, PH - 20, { align: "right" }); }
    const slug = String(p.title || "projeto").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    doc.save(`consideracoes-${slug}-v${p.version || 1}.pdf`);
    toast("PDF baixado");
  } catch (x) { toast(x.message || "Não deu para gerar o PDF"); }
  e.pdf = false; if (S.editor === e) dvHeader();
}
