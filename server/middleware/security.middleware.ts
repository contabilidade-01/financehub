import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { RequestHandler } from "express";

/**
 * Cabeçalhos de segurança HTTP (helmet).
 * CSP desligada por ora para não quebrar o SPA (Vite/React) e o Swagger;
 * os demais cabeçalhos (HSTS, noSniff, frameguard, etc.) entram normalmente.
 */
const CSP_DIRETIVAS = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // Tailwind/Radix usam estilos inline; fontes/ícones vêm do Google e jsDelivr.
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  connectSrc: ["'self'", "ws:", "wss:"],
  frameSrc: ["'self'", "https://www.asaas.com", "https://sandbox.asaas.com"],
  formAction: ["'self'", "https://www.asaas.com", "https://sandbox.asaas.com"],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  upgradeInsecureRequests: [],
};

/**
 * Cabeçalhos de segurança HTTP (helmet).
 * CSP: ligada em produção. Em desenvolvimento o Vite injeta scripts inline (HMR),
 * então fica desligada. CSP_MODE=report manda só relatórios (rollout seguro);
 * CSP_MODE=off desliga.
 */
const cspModo = (process.env.CSP_MODE || (process.env.NODE_ENV === "production" ? "enforce" : "off")).toLowerCase();
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy:
    cspModo === "off" ? false : { directives: CSP_DIRETIVAS, reportOnly: cspModo === "report" },
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

/** Troca de senha, rotação de token e validação de link de checkout. */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_SENSITIVE_MAX || 15),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});

/** Webhooks de provedores (ex.: Cora): volume legítimo alto, mas com teto contra abuso. */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_WEBHOOK_MAX || 300),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Muitas requisições." },
});
