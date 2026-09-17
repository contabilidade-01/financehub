"use strict";
/**
 * Notification Service
 *
 * Serviço responsável por enviar notificações (email, WhatsApp, etc.)
 * Integra com sistema WAHA existente para WhatsApp
 *
 * Princípio DRY: Centraliza toda lógica de notificações
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
exports.getNotificationService = getNotificationService;
const checkout_token_utils_1 = require("../utils/checkout-token.utils");
const postgres_1 = __importDefault(require("postgres"));
let cachedSystemConfig = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
/**
 * Busca as configurações do sistema (nome e email de suporte)
 */
async function getSystemConfig() {
    // Usar cache se ainda válido
    if (cachedSystemConfig && (Date.now() - cacheTimestamp) < CACHE_TTL) {
        return cachedSystemConfig;
    }
    const defaults = {
        system_name: 'Khesef',
        support_email: 'suporte@controledinheiro.com.br'
    };
    try {
        const sql = (0, postgres_1.default)(process.env.DATABASE_URL || '', { prepare: false });
        const result = await sql `
      SELECT setting_key, setting_value
      FROM system_settings
      WHERE setting_key IN ('system_name', 'support_email')
    `;
        await sql.end();
        const config = Object.assign({}, defaults);
        result.forEach((row) => {
            if (row.setting_key === 'system_name' && row.setting_value) {
                config.system_name = row.setting_value;
            }
            if (row.setting_key === 'support_email' && row.setting_value) {
                config.support_email = row.setting_value;
            }
        });
        cachedSystemConfig = config;
        cacheTimestamp = Date.now();
        return config;
    }
    catch (error) {
        console.warn('[NotificationService] Erro ao buscar system config, usando padrão:', error);
    }
    return defaults;
}
// ============================================
// NOTIFICATION SERVICE CLASS
// ============================================
class NotificationService {
    constructor() {
        this.emailTransporter = null;
        this.emailInitialized = false;
        this.wahaEnabled = process.env.WAHA_ENABLED === 'true';
        // Liga se EMAIL_ENABLED=true OU se SMTP estiver completo (padrão nescon-clientes)
        const smtpReady = Boolean(process.env.SMTP_HOST &&
            process.env.SMTP_USER &&
            (process.env.SMTP_PASS || process.env.SMTP_PASSWORD) &&
            (process.env.SMTP_FROM || process.env.EMAIL_FROM));
        this.emailEnabled =
            process.env.EMAIL_ENABLED === 'true' ||
                (process.env.EMAIL_ENABLED !== 'false' && smtpReady);
        // Nota: Inicialização do email será feita de forma lazy quando necessário
    }
    /**
     * Garante que o email transporter está inicializado
     */
    async ensureEmailInitialized() {
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
    async initializeEmailTransporter() {
        try {
            // Importação dinâmica do nodemailer (só carrega se realmente necessário)
            const nodemailer = await Promise.resolve().then(() => __importStar(require('nodemailer'))).catch(() => {
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
            }
            else {
                // SMTP — mesmas vars do nescon-clientes (SMTP_PASS); aceita SMTP_PASSWORD legado
                const port = parseInt(process.env.SMTP_PORT || '587', 10);
                const secure = process.env.SMTP_SECURE === 'true' ||
                    process.env.SMTP_SECURE === '1' ||
                    port === 465;
                this.emailTransporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST || 'smtp.gmail.com',
                    port,
                    secure,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
                    }
                });
                console.log('[NotificationService] Email transporter initialized: SMTP');
            }
        }
        catch (error) {
            console.error('[NotificationService] Error initializing email transporter:', error);
            this.emailEnabled = false;
        }
    }
    /**
     * Enviar email genérico
     */
    async sendEmail(config) {
        try {
            await this.ensureEmailInitialized();
            if (!this.emailEnabled || !this.emailTransporter) {
                console.log('[NotificationService] Email disabled or not configured, skipping:', config.subject);
                return;
            }
            // Buscar configurações do sistema
            const systemConfig = await getSystemConfig();
            // Converter mensagem de texto para HTML básico
            const htmlBody = config.html || this.textToHtml(config.body, systemConfig.system_name);
            // Remetente: SMTP_FROM (nescon) ou EMAIL_FROM (legado)
            const defaultFrom = process.env.SMTP_FROM ||
                process.env.EMAIL_FROM ||
                `noreply@${systemConfig.support_email.split('@')[1] || 'sistema.com'}`;
            const mailOptions = {
                from: config.from || defaultFrom,
                to: config.to,
                subject: config.subject,
                text: config.body,
                html: htmlBody
            };
            const info = await this.emailTransporter.sendMail(mailOptions);
            console.log('[NotificationService] Email sent successfully:', info.messageId);
            console.log('  To:', config.to);
            console.log('  Subject:', config.subject);
        }
        catch (error) {
            console.error('[NotificationService] Error sending email:', error);
            throw error;
        }
    }
    /**
     * Converter texto simples para HTML básico
     */
    textToHtml(text, systemName = 'Khesef') {
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
      <h2 style="color: #4CAF50; margin: 0;">${systemName}</h2>
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
    async sendWhatsApp(data) {
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
        }
        catch (error) {
            console.error('[NotificationService] Error sending WhatsApp:', error);
        }
    }
    // ============================================
    // SUBSCRIPTION NOTIFICATIONS
    // ============================================
    /**
     * Notificação: Assinatura ativada com sucesso
     */
    async sendSubscriptionActivated(user, plan) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = '🎉 Assinatura ativada com sucesso!';
            const message = `
Olá ${user.nome}!

Sua assinatura do plano "${plan.name}" foi ativada com sucesso!

Agora você tem acesso completo a todos os recursos do ${systemConfig.system_name}.

Próximo pagamento: ${this.formatNextMonthDate()}

Qualquer dúvida, estamos à disposição!

${systemConfig.system_name} Team
      `.trim();
            // Enviar email
            await this.sendEmail({
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
        }
        catch (error) {
            console.error('[NotificationService] Error in sendSubscriptionActivated:', error);
        }
    }
    /**
     * Notificação: Assinatura suspensa por falta de pagamento
     */
    async sendSubscriptionSuspended(user, reason) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = '⚠️ Assinatura suspensa';
            const message = `
Olá ${user.nome},

Sua assinatura foi temporariamente suspensa: ${reason}

Para reativar seu acesso, por favor atualize sua forma de pagamento.

Acesse: ${process.env.BASE_URL}/billing/settings

${systemConfig.system_name} Team
      `.trim();
            await this.sendEmail({
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
        }
        catch (error) {
            console.error('[NotificationService] Error in sendSubscriptionSuspended:', error);
        }
    }
    /**
     * Notificação: Assinatura cancelada
     */
    async sendSubscriptionCanceled(user, reason) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = 'Assinatura cancelada';
            const message = `
Olá ${user.nome},

Sua assinatura foi cancelada conforme solicitado.

Motivo: ${reason}

Você ainda pode reativar sua assinatura a qualquer momento.

Sentiremos sua falta!

${systemConfig.system_name} Team
      `.trim();
            await this.sendEmail({
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
        }
        catch (error) {
            console.error('[NotificationService] Error in sendSubscriptionCanceled:', error);
        }
    }
    // ============================================
    // PAYMENT NOTIFICATIONS
    // ============================================
    /**
     * Notificação: Pagamento confirmado
     */
    async sendPaymentConfirmed(user, amount, invoiceUrl) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = '✅ Pagamento confirmado';
            const message = `
Olá ${user.nome}!

Seu pagamento de R$ ${amount.toFixed(2)} foi confirmado com sucesso!

${invoiceUrl ? `Fatura: ${invoiceUrl}` : ''}

Obrigado por continuar conosco!

${systemConfig.system_name} Team
      `.trim();
            await this.sendEmail({
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
        }
        catch (error) {
            console.error('[NotificationService] Error in sendPaymentConfirmed:', error);
        }
    }
    /**
     * Notificação: Falha no pagamento (tentativa N/3)
     */
    async sendPaymentFailed(user, retryCount) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = `⚠️ Falha no pagamento - Tentativa ${retryCount}/3`;
            const message = `
Olá ${user.nome},

Não conseguimos processar seu pagamento.

Tentativa: ${retryCount} de 3

Por favor, verifique seus dados de pagamento ou atualize seu cartão de crédito.

Acesse: ${process.env.BASE_URL}/billing/settings

${retryCount === 2 ? 'ATENÇÃO: Na próxima falha, seu acesso será bloqueado.' : ''}

${systemConfig.system_name} Team
      `.trim();
            await this.sendEmail({
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
        }
        catch (error) {
            console.error('[NotificationService] Error in sendPaymentFailed:', error);
        }
    }
    /**
     * Notificação: Pagamento falhou 3 vezes - Acesso bloqueado
     */
    async sendPaymentFailedFinal(user) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = '🚫 Acesso bloqueado - Pagamento não processado';
            const message = `
Olá ${user.nome},

Após 3 tentativas, não conseguimos processar seu pagamento.

Seu acesso ao ${systemConfig.system_name} foi temporariamente bloqueado.

Para reativar, atualize sua forma de pagamento:
${process.env.BASE_URL}/billing/settings

${systemConfig.system_name} Team
      `.trim();
            await this.sendEmail({
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
        }
        catch (error) {
            console.error('[NotificationService] Error in sendPaymentFailedFinal:', error);
        }
    }
    /**
     * Notificação: Lembrete de vencimento (7 dias antes)
     */
    async sendPaymentReminder(user, dueDate, amount) {
        try {
            const systemConfig = await getSystemConfig();
            const subject = '📅 Lembrete: Próximo pagamento';
            const message = `
Olá ${user.nome},

Seu próximo pagamento vence em ${this.formatDate(dueDate)}.

Valor: R$ ${amount.toFixed(2)}

O pagamento será processado automaticamente no cartão cadastrado.

Caso deseje atualizar a forma de pagamento:
${process.env.BASE_URL}/billing/settings

${systemConfig.system_name} Team
      `.trim();
            await this.sendEmail({
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
        }
        catch (error) {
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
    generatePaymentLink(userId, email) {
        const token = (0, checkout_token_utils_1.generateCheckoutToken)(userId, email);
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
    processMessageTags(text, user, additionalVars) {
        var _a;
        if (!text)
            return '';
        let processed = text;
        // Tags padrão do usuário
        processed = processed.replace(/{nome}/g, user.nome || '');
        processed = processed.replace(/{email}/g, user.email || '');
        processed = processed.replace(/{telefone}/g, ((_a = user.telefone) === null || _a === void 0 ? void 0 : _a.toString()) || '');
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
    formatDate(date) {
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
    /**
     * Calcular e formatar data do próximo mês
     */
    formatNextMonthDate() {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return this.formatDate(nextMonth);
    }
}
exports.NotificationService = NotificationService;
// Singleton instance
let notificationServiceInstance = null;
/**
 * Get singleton instance do NotificationService
 */
function getNotificationService() {
    if (!notificationServiceInstance) {
        notificationServiceInstance = new NotificationService();
    }
    return notificationServiceInstance;
}
// Export default instance
exports.default = getNotificationService();
