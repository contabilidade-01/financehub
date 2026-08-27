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

/** Esqueci minha senha — mais restritivo (envia e-mail). */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || 5),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});

/** Redefinir senha com token. */
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_RESET_PASSWORD_MAX || 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
