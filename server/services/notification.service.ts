/**
 * Notification Service
 *
 * Serviço responsável por enviar notificações (email, WhatsApp, etc.)
 * Integra com sistema WAHA existente para WhatsApp
 *
 * Princípio DRY: Centraliza toda lógica de notificações
 */

import type { User, SubscriptionPlan } from '@shared/schema';
import { generateCheckoutToken } from '../utils/checkout-token.utils';

// Importação condicional do nodemailer (só carrega se EMAIL_ENABLED=true)
type Transporter = any;

// ============================================
// INTERFACES
// ============================================

export interface EmailConfig {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
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
  private emailEnabled: boolean;
  private emailTransporter: Transporter | null = null;
  private emailInitialized: boolean = false;

  constructor() {
    this.wahaEnabled = process.env.WAHA_ENABLED === 'true';
    this.emailEnabled = process.env.EMAIL_ENABLED === 'true';

    // Nota: Inicialização do email será feita de forma lazy quando necessário
  }

  /**
   * Garante que o email transporter está inicializado
   */
  private async ensureEmailInitialized(): Promise<void> {
    if (this.emailEnabled && !this.emailInitialized) {
      await this.initializeEmailTransporter();
      this.emailInitialized = true;
    }
  }

  // ============================================
  // EMAIL METHODS
  // ============================================

  /**
   * Inicializar transporter de email (SMTP ou SendGrid)
   */
  private async initializeEmailTransporter() {
    try {
      // Importação dinâmica do nodemailer (só carrega se realmente necessário)
      const nodemailer = await import('nodemailer').catch(() => {
        console.warn('[NotificationService] nodemailer não instalado. Para usar email, instale: npm install nodemailer');
        return null;
      });

      if (!nodemailer) {
        this.emailEnabled = false;
        return;
      }

      const emailService = process.env.EMAIL_SERVICE || 'smtp';

      if (emailService === 'sendgrid') {
        // SendGrid configuration
        this.emailTransporter = nodemailer.createTransport({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        });
        console.log('[NotificationService] Email transporter initialized: SendGrid');
      } else {
        // SMTP configuration (Gmail, Outlook, etc.)
        this.emailTransporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        });
        console.log('[NotificationService] Email transporter initialized: SMTP');
      }
    } catch (error) {
      console.error('[NotificationService] Error initializing email transporter:', error);
      this.emailEnabled = false;
    }
  }

  /**
   * Enviar email genérico
   */
  private async sendEmail(config: EmailConfig): Promise<void> {
    try {
      await this.ensureEmailInitialized();

      if (!this.emailEnabled || !this.emailTransporter) {
        console.log('[NotificationService] Email disabled or not configured, skipping:', config.subject);
        return;
      }

      // Converter mensagem de texto para HTML básico
      const htmlBody = config.html || this.textToHtml(config.body);

      const mailOptions = {
        from: config.from || process.env.EMAIL_FROM || 'noreply@financehub.com',
        to: config.to,
        subject: config.subject,
        text: config.body,
        html: htmlBody
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      console.log('[NotificationService] Email sent successfully:', info.messageId);
      console.log('  To:', config.to);
      console.log('  Subject:', config.subject);
    } catch (error) {
      console.error('[NotificationService] Error sending email:', error);
      throw error;
    }
  }

  /**
   * Converter texto simples para HTML básico
   */
  private textToHtml(text: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #f9f9f9;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .logo {
      text-align: center;
      margin-bottom: 20px;
    }
    .content {
      background-color: white;
      padding: 20px;
      border-radius: 4px;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h2 style="color: #4CAF50; margin: 0;">FinanceHub</h2>
    </div>
    <div class="content">
      ${text.split('\n').map(line => `<p>${line}</p>`).join('')}
    </div>
    <div class="footer">
      <p>Este é um email automático. Por favor, não responda.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
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
   * Gerar link de pagamento para checkout externo
   * @param userId - ID do usuário
   * @param email - Email do usuário
   * @returns URL completa para checkout externo com token
   */
  generatePaymentLink(userId: number, email: string): string {
    const token = generateCheckoutToken(userId, email);
    const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:5000';
    const link = `${frontendUrl}/checkout/plans?tokenaccess=${token}`;
    console.log(`[NotificationService] Payment link generated - userId: ${userId}, email: ${email}, token: ${token}`);
    return link;
  }

  /**
   * Processar tags em mensagens (substituir variáveis)
   * @param text - Texto com tags a serem substituídas
   * @param user - Dados do usuário
   * @param additionalVars - Variáveis adicionais opcionais
   * @returns Texto com tags substituídas
   */
  processMessageTags(text: string, user: User, additionalVars?: Record<string, string>): string {
    if (!text) return '';

    let processed = text;

    // Tags padrão do usuário
    processed = processed.replace(/{nome}/g, user.nome || '');
    processed = processed.replace(/{email}/g, user.email || '');
    processed = processed.replace(/{telefone}/g, user.telefone?.toString() || '');

    // Tag de link de pagamento
    if (processed.includes('{link_pagamento}')) {
      const paymentLink = this.generatePaymentLink(user.id, user.email);
      processed = processed.replace(/{link_pagamento}/g, paymentLink);
    }

    // Variáveis adicionais personalizadas
    if (additionalVars) {
      Object.keys(additionalVars).forEach(key => {
        const tag = `{${key}}`;
        processed = processed.replace(new RegExp(tag, 'g'), additionalVars[key]);
      });
    }

    return processed;
  }

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
