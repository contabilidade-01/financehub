"use strict";
/**
 * Asaas Payment Gateway Service
 *
 * Serviço responsável pela comunicação com a API do Asaas.
 * Implementa o padrão Single Responsibility Principle (SOLID).
 *
 * Source of Truth: Asaas API
 * Este serviço apenas comunica com o Asaas, não contém lógica de negócio.
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
exports.AsaasService = void 0;
exports.getAsaasService = getAsaasService;
exports.reinitializeAsaasService = reinitializeAsaasService;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
// Comparação de segredo resistente a timing attack (comprimentos diferentes → false).
function segredosIguais(a, b) {
    const ba = Buffer.from(String(a !== null && a !== void 0 ? a : ''), 'utf8');
    const bb = Buffer.from(String(b !== null && b !== void 0 ? b : ''), 'utf8');
    if (ba.length !== bb.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(ba, bb);
}
// ============================================
// ASAAS SERVICE CLASS
// ============================================
class AsaasService {
    constructor(apiKey, environment) {
        // Tentar carregar do banco de dados primeiro, depois .env, depois parâmetros
        this.apiKey = apiKey || process.env.ASAAS_API_KEY || '';
        this.environment = environment || process.env.ASAAS_ENVIRONMENT || 'sandbox';
        // Debug log para verificar se a chave está sendo carregada
        if (!this.apiKey) {
            console.error('⚠️ ASAAS_API_KEY não configurada (nem no banco, nem no .env)');
        }
        else {
            console.log('✅ Asaas configurado:', {
                environment: this.environment,
                apiKeyLength: this.apiKey.length,
                apiKeyPrefix: this.apiKey.substring(0, 15) + '...',
                source: apiKey ? 'database' : 'env'
            });
        }
        // Define base URL baseado no ambiente
        this.baseURL = this.environment === 'production'
            ? 'https://www.asaas.com/api/v3'
            : 'https://sandbox.asaas.com/api/v3';
        // Configurar cliente Axios
        this.client = axios_1.default.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/json',
                'access_token': this.apiKey
            },
            timeout: 60000 // 60 segundos conforme recomendação Asaas
        });
        // Interceptor para logging (desenvolvimento)
        if (this.environment === 'sandbox') {
            this.client.interceptors.request.use((config) => {
                var _a;
                console.log(`[Asaas API] ${(_a = config.method) === null || _a === void 0 ? void 0 : _a.toUpperCase()} ${config.url}`);
                return config;
            });
        }
        // Interceptor para tratamento de erros
        this.client.interceptors.response.use((response) => response, (error) => {
            var _a, _b;
            if (error.response) {
                const asaasError = error.response.data;
                const errorMessage = ((_b = (_a = asaasError.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.description) || asaasError.message || 'Erro desconhecido';
                console.error(`[Asaas API Error] ${error.response.status}: ${errorMessage}`);
                throw new Error(`Asaas API: ${errorMessage}`);
            }
            throw error;
        });
    }
    // ============================================
    // CUSTOMER METHODS
    // ============================================
    /**
     * Criar um novo cliente no Asaas
     */
    async createCustomer(customerData) {
        try {
            const response = await this.client.post('/customers', customerData);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error creating customer:', error);
            throw error;
        }
    }
    /**
     * Buscar cliente pelo ID
     */
    async getCustomer(customerId) {
        try {
            const response = await this.client.get(`/customers/${customerId}`);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error fetching customer:', error);
            throw error;
        }
    }
    /**
     * Atualizar dados de um cliente
     */
    async updateCustomer(customerId, customerData) {
        try {
            const response = await this.client.put(`/customers/${customerId}`, customerData);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error updating customer:', error);
            throw error;
        }
    }
    // ============================================
    // SUBSCRIPTION METHODS
    // ============================================
    /**
     * Criar uma nova assinatura
     */
    async createSubscription(subscriptionData) {
        try {
            const response = await this.client.post('/subscriptions', subscriptionData);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error creating subscription:', error);
            throw error;
        }
    }
    /**
     * Buscar assinatura pelo ID
     */
    async getSubscription(subscriptionId) {
        try {
            const response = await this.client.get(`/subscriptions/${subscriptionId}`);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error fetching subscription:', error);
            throw error;
        }
    }
    /**
     * Atualizar assinatura existente
     */
    async updateSubscription(subscriptionId, updateData) {
        try {
            const response = await this.client.put(`/subscriptions/${subscriptionId}`, updateData);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error updating subscription:', error);
            throw error;
        }
    }
    /**
     * Cancelar assinatura
     */
    async cancelSubscription(subscriptionId) {
        try {
            const response = await this.client.delete(`/subscriptions/${subscriptionId}`);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error canceling subscription:', error);
            throw error;
        }
    }
    /**
     * Atualizar cartão de crédito de uma assinatura
     */
    async updateSubscriptionCreditCard(subscriptionId, cardData) {
        try {
            const response = await this.client.put(`/subscriptions/${subscriptionId}/creditCard`, cardData);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error updating subscription credit card:', error);
            throw error;
        }
    }
    // ============================================
    // PAYMENT METHODS
    // ============================================
    /**
     * Criar um pagamento avulso
     */
    async createPayment(paymentData) {
        try {
            const response = await this.client.post('/payments', paymentData);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error creating payment:', error);
            throw error;
        }
    }
    /**
     * Buscar pagamento pelo ID
     */
    async getPayment(paymentId) {
        try {
            const response = await this.client.get(`/payments/${paymentId}`);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error fetching payment:', error);
            throw error;
        }
    }
    /**
     * Listar cobranças de uma assinatura
     */
    async getSubscriptionPayments(subscriptionId, params) {
        try {
            const response = await this.client.get(`/subscriptions/${subscriptionId}/payments`, { params });
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error fetching subscription payments:', error);
            throw error;
        }
    }
    /**
     * Listar pagamentos de um cliente
     */
    async getCustomerPayments(customerId, params) {
        try {
            const response = await this.client.get('/payments', {
                params: Object.assign({ customer: customerId }, params)
            });
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error fetching customer payments:', error);
            throw error;
        }
    }
    /**
     * Estornar/Reembolsar um pagamento
     */
    async refundPayment(paymentId) {
        try {
            const response = await this.client.post(`/payments/${paymentId}/refund`);
            return response.data;
        }
        catch (error) {
            console.error('[AsaasService] Error refunding payment:', error);
            throw error;
        }
    }
    // ============================================
    // WEBHOOK VERIFICATION
    // ============================================
    /**
     * Verificar se webhook é válido (validação simples por token)
     * Verifica primeiro no banco de dados, depois no .env como fallback
     * Para produção, implementar validação por assinatura se disponível
     */
    async verifyWebhook(requestToken) {
        if (!requestToken) {
            console.warn('[AsaasService] No webhook token provided');
            return false;
        }
        // Tentar buscar webhook secret do banco de dados primeiro
        try {
            const { db } = await Promise.resolve().then(() => __importStar(require('../db')));
            const { paymentSettings } = await Promise.resolve().then(() => __importStar(require("../../shared/schema")));
            const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            const settings = await db
                .select()
                .from(paymentSettings)
                .where(eq(paymentSettings.provider, 'asaas'))
                .limit(1);
            if (settings.length > 0 && settings[0].webhookSecret) {
                const isValid = segredosIguais(requestToken, settings[0].webhookSecret);
                if (isValid) {
                    console.log('[AsaasService] Webhook validated with database token');
                }
                else {
                    console.warn('[AsaasService] Webhook token does not match database token');
                }
                return isValid;
            }
        }
        catch (error) {
            console.warn('[AsaasService] Error fetching webhook secret from database, falling back to env:', error);
        }
        // Fallback para variável de ambiente
        const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.warn('[AsaasService] ASAAS_WEBHOOK_SECRET not configured (neither in database nor in .env)');
            return false;
        }
        const isValid = segredosIguais(requestToken, webhookSecret);
        if (isValid) {
            console.log('[AsaasService] Webhook validated with environment variable');
        }
        else {
            console.warn('[AsaasService] Webhook token does not match environment variable');
        }
        return isValid;
    }
    // ============================================
    // UTILITY METHODS
    // ============================================
    /**
     * Formatar data para o padrão Asaas (YYYY-MM-DD)
     */
    static formatDateForAsaas(date) {
        return date.toISOString().split('T')[0];
    }
    /**
     * Calcular próxima data de vencimento (adiciona 1 mês)
     */
    static calculateNextDueDate(currentDate = new Date()) {
        const nextMonth = new Date(currentDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return this.formatDateForAsaas(nextMonth);
    }
    /**
     * Obter data atual formatada para o Asaas (YYYY-MM-DD)
     * Usado para cobrar imediatamente na criação da assinatura
     */
    static getTodayForAsaas() {
        return this.formatDateForAsaas(new Date());
    }
    /**
     * Validar CPF/CNPJ (validação básica de formato)
     */
    static validateCpfCnpj(cpfCnpj) {
        const cleaned = cpfCnpj.replace(/\D/g, '');
        return cleaned.length === 11 || cleaned.length === 14;
    }
    /**
     * Testar conexão com a API do Asaas
     */
    async testConnection() {
        var _a, _b, _c, _d, _e, _f;
        try {
            // Fazer uma requisição simples para verificar se a API key está válida
            // Endpoint de listar clientes com limit=1 é leve e eficiente para teste
            const response = await this.client.get('/customers', {
                params: { limit: 1 }
            });
            return {
                success: true,
                environment: this.environment,
                baseURL: this.baseURL,
                message: 'Conexão estabelecida com sucesso'
            };
        }
        catch (error) {
            throw new Error(((_d = (_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.errors) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.description) ||
                ((_f = (_e = error.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.message) ||
                'Falha ao conectar com Asaas');
        }
    }
    /**
     * Obter status da conexão
     */
    getServiceInfo() {
        return {
            environment: this.environment,
            baseURL: this.baseURL,
            configured: !!this.apiKey
        };
    }
}
exports.AsaasService = AsaasService;
// Singleton instance
let asaasServiceInstance = null;
/**
 * Carregar configurações do banco de dados
 */
async function loadConfigFromDatabase() {
    try {
        const { db } = await Promise.resolve().then(() => __importStar(require('../db')));
        const { paymentSettings } = await Promise.resolve().then(() => __importStar(require("../../shared/schema")));
        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const settings = await db
            .select()
            .from(paymentSettings)
            .where(eq(paymentSettings.provider, 'asaas'))
            .limit(1);
        if (settings.length > 0 && settings[0].enabled && settings[0].apiKey) {
            return {
                apiKey: settings[0].apiKey,
                environment: settings[0].environment
            };
        }
    }
    catch (error) {
        console.warn('⚠️ Erro ao carregar configurações do banco, usando .env:', error);
    }
    return null;
}
/**
 * Get singleton instance do AsaasService
 * Padrão Singleton para garantir uma única instância
 * Carrega configurações do banco de dados primeiro, senão usa .env
 */
async function getAsaasService() {
    if (!asaasServiceInstance) {
        const dbConfig = await loadConfigFromDatabase();
        if (dbConfig) {
            asaasServiceInstance = new AsaasService(dbConfig.apiKey, dbConfig.environment);
        }
        else {
            asaasServiceInstance = new AsaasService();
        }
    }
    return asaasServiceInstance;
}
/**
 * Reinicializar o serviço Asaas com novas configurações
 * Usado quando as configurações são atualizadas via admin
 */
async function reinitializeAsaasService() {
    asaasServiceInstance = null;
    await getAsaasService();
}
// Export default - para compatibilidade com imports síncronos
exports.default = {
    getInstance: getAsaasService
};
