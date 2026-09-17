"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startImpersonation = startImpersonation;
exports.stopImpersonation = stopImpersonation;
exports.getImpersonationStatus = getImpersonationStatus;
const storage_1 = require("../storage");
/**
 * Inicia a impersonificação de um usuário
 * Apenas super admins podem usar esta funcionalidade
 */
async function startImpersonation(req, res) {
    try {
        const targetUserId = parseInt(req.params.userId);
        const session = req.session;
        console.log("=== INÍCIO DA IMPERSONIFICAÇÃO ===");
        console.log("Target User ID:", targetUserId);
        console.log("Current User ID:", session.userId);
        // Verificar se já está impersonificando
        if (session.isImpersonating) {
            return res.status(400).json({
                error: "Já está impersonificando um usuário. Pare a impersonificação atual primeiro."
            });
        }
        // Verificar se o admin está tentando impersonificar a si mesmo
        if (session.userId === targetUserId) {
            return res.status(400).json({
                error: "Não é possível impersonificar sua própria conta."
            });
        }
        // Verificar se o usuário alvo existe
        const targetUser = await storage_1.storage.getUserById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                error: "Usuário não encontrado."
            });
        }
        // Verificar se o usuário alvo está ativo
        if (!targetUser.ativo) {
            return res.status(400).json({
                error: "Não é possível impersonificar um usuário inativo."
            });
        }
        // Verificar se o usuário alvo não é outro super admin
        if (targetUser.tipo_usuario === 'super_admin') {
            return res.status(400).json({
                error: "Não é possível impersonificar outro super administrador."
            });
        }
        // Obter dados do admin atual
        const currentAdmin = await storage_1.storage.getUserById(session.userId);
        if (!currentAdmin) {
            return res.status(401).json({
                error: "Administrador atual não encontrado."
            });
        }
        // Configurar sessão de impersonificação
        session.isImpersonating = true;
        session.originalAdminId = currentAdmin.id;
        session.impersonatedUserId = targetUser.id;
        // Salvar registro da sessão de impersonificação no banco
        try {
            await storage_1.storage.createImpersonationSession(currentAdmin.id, targetUser.id);
        }
        catch (error) {
            console.error("Erro ao salvar sessão de impersonificação:", error);
            // Continua mesmo se não conseguir salvar o log
        }
        console.log(`Admin ${currentAdmin.email} iniciou impersonificação de ${targetUser.email}`);
        console.log("===================================");
        // Retornar dados do usuário impersonificado (sem senha)
        const { senha } = targetUser, targetUserWithoutPassword = __rest(targetUser, ["senha"]);
        const { senha: adminPassword } = currentAdmin, adminWithoutPassword = __rest(currentAdmin, ["senha"]);
        res.status(200).json({
            message: "Impersonificação iniciada com sucesso",
            user: Object.assign(Object.assign({}, targetUserWithoutPassword), { isImpersonating: true, originalAdmin: adminWithoutPassword })
        });
    }
    catch (error) {
        console.error("Erro ao iniciar impersonificação:", error);
        res.status(500).json({
            error: "Erro interno ao iniciar impersonificação"
        });
    }
}
/**
 * Para a impersonificação e retorna à conta do admin original
 */
async function stopImpersonation(req, res) {
    try {
        const session = req.session;
        console.log("=== PARAR IMPERSONIFICAÇÃO ===");
        // Verificar se está impersonificando
        if (!session.isImpersonating) {
            return res.status(400).json({
                error: "Não há impersonificação ativa."
            });
        }
        // Obter dados do admin original
        const originalAdmin = await storage_1.storage.getUserById(session.originalAdminId);
        if (!originalAdmin) {
            // Se o admin original não existe mais, fazer logout completo
            req.session.destroy((err) => {
                if (err)
                    console.error("Erro ao destruir sessão:", err);
            });
            return res.status(401).json({
                error: "Administrador original não encontrado. Faça login novamente."
            });
        }
        // Finalizar sessão de impersonificação no banco
        if (session.impersonatedUserId) {
            try {
                const activeSession = await storage_1.storage.getActiveImpersonationSession(session.impersonatedUserId);
                if (activeSession) {
                    await storage_1.storage.endImpersonationSession(activeSession.id);
                }
            }
            catch (error) {
                console.error("Erro ao finalizar sessão de impersonificação:", error);
                // Continua mesmo se não conseguir atualizar o log
            }
        }
        console.log(`Admin ${originalAdmin.email} parou a impersonificação`);
        console.log("==============================");
        // Limpar dados de impersonificação da sessão
        session.isImpersonating = false;
        delete session.originalAdminId;
        delete session.impersonatedUserId;
        // Retornar dados do admin original (sem senha)
        const { senha } = originalAdmin, adminWithoutPassword = __rest(originalAdmin, ["senha"]);
        res.status(200).json({
            message: "Impersonificação finalizada com sucesso",
            user: Object.assign(Object.assign({}, adminWithoutPassword), { isImpersonating: false, originalAdmin: null })
        });
    }
    catch (error) {
        console.error("Erro ao parar impersonificação:", error);
        res.status(500).json({
            error: "Erro interno ao parar impersonificação"
        });
    }
}
/**
 * Retorna o status atual da impersonificação
 */
async function getImpersonationStatus(req, res) {
    try {
        const session = req.session;
        if (!session.isImpersonating) {
            return res.status(200).json({
                isImpersonating: false,
                originalAdmin: null,
                impersonatedUser: null
            });
        }
        // Verificar se a sessão de impersonificação é válida
        const originalAdmin = await storage_1.storage.getUserById(session.originalAdminId);
        const impersonatedUser = await storage_1.storage.getUserById(session.impersonatedUserId);
        if (!originalAdmin || !impersonatedUser) {
            // Sessão inválida, limpar
            session.isImpersonating = false;
            delete session.originalAdminId;
            delete session.impersonatedUserId;
            return res.status(200).json({
                isImpersonating: false,
                originalAdmin: null,
                impersonatedUser: null
            });
        }
        // Remover senhas dos objetos
        const { senha: adminPassword } = originalAdmin, adminWithoutPassword = __rest(originalAdmin, ["senha"]);
        const { senha: userPassword } = impersonatedUser, userWithoutPassword = __rest(impersonatedUser, ["senha"]);
        res.status(200).json({
            isImpersonating: true,
            originalAdmin: adminWithoutPassword,
            impersonatedUser: userWithoutPassword
        });
    }
    catch (error) {
        console.error("Erro ao obter status de impersonificação:", error);
        res.status(500).json({
            error: "Erro interno ao obter status"
        });
    }
}
