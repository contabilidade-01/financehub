import { Request, Response } from "express";
import { storage } from "../storage";
import { getAsaasService } from "../services/asaas.service";
import { getSubscriptionService } from "../services/subscription.service";
import { getNotificationService } from "../services/notification.service";
import { broadcastNotification, broadcastToRole } from "../websocket";
import { generateRandomPassword } from "../utils/password-generator";
import bcrypt from "bcryptjs";

/**
 * Asaas Webhook Controller
 *
 * Processa eventos recebidos do Asaas via webhook
 * Endpoint público, mas com validação de assinatura
 *
 * Eventos principais:
 * - PAYMENT_CREATED: Novo pagamento criado
 * - PAYMENT_CONFIRMED: Pagamento confirmado
 * - PAYMENT_RECEIVED: Pagamento recebido
 * - PAYMENT_OVERDUE: Pagamento vencido
 * - PAYMENT_REFUNDED: Pagamento estornado
 * - PAYMENT_RECEIVED_IN_CASH_UNDONE: Pagamento desfeito
 */

/**
 * @swagger
 * /api/webhooks/asaas:
 *   post:
 *     summary: Webhook do Asaas (público)
 *     description: Recebe notificações de eventos do gateway de pagamento Asaas
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processado com sucesso
 *       401:
 *         description: Webhook inválido (verificação falhou)
 */
export async function handleAsaasWebhook(req: Request, res: Response) {
  try {
    console.log('[AsaasWebhook] Received webhook:', JSON.stringify(req.body, null, 2));

    // 1. Verificar autenticidade do webhook
    const webhookToken = req.headers['asaas-access-token'] as string;
    const asaasService = await getAsaasService();

    const isValidWebhook = await asaasService.verifyWebhook(webhookToken);
    if (!isValidWebhook) {
      console.warn('[AsaasWebhook] Invalid webhook signature');
      return res.status(401).json({ error: "Webhook inválido" });
    }

    const { event, payment } = req.body;

    if (!event || !payment) {
      console.warn('[AsaasWebhook] Missing event or payment data');
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // 2. Verificar se já processamos este evento (idempotência)
    const existingWebhook = await storage.getAsaasWebhookByEventId(payment.id + '-' + event);
    if (existingWebhook && existingWebhook.processed) {
      console.log('[AsaasWebhook] Event already processed:', payment.id);
      return res.status(200).json({ message: "Evento já processado" });
    }

    // 3. Salvar webhook no banco (log)
    const webhookRecord = await storage.createAsaasWebhook({
      eventType: event,
      asaasEventId: payment.id + '-' + event,
      payload: JSON.stringify(req.body),
      processed: false
    });

    // 4. Processar evento
    try {
      await processWebhookEvent(event, payment, webhookRecord.id);

      // Marcar como processado
      await storage.updateAsaasWebhook(webhookRecord.id, {
        processed: true,
        processedAt: new Date()
      });

      console.log('[AsaasWebhook] Event processed successfully:', event);
      res.status(200).json({ message: "Webhook processado com sucesso" });

    } catch (processingError: any) {
      console.error('[AsaasWebhook] Error processing event:', processingError);

      // Salvar erro no log
      await storage.updateAsaasWebhook(webhookRecord.id, {
        processed: false,
        errorMessage: processingError.message || 'Erro desconhecido'
      });

      // Retornar 200 mesmo assim para não retryar automaticamente
      // O job de background vai reprocessar eventos não processados
      res.status(200).json({ message: "Erro ao processar, será retentado" });
    }

  } catch (error: any) {
    console.error('[AsaasWebhook] Fatal error:', error);
    res.status(500).json({ error: "Erro interno ao processar webhook" });
  }
}

/**
 * Processar evento específico do webhook
 */
/**
 * Buscar configurações de notificação de pagamento
 */
async function getPaymentNotificationSettings() {
  try {
    const { db } = await import('../db');
    const { paymentSettings } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const settings = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
      .limit(1);

    if (settings.length > 0) {
      return {
        sendEmail: settings[0].sendActivationEmail ?? true,
        sendWhatsApp: settings[0].sendActivationWhatsapp ?? false
      };
    }
  } catch (error) {
    console.warn('[AsaasWebhook] Error fetching notification settings:', error);
  }

  // Default: enviar email, não enviar WhatsApp
  return { sendEmail: true, sendWhatsApp: false };
}

async function processWebhookEvent(eventType: string, paymentData: any, webhookId: number) {
  const subscriptionService = getSubscriptionService(storage);
  const notificationService = getNotificationService();

  // Buscar pagamento no nosso banco
  const payment = await storage.getPaymentTransactionByAsaasId(paymentData.id);

  if (!payment) {
    console.warn(`[AsaasWebhook] Payment not found in database: ${paymentData.id}`);
    // Não é um erro crítico - pode ser um pagamento que não gerenciamos
    return;
  }

  const user = await storage.getUserById(payment.usuarioId);
  if (!user) {
    throw new Error(`User not found: ${payment.usuarioId}`);
  }

  // Buscar configurações de notificação
  const notificationSettings = await getPaymentNotificationSettings();
  console.log('[AsaasWebhook] Notification settings:', notificationSettings);

  switch (eventType) {
    case 'PAYMENT_CREATED':
      // Pagamento criado - apenas logar
      console.log(`[AsaasWebhook] Payment created: ${paymentData.id}`);
      await storage.updatePaymentTransaction(payment.id, {
        status: 'pending'
      });

      // Broadcast em tempo real
      broadcastNotification({
        id: `payment-created-${payment.id}`,
        type: 'info',
        title: 'Pagamento Criado',
        message: `Seu pagamento de R$ ${payment.amount} foi registrado.`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, [user.id.toString()]);

      // Notificar admins
      broadcastToRole({
        id: `payment-created-admin-${payment.id}`,
        type: 'info',
        title: 'Novo Pagamento',
        message: `${user.nome} criou um pagamento de R$ ${payment.amount}`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, 'super_admin');
      break;

    case 'PAYMENT_UPDATED':
      // Pagamento atualizado - apenas logar
      console.log(`[AsaasWebhook] Payment updated: ${paymentData.id}`);
      break;

    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      // Pagamento confirmado - ATIVAR ASSINATURA
      console.log(`[AsaasWebhook] Payment confirmed: ${paymentData.id}`);

      await storage.updatePaymentTransaction(payment.id, {
        status: 'confirmed',
        confirmedDate: new Date(),
        metadata: JSON.stringify(paymentData)
      });

      // Ativar assinatura do usuário
      if (payment.subscriptionId) {
        await subscriptionService.activateUserSubscription(payment.usuarioId, payment.subscriptionId);
      }

      // Enviar notificação de pagamento confirmado (respeitando configurações do super_admin)
      if (notificationSettings.sendEmail || notificationSettings.sendWhatsApp) {
        console.log(`[AsaasWebhook] Sending payment notification (Email: ${notificationSettings.sendEmail}, WhatsApp: ${notificationSettings.sendWhatsApp})`);
        await notificationService.sendPaymentConfirmed(
          user,
          parseFloat(payment.amount.toString()),
          payment.asaasInvoiceUrl || undefined
        );
      } else {
        console.log('[AsaasWebhook] Payment notifications disabled by admin settings');
      }

      // IMPORTANTE: Webhook de ativação é SEMPRE enviado, independente das configurações de email/whatsapp
      // Este é o trigger que ativa o usuário no sistema externo
      try {
        console.log('[AsaasWebhook] Enviando webhook de ativação...');

        const postgres = (await import('postgres')).default;
        const client = postgres(process.env.DATABASE_URL || '', { prepare: false });

        // Buscar mensagem de ativação personalizada
        const result = await client`
          SELECT title, message, email_content
          FROM welcome_messages
          WHERE type = 'activated'
        `;

        let activationMessage = {
          title: 'Sua conta foi ativada!',
          message: 'Olá! Sua conta foi ativada com sucesso. Agora você tem acesso completo a todos os recursos da plataforma.',
          email_content: 'Sua conta foi ativada com sucesso!'
        };

        if (result.length > 0) {
          activationMessage = result[0];
          // Processar tags na mensagem usando notification.service
          activationMessage.title = notificationService.processMessageTags(activationMessage.title, user);
          activationMessage.message = notificationService.processMessageTags(activationMessage.message, user);
          activationMessage.email_content = notificationService.processMessageTags(
            activationMessage.email_content || activationMessage.message,
            user
          );
        }

        // Buscar token do usuário (mesmo comportamento da ativação manual)
        const userTokens = await storage.getApiTokensByUserId(user.id);
        const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;

        // Gerar nova senha aleatória (mesmo comportamento da ativação manual)
        const newPassword = generateRandomPassword(8);

        // Atualizar a senha do usuário
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await storage.updateUser(user.id, { senha: hashedPassword });

        console.log(`[AsaasWebhook] Nova senha gerada para usuário ${user.nome}: ${newPassword}`);

        // Enviar webhook de ativação com payload COMPLETO (idêntico à ativação manual)
        const webhookData = {
          evento: "usuario_ativado",
          timestamp: new Date().toISOString(),
          dominio: process.env.BASE_URL || 'https://financehub.xpiria.com.br',
          id: user.id,
          nome: user.nome,
          email: user.email,
          telefone: user.telefone,
          tipo_usuario: user.tipo_usuario,
          data_cadastro: user.data_cadastro,
          token: userToken,
          acesso_web: {
            usuario: user.email,
            senha: newPassword
          },
          mensagem_ativacao: {
            titulo: activationMessage.title,
            mensagem: activationMessage.message,
            conteudo_email: activationMessage.email_content
          }
        };

        console.log('[AsaasWebhook] Sending activation webhook with custom message');
        console.log('[AsaasWebhook] Webhook payload:', JSON.stringify(webhookData, null, 2));

        const webhookResponse = await fetch(
          process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookData)
          }
        );

        if (webhookResponse.ok) {
          console.log('[AsaasWebhook] Activation webhook sent successfully');
        } else {
          console.error('[AsaasWebhook] Error sending activation webhook:', webhookResponse.status);
        }

        await client.end();
      } catch (msgError) {
        console.error('[AsaasWebhook] Error sending activation message:', msgError);
        // Não falhar a operação principal se a mensagem de ativação falhar
      }

      // Broadcast em tempo real para o usuário (sempre enviar, independente das configurações de email/whatsapp)
      broadcastNotification({
        id: `payment-confirmed-${payment.id}`,
        type: 'success',
        title: 'Pagamento Confirmado!',
        message: `Seu pagamento de R$ ${payment.amount} foi confirmado com sucesso!`,
        timestamp: new Date().toISOString(),
        autoClose: 8000,
        persistent: true,
        data: {
          paymentId: payment.id, // ID interno para correlação com checkout
          subscriptionId: payment.subscriptionId,
          status: 'confirmed'
        }
      }, [user.id.toString()]);

      // Notificar admins
      broadcastToRole({
        id: `payment-confirmed-admin-${payment.id}`,
        type: 'success',
        title: 'Pagamento Confirmado',
        message: `${user.nome} - R$ ${payment.amount} confirmado`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, 'super_admin');
      break;

    case 'PAYMENT_OVERDUE':
      // Pagamento vencido - INICIAR RETRY
      console.log(`[AsaasWebhook] Payment overdue: ${paymentData.id}`);

      const newRetryCount = (payment.retryCount || 0) + 1;

      await storage.updatePaymentTransaction(payment.id, {
        status: 'overdue',
        retryCount: newRetryCount,
        metadata: JSON.stringify(paymentData)
      });

      // Processar falha de pagamento
      await subscriptionService.handlePaymentFailure(paymentData.id, newRetryCount);

      // Broadcast em tempo real
      broadcastNotification({
        id: `payment-overdue-${payment.id}`,
        type: 'warning',
        title: 'Pagamento Vencido',
        message: `Seu pagamento de R$ ${payment.amount} está vencido. Por favor, regularize.`,
        timestamp: new Date().toISOString(),
        persistent: true
      }, [user.id.toString()]);

      // Notificar admins
      broadcastToRole({
        id: `payment-overdue-admin-${payment.id}`,
        type: 'warning',
        title: 'Pagamento Vencido',
        message: `${user.nome} - R$ ${payment.amount} vencido`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, 'super_admin');
      break;

    case 'PAYMENT_REFUNDED':
      // Pagamento estornado
      console.log(`[AsaasWebhook] Payment refunded: ${paymentData.id}`);

      await storage.updatePaymentTransaction(payment.id, {
        status: 'refunded',
        metadata: JSON.stringify(paymentData)
      });

      // Se era assinatura ativa, desativar
      if (payment.subscriptionId) {
        await subscriptionService.deactivateUserSubscription(
          payment.usuarioId,
          payment.subscriptionId,
          'Pagamento estornado'
        );
      }

      // Broadcast em tempo real
      broadcastNotification({
        id: `payment-refunded-${payment.id}`,
        type: 'info',
        title: 'Pagamento Estornado',
        message: `Seu pagamento de R$ ${payment.amount} foi estornado.`,
        timestamp: new Date().toISOString(),
        autoClose: 8000
      }, [user.id.toString()]);

      // Notificar admins
      broadcastToRole({
        id: `payment-refunded-admin-${payment.id}`,
        type: 'info',
        title: 'Pagamento Estornado',
        message: `${user.nome} - R$ ${payment.amount} estornado`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, 'super_admin');
      break;

    case 'PAYMENT_RECEIVED_IN_CASH_UNDONE':
      // Pagamento recebido foi desfeito - BLOQUEAR ACESSO
      console.log(`[AsaasWebhook] Payment undone: ${paymentData.id}`);

      await storage.updatePaymentTransaction(payment.id, {
        status: 'pending',
        metadata: JSON.stringify(paymentData)
      });

      // Desativar assinatura imediatamente
      if (payment.subscriptionId) {
        await subscriptionService.deactivateUserSubscription(
          payment.usuarioId,
          payment.subscriptionId,
          'Pagamento desfeito pelo gateway'
        );
      }

      // Broadcast em tempo real
      broadcastNotification({
        id: `payment-undone-${payment.id}`,
        type: 'error',
        title: 'Pagamento Desfeito',
        message: `Seu pagamento de R$ ${payment.amount} foi desfeito. Entre em contato com o suporte.`,
        timestamp: new Date().toISOString(),
        persistent: true
      }, [user.id.toString()]);

      // Notificar admins
      broadcastToRole({
        id: `payment-undone-admin-${payment.id}`,
        type: 'error',
        title: 'Pagamento Desfeito',
        message: `${user.nome} - R$ ${payment.amount} desfeito`,
        timestamp: new Date().toISOString(),
        autoClose: 5000
      }, 'super_admin');
      break;

    case 'PAYMENT_DELETED':
      // Pagamento deletado
      console.log(`[AsaasWebhook] Payment deleted: ${paymentData.id}`);
      // Apenas logar, não tomar ação
      break;

    default:
      console.log(`[AsaasWebhook] Unhandled event type: ${eventType}`);
      break;
  }
}

/**
 * @swagger
 * /api/admin/webhooks:
 *   get:
 *     summary: Listar webhooks recebidos (ADMIN ONLY)
 *     tags: [Webhooks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: unprocessed
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista de webhooks
 */
export async function listWebhooks(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode acessar." });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const unprocessedOnly = req.query.unprocessed === 'true';

    let webhooks;
    if (unprocessedOnly) {
      webhooks = await storage.getUnprocessedWebhooks(limit);
    } else {
      // TODO: Implementar método para buscar todos os webhooks com paginação
      webhooks = await storage.getUnprocessedWebhooks(limit);
    }

    res.json({
      total: webhooks.length,
      webhooks
    });

  } catch (error) {
    console.error("Error listing webhooks:", error);
    res.status(500).json({ error: "Erro ao listar webhooks" });
  }
}

/**
 * @swagger
 * /api/admin/webhooks/{id}/retry:
 *   post:
 *     summary: Reprocessar webhook que falhou (ADMIN ONLY)
 *     tags: [Webhooks]
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
 *         description: Webhook reprocessado
 */
export async function retryWebhook(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode acessar." });
    }

    const webhookId = parseInt(req.params.id);
    if (isNaN(webhookId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const webhook = await storage.getAsaasWebhookById(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: "Webhook não encontrado" });
    }

    // Parsear payload
    const payload = JSON.parse(webhook.payload);
    const { event, payment } = payload;

    // Reprocessar
    await processWebhookEvent(event, payment, webhookId);

    // Marcar como processado
    await storage.updateAsaasWebhook(webhookId, {
      processed: true,
      processedAt: new Date(),
      errorMessage: null
    });

    res.json({ message: "Webhook reprocessado com sucesso" });

  } catch (error: any) {
    console.error("Error retrying webhook:", error);

    // Atualizar erro
    const webhookId = parseInt(req.params.id);
    await storage.updateAsaasWebhook(webhookId, {
      processed: false,
      errorMessage: error.message
    });

    res.status(500).json({ error: "Erro ao reprocessar webhook", details: error.message });
  }
}
