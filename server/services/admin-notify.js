"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificarAdmin = notificarAdmin;
/**
 * Notificação ao admin — degustação aceita/expirada, assinatura vencida etc.
 *
 * Sempre registra no log ([ALERTA-ADMIN]). Se ADMIN_WHATSAPP estiver
 * configurado (e houver UAZAPI_TOKEN), também envia um WhatsApp para o admin.
 * Sem config, fica só no log — sem quebrar nada.
 */
const uazapi_service_1 = require("./uazapi.service");
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || ""; // ex.: 5511999999999 ou ...@s.whatsapp.net
function toJid(v) {
    if (!v)
        return "";
    if (v.includes("@"))
        return v;
    const digits = v.replace(/\D/g, "");
    return digits ? `${digits}@s.whatsapp.net` : "";
}
async function notificarAdmin(texto) {
    console.log(`[ALERTA-ADMIN] ${texto}`);
    const jid = toJid(ADMIN_WHATSAPP);
    if (!jid || !UAZAPI_TOKEN)
        return; // sem canal configurado → fica só no log
    try {
        await uazapi_service_1.uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, jid, `🔔 *Admin*\n${texto}`);
    }
    catch (e) {
        console.error("[ALERTA-ADMIN] falha ao enviar WhatsApp ao admin:", e === null || e === void 0 ? void 0 : e.message);
    }
}
