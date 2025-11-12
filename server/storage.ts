import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
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
  type InsertAsaasWebhook
} from "@shared/schema";
import { eq, and, desc, gte, lte, isNull, count, sum, sql, ne } from "drizzle-orm";

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
  getMonthlyTransactionSummary(walletId: number): Promise<any>;
  getExpensesByCategory(walletId: number): Promise<any>;
  getIncomeExpenseTotals(walletId: number): Promise<{ totalIncome: number; totalExpenses: number }>;
  
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
    const result = await db.select().from(users).where(eq(users.telefone, telefone)).limit(1);
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
               WHEN tipo = 'Despesa' THEN -valor::numeric 
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
  async getMonthlyTransactionSummary(walletId: number): Promise<any> {
    // Get the current date and the date 12 months ago para garantir que todos os dados sejam visualizados
    const now = new Date();
    const lastYear = new Date();
    lastYear.setFullYear(now.getFullYear() - 1); // Últimos 12 meses de dados
    
    try {
      // Extract months as strings (e.g., "Jan", "Feb") and calculate totals
      const monthlyData = await db.execute(sql`
        SELECT 
          TO_CHAR(data_transacao, 'Mon') as month,
          EXTRACT(MONTH FROM data_transacao) as month_num,
          EXTRACT(YEAR FROM data_transacao) as year,
          SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as income,
          SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END) as expense
        FROM transacoes
        WHERE 
          carteira_id = ${walletId}
        GROUP BY month, month_num, year
        ORDER BY year, month_num
      `);
      
      return monthlyData;
    } catch (error) {
      console.error("Error in getMonthlyTransactionSummary:", error);
      return [];
    }
  }
  
  async getExpensesByCategory(walletId: number): Promise<any> {
    // Get current month's expense data grouped by category
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);
    
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
          AND t.data_transacao >= ${startOfMonth.toISOString()}
          AND t.data_transacao <= ${endOfMonth.toISOString()}
        GROUP BY c.id, c.nome, c.cor, c.icone
        ORDER BY total DESC
      `);
      
      return result;
    } catch (error) {
      console.error("Error in getExpensesByCategory:", error);
      return [];
    }
  }
  
  async getIncomeExpenseTotals(walletId: number): Promise<{ totalIncome: number; totalExpenses: number }> {
    try {
      // Remover restrições de data para mostrar todos os totais
      const result = await db.execute(sql`
        SELECT 
          SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as total_income,
          SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END) as total_expenses
        FROM transacoes
        WHERE 
          carteira_id = ${walletId}
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
                 WHEN t.tipo = 'Despesa' THEN -t.valor::numeric 
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
    const result = await db.select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.usuarioId, userId),
          eq(userSubscriptions.status, 'active')
        )
      )
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
}

export const storage = new DbStorage();
