/* Aprova All Toral · acesso às redes sociais do cliente
   O cliente envia login e senha; a senha vai criptografada e nunca volta para a página dele.
   Só o painel do estúdio revela a senha. */

const AC_NETS = {
  instagram: { name: "Instagram", ab: "IG", bg: "linear-gradient(45deg,#f9ce34,#ee2a7b 55%,#6228d7)" },
  facebook: { name: "Facebook", ab: "f", bg: "#1877f2" },
  meta: { name: "Meta Business", ab: "MB", bg: "#0467df" },
  tiktok: { name: "TikTok", ab: "TT", bg: "#141014" },
  linkedin: { name: "LinkedIn", ab: "in", bg: "#0a66c2" },
  youtube: { name: "YouTube", ab: "YT", bg: "#ff0033" },
  pinterest: { name: "Pinterest", ab: "P", bg: "#e60023" },
  x: { name: "X", ab: "X", bg: "#141014" },
  whatsapp: { name: "WhatsApp Business", ab: "WA", bg: "#25d366" },
  google: { name: "Google / Gmail", ab: "G", bg: "#4285f4" },
  site: { name: "Site / hospedagem", ab: "www", bg: "#e55496" },
  outra: { name: "Outra", ab: "+", bg: "#8a7f88" },
};
const acName = x => (x.net === "outra" || x.net === "site") && x.label ? x.label : AC_NETS[x.net]?.name || x.net;
const acDot = (net, sm) => `<span class="ac-dot ${sm ? "sm" : ""}" style="background:${AC_NETS[net]?.bg || "#888"}" aria-hidden="true">${esc(AC_NETS[net]?.ab || "?")}</span>`;
/* redes que o cliente usa no Aprova vêm primeiro; Meta Business entra junto com Instagram ou Facebook */
function acWanted(c) {
  const n = clientNets(c).filter(k => AC_NETS[k]);
  if ((n.includes("instagram") || n.includes("facebook")) && !n.includes("meta")) n.push("meta");
  return n;
}
const acList = () => S.access || [];
const acHas = net => acList().some(x => x.net === net);

/* ---------- card na página do cliente ---------- */
function accessCard(c) {
  if (S.isOwner || !c || !hasSocial(c)) return "";
  const want = acWanted(c).filter(k => k !== "meta"); const list = acList();
  const missing = want.filter(k => !acHas(k));
  const done = list.length && !missing.length;
  const chips = [...new Set([...want, ...list.map(x => x.net)])].map(k => { const ok = acHas(k); return `<span class="ac-chip ${ok ? "ok" : ""}">${acDot(k, true)}${esc(AC_NETS[k]?.name || k)}<i aria-hidden="true">${ok ? "✓" : ""}</i></span>`; }).join("");
  return `<section class="ac-card ${done ? "done" : ""}">
    <div class="ac-art" aria-hidden="true"><img src="/larot.png" alt="" width="74"><span class="ac-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.4"/></svg></span></div>
    <div class="ac-txt"><span class="eyebrow">${done ? "Tudo certo por aqui" : "Para a gente cuidar do seu perfil"}</span>
      <h2>Acesso às suas <em>redes</em></h2>
      <p>${done ? "Recebemos os acessos. Se trocar alguma senha, atualize aqui para a gente não ficar sem entrar." : "Envie o login e a senha das suas redes. Fica guardado com criptografia e só o nosso time vê."}</p>
      <div class="ac-chips">${chips}</div></div>
    <button class="btn ${done ? "" : "yel"} ac-go" data-act="ac-open">${done ? "Atualizar acessos" : list.length ? `Falta ${missing.length === 1 ? "1 rede" : missing.length + " redes"}` : "Enviar acessos"} →</button>
  </section>`;
}

/* ---------- área do estúdio no painel ---------- */
function accessAdmin(c) {
  if (!S.isOwner || !c) return "";
  const list = acList();
  if (!list.length && !hasSocial(c)) return "";
  const rows = list.map(x => {
    const shown = S.acShow?.has(x.id); const full = S.acFull?.[x.id];
    return `<div class="ac-row">${acDot(x.net)}<div class="ac-r-t"><b>${esc(acName(x))}</b><small>Enviado por ${esc(x.by || "cliente")} · ${esc(fmtStamp(x.at))}</small></div>
      <div class="ac-cred"><span class="ac-k">Login</span><code>${esc(x.login)}</code><button class="link" data-act="ac-copy" data-v="login" data-id="${x.id}">Copiar</button></div>
      <div class="ac-cred"><span class="ac-k">Senha</span><code class="${shown ? "" : "mask"}">${shown && full != null ? esc(full) : "••••••••"}</code><button class="link" data-act="ac-show" data-id="${x.id}">${shown ? "Ocultar" : "Mostrar"}</button><button class="link" data-act="ac-copy" data-v="pass" data-id="${x.id}">Copiar</button></div>
      ${x.note ? `<p class="ac-note">${esc(x.note)}</p>` : ""}
      <div class="ac-r-a"><button class="btn sm ghost" data-act="ac-edit" data-id="${x.id}">Editar</button><button class="link ${S.armed === "ac" + x.id ? "danger" : ""}" data-act="ac-del" data-id="${x.id}">${S.armed === "ac" + x.id ? "Confirmar: apagar" : "Apagar"}</button></div></div>`;
  }).join("");
  const missing = acWanted(c).filter(k => k !== "meta" && !acHas(k));
  return `<section class="ac-sec"><div class="section-h"><h2>Acessos das <em>redes</em></h2><div class="actions"><span class="eyebrow">${list.length ? `${list.length} ${list.length === 1 ? "acesso" : "acessos"}` : "Nenhum ainda"}${missing.length ? ` · falta ${missing.map(k => AC_NETS[k].name).join(", ")}` : ""}</span><button class="btn sm pri" data-act="ac-new">+ Adicionar acesso</button></div></div>
    ${list.length ? `<div class="ac-rows">${rows}</div>` : `<p class="st-empty">O cliente ainda não enviou os acessos. Ele envia pela página dele, no card <b>Acesso às suas redes</b>. Se ele mandar por outro canal, adicione aqui.</p>`}
  </section>`;
}

/* ---------- janela de preencher ---------- */
function accessSheet() {
  const e = S.editor; const c = S.client || {}; const d = e.data; const list = acList();
  const owner = S.isOwner;
  const order = [...acWanted(c), ...Object.keys(AC_NETS).filter(k => !acWanted(c).includes(k))];
  const editing = d.id ? list.find(x => x.id === d.id) : null;
  const form = e.form ? `<div class="ac-form">
      <h3>${editing ? `Atualizar ${esc(acName(editing))}` : "Qual rede?"}</h3>
      ${editing ? "" : `<div class="ac-pick">${order.map(k => `<button class="ac-opt" data-act="ac-net" data-k="${k}" aria-pressed="${d.net === k}">${acDot(k, true)}<span>${esc(AC_NETS[k].name)}</span>${acHas(k) && k !== "outra" ? `<i>✓</i>` : ""}</button>`).join("")}</div>`}
      ${d.net === "outra" || d.net === "site" ? `<label class="field"><span>Nome ${d.net === "site" ? "do serviço (ex.: Hostinger, Wix)" : "da rede ou ferramenta"}</span><input type="text" data-ac="label" value="${esc(d.label || "")}" maxlength="60" autocomplete="off"></label>` : ""}
      <label class="field"><span>Login <small>usuário, e-mail ou telefone</small></span><input type="text" data-ac="login" value="${esc(d.login || "")}" maxlength="160" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${d.net === "instagram" ? "@seuperfil ou e-mail" : "e-mail ou usuário"}"></label>
      <label class="field"><span>Senha ${editing ? "<small>deixe em branco para manter a que já está salva</small>" : ""}</span><div class="ac-pw"><input type="${e.see ? "text" : "password"}" data-ac="pass" value="${esc(d.pass || "")}" maxlength="300" autocomplete="new-password" autocapitalize="none" spellcheck="false" placeholder="${editing ? "•••••••• (salva)" : ""}"><button type="button" class="ac-eye" data-act="ac-see" aria-label="${e.see ? "Esconder senha" : "Mostrar senha"}">${e.see ? "Esconder" : "Ver"}</button></div></label>
      <label class="field"><span>Observação <small>opcional</small></span><textarea data-ac="note" rows="2" maxlength="400" placeholder="Ex.: o código de verificação chega no meu WhatsApp, me avise antes de entrar">${esc(d.note || "")}</textarea></label>
      ${e.err ? `<p class="err">${esc(e.err)}</p>` : ""}
      <div class="ac-acts"><button class="btn pri" data-act="ac-save" ${S.busy ? "disabled" : ""}>${S.busy ? "Salvando…" : editing ? "Salvar alteração" : "Salvar acesso"}</button>${list.length ? `<button class="btn ghost" data-act="ac-back">Voltar</button>` : ""}</div>
    </div>` : "";
  const saved = !e.form ? `<div class="ac-saved">${list.map(x => `<div class="ac-s">${acDot(x.net)}<div><b>${esc(acName(x))}</b><small>${esc(x.login)} · senha ${x.hasPass ? "enviada" : "não enviada"}</small></div><button class="btn sm ghost" data-act="ac-edit" data-id="${x.id}">Atualizar</button>${owner ? "" : `<button class="link ${S.armed === "ac" + x.id ? "danger" : ""}" data-act="ac-del" data-id="${x.id}">${S.armed === "ac" + x.id ? "Confirmar" : "Remover"}</button>`}</div>`).join("")}
      <button class="ac-add" data-act="ac-add"><span>+</span>Adicionar outra rede</button></div>` : "";
  return `<div class="modal ac-modal" role="dialog" aria-modal="true" aria-labelledby="ach">
    <button class="x" data-act="close" aria-label="Fechar">✕</button>
    <div class="ac-mh"><span class="ac-lock big" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.4"/></svg></span>
      <h2 id="ach">Acesso às ${owner ? "redes do cliente" : "suas <em>redes</em>"}</h2>
      <p>${owner ? "Cadastre um acesso que o cliente mandou por outro canal." : "Guardamos com criptografia. Depois de salvar, a senha não aparece mais aqui, nem para você. Só o time do ALL TORAL consegue ver."}</p></div>
    ${saved}${form}
  </div>`;
}
function acOpen(id) {
  const list = acList(); const x = id ? list.find(y => y.id === id) : null;
  const first = !x && !list.length ? acWanted(S.client).find(k => !acHas(k)) || "instagram" : x ? x.net : acWanted(S.client).find(k => k !== "meta" && !acHas(k)) || "";
  S.open = null;
  S.editor = { kind: "access", sheetCls: "sheet-c", form: !!x || !list.length, data: x ? { id: x.id, net: x.net, label: x.label, login: x.login, note: x.note, pass: "" } : { net: first, login: "", pass: "", note: "", label: "" }, see: false, err: "" };
  renderSheet();
  if (S.editor.form) setTimeout(() => document.querySelector('[data-ac="login"]')?.focus({ preventScroll: true }), 40);
}
async function acSave() {
  const e = S.editor, d = e.data; if (S.busy) return;
  if (!d.net) { e.err = "Escolha a rede"; renderSheet(); return; }
  if (!String(d.login || "").trim()) { e.err = "Preencha o login"; renderSheet(); return; }
  if (!d.id && !d.pass) { e.err = "Preencha a senha"; renderSheet(); return; }
  S.busy = true; e.err = ""; renderSheet();
  try {
    const body = { id: d.id || undefined, net: d.net, label: d.label, login: d.login, pass: d.pass || "", note: d.note, name: S.who };
    const r = S.isOwner ? await api(`/api/admin/clients/${S.clientId}/access`, { method: "POST", body }) : await api(`/api/c/${S.token}/access`, { method: "POST", body });
    acApply(r.access);
    d.pass = ""; e.form = false; e.see = false;
    toast(S.isOwner ? "Acesso salvo" : "Acesso enviado com segurança 🔒");
  } catch (x) { e.err = x.message; }
  S.busy = false; if (S.editor === e) renderSheet(); render();
}
function acApply(list) {
  if (S.isOwner) { S.acFull = Object.fromEntries(list.map(x => [x.id, x.pass])); S.access = list.map(({ pass, ...x }) => ({ ...x, hasPass: !!pass })); }
  else S.access = list;
}
async function acFetchFull() {
  const r = await api(`/api/admin/clients/${S.clientId}/access`); acApply(r.access); return S.acFull;
}
async function acCopy(id, what) {
  const x = acList().find(y => y.id === id); if (!x) return;
  let v = x.login;
  if (what === "pass") { if (!S.acFull || !(id in S.acFull)) { try { await acFetchFull(); } catch (e) { toast(e.message); return; } } v = S.acFull[id] || ""; }
  try { await navigator.clipboard.writeText(v); toast(what === "pass" ? "Senha copiada" : "Login copiado"); } catch (e) { toast("Não deu para copiar"); }
}

function accessClick(a, b) {
  const e = S.editor;
  switch (a) {
    case "ac-open": case "ac-new": acOpen(); if (a === "ac-new" && S.editor) { S.editor.form = true; renderSheet(); } break;
    case "ac-edit": acOpen(b.dataset.id); break;
    case "ac-add": e.form = true; e.data = { net: acWanted(S.client).find(k => k !== "meta" && !acHas(k)) || "", login: "", pass: "", note: "", label: "" }; e.err = ""; renderSheet(); break;
    case "ac-back": e.form = false; e.err = ""; renderSheet(); break;
    case "ac-net": e.data.net = b.dataset.k; e.err = ""; renderSheet(); setTimeout(() => document.querySelector('[data-ac="login"]')?.focus({ preventScroll: true }), 30); break;
    case "ac-see": e.see = !e.see; renderSheet(); break;
    case "ac-save": acSave(); break;
    case "ac-show": { const id = b.dataset.id; S.acShow = S.acShow || new Set();
      if (S.acShow.has(id)) { S.acShow.delete(id); render(); break; }
      (S.acFull && id in S.acFull ? Promise.resolve() : acFetchFull()).then(() => { S.acShow.add(id); render(); }).catch(x => toast(x.message)); break; }
    case "ac-copy": acCopy(b.dataset.id, b.dataset.v); break;
    case "ac-del": { const id = b.dataset.id; if (S.armed !== "ac" + id) { S.armed = "ac" + id; S.editor ? renderSheet() : render(); break; } S.armed = null;
      (S.isOwner ? api(`/api/admin/clients/${S.clientId}/access/${id}`, { method: "DELETE" }) : api(`/api/c/${S.token}/access-del`, { method: "POST", body: { id } }))
        .then(r => { acApply(r.access); toast("Acesso apagado"); if (S.editor?.kind === "access") { if (!acList().length) S.editor.form = true; renderSheet(); } render(); }).catch(x => toast(x.message)); break; }
  }
}
document.addEventListener("input", ev => {
  const t = ev.target; if (S.editor?.kind !== "access" || !t.dataset.ac) return;
  S.editor.data[t.dataset.ac] = t.value;
});
document.addEventListener("keydown", ev => {
  if (S.editor?.kind === "access" && ev.key === "Enter" && ev.target.matches?.('[data-ac="login"],[data-ac="pass"],[data-ac="label"]')) { ev.preventDefault(); acSave(); }
});
if (typeof PLAN_SHEETS !== "undefined") PLAN_SHEETS.access = accessSheet;
