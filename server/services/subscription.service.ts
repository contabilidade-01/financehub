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

        // Se pagamento foi confirmado, ativar usuário
        if (firstPayment.status === 'CONFIRMED' || firstPayment.status === 'RECEIVED') {
          await this.activateUserSubscription(data.userId, subscription.id);
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
      await this.storage.updateUser(userId, {
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
