import { Request, Response } from "express";
import { storage } from "../storage";
import { getSubscriptionService } from "../services/subscription.service";
import { z } from "zod";

/**
 * Billing Controller
 *
 * Gerencia operações de pagamento e faturamento dos usuários
 * - Criar assinatura (checkout)
 * - Listar faturas
 * - Atualizar cartão de crédito
 * - Ver assinatura atual
 */

// Schema de validação para checkout
const checkoutSchema = z.object({
  planId: z.number(),
  cpfCnpj: z.string().min(11).max(14),
  creditCard: z.object({
    holderName: z.string(),
    number: z.string(),
    expiryMonth: z.string(),
    expiryYear: z.string(),
    ccv: z.string()
  }),
  creditCardHolderInfo: z.object({
    name: z.string(),
    email: z.string().email(),
    cpfCnpj: z.string(),
    postalCode: z.string(),
    addressNumber: z.string(),
    addressComplement: z.string().optional(),
    phone: z.string(),
    mobilePhone: z.string().optional()
  }),
  remoteIp: z.string().optional()
});

/**
 * @swagger
 * /api/billing/checkout:
 *   post:
 *     summary: Criar nova assinatura (checkout)
 *     description: Processa pagamento e cria assinatura recorrente
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *               - cpfCnpj
 *               - creditCard
 *               - creditCardHolderInfo
 *     responses:
 *       201:
 *         description: Assinatura criada com sucesso
 *       400:
 *         description: Dados inválidos ou usuário já possui assinatura
 */
export async function checkout(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Validar dados
    const validatedData = checkoutSchema.parse(req.body);

    // Obter IP do request
    const remoteIp = req.ip || req.headers['x-forwarded-for'] as string || '127.0.0.1';

    // Criar assinatura via SubscriptionService
    const subscriptionService = getSubscriptionService(storage);
    const result = await subscriptionService.createSubscription({
      userId: user.id,
      planId: validatedData.planId,
      creditCard: validatedData.creditCard,
      creditCardHolderInfo: validatedData.creditCardHolderInfo,
      cpfCnpj: validatedData.cpfCnpj,
      remoteIp: validatedData.remoteIp || remoteIp
    });

    res.status(201).json({
      success: result.success,
      message: result.message,
      subscription: result.subscription,
      payment: {
        id: result.payment.id,
        status: result.payment.status,
        amount: result.payment.amount,
        dueDate: result.payment.dueDate,
        invoiceUrl: result.payment.asaasInvoiceUrl
      }
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos", details: error.errors });
    }
    console.error("Error in checkout:", error);
    res.status(500).json({
      error: error.message || "Erro ao processar pagamento",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * @swagger
 * /api/billing/subscription:
 *   get:
 *     summary: Obter assinatura atual do usuário
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dados da assinatura atual
 */
export async function getCurrentSubscription(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const subscription = await storage.getActiveSubscriptionByUserId(user.id);

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        message: "Nenhuma assinatura ativa encontrada"
      });
    }

    // Buscar dados do plano
    const plan = await storage.getSubscriptionPlanById(subscription.planId);

    res.json({
      hasSubscription: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        plan: plan
      }
    });

  } catch (error) {
    console.error("Error fetching current subscription:", error);
    res.status(500).json({ error: "Erro ao buscar assinatura" });
  }
}

/**
 * @swagger
 * /api/billing/invoices:
 *   get:
 *     summary: Listar faturas do usuário
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Lista de faturas
 */
export async function getInvoices(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const payments = await storage.getPaymentTransactionsByUserId(user.id, limit);

    res.json({
      total: payments.length,
      payments: payments.map(p => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        dueDate: p.dueDate,
        confirmedDate: p.confirmedDate,
        invoiceUrl: p.asaasInvoiceUrl,
        description: p.description,
        createdAt: p.createdAt
      }))
    });

  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Erro ao buscar faturas" });
  }
}

/**
 * @swagger
 * /api/billing/invoice/{id}:
 *   get:
 *     summary: Obter detalhes de uma fatura específica
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes da fatura
 */
export async function getInvoiceById(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const invoiceId = parseInt(req.params.id);
    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const payment = await storage.getPaymentTransactionById(invoiceId);

    if (!payment) {
      return res.status(404).json({ error: "Fatura não encontrada" });
    }

    // Verificar se a fatura pertence ao usuário
    if (payment.usuarioId !== user.id) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    res.json(payment);

  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ error: "Erro ao buscar fatura" });
  }
}

/**
 * @swagger
 * /api/billing/cancel:
 *   post:
 *     summary: Cancelar assinatura
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Assinatura cancelada com sucesso
 */
export async function cancelSubscription(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const { reason } = req.body;
    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: "Motivo de cancelamento é obrigatório" });
    }

    // Cancelar via SubscriptionService
    const subscriptionService = getSubscriptionService(storage);
    await subscriptionService.cancelSubscription(user.id, reason);

    res.json({
      success: true,
      message: "Assinatura cancelada com sucesso"
    });

  } catch (error: any) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({
      error: error.message || "Erro ao cancelar assinatura"
    });
  }
}

/**
 * @swagger
 * /api/billing/update-card:
 *   put:
 *     summary: Atualizar cartão de crédito da assinatura
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - creditCard
 *               - creditCardHolderInfo
 *     responses:
 *       200:
 *         description: Cartão atualizado com sucesso
 */
export async function updateCreditCard(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const { creditCard, creditCardHolderInfo } = req.body;

    if (!creditCard || !creditCardHolderInfo) {
      return res.status(400).json({ error: "Dados do cartão são obrigatórios" });
    }

    // Buscar assinatura ativa
    const subscription = await storage.getActiveSubscriptionByUserId(user.id);
    if (!subscription || !subscription.asaasSubscriptionId) {
      return res.status(404).json({ error: "Nenhuma assinatura ativa encontrada" });
    }

    // Atualizar cartão via Asaas
    const { getAsaasService } = await import('../services/asaas.service');
    const asaasService = await getAsaasService();

    const remoteIp = req.ip || req.headers['x-forwarded-for'] as string || '127.0.0.1';

    await asaasService.updateSubscriptionCreditCard(
      subscription.asaasSubscriptionId,
      {
        creditCard,
        creditCardHolderInfo,
        remoteIp
      }
    );

    res.json({
      success: true,
      message: "Cartão de crédito atualizado com sucesso"
    });

  } catch (error: any) {
    console.error("Error updating credit card:", error);
    res.status(500).json({
      error: error.message || "Erro ao atualizar cartão de crédito"
    });
  }
}

/**
 * @swagger
 * /api/billing/payment-history:
 *   get:
 *     summary: Histórico de pagamentos detalhado
 *     tags: [Billing]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Histórico de pagamentos
 */
export async function getPaymentHistory(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const payments = await storage.getPaymentTransactionsByUserId(user.id);

    // Agrupar por status
    const summary = {
      total: payments.length,
      confirmed: payments.filter(p => p.status === 'confirmed').length,
      pending: payments.filter(p => p.status === 'pending').length,
      overdue: payments.filter(p => p.status === 'overdue').length,
      totalPaid: payments
        .filter(p => p.status === 'confirmed')
        .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0)
    };

    res.json({
      summary,
      payments
    });

  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({ error: "Erro ao buscar histórico de pagamentos" });
  }
}

// ============================================
// ADMIN BILLING ROUTES
// ============================================

/**
 * @swagger
 * /api/admin/billing/metrics:
 *   get:
 *     summary: Obter métricas do sistema de pagamento (Admin)
 *     tags: [Admin, Billing]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Métricas de billing
 */
export async function getBillingMetrics(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Buscar todas as assinaturas ativas
    const activeSubscriptions = await storage.getAllActiveSubscriptions();

    // Buscar todos os pagamentos confirmados
    const { db } = await import('../db');
    const { paymentTransactions } = await import('@shared/schema');
    const { sql } = await import('drizzle-orm');

    const payments = await db.select().from(paymentTransactions);

    // Calcular receita total
    const totalRevenue = payments
      .filter(p => p.status === 'confirmed')
      .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

    // Calcular MRR (Monthly Recurring Revenue)
    const plans = await storage.getAllSubscriptionPlans();
    const mrr = activeSubscriptions.reduce((sum, sub) => {
      const plan = plans.find(p => p.id === sub.planId);
      return sum + (plan ? parseFloat(plan.priceMonthly.toString()) : 0);
    }, 0);

    // Calcular taxa de churn (últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { userSubscriptions } = await import('@shared/schema');
    const canceledSubs = await db.select().from(userSubscriptions).where(
      sql`${userSubscriptions.status} = 'canceled'
          AND ${userSubscriptions.canceledAt} >= ${thirtyDaysAgo.toISOString()}`
    );

    const churnRate = activeSubscriptions.length > 0
      ? (canceledSubs.length / (activeSubscriptions.length + canceledSubs.length)) * 100
      : 0;

    // Buscar pagamentos recentes
    const recentPayments = payments
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 10);

    // Buscar nomes dos usuários para os pagamentos
    const { users } = await import('@shared/schema');
    const recentPaymentsWithUsers = await Promise.all(
      recentPayments.map(async (payment) => {
        const user = await storage.getUserById(payment.usuarioId);
        return {
          id: payment.id,
          userName: user?.nome || 'Usuário Desconhecido',
          amount: payment.amount.toString(),
          status: payment.status,
          dueDate: payment.dueDate
        };
      })
    );

    res.json({
      totalActiveSubscriptions: activeSubscriptions.length,
      totalRevenue,
      mrr,
      churnRate: parseFloat(churnRate.toFixed(2)),
      recentPayments: recentPaymentsWithUsers
    });

  } catch (error) {
    console.error("Error fetching billing metrics:", error);
    res.status(500).json({ error: "Erro ao buscar métricas de billing" });
  }
}

/**
 * @swagger
 * /api/admin/subscriptions:
 *   get:
 *     summary: Listar todas as assinaturas (Admin)
 *     tags: [Admin, Billing]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Lista de todas as assinaturas
 */
export async function getAllSubscriptions(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Buscar todas as assinaturas
    const { db } = await import('../db');
    const { userSubscriptions, users, subscriptionPlans } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const subscriptions = await db
      .select({
        id: userSubscriptions.id,
        usuarioId: userSubscriptions.usuarioId,
        userName: users.nome,
        userEmail: users.email,
        planId: userSubscriptions.planId,
        planName: subscriptionPlans.name,
        status: userSubscriptions.status,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        createdAt: userSubscriptions.createdAt
      })
      .from(userSubscriptions)
      .leftJoin(users, eq(userSubscriptions.usuarioId, users.id))
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .orderBy(userSubscriptions.createdAt);

    res.json(subscriptions);

  } catch (error) {
    console.error("Error fetching all subscriptions:", error);
    res.status(500).json({ error: "Erro ao buscar assinaturas" });
  }
}
