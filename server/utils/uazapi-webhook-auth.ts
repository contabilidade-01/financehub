import type { Request } from "express";
import { timingSafeEqual } from "crypto";

function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Autenticação do webhook. O UazAPI envia o token da instância no body;
 * só aceitamos tokens conhecidos (UAZAPI_TOKEN + UAZAPI_WEBHOOK_TOKENS, separados
 * por vírgula). Se UAZAPI_WEBHOOK_SECRET estiver definido, também exige
 * `?secret=` na URL do webhook ou o header `x-webhook-secret`.
 * Retorna o token validado (usado para responder) ou null.
 */
export function autenticarWebhookUazapi(req: Pick<Request, "query" | "body" | "header">): string | null {
  const segredo = process.env.UAZAPI_WEBHOOK_SECRET || "";
  if (segredo) {
    const recebido = String(req.query.secret || req.header("x-webhook-secret") || "");
    if (!iguaisSeguro(recebido, segredo)) return null;
  }
  const permitidos = [process.env.UAZAPI_TOKEN || "", ...(process.env.UAZAPI_WEBHOOK_TOKENS || "").split(",")]
    .map((t) => t.trim())
    .filter(Boolean);
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token || permitidos.length === 0) return null;
  return permitidos.some((t) => iguaisSeguro(token, t)) ? token : null;
}
