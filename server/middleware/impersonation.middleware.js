"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkImpersonation = checkImpersonation;
exports.requireSuperAdmin = requireSuperAdmin;
const storage_1 = require("../storage");
/**
 * Middleware para verificar e gerenciar impersonificação de usuários
 * Este middleware deve ser executado APÓS o middleware de autenticação
 */
async function checkImpersonation(req, res, next) {
    try {
        const session = req.session;
        // Se não está impersonificando, continua normalmente
        if (!session.isImpersonating) {
            return next();
        }
        // Se está impersonificando, verifica se a estrutura da sessão é válida
        if (!session.originalAdmin || !session.user) {
            // Sessão de impersonificação inválida, limpa e retorna erro
            session.isImpersonating = false;
            delete session.originalAdmin;
            delete session.user;
            return res.status(401).json({
                error: "Sessão de impersonificação inválida"
            });
        }
        // Verifica se o admin original ainda existe e é super admin
        const originalAdmin = await storage_1.storage.getUserById(session.originalAdmin.id);
        if (!originalAdmin || originalAdmin.tipo_usuario !== 'super_admin') {
            // Admin não existe mais ou perdeu privilégios
            session.isImpersonating = false;
            delete session.originalAdmin;
            delete session.user;
            return res.status(401).json({
                error: "Administrador original não tem mais permissões"
            });
        }
        // Verifica se o usuário impersonificado ainda existe
        const impersonatedUser = await storage_1.storage.getUserById(session.user.id);
        if (!impersonatedUser) {
            // Usuário impersonificado não existe mais
            session.isImpersonating = false;
            delete session.originalAdmin;
            delete session.user;
            return res.status(401).json({
                error: "Usuário impersonificado não existe mais"
            });
        }
        // Substitui o usuário atual pelo usuário impersonificado
        req.user = impersonatedUser;
        // Adiciona informações sobre a impersonificação ao request
        req.impersonationContext = {
            isImpersonating: true,
            originalAdmin: originalAdmin,
            impersonatedUser: impersonatedUser
        };
        console.log(`=== IMPERSONAÇÃO ATIVA ===`);
        console.log(`Admin: ${originalAdmin.email} (${originalAdmin.nome})`);
        console.log(`Impersonificando: ${impersonatedUser.email} (${impersonatedUser.nome})`);
        console.log(`=============================`);
        next();
    }
    catch (error) {
        console.error("Erro no middleware de impersonificação:", error);
        res.status(500).json({ error: "Erro interno no sistema de impersonificação" });
    }
}
/**
 * Middleware que verifica se o usuário atual é super admin
 * Considera tanto usuários logados diretamente quanto em contexto de impersonificação
 */
async function requireSuperAdmin(req, res, next) {
    try {
        const session = req.session;
        // Se está impersonificando, verifica o admin original
        if (session.isImpersonating && session.originalAdminId) {
            const originalAdmin = await storage_1.storage.getUserById(session.originalAdminId);
            if (!originalAdmin || originalAdmin.tipo_usuario !== 'super_admin') {
                return res.status(403).json({
                    error: "Acesso negado: requer privilégios de super administrador"
                });
            }
            // Adiciona o admin original ao request para uso posterior
            req.originalAdmin = originalAdmin;
            return next();
        }
        // Se não está impersonificando, verifica o usuário atual
        if (!req.user || req.user.tipo_usuario !== 'super_admin') {
            return res.status(403).json({
                error: "Acesso negado: requer privilégios de super administrador"
            });
        }
        next();
    }
    catch (error) {
        console.error("Erro na verificação de super admin:", error);
        res.status(500).json({ error: "Erro na verificação de permissões" });
    }
}
