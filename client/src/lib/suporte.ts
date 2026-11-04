/** WhatsApp do suporte Tudo Contado (+55 11 93903-3814). */
export const SUPORTE_WHATSAPP = "5511939033814";

/** Link do WhatsApp do suporte com mensagem já preenchida (nome/e-mail quando houver). */
export function linkSuporteWhatsApp(nome?: string | null, email?: string | null): string {
  const partes = ["Olá! Preciso de suporte no Tudo Contado."];
  if (nome) partes.push(`Nome: ${nome}`);
  if (email) partes.push(`E-mail: ${email}`);
  return `https://wa.me/${SUPORTE_WHATSAPP}?text=${encodeURIComponent(partes.join("\n"))}`;
}
