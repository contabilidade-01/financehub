/**
 * Asaas Payment Gateway Service
 *
 * Serviço responsável pela comunicação com a API do Asaas.
 * Implementa o padrão Single Responsibility Principle (SOLID).
 *
 * Source of Truth: Asaas API
 * Este serviço apenas comunica com o Asaas, não contém lógica de negócio.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================
// INTERFACES - Asaas API Types
// ============================================

export interface AsaasCustomerData {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  notificationDisabled?: boolean;
}

export interface AsaasCustomerResponse {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  dateCreated: string;
  object: string;
}

export interface AsaasCreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface AsaasCreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
  phone: string;
  mobilePhone?: string;
}

export interface AsaasSubscriptionData {
  customer: string; // Asaas customer ID
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description?: string;
  discount?: {
    value: number;
    dueDateLimitDays?: number;
  };
  interest?: {
    value: number;
  };
  fine?: {
    value: number;
  };
  creditCard?: AsaasCreditCardData;
  creditCardHolderInfo?: AsaasCreditCardHolderInfo;
  creditCardToken?: string;
  remoteIp?: string;
}

export interface AsaasSubscriptionResponse {
  id: string;
  customer: string;
  billingType: string;
  cycle: string;
  value: number;
  nextDueDate: string;
  description?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'INACTIVE';
  dateCreated: string;
  object: string;
}

export interface AsaasPaymentData {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  creditCard?: AsaasCreditCardData;
  creditCardHolderInfo?: AsaasCreditCardHolderInfo;
  creditCardToken?: string;
  remoteIp?: string;
}

export interface AsaasPaymentResponse {
  id: string;
  customer: string;
  billingType: string;
  value: number;
  dueDate: string;
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'RECEIVED_IN_CASH' | 'REFUND_REQUESTED' | 'CHARGEBACK_REQUESTED' | 'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' | 'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS';
  description?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  transactionReceiptUrl?: string;
  invoiceNumber?: string;
  dateCreated: string;
  confirmedDate?: string;
  object: string;
}

export interface AsaasPaymentListResponse {
  object: 'list';
  hasMore: boolean;
  totalCount: number;
  limit: number;
  offset: number;
  data: AsaasPaymentResponse[];
}

export interface AsaasUpdateCreditCardData {
  creditCard: AsaasCreditCardData;
  creditCardHolderInfo: AsaasCreditCardHolderInfo;
  remoteIp?: string;
}

export interface AsaasErrorResponse {
  errors?: Array<{
    code: string;
    description: string;
  }>;
  message?: string;
}

// ============================================
// ASAAS SERVICE CLASS
// ============================================

export class AsaasService {
  private client: AxiosInstance;
  private apiKey: string;
  private environment: 'sandbox' | 'production';
  private baseURL: string;

  constructor(apiKey?: string, environment?: 'sandbox' | 'production') {
    // Tentar carregar do banco de dados primeiro, depois .env, depois parâmetros
    this.apiKey = apiKey || process.env.ASAAS_API_KEY || '';
    this.environment = environment || (process.env.ASAAS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox';

    // Debug log para verificar se a chave está sendo carregada
    if (!this.apiKey) {
      console.error('⚠️ ASAAS_API_KEY não configurada (nem no banco, nem no .env)');
    } else {
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
    this.client = axios.create({
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
        console.log(`[Asaas API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      });
    }

    // Interceptor para tratamento de erros
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<AsaasErrorResponse>) => {
        if (error.response) {
          const asaasError = error.response.data;
          const errorMessage = asaasError.errors?.[0]?.description || asaasError.message || 'Erro desconhecido';
          console.error(`[Asaas API Error] ${error.response.status}: ${errorMessage}`);
          throw new Error(`Asaas API: ${errorMessage}`);
        }
        throw error;
      }
    );
  }

  // ============================================
  // CUSTOMER METHODS
  // ============================================

  /**
   * Criar um novo cliente no Asaas
   */
  async createCustomer(customerData: AsaasCustomerData): Promise<AsaasCustomerResponse> {
    try {
      const response = await this.client.post<AsaasCustomerResponse>('/customers', customerData);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Buscar cliente pelo ID
   */
  async getCustomer(customerId: string): Promise<AsaasCustomerResponse> {
    try {
      const response = await this.client.get<AsaasCustomerResponse>(`/customers/${customerId}`);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error fetching customer:', error);
      throw error;
    }
  }

  /**
   * Atualizar dados de um cliente
   */
  async updateCustomer(customerId: string, customerData: Partial<AsaasCustomerData>): Promise<AsaasCustomerResponse> {
    try {
      const response = await this.client.put<AsaasCustomerResponse>(`/customers/${customerId}`, customerData);
      return response.data;
    } catch (error) {
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
  async createSubscription(subscriptionData: AsaasSubscriptionData): Promise<AsaasSubscriptionResponse> {
    try {
      const response = await this.client.post<AsaasSubscriptionResponse>('/subscriptions', subscriptionData);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Buscar assinatura pelo ID
   */
  async getSubscription(subscriptionId: string): Promise<AsaasSubscriptionResponse> {
    try {
      const response = await this.client.get<AsaasSubscriptionResponse>(`/subscriptions/${subscriptionId}`);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error fetching subscription:', error);
      throw error;
    }
  }

  /**
   * Atualizar assinatura existente
   */
  async updateSubscription(
    subscriptionId: string,
    updateData: Partial<AsaasSubscriptionData>
  ): Promise<AsaasSubscriptionResponse> {
    try {
      const response = await this.client.put<AsaasSubscriptionResponse>(
        `/subscriptions/${subscriptionId}`,
        updateData
      );
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancelar assinatura
   */
  async cancelSubscription(subscriptionId: string): Promise<AsaasSubscriptionResponse> {
    try {
      const response = await this.client.delete<AsaasSubscriptionResponse>(`/subscriptions/${subscriptionId}`);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Atualizar cartão de crédito de uma assinatura
   */
  async updateSubscriptionCreditCard(
    subscriptionId: string,
    cardData: AsaasUpdateCreditCardData
  ): Promise<AsaasSubscriptionResponse> {
    try {
      const response = await this.client.put<AsaasSubscriptionResponse>(
        `/subscriptions/${subscriptionId}/creditCard`,
        cardData
      );
      return response.data;
    } catch (error) {
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
  async createPayment(paymentData: AsaasPaymentData): Promise<AsaasPaymentResponse> {
    try {
      const response = await this.client.post<AsaasPaymentResponse>('/payments', paymentData);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error creating payment:', error);
      throw error;
    }
  }

  /**
   * Buscar pagamento pelo ID
   */
  async getPayment(paymentId: string): Promise<AsaasPaymentResponse> {
    try {
      const response = await this.client.get<AsaasPaymentResponse>(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error fetching payment:', error);
      throw error;
    }
  }

  /**
   * Listar cobranças de uma assinatura
   */
  async getSubscriptionPayments(
    subscriptionId: string,
    params?: { offset?: number; limit?: number }
  ): Promise<AsaasPaymentListResponse> {
    try {
      const response = await this.client.get<AsaasPaymentListResponse>(
        `/subscriptions/${subscriptionId}/payments`,
        { params }
      );
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error fetching subscription payments:', error);
      throw error;
    }
  }

  /**
   * Listar pagamentos de um cliente
   */
  async getCustomerPayments(
    customerId: string,
    params?: {
      offset?: number;
      limit?: number;
      status?: string;
      dateCreated_ge?: string; // YYYY-MM-DD
      dateCreated_le?: string; // YYYY-MM-DD
    }
  ): Promise<AsaasPaymentListResponse> {
    try {
      const response = await this.client.get<AsaasPaymentListResponse>('/payments', {
        params: {
          customer: customerId,
          ...params
        }
      });
      return response.data;
    } catch (error) {
      console.error('[AsaasService] Error fetching customer payments:', error);
      throw error;
    }
  }

  /**
   * Estornar/Reembolsar um pagamento
   */
  async refundPayment(paymentId: string): Promise<AsaasPaymentResponse> {
    try {
      const response = await this.client.post<AsaasPaymentResponse>(`/payments/${paymentId}/refund`);
      return response.data;
    } catch (error) {
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
  async verifyWebhook(requestToken: string): Promise<boolean> {
    if (!requestToken) {
      console.warn('[AsaasService] No webhook token provided');
      return false;
    }

    // Tentar buscar webhook secret do banco de dados primeiro
    try {
      const { db } = await import('../db');
      const { paymentSettings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      const settings = await db
        .select()
        .from(paymentSettings)
        .where(eq(paymentSettings.provider, 'asaas'))
        .limit(1);

      if (settings.length > 0 && settings[0].webhookSecret) {
        const isValid = requestToken === settings[0].webhookSecret;
        if (isValid) {
          console.log('[AsaasService] Webhook validated with database token');
        } else {
          console.warn('[AsaasService] Webhook token does not match database token');
        }
        return isValid;
      }
    } catch (error) {
      console.warn('[AsaasService] Error fetching webhook secret from database, falling back to env:', error);
    }

    // Fallback para variável de ambiente
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('[AsaasService] ASAAS_WEBHOOK_SECRET not configured (neither in database nor in .env)');
      return false;
    }

    const isValid = requestToken === webhookSecret;
    if (isValid) {
      console.log('[AsaasService] Webhook validated with environment variable');
    } else {
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
  static formatDateForAsaas(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Calcular próxima data de vencimento (adiciona 1 mês)
   */
  static calculateNextDueDate(currentDate: Date = new Date()): string {
    const nextMonth = new Date(currentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return this.formatDateForAsaas(nextMonth);
  }

  /**
   * Validar CPF/CNPJ (validação básica de formato)
   */
  static validateCpfCnpj(cpfCnpj: string): boolean {
    const cleaned = cpfCnpj.replace(/\D/g, '');
    return cleaned.length === 11 || cleaned.length === 14;
  }

  /**
   * Testar conexão com a API do Asaas
   */
  async testConnection(): Promise<any> {
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
    } catch (error: any) {
      throw new Error(
        error.response?.data?.errors?.[0]?.description ||
        error.response?.data?.message ||
        'Falha ao conectar com Asaas'
      );
    }
  }

  /**
   * Obter status da conexão
   */
  getServiceInfo(): { environment: string; baseURL: string; configured: boolean } {
    return {
      environment: this.environment,
      baseURL: this.baseURL,
      configured: !!this.apiKey
    };
  }
}

// Singleton instance
let asaasServiceInstance: AsaasService | null = null;

/**
 * Carregar configurações do banco de dados
 */
async function loadConfigFromDatabase(): Promise<{ apiKey: string; environment: 'sandbox' | 'production' } | null> {
  try {
    const { db } = await import('../db');
    const { paymentSettings } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const settings = await db
      .select()
      .from(paymentSettings)
      .where(eq(paymentSettings.provider, 'asaas'))
      .limit(1);

    if (settings.length > 0 && settings[0].enabled && settings[0].apiKey) {
      return {
        apiKey: settings[0].apiKey,
        environment: settings[0].environment as 'sandbox' | 'production'
      };
    }
  } catch (error) {
    console.warn('⚠️ Erro ao carregar configurações do banco, usando .env:', error);
  }
  return null;
}

/**
 * Get singleton instance do AsaasService
 * Padrão Singleton para garantir uma única instância
 * Carrega configurações do banco de dados primeiro, senão usa .env
 */
export async function getAsaasService(): Promise<AsaasService> {
  if (!asaasServiceInstance) {
    const dbConfig = await loadConfigFromDatabase();
    if (dbConfig) {
      asaasServiceInstance = new AsaasService(dbConfig.apiKey, dbConfig.environment);
    } else {
      asaasServiceInstance = new AsaasService();
    }
  }
  return asaasServiceInstance;
}

/**
 * Reinicializar o serviço Asaas com novas configurações
 * Usado quando as configurações são atualizadas via admin
 */
export async function reinitializeAsaasService(): Promise<void> {
  asaasServiceInstance = null;
  await getAsaasService();
}

// Export default - para compatibilidade com imports síncronos
export default {
  getInstance: getAsaasService
};
