/**
 * Notification Service
 *
 * Serviço responsável por enviar notificações (email, WhatsApp, etc.)
 * Integra com sistema WAHA existente para WhatsApp
 *
 * Princípio DRY: Centraliza toda lógica de notificações
 */

import type { User, SubscriptionPlan } from '@shared/schema';

// ============================================
// INTERFACES
// ============================================

export interface EmailConfig {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface WhatsAppMessage {
  phone: string;
  message: string;
}

// ============================================
// NOTIFICATION SERVICE CLASS
// ============================================

export class NotificationService {
  private wahaEnabled: boolean;

  constructor() {
    this.wahaEnabled = process.env.WAHA_ENABLED === 'true';
  }

  // ============================================
  // EMAIL METHODS (Placeholder para futuro)
  // ============================================

  /**
   * Enviar email genérico
   * TODO: Implementar integração com serviço de email (SendGrid, SMTP, etc.)
   */
  private async sendEmail(config: EmailConfig): Promise<void> {
    try {
      console.log('[NotificationService] Email sending (not implemented yet):', config.subject);
      // TODO: Implementar com SendGrid ou SMTP
      // await emailClient.send(config);
    } catch (error) {
      console.error('[NotificationService] Error sending email:', error);
    }
  }

  // ============================================
  // WHATSAPP METHODS (Integração com WAHA)
  // ============================================

  /**
   * Enviar mensagem via WhatsApp usando WAHA existente
   */
  private async sendWhatsApp(data: WhatsAppMessage): Promise<void> {
    try {
      if (!this.wahaEnabled) {
        console.log('[NotificationService] WhatsApp disabled, skipping message');
        return;
      }

      // Integrar com sistema WAHA existente
      // O código WAHA já existe no projeto, vamos reutilizar
      console.log('[NotificationService] WhatsApp message to', data.phone, ':', data.message);

      // TODO: Chamar API WAHA para enviar mensagem
      // const wahaConfig = await getWahaConfig();
      // await sendWahaMessage(data.phone, data.message);

    } catch (error) {
      console.error('[NotificationService] Error sending WhatsApp:', error);
    }
  }

  // ============================================
  // SUBSCRIPTION NOTIFICATIONS
  // ============================================

  /**
   * Notificação: Assinatura ativada com sucesso
   */
  async sendSubscriptionActivated(user: User, plan: SubscriptionPlan): Promise<void> {
    try {
      const subject = '🎉 Assinatura ativada com sucesso!';
      const message = `
Olá ${user.nome}!

Sua assinatura do plano "${plan.name}" foi ativada com sucesso!

Agora você tem acesso completo a todos os recursos do FinanceHub.

Próximo pagamento: ${this.formatNextMonthDate()}

Qualquer dúvida, estamos à disposição!

FinanceHub Team
      `.trim();

      // Enviar email
      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      // Enviar WhatsApp se tiver telefone
      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendSubscriptionActivated:', error);
    }
  }

  /**
   * Notificação: Assinatura suspensa por falta de pagamento
   */
  async sendSubscriptionSuspended(user: User, reason: string): Promise<void> {
    try {
      const subject = '⚠️ Assinatura suspensa';
      const message = `
Olá ${user.nome},

Sua assinatura foi temporariamente suspensa: ${reason}

Para reativar seu acesso, por favor atualize sua forma de pagamento.

Acesse: ${process.env.BASE_URL}/billing/settings

FinanceHub Team
      `.trim();

      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendSubscriptionSuspended:', error);
    }
  }

  /**
   * Notificação: Assinatura cancelada
   */
  async sendSubscriptionCanceled(user: User, reason: string): Promise<void> {
    try {
      const subject = 'Assinatura cancelada';
      const message = `
Olá ${user.nome},

Sua assinatura foi cancelada conforme solicitado.

Motivo: ${reason}

Você ainda pode reativar sua assinatura a qualquer momento.

Sentiremos sua falta!

FinanceHub Team
      `.trim();

      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendSubscriptionCanceled:', error);
    }
  }

  // ============================================
  // PAYMENT NOTIFICATIONS
  // ============================================

  /**
   * Notificação: Pagamento confirmado
   */
  async sendPaymentConfirmed(user: User, amount: number, invoiceUrl?: string): Promise<void> {
    try {
      const subject = '✅ Pagamento confirmado';
      const message = `
Olá ${user.nome}!

Seu pagamento de R$ ${amount.toFixed(2)} foi confirmado com sucesso!

${invoiceUrl ? `Fatura: ${invoiceUrl}` : ''}

Obrigado por continuar conosco!

FinanceHub Team
      `.trim();

      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendPaymentConfirmed:', error);
    }
  }

  /**
   * Notificação: Falha no pagamento (tentativa N/3)
   */
  async sendPaymentFailed(user: User, retryCount: number): Promise<void> {
    try {
      const subject = `⚠️ Falha no pagamento - Tentativa ${retryCount}/3`;
      const message = `
Olá ${user.nome},

Não conseguimos processar seu pagamento.

Tentativa: ${retryCount} de 3

Por favor, verifique seus dados de pagamento ou atualize seu cartão de crédito.

Acesse: ${process.env.BASE_URL}/billing/settings

${retryCount === 2 ? 'ATENÇÃO: Na próxima falha, seu acesso será bloqueado.' : ''}

FinanceHub Team
      `.trim();

      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendPaymentFailed:', error);
    }
  }

  /**
   * Notificação: Pagamento falhou 3 vezes - Acesso bloqueado
   */
  async sendPaymentFailedFinal(user: User): Promise<void> {
    try {
      const subject = '🚫 Acesso bloqueado - Pagamento não processado';
      const message = `
Olá ${user.nome},

Após 3 tentativas, não conseguimos processar seu pagamento.

Seu acesso ao FinanceHub foi temporariamente bloqueado.

Para reativar, atualize sua forma de pagamento:
${process.env.BASE_URL}/billing/settings

FinanceHub Team
      `.trim();

      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendPaymentFailedFinal:', error);
    }
  }

  /**
   * Notificação: Lembrete de vencimento (7 dias antes)
   */
  async sendPaymentReminder(user: User, dueDate: Date, amount: number): Promise<void> {
    try {
      const subject = '📅 Lembrete: Próximo pagamento';
      const message = `
Olá ${user.nome},

Seu próximo pagamento vence em ${this.formatDate(dueDate)}.

Valor: R$ ${amount.toFixed(2)}

O pagamento será processado automaticamente no cartão cadastrado.

Caso deseje atualizar a forma de pagamento:
${process.env.BASE_URL}/billing/settings

FinanceHub Team
      `.trim();

      await this.sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: user.email,
        subject,
        body: message
      });

      if (user.telefone) {
        await this.sendWhatsApp({
          phone: user.telefone,
          message
        });
      }
    } catch (error) {
      console.error('[NotificationService] Error in sendPaymentReminder:', error);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Formatar data (DD/MM/YYYY)
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  /**
   * Calcular e formatar data do próximo mês
   */
  private formatNextMonthDate(): string {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return this.formatDate(nextMonth);
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

/**
 * Get singleton instance do NotificationService
 */
export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}

// Export default instance
export default getNotificationService();
