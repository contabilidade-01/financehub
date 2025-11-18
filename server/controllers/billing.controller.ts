import { Request, Response } from "express";
import { storage } from "../storage";
import { getSubscriptionService } from "../services/subscription.service";
import { z } from "zod";
import { db } from "../db";
import { paymentTransactions, users, userSubscriptions, subscriptionPlans, paymentSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decodeCheckoutToken, validateCheckoutToken } from "../utils/checkout-token.utils";

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
  remoteIp: z.string().optional(),
  checkoutToken: z.string().optional() // Token para checkout externo
});

/**
 * @swagger
 * /api/billing/checkout:
 *   post:
 *     summary: Criar nova assinatura (checkout)
 *     description: Processa pagamento e cria assinatura recorrente. Suporta checkout autenticado (com sessão) ou checkout externo (com checkoutToken).
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
 *             properties:
 *               planId:
 *                 type: number
 *                 description: ID do plano de assinatura
 *                 example: 1
 *               cpfCnpj:
 *                 type: string
 *                 description: CPF ou CNPJ do titular (apenas números)
 *                 example: "12345678901"
 *               creditCard:
 *                 type: object
 *                 required:
 *                   - holderName
 *                   - number
 *                   - expiryMonth
 *                   - expiryYear
 *                   - ccv
 *                 properties:
 *                   holderName:
 *                     type: string
 *                     example: "João Silva"
 *                   number:
 *                     type: string
 *                     example: "4111111111111111"
 *                   expiryMonth:
 *                     type: string
 *                     example: "12"
 *                   expiryYear:
 *                     type: string
 *                     example: "2025"
 *                   ccv:
 *                     type: string
 *                     example: "123"
 *               creditCardHolderInfo:
 *                 type: object
 *                 required:
 *                   - name
 *                   - email
 *                   - cpfCnpj
 *                   - postalCode
 *                   - addressNumber
 *                   - phone
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   cpfCnpj:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   addressNumber:
 *                     type: string
 *                   addressComplement:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   mobilePhone:
 *                     type: string
 *               checkoutToken:
 *                 type: string
 *                 description: Token de checkout externo (base64). Se fornecido, não requer autenticação de sessão.
 *                 example: "MTIzOnVzZXJAZW1haWwuY29t"
 *               remoteIp:
 *                 type: string
 *                 description: IP do cliente (opcional)
 *     responses:
 *       201:
 *         description: Assinatura criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, confirmed]
 *                 waitForWebhook:
 *                   type: boolean
 *                 paymentId:
 *                   type: number
 *       400:
 *         description: Dados inválidos ou usuário já possui assinatura
 *       401:
 *         description: Usuário não autenticado (quando checkoutToken não fornecido)
 */
export async function checkout(req: Request, res: Response) {
  try {
    // Validar dados primeiro
    const validatedData = checkoutSchema.parse(req.body);

    let userId: number;
    let isExternalCheckout = false;

    // Verificar se é checkout externo (com token) ou normal (autenticado)
    if (validatedData.checkoutToken) {
      // Checkout externo: validar token
      isExternalCheckout = true;

      if (!validateCheckoutToken(validatedData.checkoutToken)) {
        return res.status(400).json({ error: "Token de checkout inválido" });
      }

      const decoded = decodeCheckoutToken(validatedData.checkoutToken);
      if (!decoded) {
        return res.status(400).json({ error: "Token de checkout inválido" });
      }

      // Buscar usuário pelo token
      const user = await storage.getUserById(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // Verificar se email corresponde
      if (user.email !== decoded.email) {
        return res.status(400).json({ error: "Token de checkout inválido" });
      }

      // Verificar se usuário já tem assinatura ativa
      const activeSubscription = await storage.getActiveSubscriptionByUserId(user.id);
      if (activeSubscription) {
        return res.status(400).json({ error: "Usuário já possui assinatura ativa" });
      }

      userId = user.id;
    } else {
      // Checkout normal: requer autenticação
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }
      userId = user.id;
    }

    // Obter IP do request
    const remoteIp = req.ip || req.headers['x-forwarded-for'] as string || '127.0.0.1';

    // Criar assinatura via SubscriptionService
    const subscriptionService = getSubscriptionService(storage);
    const result = await subscriptionService.createSubscription({
      userId: userId,
      planId: validatedData.planId,
      creditCard: validatedData.creditCard,
      creditCardHolderInfo: validatedData.creditCardHolderInfo,
      cpfCnpj: validatedData.cpfCnpj,
      remoteIp: validatedData.remoteIp || remoteIp
    });

    // Determinar se deve aguardar webhook
    const isPending = result.payment.status === 'pending';

    res.status(201).json({
      success: result.success,
      message: result.message,
      status: result.payment.status, // 'pending' ou 'confirmed'
      waitForWebhook: isPending, // true se deve aguardar webhook
      paymentId: result.payment.id, // ID interno para correlação
      asaasPaymentId: result.payment.asaasPaymentId, // ID do Asaas (debug)
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
 * /api/billing/checkout/validate/{token}:
 *   get:
 *     summary: Validar token de checkout externo
 *     description: Valida um token de checkout externo e retorna dados do usuário e planos disponíveis. Este endpoint é público e não requer autenticação.
 *     tags: [Billing]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token de checkout externo (base64 do formato userId:email)
 *         example: MTIzOnVzZXJAZW1haWwuY29t
 *     responses:
 *       200:
 *         description: Token válido, retorna dados do usuário e planos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     nome:
 *                       type: string
 *                     email:
 *                       type: string
 *                 plans:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Token inválido ou usuário já possui assinatura
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 hasActiveSubscription:
 *                   type: boolean
 *       404:
 *         description: Usuário não encontrado
 */
export async function validateExternalCheckoutToken(req: Request, res: Response) {
  try {
    const { token } = req.params;

    // Validar formato do token
    if (!token || !validateCheckoutToken(token)) {
      return res.status(400).json({ error: "Token inválido" });
    }

    // Decodificar token
    const decoded = decodeCheckoutToken(token);
    if (!decoded) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const { userId, email } = decoded;

    console.log('[Checkout Validate] Token decoded:', { userId, email });

    // Buscar usuário no banco
    const user = await storage.getUserById(userId);
    console.log('[Checkout Validate] User found:', user ? { id: user.id, email: user.email, ativo: user.ativo } : null);

    if (!user) {
      console.log('[Checkout Validate] ERROR: User not found for ID:', userId);
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Verificar se email corresponde
    if (user.email !== email) {
      return res.status(400).json({ error: "Token inválido" });
    }

    // Verificar se usuário já tem assinatura ativa
    const activeSubscription = await storage.getActiveSubscriptionByUserId(userId);
    if (activeSubscription) {
      return res.status(400).json({
        error: "Usuário já possui assinatura ativa",
        hasActiveSubscription: true
      });
    }

    // Buscar planos disponíveis
    const plans = await storage.getAllSubscriptionPlans();
    const activePlans = plans.filter(p => p.active);

    // Retornar dados do usuário (sem informações sensíveis) e planos
    res.json({
      valid: true,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email
      },
      plans: activePlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        features: plan.features
      }))
    });

  } catch (error: any) {
    console.error("Error validating checkout token:", error);
    res.status(500).json({
      error: "Erro ao validar token",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

/**
 * @swagger
 * /api/admin/payments/search:
 *   get:
 *     summary: Buscar pagamentos (ADMIN ONLY)
 *     tags: [Admin Billing]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Termo de busca (nome, email ou telefone do usuário)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtrar por status do pagamento
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *         description: Filtrar por método de pagamento
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Data inicial (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Data final (YYYY-MM-DD)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Limite de resultados
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset para paginação
 *     responses:
 *       200:
 *         description: Lista de pagamentos encontrados
 *       500:
 *         description: Erro ao buscar pagamentos
 */
export async function searchPayments(req: Request, res: Response) {
  try {
    const {
      q: searchTerm,
      status,
      paymentMethod,
      dateFrom,
      dateTo,
      limit = '50',
      offset = '0'
    } = req.query;

    const payments = await storage.searchPaymentTransactions(
      {
        searchTerm: searchTerm as string,
        status: status as string,
        paymentMethod: paymentMethod as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string
      },
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json(payments);

  } catch (error) {
    console.error("Error searching payments:", error);
    res.status(500).json({ error: "Erro ao buscar pagamentos" });
  }
}

/**
 * @swagger
 * /api/admin/payments/{id}/retry:
 *   post:
 *     summary: Reprocessar pagamento manualmente (ADMIN ONLY)
 *     tags: [Admin Billing]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pagamento
 *     responses:
 *       200:
 *         description: Pagamento reprocessado com sucesso
 *       404:
 *         description: Pagamento não encontrado
 *       500:
 *         description: Erro ao reprocessar pagamento
 */
export async function retryPayment(req: Request, res: Response) {
  try {
    const paymentId = parseInt(req.params.id);

    // Buscar pagamento no banco
    const payment = await storage.getPaymentTransactionById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    // Buscar usuário
    const user = await storage.getUserById(payment.usuarioId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Buscar status atual no Asaas
    const asaasService = await import('../services/asaas.service').then(m => m.getAsaasService());
    const asaasPayment = await asaasService.getPayment(payment.asaasPaymentId);

    console.log(`[Admin] Retrying payment ${payment.id} - Current Asaas status:`, asaasPayment.status);

    // Se o status no Asaas é diferente do nosso banco, sincronizar
    if (asaasPayment.status === 'RECEIVED' || asaasPayment.status === 'CONFIRMED') {
      await storage.updatePaymentTransaction(payment.id, {
        status: 'confirmed',
        confirmedDate: asaasPayment.confirmedDate ? new Date(asaasPayment.confirmedDate) : new Date(),
        metadata: JSON.stringify(asaasPayment)
      });

      return res.json({
        success: true,
        message: "Pagamento já confirmado no Asaas, status sincronizado",
        payment: {
          id: payment.id,
          status: 'confirmed',
          asaasStatus: asaasPayment.status
        }
      });
    }

    // Se ainda está pendente/vencido, incrementar retry count
    if (payment.status === 'pending' || payment.status === 'overdue') {
      const newRetryCount = (payment.retryCount || 0) + 1;

      await storage.updatePaymentTransaction(payment.id, {
        retryCount: newRetryCount,
        metadata: JSON.stringify({
          ...JSON.parse(payment.metadata || '{}'),
          lastRetry: new Date().toISOString(),
          retryBy: 'admin'
        })
      });

      // Enviar notificação ao usuário
      const { broadcastNotification } = await import('../websocket');
      broadcastNotification({
        id: `payment-retry-${payment.id}`,
        type: 'info',
        title: 'Pagamento em Processamento',
        message: `Seu pagamento de R$ ${payment.amount} está sendo reprocessado.`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, [user.id.toString()]);

      return res.json({
        success: true,
        message: "Pagamento marcado para reprocessamento",
        payment: {
          id: payment.id,
          status: payment.status,
          retryCount: newRetryCount,
          asaasStatus: asaasPayment.status
        }
      });
    }

    // Se já está confirmado ou estornado
    res.json({
      success: false,
      message: `Pagamento não pode ser reprocessado. Status atual: ${payment.status}`,
      payment: {
        id: payment.id,
        status: payment.status,
        asaasStatus: asaasPayment.status
      }
    });

  } catch (error: any) {
    console.error("Error retrying payment:", error);
    res.status(500).json({ error: error.message || "Erro ao reprocessar pagamento" });
  }
}

/**
 * @swagger
 * /api/admin/payments/{id}:
 *   get:
 *     summary: Obter detalhes de um pagamento (ADMIN ONLY)
 *     tags: [Admin Billing]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do pagamento
 *     responses:
 *       200:
 *         description: Detalhes do pagamento
 *       404:
 *         description: Pagamento não encontrado
 *       500:
 *         description: Erro ao buscar pagamento
 */
export async function getPaymentDetails(req: Request, res: Response) {
  try {
    const paymentId = parseInt(req.params.id);

    const payments = await storage.searchPaymentTransactions(
      { searchTerm: '' },
      1,
      0
    );

    // Encontrar o pagamento específico
    const paymentResult = await db
      .select({
        id: paymentTransactions.id,
        usuarioId: paymentTransactions.usuarioId,
        userName: users.nome,
        userEmail: users.email,
        userPhone: users.telefone,
        subscriptionId: paymentTransactions.subscriptionId,
        asaasPaymentId: paymentTransactions.asaasPaymentId,
        asaasInvoiceUrl: paymentTransactions.asaasInvoiceUrl,
        amount: paymentTransactions.amount,
        currency: paymentTransactions.currency,
        status: paymentTransactions.status,
        paymentMethod: paymentTransactions.paymentMethod,
        dueDate: paymentTransactions.dueDate,
        confirmedDate: paymentTransactions.confirmedDate,
        description: paymentTransactions.description,
        retryCount: paymentTransactions.retryCount,
        metadata: paymentTransactions.metadata,
        createdAt: paymentTransactions.createdAt,
        updatedAt: paymentTransactions.updatedAt
      })
      .from(paymentTransactions)
      .innerJoin(users, eq(paymentTransactions.usuarioId, users.id))
      .where(eq(paymentTransactions.id, paymentId))
      .limit(1);

    if (paymentResult.length === 0) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    res.json(paymentResult[0]);

  } catch (error) {
    console.error("Error fetching payment details:", error);
    res.status(500).json({ error: "Erro ao buscar detalhes do pagamento" });
  }
}

/**
 * @swagger
 * /api/billing/environment:
 *   get:
 *     summary: Obter ambiente do Asaas (sandbox ou production)
 *     description: Rota pública que retorna se o Asaas está configurado em modo sandbox ou production
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: Ambiente do Asaas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 environment:
 *                   type: string
 *                   enum: [sandbox, production]
 *                 isSandbox:
 *                   type: boolean
 */
export async function getAsaasEnvironment(req: Request, res: Response) {
  try {
    // Buscar configuração do banco
    const settings = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
      .limit(1);

    let environment: 'sandbox' | 'production' = 'sandbox';

    if (settings.length > 0 && settings[0].enabled) {
      environment = settings[0].environment as 'sandbox' | 'production';
    } else {
      // Fallback para variável de ambiente
      environment = (process.env.ASAAS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox';
    }

    res.json({
      environment,
      isSandbox: environment === 'sandbox'
    });

  } catch (error) {
    console.error("Error fetching Asaas environment:", error);
    // Em caso de erro, retornar sandbox como padrão mais seguro
    res.json({
      environment: 'sandbox',
      isSandbox: true
    });
  }
}
