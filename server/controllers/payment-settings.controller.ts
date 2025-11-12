import { Request, Response } from "express";
import { db } from "../db";
import { paymentSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Payment Settings Controller
 *
 * Gerencia configurações de gateways de pagamento (Asaas, etc)
 * Apenas super admins podem acessar
 */

const updateSettingsSchema = z.object({
  environment: z.enum(['sandbox', 'production']).optional(),
  apiKey: z.string().min(10).optional(),
  webhookSecret: z.string().optional(),
  enabled: z.boolean().optional()
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
export async function getPaymentSettings(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Buscar configurações do Asaas
    const settings = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
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

  } catch (error) {
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
export async function updatePaymentSettings(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Validar dados
    const validatedData = updateSettingsSchema.parse(req.body);

    // Verificar se já existe configuração
    const existing = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
      .limit(1);

    let result;

    if (existing.length === 0) {
      // Criar nova configuração
      result = await db
        .insert(paymentSettings)
        .values({
          provider: 'asaas',
          environment: validatedData.environment || 'sandbox',
          apiKey: validatedData.apiKey || '',
          webhookSecret: validatedData.webhookSecret || '',
          enabled: validatedData.enabled !== undefined ? validatedData.enabled : true,
          createdAt: new Date()
        })
        .returning();
    } else {
      // Atualizar configuração existente
      const updateData: any = {
        updatedAt: new Date()
      };

      if (validatedData.environment) updateData.environment = validatedData.environment;
      if (validatedData.apiKey) updateData.apiKey = validatedData.apiKey;
      if (validatedData.webhookSecret !== undefined) updateData.webhookSecret = validatedData.webhookSecret;
      if (validatedData.enabled !== undefined) updateData.enabled = validatedData.enabled;

      result = await db
        .update(paymentSettings)
        .set(updateData)
        .where(eq(paymentSettings.id, existing[0].id))
        .returning();
    }

    // Reinicializar o serviço Asaas com as novas configurações
    try {
      const { reinitializeAsaasService } = await import('../services/asaas.service');
      await reinitializeAsaasService();
      console.log('✅ Serviço Asaas reinicializado com novas configurações');
    } catch (err) {
      console.error('⚠️ Erro ao reinicializar serviço Asaas:', err);
    }

    res.json({
      success: true,
      message: "Configurações atualizadas com sucesso",
      settings: result[0]
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
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
export async function testPaymentConnection(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Testar conexão com Asaas
    const { getAsaasService } = await import('../services/asaas.service');
    const asaasService = await getAsaasService();

    try {
      // Tentar fazer uma requisição simples para testar a chave API
      const testResult = await asaasService.testConnection();

      res.json({
        success: true,
        message: "Conexão testada com sucesso",
        details: testResult
      });
    } catch (apiError: any) {
      res.status(400).json({
        success: false,
        error: "Falha ao conectar com Asaas",
        message: apiError.message || "Chave API inválida ou sem permissões"
      });
    }

  } catch (error: any) {
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
export async function revealPaymentSettings(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Buscar configurações do Asaas
    const settings = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
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

  } catch (error) {
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
export async function testWebhook(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Buscar configurações
    const settings = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
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
    const axios = await import('axios').then(m => m.default);

    const startTime = Date.now();
    let webhookResponse;
    let webhookError = null;

    try {
      webhookResponse = await axios.post(webhookUrl, testPayload, {
        headers: requestHeaders,
        timeout: 10000, // 10 segundos
        validateStatus: () => true // Aceitar qualquer status code
      });
    } catch (error: any) {
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
        : `Erro ao chamar webhook: ${webhookError?.message}`
    };

    console.log('[Webhook Test] Resultado:', testResults.summary);

    res.json(testResults);

  } catch (error: any) {
    console.error("Error testing webhook:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao testar webhook",
      message: error.message,
      stack: error.stack
    });
  }
}
