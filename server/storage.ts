import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { db } from "./db";
import {
  users,
  wallets,
  categories,
  transactions,
  apiTokens,
  reminders,
  userSessionsAdmin,
  paymentMethods,
  subscriptionPlans,
  asaasCustomers,
  userSubscriptions,
  paymentTransactions,
  asaasWebhooks,
  historicoCancelamentos,
  empresas,
  empresasContas,
  empresasTransacoes,
  getSaoPauloTimestamp,
  type User,
  type InsertUser,
  type Wallet,
  type InsertWallet,
  type Category,
  type InsertCategory,
  type Transaction,
  type InsertTransaction,
  type UpdateTransaction,
  type ApiToken,
  type InsertApiToken,
  type UpdateApiToken,
  type ApiTokenGenerator,
  type Reminder,
  type InsertReminder,
  type UpdateReminder,
  type UserSessionAdmin,
  type TransactionWithDetails,
  type InsertUserSessionAdmin,
  type PaymentMethod,
  type InsertPaymentMethod,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  type UpdateSubscriptionPlan,
  type AsaasCustomer,
  type InsertAsaasCustomer,
  type UserSubscription,
  type InsertUserSubscription,
  type UpdateUserSubscription,
  type PaymentTransaction,
  type InsertPaymentTransaction,
  type UpdatePaymentTransaction,
  type AsaasWebhook,
  type InsertAsaasWebhook,
  type Empresa,
  type InsertEmpresa,
  type UpdateEmpresa,
  type EmpresaConta,
  type InsertEmpresaConta,
  type UpdateEmpresaConta,
  type EmpresaTransacao,
  type InsertEmpresaTransacao,
  type UpdateEmpresaTransacao,
  type EmpresaTransacaoWithDetails,
  type EmpresaResumo,
  type EmpresaDRE,
  type EmpresaFluxoCaixaMensal,
  metasFinanceiras,
  whatsappOnboardingStates,
  type WhatsAppOnboardingState,
  type InsertWhatsAppOnboardingState,
  type MetaFinanceira,
  type InsertMeta,
  type UpdateMeta,
  type MetaComProgresso
} from "../shared/schema";
import { eq, and, or, desc, gte, lte, isNull, count, sum, sql, ne } from "drizzle-orm";

/**
 * Calculate date range based on period type
 * @param period - "month" | "quarter" | "year" | undefined (defaults to month)
 * @returns { startDate: Date, endDate: Date }
 */
function calculateDateRange(period?: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  switch (period) {
    case "quarter":
      // Last 3 months (current month - 2 months to current month)
      startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "year":
      // Current year (January 1 to December 31)
      startDate = new Date(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(now.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "month":
    default:
      // Current month (first day to last day)
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
  }

  return { startDate, endDate };
}

export interface IStorage {
  // User methods
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByRemoteJid(remoteJid: string): Promise<User | undefined>;
  createUser(userData: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  updatePassword(id: number, newPassword: string): Promise<boolean>;
  
  // Wallet methods
  getWalletByUserId(userId: number): Promise<Wallet | undefined>;
  createWallet(walletData: InsertWallet): Promise<Wallet>;
  updateWallet(id: number, walletData: Partial<Wallet>): Promise<Wallet | undefined>;
  calculateWalletBalance(walletId: number): Promise<number>;
  
  // Category methods
  getCategoriesByUserId(userId: number): Promise<Category[]>;
  getGlobalCategories(): Promise<Category[]>;
  getCategoryById(id: number): Promise<Category | undefined>;
  createCategory(categoryData: InsertCategory): Promise<Category>;
  updateCategory(id: number, categoryData: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(id: number): Promise<boolean>;
  
  // Payment Method methods
  getPaymentMethodsByUserId(userId: number): Promise<PaymentMethod[]>;
  getGlobalPaymentMethods(): Promise<PaymentMethod[]>;
  getPaymentMethodById(id: number): Promise<PaymentMethod | undefined>;
  getPaymentMethodByName(name: string): Promise<PaymentMethod | undefined>;
  createPaymentMethod(paymentMethodData: InsertPaymentMethod): Promise<PaymentMethod>;
  updatePaymentMethod(id: number, paymentMethodData: Partial<PaymentMethod>): Promise<PaymentMethod | undefined>;
  deletePaymentMethod(id: number): Promise<boolean>;
  getTransactionTotalsByPaymentMethod(userId: number): Promise<{ paymentMethodId: number; total: number; incomeTotal: number; expenseTotal: number }[]>;
  
  // Transaction methods
  getTransactionsByWalletId(walletId: number): Promise<Transaction[]>;
  getRecentTransactionsByWalletId(walletId: number, limit?: number): Promise<Transaction[]>;
  getTransactionById(id: number): Promise<Transaction | undefined>;
  createTransaction(transactionData: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, transactionData: UpdateTransaction): Promise<Transaction | undefined>;
  deleteTransaction(id: number): Promise<boolean>;
  
  // Dashboard methods
  getMonthlyTransactionSummary(walletId: number, period?: string): Promise<any>;
  getExpensesByCategory(walletId: number, period?: string): Promise<any>;
  getIncomeExpenseTotals(walletId: number, period?: string): Promise<{ totalIncome: number; totalExpenses: number }>;

  // Bulk operations for performance
  getWalletStatsForAllUsers(): Promise<{ walletId: number; userId: number; balance: number; transactionCount: number }[]>;
  
  // API Token methods
  getApiTokensByUserId(userId: number): Promise<ApiToken[]>;
  getApiTokenById(id: number): Promise<ApiToken | undefined>;
  getApiTokenByToken(token: string): Promise<ApiToken | undefined>;
  createApiToken(userId: number, tokenData: InsertApiToken): Promise<ApiToken>;
  updateApiToken(id: number, tokenData: UpdateApiToken): Promise<ApiToken | undefined>;
  deleteApiToken(id: number): Promise<boolean>;
  
  // Reminder methods
  getRemindersByUserId(userId: number): Promise<Reminder[]>;
  getReminderById(id: number): Promise<Reminder | undefined>;
  createReminder(reminderData: InsertReminder): Promise<Reminder>;
  updateReminder(id: number, reminderData: UpdateReminder): Promise<Reminder | undefined>;
  deleteReminder(id: number): Promise<boolean>;
  getRemindersByDateRange(userId: number, startDate: Date, endDate: Date): Promise<Reminder[]>;
  
  // Admin Session methods
  getActiveImpersonationSession(targetUserId: number): Promise<UserSessionAdmin | undefined>;
  createImpersonationSession(superAdminId: number, targetUserId: number): Promise<UserSessionAdmin>;
  endImpersonationSession(sessionId: number): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  getRecentUsers(limit?: number): Promise<User[]>;
  getAllAdminSessions(): Promise<UserSessionAdmin[]>;

  // Subscription Plan methods
  getSubscriptionPlanById(id: number): Promise<SubscriptionPlan | undefined>;
  getSubscriptionPlanByCode(code: string): Promise<SubscriptionPlan | undefined>;
  getAllSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  createSubscriptionPlan(planData: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: number, planData: UpdateSubscriptionPlan): Promise<SubscriptionPlan | undefined>;
  deleteSubscriptionPlan(id: number): Promise<boolean>;

  // Asaas Customer methods
  getAsaasCustomerByUserId(userId: number): Promise<AsaasCustomer | undefined>;
  getAsaasCustomerByAsaasId(asaasCustomerId: string): Promise<AsaasCustomer | undefined>;
  createAsaasCustomer(customerData: InsertAsaasCustomer): Promise<AsaasCustomer>;
  updateAsaasCustomer(id: number, customerData: Partial<AsaasCustomer>): Promise<AsaasCustomer | undefined>;

  // User Subscription methods
  getUserSubscriptionById(id: number): Promise<UserSubscription | undefined>;
  getActiveSubscriptionByUserId(userId: number): Promise<UserSubscription | undefined>;
  getAllSubscriptionsByUserId(userId: number): Promise<UserSubscription[]>;
  getSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<UserSubscription | undefined>;
  createUserSubscription(subscriptionData: InsertUserSubscription): Promise<UserSubscription>;
  updateUserSubscription(id: number, subscriptionData: UpdateUserSubscription): Promise<UserSubscription | undefined>;
  getAllActiveSubscriptions(): Promise<UserSubscription[]>;

  // Payment Transaction methods
  getPaymentTransactionById(id: number): Promise<PaymentTransaction | undefined>;
  getPaymentTransactionByAsaasId(asaasPaymentId: string): Promise<PaymentTransaction | undefined>;
  getPaymentTransactionsByUserId(userId: number, limit?: number): Promise<PaymentTransaction[]>;
  getPaymentTransactionsBySubscriptionId(subscriptionId: number): Promise<PaymentTransaction[]>;
  getOverduePayments(): Promise<PaymentTransaction[]>;
  searchPaymentTransactions(filters: {
    searchTerm?: string;
    status?: string;
    paymentMethod?: string;
    dateFrom?: string;
    dateTo?: string;
  }, limit?: number, offset?: number): Promise<any[]>;
  createPaymentTransaction(paymentData: InsertPaymentTransaction): Promise<PaymentTransaction>;
  updatePaymentTransaction(id: number, paymentData: UpdatePaymentTransaction): Promise<PaymentTransaction | undefined>;

  // Asaas Webhook methods
  getAsaasWebhookById(id: number): Promise<AsaasWebhook | undefined>;
  getAsaasWebhookByEventId(eventId: string): Promise<AsaasWebhook | undefined>;
  getUnprocessedWebhooks(limit?: number): Promise<AsaasWebhook[]>;
  createAsaasWebhook(webhookData: InsertAsaasWebhook): Promise<AsaasWebhook>;
  updateAsaasWebhook(id: number, webhookData: Partial<AsaasWebhook>): Promise<AsaasWebhook | undefined>;

  // Cancellation History methods
  createCancellationHistory(data: any): Promise<any>;

  // ============================================
  // PJ — EMPRESAS METHODS
  // ============================================
  // Convive com o PF. Nenhuma função acima é alterada.

  // Empresa
  createEmpresa(empresaData: InsertEmpresa): Promise<Empresa>;
  getEmpresasByUsuarioId(usuarioId: number): Promise<Empresa[]>;
  getEmpresaById(id: number): Promise<Empresa | undefined>;
  updateEmpresa(id: number, empresaData: UpdateEmpresa): Promise<Empresa | undefined>;
  deleteEmpresa(id: number): Promise<boolean>;
  // EmpresaConta (plano de contas PJ)
  seedEmpresasContas(empresaId: number): Promise<EmpresaConta[]>;
  getEmpresasContasByEmpresaId(empresaId: number): Promise<EmpresaConta[]>;
  getEmpresaContaById(id: number): Promise<EmpresaConta | undefined>;
  createEmpresaConta(contaData: InsertEmpresaConta): Promise<EmpresaConta>;
  updateEmpresaConta(id: number, contaData: UpdateEmpresaConta): Promise<EmpresaConta | undefined>;
  deleteEmpresaConta(id: number): Promise<boolean>;
  // EmpresaTransacao
  createEmpresaTransacao(transacaoData: InsertEmpresaTransacao): Promise<EmpresaTransacaoWithDetails>;
  getEmpresaTransacoesByEmpresaId(empresaId: number, opts?: { de?: string; ate?: string; limit?: number }): Promise<EmpresaTransacaoWithDetails[]>;
  getEmpresaTransacaoById(id: number): Promise<EmpresaTransacaoWithDetails | undefined>;
  updateEmpresaTransacao(id: number, transacaoData: UpdateEmpresaTransacao): Promise<EmpresaTransacaoWithDetails | undefined>;
  deleteEmpresaTransacao(id: number): Promise<boolean>;
  // Resumo / DRE
  getEmpresaResumo(empresaId: number, opts?: { de?: string; ate?: string }): Promise<EmpresaResumo>;
  getEmpresaDRE(empresaId: number, opts?: { de?: string; ate?: string }): Promise<EmpresaDRE>;
  getEmpresaFluxoCaixaMensal(empresaId: number, ano: number): Promise<EmpresaFluxoCaixaMensal>;

  // WhatsApp Onboarding methods
  getWhatsAppOnboardingState(remoteJid: string): Promise<any | undefined>;
  createWhatsAppOnboardingState(data: any): Promise<any>;
  updateWhatsAppOnboardingState(remoteJid: string, data: any): Promise<any | undefined>;
  deleteWhatsAppOnboardingState(remoteJid: string): Promise<boolean>;
}

export class DbStorage implements IStorage {
  // User methods
  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }
  
  async getUserByRemoteJid(remoteJid: string): Promise<User | undefined> {
    try {
      // Postgres field é remotejid (minúsculo)
      const result = await db.select().from(users)
        .where(eq(users.remoteJid, remoteJid))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error("Error in getUserByRemoteJid:", error);
      return undefined;
    }
  }

  async getUserByPhone(telefone: string): Promise<User | undefined> {
    // Considera apenas usuários ATIVOS: ao desativar (soft delete) um usuário,
    // o telefone dele fica livre para ser reutilizado em um novo cadastro.
    const result = await db.select().from(users).where(and(eq(users.telefone, telefone), eq(users.ativo, true))).limit(1);
    return result[0];
  }
  
  async createUser(userData: InsertUser): Promise<User> {
    // Hash password
    const hashedPassword = await bcrypt.hash(userData.senha, 10);
    const result = await db.insert(users).values({
      ...userData,
      senha: hashedPassword,
      data_cadastro: new Date(),
      ultimo_acesso: new Date()
    }).returning();
    const user = result[0];
    // Criar MasterToken automaticamente
    await this.createApiToken(user.id, {
      nome: 'MasterToken',
      descricao: 'Token principal do usuário, não removível.',
      data_expiracao: null,
      ativo: true,
      master: true,
      rotacionavel: true
    });
    return user;
  }
  
  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    
    return result[0];
  }
  
  async updatePassword(id: number, newPassword: string): Promise<boolean> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await db.update(users)
      .set({ senha: hashedPassword })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    
    return result.length > 0;
  }
  
  // Wallet methods
  async getWalletByUserId(userId: number): Promise<Wallet | undefined> {
    const result = await db.select()
      .from(wallets)
      .where(eq(wallets.usuario_id, userId))
      .limit(1);
    
    if (!result[0]) return undefined;
    
    // Calculate real balance based on all transactions
    const wallet = result[0];
    const realBalance = await this.calculateWalletBalance(wallet.id);
    
    return {
      ...wallet,
      saldo_atual: realBalance.toFixed(2)
    };
  }
  
  async calculateWalletBalance(walletId: number): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT COALESCE(SUM(
          CASE WHEN tipo = 'Receita' THEN valor::numeric 
               WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN -valor::numeric
               ELSE 0 END
        ), 0) as balance
        FROM transacoes
        WHERE carteira_id = ${walletId}
      `);
      
      return parseFloat(result[0]?.balance || '0') || 0;
    } catch (error) {
      console.error('Error calculating wallet balance:', error);
      return 0;
    }
  }
  
  async createWallet(walletData: InsertWallet): Promise<Wallet> {
    const result = await db.insert(wallets)
      .values({
        ...walletData,
        data_criacao: new Date()
      })
      .returning();
    
    return result[0];
  }
  
  async updateWallet(id: number, walletData: Partial<Wallet>): Promise<Wallet | undefined> {
    const result = await db.update(wallets)
      .set(walletData)
      .where(eq(wallets.id, id))
      .returning();
    
    return result[0];
  }
  
  // Category methods
  async getCategoriesByUserId(userId: number): Promise<Category[]> {
    // Get both user-specific categories and global categories
    return db.select()
      .from(categories)
      .where(
        sql`${categories.usuario_id} = ${userId} OR ${categories.global} = true`
      )
      .orderBy(desc(categories.global), categories.nome);
  }
  
  async getGlobalCategories(): Promise<Category[]> {
    return db.select()
      .from(categories)
      .where(eq(categories.global, true))
      .orderBy(categories.nome);
  }
  
  async getCategoryById(id: number): Promise<Category | undefined> {
    const result = await db.select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    
    return result[0];
  }
  
  async createCategory(categoryData: InsertCategory): Promise<Category> {
    const result = await db.insert(categories)
      .values(categoryData)
      .returning();
    
    return result[0];
  }
  
  async updateCategory(id: number, categoryData: Partial<Category>): Promise<Category | undefined> {
    const result = await db.update(categories)
      .set(categoryData)
      .where(eq(categories.id, id))
      .returning();
    
    return result[0];
  }
  
  async deleteCategory(id: number): Promise<boolean> {
    try {
      // Check if category is used in any transactions
      const usedInTransactions = await db.select({ count: count() })
        .from(transactions)
        .where(eq(transactions.categoria_id, id));
      
      if (usedInTransactions[0].count > 0) {
        return false;
      }
      
      // Check if category is global
      const category = await this.getCategoryById(id);
      if (category?.global) {
        return false;
      }
      
      const result = await db.delete(categories)
        .where(eq(categories.id, id))
        .returning({ id: categories.id });
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting category:", error);
      return false;
    }
  }
  
  // Payment Method methods
  async getPaymentMethodsByUserId(userId: number): Promise<PaymentMethod[]> {
    return db.select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.usuario_id, userId),
          eq(paymentMethods.ativo, true)
        )
      )
      .orderBy(paymentMethods.nome);
  }
  
  async getGlobalPaymentMethods(): Promise<PaymentMethod[]> {
    return db.select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.global, true),
          eq(paymentMethods.ativo, true)
        )
      )
      .orderBy(paymentMethods.nome);
  }
  
  async getPaymentMethodById(id: number): Promise<PaymentMethod | undefined> {
    const result = await db.select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .limit(1);
    
    return result[0];
  }
  
  async getPaymentMethodByName(name: string): Promise<PaymentMethod | undefined> {
    const result = await db.select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.nome, name),
          eq(paymentMethods.global, true),
          eq(paymentMethods.ativo, true)
        )
      )
      .limit(1);
    
    return result[0];
  }
  
  async createPaymentMethod(paymentMethodData: InsertPaymentMethod): Promise<PaymentMethod> {
    const result = await db.insert(paymentMethods)
      .values({
        ...paymentMethodData,
        data_criacao: new Date()
      })
      .returning();
    
    return result[0];
  }
  
  async updatePaymentMethod(id: number, paymentMethodData: Partial<PaymentMethod>): Promise<PaymentMethod | undefined> {
    const result = await db.update(paymentMethods)
      .set(paymentMethodData)
      .where(eq(paymentMethods.id, id))
      .returning();
    
    return result[0];
  }
  
  async deletePaymentMethod(id: number): Promise<boolean> {
    try {
      // Check if payment method is being used in transactions
      const usedInTransactions = await db.select({ count: count() })
        .from(transactions)
        .where(eq(transactions.forma_pagamento_id, id));
      
      if (usedInTransactions[0].count > 0) {
        return false;
      }
      
      // Check if payment method is global
      const paymentMethod = await this.getPaymentMethodById(id);
      if (paymentMethod?.global) {
        return false;
      }
      
      const result = await db.delete(paymentMethods)
        .where(eq(paymentMethods.id, id))
        .returning({ id: paymentMethods.id });
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting payment method:", error);
      return false;
    }
  }

  async getTransactionTotalsByPaymentMethod(userId: number): Promise<{ paymentMethodId: number; total: number; incomeTotal: number; expenseTotal: number }[]> {
    // First get the user's wallet ID
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      return [];
    }

    // Get all payment methods for the user
    const allPaymentMethods = await this.getPaymentMethodsByUserId(userId);
    const globalPaymentMethods = await this.getGlobalPaymentMethods();
    const paymentMethods = [...allPaymentMethods, ...globalPaymentMethods];

    // Get all transactions for the wallet (both Efetivada and Pendente)
    const allTransactions = await db
      .select()
      .from(transactions)
      .where(
        eq(transactions.carteira_id, wallet.id)
      );

    // Calculate totals for each payment method
    const totalsMap = new Map<number, { total: number; incomeTotal: number; expenseTotal: number }>();

    for (const transaction of allTransactions) {
      let matchedPaymentMethodId: number | null = null;

      // First try to match by forma_pagamento_id (foreign key)
      if (transaction.forma_pagamento_id) {
        matchedPaymentMethodId = transaction.forma_pagamento_id;
      } 
      // Then try to match by metodo_pagamento (text field)
      else if (transaction.metodo_pagamento) {
        const matchedMethod = paymentMethods.find(pm => pm.nome === transaction.metodo_pagamento);
        if (matchedMethod) {
          matchedPaymentMethodId = matchedMethod.id;
        }
      }

      if (matchedPaymentMethodId) {
        const valor = Number(transaction.valor) || 0;
        const currentTotals = totalsMap.get(matchedPaymentMethodId) || { total: 0, incomeTotal: 0, expenseTotal: 0 };
        
        if (transaction.tipo === 'Receita') {
          currentTotals.incomeTotal += valor;
          currentTotals.total += valor;
        } else if (transaction.tipo === 'Despesa') {
          currentTotals.expenseTotal += valor;
          currentTotals.total -= valor;
        }
        
        totalsMap.set(matchedPaymentMethodId, currentTotals);
      }
    }

    // Convert map to array format
    const result = Array.from(totalsMap.entries()).map(([paymentMethodId, totals]) => ({
      paymentMethodId,
      total: totals.total,
      incomeTotal: totals.incomeTotal,
      expenseTotal: totals.expenseTotal
    }));
    
    return result;
  }
  
  // Transaction methods
  async getTransactionsByWalletId(walletId: number): Promise<TransactionWithDetails[]> {
    const result = await db.select({
      id: transactions.id,
      carteira_id: transactions.carteira_id,
      categoria_id: transactions.categoria_id,
      forma_pagamento_id: transactions.forma_pagamento_id,
      tipo: transactions.tipo,
      valor: transactions.valor,
      data_transacao: transactions.data_transacao,
      data_registro: transactions.data_registro,
      descricao: transactions.descricao,
      metodo_pagamento: paymentMethods.nome,
      status: transactions.status,
      reembolsavel: transactions.reembolsavel,
      categoria_name: categories.nome
    })
      .from(transactions)
      .leftJoin(paymentMethods, eq(transactions.forma_pagamento_id, paymentMethods.id))
      .leftJoin(categories, eq(transactions.categoria_id, categories.id))
      .where(eq(transactions.carteira_id, walletId))
      .orderBy(desc(transactions.data_transacao), desc(transactions.data_registro));
    
    return result;
  }
  
  async getRecentTransactionsByWalletId(walletId: number, limit: number = 5): Promise<TransactionWithDetails[]> {
    const result = await db.select({
      id: transactions.id,
      carteira_id: transactions.carteira_id,
      categoria_id: transactions.categoria_id,
      forma_pagamento_id: transactions.forma_pagamento_id,
      tipo: transactions.tipo,
      valor: transactions.valor,
      data_transacao: transactions.data_transacao,
      data_registro: transactions.data_registro,
      descricao: transactions.descricao,
      metodo_pagamento: paymentMethods.nome,
      status: transactions.status,
      reembolsavel: transactions.reembolsavel,
      categoria_name: categories.nome
    })
      .from(transactions)
      .leftJoin(paymentMethods, eq(transactions.forma_pagamento_id, paymentMethods.id))
      .leftJoin(categories, eq(transactions.categoria_id, categories.id))
      .where(eq(transactions.carteira_id, walletId))
      .orderBy(desc(transactions.data_transacao), desc(transactions.data_registro))
      .limit(limit);
    
    return result;
  }
  
  async getTransactionById(id: number): Promise<TransactionWithDetails | undefined> {
    const result = await db.select({
      id: transactions.id,
      carteira_id: transactions.carteira_id,
      categoria_id: transactions.categoria_id,
      forma_pagamento_id: transactions.forma_pagamento_id,
      tipo: transactions.tipo,
      valor: transactions.valor,
      data_transacao: transactions.data_transacao,
      data_registro: transactions.data_registro,
      descricao: transactions.descricao,
      metodo_pagamento: paymentMethods.nome,
      status: transactions.status,
      reembolsavel: transactions.reembolsavel,
      categoria_name: categories.nome
    })
      .from(transactions)
      .leftJoin(paymentMethods, eq(transactions.forma_pagamento_id, paymentMethods.id))
      .leftJoin(categories, eq(transactions.categoria_id, categories.id))
      .where(eq(transactions.id, id))
      .limit(1);
    
    return result[0];
  }
  
  async createTransaction(transactionData: InsertTransaction): Promise<Transaction> {
    const result = await db.insert(transactions)
      .values({
        ...transactionData,
        valor: transactionData.valor.toString(),
        data_registro: new Date()
      })
      .returning();
    
    // Get the complete transaction with payment method name
    const completeTransaction = await this.getTransactionById(result[0].id);
    return completeTransaction || result[0];
  }
  
  async updateTransaction(id: number, transactionData: UpdateTransaction): Promise<Transaction | undefined> {
    const result = await db.update(transactions)
      .set(transactionData)
      .where(eq(transactions.id, id))
      .returning();
    
    return result[0];
  }
  
  async deleteTransaction(id: number): Promise<boolean> {
    const result = await db.delete(transactions)
      .where(eq(transactions.id, id))
      .returning({ id: transactions.id });
    
    return result.length > 0;
  }
  
  // Dashboard methods
  async getMonthlyTransactionSummary(walletId: number, period?: string): Promise<any> {
    try {
      // Calculate date range based on period parameter
      const { startDate, endDate } = calculateDateRange(period);

      const monthlyData = await db.execute(sql`
        SELECT
          TO_CHAR(data_transacao, 'Mon') as month,
          EXTRACT(MONTH FROM data_transacao) as month_num,
          EXTRACT(YEAR FROM data_transacao) as year,
          SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as income,
          SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor ELSE 0 END) as expense
        FROM transacoes
        WHERE
          carteira_id = ${walletId}
          AND data_transacao >= ${startDate.toISOString()}
          AND data_transacao <= ${endDate.toISOString()}
        GROUP BY month, month_num, year
        ORDER BY year, month_num
      `);

      return monthlyData;
    } catch (error) {
      console.error("Error in getMonthlyTransactionSummary:", error);
      return [];
    }
  }
  
  async getExpensesByCategory(walletId: number, period?: string): Promise<any> {
    // Calculate date range based on period parameter
    const { startDate, endDate } = calculateDateRange(period);

    try {
      const result = await db.execute(sql`
        SELECT
          c.id as category_id,
          c.nome as name,
          c.cor as color,
          c.icone as icon,
          SUM(t.valor) as total
        FROM transacoes t
        JOIN categorias c ON t.categoria_id = c.id
        WHERE
          t.carteira_id = ${walletId}
          AND t.tipo = 'Despesa'
          AND COALESCE(t.reembolsavel, false) = false
          AND t.data_transacao >= ${startDate.toISOString()}
          AND t.data_transacao <= ${endDate.toISOString()}
        GROUP BY c.id, c.nome, c.cor, c.icone
        ORDER BY total DESC
      `);

      return result;
    } catch (error) {
      console.error("Error in getExpensesByCategory:", error);
      return [];
    }
  }
  
  async getIncomeExpenseTotals(walletId: number, period?: string): Promise<{ totalIncome: number; totalExpenses: number }> {
    try {
      // Calculate date range based on period parameter
      const { startDate, endDate } = calculateDateRange(period);

      const result = await db.execute(sql`
        SELECT
          SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as total_income,
          SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor ELSE 0 END) as total_expenses
        FROM transacoes
        WHERE
          carteira_id = ${walletId}
          AND data_transacao >= ${startDate.toISOString()}
          AND data_transacao <= ${endDate.toISOString()}
      `);

      if (result && result[0]) {
        return {
          totalIncome: Number(result[0].total_income) || 0,
          totalExpenses: Number(result[0].total_expenses) || 0,
        };
      }

      return { totalIncome: 0, totalExpenses: 0 };
    } catch (error) {
      console.error("Error in getIncomeExpenseTotals:", error);
      return { totalIncome: 0, totalExpenses: 0 };
    }
  }
  
  async getWalletStatsForAllUsers(): Promise<{ walletId: number; userId: number; balance: number; transactionCount: number }[]> {
    try {
      const result = await db.execute(sql`
        SELECT 
          w.id as wallet_id,
          w.usuario_id as user_id,
          COALESCE(SUM(
            CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric 
                 WHEN t.tipo = 'Despesa' AND COALESCE(t.reembolsavel, false) = false THEN -t.valor::numeric
                 ELSE 0 END
          ), 0) as balance,
          COUNT(t.id) as transaction_count
        FROM carteiras w
        INNER JOIN usuarios u ON w.usuario_id = u.id
        LEFT JOIN transacoes t ON w.id = t.carteira_id
        GROUP BY w.id, w.usuario_id
        ORDER BY w.usuario_id
      `);
      
      return result.map((row: any) => ({
        walletId: row.wallet_id,
        userId: row.user_id,
        balance: parseFloat(row.balance) || 0,
        transactionCount: parseInt(row.transaction_count) || 0
      }));
    } catch (error) {
      console.error('Error in getWalletStatsForAllUsers:', error);
      return [];
    }
  }
  
  // Função para gerar token de API aleatório e seguro
  private generateApiToken(): string {
    return `fin_${randomBytes(32).toString('hex')}`;
  }
  
  // Métodos da API Token
  async getApiTokensByUserId(userId: number): Promise<ApiToken[]> {
    return db.select()
      .from(apiTokens)
      .where(eq(apiTokens.usuario_id, userId))
      .orderBy(desc(apiTokens.data_criacao));
  }
  
  async getApiTokenById(id: number): Promise<ApiToken | undefined> {
    const result = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.id, id))
      .limit(1);
    
    return result[0];
  }
  
  async getApiTokenByToken(token: string): Promise<ApiToken | undefined> {
    const result = await db.select()
      .from(apiTokens)
      .where(eq(apiTokens.token, token))
      .limit(1);
    
    return result[0];
  }
  
  async createApiToken(userId: number, tokenData: InsertApiToken): Promise<ApiToken> {
    // Gerar um token aleatório e seguro
    const token = this.generateApiToken();
    
    // Salvar dados do token
    const result = await db.insert(apiTokens)
      .values({
        ...tokenData,
        usuario_id: userId,
        token: token,
        data_criacao: new Date(),
        ativo: true
      })
      .returning();
    
    return result[0];
  }
  
  async updateApiToken(id: number, tokenData: UpdateApiToken): Promise<ApiToken | undefined> {
    const result = await db.update(apiTokens)
      .set(tokenData)
      .where(eq(apiTokens.id, id))
      .returning();
    
    return result[0];
  }
  
  async deleteApiToken(id: number): Promise<boolean> {
    const result = await db.delete(apiTokens)
      .where(eq(apiTokens.id, id))
      .returning({ id: apiTokens.id });
    
    return result.length > 0;
  }

  // Reminder methods
  async getRemindersByUserId(userId: number): Promise<Reminder[]> {
    try {
      const result = await db.select()
        .from(reminders)
        .where(eq(reminders.usuario_id, userId))
        .orderBy(desc(reminders.data_lembrete));
      
      return result;
    } catch (error) {
      console.error("Error in getRemindersByUserId:", error);
      return [];
    }
  }

  async getReminderById(id: number): Promise<Reminder | undefined> {
    try {
      const result = await db.select()
        .from(reminders)
        .where(eq(reminders.id, id))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error("Error in getReminderById:", error);
      return undefined;
    }
  }

  async createReminder(reminderData: InsertReminder): Promise<Reminder> {
    try {
      const result = await db.insert(reminders)
        .values(reminderData)
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error in createReminder:", error);
      throw error;
    }
  }

  async updateReminder(id: number, reminderData: UpdateReminder): Promise<Reminder | undefined> {
    try {
      const result = await db.update(reminders)
        .set(reminderData)
        .where(eq(reminders.id, id))
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error in updateReminder:", error);
      return undefined;
    }
  }

  async deleteReminder(id: number): Promise<boolean> {
    try {
      const result = await db.delete(reminders)
        .where(eq(reminders.id, id))
        .returning({ id: reminders.id });
      
      return result.length > 0;
    } catch (error) {
      console.error("Error in deleteReminder:", error);
      return false;
    }
  }

  async getRemindersByDateRange(userId: number, startDate: Date, endDate: Date): Promise<Reminder[]> {
    try {
      const result = await db.select()
        .from(reminders)
        .where(
          and(
            eq(reminders.usuario_id, userId),
            gte(reminders.data_lembrete, startDate),
            lte(reminders.data_lembrete, endDate)
          )
        )
        .orderBy(reminders.data_lembrete);
      return result;
    } catch (error) {
      console.error("Error in getRemindersByDateRange:", error);
      return [];
    }
  }

  // Admin Session methods
  async getActiveImpersonationSession(targetUserId: number): Promise<UserSessionAdmin | undefined> {
    try {
      const result = await db.select()
        .from(userSessionsAdmin)
        .where(
          and(
            eq(userSessionsAdmin.target_user_id, targetUserId),
            eq(userSessionsAdmin.ativo, true),
            isNull(userSessionsAdmin.data_fim)
          )
        )
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error("Error in getActiveImpersonationSession:", error);
      return undefined;
    }
  }

  async createImpersonationSession(superAdminId: number, targetUserId: number): Promise<UserSessionAdmin> {
    try {
      // Primeiro, encerrar qualquer sessão ativa existente para este usuário
      await db.update(userSessionsAdmin)
        .set({ 
          ativo: false, 
          data_fim: new Date() 
        })
        .where(
          and(
            eq(userSessionsAdmin.target_user_id, targetUserId),
            eq(userSessionsAdmin.ativo, true)
          )
        );

      // Criar nova sessão
      const result = await db.insert(userSessionsAdmin)
        .values({
          super_admin_id: superAdminId,
          target_user_id: targetUserId,
          ativo: true
        })
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error in createImpersonationSession:", error);
      throw error;
    }
  }

  async endImpersonationSession(sessionId: number): Promise<boolean> {
    try {
      const result = await db.update(userSessionsAdmin)
        .set({ 
          ativo: false, 
          data_fim: new Date() 
        })
        .where(eq(userSessionsAdmin.id, sessionId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error in endImpersonationSession:", error);
      return false;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const result = await db.select()
        .from(users)
        .orderBy(users.nome);
      
      return result;
    } catch (error) {
      console.error("Error in getAllUsers:", error);
      return [];
    }
  }

  async getRecentUsers(limit: number = 5): Promise<User[]> {
    try {
      const result = await db.select()
        .from(users)
        .orderBy(desc(users.data_cadastro))
        .limit(limit);
      
      return result;
    } catch (error) {
      console.error("Error in getRecentUsers:", error);
      return [];
    }
  }

  async getAllAdminSessions(): Promise<UserSessionAdmin[]> {
    try {
      const result = await db.select()
        .from(userSessionsAdmin)
        .orderBy(desc(userSessionsAdmin.data_inicio));
      
      return result;
    } catch (error) {
      console.error("Error in getAllAdminSessions:", error);
      return [];
    }
  }

  async deleteAllGlobalCategories(): Promise<void> {
    await db.delete(categories).where(eq(categories.global, true));
  }

  async deleteAllGlobalPaymentMethods(): Promise<void> {
    await db.delete(paymentMethods).where(eq(paymentMethods.global, true));
  }

  // Exclusão definitiva de usuário e todos os dados relacionados
  async deleteUserCascade(userId: number): Promise<boolean> {
    try {
      // Buscar carteiras do usuário
      const userWallets = await db.select().from(wallets).where(eq(wallets.usuario_id, userId));
      const walletIds = (userWallets as Wallet[]).map((w: Wallet) => w.id);
      if (walletIds.length > 0) {
        // Remover transações das carteiras do usuário
        const arrayStr = `'{${walletIds.join(",")}}'::int[]`;
        await db.delete(transactions).where(sql`carteira_id = ANY(${sql.raw(arrayStr)})`);
      }
      // Remover lembretes
      await db.delete(reminders).where(eq(reminders.usuario_id, userId));
      // Remover categorias
      await db.delete(categories).where(eq(categories.usuario_id, userId));
      // Remover carteiras
      await db.delete(wallets).where(eq(wallets.usuario_id, userId));
      // Remover tokens de API
      await db.delete(apiTokens).where(eq(apiTokens.usuario_id, userId));
      // Remover sessões admin
      await db.delete(userSessionsAdmin).where(eq(userSessionsAdmin.target_user_id, userId));
      // Remover métodos de pagamento
      await db.delete(paymentMethods).where(eq(paymentMethods.usuario_id, userId));
      // Remover dados de assinatura
      await db.delete(paymentTransactions).where(eq(paymentTransactions.usuarioId, userId));
      await db.delete(userSubscriptions).where(eq(userSubscriptions.usuarioId, userId));
      await db.delete(asaasCustomers).where(eq(asaasCustomers.usuarioId, userId));
      // Remover usuário
      await db.delete(users).where(eq(users.id, userId));
      return true;
    } catch (error) {
      console.error('Erro ao deletar usuário em cascata:', error);
      return false;
    }
  }

  // ============================================
  // SUBSCRIPTION PLAN METHODS
  // ============================================

  async getSubscriptionPlanById(id: number): Promise<SubscriptionPlan | undefined> {
    const result = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    return result[0];
  }

  async getSubscriptionPlanByCode(code: string): Promise<SubscriptionPlan | undefined> {
    const result = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.planCode, code)).limit(1);
    return result[0];
  }

  async getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.priceMonthly);
  }

  async getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.active, true))
      .orderBy(subscriptionPlans.priceMonthly);
  }

  async createSubscriptionPlan(planData: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const result = await db.insert(subscriptionPlans).values({
      ...planData,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async updateSubscriptionPlan(id: number, planData: UpdateSubscriptionPlan): Promise<SubscriptionPlan | undefined> {
    const result = await db.update(subscriptionPlans)
      .set({
        ...planData,
        updatedAt: new Date()
      })
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return result[0];
  }

  async deleteSubscriptionPlan(id: number): Promise<boolean> {
    // Soft delete - apenas desativar
    const result = await db.update(subscriptionPlans)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return result.length > 0;
  }

  // ============================================
  // ASAAS CUSTOMER METHODS
  // ============================================

  async getAsaasCustomerByUserId(userId: number): Promise<AsaasCustomer | undefined> {
    const result = await db.select()
      .from(asaasCustomers)
      .where(eq(asaasCustomers.usuarioId, userId))
      .limit(1);
    return result[0];
  }

  async getAsaasCustomerByAsaasId(asaasCustomerId: string): Promise<AsaasCustomer | undefined> {
    const result = await db.select()
      .from(asaasCustomers)
      .where(eq(asaasCustomers.asaasCustomerId, asaasCustomerId))
      .limit(1);
    return result[0];
  }

  async createAsaasCustomer(customerData: InsertAsaasCustomer): Promise<AsaasCustomer> {
    const result = await db.insert(asaasCustomers).values({
      ...customerData,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async updateAsaasCustomer(id: number, customerData: Partial<AsaasCustomer>): Promise<AsaasCustomer | undefined> {
    const result = await db.update(asaasCustomers)
      .set({
        ...customerData,
        updatedAt: new Date()
      })
      .where(eq(asaasCustomers.id, id))
      .returning();
    return result[0];
  }

  // ============================================
  // USER SUBSCRIPTION METHODS
  // ============================================

  async getUserSubscriptionById(id: number): Promise<UserSubscription | undefined> {
    const result = await db.select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.id, id))
      .limit(1);
    return result[0];
  }

  async getActiveSubscriptionByUserId(userId: number): Promise<UserSubscription | undefined> {
    const now = new Date();

    const result = await db.select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.usuarioId, userId),
          or(
            eq(userSubscriptions.status, 'active'),
            and(
              eq(userSubscriptions.status, 'canceled'),
              gte(userSubscriptions.gracePeriodEndsAt, now)
            )
          )
        )
      )
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    return result[0];
  }

  async getAllSubscriptionsByUserId(userId: number): Promise<UserSubscription[]> {
    return await db.select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.usuarioId, userId))
      .orderBy(desc(userSubscriptions.createdAt));
  }

  async getSubscriptionByAsaasId(asaasSubscriptionId: string): Promise<UserSubscription | undefined> {
    const result = await db.select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.asaasSubscriptionId, asaasSubscriptionId))
      .limit(1);
    return result[0];
  }

  async createUserSubscription(subscriptionData: InsertUserSubscription): Promise<UserSubscription> {
    const result = await db.insert(userSubscriptions).values({
      ...subscriptionData,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async updateUserSubscription(id: number, subscriptionData: UpdateUserSubscription): Promise<UserSubscription | undefined> {
    const result = await db.update(userSubscriptions)
      .set({
        ...subscriptionData,
        updatedAt: new Date()
      })
      .where(eq(userSubscriptions.id, id))
      .returning();
    return result[0];
  }

  async getAllActiveSubscriptions(): Promise<UserSubscription[]> {
    return await db.select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.status, 'active'));
  }

  // ============================================
  // PAYMENT TRANSACTION METHODS
  // ============================================

  async getPaymentTransactionById(id: number): Promise<PaymentTransaction | undefined> {
    const result = await db.select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, id))
      .limit(1);
    return result[0];
  }

  async getPaymentTransactionByAsaasId(asaasPaymentId: string): Promise<PaymentTransaction | undefined> {
    const result = await db.select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.asaasPaymentId, asaasPaymentId))
      .limit(1);
    return result[0];
  }

  async getPaymentTransactionsByUserId(userId: number, limit: number = 50): Promise<PaymentTransaction[]> {
    return await db.select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.usuarioId, userId))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit);
  }

  async getPaymentTransactionsBySubscriptionId(subscriptionId: number): Promise<PaymentTransaction[]> {
    return await db.select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.subscriptionId, subscriptionId))
      .orderBy(desc(paymentTransactions.createdAt));
  }

  async getOverduePayments(): Promise<PaymentTransaction[]> {
    return await db.select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.status, 'overdue'),
          sql`${paymentTransactions.retryCount} < 3`
        )
      )
      .orderBy(paymentTransactions.dueDate);
  }

  async searchPaymentTransactions(
    filters: {
      searchTerm?: string;
      status?: string;
      paymentMethod?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    const conditions: any[] = [];

    // Busca por nome, email ou telefone do usuário
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchPattern = `%${filters.searchTerm.trim()}%`;
      conditions.push(
        sql`(
          ${users.nome} ILIKE ${searchPattern} OR
          ${users.email} ILIKE ${searchPattern} OR
          ${users.telefone} ILIKE ${searchPattern}
        )`
      );
    }

    // Filtro por status
    if (filters.status) {
      conditions.push(eq(paymentTransactions.status, filters.status));
    }

    // Filtro por método de pagamento
    if (filters.paymentMethod) {
      conditions.push(eq(paymentTransactions.paymentMethod, filters.paymentMethod));
    }

    // Filtro por data de vencimento (intervalo)
    if (filters.dateFrom) {
      conditions.push(gte(paymentTransactions.dueDate, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
      conditions.push(lte(paymentTransactions.dueDate, new Date(filters.dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select({
        id: paymentTransactions.id,
        usuarioId: paymentTransactions.usuarioId,
        userName: users.nome,
        userEmail: users.email,
        userPhone: users.telefone,
        subscriptionId: paymentTransactions.subscriptionId,
        asaasPaymentId: paymentTransactions.asaasPaymentId,
        asaasInvoiceUrl: paymentTransactions.asaasInvoiceUrl,
        amount: paymentTransactions.amount,
        currency: paymentTransactions.currency,
        status: paymentTransactions.status,
        paymentMethod: paymentTransactions.paymentMethod,
        dueDate: paymentTransactions.dueDate,
        confirmedDate: paymentTransactions.confirmedDate,
        description: paymentTransactions.description,
        retryCount: paymentTransactions.retryCount,
        metadata: paymentTransactions.metadata,
        createdAt: paymentTransactions.createdAt,
        updatedAt: paymentTransactions.updatedAt
      })
      .from(paymentTransactions)
      .innerJoin(users, eq(paymentTransactions.usuarioId, users.id))
      .where(whereClause)
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createPaymentTransaction(paymentData: InsertPaymentTransaction): Promise<PaymentTransaction> {
    const result = await db.insert(paymentTransactions).values({
      ...paymentData,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async updatePaymentTransaction(id: number, paymentData: UpdatePaymentTransaction): Promise<PaymentTransaction | undefined> {
    const result = await db.update(paymentTransactions)
      .set({
        ...paymentData,
        updatedAt: new Date()
      })
      .where(eq(paymentTransactions.id, id))
      .returning();
    return result[0];
  }

  // ============================================
  // ASAAS WEBHOOK METHODS
  // ============================================

  async getAsaasWebhookById(id: number): Promise<AsaasWebhook | undefined> {
    const result = await db.select()
      .from(asaasWebhooks)
      .where(eq(asaasWebhooks.id, id))
      .limit(1);
    return result[0];
  }

  async getAsaasWebhookByEventId(eventId: string): Promise<AsaasWebhook | undefined> {
    const result = await db.select()
      .from(asaasWebhooks)
      .where(eq(asaasWebhooks.asaasEventId, eventId))
      .limit(1);
    return result[0];
  }

  async getUnprocessedWebhooks(limit: number = 100): Promise<AsaasWebhook[]> {
    return await db.select()
      .from(asaasWebhooks)
      .where(eq(asaasWebhooks.processed, false))
      .orderBy(asaasWebhooks.createdAt)
      .limit(limit);
  }

  async createAsaasWebhook(webhookData: InsertAsaasWebhook): Promise<AsaasWebhook> {
    const result = await db.insert(asaasWebhooks).values({
      ...webhookData,
      createdAt: new Date()
    }).returning();
    return result[0];
  }

  async updateAsaasWebhook(id: number, webhookData: Partial<AsaasWebhook>): Promise<AsaasWebhook | undefined> {
    const result = await db.update(asaasWebhooks)
      .set(webhookData)
      .where(eq(asaasWebhooks.id, id))
      .returning();
    return result[0];
  }

  // ============================================
  // CANCELLATION HISTORY METHODS
  // ============================================

  async createCancellationHistory(data: any): Promise<any> {
    const result = await db.insert(historicoCancelamentos).values({
      ...data,
      data_criacao: new Date()
    }).returning();
    return result[0];
  }

  // ============================================
  // WHATSAPP ONBOARDING METHODS
  // ============================================

  async getWhatsAppOnboardingState(remoteJid: string): Promise<WhatsAppOnboardingState | null> {
    const [state] = await db.select().from(whatsappOnboardingStates).where(eq(whatsappOnboardingStates.remoteJid, remoteJid));
    return state || null;
  }

  async createWhatsAppOnboardingState(state: InsertWhatsAppOnboardingState): Promise<WhatsAppOnboardingState> {
    const [inserted] = await db.insert(whatsappOnboardingStates).values(state).returning();
    return inserted;
  }

  async updateWhatsAppOnboardingState(remoteJid: string, updates: Partial<InsertWhatsAppOnboardingState>): Promise<void> {
    await db.update(whatsappOnboardingStates).set(updates).where(eq(whatsappOnboardingStates.remoteJid, remoteJid));
  }

  async deleteWhatsAppOnboardingState(remoteJid: string): Promise<void> {
    await db.delete(whatsappOnboardingStates).where(eq(whatsappOnboardingStates.remoteJid, remoteJid));
  }

  // ============================================
  // PJ — EMPRESAS METHODS (convive com PF; nada acima é alterado)
  // ============================================

  async createEmpresa(empresaData: InsertEmpresa): Promise<Empresa> {
    const result = await db.insert(empresas).values({
      ...empresaData,
      created_at: new Date()
    }).returning();
    return result[0];
  }

  async getEmpresasByUsuarioId(usuarioId: number): Promise<Empresa[]> {
    return db.select()
      .from(empresas)
      .where(eq(empresas.usuario_id, usuarioId))
      .orderBy(desc(empresas.created_at));
  }

  async getEmpresaById(id: number): Promise<Empresa | undefined> {
    const result = await db.select().from(empresas).where(eq(empresas.id, id)).limit(1);
    return result[0];
  }

  async updateEmpresa(id: number, empresaData: UpdateEmpresa): Promise<Empresa | undefined> {
    const result = await db.update(empresas)
      .set({
        ...empresaData,
        updated_at: new Date()
      })
      .where(eq(empresas.id, id))
      .returning();
    return result[0];
  }

  async deleteEmpresa(id: number): Promise<boolean> {
    const result = await db.delete(empresas).where(eq(empresas.id, id)).returning({ id: empresas.id });
    return result.length > 0;
  }

  // Plano de contas padrão (Yampa-like), criado quando a empresa é cadastrada.
  async seedEmpresasContas(empresaId: number): Promise<EmpresaConta[]> {
    // ativo/is_cmv têm default no banco; omitidos aqui de propósito (cast no insert).
    const seed = [
      // Receitas
      { empresa_id: empresaId, codigo: '1.01', nome: 'Receita de Vendas',            tipo: 'Receita', classificacao: 'OUTRA',     icone: 'shopping-bag', cor: '#10B981', descricao: 'Vendas de mercadorias/produtos.' },
      { empresa_id: empresaId, codigo: '1.02', nome: 'Receita de Serviços',          tipo: 'Receita', classificacao: 'OUTRA',     icone: 'briefcase',    cor: '#10B981', descricao: 'Prestação de serviços.' },
      { empresa_id: empresaId, codigo: '1.03', nome: 'Outras Receitas Operacionais', tipo: 'Receita', classificacao: 'OUTRA',     icone: 'plus-circle',  cor: '#10B981', descricao: 'Receitas operacionais diversas.' },
      { empresa_id: empresaId, codigo: '1.04', nome: 'Receitas Financeiras',        tipo: 'Receita', classificacao: 'OUTRA',     icone: 'trending-up',  cor: '#10B981', descricao: 'Rendimentos de aplicações, juros recebidos.' },

      // Despesas Fixas
      { empresa_id: empresaId, codigo: '2.01', nome: 'Folha de Pagamento',           tipo: 'Despesa', classificacao: 'FIXA',      icone: 'users',        cor: '#EF4444', descricao: 'Salários, encargos e benefícios.' },
      { empresa_id: empresaId, codigo: '2.02', nome: 'Aluguel',                      tipo: 'Despesa', classificacao: 'FIXA',      icone: 'home',         cor: '#EF4444', descricao: 'Aluguel do imóvel comercial.' },
      { empresa_id: empresaId, codigo: '2.03', nome: 'Energia / Água / Internet',    tipo: 'Despesa', classificacao: 'FIXA',      icone: 'zap',          cor: '#EF4444', descricao: 'Contas de consumo fixo.' },
      { empresa_id: empresaId, codigo: '2.04', nome: 'Contabilidade',                tipo: 'Despesa', classificacao: 'FIXA',      icone: 'file-text',    cor: '#EF4444', descricao: 'Honorários contábeis.' },
      { empresa_id: empresaId, codigo: '2.05', nome: 'Impostos e Taxas',             tipo: 'Despesa', classificacao: 'FIXA',      icone: 'percent',      cor: '#EF4444', descricao: 'Impostos fixos, taxas municipais.' },
      { empresa_id: empresaId, codigo: '2.06', nome: 'Pró-labore / Retiradas',       tipo: 'Despesa', classificacao: 'FIXA',      icone: 'user-check',   cor: '#EF4444', descricao: 'Retirada dos sócios.' },

      // Despesas Variáveis
      { empresa_id: empresaId, codigo: '3.01', nome: 'Compras de Mercadoria (CMV)',  tipo: 'Despesa', classificacao: 'VARIAVEL',  icone: 'package',      cor: '#F59E0B', descricao: 'CMV — Custo da Mercadoria Vendida.' },
      { empresa_id: empresaId, codigo: '3.02', nome: 'Matéria-prima / Insumos',      tipo: 'Despesa', classificacao: 'VARIAVEL',  icone: 'tool',         cor: '#F59E0B', descricao: 'Insumos para produção/serviço.' },
      { empresa_id: empresaId, codigo: '3.03', nome: 'Comissão de Vendedores',       tipo: 'Despesa', classificacao: 'VARIAVEL',  icone: 'percent',      cor: '#F59E0B', descricao: 'Comissões variáveis sobre vendas.' },
      { empresa_id: empresaId, codigo: '3.04', nome: 'Frete',                        tipo: 'Despesa', classificacao: 'VARIAVEL',  icone: 'truck',        cor: '#F59E0B', descricao: 'Fretes e logística variável.' },
      { empresa_id: empresaId, codigo: '3.05', nome: 'Marketing / Anúncios',         tipo: 'Despesa', classificacao: 'VARIAVEL',  icone: 'megaphone',    cor: '#F59E0B', descricao: 'Mídia, tráfego pago, anúncios.' },
      { empresa_id: empresaId, codigo: '3.06', nome: 'Despesas Financeiras',         tipo: 'Despesa', classificacao: 'VARIAVEL',  icone: 'credit-card',  cor: '#F59E0B', descricao: 'Juros, taxas bancárias, IOF.' },

      // Outras
      { empresa_id: empresaId, codigo: '4.01', nome: 'Outras Despesas Operacionais', tipo: 'Despesa', classificacao: 'OUTRA',     icone: 'more-horizontal', cor: '#6366F1', descricao: 'Demais despesas operacionais.' }
    ];

    if (seed.length === 0) return [];
    const result = await db.insert(empresasContas).values(seed as any).returning();
    return result;
  }

  async getEmpresasContasByEmpresaId(empresaId: number): Promise<EmpresaConta[]> {
    return db.select()
      .from(empresasContas)
      .where(
        and(
          eq(empresasContas.empresa_id, empresaId),
          eq(empresasContas.ativo, true)
        )
      )
      .orderBy(empresasContas.codigo);
  }

  async getEmpresaContaById(id: number): Promise<EmpresaConta | undefined> {
    const result = await db.select().from(empresasContas).where(eq(empresasContas.id, id)).limit(1);
    return result[0];
  }

  async createEmpresaConta(contaData: InsertEmpresaConta): Promise<EmpresaConta> {
    const result = await db.insert(empresasContas).values({
      ...contaData,
      created_at: new Date()
    }).returning();
    return result[0];
  }

  async updateEmpresaConta(id: number, contaData: UpdateEmpresaConta): Promise<EmpresaConta | undefined> {
    const result = await db.update(empresasContas).set(contaData).where(eq(empresasContas.id, id)).returning();
    return result[0];
  }

  async deleteEmpresaConta(id: number): Promise<boolean> {
    // Bloqueia exclusão se houver transação vinculada
    const used = await db.select({ count: count() }).from(empresasTransacoes).where(eq(empresasTransacoes.categoria_id, id));
    if ((used[0]?.count ?? 0) > 0) return false;
    const result = await db.delete(empresasContas).where(eq(empresasContas.id, id)).returning({ id: empresasContas.id });
    return result.length > 0;
  }

  async createEmpresaTransacao(transacaoData: InsertEmpresaTransacao): Promise<EmpresaTransacaoWithDetails> {
    const insertValues: any = {
      ...transacaoData,
      valor: typeof transacaoData.valor === 'number' ? transacaoData.valor.toString() : transacaoData.valor,
      data_registro: new Date()
    };

    const result = await db.insert(empresasTransacoes).values(insertValues).returning();
    const created = result[0];
    const withDetails = await this.getEmpresaTransacaoById(created.id);
    return withDetails || (created as EmpresaTransacaoWithDetails);
  }

  async getEmpresaTransacoesByEmpresaId(
    empresaId: number,
    opts: { de?: string; ate?: string; limit?: number } = {}
  ): Promise<EmpresaTransacaoWithDetails[]> {
    const conditions: any[] = [eq(empresasTransacoes.empresa_id, empresaId)];
    if (opts.de) conditions.push(gte(empresasTransacoes.data_transacao, opts.de));
    if (opts.ate) conditions.push(lte(empresasTransacoes.data_transacao, opts.ate));

    let q = db.select({
      id: empresasTransacoes.id,
      empresa_id: empresasTransacoes.empresa_id,
      carteira_id: empresasTransacoes.carteira_id,
      categoria_id: empresasTransacoes.categoria_id,
      forma_pagamento_id: empresasTransacoes.forma_pagamento_id,
      descricao: empresasTransacoes.descricao,
      valor: empresasTransacoes.valor,
      tipo: empresasTransacoes.tipo,
      data_transacao: empresasTransacoes.data_transacao,
      data_registro: empresasTransacoes.data_registro,
      status: empresasTransacoes.status,
      metodo_pagamento: empresasTransacoes.metodo_pagamento,
      origem: empresasTransacoes.origem,
      categoria_nome: empresasContas.nome,
      categoria_classificacao: empresasContas.classificacao,
      categoria_codigo: empresasContas.codigo,
      metodo_pagamento_nome: paymentMethods.nome
    })
      .from(empresasTransacoes)
      .leftJoin(empresasContas, eq(empresasTransacoes.categoria_id, empresasContas.id))
      .leftJoin(paymentMethods, eq(empresasTransacoes.forma_pagamento_id, paymentMethods.id))
      .where(and(...conditions))
      .orderBy(desc(empresasTransacoes.data_transacao), desc(empresasTransacoes.data_registro));

    if (opts.limit) q = q.limit(opts.limit) as any;

    const rows = await q;
    return rows.map((r: any) => ({
      ...r,
      metodo_pagamento: r.metodo_pagamento_nome ?? r.metodo_pagamento ?? null
    })) as EmpresaTransacaoWithDetails[];
  }

  async getEmpresaTransacaoById(id: number): Promise<EmpresaTransacaoWithDetails | undefined> {
    const result = await db.select({
      id: empresasTransacoes.id,
      empresa_id: empresasTransacoes.empresa_id,
      carteira_id: empresasTransacoes.carteira_id,
      categoria_id: empresasTransacoes.categoria_id,
      forma_pagamento_id: empresasTransacoes.forma_pagamento_id,
      descricao: empresasTransacoes.descricao,
      valor: empresasTransacoes.valor,
      tipo: empresasTransacoes.tipo,
      data_transacao: empresasTransacoes.data_transacao,
      data_registro: empresasTransacoes.data_registro,
      status: empresasTransacoes.status,
      metodo_pagamento: empresasTransacoes.metodo_pagamento,
      origem: empresasTransacoes.origem,
      categoria_nome: empresasContas.nome,
      categoria_classificacao: empresasContas.classificacao,
      categoria_codigo: empresasContas.codigo,
      metodo_pagamento_nome: paymentMethods.nome
    })
      .from(empresasTransacoes)
      .leftJoin(empresasContas, eq(empresasTransacoes.categoria_id, empresasContas.id))
      .leftJoin(paymentMethods, eq(empresasTransacoes.forma_pagamento_id, paymentMethods.id))
      .where(eq(empresasTransacoes.id, id))
      .limit(1);

    const row = result[0];
    if (!row) return undefined;
    return {
      ...row,
      metodo_pagamento: (row as any).metodo_pagamento_nome ?? row.metodo_pagamento ?? null
    } as EmpresaTransacaoWithDetails;
  }

  async updateEmpresaTransacao(id: number, transacaoData: UpdateEmpresaTransacao): Promise<EmpresaTransacaoWithDetails | undefined> {
    const updateValues: any = { ...transacaoData };
    if (typeof updateValues.valor === 'number') {
      updateValues.valor = updateValues.valor.toString();
    }
    await db.update(empresasTransacoes).set(updateValues).where(eq(empresasTransacoes.id, id)).returning();
    return this.getEmpresaTransacaoById(id);
  }

  async deleteEmpresaTransacao(id: number): Promise<boolean> {
    const result = await db.delete(empresasTransacoes).where(eq(empresasTransacoes.id, id)).returning({ id: empresasTransacoes.id });
    return result.length > 0;
  }

  async getEmpresaResumo(empresaId: number, opts: { de?: string; ate?: string } = {}): Promise<EmpresaResumo> {
    const now = new Date();
    const de = opts.de ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const ate = opts.ate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const rows = await db.execute(sql`
      SELECT
        t.tipo,
        c.classificacao,
        COALESCE(SUM(t.valor::numeric), 0) AS total,
        COUNT(t.id) AS qtd
      FROM empresas_transacoes t
      JOIN empresas_contas c ON t.categoria_id = c.id
      WHERE t.empresa_id = ${empresaId}
        AND t.data_transacao >= ${de}
        AND t.data_transacao <= ${ate}
      GROUP BY t.tipo, c.classificacao
    `);

    let entradas = 0;
    let saidasFixas = 0;
    let saidasVariaveis = 0;
    let saidasOutras = 0;
    let totalTransacoes = 0;

    for (const row of rows as any[]) {
      const total = parseFloat(row.total) || 0;
      const qtd = parseInt(row.qtd) || 0;
      totalTransacoes += qtd;
      if (row.tipo === 'Receita') {
        entradas += total;
      } else if (row.tipo === 'Despesa') {
        if (row.classificacao === 'FIXA') saidasFixas += total;
        else if (row.classificacao === 'VARIAVEL') saidasVariaveis += total;
        else saidasOutras += total;
      }
    }

    const totalSaidas = saidasFixas + saidasVariaveis + saidasOutras;
    const margemContribuicao = entradas - saidasVariaveis;
    const lucroPrejuizo = entradas - totalSaidas;

    const pct = (n: number, d: number): number | null => (d > 0 ? (n / d) * 100 : null);

    return {
      empresa_id: empresaId,
      periodo: { de, ate },
      entradas: round2(entradas),
      saidas_fixas: round2(saidasFixas),
      saidas_variaveis: round2(saidasVariaveis),
      saidas_outras: round2(saidasOutras),
      total_saidas: round2(totalSaidas),
      margem_contribuicao: round2(margemContribuicao),
      margem_contribuicao_pct: pct(margemContribuicao, entradas),
      lucro_prejuizo: round2(lucroPrejuizo),
      lucro_prejuizo_pct: pct(lucroPrejuizo, entradas),
      total_transacoes: totalTransacoes
    };
  }

  async getEmpresaDRE(empresaId: number, opts: { de?: string; ate?: string } = {}): Promise<EmpresaDRE> {
    const now = new Date();
    const de = opts.de ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const ate = opts.ate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const rows = await db.execute(sql`
      SELECT
        c.classificacao,
        COALESCE(SUM(t.valor::numeric), 0) AS total
      FROM empresas_transacoes t
      JOIN empresas_contas c ON t.categoria_id = c.id
      WHERE t.empresa_id = ${empresaId}
        AND t.tipo = 'Despesa'
        AND t.data_transacao >= ${de}
        AND t.data_transacao <= ${ate}
      GROUP BY c.classificacao
    `);

    let receita = 0;
    let variaveis = 0;
    let fixas = 0;
    let outras = 0;

    // receita
    const recRows = await db.execute(sql`
      SELECT COALESCE(SUM(valor::numeric), 0) AS total
      FROM empresas_transacoes
      WHERE empresa_id = ${empresaId}
        AND tipo = 'Receita'
        AND data_transacao >= ${de}
        AND data_transacao <= ${ate}
    `);
    receita = parseFloat((recRows as any[])[0]?.total) || 0;

    for (const row of rows as any[]) {
      const total = parseFloat(row.total) || 0;
      if (row.classificacao === 'FIXA') fixas += total;
      else if (row.classificacao === 'VARIAVEL') variaveis += total;
      else outras += total;
    }

    const margem = receita - variaveis;
    const lucro = receita - variaveis - fixas - outras;

    const pct = (n: number, d: number): number | null => (d > 0 ? (n / d) * 100 : null);

    return {
      empresa_id: empresaId,
      periodo: { de, ate },
      receita_bruta: round2(receita),
      despesas_variaveis: round2(variaveis),
      margem_contribuicao: round2(margem),
      margem_contribuicao_pct: pct(margem, receita),
      despesas_fixas: round2(fixas),
      outras_despesas: round2(outras),
      lucro_prejuizo: round2(lucro),
      lucro_prejuizo_pct: pct(lucro, receita)
    };
  }

  // Fluxo de Caixa Gerencial mensal (visão avançada/CFO). Agrega
  // empresas_transacoes por conta (categoria_id → empresas_contas) × mês do ano,
  // com sinal (Receita +, Despesa −). O front monta a árvore e as linhas
  // calculadas a partir da classificacao. Mesmo escopo do DRE (empresas_transacoes).
  async getEmpresaFluxoCaixaMensal(empresaId: number, ano: number): Promise<EmpresaFluxoCaixaMensal> {
    const contas = await db.select().from(empresasContas)
      .where(eq(empresasContas.empresa_id, empresaId))
      .orderBy(empresasContas.codigo);

    const rows = await db.execute(sql`
      SELECT t.categoria_id AS conta_id,
             EXTRACT(MONTH FROM t.data_transacao)::int AS mes,
             SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND COALESCE(t.movimenta_caixa, true) = true
        AND EXTRACT(YEAR FROM t.data_transacao) = ${ano}
      GROUP BY t.categoria_id, mes
    `);

    const agregado = (rows as any[]).map((r) => ({
      conta_id: Number(r.conta_id),
      mes: Number(r.mes),
      total: parseFloat(r.total) || 0,
    }));

    // ---- Disponibilidades: contas bancárias + movimento por conta × mês ----
    const contasBancRows = await db.execute(sql`
      SELECT id, banco, saldo_inicial::numeric AS saldo_inicial
      FROM contas_bancarias
      WHERE empresa_id = ${empresaId} AND ativo = true
      ORDER BY banco
    `);
    const contasBancarias = (contasBancRows as any[]).map((r) => ({
      id: Number(r.id), banco: String(r.banco), saldo_inicial: parseFloat(r.saldo_inicial) || 0,
    }));

    // Movimento (com sinal) por conta bancária × mês, dentro do ano.
    const movRows = await db.execute(sql`
      SELECT t.conta_bancaria_id,
             EXTRACT(MONTH FROM t.data_transacao)::int AS mes,
             SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND t.conta_bancaria_id IS NOT NULL
        AND COALESCE(t.movimenta_caixa, true) = true
        AND EXTRACT(YEAR FROM t.data_transacao) = ${ano}
      GROUP BY t.conta_bancaria_id, mes
    `);
    const movContas = (movRows as any[]).map((r) => ({
      conta_bancaria_id: Number(r.conta_bancaria_id), mes: Number(r.mes), total: parseFloat(r.total) || 0,
    }));

    // Movimento acumulado ANTES do ano (para o saldo inicial de janeiro).
    const antesRows = await db.execute(sql`
      SELECT t.conta_bancaria_id,
             SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND t.conta_bancaria_id IS NOT NULL
        AND COALESCE(t.movimenta_caixa, true) = true
        AND EXTRACT(YEAR FROM t.data_transacao) < ${ano}
      GROUP BY t.conta_bancaria_id
    `);
    const saldoAntesAno = (antesRows as any[]).map((r) => ({
      conta_bancaria_id: Number(r.conta_bancaria_id), total: parseFloat(r.total) || 0,
    }));

    return { empresa_id: empresaId, ano, contas: contas as any, agregado, contasBancarias, movContas, saldoAntesAno };
  }
}

// ============================================
// METAS FINANCEIRAS — caixinhas, sonhos, orçamentos
// ============================================

export async function createMeta(userId: number, metaData: InsertMeta): Promise<MetaFinanceira> {
  // Meta por ambiente: se o login é PJ (tem empresa), a meta pertence à empresa.
  // Um login = um ambiente, então basta pegar a empresa do usuário (PF não tem).
  let empresaId = (metaData as any).empresa_id ?? null;
  if (empresaId == null) {
    const empresasDoUser = await db.select({ id: empresas.id })
      .from(empresas)
      .where(eq(empresas.usuario_id, userId))
      .orderBy(empresas.id)
      .limit(1);
    empresaId = empresasDoUser[0]?.id ?? null;
  }
  const result = await db.insert(metasFinanceiras).values({
    ...metaData,
    usuario_id: userId,
    empresa_id: empresaId,
    valor_alvo: metaData.valor_alvo.toString(),
    valor_atual: (metaData.valor_atual || 0).toString(),
    valor_recorrencia: metaData.valor_recorrencia ? metaData.valor_recorrencia.toString() : null,
    created_at: new Date()
  } as any).returning();
  return result[0];
}

export async function getMetasByUsuarioId(userId: number): Promise<MetaComProgresso[]> {
  const metas = await db.select()
    .from(metasFinanceiras)
    .where(and(eq(metasFinanceiras.usuario_id, userId), eq(metasFinanceiras.ativo, true)))
    .orderBy(desc(metasFinanceiras.created_at));

  return metas.map(m => {
    const alvo = parseFloat(m.valor_alvo as string) || 0;
    const atual = parseFloat(m.valor_atual as string) || 0;
    const falta = Math.max(0, alvo - atual);
    const progresso = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;

    // Calcular meses restantes baseado na recorrência
    let mesesRestantes: number | null = null;
    const valorRec = parseFloat(m.valor_recorrencia as string) || 0;
    if (valorRec > 0 && falta > 0) {
      mesesRestantes = Math.ceil(falta / valorRec);
    }

    return {
      ...m,
      progresso_pct: Math.round(progresso * 10) / 10,
      falta: Math.round(falta * 100) / 100,
      meses_restantes: mesesRestantes
    };
  });
}

export async function getMetaById(id: number): Promise<MetaFinanceira | undefined> {
  const result = await db.select().from(metasFinanceiras).where(eq(metasFinanceiras.id, id)).limit(1);
  return result[0];
}

export async function depositarMeta(id: number, valor: number): Promise<MetaFinanceira | undefined> {
  const meta = await getMetaById(id);
  if (!meta) return undefined;
  const novoValor = (parseFloat(meta.valor_atual as string) || 0) + valor;
  const result = await db.update(metasFinanceiras)
    .set({ valor_atual: novoValor.toString() } as any)
    .where(eq(metasFinanceiras.id, id))
    .returning();
  return result[0];
}

export async function sacarMeta(id: number, valor: number): Promise<MetaFinanceira | undefined> {
  const meta = await getMetaById(id);
  if (!meta) return undefined;
  const atual = parseFloat(meta.valor_atual as string) || 0;
  const novoValor = Math.max(0, atual - valor);
  const result = await db.update(metasFinanceiras)
    .set({ valor_atual: novoValor.toString() } as any)
    .where(eq(metasFinanceiras.id, id))
    .returning();
  return result[0];
}

export async function ajustarSaldoMeta(id: number, novoSaldo: number): Promise<MetaFinanceira | undefined> {
  const result = await db.update(metasFinanceiras)
    .set({ valor_atual: novoSaldo.toString() } as any)
    .where(eq(metasFinanceiras.id, id))
    .returning();
  return result[0];
}

export async function updateMeta(id: number, data: UpdateMeta): Promise<MetaFinanceira | undefined> {
  const updateValues: any = { ...data };
  if (data.valor_alvo) updateValues.valor_alvo = data.valor_alvo.toString();
  if (data.valor_atual !== undefined) updateValues.valor_atual = data.valor_atual.toString();
  if (data.valor_recorrencia) updateValues.valor_recorrencia = data.valor_recorrencia.toString();
  const result = await db.update(metasFinanceiras).set(updateValues).where(eq(metasFinanceiras.id, id)).returning();
  return result[0];
}

export async function deleteMeta(id: number): Promise<boolean> {
  const result = await db.update(metasFinanceiras)
    .set({ ativo: false })
    .where(eq(metasFinanceiras.id, id))
    .returning();
  return result.length > 0;
}

// Verifica orçamento: compara gastos do mês atual por categoria vs metas tipo 'limite_categoria'
export async function verificarOrcamentos(userId: number, walletId: number): Promise<{ categoria: string; limite: number; gasto: number; percentual: number; status: string }[]> {
  // Buscar metas tipo limite_categoria ativas
  const limites = await db.select()
    .from(metasFinanceiras)
    .where(and(
      eq(metasFinanceiras.usuario_id, userId),
      eq(metasFinanceiras.tipo, 'limite_categoria'),
      eq(metasFinanceiras.ativo, true)
    ));

  if (limites.length === 0) return [];

  // Período: mês atual
  const now = new Date();
  const de = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const ate = now.toISOString().slice(0, 10);

  const results: { categoria: string; limite: number; gasto: number; percentual: number; status: string }[] = [];

  for (const limite of limites) {
    if (!limite.categoria_id) continue;

    // Buscar gasto na categoria no mês
    const rows = await db.execute(sql`
      SELECT COALESCE(SUM(valor::numeric), 0) AS total
      FROM transacoes
      WHERE carteira_id = ${walletId}
        AND categoria_id = ${limite.categoria_id}
        AND tipo = 'Despesa'
        AND COALESCE(reembolsavel, false) = false
        AND data_transacao >= ${de}
        AND data_transacao <= ${ate}
    `);

    const gasto = parseFloat((rows as any[])[0]?.total) || 0;
    const limiteVal = parseFloat(limite.valor_alvo as string) || 0;
    const pct = limiteVal > 0 ? (gasto / limiteVal) * 100 : 0;

    // Buscar nome da categoria
    const cat = await db.select().from(categories).where(eq(categories.id, limite.categoria_id)).limit(1);
    const catNome = cat[0]?.nome || 'Desconhecida';

    let status = '✅ OK';
    if (pct >= 100) status = '🚨 ESTOURADO';
    else if (pct >= 80) status = '⚠️ ATENÇÃO';
    else if (pct >= 60) status = '📊 Moderado';

    results.push({
      categoria: catNome,
      limite: Math.round(limiteVal * 100) / 100,
      gasto: Math.round(gasto * 100) / 100,
      percentual: Math.round(pct * 10) / 10,
      status
    });
  }

  return results;
}

// ============================================
// CONTROLE DE CARTÕES DE CRÉDITO
// ============================================

/**
 * Calcula saldo usado de um cartão no período de fatura atual.
 * Período = dia_fechamento do mês anterior até dia_fechamento deste mês.
 */
export async function getSaldoCartao(cartaoId: number, walletId: number): Promise<{
  cartao_nome: string;
  limite: number;
  usado: number;
  disponivel: number;
  percentual: number;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}> {
  // Buscar dados do cartão
  const cartaoRows = await db.select().from(paymentMethods).where(eq(paymentMethods.id, cartaoId)).limit(1);
  const cartao = cartaoRows[0];
  if (!cartao) throw new Error("Cartão não encontrado");

  const limite = parseFloat(cartao.limite as string) || 0;
  const diaFech = cartao.dia_fechamento || 1;

  // Calcular período da fatura atual
  const now = new Date();
  let inicioFatura: string;
  let fimFatura: string;

  if (now.getDate() >= diaFech) {
    // Já passou o fechamento — fatura atual vai de diaFech deste mês até diaFech próximo mês
    inicioFatura = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, diaFech);
    fimFatura = nextMonth.toISOString().slice(0, 10);
  } else {
    // Antes do fechamento — fatura vai de diaFech mês passado até diaFech deste mês
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, diaFech);
    inicioFatura = prevMonth.toISOString().slice(0, 10);
    fimFatura = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`;
  }

  // Somar gastos no cartão no período
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM transacoes
    WHERE carteira_id = ${walletId}
      AND forma_pagamento_id = ${cartaoId}
      AND tipo = 'Despesa'
      AND data_transacao >= ${inicioFatura}
      AND data_transacao < ${fimFatura}
  `);

  const usado = parseFloat((rows as any[])[0]?.total) || 0;
  const disponivel = Math.max(0, limite - usado);
  const percentual = limite > 0 ? (usado / limite) * 100 : 0;

  return {
    cartao_nome: cartao.nome,
    limite: Math.round(limite * 100) / 100,
    usado: Math.round(usado * 100) / 100,
    disponivel: Math.round(disponivel * 100) / 100,
    percentual: Math.round(percentual * 10) / 10,
    dia_fechamento: cartao.dia_fechamento,
    dia_vencimento: cartao.dia_vencimento
  };
}

/**
 * Lista todos os cartões do usuário com saldo atual.
 */
export async function getCartoesComSaldo(userId: number, walletId: number): Promise<any[]> {
  const cartoes = await db.select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.usuario_id, userId),
        eq(paymentMethods.ativo, true),
        sql`${paymentMethods.limite} IS NOT NULL AND ${paymentMethods.limite} > 0`
      )
    );

  const result = [];
  for (const cartao of cartoes) {
    try {
      const saldo = await getSaldoCartao(cartao.id, walletId);
      result.push(saldo);
    } catch (_) { /* skip */ }
  }
  return result;
}

/**
 * Lista transações de um cartão específico no período da fatura atual (para conciliação).
 */
export async function getFaturaCartao(cartaoId: number, walletId: number): Promise<{
  cartao: string; periodo_de: string; periodo_ate: string; total: number; transacoes: any[]
}> {
  const cartaoRows = await db.select().from(paymentMethods).where(eq(paymentMethods.id, cartaoId)).limit(1);
  const cartao = cartaoRows[0];
  if (!cartao) throw new Error("Cartão não encontrado");

  const diaFech = cartao.dia_fechamento || 1;
  const now = new Date();

  let inicioFatura: string;
  let fimFatura: string;

  if (now.getDate() >= diaFech) {
    inicioFatura = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, diaFech);
    fimFatura = nextMonth.toISOString().slice(0, 10);
  } else {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, diaFech);
    inicioFatura = prevMonth.toISOString().slice(0, 10);
    fimFatura = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`;
  }

  const rows = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.reembolsavel, c.nome AS categoria
    FROM transacoes t
    LEFT JOIN categorias c ON t.categoria_id = c.id
    WHERE t.carteira_id = ${walletId}
      AND t.forma_pagamento_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND t.data_transacao >= ${inicioFatura}
      AND t.data_transacao < ${fimFatura}
    ORDER BY t.data_transacao DESC
  `);

  const total = (rows as any[]).reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);

  return {
    cartao: cartao.nome,
    periodo_de: inicioFatura,
    periodo_ate: fimFatura,
    total: Math.round(total * 100) / 100,
    transacoes: rows as any[]
  };
}

// ============================================
// CONTAS A PAGAR + FLUXO DE CAIXA
// ============================================

/**
 * Cria o plano de contas pessoal para um novo usuário (cópia do template base).
 * Cada usuário recebe seu próprio plano — pode editar/excluir sem afetar outros.
 */
export async function seedPlanoContasPessoal(userId: number): Promise<void> {
  const { PLANO_CONTAS_BASE } = await import("./data/plano-contas-base");

  for (const cat of PLANO_CONTAS_BASE) {
    await db.insert(categories).values({
      nome: cat.nome,
      tipo: cat.tipo,
      cor: cat.cor,
      icone: cat.icone,
      descricao: cat.descricao,
      usuario_id: userId,
      global: false,
    }).onConflictDoNothing();
  }
}

export async function getContasAPagar(walletId: number, status?: 'pendente' | 'atrasada' | 'proximas'): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10);
  const tresDias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  try {
    // Query simples — busca todas as pendentes com vencimento, depois filtra em JS
    const rows = await db.execute(sql`
      SELECT t.id, t.descricao, t.valor, t.data_vencimento, t.data_transacao,
             t.recorrente, t.classificacao_despesa, t.status,
             c.nome AS categoria
      FROM transacoes t
      LEFT JOIN categorias c ON t.categoria_id = c.id
      WHERE t.carteira_id = ${walletId}
        AND t.status = 'Pendente'
        AND COALESCE(t.reembolsavel, false) = false
        AND t.data_vencimento IS NOT NULL
      ORDER BY t.data_vencimento ASC
    `);

    // Classificar urgência e filtrar em JS (evita sql.raw)
    const result = (rows as any[]).map(r => {
      const venc = r.data_vencimento;
      let urgencia = 'futura';
      if (venc < today) urgencia = 'atrasada';
      else if (venc <= tresDias) urgencia = 'proxima';
      return { ...r, urgencia };
    });

    // Filtrar por status se informado
    if (status === 'atrasada') return result.filter(r => r.urgencia === 'atrasada');
    if (status === 'proximas') return result.filter(r => r.urgencia === 'proxima');
    return result;
  } catch (err: any) {
    // Se coluna data_vencimento não existe ainda (migration não rodou), retorna vazio
    if (err.message?.includes('data_vencimento') || err.message?.includes('column')) {
      console.warn('[getContasAPagar] Coluna data_vencimento não existe ainda. Rode a migration.');
      return [];
    }
    throw err;
  }
}

export async function marcarComoPaga(transacaoId: number): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute(sql`
    UPDATE transacoes
    SET status = 'Efetivada', data_pagamento = ${today}
    WHERE id = ${transacaoId}
    RETURNING *
  `);
  return (result as any[])[0];
}

export async function marcarRecorrente(transacaoId: number, recorrente: boolean): Promise<any> {
  const classificacao = recorrente ? 'fixa' : 'variavel';
  const result = await db.execute(sql`
    UPDATE transacoes
    SET recorrente = ${recorrente}, classificacao_despesa = ${classificacao}
    WHERE id = ${transacaoId}
    RETURNING *
  `);
  return (result as any[])[0];
}

/**
 * Lista gastos de terceiros lançados no cartão e ainda não reembolsados.
 * Eles continuam compondo a fatura, mas não são obrigação nem despesa pessoal.
 */
export async function getReembolsosAReceber(walletId: number): Promise<any[]> {
  const rows = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.data_vencimento,
           t.status, t.data_pagamento AS recebido_em,
           c.nome AS categoria, fp.nome AS forma_pagamento
    FROM transacoes t
    LEFT JOIN categorias c ON t.categoria_id = c.id
    LEFT JOIN formas_pagamento fp ON t.forma_pagamento_id = fp.id
    WHERE t.carteira_id = ${walletId}
      AND COALESCE(t.reembolsavel, false) = true
      AND t.status = 'Pendente'
    ORDER BY COALESCE(t.data_vencimento, t.data_transacao) ASC, t.id ASC
  `);
  return rows as any[];
}

export async function marcarReembolsoRecebido(transacaoId: number, walletId: number): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute(sql`
    UPDATE transacoes
    SET status = 'Efetivada', data_pagamento = ${today}
    WHERE id = ${transacaoId}
      AND carteira_id = ${walletId}
      AND COALESCE(reembolsavel, false) = true
    RETURNING *
  `);
  return (result as any[])[0];
}

export async function getFluxoCaixaResumo(walletId: number, mes?: number, ano?: number): Promise<{
  renda: number;
  dizimos: number;
  sonhos_depositos: number;
  despesas_fixas: number;
  despesas_variaveis: number;
  sobra: number;
  contas_pendentes: number;
  contas_atrasadas: number;
}> {
  const now = new Date();
  const m = mes || (now.getMonth() + 1);
  const a = ano || now.getFullYear();
  const de = `${a}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(a, m, 0).getDate();
  const ate = `${a}-${String(m).padStart(2, '0')}-${lastDay}`;
  const today = now.toISOString().slice(0, 10);

  // Renda (receitas do mês)
  const rendaRows = await db.execute(sql`
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM transacoes WHERE carteira_id = ${walletId} AND tipo = 'Receita'
      AND data_transacao >= ${de} AND data_transacao <= ${ate}
  `);
  const renda = parseFloat((rendaRows as any[])[0]?.total) || 0;

  // Dízimos e Ofertas (categoria específica)
  const dizimosRows = await db.execute(sql`
    SELECT COALESCE(SUM(t.valor::numeric), 0) AS total
    FROM transacoes t
    JOIN categorias c ON t.categoria_id = c.id
    WHERE t.carteira_id = ${walletId} AND t.tipo = 'Despesa'
      AND COALESCE(t.reembolsavel, false) = false
      AND (c.nome ILIKE '%dízimo%' OR c.nome ILIKE '%dizimo%' OR c.nome ILIKE '%oferta%')
      AND t.data_transacao >= ${de} AND t.data_transacao <= ${ate}
  `);
  const dizimos = parseFloat((dizimosRows as any[])[0]?.total) || 0;

  // Sonhos (depósitos em metas no mês — calculado pela diferença de valor_atual)
  // Simplificado: soma de metas.valor_recorrencia * 1 (se mensal) para o mês
  const sonhosRows = await db.execute(sql`
    SELECT COALESCE(SUM(valor_recorrencia::numeric), 0) AS total
    FROM metas_financeiras
    WHERE usuario_id = (SELECT usuario_id FROM carteiras WHERE id = ${walletId})
      AND ativo = true AND tipo IN ('caixinha', 'sonho', 'reserva')
      AND recorrencia = 'mensal'
  `);
  const sonhos = parseFloat((sonhosRows as any[])[0]?.total) || 0;

  // Despesas fixas (recorrente=true OU classificacao_despesa='fixa')
  const fixasRows = await db.execute(sql`
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM transacoes WHERE carteira_id = ${walletId} AND tipo = 'Despesa'
      AND COALESCE(reembolsavel, false) = false
      AND (recorrente = true OR classificacao_despesa = 'fixa')
      AND data_transacao >= ${de} AND data_transacao <= ${ate}
  `);
  const fixas = parseFloat((fixasRows as any[])[0]?.total) || 0;

  // Despesas variáveis (não fixa, não dízimo)
  const variaveisRows = await db.execute(sql`
    SELECT COALESCE(SUM(t.valor::numeric), 0) AS total
    FROM transacoes t
    LEFT JOIN categorias c ON t.categoria_id = c.id
    WHERE t.carteira_id = ${walletId} AND t.tipo = 'Despesa'
      AND COALESCE(t.reembolsavel, false) = false
      AND (t.recorrente = false OR t.recorrente IS NULL)
      AND (t.classificacao_despesa IS NULL OR t.classificacao_despesa = 'variavel')
      AND NOT (c.nome ILIKE '%dízimo%' OR c.nome ILIKE '%dizimo%' OR c.nome ILIKE '%oferta%')
      AND t.data_transacao >= ${de} AND t.data_transacao <= ${ate}
  `);
  const variaveis = parseFloat((variaveisRows as any[])[0]?.total) || 0;

  // Contas pendentes e atrasadas
  const pendentesRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE data_vencimento IS NOT NULL AND status = 'Pendente') AS pendentes,
      COUNT(*) FILTER (WHERE data_vencimento < ${today} AND status = 'Pendente') AS atrasadas
    FROM transacoes WHERE carteira_id = ${walletId}
      AND COALESCE(reembolsavel, false) = false
  `);
  const pendentes = parseInt((pendentesRows as any[])[0]?.pendentes) || 0;
  const atrasadas = parseInt((pendentesRows as any[])[0]?.atrasadas) || 0;

  const sobra = renda - dizimos - sonhos - fixas - variaveis;

  return {
    renda: Math.round(renda * 100) / 100,
    dizimos: Math.round(dizimos * 100) / 100,
    sonhos_depositos: Math.round(sonhos * 100) / 100,
    despesas_fixas: Math.round(fixas * 100) / 100,
    despesas_variaveis: Math.round(variaveis * 100) / 100,
    sobra: Math.round(sobra * 100) / 100,
    contas_pendentes: pendentes,
    contas_atrasadas: atrasadas
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ============================================
// QUERIES INTELIGENTES — usadas pelo agente IA
// Resumos por dia, semana, período customizado,
// breakdown por categoria, comparação entre períodos.
// ============================================

export async function getDailySummary(walletId: number, date: string): Promise<{ totalReceita: number; totalDespesa: number; saldo: number; transacoes: number }> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor::numeric ELSE 0 END), 0) AS despesa,
      COUNT(*) AS qtd
    FROM transacoes
    WHERE carteira_id = ${walletId}
      AND data_transacao = ${date}
      AND (tipo <> 'Despesa' OR COALESCE(reembolsavel, false) = false)
  `);
  const row = (rows as any[])[0] || { receita: 0, despesa: 0, qtd: 0 };
  const receita = parseFloat(row.receita) || 0;
  const despesa = parseFloat(row.despesa) || 0;
  return { totalReceita: round2(receita), totalDespesa: round2(despesa), saldo: round2(receita - despesa), transacoes: parseInt(row.qtd) || 0 };
}

export async function getPeriodSummary(walletId: number, de: string, ate: string): Promise<{ totalReceita: number; totalDespesa: number; saldo: number; transacoes: number }> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor::numeric ELSE 0 END), 0) AS despesa,
      COUNT(*) AS qtd
    FROM transacoes
    WHERE carteira_id = ${walletId}
      AND data_transacao >= ${de}
      AND data_transacao <= ${ate}
      AND (tipo <> 'Despesa' OR COALESCE(reembolsavel, false) = false)
  `);
  const row = (rows as any[])[0] || { receita: 0, despesa: 0, qtd: 0 };
  const receita = parseFloat(row.receita) || 0;
  const despesa = parseFloat(row.despesa) || 0;
  return { totalReceita: round2(receita), totalDespesa: round2(despesa), saldo: round2(receita - despesa), transacoes: parseInt(row.qtd) || 0 };
}

export async function getWeeklySummary(walletId: number, weekOffset: number = 0): Promise<{ de: string; ate: string; totalReceita: number; totalDespesa: number; saldo: number; transacoes: number }> {
  // Calcula seg-dom da semana com offset (0=atual, -1=passada)
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // domingo=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1 + (weekOffset * 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const de = monday.toISOString().slice(0, 10);
  const ate = sunday.toISOString().slice(0, 10);

  const result = await getPeriodSummary(walletId, de, ate);
  return { de, ate, ...result };
}

export async function getCategoryBreakdown(walletId: number, de: string, ate: string): Promise<{ categoria: string; total: number; tipo: string; percentual: number }[]> {
  const rows = await db.execute(sql`
    SELECT
      c.nome AS categoria,
      t.tipo,
      COALESCE(SUM(t.valor::numeric), 0) AS total
    FROM transacoes t
    JOIN categorias c ON t.categoria_id = c.id
    WHERE t.carteira_id = ${walletId}
      AND t.data_transacao >= ${de}
      AND t.data_transacao <= ${ate}
      AND (t.tipo <> 'Despesa' OR COALESCE(t.reembolsavel, false) = false)
    GROUP BY c.nome, t.tipo
    ORDER BY total DESC
  `);

  // Calcular percentuais separados por tipo
  const despesaTotal = (rows as any[]).filter(r => r.tipo === 'Despesa').reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
  const receitaTotal = (rows as any[]).filter(r => r.tipo === 'Receita').reduce((s, r) => s + (parseFloat(r.total) || 0), 0);

  return (rows as any[]).map(r => {
    const total = parseFloat(r.total) || 0;
    const base = r.tipo === 'Despesa' ? despesaTotal : receitaTotal;
    return {
      categoria: r.categoria,
      tipo: r.tipo,
      total: round2(total),
      percentual: base > 0 ? round2((total / base) * 100) : 0
    };
  });
}

// ============================================
// AUDITORIA ADMINISTRATIVA
// ============================================
export async function createAuditLog(data: InsertAuditoriaAdmin): Promise<AuditoriaAdmin> {
  const result = await db.insert(auditoriaAdmin)
    .values({
      ...data,
      created_at: new Date()
    })
    .returning();
  return result[0];
}

export async function getAuditLogs(opts: {
  adminId?: number;
  acao?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AuditoriaAdmin[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;

  let query = db.select().from(auditoriaAdmin).orderBy(desc(auditoriaAdmin.created_at)).limit(limit).offset(offset);

  if (opts.adminId) {
    query = query.where(eq(auditoriaAdmin.admin_id, opts.adminId)) as any;
  }
  if (opts.acao) {
    query = query.where(eq(auditoriaAdmin.acao, opts.acao)) as any;
  }

  return query;
}

export async function comparePeriods(walletId: number, p1Start: string, p1End: string, p2Start: string, p2End: string): Promise<{
  periodo1: { de: string; ate: string; receita: number; despesa: number; saldo: number };
  periodo2: { de: string; ate: string; receita: number; despesa: number; saldo: number };
  variacao: { receita_pct: number | null; despesa_pct: number | null; saldo_diff: number };
}> {
  const p1 = await getPeriodSummary(walletId, p1Start, p1End);
  const p2 = await getPeriodSummary(walletId, p2Start, p2End);

  const varPct = (atual: number, anterior: number): number | null => {
    if (anterior === 0) return null;
    return round2(((atual - anterior) / anterior) * 100);
  };

  return {
    periodo1: { de: p1Start, ate: p1End, receita: p1.totalReceita, despesa: p1.totalDespesa, saldo: p1.saldo },
    periodo2: { de: p2Start, ate: p2End, receita: p2.totalReceita, despesa: p2.totalDespesa, saldo: p2.saldo },
    variacao: {
      receita_pct: varPct(p2.totalReceita, p1.totalReceita),
      despesa_pct: varPct(p2.totalDespesa, p1.totalDespesa),
      saldo_diff: round2(p2.saldo - p1.saldo)
    }
  };
}

export const storage = new DbStorage();

// ============================================
// Log de ingestão por IA (diagnóstico / painel admin)
// ============================================
export async function createIngestionEvent(ev: {
  usuario_id?: number | null;
  remote_jid?: string | null;
  canal?: string;
  tipo_mensagem?: string | null;
  mensagem_raw?: string | null;
  resultado: string; // sucesso | sem_credito | rate_limit | transitorio | timeout | auth | bug | erro_parsing | usuario_inativo
  etapa?: string | null; // transcricao | visao | agente | envio | pipeline
  detalhe?: string | null;
  provider?: string | null;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO ingestion_events
        (usuario_id, remote_jid, canal, tipo_mensagem, mensagem_raw, resultado, etapa, detalhe, provider)
      VALUES
        (${ev.usuario_id ?? null}, ${ev.remote_jid ?? null}, ${ev.canal ?? 'whatsapp'},
         ${ev.tipo_mensagem ?? null}, ${ev.mensagem_raw ?? null}, ${ev.resultado},
         ${ev.etapa ?? null}, ${ev.detalhe ?? null}, ${ev.provider ?? null})
    `);
  } catch (err: any) {
    // Nunca deixar o log de ingestão derrubar o fluxo principal.
    console.error("[IngestionEvent] falha ao registrar evento:", err?.message);
  }
}

export async function listIngestionEvents(opts: {
  resultado?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<any[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const result = opts.resultado
    ? await db.execute(sql`
        SELECT * FROM ingestion_events WHERE resultado = ${opts.resultado}
        ORDER BY data_criacao DESC LIMIT ${limit} OFFSET ${offset}`)
    : await db.execute(sql`
        SELECT * FROM ingestion_events
        ORDER BY data_criacao DESC LIMIT ${limit} OFFSET ${offset}`);
  return result as any[];
}

// ============================================
// FASE 4 — Memória de conversa (contexto entre mensagens)
// ============================================
export async function getConversaRecente(
  userId: number,
  limit = 6,
): Promise<{ role: string; content: string }[]> {
  try {
    const rows = await db.execute(sql`
      SELECT role, content FROM conversa_historico
      WHERE usuario_id = ${userId}
      ORDER BY id DESC LIMIT ${limit}
    `);
    return (rows as any[]).reverse().map((r) => ({ role: r.role, content: r.content }));
  } catch (err: any) {
    console.error("[Conversa] falha ao ler histórico:", err?.message);
    return [];
  }
}

export async function appendConversa(
  userId: number,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  try {
    const trimmed = (content || "").slice(0, 4000);
    await db.execute(sql`
      INSERT INTO conversa_historico (usuario_id, role, content)
      VALUES (${userId}, ${role}, ${trimmed})
    `);
    // Poda: mantém só as últimas 20 mensagens por usuário.
    await db.execute(sql`
      DELETE FROM conversa_historico
      WHERE usuario_id = ${userId}
        AND id NOT IN (
          SELECT id FROM conversa_historico
          WHERE usuario_id = ${userId}
          ORDER BY id DESC LIMIT 20
        )
    `);
  } catch (err: any) {
    console.error("[Conversa] falha ao gravar histórico:", err?.message);
  }
}

// ============================================
// FASE 4 — Memória por usuário (comerciante → categoria)
// ============================================
function normalizeChaveMem(s: string): string {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export async function resolveMemoriaCategoria(
  userId: number,
  texto: string,
): Promise<{ categoria_id: number; categoria_nome: string } | undefined> {
  const alvo = normalizeChaveMem(texto);
  if (!alvo) return undefined;
  try {
    const rows = await db.execute(sql`
      SELECT chave, valor FROM memoria_usuario
      WHERE usuario_id = ${userId} AND tipo = 'merchant_categoria'
    `);
    let melhor: any;
    for (const r of rows as any[]) {
      const k = normalizeChaveMem(r.chave);
      if (k && (alvo.includes(k) || k.includes(alvo))) {
        if (!melhor || k.length > normalizeChaveMem(melhor.chave).length) melhor = r;
      }
    }
    if (!melhor) return undefined;
    const v = typeof melhor.valor === "string" ? JSON.parse(melhor.valor) : melhor.valor;
    if (!v?.categoria_id) return undefined;
    return { categoria_id: Number(v.categoria_id), categoria_nome: v.categoria_nome };
  } catch (err: any) {
    console.error("[Memória] falha ao resolver:", err?.message);
    return undefined;
  }
}

export async function aprenderMemoriaCategoria(
  userId: number,
  chave: string,
  categoriaId: number,
  categoriaNome: string,
): Promise<void> {
  const chaveNorm = normalizeChaveMem(chave);
  if (!chaveNorm) return;
  try {
    const valor = JSON.stringify({ categoria_id: categoriaId, categoria_nome: categoriaNome });
    await db.execute(sql`
      INSERT INTO memoria_usuario (usuario_id, tipo, chave, valor)
      VALUES (${userId}, 'merchant_categoria', ${chaveNorm}, ${valor}::jsonb)
      ON CONFLICT (usuario_id, tipo, chave)
      DO UPDATE SET valor = ${valor}::jsonb, hits = memoria_usuario.hits + 1,
                    updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    `);
  } catch (err: any) {
    console.error("[Memória] falha ao aprender:", err?.message);
  }
}

// ============================================
// Compra parcelada (agrupamento) e edição de compra
// ============================================

// Resolve uma forma de pagamento pelo nome (usuário + globais); cria se não achar.
// Nomes genéricos que NÃO são cartões nominais (não pedimos limite/fechamento).
const FORMAS_GENERICAS = /^(pix|dinheiro|d[eé]bito|cart[aã]o de d[eé]bito|cart[aã]o de cr[eé]dito|boleto|transfer[eê]ncia|esp[eé]cie|cart[aã]o)$/i;

export async function resolveOuCriaFormaPagamento(
  userId: number,
  nome: string,
): Promise<{ id: number; nome: string; criado: boolean; incompleto: boolean; faltando: string[] }> {
  const norm = (s: string) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alvo = norm(nome);
  const rows = await db.execute(sql`
    SELECT id, nome, dia_fechamento, dia_vencimento, limite FROM formas_pagamento
    WHERE (usuario_id = ${userId} OR global = true) AND ativo = true
  `);
  const lista = rows as any[];

  // 1) match exato. 2) match por substring — mas ignora nomes genéricos na
  //    direção "alvo contém nome" (evita o 'Cartão de Crédito' engolir 'Nubank').
  let match = lista.find((r) => norm(r.nome) === alvo);
  if (!match) {
    const candidatos = lista.filter((r) => {
      const n = norm(r.nome);
      if (!n) return false;
      if (n === alvo) return true;
      if (n.includes(alvo)) return true; // ex.: alvo "nu" em "nubank"
      if (alvo.includes(n) && !FORMAS_GENERICAS.test(r.nome)) return true; // ex.: "nubank" em "cartão nubank"
      return false;
    });
    // mais específico (nome mais longo) vence
    match = candidatos.sort((a, b) => norm(b.nome).length - norm(a.nome).length)[0];
  }

  const analisar = (r: any) => {
    const ehCartaoNominal = !FORMAS_GENERICAS.test(r.nome);
    const faltando: string[] = [];
    if (ehCartaoNominal) {
      if (r.limite == null) faltando.push("limite");
      if (r.dia_fechamento == null) faltando.push("dia de fechamento");
      if (r.dia_vencimento == null) faltando.push("dia de vencimento");
    }
    return { incompleto: faltando.length > 0, faltando };
  };

  if (match) {
    const a = analisar(match);
    return { id: match.id, nome: match.nome, criado: false, ...a };
  }
  try {
    const ins = await db.execute(sql`
      INSERT INTO formas_pagamento (nome, usuario_id, global, ativo)
      VALUES (${nome.trim()}, ${userId}, false, true)
      RETURNING id, nome, dia_fechamento, dia_vencimento, limite
    `);
    const created = (ins as any[])[0];
    const a = analisar(created);
    return { id: created.id, nome: created.nome, criado: true, ...a };
  } catch {
    const again = await db.execute(sql`SELECT id, nome, dia_fechamento, dia_vencimento, limite FROM formas_pagamento WHERE lower(nome) = ${alvo} LIMIT 1`);
    const row = (again as any[])[0];
    if (row) { const a = analisar(row); return { id: row.id, nome: row.nome, criado: false, ...a }; }
    return { id: 0, nome, criado: false, incompleto: false, faltando: [] };
  }
}

// Cria N parcelas de uma compra, agrupadas por compra_grupo (mesma compra).
export async function criarCompraParcelada(params: {
  walletId: number;
  categoriaId: number;
  descricao: string;
  valorParcela: number;
  parcelas: number;
  formaPagamentoId?: number | null;
  dataInicio: string; // AAAA-MM-DD
}): Promise<{ compra_grupo: string; ids: number[]; parcelas: number; valor_parcela: number }> {
  const { walletId, categoriaId, descricao, valorParcela, parcelas, formaPagamentoId, dataInicio } = params;
  const grupo = randomUUID();
  const [y, m, d] = dataInicio.split("-").map(Number);
  const ids: number[] = [];
  for (let i = 0; i < parcelas; i++) {
    // avança i meses, ajustando ao último dia do mês quando necessário
    const mesTotal = (m - 1) + i;
    const ano = y + Math.floor(mesTotal / 12);
    const mes = (mesTotal % 12) + 1;
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const dia = Math.min(d, ultimoDia);
    const dataISO = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const descParcela = parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao;
    const res = await db.execute(sql`
      INSERT INTO transacoes
        (carteira_id, categoria_id, forma_pagamento_id, tipo, valor, data_transacao, descricao, status, compra_grupo, parcela_num, parcela_total)
      VALUES
        (${walletId}, ${categoriaId}, ${formaPagamentoId ?? null}, 'Despesa', ${valorParcela.toFixed(2)},
         ${dataISO}, ${descParcela}, 'Efetivada', ${grupo}, ${i + 1}, ${parcelas})
      RETURNING id
    `);
    ids.push((res as any[])[0].id);
  }
  return { compra_grupo: grupo, ids, parcelas, valor_parcela: valorParcela };
}

// Identifica a "última compra" da carteira: pega a transação mais recente e
// agrupa por compra_grupo (se houver) ou pela mesma descrição-base + data de
// registro (cobre compras antigas sem grupo).
export async function getUltimaCompra(
  walletId: number,
): Promise<{ compra_grupo: string | null; descricao_base: string; ids: number[]; total: number } | null> {
  const ult = await db.execute(sql`
    SELECT id, descricao, compra_grupo, data_registro
    FROM transacoes WHERE carteira_id = ${walletId}
    ORDER BY id DESC LIMIT 1
  `);
  const u = (ult as any[])[0];
  if (!u) return null;
  let rows: any[];
  if (u.compra_grupo) {
    rows = (await db.execute(sql`
      SELECT id, valor FROM transacoes WHERE carteira_id = ${walletId} AND compra_grupo = ${u.compra_grupo}
    `)) as any[];
  } else {
    // remove sufixo "(i/N)" para casar todas as parcelas da mesma compra
    const base = (u.descricao || "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
    rows = (await db.execute(sql`
      SELECT id, valor FROM transacoes
      WHERE carteira_id = ${walletId}
        AND regexp_replace(descricao, '\\s*\\(\\d+/\\d+\\)\\s*$', '') = ${base}
        AND data_registro::date = ${new Date(u.data_registro).toISOString().slice(0, 10)}
    `)) as any[];
    u.descricao = base;
  }
  const total = rows.reduce((s, r) => s + parseFloat(r.valor), 0);
  return {
    compra_grupo: u.compra_grupo || null,
    descricao_base: (u.descricao || "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim(),
    ids: rows.map((r) => r.id),
    total: Math.round(total * 100) / 100,
  };
}

// Aplica alterações em todas as parcelas de uma compra (por lista de ids).
export async function editarTransacoesPorIds(
  ids: number[],
  patch: { forma_pagamento_id?: number; categoria_id?: number; descricao_base?: string },
): Promise<number> {
  if (!ids.length) return 0;
  let n = 0;
  for (const id of ids) {
    const sets: any[] = [];
    if (patch.forma_pagamento_id != null) sets.push(sql`forma_pagamento_id = ${patch.forma_pagamento_id}`);
    if (patch.categoria_id != null) sets.push(sql`categoria_id = ${patch.categoria_id}`);
    if (patch.descricao_base != null) {
      // preserva o sufixo (i/N) se existir
      sets.push(sql`descricao = ${patch.descricao_base} || COALESCE(substring(descricao from '\\s*\\(\\d+/\\d+\\)\\s*$'), '')`);
    }
    if (!sets.length) continue;
    let setClause = sets[0];
    for (let i = 1; i < sets.length; i++) setClause = sql`${setClause}, ${sets[i]}`;
    await db.execute(sql`UPDATE transacoes SET ${setClause} WHERE id = ${id}`);
    n++;
  }
  return n;
}

// Status do orçamento (limite_categoria) de UMA categoria no mês atual.
// Usado para avisar o percentual logo após um gasto. null = sem limite definido.
export async function getStatusOrcamentoCategoria(
  userId: number,
  walletId: number,
  categoriaId: number,
): Promise<{ categoria: string; limite: number; gasto: number; percentual: number; status: string } | null> {
  try {
    const metaRows = await db.execute(sql`
      SELECT valor_alvo FROM metas_financeiras
      WHERE usuario_id = ${userId} AND tipo = 'limite_categoria' AND ativo = true AND categoria_id = ${categoriaId}
      LIMIT 1
    `);
    const meta = (metaRows as any[])[0];
    if (!meta) return null;
    const limite = parseFloat(meta.valor_alvo) || 0;
    if (limite <= 0) return null;

    const now = new Date();
    const de = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const ate = now.toISOString().slice(0, 10);
    const gRows = await db.execute(sql`
      SELECT COALESCE(SUM(valor::numeric), 0) AS total FROM transacoes
      WHERE carteira_id = ${walletId} AND categoria_id = ${categoriaId} AND tipo = 'Despesa'
        AND COALESCE(reembolsavel, false) = false
        AND data_transacao >= ${de} AND data_transacao <= ${ate}
    `);
    const gasto = parseFloat((gRows as any[])[0]?.total) || 0;
    const pct = (gasto / limite) * 100;
    const catRows = await db.execute(sql`SELECT nome FROM categorias WHERE id = ${categoriaId} LIMIT 1`);
    const catNome = (catRows as any[])[0]?.nome || "";
    let status = "ok";
    if (pct >= 100) status = "estourado";
    else if (pct >= 80) status = "atencao";
    return {
      categoria: catNome,
      limite: Math.round(limite * 100) / 100,
      gasto: Math.round(gasto * 100) / 100,
      percentual: Math.round(pct * 10) / 10,
      status,
    };
  } catch (err: any) {
    console.error("[Orçamento] falha ao calcular status:", err?.message);
    return null;
  }
}

// Versão PJ do aviso de orçamento na hora: dado um lançamento de despesa numa
// conta do plano de contas da empresa, verifica se existe meta 'limite_categoria'
// (empresa_id + conta_id) e retorna o status do mês. conta_id null na meta =
// limite do TOTAL de despesas da empresa (soma tudo).
export async function getStatusOrcamentoContaPJ(
  empresaId: number,
  contaId: number,
): Promise<{ categoria: string; limite: number; gasto: number; percentual: number; status: string } | null> {
  try {
    const metaRows = await db.execute(sql`
      SELECT valor_alvo, conta_id FROM metas_financeiras
      WHERE empresa_id = ${empresaId} AND tipo = 'limite_categoria' AND ativo = true
        AND (conta_id = ${contaId} OR conta_id IS NULL)
      ORDER BY conta_id NULLS LAST
      LIMIT 1
    `);
    const meta = (metaRows as any[])[0];
    if (!meta) return null;
    const limite = parseFloat(meta.valor_alvo) || 0;
    if (limite <= 0) return null;

    const now = new Date();
    const de = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const ate = now.toISOString().slice(0, 10);
    // Se a meta é de uma conta específica, soma só ela; se é geral, soma tudo.
    const metaContaId = meta.conta_id as number | null;
    const gRows = await db.execute(sql`
      SELECT COALESCE(SUM(valor::numeric), 0) AS total FROM empresas_transacoes
      WHERE empresa_id = ${empresaId} AND tipo = 'Despesa' AND status = 'Efetivada'
        AND (${metaContaId}::int IS NULL OR categoria_id = ${metaContaId})
        AND data_transacao >= ${de} AND data_transacao <= ${ate}
    `);
    const gasto = parseFloat((gRows as any[])[0]?.total) || 0;
    const pct = (gasto / limite) * 100;
    const cRows = await db.execute(sql`SELECT nome FROM empresas_contas WHERE id = ${contaId} LIMIT 1`);
    const contaNome = metaContaId ? ((cRows as any[])[0]?.nome || "") : "Despesas da empresa";
    let status = "ok";
    if (pct >= 100) status = "estourado";
    else if (pct >= 80) status = "atencao";
    return {
      categoria: contaNome,
      limite: Math.round(limite * 100) / 100,
      gasto: Math.round(gasto * 100) / 100,
      percentual: Math.round(pct * 10) / 10,
      status,
    };
  } catch (err: any) {
    console.error("[Orçamento PJ] falha ao calcular status:", err?.message);
    return null;
  }
}

// ============================================
// Isolamento + Soft delete (lixeira/undo) + Backup por usuário
// ============================================

// Confirma que a transação pertence à carteira do usuário (isolamento).
export async function transacaoPertenceAoWallet(transacaoId: number, walletId: number): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM transacoes WHERE id = ${transacaoId} AND carteira_id = ${walletId} LIMIT 1`);
  return (rows as any[]).length > 0;
}

// Soft delete: move a transação para a lixeira (mantém 30 dias) e remove da tabela.
// Só afeta transação da PRÓPRIA carteira (nunca de outro usuário).
export async function softDeleteTransacao(transacaoId: number, walletId: number, userId: number): Promise<boolean> {
  const dono = await transacaoPertenceAoWallet(transacaoId, walletId);
  if (!dono) return false;
  await db.execute(sql`
    INSERT INTO transacoes_lixeira (usuario_id, carteira_id, transacao_id, dados)
    SELECT ${userId}, carteira_id, id, to_jsonb(t) FROM transacoes t WHERE id = ${transacaoId} AND carteira_id = ${walletId}
  `);
  await db.execute(sql`DELETE FROM transacoes WHERE id = ${transacaoId} AND carteira_id = ${walletId}`);
  return true;
}

// Move TODAS as transações da carteira para a lixeira. Retorna a quantidade.
export async function softDeleteTodasTransacoes(walletId: number, userId: number): Promise<number> {
  const cnt = await db.execute(sql`SELECT COUNT(*)::int AS n FROM transacoes WHERE carteira_id = ${walletId}`);
  const n = (cnt as any[])[0]?.n || 0;
  if (n === 0) return 0;
  await db.execute(sql`
    INSERT INTO transacoes_lixeira (usuario_id, carteira_id, transacao_id, dados)
    SELECT ${userId}, carteira_id, id, to_jsonb(t) FROM transacoes t WHERE carteira_id = ${walletId}
  `);
  await db.execute(sql`DELETE FROM transacoes WHERE carteira_id = ${walletId}`);
  return n;
}

// Restaura a última transação excluída da carteira (arrependimento).
export async function restaurarUltimaExcluida(walletId: number): Promise<{ restaurada: boolean; descricao?: string }> {
  const rows = await db.execute(sql`
    SELECT id, dados FROM transacoes_lixeira WHERE carteira_id = ${walletId}
    ORDER BY excluida_em DESC LIMIT 1
  `);
  const item = (rows as any[])[0];
  if (!item) return { restaurada: false };
  // Reconstrói a linha original a partir do JSON e reinsere.
  await db.execute(sql`INSERT INTO transacoes SELECT (jsonb_populate_record(NULL::transacoes, ${item.dados}::jsonb)).*`);
  await db.execute(sql`DELETE FROM transacoes_lixeira WHERE id = ${item.id}`);
  const desc = (item.dados && (item.dados.descricao || item.dados["descricao"])) || undefined;
  return { restaurada: true, descricao: desc };
}

// Backup: lista os itens na lixeira do usuário (para conferência/recuperação).
export async function listarLixeira(walletId: number, limit = 50): Promise<any[]> {
  const rows = await db.execute(sql`
    SELECT id, transacao_id, dados, excluida_em FROM transacoes_lixeira
    WHERE carteira_id = ${walletId} ORDER BY excluida_em DESC LIMIT ${Math.min(limit, 200)}
  `);
  return rows as any[];
}

// Limpa a lixeira antiga (>30 dias). Chamado no boot / periodicamente.
export async function limparLixeiraAntiga(): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM transacoes_lixeira WHERE excluida_em < (CURRENT_DATE - INTERVAL '30 days')`);
  } catch (err: any) {
    console.error("[Lixeira] falha ao limpar antigas:", err?.message);
  }
}

// Cadastra OU atualiza um cartão pelo nome (evita erro de nome duplicado).
export async function cadastrarOuAtualizarCartao(userId: number, data: {
  nome: string; limite?: number; dia_fechamento?: number; dia_vencimento?: number; bandeira?: string; ultimos_digitos?: string;
}): Promise<{ id: number; nome: string; atualizado: boolean }> {
  const alvo = data.nome.trim().toLowerCase();
  const existentes = await db.execute(sql`
    SELECT id, nome FROM formas_pagamento WHERE lower(nome) = ${alvo} AND (usuario_id = ${userId} OR global = true) LIMIT 1
  `);
  const ex = (existentes as any[])[0];
  if (ex) {
    await db.execute(sql`
      UPDATE formas_pagamento SET
        limite = COALESCE(${data.limite ?? null}, limite),
        dia_fechamento = COALESCE(${data.dia_fechamento ?? null}, dia_fechamento),
        dia_vencimento = COALESCE(${data.dia_vencimento ?? null}, dia_vencimento),
        bandeira = COALESCE(${data.bandeira ?? null}, bandeira),
        ultimos_digitos = COALESCE(${data.ultimos_digitos ?? null}, ultimos_digitos),
        ativo = true
      WHERE id = ${ex.id}
    `);
    return { id: ex.id, nome: ex.nome, atualizado: true };
  }
  const ins = await db.execute(sql`
    INSERT INTO formas_pagamento (nome, descricao, icone, cor, usuario_id, global, ativo, limite, dia_fechamento, dia_vencimento, bandeira, ultimos_digitos)
    VALUES (${data.nome.trim()}, ${'Cartão'}, ${'💳'}, ${'#FF6B35'}, ${userId}, false, true,
            ${data.limite ?? null}, ${data.dia_fechamento ?? null}, ${data.dia_vencimento ?? null}, ${data.bandeira ?? null}, ${data.ultimos_digitos ?? null})
    RETURNING id, nome
  `);
  const created = (ins as any[])[0];
  return { id: created.id, nome: created.nome, atualizado: false };
}

// ============================================
// Cérebro coletivo (memória global agregada) — PF
// ============================================

// Agrega a memória PESSOAL de todos (que participam do coletivo) em regras
// GLOBAIS anônimas. Só promove comerciante→categoria com >= minUsuarios
// usuários DISTINTOS (k-anonimato). Grava apenas o agregado (sem usuario_id).
export async function agregarMemoriaGlobalPF(minUsuarios = 5): Promise<number> {
  try {
    const rows = await db.execute(sql`
      WITH base AS (
        SELECT m.chave AS chave,
               m.usuario_id AS usuario_id,
               (m.valor->>'categoria_nome') AS categoria
        FROM memoria_usuario m
        JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.tipo = 'merchant_categoria'
          AND u.aprendizado_coletivo IS NOT FALSE
          AND (m.valor->>'categoria_nome') IS NOT NULL
      ),
      votos AS (
        SELECT chave, categoria, COUNT(DISTINCT usuario_id) AS n
        FROM base GROUP BY chave, categoria
      ),
      total AS (
        SELECT chave, COUNT(DISTINCT usuario_id) AS total_n
        FROM base GROUP BY chave
      ),
      vencedor AS (
        SELECT DISTINCT ON (v.chave) v.chave, v.categoria, t.total_n
        FROM votos v JOIN total t ON t.chave = v.chave
        ORDER BY v.chave, v.n DESC
      )
      SELECT chave, categoria, total_n FROM vencedor WHERE total_n >= ${minUsuarios}
    `);
    let n = 0;
    for (const r of rows as any[]) {
      await db.execute(sql`
        INSERT INTO memoria_global (escopo, chave, resposta, votos)
        VALUES ('pf', ${r.chave}, ${r.categoria}, ${Number(r.total_n)})
        ON CONFLICT (escopo, chave)
        DO UPDATE SET resposta = ${r.categoria}, votos = ${Number(r.total_n)},
                      atualizado_em = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
      `);
      n++;
    }
    console.log(`[MemóriaGlobal] PF: ${n} regra(s) agregada(s) (min ${minUsuarios} usuários distintos).`);
    return n;
  } catch (err: any) {
    console.error("[MemóriaGlobal] falha na agregação:", err?.message);
    return 0;
  }
}

// Resolve um texto contra o cérebro global do escopo (pf/pj). Só devolve o
// consenso da multidão — nunca dado de indivíduo.
export async function resolveMemoriaGlobal(
  escopo: string,
  texto: string,
): Promise<{ categoria_nome: string; votos: number } | undefined> {
  const norm = (s: string) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alvo = norm(texto);
  if (!alvo) return undefined;
  try {
    const rows = await db.execute(sql`SELECT chave, resposta, votos FROM memoria_global WHERE escopo = ${escopo}`);
    let melhor: any;
    for (const r of rows as any[]) {
      const k = norm(r.chave);
      if (k && (alvo.includes(k) || k.includes(alvo))) {
        if (!melhor || k.length > norm(melhor.chave).length) melhor = r;
      }
    }
    return melhor ? { categoria_nome: melhor.resposta, votos: melhor.votos } : undefined;
  } catch (err: any) {
    console.error("[MemóriaGlobal] falha ao resolver:", err?.message);
    return undefined;
  }
}

// ============================================
// Consentimento LGPD (registro de aceite)
// ============================================
export const LGPD_VERSAO_ATUAL = "1.0";

export async function jaConsentiuLgpd(userId: number, versao = LGPD_VERSAO_ATUAL): Promise<boolean> {
  try {
    const rows = await db.execute(sql`SELECT 1 FROM consentimentos_lgpd WHERE usuario_id = ${userId} AND versao = ${versao} LIMIT 1`);
    return (rows as any[]).length > 0;
  } catch { return false; }
}

export async function registrarConsentimentoLgpd(userId: number, versao: string, ip?: string, userAgent?: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO consentimentos_lgpd (usuario_id, versao, ip, user_agent)
    VALUES (${userId}, ${versao}, ${ip ?? null}, ${(userAgent || "").slice(0, 400) || null})
  `);
}

export async function listarConsentimentosLgpd(opts: { limit?: number; offset?: number } = {}): Promise<any[]> {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const offset = opts.offset ?? 0;
  const rows = await db.execute(sql`
    SELECT c.id, c.usuario_id, u.nome, u.email, c.versao, c.aceito_em, c.ip, c.user_agent
    FROM consentimentos_lgpd c
    JOIN usuarios u ON u.id = c.usuario_id
    ORDER BY c.aceito_em DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows as any[];
}

// ============================================
// Conciliação bancária — Contas bancárias
// ============================================
export async function createContaBancaria(data: any): Promise<any> {
  const r = await db.execute(sql`
    INSERT INTO contas_bancarias (empresa_id, usuario_id, banco, agencia, numero, tipo, saldo_inicial, ativo)
    VALUES (${data.empresa_id}, ${data.usuario_id ?? null}, ${data.banco}, ${data.agencia ?? null},
            ${data.numero ?? null}, ${data.tipo ?? 'corrente'}, ${Number(data.saldo_inicial ?? 0).toFixed(2)}, true)
    RETURNING *
  `);
  return (r as any[])[0];
}
export async function getContasBancariasByEmpresa(empresaId: number): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM contas_bancarias WHERE empresa_id = ${empresaId} ORDER BY banco`)) as any[];
}
export async function getContaBancariaById(id: number): Promise<any | undefined> {
  return ((await db.execute(sql`SELECT * FROM contas_bancarias WHERE id = ${id} LIMIT 1`)) as any[])[0];
}
export async function updateContaBancaria(id: number, data: any): Promise<any> {
  const r = await db.execute(sql`
    UPDATE contas_bancarias SET
      banco = COALESCE(${data.banco ?? null}, banco),
      agencia = COALESCE(${data.agencia ?? null}, agencia),
      numero = COALESCE(${data.numero ?? null}, numero),
      tipo = COALESCE(${data.tipo ?? null}, tipo),
      saldo_inicial = COALESCE(${data.saldo_inicial != null ? Number(data.saldo_inicial).toFixed(2) : null}, saldo_inicial),
      ativo = COALESCE(${data.ativo ?? null}, ativo)
    WHERE id = ${id} RETURNING *
  `);
  return (r as any[])[0];
}
export async function deleteContaBancaria(id: number): Promise<boolean> {
  const r = await db.execute(sql`DELETE FROM contas_bancarias WHERE id = ${id} RETURNING id`);
  return (r as any[]).length > 0;
}

// Saldo do sistema para a conta = saldo_inicial + Σ(Receita) − Σ(Despesa) das
// transações vinculadas àquela conta bancária.
export async function getSaldoSistemaConta(contaBancariaId: number): Promise<number> {
  const conta = await getContaBancariaById(contaBancariaId);
  if (!conta) return 0;
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE -valor::numeric END), 0) AS mov
    FROM empresas_transacoes WHERE conta_bancaria_id = ${contaBancariaId}
  `);
  const mov = parseFloat((r as any[])[0]?.mov || "0") || 0;
  return Math.round((parseFloat(conta.saldo_inicial) + mov) * 100) / 100;
}

// ============================================
// Conciliação — Importação e movimentos
// ============================================
export async function getUltimoSaldoInformado(contaBancariaId: number): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT saldo_final_informado FROM importacoes_extrato
    WHERE conta_bancaria_id = ${contaBancariaId} AND saldo_final_informado IS NOT NULL
    ORDER BY criado_em DESC LIMIT 1
  `);
  const v = (r as any[])[0]?.saldo_final_informado;
  return v != null ? parseFloat(v) : null;
}
export async function hashExtratoJaImportado(contaBancariaId: number, hash: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM importacoes_extrato WHERE conta_bancaria_id = ${contaBancariaId} AND hash_arquivo = ${hash} LIMIT 1`);
  return (r as any[]).length > 0;
}
export async function criarImportacao(data: any): Promise<any> {
  const r = await db.execute(sql`
    INSERT INTO importacoes_extrato (empresa_id, conta_bancaria_id, arquivo_nome, formato, periodo_de, periodo_ate, saldo_final_informado, hash_arquivo, status)
    VALUES (${data.empresa_id}, ${data.conta_bancaria_id}, ${data.arquivo_nome ?? null}, ${data.formato ?? 'ofx'},
            ${data.periodo_de ?? null}, ${data.periodo_ate ?? null}, ${data.saldo_final_informado ?? null}, ${data.hash_arquivo ?? null}, 'revisao')
    RETURNING *
  `);
  return (r as any[])[0];
}
// Insere um movimento; se o FITID já existe naquela conta, ignora (dedup).
export async function criarExtratoMovimento(data: any): Promise<any | null> {
  const r = await db.execute(sql`
    INSERT INTO extrato_movimentos
      (importacao_id, conta_bancaria_id, empresa_id, fitid, data, valor, tipo, descricao, memo, status,
       transacao_id, conta_contabil_id, sugestao_conta_id, sugestao_origem, sugestao_confianca)
    VALUES (${data.importacao_id}, ${data.conta_bancaria_id}, ${data.empresa_id}, ${data.fitid ?? null},
            ${data.data}, ${Number(data.valor).toFixed(2)}, ${data.tipo}, ${data.descricao ?? null}, ${data.memo ?? null},
            ${data.status ?? 'pendente'}, ${data.transacao_id ?? null}, ${data.conta_contabil_id ?? null},
            ${data.sugestao_conta_id ?? null}, ${data.sugestao_origem ?? null}, ${data.sugestao_confianca ?? null})
    ON CONFLICT (conta_bancaria_id, fitid) DO NOTHING
    RETURNING *
  `);
  return (r as any[])[0] || null;
}
export async function getMovimentos(opts: { importacaoId?: number; contaBancariaId?: number; status?: string } = {}): Promise<any[]> {
  const conds: any[] = [];
  if (opts.importacaoId) conds.push(sql`importacao_id = ${opts.importacaoId}`);
  if (opts.contaBancariaId) conds.push(sql`conta_bancaria_id = ${opts.contaBancariaId}`);
  if (opts.status) conds.push(sql`status = ${opts.status}`);
  let where = sql``;
  if (conds.length) { where = sql`WHERE ${conds[0]}`; for (let i = 1; i < conds.length; i++) where = sql`${where} AND ${conds[i]}`; }
  return (await db.execute(sql`SELECT * FROM extrato_movimentos ${where} ORDER BY data DESC, id DESC`)) as any[];
}
export async function getMovimentoById(id: number): Promise<any | undefined> {
  return ((await db.execute(sql`SELECT * FROM extrato_movimentos WHERE id = ${id} LIMIT 1`)) as any[])[0];
}
export async function updateMovimento(id: number, patch: any): Promise<any> {
  const sets: any[] = [];
  if (patch.status !== undefined) sets.push(sql`status = ${patch.status}`);
  if (patch.transacao_id !== undefined) sets.push(sql`transacao_id = ${patch.transacao_id}`);
  if (patch.conta_contabil_id !== undefined) sets.push(sql`conta_contabil_id = ${patch.conta_contabil_id}`);
  if (!sets.length) return getMovimentoById(id);
  let setClause = sets[0]; for (let i = 1; i < sets.length; i++) setClause = sql`${setClause}, ${sets[i]}`;
  const r = await db.execute(sql`UPDATE extrato_movimentos SET ${setClause} WHERE id = ${id} RETURNING *`);
  return (r as any[])[0];
}

// Casamento determinístico: transação PJ não conciliada, mesmo valor absoluto,
// data dentro de ±tolDias.
export async function buscarCandidatosConciliacao(empresaId: number, valor: number, data: string, tolDias = 3): Promise<any[]> {
  const abs = Math.abs(valor).toFixed(2);
  return (await db.execute(sql`
    SELECT id, descricao, valor, tipo, data_transacao
    FROM empresas_transacoes
    WHERE empresa_id = ${empresaId}
      AND conciliado = false
      AND ABS(valor::numeric) = ${abs}
      AND data_transacao BETWEEN (${data}::date - ${tolDias} * INTERVAL '1 day') AND (${data}::date + ${tolDias} * INTERVAL '1 day')
    ORDER BY ABS(data_transacao - ${data}::date) ASC
    LIMIT 5
  `)) as any[];
}

// ============================================
// Memória de classificação PJ (descrição bancária -> conta contábil)
// ============================================
export async function resolveMemoriaContaPJ(userId: number, texto: string): Promise<{ conta_contabil_id: number; nome?: string } | undefined> {
  const norm = (s: string) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alvo = norm(texto);
  if (!alvo) return undefined;
  try {
    const rows = await db.execute(sql`SELECT chave, valor FROM memoria_usuario WHERE usuario_id = ${userId} AND tipo = 'merchant_conta_pj'`);
    let melhor: any;
    for (const r of rows as any[]) {
      const k = norm(r.chave);
      if (k && (alvo.includes(k) || k.includes(alvo))) { if (!melhor || k.length > norm(melhor.chave).length) melhor = r; }
    }
    if (!melhor) return undefined;
    const v = typeof melhor.valor === "string" ? JSON.parse(melhor.valor) : melhor.valor;
    return v?.conta_contabil_id ? { conta_contabil_id: Number(v.conta_contabil_id), nome: v.nome } : undefined;
  } catch { return undefined; }
}
export async function aprenderMemoriaContaPJ(userId: number, chave: string, contaContabilId: number, nome?: string): Promise<void> {
  const norm = (s: string) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const chaveNorm = norm(chave);
  if (!chaveNorm) return;
  try {
    const valor = JSON.stringify({ conta_contabil_id: contaContabilId, nome });
    await db.execute(sql`
      INSERT INTO memoria_usuario (usuario_id, tipo, chave, valor)
      VALUES (${userId}, 'merchant_conta_pj', ${chaveNorm}, ${valor}::jsonb)
      ON CONFLICT (usuario_id, tipo, chave)
      DO UPDATE SET valor = ${valor}::jsonb, hits = memoria_usuario.hits + 1, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    `);
  } catch (err: any) { console.error("[MemóriaPJ] falha ao aprender:", err?.message); }
}

// Concilia um movimento a uma transação PJ existente (marca ambos).
export async function conciliarMovimentoComTransacao(movId: number, txId: number): Promise<void> {
  await db.execute(sql`UPDATE extrato_movimentos SET status = 'conciliado', transacao_id = ${txId} WHERE id = ${movId}`);
  await db.execute(sql`UPDATE empresas_transacoes SET conciliado = true WHERE id = ${txId}`);
}

// Lança um movimento como nova transação PJ na conta contábil escolhida,
// já conciliada e ligada à conta bancária. Retorna a transação criada.
export async function lancarMovimentoComoTransacao(mov: any, contaContabilId: number): Promise<any> {
  const tipo = Number(mov.valor) >= 0 ? "Receita" : "Despesa";
  const r = await db.execute(sql`
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, conta_bancaria_id, conciliado, fitid)
    VALUES (${mov.empresa_id}, ${contaContabilId}, ${mov.descricao || 'Movimento bancário'},
            ${Math.abs(Number(mov.valor)).toFixed(2)}, ${tipo}, ${mov.data}, 'Efetivada', 'conciliacao',
            ${mov.conta_bancaria_id}, true, ${mov.fitid ?? null})
    RETURNING *
  `);
  const tx = (r as any[])[0];
  await db.execute(sql`UPDATE extrato_movimentos SET status = 'lancado', transacao_id = ${tx.id}, conta_contabil_id = ${contaContabilId} WHERE id = ${mov.id}`);
  return tx;
}

// ============================================
// Soft-delete PJ (lixeira + undo) — Parte 2 do plano
// Reutiliza `transacoes_lixeira` com empresa_id (coluna opcional).
// ============================================

// Confirma que a transação PJ pertence à empresa.
export async function transacaoPjPertenceAEmpresa(transacaoId: number, empresaId: number): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM empresas_transacoes WHERE id = ${transacaoId} AND empresa_id = ${empresaId} LIMIT 1`);
  return (rows as any[]).length > 0;
}

// Soft-delete PJ: move para lixeira, remove da tabela principal.
export async function softDeleteEmpresaTransacao(transacaoId: number, empresaId: number, userId: number): Promise<boolean> {
  const dono = await transacaoPjPertenceAEmpresa(transacaoId, empresaId);
  if (!dono) return false;
  await db.execute(sql`
    INSERT INTO transacoes_lixeira (usuario_id, empresa_id, transacao_id, dados)
    SELECT ${userId}, ${empresaId}, id, to_jsonb(t) FROM empresas_transacoes t WHERE id = ${transacaoId} AND empresa_id = ${empresaId}
  `);
  await db.execute(sql`DELETE FROM empresas_transacoes WHERE id = ${transacaoId} AND empresa_id = ${empresaId}`);
  return true;
}

// Restaurar última transação PJ excluída da empresa.
export async function restaurarUltimaExcluidaPJ(empresaId: number): Promise<{ restaurada: boolean; descricao?: string }> {
  const rows = await db.execute(sql`
    SELECT id, dados FROM transacoes_lixeira WHERE empresa_id = ${empresaId}
    ORDER BY excluida_em DESC LIMIT 1
  `);
  const item = (rows as any[])[0];
  if (!item) return { restaurada: false };
  await db.execute(sql`INSERT INTO empresas_transacoes SELECT (jsonb_populate_record(NULL::empresas_transacoes, ${item.dados}::jsonb)).*`);
  await db.execute(sql`DELETE FROM transacoes_lixeira WHERE id = ${item.id}`);
  const desc = item.dados?.descricao || undefined;
  return { restaurada: true, descricao: desc };
}

// Listar lixeira PJ para uma empresa.
export async function listarLixeiraPJ(empresaId: number, limit = 50): Promise<any[]> {
  return (await db.execute(sql`
    SELECT id, transacao_id, dados, excluida_em FROM transacoes_lixeira
    WHERE empresa_id = ${empresaId} ORDER BY excluida_em DESC LIMIT ${Math.min(limit, 200)}
  `)) as any[];
}

