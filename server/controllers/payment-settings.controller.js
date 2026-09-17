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
exports.getPaymentSettings = getPaymentSettings;
exports.updatePaymentSettings = updatePaymentSettings;
exports.testPaymentConnection = testPaymentConnection;
exports.revealPaymentSettings = revealPaymentSettings;
exports.testWebhook = testWebhook;
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const zod_1 = require("zod");
/**
 * Payment Settings Controller
 *
 * Gerencia configurações de gateways de pagamento (Asaas, etc)
 * Apenas super admins podem acessar
 */
const updateSettingsSchema = zod_1.z.object({
    environment: zod_1.z.enum(['sandbox', 'production']).optional(),
    apiKey: zod_1.z.string().min(10).optional(),
    webhookSecret: zod_1.z.string().optional(),
    enabled: zod_1.z.boolean().optional()
});
/**
 * @swagger
 * /api/admin/payment-settings:
 *   get:
 *     summary: Obter configurações de pagamento
 *     tags: [Admin, Payment Settings]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Configurações de pagamento
 */
async function getPaymentSettings(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Buscar configurações do Asaas
        const settings = await db_1.db
            .select()
            .from(schema_1.paymentSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentSettings.provider, 'asaas'))
            .limit(1);
        if (settings.length === 0) {
            return res.json({
                provider: 'asaas',
                environment: 'sandbox',
                apiKey: '',
                webhookSecret: '',
                enabled: false,
                configured: false
            });
        }
        const config = settings[0];
        // Mascarar a chave API (mostrar apenas os primeiros e últimos caracteres)
        const maskedApiKey = config.apiKey
            ? config.apiKey.substring(0, 15) + '...' + config.apiKey.substring(config.apiKey.length - 10)
            : '';
        res.json({
            id: config.id,
            provider: config.provider,
            environment: config.environment,
            apiKey: maskedApiKey,
            apiKeyLength: config.apiKey.length,
            webhookSecret: config.webhookSecret ? '***' : '',
            enabled: config.enabled,
            configured: !!config.apiKey,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt
        });
    }
    catch (error) {
        console.error("Error fetching payment settings:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : error);
        res.status(500).json({ error: "Erro ao buscar configurações" });
    }
}
/**
 * @swagger
 * /api/admin/payment-settings:
 *   put:
 *     summary: Atualizar configurações de pagamento
 *     tags: [Admin, Payment Settings]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               environment:
 *                 type: string
 *                 enum: [sandbox, production]
 *               apiKey:
 *                 type: string
 *               webhookSecret:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Configurações atualizadas
 */
async function updatePaymentSettings(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Validar dados
        const validatedData = updateSettingsSchema.parse(req.body);
        // Verificar se já existe configuração
        const existing = await db_1.db
            .select()
            .from(schema_1.paymentSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentSettings.provider, 'asaas'))
            .limit(1);
        let result;
        if (existing.length === 0) {
            // Criar nova configuração
            result = await db_1.db
                .insert(schema_1.paymentSettings)
                .values({
                provider: 'asaas',
                environment: validatedData.environment || 'sandbox',
                apiKey: validatedData.apiKey || '',
                webhookSecret: validatedData.webhookSecret || '',
                enabled: validatedData.enabled !== undefined ? validatedData.enabled : true,
                createdAt: new Date()
            })
                .returning();
        }
        else {
            // Atualizar configuração existente
            const updateData = {
                updatedAt: new Date()
            };
            if (validatedData.environment)
                updateData.environment = validatedData.environment;
            if (validatedData.apiKey)
                updateData.apiKey = validatedData.apiKey;
            if (validatedData.webhookSecret !== undefined)
                updateData.webhookSecret = validatedData.webhookSecret;
            if (validatedData.enabled !== undefined)
                updateData.enabled = validatedData.enabled;
            result = await db_1.db
                .update(schema_1.paymentSettings)
                .set(updateData)
                .where((0, drizzle_orm_1.eq)(schema_1.paymentSettings.id, existing[0].id))
                .returning();
        }
        // Reinicializar o serviço Asaas com as novas configurações
        try {
            const { reinitializeAsaasService } = await Promise.resolve().then(() => __importStar(require('../services/asaas.service')));
            await reinitializeAsaasService();
            console.log('✅ Serviço Asaas reinicializado com novas configurações');
        }
        catch (err) {
            console.error('⚠️ Erro ao reinicializar serviço Asaas:', err);
        }
        res.json({
            success: true,
            message: "Configurações atualizadas com sucesso",
            settings: result[0]
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: "Dados inválidos", details: error.errors });
        }
        console.error("Error updating payment settings:", error);
        res.status(500).json({ error: error.message || "Erro ao atualizar configurações" });
    }
}
/**
 * @swagger
 * /api/admin/payment-settings/test:
 *   post:
 *     summary: Testar conexão com gateway de pagamento
 *     tags: [Admin, Payment Settings]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Teste bem sucedido
 */
async function testPaymentConnection(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Testar conexão com Asaas
        const { getAsaasService } = await Promise.resolve().then(() => __importStar(require('../services/asaas.service')));
        const asaasService = await getAsaasService();
        try {
            // Tentar fazer uma requisição simples para testar a chave API
            const testResult = await asaasService.testConnection();
            res.json({
                success: true,
                message: "Conexão testada com sucesso",
                details: testResult
            });
        }
        catch (apiError) {
            res.status(400).json({
                success: false,
                error: "Falha ao conectar com Asaas",
                message: apiError.message || "Chave API inválida ou sem permissões"
            });
        }
    }
    catch (error) {
        console.error("Error testing payment connection:", error);
        res.status(500).json({ error: error.message || "Erro ao testar conexão" });
    }
}
/**
 * @swagger
 * /api/admin/payment-settings/reveal:
 *   get:
 *     summary: Obter valores reais (não mascarados) da API key e webhook secret
 *     description: Apenas super admins podem acessar os valores completos
 *     tags: [Admin, Payment Settings]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Valores reais
 */
async function revealPaymentSettings(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Buscar configurações do Asaas
        const settings = await db_1.db
            .select()
            .from(schema_1.paymentSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentSettings.provider, 'asaas'))
            .limit(1);
        if (settings.length === 0) {
            return res.json({
                apiKey: '',
                webhookSecret: ''
            });
        }
        const config = settings[0];
        res.json({
            apiKey: config.apiKey,
            webhookSecret: config.webhookSecret || ''
        });
    }
    catch (error) {
        console.error("Error revealing payment settings:", error);
        res.status(500).json({ error: "Erro ao buscar configurações" });
    }
}
/**
 * @swagger
 * /api/admin/payment-settings/test-webhook:
 *   post:
 *     summary: Testar configuração de webhook
 *     description: Envia um webhook de teste real para verificar se está configurado corretamente
 *     tags: [Admin, Payment Settings]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Teste de webhook realizado com logs completos
 */
async function testWebhook(req, res) {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Usuário não autenticado" });
        }
        // Buscar configurações
        const settings = await db_1.db
            .select()
            .from(schema_1.paymentSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentSettings.provider, 'asaas'))
            .limit(1);
        if (settings.length === 0 || !settings[0].webhookSecret) {
            return res.status(400).json({
                success: false,
                message: "Webhook secret não configurado. Configure o token de acesso primeiro."
            });
        }
        const config = settings[0];
        const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/asaas`;
        // Criar payload de teste simulando um evento do Asaas
        const testPayload = {
            event: "PAYMENT_RECEIVED",
            payment: {
                id: "pay_test_" + Date.now(),
                customer: "cus_test_123456",
                billingType: "CREDIT_CARD",
                value: 99.90,
                netValue: 97.90,
                description: "Teste de Webhook - Assinatura Premium",
                status: "RECEIVED",
                confirmedDate: new Date().toISOString(),
                subscription: "sub_test_789",
                installment: null,
                transactionReceiptUrl: "https://sandbox.asaas.com/i/test123",
                nossoNumero: null,
                invoiceUrl: "https://sandbox.asaas.com/i/test123",
                bankSlipUrl: null,
                invoiceNumber: "00000123",
                externalReference: null,
                originalValue: 99.90,
                interestValue: 0,
                originalDueDate: new Date().toISOString().split('T')[0],
                paymentDate: new Date().toISOString().split('T')[0],
                clientPaymentDate: new Date().toISOString().split('T')[0],
                creditDate: new Date(Date.now() + 86400000).toISOString().split('T')[0]
            }
        };
        // Preparar headers da requisição
        const requestHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'Asaas-Webhook-Test',
            'X-Asaas-Signature': config.webhookSecret,
            'asaas-access-token': config.webhookSecret
        };
        console.log(`[Webhook Test] Enviando requisição para: ${webhookUrl}`);
        console.log('[Webhook Test] Payload:', JSON.stringify(testPayload, null, 2));
        // Fazer requisição HTTP real para o webhook
        const axios = await Promise.resolve().then(() => __importStar(require('axios'))).then(m => m.default);
        const startTime = Date.now();
        let webhookResponse;
        let webhookError = null;
        try {
            webhookResponse = await axios.post(webhookUrl, testPayload, {
                headers: requestHeaders,
                timeout: 10000, // 10 segundos
                validateStatus: () => true // Aceitar qualquer status code
            });
        }
        catch (error) {
            webhookError = {
                message: error.message,
                code: error.code,
                stack: error.stack
            };
        }
        const endTime = Date.now();
        const duration = endTime - startTime;
        // Montar resposta detalhada
        const testResults = {
            success: webhookResponse ? webhookResponse.status >= 200 && webhookResponse.status < 300 : false,
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            webhookUrl,
            environment: config.environment,
            request: {
                method: 'POST',
                url: webhookUrl,
                headers: requestHeaders,
                body: testPayload
            },
            response: webhookResponse ? {
                status: webhookResponse.status,
                statusText: webhookResponse.statusText,
                headers: webhookResponse.headers,
                body: webhookResponse.data,
                size: JSON.stringify(webhookResponse.data).length + ' bytes'
            } : null,
            error: webhookError,
            summary: webhookResponse
                ? `Webhook respondeu com status ${webhookResponse.status} em ${duration}ms`
                : `Erro ao chamar webhook: ${webhookError === null || webhookError === void 0 ? void 0 : webhookError.message}`
        };
        console.log('[Webhook Test] Resultado:', testResults.summary);
        res.json(testResults);
    }
    catch (error) {
        console.error("Error testing webhook:", error);
        res.status(500).json({
            success: false,
            error: "Erro ao testar webhook",
            message: error.message,
            stack: error.stack
        });
    }
}
