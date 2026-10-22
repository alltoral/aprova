/* Cofre dos acessos às redes sociais dos clientes
   - a senha é criptografada (AES-GCM) antes de ir para o banco
   - o cliente só envia: a página dele nunca recebe a senha de volta
   - só o painel do estúdio (com a senha do painel) revela */

const te = new TextEncoder(), td = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let keyCache = null;
async function vaultKey(db) {
  if (keyCache) return keyCache;
  let raw = await db.get("vault/key", { type: "json" });
  if (!raw) {
    const k = b64(crypto.getRandomValues(new Uint8Array(32)));
    const again = await db.get("vault/key", { type: "json" });
    raw = again || { k };
    if (!again) await db.setJSON("vault/key", raw);
  }
  keyCache = await crypto.subtle.importKey("raw", unb64(raw.k), "AES-GCM", false, ["encrypt", "decrypt"]);
  return keyCache;
}
export async function seal(db, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await vaultKey(db), te.encode(text)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function open(db, box) {
  if (!box?.iv || !box?.ct) return "";
  try { return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, await vaultKey(db), unb64(box.ct))); } catch { return ""; }
}

export const ACCESS_NETS = ["instagram", "facebook", "meta", "tiktok", "linkedin", "youtube", "pinterest", "x", "whatsapp", "google", "site", "outra"];
const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

/* o que a página do cliente pode ver: rede, login e se a senha já foi enviada */
export function accessPublic(a) {
  return (a?.items || []).map((x) => ({ id: x.id, net: x.net, label: x.label || "", login: x.login || "", hasPass: !!x.pass, note: x.note || "", at: x.at, by: x.by }));
}
/* o que o estúdio vê: tudo, com a senha aberta */
export async function accessFull(db, a) {
  return Promise.all((a?.items || []).map(async (x) => ({ ...accessPublic({ items: [x] })[0], pass: await open(db, x.pass), seenAt: x.seenAt || null })));
}
/* grava ou atualiza um acesso; senha vazia mantém a que já estava */
export async function accessSave(db, clientId, body, by, rid) {
  const key = `access/${clientId}`;
  const a = (await db.get(key, { type: "json" })) || { items: [] };
  const net = ACCESS_NETS.includes(body.net) ? body.net : null;
  if (!net) throw new Error("Escolha a rede social");
  const login = clip(body.login, 160), pass = String(body.pass ?? "").slice(0, 300), note = clip(body.note, 400), label = clip(body.label, 60);
  if (!login) throw new Error("Preencha o login (usuário, e-mail ou telefone)");
  let it = body.id ? a.items.find((x) => x.id === body.id) : null;
  if (!it) {
    if (a.items.length >= 30) throw new Error("Limite de acessos atingido. Fale com o estúdio.");
    if (!pass) throw new Error("Preencha a senha");
    it = { id: rid(8) }; a.items.push(it);
  }
  Object.assign(it, { net, label: net === "outra" || net === "site" ? label : "", login, note, at: new Date().toISOString(), by, seenAt: null });
  if (pass) it.pass = await seal(db, pass);
  await db.setJSON(key, a);
  return a;
}
export async function accessDelete(db, clientId, id) {
  const key = `access/${clientId}`;
  const a = (await db.get(key, { type: "json" })) || { items: [] };
  a.items = a.items.filter((x) => x.id !== id);
  await db.setJSON(key, a);
  return a;
}
