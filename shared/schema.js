"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentMethodType = exports.PaymentStatus = exports.SubscriptionStatus = exports.updatePaymentSettingsSchema = exports.insertPaymentSettingsSchema = exports.insertAsaasWebhookSchema = exports.updatePaymentTransactionSchema = exports.insertPaymentTransactionSchema = exports.updateUserSubscriptionSchema = exports.insertUserSubscriptionSchema = exports.insertAsaasCustomerSchema = exports.updateSubscriptionPlanSchema = exports.insertSubscriptionPlanSchema = exports.paymentSettings = exports.asaasWebhooks = exports.paymentTransactions = exports.userSubscriptions = exports.asaasCustomers = exports.subscriptionPlans = exports.LanguageCode = exports.updateStringSchema = exports.insertStringSchema = exports.updateLocalizationSchema = exports.insertLocalizationSchema = exports.localizationStrings = exports.systemLocalization = exports.updateReminderSchema = exports.insertReminderSchema = exports.userSessionsAdmin = exports.reminders = exports.TransactionStatus = exports.TransactionType = exports.updateApiTokenSchema = exports.insertApiTokenSchema = exports.updateTransactionSchema = exports.insertTransactionSchema = exports.insertPaymentMethodSchema = exports.insertCategorySchema = exports.insertWalletSchema = exports.loginUserSchema = exports.insertUserSchema = exports.historicoCancelamentos = exports.apiTokens = exports.transactions = exports.paymentMethods = exports.categories = exports.wallets = exports.passwordResetTokens = exports.users = exports.getSaoPauloTimestamp = void 0;
exports.auditoriaAdmin = exports.updateMetaSchema = exports.insertMetaSchema = exports.metasFinanceiras = exports.whatsappOnboardingStates = exports.EmpresaContaClassificacao = exports.updateEmpresaFormaPagamentoSchema = exports.insertEmpresaFormaPagamentoSchema = exports.updateEmpresaTransacaoSchema = exports.insertEmpresaTransacaoSchema = exports.updateEmpresaContaSchema = exports.insertEmpresaContaSchema = exports.updateEmpresaSchema = exports.insertEmpresaSchema = exports.empresasFormasPagamento = exports.empresasTransacoes = exports.empresasContas = exports.faturas = exports.contasBancarias = exports.empresas = exports.AsaasEventType = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const drizzle_zod_1 = require("drizzle-zod");
const zod_1 = require("zod");
// Helper para obter data atual no timezone de São Paulo
const getSaoPauloTimestamp = () => {
    const date = new Date();
    return new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
};
exports.getSaoPauloTimestamp = getSaoPauloTimestamp;
// Users table
exports.users = (0, pg_core_1.pgTable)("usuarios", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    remoteJid: (0, pg_core_1.varchar)("remotejid", { length: 255 }).notNull().default(""),
    nome: (0, pg_core_1.varchar)("nome", { length: 255 }).notNull(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull().unique(),
    telefone: (0, pg_core_1.varchar)("telefone", { length: 20 }),
    senha: (0, pg_core_1.varchar)("senha", { length: 255 }).notNull(),
    tipo_usuario: (0, pg_core_1.varchar)("tipo_usuario", { length: 50 }).notNull().default("normal"),
    tipo_pessoa: (0, pg_core_1.varchar)("tipo_pessoa", { length: 20 }).notNull().default("fisica"), // 'fisica' (PF) | 'juridica' (PJ)
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    data_cadastro: (0, pg_core_1.timestamp)("data_cadastro", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    ultimo_acesso: (0, pg_core_1.timestamp)("ultimo_acesso", { withTimezone: true }),
    data_cancelamento: (0, pg_core_1.timestamp)("data_cancelamento", { withTimezone: true }),
    motivo_cancelamento: (0, pg_core_1.text)("motivo_cancelamento"),
    // Campos de assinatura (mantidos para compatibilidade, mas novos dados virão de user_subscriptions)
    data_expiracao_assinatura: (0, pg_core_1.timestamp)("data_expiracao_assinatura", { withTimezone: true }),
    status_assinatura: (0, pg_core_1.varchar)("status_assinatura", { length: 50 }).default("sem_assinatura"),
    ciclo_assinatura: (0, pg_core_1.varchar)("ciclo_assinatura", { length: 12 }), // mensal | trimestral | anual | null (definido pelo admin)
    // Novo campo para otimização de queries (denormalização estratégica)
    subscriptionActive: (0, pg_core_1.boolean)("subscription_active").notNull().default(false)
});
/** Tokens de recuperação de senha (mesmo padrão do nescon-clientes). */
exports.passwordResetTokens = (0, pg_core_1.pgTable)("password_reset_tokens", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    token_hash: (0, pg_core_1.text)("token_hash").notNull(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: "cascade" }),
    expires_at: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    used_at: (0, pg_core_1.timestamp)("used_at", { withTimezone: true }),
    created_at: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
});
// Wallets table
exports.wallets = (0, pg_core_1.pgTable)("carteiras", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    nome: (0, pg_core_1.varchar)("nome", { length: 255 }).notNull(),
    descricao: (0, pg_core_1.text)("descricao"),
    saldo_atual: (0, pg_core_1.decimal)("saldo_atual", { precision: 12, scale: 2 }).default("0.00"),
    data_criacao: (0, pg_core_1.timestamp)("data_criacao", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});
// Categories table
exports.categories = (0, pg_core_1.pgTable)("categorias", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    nome: (0, pg_core_1.varchar)("nome", { length: 255 }).notNull(),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 10 }).notNull().default("Despesa"),
    cor: (0, pg_core_1.varchar)("cor", { length: 50 }),
    icone: (0, pg_core_1.varchar)("icone", { length: 100 }),
    descricao: (0, pg_core_1.text)("descricao"),
    usuario_id: (0, pg_core_1.integer)("usuario_id").references(() => exports.users.id, { onDelete: 'cascade' }),
    global: (0, pg_core_1.boolean)("global").notNull().default(false)
}, (table) => [
    (0, pg_core_1.unique)().on(table.nome, table.global)
]);
// Payment Methods table
exports.paymentMethods = (0, pg_core_1.pgTable)("formas_pagamento", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    nome: (0, pg_core_1.varchar)("nome", { length: 255 }).notNull(),
    descricao: (0, pg_core_1.text)("descricao"),
    icone: (0, pg_core_1.varchar)("icone", { length: 100 }),
    cor: (0, pg_core_1.varchar)("cor", { length: 50 }),
    usuario_id: (0, pg_core_1.integer)("usuario_id").references(() => exports.users.id, { onDelete: 'cascade' }),
    global: (0, pg_core_1.boolean)("global").notNull().default(false),
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    data_criacao: (0, pg_core_1.timestamp)("data_criacao", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    // Controle de cartões de crédito
    limite: (0, pg_core_1.decimal)("limite", { precision: 12, scale: 2 }), // limite do cartão (ex: 5000.00)
    dia_fechamento: (0, pg_core_1.integer)("dia_fechamento"), // dia do mês que fecha a fatura (1-31)
    dia_vencimento: (0, pg_core_1.integer)("dia_vencimento"), // dia de pagamento da fatura (1-31)
    bandeira: (0, pg_core_1.varchar)("bandeira", { length: 50 }), // Visa, Mastercard, Elo, etc
    ultimos_digitos: (0, pg_core_1.varchar)("ultimos_digitos", { length: 4 }), // últimos 4 dígitos
}, (table) => [
    (0, pg_core_1.unique)().on(table.nome, table.global)
]);
// Transactions table
exports.transactions = (0, pg_core_1.pgTable)("transacoes", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    carteira_id: (0, pg_core_1.integer)("carteira_id").notNull().references(() => exports.wallets.id, { onDelete: 'cascade' }),
    categoria_id: (0, pg_core_1.integer)("categoria_id").notNull().references(() => exports.categories.id),
    forma_pagamento_id: (0, pg_core_1.integer)("forma_pagamento_id").references(() => exports.paymentMethods.id),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 10 }).notNull().default("Despesa"),
    valor: (0, pg_core_1.decimal)("valor", { precision: 12, scale: 2 }).notNull(),
    data_transacao: (0, pg_core_1.date)("data_transacao").notNull(),
    data_registro: (0, pg_core_1.timestamp)("data_registro", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    descricao: (0, pg_core_1.varchar)("descricao", { length: 255 }).notNull(),
    metodo_pagamento: (0, pg_core_1.varchar)("metodo_pagamento", { length: 100 }),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default("Pendente"),
    // Contas a pagar / Fluxo de caixa
    data_vencimento: (0, pg_core_1.date)("data_vencimento"),
    data_pagamento: (0, pg_core_1.date)("data_pagamento"),
    recorrente: (0, pg_core_1.boolean)("recorrente").notNull().default(false),
    classificacao_despesa: (0, pg_core_1.varchar)("classificacao_despesa", { length: 20 }),
    reembolsavel: (0, pg_core_1.boolean)("reembolsavel").notNull().default(false),
    // Parcelamento (colunas já existiam no banco; agora no Drizzle)
    compra_grupo: (0, pg_core_1.varchar)("compra_grupo", { length: 40 }),
    parcela_num: (0, pg_core_1.integer)("parcela_num"),
    parcela_total: (0, pg_core_1.integer)("parcela_total"),
    // Conta / fatura / caixa (paridade com empresas_transacoes)
    conta_bancaria_id: (0, pg_core_1.integer)("conta_bancaria_id"),
    fatura_id: (0, pg_core_1.integer)("fatura_id"),
    competencia: (0, pg_core_1.varchar)("competencia", { length: 7 }),
    movimenta_caixa: (0, pg_core_1.boolean)("movimenta_caixa").notNull().default(true),
});
// API Tokens table
exports.apiTokens = (0, pg_core_1.pgTable)("api_tokens", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    token: (0, pg_core_1.varchar)("token", { length: 255 }).notNull().unique(),
    nome: (0, pg_core_1.varchar)("nome", { length: 100 }).notNull(),
    descricao: (0, pg_core_1.text)("descricao"),
    data_criacao: (0, pg_core_1.timestamp)("data_criacao", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    data_expiracao: (0, pg_core_1.timestamp)("data_expiracao", { withTimezone: true }),
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    master: (0, pg_core_1.boolean)("master").notNull().default(false), // Indica se é o MasterToken
    rotacionavel: (0, pg_core_1.boolean)("rotacionavel").notNull().default(false), // Só MasterToken pode rotacionar
}, (table) => [
    (0, pg_core_1.unique)().on(table.usuario_id, table.master)
]);
// Histórico de cancelamentos table
exports.historicoCancelamentos = (0, pg_core_1.pgTable)("historico_cancelamentos", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    data_cancelamento: (0, pg_core_1.timestamp)("data_cancelamento", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    motivo_cancelamento: (0, pg_core_1.text)("motivo_cancelamento").notNull(),
    tipo_cancelamento: (0, pg_core_1.varchar)("tipo_cancelamento", { length: 20 }).notNull().default("voluntario"),
    observacoes: (0, pg_core_1.text)("observacoes"),
    reativado_em: (0, pg_core_1.timestamp)("reativado_em", { withTimezone: true }),
    data_criacao: (0, pg_core_1.timestamp)("data_criacao", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});
// Schema for user input validation
exports.insertUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.users).omit({ id: true, data_cadastro: true, ultimo_acesso: true });
exports.loginUserSchema = zod_1.z.object({
    email: zod_1.z.string().email({ message: "Email inválido" }),
    senha: zod_1.z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres" })
});
// Schema for wallet input validation
exports.insertWalletSchema = (0, drizzle_zod_1.createInsertSchema)(exports.wallets).omit({ id: true, data_criacao: true, saldo_atual: true });
// Schema for category input validation
exports.insertCategorySchema = (0, drizzle_zod_1.createInsertSchema)(exports.categories).omit({ id: true });
// Schema for payment method input validation
exports.insertPaymentMethodSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentMethods).omit({ id: true, data_criacao: true });
// Helper function para converter strings para números
const stringToNumber = (value) => {
    if (typeof value === 'number')
        return value;
    // Se for string vazia, retornar 0 mas permitir que seja tratado especialmente no controller
    if (value === '' || value === null || value === undefined)
        return 0;
    // Remover caracteres não numéricos, exceto ponto decimal
    const sanitized = value.replace(/[^\d.]/g, '');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
};
// Helper function para normalizar o tipo de transação (suporta variações comuns)
const normalizeTransactionType = (tipo) => {
    if (!tipo)
        return "Despesa"; // valor padrão
    // Converter para lowercase para facilitar comparação
    const tipoLower = tipo.toLowerCase();
    // Mapear diferentes termos comuns para os tipos padrão
    if (tipoLower === "entrada" || tipoLower === "receita" || tipoLower === "income" || tipoLower === "recebimento") {
        return "Receita";
    }
    else if (tipoLower === "saida" || tipoLower === "saída" || tipoLower === "despesa" || tipoLower === "expense" || tipoLower === "gasto" || tipoLower === "pagamento") {
        return "Despesa";
    }
    // Se não for um termo mapeado, usar o padrão de capitalização
    return tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
};
// Schema personalizado para transações que aceita números tanto como strings quanto como números
const flexibleNumberSchema = zod_1.z.union([
    zod_1.z.number(),
    zod_1.z.string().transform((val) => stringToNumber(val))
]);
// Helper function para normalizar formato de data
const normalizeDateFormat = (dateStr) => {
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
    }
    catch (error) {
        // Se não conseguir converter, retorna como está
    }
    return dateStr;
};
// Schema for transaction input validation
exports.insertTransactionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.transactions)
    .omit({ id: true, data_registro: true })
    .extend({
    // Permitir que esses campos aceitem strings ou números
    carteira_id: flexibleNumberSchema,
    categoria_id: flexibleNumberSchema,
    forma_pagamento_id: flexibleNumberSchema.optional(),
    valor: flexibleNumberSchema,
    // Normalizar o tipo de transação para case insensitive
    tipo: zod_1.z.string().transform(normalizeTransactionType),
    // Normalizar formato de data para ISO
    data_transacao: zod_1.z.string().transform(normalizeDateFormat)
});
exports.updateTransactionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.transactions)
    .omit({ id: true, data_registro: true, carteira_id: true })
    .partial()
    .extend({
    // Permitir que esses campos aceitem strings ou números quando fornecidos
    categoria_id: flexibleNumberSchema.optional(),
    valor: flexibleNumberSchema.optional(),
    // Normalizar o tipo de transação para case insensitive quando fornecido
    tipo: zod_1.z.string().transform(normalizeTransactionType).optional(),
    // Normalizar formato de data para ISO quando fornecido
    data_transacao: zod_1.z.string().transform(normalizeDateFormat).optional()
});
// Schema for API token input validation
exports.insertApiTokenSchema = (0, drizzle_zod_1.createInsertSchema)(exports.apiTokens).omit({
    id: true,
    data_criacao: true,
    token: true,
    usuario_id: true
});
exports.updateApiTokenSchema = (0, drizzle_zod_1.createInsertSchema)(exports.apiTokens)
    .omit({ id: true, data_criacao: true, token: true, usuario_id: true })
    .partial();
// Enum types for better type safety
var TransactionType;
(function (TransactionType) {
    TransactionType["EXPENSE"] = "Despesa";
    TransactionType["INCOME"] = "Receita";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["COMPLETED"] = "Efetivada";
    TransactionStatus["PENDING"] = "Pendente";
    TransactionStatus["SCHEDULED"] = "Agendada";
    TransactionStatus["CANCELED"] = "Cancelada";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
// Lembretes (Reminders) table
exports.reminders = (0, pg_core_1.pgTable)("lembretes", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    titulo: (0, pg_core_1.varchar)("titulo", { length: 255 }).notNull(),
    descricao: (0, pg_core_1.text)("descricao"),
    data_lembrete: (0, pg_core_1.timestamp)("data_lembrete", { withTimezone: true }).notNull(),
    data_criacao: (0, pg_core_1.timestamp)("data_criacao", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    concluido: (0, pg_core_1.boolean)("concluido").default(false)
});
// User Sessions Admin table (for impersonation control)
exports.userSessionsAdmin = (0, pg_core_1.pgTable)("user_sessions_admin", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    super_admin_id: (0, pg_core_1.integer)("super_admin_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    target_user_id: (0, pg_core_1.integer)("target_user_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    data_inicio: (0, pg_core_1.timestamp)("data_inicio", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    data_fim: (0, pg_core_1.timestamp)("data_fim", { withTimezone: true }),
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true)
});
// Schema flexível para datas - sem conversão automática
const flexibleDateSchema = zod_1.z.union([
    zod_1.z.date(),
    zod_1.z.string() // Manter como string para conversão manual no controller
]);
// Reminder insert schema
exports.insertReminderSchema = (0, drizzle_zod_1.createInsertSchema)(exports.reminders).omit({
    id: true,
    usuario_id: true,
    data_criacao: true
}).extend({
    // Permitir que a data do lembrete seja uma string ou um objeto Date
    data_lembrete: flexibleDateSchema,
    // Tornar o campo concluido opcional com padrão false
    concluido: zod_1.z.boolean().optional().default(false)
});
// Reminder update schema
exports.updateReminderSchema = (0, drizzle_zod_1.createInsertSchema)(exports.reminders).omit({
    id: true,
    usuario_id: true,
    data_criacao: true
}).extend({
    // Permitir que a data do lembrete seja uma string ou um objeto Date quando fornecida
    data_lembrete: flexibleDateSchema.optional()
}).partial();
// System Localization table
exports.systemLocalization = (0, pg_core_1.pgTable)("system_localization", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    localeCode: (0, pg_core_1.varchar)("locale_code", { length: 10 }).notNull().unique(),
    localeName: (0, pg_core_1.varchar)("locale_name", { length: 100 }).notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(false),
    isDefault: (0, pg_core_1.boolean)("is_default").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    createdBy: (0, pg_core_1.integer)("created_by").references(() => exports.users.id),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }),
    updatedBy: (0, pg_core_1.integer)("updated_by").references(() => exports.users.id),
});
// Localization Strings table
exports.localizationStrings = (0, pg_core_1.pgTable)("localization_strings", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    stringKey: (0, pg_core_1.varchar)("string_key", { length: 255 }).notNull(),
    localeCode: (0, pg_core_1.varchar)("locale_code", { length: 10 }).notNull().references(() => exports.systemLocalization.localeCode, { onDelete: 'cascade' }),
    stringValue: (0, pg_core_1.text)("string_value").notNull(),
    stringContext: (0, pg_core_1.varchar)("string_context", { length: 500 }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }),
}, (table) => [
    (0, pg_core_1.unique)().on(table.stringKey, table.localeCode)
]);
// Schemas de validação para localização
exports.insertLocalizationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.systemLocalization).omit({
    id: true,
    createdAt: true,
    updatedAt: true
});
exports.updateLocalizationSchema = (0, drizzle_zod_1.createInsertSchema)(exports.systemLocalization).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true
}).partial();
exports.insertStringSchema = (0, drizzle_zod_1.createInsertSchema)(exports.localizationStrings).omit({
    id: true,
    createdAt: true,
    updatedAt: true
});
exports.updateStringSchema = (0, drizzle_zod_1.createInsertSchema)(exports.localizationStrings).omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).partial();
// Enum para códigos de idioma ISO 639-1
var LanguageCode;
(function (LanguageCode) {
    LanguageCode["PT_BR"] = "pt-br";
    LanguageCode["EN_US"] = "en-us";
    LanguageCode["ES_ES"] = "es-es";
    LanguageCode["FR_FR"] = "fr-fr";
    LanguageCode["DE_DE"] = "de-de";
    LanguageCode["IT_IT"] = "it-it";
})(LanguageCode || (exports.LanguageCode = LanguageCode = {}));
// ============================================
// ASAAS PAYMENT INTEGRATION TABLES
// ============================================
// Subscription Plans table - Planos de assinatura disponíveis
exports.subscriptionPlans = (0, pg_core_1.pgTable)("subscription_plans", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    planCode: (0, pg_core_1.varchar)("plan_code", { length: 50 }).notNull().unique(),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    priceMonthly: (0, pg_core_1.decimal)("price_monthly", { precision: 10, scale: 2 }).notNull(),
    // A quem o plano se destina: 'fisica' (PF) | 'juridica' (PJ) | NULL = serve aos dois.
    // Permite preço por tipo; NULL preserva o comportamento de quem já tem plano único.
    tipoPessoa: (0, pg_core_1.varchar)("tipo_pessoa", { length: 20 }),
    features: (0, pg_core_1.text)("features").notNull(), // JSON string com array de features
    maxTransactions: (0, pg_core_1.integer)("max_transactions").default(0), // 0 = ilimitado
    maxWallets: (0, pg_core_1.integer)("max_wallets").default(0), // 0 = ilimitado
    maxCategories: (0, pg_core_1.integer)("max_categories").default(0), // 0 = ilimitado
    active: (0, pg_core_1.boolean)("active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
});
// Asaas Customers table - Cache de clientes no Asaas (mapeia usuarios -> asaas customers)
exports.asaasCustomers = (0, pg_core_1.pgTable)("asaas_customers", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuarioId: (0, pg_core_1.integer)("usuario_id").notNull().unique().references(() => exports.users.id, { onDelete: 'cascade' }),
    asaasCustomerId: (0, pg_core_1.varchar)("asaas_customer_id", { length: 100 }).notNull().unique(),
    cpfCnpj: (0, pg_core_1.varchar)("cpf_cnpj", { length: 18 }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
});
// User Subscriptions table - Assinaturas dos usuários
exports.userSubscriptions = (0, pg_core_1.pgTable)("user_subscriptions", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuarioId: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    planId: (0, pg_core_1.integer)("plan_id").notNull().references(() => exports.subscriptionPlans.id),
    asaasSubscriptionId: (0, pg_core_1.varchar)("asaas_subscription_id", { length: 100 }).unique(),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("active"), // active, past_due, canceled, expired
    currentPeriodStart: (0, pg_core_1.timestamp)("current_period_start", { withTimezone: true }),
    currentPeriodEnd: (0, pg_core_1.timestamp)("current_period_end", { withTimezone: true }),
    canceledAt: (0, pg_core_1.timestamp)("canceled_at", { withTimezone: true }),
    cancellationReason: (0, pg_core_1.text)("cancellation_reason"),
    endedAt: (0, pg_core_1.timestamp)("ended_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
});
// Payment Transactions table - Histórico de cobranças/pagamentos
exports.paymentTransactions = (0, pg_core_1.pgTable)("payment_transactions", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuarioId: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    subscriptionId: (0, pg_core_1.integer)("subscription_id").references(() => exports.userSubscriptions.id),
    asaasPaymentId: (0, pg_core_1.varchar)("asaas_payment_id", { length: 100 }).unique(),
    asaasInvoiceUrl: (0, pg_core_1.text)("asaas_invoice_url"),
    amount: (0, pg_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    currency: (0, pg_core_1.varchar)("currency", { length: 3 }).notNull().default("BRL"),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).notNull().default("pending"), // pending, confirmed, overdue, refunded, received_in_cash
    paymentMethod: (0, pg_core_1.varchar)("payment_method", { length: 50 }).notNull().default("credit_card"), // credit_card, boleto, pix
    dueDate: (0, pg_core_1.date)("due_date"),
    confirmedDate: (0, pg_core_1.timestamp)("confirmed_date", { withTimezone: true }),
    description: (0, pg_core_1.text)("description"),
    retryCount: (0, pg_core_1.integer)("retry_count").notNull().default(0), // Contador de tentativas de pagamento
    metadata: (0, pg_core_1.text)("metadata"), // JSON string com dados adicionais do Asaas
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
});
// Asaas Webhooks table - Log de eventos recebidos do Asaas
exports.asaasWebhooks = (0, pg_core_1.pgTable)("asaas_webhooks", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    eventType: (0, pg_core_1.varchar)("event_type", { length: 100 }).notNull(), // PAYMENT_CREATED, PAYMENT_CONFIRMED, etc.
    asaasEventId: (0, pg_core_1.varchar)("asaas_event_id", { length: 100 }).unique(),
    payload: (0, pg_core_1.text)("payload").notNull(), // JSON string com o payload completo
    processed: (0, pg_core_1.boolean)("processed").notNull().default(false),
    processedAt: (0, pg_core_1.timestamp)("processed_at", { withTimezone: true }),
    errorMessage: (0, pg_core_1.text)("error_message"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});
// Payment Settings table - Configurações de gateway de pagamento
exports.paymentSettings = (0, pg_core_1.pgTable)("payment_settings", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    provider: (0, pg_core_1.varchar)("provider", { length: 50 }).notNull().default("sandbox"),
    environment: (0, pg_core_1.varchar)("environment", { length: 20 }).notNull().default("sandbox"),
    apiKey: (0, pg_core_1.text)("api_key").notNull(),
    webhookSecret: (0, pg_core_1.text)("webhook_secret"),
    enabled: (0, pg_core_1.boolean)("enabled").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
}, (table) => [
    (0, pg_core_1.unique)().on(table.provider)
]);
// ============================================
// SCHEMAS DE VALIDAÇÃO - ASAAS
// ============================================
// Subscription Plan schemas
exports.insertSubscriptionPlanSchema = (0, drizzle_zod_1.createInsertSchema)(exports.subscriptionPlans).omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).extend({
    priceMonthly: flexibleNumberSchema,
    maxTransactions: flexibleNumberSchema.optional(),
    maxWallets: flexibleNumberSchema.optional(),
    maxCategories: flexibleNumberSchema.optional()
});
exports.updateSubscriptionPlanSchema = (0, drizzle_zod_1.createInsertSchema)(exports.subscriptionPlans).omit({
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
exports.insertAsaasCustomerSchema = (0, drizzle_zod_1.createInsertSchema)(exports.asaasCustomers).omit({
    id: true,
    createdAt: true,
    updatedAt: true
});
// User Subscription schemas
exports.insertUserSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userSubscriptions).omit({
    id: true,
    createdAt: true,
    updatedAt: true
});
exports.updateUserSubscriptionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.userSubscriptions).omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).partial();
// Payment Transaction schemas
exports.insertPaymentTransactionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentTransactions).omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).extend({
    amount: flexibleNumberSchema,
    retryCount: flexibleNumberSchema.optional()
});
exports.updatePaymentTransactionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentTransactions).omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).partial().extend({
    amount: flexibleNumberSchema.optional(),
    retryCount: flexibleNumberSchema.optional()
});
// Asaas Webhook schemas
exports.insertAsaasWebhookSchema = (0, drizzle_zod_1.createInsertSchema)(exports.asaasWebhooks).omit({
    id: true,
    createdAt: true
});
// Payment Settings schemas
exports.insertPaymentSettingsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentSettings).omit({
    id: true,
    createdAt: true,
    updatedAt: true
});
exports.updatePaymentSettingsSchema = (0, drizzle_zod_1.createInsertSchema)(exports.paymentSettings).omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).partial();
// ============================================
// ENUMS - ASAAS
// ============================================
var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["ACTIVE"] = "active";
    SubscriptionStatus["PAST_DUE"] = "past_due";
    SubscriptionStatus["CANCELED"] = "canceled";
    SubscriptionStatus["EXPIRED"] = "expired";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["CONFIRMED"] = "confirmed";
    PaymentStatus["OVERDUE"] = "overdue";
    PaymentStatus["REFUNDED"] = "refunded";
    PaymentStatus["RECEIVED_IN_CASH"] = "received_in_cash";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var PaymentMethodType;
(function (PaymentMethodType) {
    PaymentMethodType["CREDIT_CARD"] = "credit_card";
    PaymentMethodType["BOLETO"] = "boleto";
    PaymentMethodType["PIX"] = "pix";
})(PaymentMethodType || (exports.PaymentMethodType = PaymentMethodType = {}));
var AsaasEventType;
(function (AsaasEventType) {
    AsaasEventType["PAYMENT_CREATED"] = "PAYMENT_CREATED";
    AsaasEventType["PAYMENT_UPDATED"] = "PAYMENT_UPDATED";
    AsaasEventType["PAYMENT_CONFIRMED"] = "PAYMENT_CONFIRMED";
    AsaasEventType["PAYMENT_RECEIVED"] = "PAYMENT_RECEIVED";
    AsaasEventType["PAYMENT_OVERDUE"] = "PAYMENT_OVERDUE";
    AsaasEventType["PAYMENT_DELETED"] = "PAYMENT_DELETED";
    AsaasEventType["PAYMENT_REFUNDED"] = "PAYMENT_REFUNDED";
    AsaasEventType["PAYMENT_RECEIVED_IN_CASH_UNDONE"] = "PAYMENT_RECEIVED_IN_CASH_UNDONE";
    AsaasEventType["PAYMENT_CHARGEBACK_REQUESTED"] = "PAYMENT_CHARGEBACK_REQUESTED";
    AsaasEventType["PAYMENT_CHARGEBACK_DISPUTE"] = "PAYMENT_CHARGEBACK_DISPUTE";
    AsaasEventType["PAYMENT_AWAITING_CHARGEBACK_REVERSAL"] = "PAYMENT_AWAITING_CHARGEBACK_REVERSAL";
    AsaasEventType["PAYMENT_DUNNING_RECEIVED"] = "PAYMENT_DUNNING_RECEIVED";
    AsaasEventType["PAYMENT_DUNNING_REQUESTED"] = "PAYMENT_DUNNING_REQUESTED";
    AsaasEventType["PAYMENT_BANK_SLIP_VIEWED"] = "PAYMENT_BANK_SLIP_VIEWED";
    AsaasEventType["PAYMENT_CHECKOUT_VIEWED"] = "PAYMENT_CHECKOUT_VIEWED";
})(AsaasEventType || (exports.AsaasEventType = AsaasEventType = {}));
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
exports.empresas = (0, pg_core_1.pgTable)("empresas", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    razao_social: (0, pg_core_1.varchar)("razao_social", { length: 255 }).notNull(),
    nome_fantasia: (0, pg_core_1.varchar)("nome_fantasia", { length: 255 }),
    cnpj: (0, pg_core_1.varchar)("cnpj", { length: 20 }).unique(),
    regime_tributario: (0, pg_core_1.varchar)("regime_tributario", { length: 50 }), // MEI | Simples | Presumido
    segmento: (0, pg_core_1.varchar)("segmento", { length: 50 }), // servicos | comercio | misto
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    created_at: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
});
// Contas bancárias compartilhadas (PF: empresa_id NULL; PJ: empresa_id preenchido)
exports.contasBancarias = (0, pg_core_1.pgTable)("contas_bancarias", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    empresa_id: (0, pg_core_1.integer)("empresa_id").references(() => exports.empresas.id, { onDelete: 'cascade' }),
    usuario_id: (0, pg_core_1.integer)("usuario_id").references(() => exports.users.id, { onDelete: 'set null' }),
    banco: (0, pg_core_1.varchar)("banco", { length: 120 }).notNull(),
    nome: (0, pg_core_1.varchar)("nome", { length: 120 }),
    agencia: (0, pg_core_1.varchar)("agencia", { length: 20 }),
    numero: (0, pg_core_1.varchar)("numero", { length: 30 }),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 20 }).notNull().default('corrente'),
    saldo_inicial: (0, pg_core_1.decimal)("saldo_inicial", { precision: 14, scale: 2 }).notNull().default('0'),
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    cor: (0, pg_core_1.varchar)("cor", { length: 30 }),
    criado_em: (0, pg_core_1.timestamp)("criado_em", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
});
// Faturas de cartão PF (espelho de empresas_faturas)
exports.faturas = (0, pg_core_1.pgTable)("faturas", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    carteira_id: (0, pg_core_1.integer)("carteira_id").notNull().references(() => exports.wallets.id, { onDelete: 'cascade' }),
    forma_pagamento_id: (0, pg_core_1.integer)("forma_pagamento_id").notNull().references(() => exports.paymentMethods.id, { onDelete: 'cascade' }),
    competencia: (0, pg_core_1.varchar)("competencia", { length: 7 }).notNull(),
    data_fechamento: (0, pg_core_1.date)("data_fechamento").notNull(),
    data_vencimento: (0, pg_core_1.date)("data_vencimento").notNull(),
    status: (0, pg_core_1.varchar)("status", { length: 10 }).notNull().default('aberta'),
    transacao_pagamento_id: (0, pg_core_1.integer)("transacao_pagamento_id"),
    conta_bancaria_id: (0, pg_core_1.integer)("conta_bancaria_id"),
    data_pagamento: (0, pg_core_1.timestamp)("data_pagamento", { withTimezone: true }),
    criado_em: (0, pg_core_1.timestamp)("criado_em", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
}, (table) => [
    (0, pg_core_1.unique)().on(table.forma_pagamento_id, table.competencia),
]);
// Tabela: empresas_contas — plano de contas PJ por empresa (modelo Yampa-like).
// 'classificacao' (FIXA | VARIAVEL | OUTRA) é o que viabiliza Margem de Contribuição.
exports.empresasContas = (0, pg_core_1.pgTable)("empresas_contas", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    empresa_id: (0, pg_core_1.integer)("empresa_id").notNull().references(() => exports.empresas.id, { onDelete: 'cascade' }),
    codigo: (0, pg_core_1.varchar)("codigo", { length: 20 }).notNull(),
    nome: (0, pg_core_1.varchar)("nome", { length: 255 }).notNull(),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 10 }).notNull(), // 'Receita' | 'Despesa'
    classificacao: (0, pg_core_1.varchar)("classificacao", { length: 30 }).notNull(), // 'FIXA' | 'VARIAVEL' | 'OUTRA'
    // Grupo gerencial do fluxo de caixa (visão CFO): receita | custo_variavel |
    // despesa_fixa | investimento | nao_operacional | outras. Opcional: quando
    // nulo, o relatório cai de volta na classificacao. Aditivo, não-quebra.
    grupo_gerencial: (0, pg_core_1.varchar)("grupo_gerencial", { length: 30 }),
    is_cmv: (0, pg_core_1.boolean)("is_cmv").notNull().default(false), // custo da mercadoria vendida → habilita Margem Bruta/Markup
    parent_id: (0, pg_core_1.integer)("parent_id"),
    icone: (0, pg_core_1.varchar)("icone", { length: 100 }),
    cor: (0, pg_core_1.varchar)("cor", { length: 50 }),
    descricao: (0, pg_core_1.text)("descricao"),
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    created_at: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
}, (table) => [
    (0, pg_core_1.unique)().on(table.empresa_id, table.codigo)
]);
// Tabela: empresas_transacoes — espelho de transacoes (PF), isolado por empresa.
exports.empresasTransacoes = (0, pg_core_1.pgTable)("empresas_transacoes", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    empresa_id: (0, pg_core_1.integer)("empresa_id").notNull().references(() => exports.empresas.id, { onDelete: 'cascade' }),
    carteira_id: (0, pg_core_1.integer)("carteira_id").references(() => exports.wallets.id),
    categoria_id: (0, pg_core_1.integer)("categoria_id").notNull().references(() => exports.empresasContas.id),
    forma_pagamento_id: (0, pg_core_1.integer)("forma_pagamento_id").references(() => exports.paymentMethods.id),
    descricao: (0, pg_core_1.varchar)("descricao", { length: 255 }).notNull(),
    valor: (0, pg_core_1.decimal)("valor", { precision: 12, scale: 2 }).notNull(),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 10 }).notNull(),
    data_transacao: (0, pg_core_1.date)("data_transacao").notNull(),
    data_registro: (0, pg_core_1.timestamp)("data_registro", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).notNull().default('Efetivada'),
    metodo_pagamento: (0, pg_core_1.varchar)("metodo_pagamento", { length: 100 }),
    origem: (0, pg_core_1.varchar)("origem", { length: 20 }).notNull().default('manual'), // 'manual' | 'whatsapp' | 'importacao'
    movimenta_caixa: (0, pg_core_1.boolean)("movimenta_caixa").notNull().default(true),
    cartao_id: (0, pg_core_1.integer)("cartao_id"),
    fatura_id: (0, pg_core_1.integer)("fatura_id"),
    competencia: (0, pg_core_1.varchar)("competencia", { length: 7 }),
    // Conta bancária (extrato). Cartão e conta são mutuamente exclusivos no meio.
    conta_bancaria_id: (0, pg_core_1.integer)("conta_bancaria_id"),
    // Parcelamento (mesma compra)
    compra_grupo: (0, pg_core_1.varchar)("compra_grupo", { length: 40 }),
    parcela_num: (0, pg_core_1.integer)("parcela_num"),
    parcela_total: (0, pg_core_1.integer)("parcela_total"),
    // Empresa deve à pessoa (grupo "Reembolsos a Pagar — Pessoal").
    reembolso_pessoal: (0, pg_core_1.boolean)("reembolso_pessoal").notNull().default(false),
    data_vencimento: (0, pg_core_1.date)("data_vencimento"),
    // Quando a conta Pendente foi baixada (marcada como paga).
    data_pagamento: (0, pg_core_1.date)("data_pagamento"),
    itens_agrupados: (0, pg_core_1.integer)("itens_agrupados"),
    // Legado: formas PIX/débito… O meio atual é conta_bancaria_id | cartao_id.
    empresa_forma_pagamento_id: (0, pg_core_1.integer)("empresa_forma_pagamento_id"),
});
// Formas de pagamento PJ (não-cartão). Cartões ficam em empresas_cartoes.
exports.empresasFormasPagamento = (0, pg_core_1.pgTable)("empresas_formas_pagamento", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    empresa_id: (0, pg_core_1.integer)("empresa_id").notNull().references(() => exports.empresas.id, { onDelete: 'cascade' }),
    nome: (0, pg_core_1.varchar)("nome", { length: 100 }).notNull(),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 30 }).notNull().default('outro'), // pix|boleto|debito|transferencia|dinheiro|outro
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    criado_em: (0, pg_core_1.timestamp)("criado_em", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
}, (table) => [
    (0, pg_core_1.unique)().on(table.empresa_id, table.nome)
]);
// ----- Schemas Zod PJ -----
const empresaContaTipoSchema = zod_1.z.string().refine((v) => v === 'Receita' || v === 'Despesa', { message: "tipo deve ser 'Receita' ou 'Despesa'" });
const empresaContaClassificacaoSchema = zod_1.z.string().refine((v) => v === 'FIXA' || v === 'VARIAVEL' || v === 'OUTRA', { message: "classificacao deve ser 'FIXA', 'VARIAVEL' ou 'OUTRA'" });
exports.insertEmpresaSchema = zod_1.z.object({
    usuario_id: zod_1.z.number().int().optional(),
    razao_social: zod_1.z.string().min(1, { message: 'Razão social é obrigatória' }),
    nome_fantasia: zod_1.z.string().optional().nullable(),
    cnpj: zod_1.z.string().optional().nullable(),
    regime_tributario: zod_1.z.string().optional().nullable(),
    segmento: zod_1.z.string().optional().nullable(),
    ativo: zod_1.z.boolean().optional().default(true)
});
exports.updateEmpresaSchema = exports.insertEmpresaSchema.partial();
exports.insertEmpresaContaSchema = zod_1.z.object({
    empresa_id: zod_1.z.number().int().optional(),
    // Opcional: quando não vier, o storage gera o próximo código da sequência do
    // grupo (tipo × classificacao), no mesmo padrão G.NN do plano de contas base.
    codigo: zod_1.z.string().min(1).optional(),
    nome: zod_1.z.string().min(1, { message: 'Nome é obrigatório' }),
    tipo: empresaContaTipoSchema,
    classificacao: empresaContaClassificacaoSchema,
    grupo_gerencial: zod_1.z.string().optional().nullable(),
    is_cmv: zod_1.z.boolean().optional().default(false),
    parent_id: zod_1.z.number().int().optional().nullable(),
    icone: zod_1.z.string().optional().nullable(),
    cor: zod_1.z.string().optional().nullable(),
    descricao: zod_1.z.string().optional().nullable(),
    ativo: zod_1.z.boolean().optional().default(true)
});
exports.updateEmpresaContaSchema = exports.insertEmpresaContaSchema.partial();
exports.insertEmpresaTransacaoSchema = zod_1.z.object({
    empresa_id: zod_1.z.number().int().optional(),
    carteira_id: flexibleNumberSchema.optional(),
    categoria_id: flexibleNumberSchema,
    forma_pagamento_id: flexibleNumberSchema.optional(),
    empresa_forma_pagamento_id: flexibleNumberSchema.optional().nullable(),
    descricao: zod_1.z.string().min(1, { message: 'Descrição é obrigatória' }),
    valor: flexibleNumberSchema,
    tipo: zod_1.z.string().transform(normalizeTransactionType),
    data_transacao: zod_1.z.string().transform(normalizeDateFormat),
    status: zod_1.z.string().optional(),
    metodo_pagamento: zod_1.z.string().optional().nullable(),
    origem: zod_1.z.string().optional().default('manual'),
    movimenta_caixa: zod_1.z.boolean().optional(),
    cartao_id: flexibleNumberSchema.optional().nullable(),
    conta_bancaria_id: flexibleNumberSchema.optional().nullable(),
    fatura_id: flexibleNumberSchema.optional().nullable(),
    competencia: zod_1.z.string().optional().nullable(),
    compra_grupo: zod_1.z.string().optional().nullable(),
    parcela_num: zod_1.z.number().int().optional().nullable(),
    parcela_total: zod_1.z.number().int().optional().nullable(),
    reembolso_pessoal: zod_1.z.boolean().optional().default(false),
    data_vencimento: zod_1.z.string().transform(normalizeDateFormat).optional().nullable(),
    data_pagamento: zod_1.z.string().transform(normalizeDateFormat).optional().nullable(),
    itens_agrupados: zod_1.z.number().int().optional().nullable(),
});
exports.updateEmpresaTransacaoSchema = zod_1.z.object({
    categoria_id: flexibleNumberSchema.optional(),
    forma_pagamento_id: flexibleNumberSchema.optional(),
    empresa_forma_pagamento_id: flexibleNumberSchema.optional().nullable(),
    descricao: zod_1.z.string().min(1).optional(),
    valor: flexibleNumberSchema.optional(),
    tipo: zod_1.z.string().transform(normalizeTransactionType).optional(),
    data_transacao: zod_1.z.string().transform(normalizeDateFormat).optional(),
    status: zod_1.z.string().optional(),
    metodo_pagamento: zod_1.z.string().optional().nullable(),
    origem: zod_1.z.string().optional(),
    reembolso_pessoal: zod_1.z.boolean().optional(),
    data_vencimento: zod_1.z.string().optional().nullable(),
    data_pagamento: zod_1.z.string().optional().nullable(),
    movimenta_caixa: zod_1.z.boolean().optional(),
    cartao_id: flexibleNumberSchema.optional().nullable(),
    conta_bancaria_id: flexibleNumberSchema.optional().nullable(),
    fatura_id: flexibleNumberSchema.optional().nullable(),
    competencia: zod_1.z.string().optional().nullable(),
    compra_grupo: zod_1.z.string().optional().nullable(),
    parcela_num: zod_1.z.number().int().optional().nullable(),
    parcela_total: zod_1.z.number().int().optional().nullable(),
});
exports.insertEmpresaFormaPagamentoSchema = zod_1.z.object({
    empresa_id: zod_1.z.number().int().optional(),
    nome: zod_1.z.string().min(1, { message: 'Nome é obrigatório' }),
    // boleto mantido no enum só por legado; UI/padrões não oferecem mais.
    tipo: zod_1.z.enum(['pix', 'boleto', 'debito', 'transferencia', 'dinheiro', 'outro']).optional().default('outro'),
    ativo: zod_1.z.boolean().optional().default(true),
});
exports.updateEmpresaFormaPagamentoSchema = exports.insertEmpresaFormaPagamentoSchema.partial();
// Enum para classificação das contas PJ (usado no frontend)
var EmpresaContaClassificacao;
(function (EmpresaContaClassificacao) {
    EmpresaContaClassificacao["FIXA"] = "FIXA";
    EmpresaContaClassificacao["VARIAVEL"] = "VARIAVEL";
    EmpresaContaClassificacao["OUTRA"] = "OUTRA";
})(EmpresaContaClassificacao || (exports.EmpresaContaClassificacao = EmpresaContaClassificacao = {}));
// Tabela para rastrear o estado do onboarding guiado via WhatsApp para usuários PJ
exports.whatsappOnboardingStates = (0, pg_core_1.pgTable)("whatsapp_onboarding_states", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    remoteJid: (0, pg_core_1.varchar)("remote_jid", { length: 255 }).notNull().unique(),
    usuarioId: (0, pg_core_1.integer)("usuario_id").references(() => exports.users.id, { onDelete: 'cascade' }),
    currentStep: (0, pg_core_1.varchar)("current_step", { length: 50 }).notNull(), // 'INITIAL_CHOICE' | 'ASKING_RESPONSIBLE' | 'ASKING_CNPJ' | 'ASKING_RAZAO_SOCIAL' | 'ASKING_EMAIL' | 'ASKING_PHONE' | 'COMPLETED'
    collectedData: (0, pg_core_1.text)("collected_data").notNull().default("{}"), // Armazena JSON com os dados coletados
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
});
exports.metasFinanceiras = (0, pg_core_1.pgTable)("metas_financeiras", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    usuario_id: (0, pg_core_1.integer)("usuario_id").notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    // Ambiente da meta: NULL = ambiente PF; preenchido = a empresa (PJ) daquele login.
    // Como um login é de um único ambiente (PF ou 1 empresa), isola por si só;
    // o vínculo explícito permite relatórios e leitura pela empresa.
    empresa_id: (0, pg_core_1.integer)("empresa_id").references(() => exports.empresas.id, { onDelete: 'cascade' }),
    // Para limites de despesa PJ: conta do plano de contas da empresa (empresas_contas).
    // É o análogo PJ do categoria_id (que aponta para categorias PF). NULL = limite
    // do total de despesas da empresa; preenchido = limite daquela conta.
    conta_id: (0, pg_core_1.integer)("conta_id").references(() => exports.empresasContas.id, { onDelete: 'set null' }),
    titulo: (0, pg_core_1.varchar)("titulo", { length: 255 }).notNull(),
    tipo: (0, pg_core_1.varchar)("tipo", { length: 30 }).notNull(), // 'caixinha' | 'sonho' | 'reserva' | 'limite_categoria'
    valor_alvo: (0, pg_core_1.decimal)("valor_alvo", { precision: 12, scale: 2 }).notNull(),
    valor_atual: (0, pg_core_1.decimal)("valor_atual", { precision: 12, scale: 2 }).notNull().default("0.00"),
    prazo: (0, pg_core_1.date)("prazo"),
    categoria_id: (0, pg_core_1.integer)("categoria_id").references(() => exports.categories.id),
    recorrencia: (0, pg_core_1.varchar)("recorrencia", { length: 20 }), // 'diario' | 'semanal' | 'mensal' | null
    valor_recorrencia: (0, pg_core_1.decimal)("valor_recorrencia", { precision: 12, scale: 2 }),
    ativo: (0, pg_core_1.boolean)("ativo").notNull().default(true),
    created_at: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`)
});
// Schemas Zod
exports.insertMetaSchema = zod_1.z.object({
    usuario_id: zod_1.z.number().int().optional(),
    empresa_id: zod_1.z.number().int().optional().nullable(),
    conta_id: zod_1.z.number().int().optional().nullable(),
    titulo: zod_1.z.string().min(1),
    tipo: zod_1.z.enum(["caixinha", "sonho", "reserva", "limite_categoria"]),
    valor_alvo: zod_1.z.number().positive(),
    valor_atual: zod_1.z.number().optional().default(0),
    prazo: zod_1.z.string().optional().nullable(),
    categoria_id: zod_1.z.number().int().optional().nullable(),
    recorrencia: zod_1.z.enum(["diario", "semanal", "mensal"]).optional().nullable(),
    valor_recorrencia: zod_1.z.number().optional().nullable(),
    ativo: zod_1.z.boolean().optional().default(true)
});
exports.updateMetaSchema = exports.insertMetaSchema.partial();
// Tabela para auditoria de ações administrativas sensíveis
exports.auditoriaAdmin = (0, pg_core_1.pgTable)("auditoria_admin", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    admin_id: (0, pg_core_1.integer)("admin_id").references(() => exports.users.id, { onDelete: 'set null' }),
    acao: (0, pg_core_1.varchar)("acao", { length: 100 }).notNull(),
    detalhes: (0, pg_core_1.text)("detalhes"),
    ip: (0, pg_core_1.varchar)("ip", { length: 50 }),
    created_at: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).default((0, drizzle_orm_1.sql) `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
});
