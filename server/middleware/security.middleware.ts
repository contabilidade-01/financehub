import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { RequestHandler } from "express";

/**
 * Cabeçalhos de segurança HTTP (helmet).
 * CSP desligada por ora para não quebrar o SPA (Vite/React) e o Swagger;
 * os demais cabeçalhos (HSTS, noSniff, frameguard, etc.) entram normalmente.
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * Limitador para endpoints de autenticação (login/registro), contra força bruta.
 * Aplicado só nas rotas sensíveis — não globalmente — para não afetar o webhook
 * da uazapi nem os webhooks do Asaas.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
});
