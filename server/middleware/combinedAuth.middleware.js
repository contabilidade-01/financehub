"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combinedAuth = combinedAuth;
const auth_middleware_1 = require("./auth.middleware");
const apiKey_middleware_1 = require("./apiKey.middleware");
/**
 * Middleware que tenta autenticar primeiro via sessão e depois via API Key
 * Permite que endpoints sejam acessados tanto pela interface web quanto por sistemas externos
 */
async function combinedAuth(req, res, next) {
    // Verificar se há API Key
    if (req.headers.apikey) {
        return (0, apiKey_middleware_1.apiKeyAuth)(req, res, next);
    }
    // Se não houver API Key, verificar autenticação por sessão
    return (0, auth_middleware_1.auth)(req, res, next);
}
