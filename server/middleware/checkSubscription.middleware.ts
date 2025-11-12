import { Request, Response, NextFunction } from "express";
import { getSubscriptionService } from "../services/subscription.service";
import { storage } from "../storage";

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
function isExemptRoute(path: string): boolean {
  return EXEMPT_ROUTES.some(route => path.startsWith(route));
}

/**
 * Middleware principal
 */
export async function checkActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;

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

    // Verificar se usuário tem assinatura ativa (campo denormalizado para performance)
    if (user.subscriptionActive === true) {
      return next();
    }

    // Se campo denormalizado indica inativo, fazer double-check no serviço
    const subscriptionService = getSubscriptionService(storage);
    const hasAccess = await subscriptionService.checkUserAccess(user.id);

    if (hasAccess) {
      // Atualizar campo denormalizado se estava dessincronizado
      if (user.subscriptionActive !== true) {
        await storage.updateUser(user.id, { subscriptionActive: true });
      }
      return next();
    }

    // Usuário sem assinatura ativa - bloquear acesso
    return res.status(403).json({
      error: "Assinatura inativa",
      message: "Sua assinatura está inativa. Por favor, atualize sua forma de pagamento para continuar usando o serviço.",
      code: "SUBSCRIPTION_INACTIVE",
      actions: {
        billing: "/billing/settings",
        support: "/support"
      }
    });

  } catch (error) {
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
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Super admin sempre tem acesso
    if (user.tipo_usuario === 'super_admin') {
      return next();
    }

    // Verificar assinatura
    const subscriptionService = getSubscriptionService(storage);
    const hasAccess = await subscriptionService.checkUserAccess(user.id);

    if (!hasAccess) {
      return res.status(403).json({
        error: "Assinatura requerida",
        message: "Este recurso requer uma assinatura ativa.",
        code: "SUBSCRIPTION_REQUIRED"
      });
    }

    next();

  } catch (error) {
    console.error("[requireActiveSubscription] Error:", error);
    res.status(500).json({ error: "Erro ao verificar assinatura" });
  }
}

/**
 * Middleware para verificar se usuário NÃO tem assinatura
 * Útil para página de checkout (evitar múltiplas assinaturas)
 */
export async function requireNoSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Super admin pode fazer checkout para testar
    if (user.tipo_usuario === 'super_admin') {
      return next();
    }

    // Verificar se já tem assinatura ativa
    const activeSubscription = await storage.getActiveSubscriptionByUserId(user.id);

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

  } catch (error) {
    console.error("[requireNoSubscription] Error:", error);
    res.status(500).json({ error: "Erro ao verificar assinatura" });
  }
}
