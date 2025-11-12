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
  enabled: z.boolean().optional(),
  sendActivationEmail: z.boolean().optional(),
  sendActivationWhatsapp: z.boolean().optional()
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
      sendActivationEmail: config.sendActivationEmail ?? true,
      sendActivationWhatsapp: config.sendActivationWhatsapp ?? false,
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
          sendActivationEmail: validatedData.sendActivationEmail ?? true,
          sendActivationWhatsapp: validatedData.sendActivationWhatsapp ?? false,
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
      if (validatedData.sendActivationEmail !== undefined) updateData.sendActivationEmail = validatedData.sendActivationEmail;
      if (validatedData.sendActivationWhatsapp !== undefined) updateData.sendActivationWhatsapp = validatedData.sendActivationWhatsapp;

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
