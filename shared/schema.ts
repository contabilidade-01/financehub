import { pgTable, text, serial, integer, decimal, timestamp, boolean, date, varchar, PgDatabase, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Helper para obter data atual no timezone de São Paulo
export const getSaoPauloTimestamp = () => {
  const date = new Date();
  return new Date(date.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
};

// Users table
export const users = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  remoteJid: varchar("remotejid", { length: 255 }).notNull().default(""),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  telefone: varchar("telefone", { length: 20 }),
  senha: varchar("senha", { length: 255 }).notNull(),
  tipo_usuario: varchar("tipo_usuario", { length: 50 }).notNull().default("normal"),
  ativo: boolean("ativo").notNull().default(true),
  data_cadastro: timestamp("data_cadastro", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  ultimo_acesso: timestamp("ultimo_acesso", { withTimezone: true }),
  data_cancelamento: timestamp("data_cancelamento", { withTimezone: true }),
  motivo_cancelamento: text("motivo_cancelamento"),
  // Campos de assinatura (mantidos para compatibilidade, mas novos dados virão de user_subscriptions)
  data_expiracao_assinatura: timestamp("data_expiracao_assinatura", { withTimezone: true }),
  status_assinatura: varchar("status_assinatura", { length: 20 }).default("ativa"),
  // Novo campo para otimização de queries (denormalização estratégica)
  subscriptionActive: boolean("subscription_active").notNull().default(false)
});

// Wallets table
export const wallets = pgTable("carteiras", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  saldo_atual: decimal("saldo_atual", { precision: 12, scale: 2 }).default("0.00"),
  data_criacao: timestamp("data_criacao", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});

// Categories table
export const categories = pgTable("categorias", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 10 }).notNull().default("Despesa"),
  cor: varchar("cor", { length: 50 }),
  icone: varchar("icone", { length: 100 }),
  descricao: text("descricao"),
  usuario_id: integer("usuario_id").references(() => users.id, { onDelete: 'cascade' }),
  global: boolean("global").notNull().default(false)
}, (table) => [
  unique().on(table.nome, table.global)
]);

// Payment Methods table
export const paymentMethods = pgTable("formas_pagamento", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  icone: varchar("icone", { length: 100 }),
  cor: varchar("cor", { length: 50 }),
  usuario_id: integer("usuario_id").references(() => users.id, { onDelete: 'cascade' }),
  global: boolean("global").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  data_criacao: timestamp("data_criacao", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
}, (table) => [
  unique().on(table.nome, table.global)
]);

// Transactions table
export const transactions = pgTable("transacoes", {
  id: serial("id").primaryKey(),
  carteira_id: integer("carteira_id").notNull().references(() => wallets.id, { onDelete: 'cascade' }),
  categoria_id: integer("categoria_id").notNull().references(() => categories.id),
  forma_pagamento_id: integer("forma_pagamento_id").references(() => paymentMethods.id),
  tipo: varchar("tipo", { length: 10 }).notNull().default("Despesa"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  data_transacao: date("data_transacao").notNull(),
  data_registro: timestamp("data_registro", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  metodo_pagamento: varchar("metodo_pagamento", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default("Pendente"),
  // Contas a pagar / Fluxo de caixa
  data_vencimento: date("data_vencimento"),                                    // quando a conta vence
  data_pagamento: date("data_pagamento"),                                      // quando foi efetivamente paga
  recorrente: boolean("recorrente").notNull().default(false),                  // despesa fixa mensal
  classificacao_despesa: varchar("classificacao_despesa", { length: 20 })      // 'fixa' | 'variavel' | null
});

// API Tokens table
export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"),
  data_criacao: timestamp("data_criacao", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  data_expiracao: timestamp("data_expiracao", { withTimezone: true }),
  ativo: boolean("ativo").notNull().default(true),
  master: boolean("master").notNull().default(false), // Indica se é o MasterToken
  rotacionavel: boolean("rotacionavel").notNull().default(false), // Só MasterToken pode rotacionar
}, (table) => [
  unique().on(table.usuario_id, table.master)
]);

// Histórico de cancelamentos table
export const historicoCancelamentos = pgTable("historico_cancelamentos", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  data_cancelamento: timestamp("data_cancelamento", { withTimezone: true }).notNull().default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  motivo_cancelamento: text("motivo_cancelamento").notNull(),
  tipo_cancelamento: varchar("tipo_cancelamento", { length: 20 }).notNull().default("voluntario"),
  observacoes: text("observacoes"),
  reativado_em: timestamp("reativado_em", { withTimezone: true }),
  data_criacao: timestamp("data_criacao", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});

// Schema for user input validation
export const insertUserSchema = createInsertSchema(users).omit({ id: true, data_cadastro: true, ultimo_acesso: true });
export const loginUserSchema = z.object({
  email: z.string().email({ message: "Email inválido" }),
  senha: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" })
});

// Schema for wallet input validation
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, data_criacao: true, saldo_atual: true });

// Schema for category input validation
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });

// Schema for payment method input validation
export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true, data_criacao: true });

// Helper function para converter strings para números
const stringToNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  // Se for string vazia, retornar 0 mas permitir que seja tratado especialmente no controller
  if (value === '' || value === null || value === undefined) return 0;
  // Remover caracteres não numéricos, exceto ponto decimal
  const sanitized = value.replace(/[^\d.]/g, '');
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper function para normalizar o tipo de transação (suporta variações comuns)
const normalizeTransactionType = (tipo: string): string => {
  if (!tipo) return "Despesa"; // valor padrão
  
  // Converter para lowercase para facilitar comparação
  const tipoLower = tipo.toLowerCase();
  
  // Mapear diferentes termos comuns para os tipos padrão
  if (tipoLower === "entrada" || tipoLower === "receita" || tipoLower === "income" || tipoLower === "recebimento") {
    return "Receita";
  } else if (tipoLower === "saida" || tipoLower === "saída" || tipoLower === "despesa" || tipoLower === "expense" || tipoLower === "gasto" || tipoLower === "pagamento") {
    return "Despesa";
  }
  
  // Se não for um termo mapeado, usar o padrão de capitalização
  return tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
};

// Schema personalizado para transações que aceita números tanto como strings quanto como números
const flexibleNumberSchema = z.union([
  z.number(),
  z.string().transform((val) => stringToNumber(val))
]);

// Helper function para normalizar formato de data
const normalizeDateFormat = (dateStr: string): string => {
  // Se já está no formato ISO (YYYY-MM-DD), retorna como está
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Se está no formato brasileiro (DD/MM/YYYY), converte para ISO
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  }
  
  // Se está no formato americano (MM/DD/YYYY), converte para ISO
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  }
  
  // Tenta criar uma data e converter para ISO
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (error) {
    // Se não conseguir converter, retorna como está
  }
  
  return dateStr;
};

// Schema for transaction input validation
export const insertTransactionSchema = createInsertSchema(transactions)
  .omit({ id: true, data_registro: true })
  .extend({
    // Permitir que esses campos aceitem strings ou números
    carteira_id: flexibleNumberSchema,
    categoria_id: flexibleNumberSchema,
    forma_pagamento_id: flexibleNumberSchema.optional(),
    valor: flexibleNumberSchema,
    // Normalizar o tipo de transação para case insensitive
    tipo: z.string().transform(normalizeTransactionType),
    // Normalizar formato de data para ISO
    data_transacao: z.string().transform(normalizeDateFormat)
  });

export const updateTransactionSchema = createInsertSchema(transactions)
  .omit({ id: true, data_registro: true, carteira_id: true })
  .partial()
  .extend({
    // Permitir que esses campos aceitem strings ou números quando fornecidos
    categoria_id: flexibleNumberSchema.optional(),
    valor: flexibleNumberSchema.optional(),
    // Normalizar o tipo de transação para case insensitive quando fornecido
    tipo: z.string().transform(normalizeTransactionType).optional(),
    // Normalizar formato de data para ISO quando fornecido
    data_transacao: z.string().transform(normalizeDateFormat).optional()
  });

// Schema for API token input validation
export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({ 
  id: true, 
  data_criacao: true, 
  token: true, 
  usuario_id: true 
});

export const updateApiTokenSchema = createInsertSchema(apiTokens)
  .omit({ id: true, data_criacao: true, token: true, usuario_id: true })
  .partial();

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// Extended transaction type that includes joined data
export type TransactionWithDetails = Transaction & {
  categoria_name?: string;
  metodo_pagamento?: string;
};
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;

export type ApiToken = typeof apiTokens.$inferSelect;
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type UpdateApiToken = z.infer<typeof updateApiTokenSchema>;

// Enum types for better type safety
export enum TransactionType {
  EXPENSE = "Despesa",
  INCOME = "Receita"
}

export enum TransactionStatus {
  COMPLETED = "Efetivada",
  PENDING = "Pendente",
  SCHEDULED = "Agendada",
  CANCELED = "Cancelada"
}

// Interface apenas para tipagem
export interface ApiTokenGenerator {
  generateToken(): string;
}

// Lembretes (Reminders) table
export const reminders = pgTable("lembretes", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  data_lembrete: timestamp("data_lembrete", { withTimezone: true }).notNull(),
  data_criacao: timestamp("data_criacao", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  concluido: boolean("concluido").default(false)
});

// User Sessions Admin table (for impersonation control)
export const userSessionsAdmin = pgTable("user_sessions_admin", {
  id: serial("id").primaryKey(),
  super_admin_id: integer("super_admin_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  target_user_id: integer("target_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  data_inicio: timestamp("data_inicio", { withTimezone: true }).notNull().default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  data_fim: timestamp("data_fim", { withTimezone: true }),
  ativo: boolean("ativo").notNull().default(true)
});

// Schema flexível para datas - sem conversão automática
const flexibleDateSchema = z.union([
  z.date(),
  z.string()  // Manter como string para conversão manual no controller
]);

// Reminder insert schema
export const insertReminderSchema = createInsertSchema(reminders).omit({ 
  id: true, 
  usuario_id: true,
  data_criacao: true 
}).extend({
  // Permitir que a data do lembrete seja uma string ou um objeto Date
  data_lembrete: flexibleDateSchema,
  // Tornar o campo concluido opcional com padrão false
  concluido: z.boolean().optional().default(false)
});

// Reminder update schema
export const updateReminderSchema = createInsertSchema(reminders).omit({ 
  id: true, 
  usuario_id: true,
  data_criacao: true 
}).extend({
  // Permitir que a data do lembrete seja uma string ou um objeto Date quando fornecida
  data_lembrete: flexibleDateSchema.optional()
}).partial();

// Reminder types
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type UpdateReminder = z.infer<typeof updateReminderSchema>;

// User Session Admin types
export type UserSessionAdmin = typeof userSessionsAdmin.$inferSelect;
export type InsertUserSessionAdmin = typeof userSessionsAdmin.$inferInsert;

// System Localization table
export const systemLocalization = pgTable("system_localization", {
  id: serial("id").primaryKey(),
  localeCode: varchar("locale_code", { length: 10 }).notNull().unique(),
  localeName: varchar("locale_name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  createdBy: integer("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: integer("updated_by").references(() => users.id),
});

// Localization Strings table
export const localizationStrings = pgTable("localization_strings", {
  id: serial("id").primaryKey(),
  stringKey: varchar("string_key", { length: 255 }).notNull(),
  localeCode: varchar("locale_code", { length: 10 }).notNull().references(() => systemLocalization.localeCode, { onDelete: 'cascade' }),
  stringValue: text("string_value").notNull(),
  stringContext: varchar("string_context", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  unique().on(table.stringKey, table.localeCode)
]);

// Schemas de validação para localização
export const insertLocalizationSchema = createInsertSchema(systemLocalization).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const updateLocalizationSchema = createInsertSchema(systemLocalization).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  createdBy: true 
}).partial();

export const insertStringSchema = createInsertSchema(localizationStrings).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const updateStringSchema = createInsertSchema(localizationStrings).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).partial();

// Types para localização
export type SystemLocalization = typeof systemLocalization.$inferSelect;
export type LocalizationString = typeof localizationStrings.$inferSelect;
export type InsertLocalization = z.infer<typeof insertLocalizationSchema>;
export type UpdateLocalization = z.infer<typeof updateLocalizationSchema>;
export type InsertString = z.infer<typeof insertStringSchema>;
export type UpdateString = z.infer<typeof updateStringSchema>;

// Enum para códigos de idioma ISO 639-1
export enum LanguageCode {
  PT_BR = 'pt-br',  // Português Brasileiro
  EN_US = 'en-us',  // Inglês Americano
  ES_ES = 'es-es',  // Espanhol Europeu
  FR_FR = 'fr-fr',  // Francês França
  DE_DE = 'de-de',  // Alemão Alemanha
  IT_IT = 'it-it',  // Italiano Itália
}

// ============================================
// ASAAS PAYMENT INTEGRATION TABLES
// ============================================

// Subscription Plans table - Planos de assinatura disponíveis
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  planCode: varchar("plan_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  priceMonthly: decimal("price_monthly", { precision: 10, scale: 2 }).notNull(),
  features: text("features").notNull(), // JSON string com array de features
  maxTransactions: integer("max_transactions").default(0), // 0 = ilimitado
  maxWallets: integer("max_wallets").default(0), // 0 = ilimitado
  maxCategories: integer("max_categories").default(0), // 0 = ilimitado
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
});

// Asaas Customers table - Cache de clientes no Asaas (mapeia usuarios -> asaas customers)
export const asaasCustomers = pgTable("asaas_customers", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  asaasCustomerId: varchar("asaas_customer_id", { length: 100 }).notNull().unique(),
  cpfCnpj: varchar("cpf_cnpj", { length: 18 }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
});

// User Subscriptions table - Assinaturas dos usuários
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  asaasSubscriptionId: varchar("asaas_subscription_id", { length: 100 }).unique(),
  status: varchar("status", { length: 50 }).notNull().default("active"), // active, past_due, canceled, expired
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
});

// Payment Transactions table - Histórico de cobranças/pagamentos
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: integer("subscription_id").references(() => userSubscriptions.id),
  asaasPaymentId: varchar("asaas_payment_id", { length: 100 }).unique(),
  asaasInvoiceUrl: text("asaas_invoice_url"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, confirmed, overdue, refunded, received_in_cash
  paymentMethod: varchar("payment_method", { length: 50 }).notNull().default("credit_card"), // credit_card, boleto, pix
  dueDate: date("due_date"),
  confirmedDate: timestamp("confirmed_date", { withTimezone: true }),
  description: text("description"),
  retryCount: integer("retry_count").notNull().default(0), // Contador de tentativas de pagamento
  metadata: text("metadata"), // JSON string com dados adicionais do Asaas
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
});

// Asaas Webhooks table - Log de eventos recebidos do Asaas
export const asaasWebhooks = pgTable("asaas_webhooks", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(), // PAYMENT_CREATED, PAYMENT_CONFIRMED, etc.
  asaasEventId: varchar("asaas_event_id", { length: 100 }).unique(),
  payload: text("payload").notNull(), // JSON string com o payload completo
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});

// Payment Settings table - Configurações de gateway de pagamento
export const paymentSettings = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 50 }).notNull().default("asaas"),
  environment: varchar("environment", { length: 20 }).notNull().default("sandbox"),
  apiKey: text("api_key").notNull(),
  webhookSecret: text("webhook_secret"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
}, (table) => [
  unique().on(table.provider)
]);

// ============================================
// SCHEMAS DE VALIDAÇÃO - ASAAS
// ============================================

// Subscription Plan schemas
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  priceMonthly: flexibleNumberSchema,
  maxTransactions: flexibleNumberSchema.optional(),
  maxWallets: flexibleNumberSchema.optional(),
  maxCategories: flexibleNumberSchema.optional()
});

export const updateSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).partial().extend({
  priceMonthly: flexibleNumberSchema.optional(),
  maxTransactions: flexibleNumberSchema.optional(),
  maxWallets: flexibleNumberSchema.optional(),
  maxCategories: flexibleNumberSchema.optional()
});

// Asaas Customer schemas
export const insertAsaasCustomerSchema = createInsertSchema(asaasCustomers).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// User Subscription schemas
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const updateUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).partial();

// Payment Transaction schemas
export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  amount: flexibleNumberSchema,
  retryCount: flexibleNumberSchema.optional()
});

export const updatePaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).partial().extend({
  amount: flexibleNumberSchema.optional(),
  retryCount: flexibleNumberSchema.optional()
});

// Asaas Webhook schemas
export const insertAsaasWebhookSchema = createInsertSchema(asaasWebhooks).omit({
  id: true,
  createdAt: true
});

// Payment Settings schemas
export const insertPaymentSettingsSchema = createInsertSchema(paymentSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const updatePaymentSettingsSchema = createInsertSchema(paymentSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).partial();

// ============================================
// TYPES - ASAAS
// ============================================

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type UpdateSubscriptionPlan = z.infer<typeof updateSubscriptionPlanSchema>;

export type AsaasCustomer = typeof asaasCustomers.$inferSelect;
export type InsertAsaasCustomer = z.infer<typeof insertAsaasCustomerSchema>;

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type UpdateUserSubscription = z.infer<typeof updateUserSubscriptionSchema>;

export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type UpdatePaymentTransaction = z.infer<typeof updatePaymentTransactionSchema>;

export type AsaasWebhook = typeof asaasWebhooks.$inferSelect;
export type InsertAsaasWebhook = z.infer<typeof insertAsaasWebhookSchema>;

export type PaymentSettings = typeof paymentSettings.$inferSelect;
export type InsertPaymentSettings = z.infer<typeof insertPaymentSettingsSchema>;
export type UpdatePaymentSettings = z.infer<typeof updatePaymentSettingsSchema>;

// ============================================
// ENUMS - ASAAS
// ============================================

export enum SubscriptionStatus {
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  EXPIRED = "expired"
}

export enum PaymentStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  OVERDUE = "overdue",
  REFUNDED = "refunded",
  RECEIVED_IN_CASH = "received_in_cash"
}

export enum PaymentMethodType {
  CREDIT_CARD = "credit_card",
  BOLETO = "boleto",
  PIX = "pix"
}

export enum AsaasEventType {
  PAYMENT_CREATED = "PAYMENT_CREATED",
  PAYMENT_UPDATED = "PAYMENT_UPDATED",
  PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_OVERDUE = "PAYMENT_OVERDUE",
  PAYMENT_DELETED = "PAYMENT_DELETED",
  PAYMENT_REFUNDED = "PAYMENT_REFUNDED",
  PAYMENT_RECEIVED_IN_CASH_UNDONE = "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  PAYMENT_CHARGEBACK_REQUESTED = "PAYMENT_CHARGEBACK_REQUESTED",
  PAYMENT_CHARGEBACK_DISPUTE = "PAYMENT_CHARGEBACK_DISPUTE",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL = "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  PAYMENT_DUNNING_RECEIVED = "PAYMENT_DUNNING_RECEIVED",
  PAYMENT_DUNNING_REQUESTED = "PAYMENT_DUNNING_REQUESTED",
  PAYMENT_BANK_SLIP_VIEWED = "PAYMENT_BANK_SLIP_VIEWED",
  PAYMENT_CHECKOUT_VIEWED = "PAYMENT_CHECKOUT_VIEWED"
}

// ============================================
// PJ (PESSOA JURÍDICA) — gestão financeira empresarial
// ============================================
// Convive ao lado das tabelas PF sem alterá-las. Modelo Yampa-like:
// Entradas (Receitas) − Saídas Variáveis = Margem de Contribuição;
// Entradas − Total Saídas = Lucro/Prejuízo.

// Adiciona a coluna tipo_pessoa em usuarios (default 'fisica', não quebra nada existente).
// Mantido em Drizzle para alinhamento; a migration correspondente fica em server/migrations/create_empresas_tables.ts.
// Observação: a definição original da tabela `users` está acima e não é modificada — usamos uma extensão separada
// somente para o PJ, evitando qualquer alteração no schema PF.

// Tabela: empresas — pessoa jurídica administrada por um usuário do sistema.
export const empresas = pgTable("empresas", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  razao_social: varchar("razao_social", { length: 255 }).notNull(),
  nome_fantasia: varchar("nome_fantasia", { length: 255 }),
  cnpj: varchar("cnpj", { length: 20 }).unique(),
  regime_tributario: varchar("regime_tributario", { length: 50 }), // Simples | Presumido | Real
  segmento: varchar("segmento", { length: 50 }),                   // servicos | comercio | misto
  ativo: boolean("ativo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updated_at: timestamp("updated_at", { withTimezone: true })
});

// Tabela: empresas_contas — plano de contas PJ por empresa (modelo Yampa-like).
// 'classificacao' (FIXA | VARIAVEL | OUTRA) é o que viabiliza Margem de Contribuição.
export const empresasContas = pgTable("empresas_contas", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().references(() => empresas.id, { onDelete: 'cascade' }),
  codigo: varchar("codigo", { length: 20 }).notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 10 }).notNull(),        // 'Receita' | 'Despesa'
  classificacao: varchar("classificacao", { length: 30 }).notNull(), // 'FIXA' | 'VARIAVEL' | 'OUTRA'
  parent_id: integer("parent_id"),
  icone: varchar("icone", { length: 100 }),
  cor: varchar("cor", { length: 50 }),
  descricao: text("descricao"),
  ativo: boolean("ativo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
}, (table) => [
  unique().on(table.empresa_id, table.codigo)
]);

// Tabela: empresas_transacoes — espelho de transacoes (PF), isolado por empresa.
export const empresasTransacoes = pgTable("empresas_transacoes", {
  id: serial("id").primaryKey(),
  empresa_id: integer("empresa_id").notNull().references(() => empresas.id, { onDelete: 'cascade' }),
  carteira_id: integer("carteira_id").references(() => wallets.id),
  categoria_id: integer("categoria_id").notNull().references(() => empresasContas.id),
  forma_pagamento_id: integer("forma_pagamento_id").references(() => paymentMethods.id),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  tipo: varchar("tipo", { length: 10 }).notNull(),
  data_transacao: date("data_transacao").notNull(),
  data_registro: timestamp("data_registro", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  status: varchar("status", { length: 20 }).notNull().default('Efetivada'),
  metodo_pagamento: varchar("metodo_pagamento", { length: 100 }),
  origem: varchar("origem", { length: 20 }).notNull().default('manual') // 'manual' | 'whatsapp'
});

// ----- Schemas Zod PJ -----

const empresaContaTipoSchema = z.string().refine(
  (v) => v === 'Receita' || v === 'Despesa',
  { message: "tipo deve ser 'Receita' ou 'Despesa'" }
);

const empresaContaClassificacaoSchema = z.string().refine(
  (v) => v === 'FIXA' || v === 'VARIAVEL' || v === 'OUTRA',
  { message: "classificacao deve ser 'FIXA', 'VARIAVEL' ou 'OUTRA'" }
);

export const insertEmpresaSchema = z.object({
  usuario_id: z.number().int().optional(),
  razao_social: z.string().min(1, { message: 'Razão social é obrigatória' }),
  nome_fantasia: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  regime_tributario: z.string().optional().nullable(),
  segmento: z.string().optional().nullable(),
  ativo: z.boolean().optional().default(true)
});

export const updateEmpresaSchema = insertEmpresaSchema.partial();

export const insertEmpresaContaSchema = z.object({
  empresa_id: z.number().int().optional(),
  codigo: z.string().min(1, { message: 'Código é obrigatório' }),
  nome: z.string().min(1, { message: 'Nome é obrigatório' }),
  tipo: empresaContaTipoSchema,
  classificacao: empresaContaClassificacaoSchema,
  parent_id: z.number().int().optional().nullable(),
  icone: z.string().optional().nullable(),
  cor: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  ativo: z.boolean().optional().default(true)
});

export const updateEmpresaContaSchema = insertEmpresaContaSchema.partial();

export const insertEmpresaTransacaoSchema = z.object({
  empresa_id: z.number().int().optional(),
  carteira_id: flexibleNumberSchema.optional(),
  categoria_id: flexibleNumberSchema,
  forma_pagamento_id: flexibleNumberSchema.optional(),
  descricao: z.string().min(1, { message: 'Descrição é obrigatória' }),
  valor: flexibleNumberSchema,
  tipo: z.string().transform(normalizeTransactionType),
  data_transacao: z.string().transform(normalizeDateFormat),
  status: z.string().optional(),
  metodo_pagamento: z.string().optional().nullable(),
  origem: z.string().optional().default('manual')
});

export const updateEmpresaTransacaoSchema = z.object({
  categoria_id: flexibleNumberSchema.optional(),
  forma_pagamento_id: flexibleNumberSchema.optional(),
  descricao: z.string().min(1).optional(),
  valor: flexibleNumberSchema.optional(),
  tipo: z.string().transform(normalizeTransactionType).optional(),
  data_transacao: z.string().transform(normalizeDateFormat).optional(),
  status: z.string().optional(),
  metodo_pagamento: z.string().optional().nullable(),
  origem: z.string().optional()
});

// ----- Types PJ -----

export type Empresa = typeof empresas.$inferSelect;
export type InsertEmpresa = z.infer<typeof insertEmpresaSchema>;
export type UpdateEmpresa = z.infer<typeof updateEmpresaSchema>;

export type EmpresaConta = typeof empresasContas.$inferSelect;
export type InsertEmpresaConta = z.infer<typeof insertEmpresaContaSchema>;
export type UpdateEmpresaConta = z.infer<typeof updateEmpresaContaSchema>;

export type EmpresaTransacao = typeof empresasTransacoes.$inferSelect;
export type InsertEmpresaTransacao = z.infer<typeof insertEmpresaTransacaoSchema>;
export type UpdateEmpresaTransacao = z.infer<typeof updateEmpresaTransacaoSchema>;

export type EmpresaTransacaoWithDetails = EmpresaTransacao & {
  categoria_nome?: string;
  categoria_classificacao?: string;
  categoria_codigo?: string;
  metodo_pagamento?: string;
};

// Enum para classificação das contas PJ (usado no frontend)
export enum EmpresaContaClassificacao {
  FIXA = 'FIXA',
  VARIAVEL = 'VARIAVEL',
  OUTRA = 'OUTRA'
}

// Resumo (dashboard) — entradas, saídas por classificação, margens e DRE
export interface EmpresaResumo {
  empresa_id: number;
  periodo: { de: string; ate: string };
  entradas: number;
  saidas_fixas: number;
  saidas_variaveis: number;
  saidas_outras: number;
  total_saidas: number;
  margem_contribuicao: number;
  margem_contribuicao_pct: number | null;
  lucro_prejuizo: number;
  lucro_prejuizo_pct: number | null;
  total_transacoes: number;
}

export interface EmpresaDRE {
  empresa_id: number;
  periodo: { de: string; ate: string };
  receita_bruta: number;
  despesas_variaveis: number;
  margem_contribuicao: number;
  margem_contribuicao_pct: number | null;
  despesas_fixas: number;
  outras_despesas: number;
  lucro_prejuizo: number;
  lucro_prejuizo_pct: number | null;
}

// ============================================
// METAS FINANCEIRAS — caixinhas, sonhos, orçamentos
// ============================================

export const metasFinanceiras = pgTable("metas_financeiras", {
  id: serial("id").primaryKey(),
  usuario_id: integer("usuario_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 30 }).notNull(), // 'caixinha' | 'sonho' | 'reserva' | 'limite_categoria'
  valor_alvo: decimal("valor_alvo", { precision: 12, scale: 2 }).notNull(),
  valor_atual: decimal("valor_atual", { precision: 12, scale: 2 }).notNull().default("0.00"),
  prazo: date("prazo"),
  categoria_id: integer("categoria_id").references(() => categories.id),
  recorrencia: varchar("recorrencia", { length: 20 }), // 'diario' | 'semanal' | 'mensal' | null
  valor_recorrencia: decimal("valor_recorrencia", { precision: 12, scale: 2 }),
  ativo: boolean("ativo").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});

// Schemas Zod
export const insertMetaSchema = z.object({
  usuario_id: z.number().int().optional(),
  titulo: z.string().min(1),
  tipo: z.enum(["caixinha", "sonho", "reserva", "limite_categoria"]),
  valor_alvo: z.number().positive(),
  valor_atual: z.number().optional().default(0),
  prazo: z.string().optional().nullable(),
  categoria_id: z.number().int().optional().nullable(),
  recorrencia: z.enum(["diario", "semanal", "mensal"]).optional().nullable(),
  valor_recorrencia: z.number().optional().nullable(),
  ativo: z.boolean().optional().default(true)
});

export const updateMetaSchema = insertMetaSchema.partial();

// Types
export type MetaFinanceira = typeof metasFinanceiras.$inferSelect;
export type InsertMeta = z.infer<typeof insertMetaSchema>;
export type UpdateMeta = z.infer<typeof updateMetaSchema>;

export interface MetaComProgresso extends MetaFinanceira {
  progresso_pct: number;
  falta: number;
  meses_restantes: number | null;
}
