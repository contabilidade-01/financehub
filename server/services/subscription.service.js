"use strict";
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
exports.SubscriptionService = exports.CICLO_ASAAS = void 0;
exports.getSubscriptionService = getSubscriptionService;
const asaas_service_1 = require("./asaas.service");
const notification_service_1 = require("./notification.service");
const storage_1 = require("../storage");
const postgres_1 = __importDefault(require("postgres"));
// Cache do nome do sistema para evitar queries repetidas
let cachedSystemName = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
/**
 * Busca o nome do sistema configurado em system_settings
 */
async function getSystemName() {
    // Usar cache se ainda válido
    if (cachedSystemName && (Date.now() - cacheTimestamp) < CACHE_TTL) {
        return cachedSystemName;
    }
    try {
        const sql = (0, postgres_1.default)(process.env.DATABASE_URL || '', { prepare: false });
        const result = await sql `
      SELECT setting_value FROM system_settings WHERE setting_key = 'system_name' LIMIT 1
    `;
        await sql.end();
        if (result.length > 0 && result[0].setting_value) {
            cachedSystemName = result[0].setting_value;
            cacheTimestamp = Date.now();
            return cachedSystemName;
        }
    }
    catch (error) {
        console.warn('[SubscriptionService] Erro ao buscar system_name, usando padrão:', error);
    }
    return 'Khesef'; // Fallback
}
// Mapa ciclo → { cycle Asaas, meses } (preço = priceMonthly × meses)
exports.CICLO_ASAAS = {
    mensal: { cycle: 'MONTHLY', meses: 1 },
    trimestral: { cycle: 'QUARTERLY', meses: 3 },
    anual: { cycle: 'YEARLY', meses: 12 },
};
function addMeses(base, meses) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + meses);
    return d;
}
// ============================================
// SUBSCRIPTION SERVICE CLASS
// ============================================
class SubscriptionService {
    constructor(storage) {
        this.asaasService = null;
        this.storage = storage;
        this.notificationService = (0, notification_service_1.getNotificationService)();
    }
    // Lazy initialization do AsaasService
    async getAsaas() {
        if (!this.asaasService) {
            this.asaasService = await (0, asaas_service_1.getAsaasService)();
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
    async createSubscription(data) {
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
            // 4. Usar data atual para cobrar imediatamente (primeira cobrança)
            // Conforme doc Asaas: "informe o nextDueDate como a data atual" para cobrar na criação
            const nextDueDate = asaas_service_1.AsaasService.getTodayForAsaas();
            // 5. Buscar nome do sistema para descrição
            const systemName = await getSystemName();
            // 6. Criar assinatura no Asaas — ciclo (mensal/trimestral/anual) define o
            //    cycle Asaas e o valor (priceMonthly × meses).
            const cfgCiclo = exports.CICLO_ASAAS[data.ciclo || 'mensal'] || exports.CICLO_ASAAS.mensal;
            const valorCiclo = parseFloat(plan.priceMonthly.toString()) * cfgCiclo.meses;
            const asaasSubscription = await (await this.getAsaas()).createSubscription({
                customer: asaasCustomer.asaasCustomerId,
                billingType: 'CREDIT_CARD',
                cycle: cfgCiclo.cycle,
                value: valorCiclo,
                nextDueDate: nextDueDate,
                description: `Assinatura ${plan.name} (${data.ciclo || 'mensal'}) - ${systemName}`,
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
                // O período atual vai de hoje até o próximo mês
                currentPeriodEnd: new Date(asaas_service_1.AsaasService.calculateNextDueDate())
            });
            // 7. Buscar primeiro pagamento gerado pelo Asaas
            const asaasPayments = await (await this.getAsaas()).getSubscriptionPayments(asaasSubscription.id, { limit: 1 });
            let payment = null;
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
                }
                else {
                    console.log(`[SubscriptionService] Pagamento PENDENTE (${firstPayment.status}). Webhook de ativação será enviado quando PAYMENT_CONFIRMED chegar do Asaas.`);
                }
            }
            // 8. Enviar notificação de boas-vindas
            await this.notificationService.sendSubscriptionActivated(user, plan);
            return {
                subscription,
                payment: payment,
                success: true,
                message: 'Assinatura criada com sucesso'
            };
        }
        catch (error) {
            console.error('[SubscriptionService] Error creating subscription:', error);
            throw error;
        }
    }
    /**
     * Cria cobrança recorrente no Asaas SEM cartão e devolve a URL da página deles.
     * Enviamos nome/e-mail/telefone/CNPJ que já temos; o cliente só completa o que faltar (CPF/cartão/Pix).
     * A liberação do acesso continua automática no webhook PAYMENT_CONFIRMED / PAYMENT_RECEIVED.
     */
    async createHostedCheckout(userId, ciclo, cpfCnpjInformado) {
        var _a;
        const user = await this.storage.getUserById(userId);
        if (!user) {
            throw new Error('Usuário não encontrado');
        }
        const cfgCiclo = exports.CICLO_ASAAS[ciclo];
        if (!cfgCiclo) {
            throw new Error('Ciclo inválido (mensal | trimestral | anual)');
        }
        const plans = await this.storage.getActiveSubscriptionPlans();
        if (!plans.length) {
            throw new Error('Nenhum plano ativo. Crie um plano em Pagamentos antes de gerar o link.');
        }
        // O plano vem do TIPO do usuário (PF/PJ), não do "primeiro da lista" — que,
        // ordenada por preço, era sempre o mais barato e cobrava PJ como PF.
        const tipoPessoa = user.tipo_pessoa;
        if (!tipoPessoa) {
            throw new Error('Defina se o usuário é Pessoa Física ou Jurídica antes de gerar a cobrança.');
        }
        const candidatos = (0, storage_1.filtrarPlanosPorTipo)(plans, tipoPessoa);
        if (!candidatos.length) {
            const rotulo = tipoPessoa === 'juridica' ? 'Pessoa Jurídica' : 'Pessoa Física';
            throw new Error(`Nenhum plano ativo para ${rotulo}. Cadastre um plano desse tipo em Pagamentos.`);
        }
        if (candidatos.length > 1) {
            console.warn(`[Assinatura] ${candidatos.length} planos ativos para tipo '${tipoPessoa}'; usando o mais barato (${candidatos[0].planCode}). Mantenha um plano por tipo.`);
        }
        const plan = candidatos[0];
        const existingActive = await this.storage.getActiveSubscriptionByUserId(userId);
        if (existingActive) {
            throw new Error('Usuário já possui uma assinatura ativa');
        }
        const asaas = await this.getAsaas();
        // Reaproveita cobrança pendente já gerada (evita assinatura duplicada no Asaas)
        const existentes = await this.storage.getAllSubscriptionsByUserId(userId);
        const pendente = existentes.find((s) => s.status === 'pending' && s.asaasSubscriptionId);
        if (pendente === null || pendente === void 0 ? void 0 : pendente.asaasSubscriptionId) {
            const locais = await this.storage.getPaymentTransactionsBySubscriptionId(pendente.id);
            const localUrl = (_a = locais.find((p) => p.asaasInvoiceUrl && p.status === 'pending')) === null || _a === void 0 ? void 0 : _a.asaasInvoiceUrl;
            if (localUrl) {
                await this.storage.updateUser(userId, { ciclo_assinatura: ciclo });
                return { url: localUrl, ciclo };
            }
            try {
                const asaasPays = await asaas.getSubscriptionPayments(pendente.asaasSubscriptionId, { limit: 5 });
                const aberta = asaasPays.data.find((p) => p.invoiceUrl && (p.status === 'PENDING' || p.status === 'OVERDUE'));
                if (aberta === null || aberta === void 0 ? void 0 : aberta.invoiceUrl) {
                    await this.storage.updateUser(userId, { ciclo_assinatura: ciclo });
                    return { url: aberta.invoiceUrl, ciclo };
                }
            }
            catch (err) {
                console.warn('[SubscriptionService] Não reaproveitou cobrança pendente:', err);
            }
        }
        let cpfCnpj;
        const informado = (cpfCnpjInformado || '').replace(/\D/g, '');
        if (informado.length === 11 || informado.length === 14) {
            cpfCnpj = informado;
        }
        if (!cpfCnpj && user.tipo_pessoa === 'juridica') {
            const empresas = await this.storage.getEmpresasByUsuarioId(userId);
            const comCnpj = empresas.find((e) => e.cnpj && String(e.cnpj).replace(/\D/g, '').length === 14);
            if (comCnpj === null || comCnpj === void 0 ? void 0 : comCnpj.cnpj)
                cpfCnpj = String(comCnpj.cnpj).replace(/\D/g, '');
        }
        const customerCache = await this.storage.getAsaasCustomerByUserId(userId);
        if (!cpfCnpj && (customerCache === null || customerCache === void 0 ? void 0 : customerCache.cpfCnpj)) {
            cpfCnpj = customerCache.cpfCnpj.replace(/\D/g, '') || undefined;
        }
        if (!cpfCnpj || !asaas_service_1.AsaasService.validateCpfCnpj(cpfCnpj)) {
            throw new Error('Para criar esta cobrança é necessário informar o CPF ou CNPJ.');
        }
        let asaasCustomer = customerCache;
        if (!asaasCustomer) {
            const created = await asaas.createCustomer({
                name: user.nome,
                email: user.email,
                phone: user.telefone || undefined,
                mobilePhone: user.telefone || undefined,
                cpfCnpj,
            });
            asaasCustomer = await this.storage.createAsaasCustomer({
                usuarioId: userId,
                asaasCustomerId: created.id,
                cpfCnpj,
            });
        }
        else if (!asaasCustomer.cpfCnpj && cpfCnpj) {
            await asaas.updateCustomer(asaasCustomer.asaasCustomerId, { cpfCnpj });
            await this.storage.updateAsaasCustomer(asaasCustomer.id, { cpfCnpj });
        }
        const systemName = await getSystemName();
        const valorCiclo = parseFloat(plan.priceMonthly.toString()) * cfgCiclo.meses;
        const nextDueDate = asaas_service_1.AsaasService.getTodayForAsaas();
        const asaasSubscription = await asaas.createSubscription({
            customer: asaasCustomer.asaasCustomerId,
            billingType: 'UNDEFINED',
            cycle: cfgCiclo.cycle,
            value: valorCiclo,
            nextDueDate,
            description: `Assinatura ${plan.name} (${ciclo}) - ${systemName}`,
            externalReference: `user:${userId}`,
        });
        const periodEnd = addMeses(new Date(), cfgCiclo.meses);
        const subscription = await this.storage.createUserSubscription({
            usuarioId: userId,
            planId: plan.id,
            asaasSubscriptionId: asaasSubscription.id,
            status: 'pending',
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
        });
        await this.storage.updateUser(userId, { ciclo_assinatura: ciclo });
        const asaasPayments = await asaas.getSubscriptionPayments(asaasSubscription.id, { limit: 1 });
        if (!asaasPayments.data.length) {
            throw new Error('Asaas não gerou a cobrança. Tente novamente.');
        }
        const firstPayment = asaasPayments.data[0];
        if (!firstPayment.invoiceUrl) {
            throw new Error('Asaas não retornou o link da fatura.');
        }
        await this.storage.createPaymentTransaction({
            usuarioId: userId,
            subscriptionId: subscription.id,
            asaasPaymentId: firstPayment.id,
            asaasInvoiceUrl: firstPayment.invoiceUrl,
            amount: firstPayment.value.toString(),
            status: 'pending',
            paymentMethod: 'undefined',
            dueDate: firstPayment.dueDate,
            description: `Pagamento ${plan.name} (${ciclo})`,
            metadata: JSON.stringify(firstPayment),
        });
        console.log(`[SubscriptionService] Hosted checkout user=${userId} invoice=${firstPayment.invoiceUrl}`);
        return { url: firstPayment.invoiceUrl, ciclo };
    }
    /**
     * Ativar assinatura do usuário (após confirmação de pagamento)
     */
    async activateUserSubscription(userId, subscriptionId) {
        var _a;
        try {
            const user = await this.storage.getUserById(userId);
            const ciclo = (user === null || user === void 0 ? void 0 : user.ciclo_assinatura) || 'mensal';
            const meses = ((_a = exports.CICLO_ASAAS[ciclo]) === null || _a === void 0 ? void 0 : _a.meses) || 1;
            const agora = new Date();
            const periodEnd = addMeses(agora, meses);
            await this.storage.updateUserSubscription(subscriptionId, {
                status: 'active',
                currentPeriodStart: agora,
                currentPeriodEnd: periodEnd,
            });
            // Fonte de acesso do app é data_expiracao_assinatura — precisa ir junto.
            await this.storage.updateUser(userId, {
                ativo: true,
                subscriptionActive: true,
                status_assinatura: 'ativa',
                ciclo_assinatura: ciclo,
                data_expiracao_assinatura: periodEnd,
            });
            console.log(`[SubscriptionService] User ${userId} subscription activated until ${periodEnd.toISOString()}`);
        }
        catch (error) {
            console.error('[SubscriptionService] Error activating subscription:', error);
            throw error;
        }
    }
    /**
     * Enviar webhook de ativação (idêntico à ativação manual do admin)
     */
    async sendActivationWebhook(user) {
        try {
            console.log(`[SubscriptionService] Enviando webhook de ativação para usuário ${user.nome}...`);
            const postgres = (await Promise.resolve().then(() => __importStar(require('postgres')))).default;
            const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
            // Buscar mensagem de ativação personalizada
            const result = await client `
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
                activationMessage.email_content = this.notificationService.processMessageTags(activationMessage.email_content || activationMessage.message, user);
            }
            // Buscar token do usuário
            const userTokens = await this.storage.getApiTokensByUserId(user.id);
            const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;
            // IMPORTANTE: NÃO resetar a senha na confirmação de pagamento.
            // O cliente já usa o sistema (degustação) e a senha atual deve permanecer.
            // Resetar aqui (e não entregar) trancava o cliente para fora. A liberação
            // de acesso é feita por activateUserSubscription (data_expiracao_assinatura).
            // Enviar webhook de ativação com payload COMPLETO
            const webhookData = {
                evento: "usuario_ativado",
                timestamp: new Date().toISOString(),
                dominio: process.env.BASE_URL || 'https://app.controledinheiro.com.br',
                id: user.id,
                nome: user.nome,
                email: user.email,
                telefone: user.telefone,
                tipo_usuario: user.tipo_usuario,
                data_cadastro: user.data_cadastro,
                token: userToken,
                acesso_web: {
                    usuario: user.email
                },
                mensagem_ativacao: {
                    titulo: activationMessage.title,
                    mensagem: activationMessage.message,
                    conteudo_email: activationMessage.email_content
                }
            };
            console.log('[SubscriptionService] Sending activation webhook (payload com PII omitido do log)');
            // === N8N DESATIVADO — pipeline agora roda via app (POST /api/webhook/uazapi) ===
            // const webhookResponse = await fetch(
            //   process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao',
            //   {
            //     method: 'POST',
            //     headers: {
            //       'Content-Type': 'application/json',
            //     },
            //     body: JSON.stringify(webhookData)
            //   }
            // );
            //
            // if (webhookResponse.ok) {
            //   console.log('[SubscriptionService] Activation webhook sent successfully');
            // } else {
            //   console.error('[SubscriptionService] Error sending activation webhook:', webhookResponse.status);
            // }
            console.log('[SubscriptionService] ✅ Webhook N8N desativado — ativação via pipeline interno.');
            await client.end();
        }
        catch (error) {
            console.error('[SubscriptionService] Error sending activation webhook:', error);
            // Não falhar a operação principal se o webhook falhar
        }
    }
    /**
     * Desativar assinatura do usuário (pagamento atrasado)
     */
    async deactivateUserSubscription(userId, subscriptionId, reason) {
        try {
            // Atualizar subscription
            await this.storage.updateUserSubscription(subscriptionId, {
                status: 'past_due'
            });
            // Atualizar usuário. IMPORTANTE: o acesso do app é regido por
            // data_expiracao_assinatura — para o corte ter efeito, retroagi-la para
            // agora. Usado em estorno/chargeback/pagamento desfeito/3 falhas (corte
            // imediato). Cancelamento voluntário é tratado à parte (mantém o ciclo pago).
            await this.storage.updateUser(userId, {
                subscriptionActive: false,
                status_assinatura: 'inativa',
                data_expiracao_assinatura: new Date(),
            });
            // Enviar notificação
            const user = await this.storage.getUserById(userId);
            if (user) {
                await this.notificationService.sendSubscriptionSuspended(user, reason);
            }
            console.log(`[SubscriptionService] User ${userId} subscription deactivated: ${reason}`);
        }
        catch (error) {
            console.error('[SubscriptionService] Error deactivating subscription:', error);
            throw error;
        }
    }
    /**
     * Cancelar assinatura (usuário pede para sair).
     * Política: NÃO corta o acesso na hora — mantém data_expiracao_assinatura
     * (ciclo já pago). Só impede a próxima cobrança no Asaas.
     */
    async cancelSubscription(userId, reason) {
        try {
            const subscription = await this.storage.getActiveSubscriptionByUserId(userId);
            if (subscription) {
                if (subscription.asaasSubscriptionId) {
                    await (await this.getAsaas()).cancelSubscription(subscription.asaasSubscriptionId);
                }
                await this.storage.updateUserSubscription(subscription.id, {
                    status: 'canceled',
                    canceledAt: new Date(),
                    cancellationReason: reason
                });
            }
            await this.storage.updateUser(userId, {
                subscriptionActive: false,
                status_assinatura: 'cancelada',
                data_cancelamento: new Date(),
                motivo_cancelamento: reason
            });
            await this.storage.createCancellationHistory({
                usuario_id: userId,
                motivo_cancelamento: reason,
                tipo_cancelamento: 'voluntario'
            });
            const user = await this.storage.getUserById(userId);
            if (user) {
                await this.notificationService.sendSubscriptionCanceled(user, reason);
            }
            console.log(`[SubscriptionService] User ${userId} subscription canceled (acesso até o fim do ciclo)`);
        }
        catch (error) {
            console.error('[SubscriptionService] Error canceling subscription:', error);
            throw error;
        }
    }
    /**
     * Processar falha de pagamento (webhook ou job)
     */
    async handlePaymentFailure(paymentId, retryCount) {
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
                await this.deactivateUserSubscription(payment.usuarioId, payment.subscriptionId, 'Pagamento não processado após 3 tentativas');
                const user = await this.storage.getUserById(payment.usuarioId);
                if (user) {
                    await this.notificationService.sendPaymentFailedFinal(user);
                }
            }
            else {
                // Enviar notificação de tentativa
                const user = await this.storage.getUserById(payment.usuarioId);
                if (user) {
                    await this.notificationService.sendPaymentFailed(user, retryCount);
                }
            }
            console.log(`[SubscriptionService] Payment failure handled for payment ${paymentId}, retry ${retryCount}/3`);
        }
        catch (error) {
            console.error('[SubscriptionService] Error handling payment failure:', error);
            throw error;
        }
    }
    /**
     * Sincronizar status de assinatura com Asaas
     */
    async syncSubscriptionStatus(userId) {
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
        }
        catch (error) {
            console.error('[SubscriptionService] Error syncing subscription status:', error);
            throw error;
        }
    }
    /**
     * Verificar se usuário tem acesso ativo
     */
    async checkUserAccess(userId) {
        try {
            const user = await this.storage.getUserById(userId);
            if (!user)
                return false;
            // Admin/superadmin sempre têm acesso
            if (user.tipo_usuario === 'super_admin' || user.tipo_usuario === 'admin')
                return true;
            // Fonte ÚNICA de verdade: tem acesso = data de expiração no futuro.
            // (trial ou assinatura paga ambos gravam data_expiracao_assinatura;
            // acesso ilimitado = data bem no futuro definida pelo admin.)
            const venc = user.data_expiracao_assinatura ? new Date(user.data_expiracao_assinatura) : null;
            const temAcesso = !!venc && venc.getTime() > Date.now();
            // Mantém o campo denormalizado honesto (espelho).
            if ((user.subscriptionActive || false) !== temAcesso) {
                try {
                    await this.storage.updateUser(userId, { subscriptionActive: temAcesso });
                }
                catch ( /* não bloquear por erro de sync */_a) { /* não bloquear por erro de sync */ }
            }
            return temAcesso;
        }
        catch (error) {
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
    mapAsaasPaymentStatus(asaasStatus) {
        const statusMap = {
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
    mapAsaasSubscriptionStatus(asaasStatus) {
        const statusMap = {
            'ACTIVE': 'active',
            'INACTIVE': 'canceled',
            'EXPIRED': 'expired'
        };
        return statusMap[asaasStatus] || 'active';
    }
}
exports.SubscriptionService = SubscriptionService;
// Singleton instance
let subscriptionServiceInstance = null;
/**
 * Get singleton instance do SubscriptionService
 */
function getSubscriptionService(storage) {
    if (!subscriptionServiceInstance) {
        subscriptionServiceInstance = new SubscriptionService(storage);
    }
    return subscriptionServiceInstance;
}
