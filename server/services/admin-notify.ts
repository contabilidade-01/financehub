/**
 * Notificação ao admin — degustação aceita/expirada, assinatura vencida etc.
 *
 * Sempre registra no log ([ALERTA-ADMIN]). Se ADMIN_WHATSAPP estiver
 * configurado (e houver UAZAPI_TOKEN), também envia um WhatsApp para o admin.
 * Sem config, fica só no log — sem quebrar nada.
 */
import { uazapiService } from "./uazapi.service";

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || ""; // ex.: 5511999999999 ou ...@s.whatsapp.net

function toJid(v: string): string {
  if (!v) return "";
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

export async function notificarAdmin(texto: string): Promise<void> {
  console.log(`[ALERTA-ADMIN] ${texto}`);
  const jid = toJid(ADMIN_WHATSAPP);
  if (!jid || !UAZAPI_TOKEN) return; // sem canal configurado → fica só no log
  try {
    await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, jid, `🔔 *Admin*\n${texto}`);
  } catch (e: any) {
    console.error("[ALERTA-ADMIN] falha ao enviar WhatsApp ao admin:", e?.message);
  }
}
