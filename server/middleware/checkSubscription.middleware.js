"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkActiveSubscription = checkActiveSubscription;
exports.requireActiveSubscription = requireActiveSubscription;
exports.requireNoSubscription = requireNoSubscription;
const subscription_service_1 = require("../services/subscription.service");
const storage_1 = require("../storage");
/**
 * Middleware: Check Active Subscription
 *
 * Verifica se o usuário possui assinatura ativa antes de acessar endpoints protegidos
 *
 * Exceções:
 * - super_admin: sempre tem acesso
 * - Rotas de billing: para permitir pagamento/atualização
 * - Rotas de subscription: para permitir cancelamento/visualização
 */
// Lista de rotas que NÃO requerem assinatura ativa (whitelist)
const EXEMPT_ROUTES = [
    '/api/billing',
    '/api/subscription',
    '/api/auth',
    '/api/user/profile',
    '/api/webhooks',
    '/api/setup'
];
/**
 * Verificar se rota está na whitelist
 */
function isExemptRoute(path) {
    return EXEMPT_ROUTES.some(route => path.startsWith(route));
}
/**
 * Middleware principal
 */
async function checkActiveSubscription(req, res, next) {
    try {
        const user = req.user;
        // Se não há usuário autenticado, deixar o middleware de auth lidar com isso
        if (!user) {
            return next();
        }
        // Super admin sempre tem acesso
        if (user.tipo_usuario === 'super_admin') {
            return next();
        }
        // Rotas isentas não requerem verificação
        if (isExemptRoute(req.path)) {
            return next();
        }
        // Admin também tem acesso liberado.
        if (user.tipo_usuario === 'admin') {
            return next();
        }
        // Fonte única de verdade: acesso = data de expiração no futuro.
        const venc = user.data_expiracao_assinatura ? new Date(user.data_expiracao_assinatura) : null;
        if (venc && venc.getTime() > Date.now()) {
            return next();
        }
        // Double-check no serviço (recomputa e sincroniza o campo denormalizado).
        const subscriptionService = (0, subscription_service_1.getSubscriptionService)(storage_1.storage);
        const hasAccess = await subscriptionService.checkUserAccess(user.id);
        if (hasAccess) {
            return next();
        }
        // Usuário sem assinatura ativa - bloquear acesso
        return res.status(403).json({
            error: "Assinatura inativa",
            message: "Sua assinatura está inativa. Renove em /subscription/renew para continuar.",
            code: "SUBSCRIPTION_INACTIVE",
            actions: {
                billing: "/subscription/renew",
                support: "/support"
            }
        });
    }
    catch (error) {
        console.error("[checkActiveSubscription] Error:", error);
        // Em caso de erro, permitir acesso (fail-open) para não bloquear usuários por erro técnico
        // Logar o erro para investigação
        next();
    }
}
/**
 * Middleware para endpoints que requerem assinatura OBRIGATORIAMENTE
 * Mais restritivo que o checkActiveSubscription padrão
 */
async function requireActiveSubscription(req, res, next) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        // Super admin sempre tem acesso
        if (user.tipo_usuario === 'super_admin') {
            return next();
        }
        // Verificar assinatura
        const subscriptionService = (0, subscription_service_1.getSubscriptionService)(storage_1.storage);
        const hasAccess = await subscriptionService.checkUserAccess(user.id);
        if (!hasAccess) {
            return res.status(403).json({
                error: "Assinatura requerida",
                message: "Este recurso requer uma assinatura ativa.",
                code: "SUBSCRIPTION_REQUIRED"
            });
        }
        next();
    }
    catch (error) {
        console.error("[requireActiveSubscription] Error:", error);
        res.status(500).json({ error: "Erro ao verificar assinatura" });
    }
}
/**
 * Middleware para verificar se usuário NÃO tem assinatura
 * Útil para página de checkout (evitar múltiplas assinaturas)
 */
async function requireNoSubscription(req, res, next) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        // Super admin pode fazer checkout para testar
        if (user.tipo_usuario === 'super_admin') {
            return next();
        }
        // Verificar se já tem assinatura ativa
        const activeSubscription = await storage_1.storage.getActiveSubscriptionByUserId(user.id);
        if (activeSubscription) {
            return res.status(400).json({
                error: "Assinatura já existe",
                message: "Você já possui uma assinatura ativa.",
                code: "SUBSCRIPTION_EXISTS",
                subscription: {
                    status: activeSubscription.status,
                    currentPeriodEnd: activeSubscription.currentPeriodEnd
                }
            });
        }
        next();
    }
    catch (error) {
        console.error("[requireNoSubscription] Error:", error);
        res.status(500).json({ error: "Erro ao verificar assinatura" });
    }
}
