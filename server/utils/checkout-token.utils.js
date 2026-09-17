"use strict";
/**
 * Checkout Token Utilities
 *
 * Utilitário para geração e validação de tokens de checkout externo.
 * O token é um base64 do formato: userId:email
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCheckoutToken = generateCheckoutToken;
exports.decodeCheckoutToken = decodeCheckoutToken;
exports.validateCheckoutToken = validateCheckoutToken;
/**
 * Gera um token de checkout externo
 * @param userId - ID do usuário
 * @param email - Email do usuário
 * @returns Token em formato base64
 */
function generateCheckoutToken(userId, email, ciclo) {
    // Formato: userId:ciclo:email (ciclo opcional — retrocompatível com userId:email)
    const payload = ciclo ? `${userId}:${ciclo}:${email}` : `${userId}:${email}`;
    // base64url evita `/` e `+`, que quebram a URL e a rota do Express
    return Buffer.from(payload).toString('base64url');
}
const CICLOS_VALIDOS = ['mensal', 'trimestral', 'anual'];
/**
 * Decodifica um token de checkout externo
 * @param token - Token em formato base64
 * @returns Objeto com userId e email, ou null se inválido
 */
function normalizeCheckoutToken(token) {
    let t = token.trim();
    try {
        t = decodeURIComponent(t);
    }
    catch (_a) {
        // já estava decodificado
    }
    return t.replace(/-/g, '+').replace(/_/g, '/');
}
function decodeCheckoutToken(token) {
    try {
        const decoded = Buffer.from(normalizeCheckoutToken(token), 'base64').toString('utf-8');
        // Encontra o primeiro ':' para separar userId do resto
        const firstColonIndex = decoded.indexOf(':');
        if (firstColonIndex === -1) {
            return null;
        }
        const userIdStr = decoded.substring(0, firstColonIndex);
        let rest = decoded.substring(firstColonIndex + 1);
        // Segmento opcional de ciclo (userId:ciclo:email). Só extrai se casar com
        // um ciclo válido — assim tokens antigos (userId:email) seguem funcionando.
        let ciclo;
        const secondColon = rest.indexOf(':');
        if (secondColon !== -1) {
            const maybe = rest.substring(0, secondColon);
            if (CICLOS_VALIDOS.includes(maybe)) {
                ciclo = maybe;
                rest = rest.substring(secondColon + 1);
            }
        }
        const email = rest;
        const userId = parseInt(userIdStr, 10);
        // Valida que userId é um número válido
        if (isNaN(userId) || userId <= 0) {
            return null;
        }
        // Valida formato básico de email
        if (!email || !email.includes('@')) {
            return null;
        }
        return { userId, email, ciclo };
    }
    catch (error) {
        // Erro ao decodificar base64 ou processar
        return null;
    }
}
/**
 * Valida um token de checkout externo
 * @param token - Token em formato base64
 * @returns true se o token é válido (formato correto), false caso contrário
 */
function validateCheckoutToken(token) {
    return decodeCheckoutToken(token) !== null;
}
