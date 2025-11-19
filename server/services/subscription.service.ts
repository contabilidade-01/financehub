/**
 * Subscription Service
 *
 * Serviço responsável pela lógica de negócio de assinaturas.
 * Orquestra a comunicação entre AsaasService e Storage.
 *
 * Princípios SOLID:
 * - Single Responsibility: Gerencia apenas lógica de assinaturas
 * - Dependency Injection: Recebe storage e asaasService como dependências
 */

import { getAsaasService, AsaasService, AsaasCreditCardData, AsaasCreditCardHolderInfo } from './asaas.service';
import { getNotificationService, NotificationService } from './notification.service';
import type { IStorage } from '../storage';
import type {
  User,
  SubscriptionPlan,
  UserSubscription,
  PaymentTransaction,
  AsaasCustomer,
  SubscriptionStatus,
  PaymentStatus
} from '@shared/schema';
import { generateRandomPassword } from '../utils/password-generator';
import bcrypt from 'bcryptjs';

// ============================================
// INTERFACES
// ============================================

export interface CreateSubscriptionData {
  userId: number;
  planId: number;
  creditCard: AsaasCreditCardData;
  creditCardHolderInfo: AsaasCreditCardHolderInfo;
  cpfCnpj: string;
  remoteIp?: string;
}

export interface SubscriptionWithPlan extends UserSubscription {
  plan: SubscriptionPlan;
}

export interface ActivateSubscriptionResult {
  subscription: UserSubscription;
  payment: PaymentTransaction;
  success: boolean;
  message: string;
}

// ============================================
// SUBSCRIPTION SERVICE CLASS
// ============================================

export class SubscriptionService {
  private asaasService: AsaasService | null = null;
  private notificationService: NotificationService;
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.notificationService = getNotificationService();
  }

  // Lazy initialization do AsaasService
  private async getAsaas(): Promise<AsaasService> {
    if (!this.asaasService) {
      this.asaasService = await getAsaasService();
    }
    return this.asaasService;
  }

  // ============================================
  // CORE SUBSCRIPTION METHODS
  // ============================================

  /**
   * Criar assinatura completa (Customer + Subscription + Payment no Asaas)
   * Este é o método principal do fluxo de checkout
   */
  async createSubscription(data: CreateSubscriptionData): Promise<ActivateSubscriptionResult> {
    try {
      // 1. Buscar usuário e plano
      const user = await this.storage.getUserById(data.userId);
      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      const plan = await this.storage.getSubscriptionPlanById(data.planId);
      if (!plan || !plan.active) {
        throw new Error('Plano não encontrado ou inativo');
      }

      // 2. Verificar se usuário já tem assinatura ativa
      const existingSubscription = await this.storage.getActiveSubscriptionByUserId(data.userId);
      if (existingSubscription) {
        throw new Error('Usuário já possui uma assinatura ativa');
      }

      // 3. Criar ou obter cliente no Asaas
      let asaasCustomer = await this.storage.getAsaasCustomerByUserId(data.userId);

      if (!asaasCustomer) {
        // Criar cliente no Asaas
        const asaasCustomerResponse = await (await this.getAsaas()).createCustomer({
          name: user.nome,
          email: user.email,
          cpfCnpj: data.cpfCnpj,
          phone: user.telefone || undefined,
          mobilePhone: user.telefone || undefined
        });

        // Salvar no banco
        asaasCustomer = await this.storage.createAsaasCustomer({
          usuarioId: data.userId,
          asaasCustomerId: asaasCustomerResponse.id,
          cpfCnpj: data.cpfCnpj
        });
      }

      // 4. Calcular próxima data de vencimento (próximo mês)
      const nextDueDate = AsaasService.calculateNextDueDate();

      // 5. Criar assinatura no Asaas
      const asaasSubscription = await (await this.getAsaas()).createSubscription({
        customer: asaasCustomer.asaasCustomerId,
        billingType: 'CREDIT_CARD',
        cycle: 'MONTHLY',
        value: parseFloat(plan.priceMonthly.toString()),
        nextDueDate: nextDueDate,
        description: `Assinatura ${plan.name} - FinanceHub`,
        creditCard: data.creditCard,
        creditCardHolderInfo: data.creditCardHolderInfo,
        remoteIp: data.remoteIp
      });

      // 6. Criar registro de assinatura no banco
      const subscription = await this.storage.createUserSubscription({
        usuarioId: data.userId,
        planId: data.planId,
        asaasSubscriptionId: asaasSubscription.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(nextDueDate)
      });

      // 7. Buscar primeiro pagamento gerado pelo Asaas
      const asaasPayments = await (await this.getAsaas()).getSubscriptionPayments(asaasSubscription.id, { limit: 1 });
      let payment: PaymentTransaction | null = null;

      if (asaasPayments.data.length > 0) {
        const firstPayment = asaasPayments.data[0];

        console.log(`[SubscriptionService] Primeiro pagamento Asaas:`);
        console.log(`  - ID: ${firstPayment.id}`);
        console.log(`  - Status: ${firstPayment.status}`);
        console.log(`  - Value: ${firstPayment.value}`);

        // Criar registro de pagamento
        payment = await this.storage.createPaymentTransaction({
          usuarioId: data.userId,
          subscriptionId: subscription.id,
          asaasPaymentId: firstPayment.id,
          asaasInvoiceUrl: firstPayment.invoiceUrl,
          amount: firstPayment.value.toString(),
          status: this.mapAsaasPaymentStatus(firstPayment.status),
          paymentMethod: 'credit_card',
          dueDate: firstPayment.dueDate,
          description: `Pagamento ${plan.name} - ${nextDueDate}`,
          metadata: JSON.stringify(firstPayment)
        });

        // Se pagamento foi confirmado, ativar usuário e enviar webhook
        if (firstPayment.status === 'CONFIRMED' || firstPayment.status === 'RECEIVED') {
          console.log(`[SubscriptionService] Pagamento já confirmado! Ativando usuário e enviando webhook...`);
          await this.activateUserSubscription(data.userId, subscription.id);

          // Enviar webhook de ativação (mesmo comportamento da ativação manual)
          await this.sendActivationWebhook(user);
        } else {
          console.log(`[SubscriptionService] Pagamento PENDENTE (${firstPayment.status}). Webhook de ativação será enviado quando PAYMENT_CONFIRMED chegar do Asaas.`);
        }
      }

      // 8. Enviar notificação de boas-vindas
      await this.notificationService.sendSubscriptionActivated(user, plan);

      return {
        subscription,
        payment: payment!,
        success: true,
        message: 'Assinatura criada com sucesso'
      };

    } catch (error) {
      console.error('[SubscriptionService] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Ativar assinatura do usuário (após confirmação de pagamento)
   */
  async activateUserSubscription(userId: number, subscriptionId: number): Promise<void> {
    try {
      // Atualizar subscription
      await this.storage.updateUserSubscription(subscriptionId, {
        status: 'active'
      });

      // Atualizar usuário (denormalização para performance)
      // IMPORTANTE: Atualizar AMBOS os campos para compatibilidade
      // - ativo: usado pelo admin switch e verificação de login
      // - subscriptionActive: usado pelo sistema de assinaturas
      await this.storage.updateUser(userId, {
        ativo: true,
        subscriptionActive: true,
        status_assinatura: 'ativa'
      });

      console.log(`[SubscriptionService] User ${userId} subscription activated`);
    } catch (error) {
      console.error('[SubscriptionService] Error activating subscription:', error);
      throw error;
    }
  }

  /**
   * Enviar webhook de ativação (idêntico à ativação manual do admin)
   */
  async sendActivationWebhook(user: User): Promise<void> {
    try {
      console.log(`[SubscriptionService] Enviando webhook de ativação para usuário ${user.nome}...`);

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
        // Processar tags na mensagem
        activationMessage.title = this.notificationService.processMessageTags(activationMessage.title, user);
        activationMessage.message = this.notificationService.processMessageTags(activationMessage.message, user);
        activationMessage.email_content = this.notificationService.processMessageTags(
          activationMessage.email_content || activationMessage.message,
          user
        );
      }

      // Buscar token do usuário
      const userTokens = await this.storage.getApiTokensByUserId(user.id);
      const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;

      // Gerar nova senha aleatória (mesmo comportamento da ativação manual)
      const newPassword = generateRandomPassword(8);

      // Atualizar a senha do usuário
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.storage.updateUser(user.id, { senha: hashedPassword });

      console.log(`[SubscriptionService] Nova senha gerada para usuário ${user.nome}: ${newPassword}`);

      // Enviar webhook de ativação com payload COMPLETO
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

      console.log('[SubscriptionService] Sending activation webhook');
      console.log('[SubscriptionService] Webhook payload:', JSON.stringify(webhookData, null, 2));

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
        console.log('[SubscriptionService] Activation webhook sent successfully');
      } else {
        console.error('[SubscriptionService] Error sending activation webhook:', webhookResponse.status);
      }

      await client.end();
    } catch (error) {
      console.error('[SubscriptionService] Error sending activation webhook:', error);
      // Não falhar a operação principal se o webhook falhar
    }
  }

  /**
   * Desativar assinatura do usuário (pagamento atrasado)
   */
  async deactivateUserSubscription(userId: number, subscriptionId: number, reason: string): Promise<void> {
    try {
      // Atualizar subscription
      await this.storage.updateUserSubscription(subscriptionId, {
        status: 'past_due'
      });

      // Atualizar usuário
      await this.storage.updateUser(userId, {
        subscriptionActive: false,
        status_assinatura: 'inativa'
      });

      // Enviar notificação
      const user = await this.storage.getUserById(userId);
      if (user) {
        await this.notificationService.sendSubscriptionSuspended(user, reason);
      }

      console.log(`[SubscriptionService] User ${userId} subscription deactivated: ${reason}`);
    } catch (error) {
      console.error('[SubscriptionService] Error deactivating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancelar assinatura (usuário solicita cancelamento)
   */
  async cancelSubscription(userId: number, reason: string): Promise<void> {
    try {
      const subscription = await this.storage.getActiveSubscriptionByUserId(userId);
      if (!subscription) {
        throw new Error('Nenhuma assinatura ativa encontrada');
      }

      // Cancelar no Asaas
      if (subscription.asaasSubscriptionId) {
        await (await this.getAsaas()).cancelSubscription(subscription.asaasSubscriptionId);
      }

      // Atualizar no banco
      await this.storage.updateUserSubscription(subscription.id, {
        status: 'canceled',
        canceledAt: new Date(),
        cancellationReason: reason
      });

      // Atualizar usuário
      await this.storage.updateUser(userId, {
        subscriptionActive: false,
        status_assinatura: 'cancelada',
        data_cancelamento: new Date(),
        motivo_cancelamento: reason
      });

      // Registrar no histórico
      await this.storage.createCancellationHistory({
        usuario_id: userId,
        motivo_cancelamento: reason,
        tipo_cancelamento: 'voluntario'
      });

      // Enviar notificação
      const user = await this.storage.getUserById(userId);
      if (user) {
        await this.notificationService.sendSubscriptionCanceled(user, reason);
      }

      console.log(`[SubscriptionService] User ${userId} subscription canceled`);
    } catch (error) {
      console.error('[SubscriptionService] Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Processar falha de pagamento (webhook ou job)
   */
  async handlePaymentFailure(paymentId: string, retryCount: number): Promise<void> {
    try {
      const payment = await this.storage.getPaymentTransactionByAsaasId(paymentId);
      if (!payment) {
        console.warn(`[SubscriptionService] Payment ${paymentId} not found in database`);
        return;
      }

      // Atualizar contador de tentativas
      await this.storage.updatePaymentTransaction(payment.id, {
        status: 'overdue',
        retryCount: retryCount
      });

      // Se atingiu 3 tentativas, bloquear acesso
      if (retryCount >= 3) {
        await this.deactivateUserSubscription(
          payment.usuarioId,
          payment.subscriptionId!,
          'Pagamento não processado após 3 tentativas'
        );

        const user = await this.storage.getUserById(payment.usuarioId);
        if (user) {
          await this.notificationService.sendPaymentFailedFinal(user);
        }
      } else {
        // Enviar notificação de tentativa
        const user = await this.storage.getUserById(payment.usuarioId);
        if (user) {
          await this.notificationService.sendPaymentFailed(user, retryCount);
        }
      }

      console.log(`[SubscriptionService] Payment failure handled for payment ${paymentId}, retry ${retryCount}/3`);
    } catch (error) {
      console.error('[SubscriptionService] Error handling payment failure:', error);
      throw error;
    }
  }

  /**
   * Sincronizar status de assinatura com Asaas
   */
  async syncSubscriptionStatus(userId: number): Promise<void> {
    try {
      const subscription = await this.storage.getActiveSubscriptionByUserId(userId);
      if (!subscription || !subscription.asaasSubscriptionId) {
        return;
      }

      // Buscar status atual no Asaas
      const asaasSubscription = await (await this.getAsaas()).getSubscription(subscription.asaasSubscriptionId);

      // Mapear status
      const newStatus = this.mapAsaasSubscriptionStatus(asaasSubscription.status);

      // Atualizar se necessário
      if (subscription.status !== newStatus) {
        await this.storage.updateUserSubscription(subscription.id, {
          status: newStatus
        });

        const isActive = newStatus === 'active';
        await this.storage.updateUser(userId, {
          subscriptionActive: isActive
        });

        console.log(`[SubscriptionService] Synced subscription ${subscription.id}: ${subscription.status} -> ${newStatus}`);
      }
    } catch (error) {
      console.error('[SubscriptionService] Error syncing subscription status:', error);
      throw error;
    }
  }

  /**
   * Verificar se usuário tem acesso ativo
   */
  async checkUserAccess(userId: number): Promise<boolean> {
    try {
      const user = await this.storage.getUserById(userId);
      if (!user) return false;

      // Super admin sempre tem acesso
      if (user.tipo_usuario === 'super_admin') return true;

      // Verificar flag de assinatura ativa (denormalização para performance)
      return user.subscriptionActive || false;
    } catch (error) {
      console.error('[SubscriptionService] Error checking user access:', error);
      return false;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Mapear status de pagamento do Asaas para nosso sistema
   */
  private mapAsaasPaymentStatus(asaasStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'PENDING': 'pending',
      'RECEIVED': 'confirmed',
      'CONFIRMED': 'confirmed',
      'OVERDUE': 'overdue',
      'REFUNDED': 'refunded',
      'RECEIVED_IN_CASH': 'received_in_cash'
    };

    return statusMap[asaasStatus] || 'pending';
  }

  /**
   * Mapear status de assinatura do Asaas para nosso sistema
   */
  private mapAsaasSubscriptionStatus(asaasStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'ACTIVE': 'active',
      'INACTIVE': 'canceled',
      'EXPIRED': 'expired'
    };

    return statusMap[asaasStatus] || 'active';
  }
}

// Singleton instance
let subscriptionServiceInstance: SubscriptionService | null = null;

/**
 * Get singleton instance do SubscriptionService
 */
export function getSubscriptionService(storage: IStorage): SubscriptionService {
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService(storage);
  }
  return subscriptionServiceInstance;
}
