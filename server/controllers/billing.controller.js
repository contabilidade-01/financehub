"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkout = checkout;
exports.validateExternalCheckoutToken = validateExternalCheckoutToken;
exports.createRenewLink = createRenewLink;
exports.getCurrentSubscription = getCurrentSubscription;
exports.getInvoices = getInvoices;
exports.getInvoiceById = getInvoiceById;
exports.cancelSubscription = cancelSubscription;
exports.updateCreditCard = updateCreditCard;
exports.getPaymentHistory = getPaymentHistory;
exports.getBillingMetrics = getBillingMetrics;
exports.getAllSubscriptions = getAllSubscriptions;
exports.searchPayments = searchPayments;
exports.retryPayment = retryPayment;
exports.getPaymentDetails = getPaymentDetails;
exports.getAsaasEnvironment = getAsaasEnvironment;
const storage_1 = require("../storage");
const subscription_service_1 = require("../services/subscription.service");
const zod_1 = require("zod");
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const checkout_token_utils_1 = require("../utils/checkout-token.utils");
/**
 * Billing Controller
 *
 * Gerencia operações de pagamento e faturamento dos usuários
 * - Criar assinatura (checkout)
 * - Listar faturas
 * - Atualizar cartão de crédito
 * - Ver assinatura atual
 */
// Schema de validação para checkout (hosted Asaas — sem cartão no nosso site).
// CARTÃO NO SITE: para religar, descomente creditCard + creditCardHolderInfo
// (obrigatórios) e volte o createSubscription no handler checkout().
const checkoutSchema = zod_1.z.object({
    planId: zod_1.z.number(),
    cpfCnpj: zod_1.z.string().min(11).max(14),
    // creditCard: z.object({
    //   holderName: z.string(),
    //   number: z.string(),
    //   expiryMonth: z.string(),
    //   expiryYear: z.string(),
    //   ccv: z.string()
    // }),
    // creditCardHolderInfo: z.object({
    //   name: z.string(),
    //   email: z.string().email(),
    //   cpfCnpj: z.string(),
    //   postalCode: z.string(),
    //   addressNumber: z.string(),
    //   addressComplement: z.string().optional(),
    //   phone: z.string(),
    //   mobilePhone: z.string().optional()
    // }),
    remoteIp: zod_1.z.string().optional(),
    checkoutToken: zod_1.z.string().optional(), // Token para checkout externo
    ciclo: zod_1.z.enum(['mensal', 'trimestral', 'anual']).optional() // ciclo da assinatura
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
async function checkout(req, res) {
    var _a;
    try {
        // Validar dados primeiro
        const validatedData = checkoutSchema.parse(req.body);
        let userId;
        let isExternalCheckout = false;
        let ciclo = validatedData.ciclo;
        // Verificar se é checkout externo (com token) ou normal (autenticado)
        if (validatedData.checkoutToken) {
            // Checkout externo: validar token
            isExternalCheckout = true;
            if (!(0, checkout_token_utils_1.validateCheckoutToken)(validatedData.checkoutToken)) {
                return res.status(400).json({ error: "Token de checkout inválido" });
            }
            const decoded = (0, checkout_token_utils_1.decodeCheckoutToken)(validatedData.checkoutToken);
            if (!decoded) {
                return res.status(400).json({ error: "Token de checkout inválido" });
            }
            // Buscar usuário pelo token
            const user = await storage_1.storage.getUserById(decoded.userId);
            if (!user) {
                return res.status(404).json({ error: "Usuário não encontrado" });
            }
            // Verificar se email corresponde
            if (user.email !== decoded.email) {
                return res.status(400).json({ error: "Token de checkout inválido" });
            }
            // Verificar se usuário já tem assinatura ativa
            const activeSubscription = await storage_1.storage.getActiveSubscriptionByUserId(user.id);
            if (activeSubscription) {
                return res.status(400).json({ error: "Usuário já possui assinatura ativa" });
            }
            userId = user.id;
            if (decoded.ciclo)
                ciclo = decoded.ciclo; // ciclo veio no link gerado pelo admin
        }
        else {
            // Checkout normal: requer autenticação
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: "Usuário não autenticado" });
            }
            userId = user.id;
        }
        // CARTÃO NO SITE DESLIGADO: não aceitamos dados de cartão neste endpoint.
        // O cliente paga na página do Asaas (Pix / boleto / cartão lá).
        if ((_a = req.body) === null || _a === void 0 ? void 0 : _a.creditCard) {
            return res.status(400).json({
                error: "Não coletamos cartão neste site. O pagamento é feito na página do Asaas."
            });
        }
        // Quem manda no preço é o TIPO do usuário (createHostedCheckout resolve).
        // Se o cliente enviou um planId, ele tem que ser do tipo dele — senão veria
        // um valor na tela e seria cobrado outro. Recusa em vez de cobrar calado.
        if (validatedData.planId) {
            const usuario = await storage_1.storage.getUserById(userId);
            const ativos = (await storage_1.storage.getActiveSubscriptionPlans()).filter((p) => p.active !== false);
            const permitidos = (0, storage_1.filtrarPlanosPorTipo)(ativos, usuario === null || usuario === void 0 ? void 0 : usuario.tipo_pessoa);
            if (permitidos.length && !permitidos.some((p) => p.id === validatedData.planId)) {
                return res.status(400).json({
                    error: "Plano indisponível para o seu tipo de cadastro (Pessoa Física / Jurídica).",
                });
            }
        }
        const hosted = await (0, subscription_service_1.getSubscriptionService)(storage_1.storage).createHostedCheckout(userId, (ciclo || 'mensal'), validatedData.cpfCnpj);
        return res.status(201).json({
            success: true,
            message: "Redirecionando para o Asaas",
            url: hosted.url,
            ciclo: hosted.ciclo,
        });
        /* CARTÃO NO SITE — descomente este bloco (e o schema creditCard) para religar:
        const remoteIp = req.ip || req.headers['x-forwarded-for'] as string || '127.0.0.1';
        const subscriptionService = getSubscriptionService(storage);
        const result = await subscriptionService.createSubscription({
          userId: userId,
          planId: validatedData.planId,
          creditCard: validatedData.creditCard,
          creditCardHolderInfo: validatedData.creditCardHolderInfo,
          cpfCnpj: validatedData.cpfCnpj,
          remoteIp: validatedData.remoteIp || remoteIp,
          ciclo: (ciclo as any) || undefined
        });
        const isPending = result.payment.status === 'pending';
        res.status(201).json({
          success: result.success,
          message: result.message,
          status: result.payment.status,
          waitForWebhook: isPending,
          paymentId: result.payment.id,
          asaasPaymentId: result.payment.asaasPaymentId,
          subscription: result.subscription,
          payment: {
            id: result.payment.id,
            status: result.payment.status,
            amount: result.payment.amount,
            dueDate: result.payment.dueDate,
            invoiceUrl: result.payment.asaasInvoiceUrl
          }
        });
        */
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
async function validateExternalCheckoutToken(req, res) {
    try {
        const token = String(req.query.token || req.params.token || '');
        // Validar formato do token
        if (!token || !(0, checkout_token_utils_1.validateCheckoutToken)(token)) {
            return res.status(400).json({ error: "Token inválido" });
        }
        // Decodificar token
        const decoded = (0, checkout_token_utils_1.decodeCheckoutToken)(token);
        if (!decoded) {
            return res.status(400).json({ error: "Token inválido" });
        }
        const { userId, email } = decoded;
        console.log('[Checkout Validate] Token decoded:', { userId, email });
        // Buscar usuário no banco
        const user = await storage_1.storage.getUserById(userId);
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
        let activeSubscription;
        try {
            activeSubscription = await storage_1.storage.getActiveSubscriptionByUserId(userId);
        }
        catch (subErr) {
            console.warn('[Checkout Validate] Falha ao checar assinatura (seguindo):', subErr === null || subErr === void 0 ? void 0 : subErr.message);
            activeSubscription = undefined;
        }
        if (activeSubscription) {
            return res.status(400).json({
                error: "Usuário já possui assinatura ativa",
                hasActiveSubscription: true
            });
        }
        // Buscar planos disponíveis
        let plans = [];
        try {
            plans = await storage_1.storage.getAllSubscriptionPlans();
        }
        catch (planErr) {
            console.error('[Checkout Validate] Falha ao buscar planos:', planErr === null || planErr === void 0 ? void 0 : planErr.message);
            return res.status(500).json({ error: "Erro ao validar token" });
        }
        // Só o plano do TIPO deste usuário: PF nunca vê o preço de PJ e vice-versa.
        // O token já identifica quem é, e a cobrança sai por este mesmo critério
        // (createHostedCheckout) — o preço mostrado tem que ser o preço cobrado.
        const activePlans = (0, storage_1.filtrarPlanosPorTipo)(plans.filter((p) => p.active), user.tipo_pessoa);
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
    }
    catch (error) {
        console.error("Error validating checkout token:", error);
        res.status(500).json({
            error: "Erro ao validar token",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
/**
 * POST /api/billing/renew-link
 * Mesma ação do admin "Gerar link de cobrança", para o usuário logado.
 * Abre a página do Asaas com os dados que já temos.
 */
async function createRenewLink(req, res) {
    var _a, _b;
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        const cicloBody = (_a = req.body) === null || _a === void 0 ? void 0 : _a.ciclo;
        const ciclo = (['mensal', 'trimestral', 'anual'].includes(cicloBody) ? cicloBody : null)
            || user.ciclo_assinatura
            || 'mensal';
        const result = await (0, subscription_service_1.getSubscriptionService)(storage_1.storage).createHostedCheckout(user.id, ciclo, (_b = req.body) === null || _b === void 0 ? void 0 : _b.cpfCnpj);
        return res.json(result);
    }
    catch (err) {
        console.error("createRenewLink:", err);
        return res.status(400).json({ error: (err === null || err === void 0 ? void 0 : err.message) || "Falha ao gerar cobrança" });
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
async function getCurrentSubscription(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        const subscription = await storage_1.storage.getActiveSubscriptionByUserId(user.id);
        if (!subscription) {
            return res.json({
                hasSubscription: false,
                message: "Nenhuma assinatura ativa encontrada"
            });
        }
        // Buscar dados do plano
        const plan = await storage_1.storage.getSubscriptionPlanById(subscription.planId);
        res.json({
            hasSubscription: true,
            subscription: {
                id: subscription.id,
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                gracePeriodEndsAt: subscription.gracePeriodEndsAt,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                plan: plan
            }
        });
    }
    catch (error) {
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
async function getInvoices(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        const limit = parseInt(req.query.limit) || 50;
        const payments = await storage_1.storage.getPaymentTransactionsByUserId(user.id, limit);
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
    }
    catch (error) {
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
async function getInvoiceById(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        const invoiceId = parseInt(req.params.id);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const payment = await storage_1.storage.getPaymentTransactionById(invoiceId);
        if (!payment) {
            return res.status(404).json({ error: "Fatura não encontrada" });
        }
        // Verificar se a fatura pertence ao usuário
        if (payment.usuarioId !== user.id) {
            return res.status(403).json({ error: "Acesso negado" });
        }
        res.json(payment);
    }
    catch (error) {
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
async function cancelSubscription(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        const { reason } = req.body;
        if (!reason || typeof reason !== 'string') {
            return res.status(400).json({ error: "Motivo de cancelamento é obrigatório" });
        }
        // Cancelar via SubscriptionService
        const subscriptionService = (0, subscription_service_1.getSubscriptionService)(storage_1.storage);
        await subscriptionService.cancelSubscription(user.id, reason);
        res.json({
            success: true,
            message: "Assinatura cancelada com sucesso"
        });
    }
    catch (error) {
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
async function updateCreditCard(req, res) {
    // CARTÃO NO SITE DESLIGADO — descomente o bloco abaixo para religar
    // a atualização de cartão pelo nosso formulário.
    return res.status(400).json({
        error: "Atualização de cartão neste site está desativada. Altere o pagamento na página do Asaas."
    });
    /* CARTÃO NO SITE — descomente para religar:
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
    */
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
async function getPaymentHistory(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        const payments = await storage_1.storage.getPaymentTransactionsByUserId(user.id);
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
    }
    catch (error) {
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
async function getBillingMetrics(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Buscar todas as assinaturas ativas
        const activeSubscriptions = await storage_1.storage.getAllActiveSubscriptions();
        // Buscar todos os pagamentos confirmados
        const { db } = await Promise.resolve().then(() => __importStar(require('../db')));
        const { paymentTransactions } = await Promise.resolve().then(() => __importStar(require("../../shared/schema")));
        const { sql } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const payments = await db.select().from(paymentTransactions);
        // Calcular receita total
        const totalRevenue = payments
            .filter(p => p.status === 'confirmed')
            .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
        // Calcular MRR (Monthly Recurring Revenue) — assinaturas Asaas
        const plans = await storage_1.storage.getAllSubscriptionPlans();
        const mrrAsaas = activeSubscriptions.reduce((sum, sub) => {
            const plan = plans.find(p => p.id === sub.planId);
            return sum + (plan ? parseFloat(plan.priceMonthly.toString()) : 0);
        }, 0);
        // Clientes ativados MANUALMENTE pelo admin (só gravam data_expiracao_assinatura
        // na tabela usuarios, sem linha em user_subscriptions) — não entravam no MRR/ativos.
        // Incluí-los para o painel refletir o negócio real (ex.: clientes-chave que pagam
        // a mensalidade junto com honorários).
        const agoraMs = Date.now();
        const idsComAssinaturaAtiva = new Set(activeSubscriptions.map((s) => s.usuarioId));
        const ativos = plans.filter((p) => p.active);
        // Cada cliente entra pelo preço do SEU tipo: contar todo mundo pelo plano
        // mais barato subestimava o MRR assim que PF e PJ passaram a ter preços
        // diferentes (a lista vem ordenada por preço).
        const precoMensalDoTipo = (tipoPessoa) => {
            const doTipo = (0, storage_1.filtrarPlanosPorTipo)(ativos, tipoPessoa);
            const escolhido = doTipo[0] || ativos[0];
            return escolhido ? parseFloat(escolhido.priceMonthly.toString()) : 0;
        };
        const allUsers = await storage_1.storage.getAllUsers();
        const manuaisAtivos = allUsers.filter((u) => (u.tipo_usuario === 'normal' || u.tipo_usuario === 'usuario') &&
            u.data_expiracao_assinatura &&
            new Date(u.data_expiracao_assinatura).getTime() > agoraMs &&
            !idsComAssinaturaAtiva.has(u.id));
        const mrrManual = manuaisAtivos.reduce((sum, u) => sum + precoMensalDoTipo(u.tipo_pessoa), 0);
        const mrr = mrrAsaas + mrrManual;
        // Calcular taxa de churn (últimos 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { userSubscriptions } = await Promise.resolve().then(() => __importStar(require("../../shared/schema")));
        const canceledSubs = await db.select().from(userSubscriptions).where(sql `${userSubscriptions.status} = 'canceled'
          AND ${userSubscriptions.canceledAt} >= ${thirtyDaysAgo.toISOString()}`);
        const churnRate = activeSubscriptions.length > 0
            ? (canceledSubs.length / (activeSubscriptions.length + canceledSubs.length)) * 100
            : 0;
        // Buscar pagamentos recentes
        const recentPayments = payments
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 10);
        // Buscar nomes dos usuários para os pagamentos
        const { users } = await Promise.resolve().then(() => __importStar(require("../../shared/schema")));
        const recentPaymentsWithUsers = await Promise.all(recentPayments.map(async (payment) => {
            const user = await storage_1.storage.getUserById(payment.usuarioId);
            return {
                id: payment.id,
                userName: (user === null || user === void 0 ? void 0 : user.nome) || 'Usuário Desconhecido',
                amount: payment.amount.toString(),
                status: payment.status,
                dueDate: payment.dueDate
            };
        }));
        res.json({
            // Total de ativos = assinaturas Asaas + clientes liberados manualmente.
            totalActiveSubscriptions: activeSubscriptions.length + manuaisAtivos.length,
            totalActiveAsaas: activeSubscriptions.length,
            totalActiveManual: manuaisAtivos.length,
            totalRevenue,
            mrr,
            mrrAsaas,
            mrrManual,
            churnRate: parseFloat(churnRate.toFixed(2)),
            recentPayments: recentPaymentsWithUsers
        });
    }
    catch (error) {
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
async function getAllSubscriptions(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Buscar todas as assinaturas
        const { db } = await Promise.resolve().then(() => __importStar(require('../db')));
        const { userSubscriptions, users, subscriptionPlans } = await Promise.resolve().then(() => __importStar(require("../../shared/schema")));
        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
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
    }
    catch (error) {
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
async function searchPayments(req, res) {
    try {
        const { q: searchTerm, status, paymentMethod, dateFrom, dateTo, limit = '50', offset = '0' } = req.query;
        const payments = await storage_1.storage.searchPaymentTransactions({
            searchTerm: searchTerm,
            status: status,
            paymentMethod: paymentMethod,
            dateFrom: dateFrom,
            dateTo: dateTo
        }, parseInt(limit), parseInt(offset));
        res.json(payments);
    }
    catch (error) {
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
async function retryPayment(req, res) {
    try {
        const paymentId = parseInt(req.params.id);
        // Buscar pagamento no banco
        const payment = await storage_1.storage.getPaymentTransactionById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: "Pagamento não encontrado" });
        }
        // Buscar usuário
        const user = await storage_1.storage.getUserById(payment.usuarioId);
        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }
        // Buscar status atual no Asaas
        const asaasService = await Promise.resolve().then(() => __importStar(require('../services/asaas.service'))).then(m => m.getAsaasService());
        const asaasPayment = await asaasService.getPayment(payment.asaasPaymentId);
        console.log(`[Admin] Retrying payment ${payment.id} - Current Asaas status:`, asaasPayment.status);
        // Se o status no Asaas é diferente do nosso banco, sincronizar
        if (asaasPayment.status === 'RECEIVED' || asaasPayment.status === 'CONFIRMED') {
            await storage_1.storage.updatePaymentTransaction(payment.id, {
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
            await storage_1.storage.updatePaymentTransaction(payment.id, {
                retryCount: newRetryCount,
                metadata: JSON.stringify(Object.assign(Object.assign({}, JSON.parse(payment.metadata || '{}')), { lastRetry: new Date().toISOString(), retryBy: 'admin' }))
            });
            // Enviar notificação ao usuário
            const { broadcastNotification } = await Promise.resolve().then(() => __importStar(require('../websocket')));
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
    }
    catch (error) {
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
async function getPaymentDetails(req, res) {
    try {
        const paymentId = parseInt(req.params.id);
        const payments = await storage_1.storage.searchPaymentTransactions({ searchTerm: '' }, 1, 0);
        // Encontrar o pagamento específico
        const paymentResult = await db_1.db
            .select({
            id: schema_1.paymentTransactions.id,
            usuarioId: schema_1.paymentTransactions.usuarioId,
            userName: schema_1.users.nome,
            userEmail: schema_1.users.email,
            userPhone: schema_1.users.telefone,
            subscriptionId: schema_1.paymentTransactions.subscriptionId,
            asaasPaymentId: schema_1.paymentTransactions.asaasPaymentId,
            asaasInvoiceUrl: schema_1.paymentTransactions.asaasInvoiceUrl,
            amount: schema_1.paymentTransactions.amount,
            currency: schema_1.paymentTransactions.currency,
            status: schema_1.paymentTransactions.status,
            paymentMethod: schema_1.paymentTransactions.paymentMethod,
            dueDate: schema_1.paymentTransactions.dueDate,
            confirmedDate: schema_1.paymentTransactions.confirmedDate,
            description: schema_1.paymentTransactions.description,
            retryCount: schema_1.paymentTransactions.retryCount,
            metadata: schema_1.paymentTransactions.metadata,
            createdAt: schema_1.paymentTransactions.createdAt,
            updatedAt: schema_1.paymentTransactions.updatedAt
        })
            .from(schema_1.paymentTransactions)
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.paymentTransactions.usuarioId, schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.id, paymentId))
            .limit(1);
        if (paymentResult.length === 0) {
            return res.status(404).json({ error: "Pagamento não encontrado" });
        }
        res.json(paymentResult[0]);
    }
    catch (error) {
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
async function getAsaasEnvironment(req, res) {
    try {
        // Buscar configuração do banco
        const settings = await db_1.db
            .select()
            .from(schema_1.paymentSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentSettings.provider, 'asaas'))
            .limit(1);
        let environment = 'sandbox';
        if (settings.length > 0 && settings[0].enabled) {
            environment = settings[0].environment;
        }
        else {
            // Fallback para variável de ambiente
            environment = process.env.ASAAS_ENVIRONMENT || 'sandbox';
        }
        res.json({
            environment,
            isSandbox: environment === 'sandbox'
        });
    }
    catch (error) {
        console.error("Error fetching Asaas environment:", error);
        // Em caso de erro, retornar sandbox como padrão mais seguro
        res.json({
            environment: 'sandbox',
            isSandbox: true
        });
    }
}
