"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordLimiter = exports.forgotPasswordLimiter = exports.authLimiter = exports.securityHeaders = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
/**
 * Cabeçalhos de segurança HTTP (helmet).
 * CSP desligada por ora para não quebrar o SPA (Vite/React) e o Swagger;
 * os demais cabeçalhos (HSTS, noSniff, frameguard, etc.) entram normalmente.
 */
exports.securityHeaders = (0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
});
/**
 * Limitador para endpoints de autenticação (login/registro), contra força bruta.
 * Aplicado só nas rotas sensíveis — não globalmente — para não afetar o webhook
 * da uazapi nem os webhooks do Asaas.
 */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
});
/** Esqueci minha senha — mais restritivo (envia e-mail). */
exports.forgotPasswordLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || 5),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
/** Redefinir senha com token. */
exports.resetPasswordLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_RESET_PASSWORD_MAX || 20),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
