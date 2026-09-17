"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
const storage_1 = require("../storage");
async function auth(req, res, next) {
    try {
        const session = req.session;
        // Se há impersonificação ativa, usar o usuário impersonificado
        if (session.isImpersonating && session.user) {
            const impersonatedUser = await storage_1.storage.getUserById(session.user.id);
            if (!impersonatedUser) {
                // Usuário impersonificado não existe mais, limpar sessão
                session.isImpersonating = false;
                delete session.user;
                delete session.originalAdmin;
                return res.status(401).json({ error: "Usuário impersonificado não encontrado" });
            }
            req.user = impersonatedUser;
            return next();
        }
        // Check if user ID exists in session
        const userId = session.userId;
        if (!userId) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        // Verify user exists
        const user = await storage_1.storage.getUserById(userId);
        if (!user) {
            // Clear invalid session
            req.session.destroy((err) => {
                if (err) {
                    console.error("Error destroying session:", err);
                }
            });
            return res.status(401).json({ error: "Usuário não encontrado" });
        }
        // Adicionar o usuário à requisição
        req.user = user;
        // User is authenticated, proceed to next middleware
        next();
    }
    catch (error) {
        console.error("Authentication error:", error);
        res.status(500).json({ error: "Erro de autenticação" });
    }
}
