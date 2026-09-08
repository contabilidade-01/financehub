/**
 * Remove HTML/CSS que o WhatsApp Web às vezes cola no payload
 * (ex.: blocos .icon-hover) e que confundem o agente.
 */
export function limparTextoWhatsapp(raw: string): string {
  let t = String(raw || "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/\.icon-hover[\s\S]*?\}/gi, " ");
  t = t.replace(/\{[^}]*icon-hover[^}]*\}/gi, " ");
  t = t.replace(/&nbsp;/gi, " ");
  t = t.replace(/&amp;/gi, "&");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
