"use strict";
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
exports.LGPD_VERSAO_ATUAL = exports.storage = exports.DbStorage = void 0;
exports.filtrarPlanosPorTipo = filtrarPlanosPorTipo;
exports.createMeta = createMeta;
exports.getMetasByUsuarioId = getMetasByUsuarioId;
exports.getMetaById = getMetaById;
exports.depositarMeta = depositarMeta;
exports.sacarMeta = sacarMeta;
exports.ajustarSaldoMeta = ajustarSaldoMeta;
exports.updateMeta = updateMeta;
exports.deleteMeta = deleteMeta;
exports.verificarOrcamentos = verificarOrcamentos;
exports.getSaldoCartao = getSaldoCartao;
exports.getCartoesComSaldo = getCartoesComSaldo;
exports.janelaFatura = janelaFatura;
exports.getFaturaCartao = getFaturaCartao;
exports.seedPlanoContasPessoal = seedPlanoContasPessoal;
exports.getContasAPagar = getContasAPagar;
exports.marcarComoPaga = marcarComoPaga;
exports.reabrirTransacao = reabrirTransacao;
exports.marcarRecorrente = marcarRecorrente;
exports.getReembolsosAReceber = getReembolsosAReceber;
exports.marcarReembolsoRecebido = marcarReembolsoRecebido;
exports.getFluxoCaixaResumo = getFluxoCaixaResumo;
exports.getDailySummary = getDailySummary;
exports.getPeriodSummary = getPeriodSummary;
exports.getWeeklySummary = getWeeklySummary;
exports.getCategoryBreakdown = getCategoryBreakdown;
exports.createAuditLog = createAuditLog;
exports.getAuditLogs = getAuditLogs;
exports.comparePeriods = comparePeriods;
exports.createIngestionEvent = createIngestionEvent;
exports.listIngestionEvents = listIngestionEvents;
exports.getConversaRecente = getConversaRecente;
exports.appendConversa = appendConversa;
exports.resolveMemoriaCategoria = resolveMemoriaCategoria;
exports.aprenderMemoriaCategoria = aprenderMemoriaCategoria;
exports.resolveOuCriaFormaPagamento = resolveOuCriaFormaPagamento;
exports.criarCompraParcelada = criarCompraParcelada;
exports.criarCompraParceladaPj = criarCompraParceladaPj;
exports.getUltimaCompra = getUltimaCompra;
exports.editarTransacoesPorIds = editarTransacoesPorIds;
exports.getStatusOrcamentoCategoria = getStatusOrcamentoCategoria;
exports.getStatusOrcamentoContaPJ = getStatusOrcamentoContaPJ;
exports.transacaoPertenceAoWallet = transacaoPertenceAoWallet;
exports.empresaTransacaoPertenceAEmpresa = empresaTransacaoPertenceAEmpresa;
exports.buscarTransacoesPorFiltro = buscarTransacoesPorFiltro;
exports.buscarEmpresaTransacoesPorFiltro = buscarEmpresaTransacoesPorFiltro;
exports.conferirFaturaCartao = conferirFaturaCartao;
exports.softDeleteTransacao = softDeleteTransacao;
exports.softDeleteTodasTransacoes = softDeleteTodasTransacoes;
exports.restaurarUltimaExcluida = restaurarUltimaExcluida;
exports.listarLixeira = listarLixeira;
exports.limparLixeiraAntiga = limparLixeiraAntiga;
exports.cadastrarOuAtualizarCartao = cadastrarOuAtualizarCartao;
exports.agregarMemoriaGlobalPF = agregarMemoriaGlobalPF;
exports.resolveMemoriaGlobal = resolveMemoriaGlobal;
exports.jaConsentiuLgpd = jaConsentiuLgpd;
exports.registrarConsentimentoLgpd = registrarConsentimentoLgpd;
exports.listarConsentimentosLgpd = listarConsentimentosLgpd;
exports.createContaBancaria = createContaBancaria;
exports.getContasBancariasByEmpresa = getContasBancariasByEmpresa;
exports.getContaBancariaById = getContaBancariaById;
exports.updateContaBancaria = updateContaBancaria;
exports.deleteContaBancaria = deleteContaBancaria;
exports.getSaldoSistemaConta = getSaldoSistemaConta;
exports.getUltimoSaldoInformado = getUltimoSaldoInformado;
exports.hashExtratoJaImportado = hashExtratoJaImportado;
exports.criarImportacao = criarImportacao;
exports.criarExtratoMovimento = criarExtratoMovimento;
exports.getMovimentos = getMovimentos;
exports.getMovimentoById = getMovimentoById;
exports.updateMovimento = updateMovimento;
exports.buscarCandidatosConciliacao = buscarCandidatosConciliacao;
exports.resolveMemoriaContaPJ = resolveMemoriaContaPJ;
exports.aprenderMemoriaContaPJ = aprenderMemoriaContaPJ;
exports.conciliarMovimentoComTransacao = conciliarMovimentoComTransacao;
exports.lancarMovimentoComoTransacao = lancarMovimentoComoTransacao;
exports.transacaoPjPertenceAEmpresa = transacaoPjPertenceAEmpresa;
exports.softDeleteEmpresaTransacao = softDeleteEmpresaTransacao;
exports.restaurarUltimaExcluidaPJ = restaurarUltimaExcluidaPJ;
exports.listarLixeiraPJ = listarLixeiraPJ;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const db_1 = require("./db");
const schema_1 = require("../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
// Pagar a fatura do cartão é QUITAÇÃO DE DÍVIDA, não despesa nova: a compra já
// entrou por competência no dia em que foi feita. Sem excluir o pagamento, o
// mesmo gasto conta duas vezes no DRE e no Resumo. Vale só onde a transação
// estiver com o alias 't'. Cobre PF (faturas) e PJ (empresas_faturas).
const NAO_E_PAGAMENTO_FATURA = (0, drizzle_orm_1.sql) `NOT EXISTS (
  SELECT 1 FROM empresas_faturas f WHERE f.transacao_pagamento_id = t.id
) AND NOT EXISTS (
  SELECT 1 FROM faturas f WHERE f.transacao_pagamento_id = t.id
)`;
// Mesma regra quando a query usa a tabela sem alias (FROM transacoes).
const NAO_E_PAGAMENTO_FATURA_PF = (0, drizzle_orm_1.sql) `NOT EXISTS (
  SELECT 1 FROM faturas f WHERE f.transacao_pagamento_id = transacoes.id
)`;
/**
 * Quais planos valem para um tipo de pessoa ('fisica' | 'juridica').
 *
 * Regra única, usada tanto para LISTAR planos ao usuário quanto para ESCOLHER
 * o plano da cobrança — as duas coisas precisam concordar, senão o cliente vê
 * um preço e é cobrado outro:
 *   1. Se existe plano marcado para o tipo, só ele vale (PF não vê preço de PJ).
 *   2. Se não existe, valem os planos sem tipo (NULL = serve aos dois), que é
 *      o caso de quem ainda tem um plano único.
 */
function filtrarPlanosPorTipo(planos, tipoPessoa) {
    // Sem tipo definido → tratar como PF (evita cliente antigo/nulo ficar sem plano
    // depois que o plano único NULL vira tipado). Ver plano de separação PF/PJ.
    const t = tipoPessoa || "fisica";
    const doTipo = planos.filter((p) => p.tipoPessoa === t);
    if (doTipo.length > 0)
        return doTipo;
    return planos.filter((p) => !p.tipoPessoa);
}
/**
 * Calculate date range based on period type
 * @param period - "month" | "quarter" | "year" | undefined (defaults to month)
 * @returns { startDate: Date, endDate: Date }
 */
function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function calculateDateRange(period, from, to) {
    if (from && to) {
        const startDate = new Date(`${from}T00:00:00`);
        const endDate = new Date(`${to}T23:59:59.999`);
        return { startDate, endDate, from, to };
    }
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    switch (period) {
        case "all":
            startDate = new Date(1970, 0, 1);
            endDate = new Date(2099, 11, 31);
            break;
        case "quarter":
            startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case "year":
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
        case "month":
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate, from: isoDate(startDate), to: isoDate(endDate) };
}
class DbStorage {
    // User methods
    async getUserById(id) {
        const result = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
        return result[0];
    }
    async getUserByEmail(email) {
        const result = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email)).limit(1);
        return result[0];
    }
    async getUserByRemoteJid(remoteJid) {
        try {
            // Postgres field é remotejid (minúsculo)
            const result = await db_1.db.select().from(schema_1.users)
                .where((0, drizzle_orm_1.eq)(schema_1.users.remoteJid, remoteJid))
                .limit(1);
            return result[0];
        }
        catch (error) {
            console.error("Error in getUserByRemoteJid:", error);
            return undefined;
        }
    }
    async getUserByPhone(telefone) {
        // Considera apenas usuários ATIVOS: ao desativar (soft delete) um usuário,
        // o telefone dele fica livre para ser reutilizado em um novo cadastro.
        const result = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.telefone, telefone), (0, drizzle_orm_1.eq)(schema_1.users.ativo, true))).limit(1);
        return result[0];
    }
    async createUser(userData) {
        // Hash password
        const hashedPassword = await bcryptjs_1.default.hash(userData.senha, 10);
        const result = await db_1.db.insert(schema_1.users).values(Object.assign(Object.assign({}, userData), { senha: hashedPassword, data_cadastro: new Date(), ultimo_acesso: new Date() })).returning();
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
    async updateUser(id, userData) {
        const result = await db_1.db.update(schema_1.users)
            .set(userData)
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, id))
            .returning();
        return result[0];
    }
    async updatePassword(id, newPassword) {
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        const result = await db_1.db.update(schema_1.users)
            .set({ senha: hashedPassword })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, id))
            .returning({ id: schema_1.users.id });
        return result.length > 0;
    }
    // Wallet methods
    async getWalletByUserId(userId) {
        const result = await db_1.db.select()
            .from(schema_1.wallets)
            .where((0, drizzle_orm_1.eq)(schema_1.wallets.usuario_id, userId))
            .limit(1);
        if (!result[0])
            return undefined;
        // Calculate real balance based on all transactions
        const wallet = result[0];
        const realBalance = await this.calculateWalletBalance(wallet.id);
        return Object.assign(Object.assign({}, wallet), { saldo_atual: realBalance.toFixed(2) });
    }
    async calculateWalletBalance(walletId) {
        var _a, _b;
        try {
            // Saldo PF = soma das contas bancárias (saldo_inicial + movimentos com movimenta_caixa).
            const w = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT usuario_id FROM carteiras WHERE id = ${walletId} LIMIT 1`);
            const userId = (_a = w[0]) === null || _a === void 0 ? void 0 : _a.usuario_id;
            if (userId) {
                const { saldoGeralPf } = await Promise.resolve().then(() => __importStar(require("./services/conta-bancaria.service")));
                return await saldoGeralPf(userId);
            }
            // Fallback legado (sem usuário): movimentos de caixa (qualquer status)
            const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT COALESCE(SUM(
          CASE WHEN tipo = 'Receita' THEN valor::numeric
               WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN -valor::numeric
               ELSE 0 END
        ), 0) as balance
        FROM transacoes
        WHERE carteira_id = ${walletId}
          AND COALESCE(movimenta_caixa, true) = true
      `);
            return parseFloat(((_b = result[0]) === null || _b === void 0 ? void 0 : _b.balance) || '0') || 0;
        }
        catch (error) {
            console.error('Error calculating wallet balance:', error);
            return 0;
        }
    }
    async createWallet(walletData) {
        const result = await db_1.db.insert(schema_1.wallets)
            .values(Object.assign(Object.assign({}, walletData), { data_criacao: new Date() }))
            .returning();
        return result[0];
    }
    async updateWallet(id, walletData) {
        const result = await db_1.db.update(schema_1.wallets)
            .set(walletData)
            .where((0, drizzle_orm_1.eq)(schema_1.wallets.id, id))
            .returning();
        return result[0];
    }
    // Category methods
    async getCategoriesByUserId(userId) {
        // Get both user-specific categories and global categories
        return db_1.db.select()
            .from(schema_1.categories)
            .where((0, drizzle_orm_1.sql) `${schema_1.categories.usuario_id} = ${userId} OR ${schema_1.categories.global} = true`)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.categories.global), schema_1.categories.nome);
    }
    async getGlobalCategories() {
        return db_1.db.select()
            .from(schema_1.categories)
            .where((0, drizzle_orm_1.eq)(schema_1.categories.global, true))
            .orderBy(schema_1.categories.nome);
    }
    async getCategoryById(id) {
        const result = await db_1.db.select()
            .from(schema_1.categories)
            .where((0, drizzle_orm_1.eq)(schema_1.categories.id, id))
            .limit(1);
        return result[0];
    }
    async createCategory(categoryData) {
        const result = await db_1.db.insert(schema_1.categories)
            .values(categoryData)
            .returning();
        return result[0];
    }
    async updateCategory(id, categoryData) {
        const result = await db_1.db.update(schema_1.categories)
            .set(categoryData)
            .where((0, drizzle_orm_1.eq)(schema_1.categories.id, id))
            .returning();
        return result[0];
    }
    async deleteCategory(id) {
        try {
            // Check if category is used in any transactions
            const usedInTransactions = await db_1.db.select({ count: (0, drizzle_orm_1.count)() })
                .from(schema_1.transactions)
                .where((0, drizzle_orm_1.eq)(schema_1.transactions.categoria_id, id));
            if (usedInTransactions[0].count > 0) {
                return false;
            }
            // Check if category is global
            const category = await this.getCategoryById(id);
            if (category === null || category === void 0 ? void 0 : category.global) {
                return false;
            }
            const result = await db_1.db.delete(schema_1.categories)
                .where((0, drizzle_orm_1.eq)(schema_1.categories.id, id))
                .returning({ id: schema_1.categories.id });
            return result.length > 0;
        }
        catch (error) {
            console.error("Error deleting category:", error);
            return false;
        }
    }
    // Payment Method methods
    async getPaymentMethodsByUserId(userId) {
        return db_1.db.select()
            .from(schema_1.paymentMethods)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.paymentMethods.usuario_id, userId), (0, drizzle_orm_1.eq)(schema_1.paymentMethods.ativo, true)))
            .orderBy(schema_1.paymentMethods.nome);
    }
    async getGlobalPaymentMethods() {
        return db_1.db.select()
            .from(schema_1.paymentMethods)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.paymentMethods.global, true), (0, drizzle_orm_1.eq)(schema_1.paymentMethods.ativo, true)))
            .orderBy(schema_1.paymentMethods.nome);
    }
    async getPaymentMethodById(id) {
        const result = await db_1.db.select()
            .from(schema_1.paymentMethods)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id))
            .limit(1);
        return result[0];
    }
    async getPaymentMethodByName(name) {
        const result = await db_1.db.select()
            .from(schema_1.paymentMethods)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.paymentMethods.nome, name), (0, drizzle_orm_1.eq)(schema_1.paymentMethods.global, true), (0, drizzle_orm_1.eq)(schema_1.paymentMethods.ativo, true)))
            .limit(1);
        return result[0];
    }
    async createPaymentMethod(paymentMethodData) {
        const result = await db_1.db.insert(schema_1.paymentMethods)
            .values(Object.assign(Object.assign({}, paymentMethodData), { data_criacao: new Date() }))
            .returning();
        return result[0];
    }
    async updatePaymentMethod(id, paymentMethodData) {
        const result = await db_1.db.update(schema_1.paymentMethods)
            .set(paymentMethodData)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id))
            .returning();
        return result[0];
    }
    async deletePaymentMethod(id) {
        try {
            // Check if payment method is being used in transactions
            const usedInTransactions = await db_1.db.select({ count: (0, drizzle_orm_1.count)() })
                .from(schema_1.transactions)
                .where((0, drizzle_orm_1.eq)(schema_1.transactions.forma_pagamento_id, id));
            if (usedInTransactions[0].count > 0) {
                return false;
            }
            // Check if payment method is global
            const paymentMethod = await this.getPaymentMethodById(id);
            if (paymentMethod === null || paymentMethod === void 0 ? void 0 : paymentMethod.global) {
                return false;
            }
            const result = await db_1.db.delete(schema_1.paymentMethods)
                .where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id))
                .returning({ id: schema_1.paymentMethods.id });
            return result.length > 0;
        }
        catch (error) {
            console.error("Error deleting payment method:", error);
            return false;
        }
    }
    async getTransactionTotalsByPaymentMethod(userId) {
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
        const allTransactions = await db_1.db
            .select()
            .from(schema_1.transactions)
            .where((0, drizzle_orm_1.eq)(schema_1.transactions.carteira_id, wallet.id));
        // Calculate totals for each payment method
        const totalsMap = new Map();
        for (const transaction of allTransactions) {
            let matchedPaymentMethodId = null;
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
                }
                else if (transaction.tipo === 'Despesa') {
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
    async getTransactionsByWalletId(walletId) {
        const result = await db_1.db.select({
            id: schema_1.transactions.id,
            carteira_id: schema_1.transactions.carteira_id,
            categoria_id: schema_1.transactions.categoria_id,
            forma_pagamento_id: schema_1.transactions.forma_pagamento_id,
            tipo: schema_1.transactions.tipo,
            valor: schema_1.transactions.valor,
            data_transacao: schema_1.transactions.data_transacao,
            data_registro: schema_1.transactions.data_registro,
            descricao: schema_1.transactions.descricao,
            metodo_pagamento: schema_1.paymentMethods.nome,
            status: schema_1.transactions.status,
            reembolsavel: schema_1.transactions.reembolsavel,
            categoria_name: schema_1.categories.nome,
            parcela_num: schema_1.transactions.parcela_num,
            parcela_total: schema_1.transactions.parcela_total,
            compra_grupo: schema_1.transactions.compra_grupo,
            conta_bancaria_id: schema_1.transactions.conta_bancaria_id,
            fatura_id: schema_1.transactions.fatura_id,
            competencia: schema_1.transactions.competencia,
            movimenta_caixa: schema_1.transactions.movimenta_caixa,
            forma_limite: schema_1.paymentMethods.limite,
            data_vencimento: schema_1.transactions.data_vencimento,
            data_pagamento: schema_1.transactions.data_pagamento,
        })
            .from(schema_1.transactions)
            .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.transactions.forma_pagamento_id, schema_1.paymentMethods.id))
            .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.transactions.categoria_id, schema_1.categories.id))
            .where((0, drizzle_orm_1.eq)(schema_1.transactions.carteira_id, walletId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.transactions.data_transacao), (0, drizzle_orm_1.desc)(schema_1.transactions.data_registro));
        return result;
    }
    async getRecentTransactionsByWalletId(walletId, limit = 5) {
        const result = await db_1.db.select({
            id: schema_1.transactions.id,
            carteira_id: schema_1.transactions.carteira_id,
            categoria_id: schema_1.transactions.categoria_id,
            forma_pagamento_id: schema_1.transactions.forma_pagamento_id,
            tipo: schema_1.transactions.tipo,
            valor: schema_1.transactions.valor,
            data_transacao: schema_1.transactions.data_transacao,
            data_registro: schema_1.transactions.data_registro,
            descricao: schema_1.transactions.descricao,
            metodo_pagamento: schema_1.paymentMethods.nome,
            status: schema_1.transactions.status,
            reembolsavel: schema_1.transactions.reembolsavel,
            categoria_name: schema_1.categories.nome
        })
            .from(schema_1.transactions)
            .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.transactions.forma_pagamento_id, schema_1.paymentMethods.id))
            .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.transactions.categoria_id, schema_1.categories.id))
            .where((0, drizzle_orm_1.eq)(schema_1.transactions.carteira_id, walletId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.transactions.data_transacao), (0, drizzle_orm_1.desc)(schema_1.transactions.data_registro))
            .limit(limit);
        return result;
    }
    async getTransactionById(id) {
        const result = await db_1.db.select({
            id: schema_1.transactions.id,
            carteira_id: schema_1.transactions.carteira_id,
            categoria_id: schema_1.transactions.categoria_id,
            forma_pagamento_id: schema_1.transactions.forma_pagamento_id,
            tipo: schema_1.transactions.tipo,
            valor: schema_1.transactions.valor,
            data_transacao: schema_1.transactions.data_transacao,
            data_registro: schema_1.transactions.data_registro,
            descricao: schema_1.transactions.descricao,
            metodo_pagamento: schema_1.paymentMethods.nome,
            status: schema_1.transactions.status,
            reembolsavel: schema_1.transactions.reembolsavel,
            categoria_name: schema_1.categories.nome,
            parcela_num: schema_1.transactions.parcela_num,
            parcela_total: schema_1.transactions.parcela_total,
            conta_bancaria_id: schema_1.transactions.conta_bancaria_id,
            fatura_id: schema_1.transactions.fatura_id,
            movimenta_caixa: schema_1.transactions.movimenta_caixa,
            forma_limite: schema_1.paymentMethods.limite,
        })
            .from(schema_1.transactions)
            .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.transactions.forma_pagamento_id, schema_1.paymentMethods.id))
            .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.transactions.categoria_id, schema_1.categories.id))
            .where((0, drizzle_orm_1.eq)(schema_1.transactions.id, id))
            .limit(1);
        return result[0];
    }
    async createTransaction(transactionData) {
        const result = await db_1.db.insert(schema_1.transactions)
            .values(Object.assign(Object.assign({}, transactionData), { valor: transactionData.valor.toString(), data_registro: new Date() }))
            .returning();
        // Get the complete transaction with payment method name
        const completeTransaction = await this.getTransactionById(result[0].id);
        return completeTransaction || result[0];
    }
    async updateTransaction(id, transactionData) {
        const result = await db_1.db.update(schema_1.transactions)
            .set(transactionData)
            .where((0, drizzle_orm_1.eq)(schema_1.transactions.id, id))
            .returning();
        return result[0];
    }
    async deleteTransaction(id) {
        const result = await db_1.db.delete(schema_1.transactions)
            .where((0, drizzle_orm_1.eq)(schema_1.transactions.id, id))
            .returning({ id: schema_1.transactions.id });
        return result.length > 0;
    }
    // Dashboard methods
    async getMonthlyTransactionSummary(walletId, period, from, to) {
        try {
            const range = calculateDateRange(period, from, to);
            const monthlyData = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT
          TO_CHAR(COALESCE(data_vencimento, data_transacao), 'Mon') as month,
          EXTRACT(MONTH FROM COALESCE(data_vencimento, data_transacao)) as month_num,
          EXTRACT(YEAR FROM COALESCE(data_vencimento, data_transacao)) as year,
          SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as income,
          SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor ELSE 0 END) as expense
        FROM transacoes
        WHERE
          carteira_id = ${walletId}
          AND COALESCE(data_vencimento, data_transacao)::date >= ${range.from}::date
          AND COALESCE(data_vencimento, data_transacao)::date <= ${range.to}::date
          AND ${NAO_E_PAGAMENTO_FATURA_PF}
        GROUP BY month, month_num, year
        ORDER BY year, month_num
      `);
            return monthlyData;
        }
        catch (error) {
            console.error("Error in getMonthlyTransactionSummary:", error);
            return [];
        }
    }
    async getExpensesByCategory(walletId, period, from, to) {
        const range = calculateDateRange(period, from, to);
        try {
            const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
          AND COALESCE(t.data_vencimento, t.data_transacao)::date >= ${range.from}::date
          AND COALESCE(t.data_vencimento, t.data_transacao)::date <= ${range.to}::date
          AND ${NAO_E_PAGAMENTO_FATURA}
        GROUP BY c.id, c.nome, c.cor, c.icone
        ORDER BY total DESC
      `);
            return result;
        }
        catch (error) {
            console.error("Error in getExpensesByCategory:", error);
            return [];
        }
    }
    async getIncomeExpenseTotals(walletId, period, from, to) {
        try {
            const range = calculateDateRange(period, from, to);
            const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT
          SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as total_income,
          SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor ELSE 0 END) as total_expenses
        FROM transacoes
        WHERE
          carteira_id = ${walletId}
          AND COALESCE(data_vencimento, data_transacao)::date >= ${range.from}::date
          AND COALESCE(data_vencimento, data_transacao)::date <= ${range.to}::date
          AND ${NAO_E_PAGAMENTO_FATURA_PF}
      `);
            if (result && result[0]) {
                return {
                    totalIncome: Number(result[0].total_income) || 0,
                    totalExpenses: Number(result[0].total_expenses) || 0,
                };
            }
            return { totalIncome: 0, totalExpenses: 0 };
        }
        catch (error) {
            console.error("Error in getIncomeExpenseTotals:", error);
            return { totalIncome: 0, totalExpenses: 0 };
        }
    }
    async getWalletStatsForAllUsers() {
        try {
            const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
            return result.map((row) => ({
                walletId: row.wallet_id,
                userId: row.user_id,
                balance: parseFloat(row.balance) || 0,
                transactionCount: parseInt(row.transaction_count) || 0
            }));
        }
        catch (error) {
            console.error('Error in getWalletStatsForAllUsers:', error);
            return [];
        }
    }
    // Função para gerar token de API aleatório e seguro
    generateApiToken() {
        return `fin_${(0, crypto_1.randomBytes)(32).toString('hex')}`;
    }
    // Métodos da API Token
    async getApiTokensByUserId(userId) {
        return db_1.db.select()
            .from(schema_1.apiTokens)
            .where((0, drizzle_orm_1.eq)(schema_1.apiTokens.usuario_id, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.apiTokens.data_criacao));
    }
    async getApiTokenById(id) {
        const result = await db_1.db.select()
            .from(schema_1.apiTokens)
            .where((0, drizzle_orm_1.eq)(schema_1.apiTokens.id, id))
            .limit(1);
        return result[0];
    }
    async getApiTokenByToken(token) {
        const result = await db_1.db.select()
            .from(schema_1.apiTokens)
            .where((0, drizzle_orm_1.eq)(schema_1.apiTokens.token, token))
            .limit(1);
        return result[0];
    }
    async createApiToken(userId, tokenData) {
        // Gerar um token aleatório e seguro
        const token = this.generateApiToken();
        // Salvar dados do token
        const result = await db_1.db.insert(schema_1.apiTokens)
            .values(Object.assign(Object.assign({}, tokenData), { usuario_id: userId, token: token, data_criacao: new Date(), ativo: true }))
            .returning();
        return result[0];
    }
    async updateApiToken(id, tokenData) {
        const result = await db_1.db.update(schema_1.apiTokens)
            .set(tokenData)
            .where((0, drizzle_orm_1.eq)(schema_1.apiTokens.id, id))
            .returning();
        return result[0];
    }
    async deleteApiToken(id) {
        const result = await db_1.db.delete(schema_1.apiTokens)
            .where((0, drizzle_orm_1.eq)(schema_1.apiTokens.id, id))
            .returning({ id: schema_1.apiTokens.id });
        return result.length > 0;
    }
    // Reminder methods
    async getRemindersByUserId(userId) {
        try {
            const result = await db_1.db.select()
                .from(schema_1.reminders)
                .where((0, drizzle_orm_1.eq)(schema_1.reminders.usuario_id, userId))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.reminders.data_lembrete));
            return result;
        }
        catch (error) {
            console.error("Error in getRemindersByUserId:", error);
            return [];
        }
    }
    async getReminderById(id) {
        try {
            const result = await db_1.db.select()
                .from(schema_1.reminders)
                .where((0, drizzle_orm_1.eq)(schema_1.reminders.id, id))
                .limit(1);
            return result[0];
        }
        catch (error) {
            console.error("Error in getReminderById:", error);
            return undefined;
        }
    }
    async createReminder(reminderData) {
        try {
            const result = await db_1.db.insert(schema_1.reminders)
                .values(reminderData)
                .returning();
            return result[0];
        }
        catch (error) {
            console.error("Error in createReminder:", error);
            throw error;
        }
    }
    async updateReminder(id, reminderData) {
        try {
            const result = await db_1.db.update(schema_1.reminders)
                .set(reminderData)
                .where((0, drizzle_orm_1.eq)(schema_1.reminders.id, id))
                .returning();
            return result[0];
        }
        catch (error) {
            console.error("Error in updateReminder:", error);
            return undefined;
        }
    }
    async deleteReminder(id) {
        try {
            const result = await db_1.db.delete(schema_1.reminders)
                .where((0, drizzle_orm_1.eq)(schema_1.reminders.id, id))
                .returning({ id: schema_1.reminders.id });
            return result.length > 0;
        }
        catch (error) {
            console.error("Error in deleteReminder:", error);
            return false;
        }
    }
    async getRemindersByDateRange(userId, startDate, endDate) {
        try {
            const result = await db_1.db.select()
                .from(schema_1.reminders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.reminders.usuario_id, userId), (0, drizzle_orm_1.gte)(schema_1.reminders.data_lembrete, startDate), (0, drizzle_orm_1.lte)(schema_1.reminders.data_lembrete, endDate)))
                .orderBy(schema_1.reminders.data_lembrete);
            return result;
        }
        catch (error) {
            console.error("Error in getRemindersByDateRange:", error);
            return [];
        }
    }
    // Admin Session methods
    async getActiveImpersonationSession(targetUserId) {
        try {
            const result = await db_1.db.select()
                .from(schema_1.userSessionsAdmin)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userSessionsAdmin.target_user_id, targetUserId), (0, drizzle_orm_1.eq)(schema_1.userSessionsAdmin.ativo, true), (0, drizzle_orm_1.isNull)(schema_1.userSessionsAdmin.data_fim)))
                .limit(1);
            return result[0];
        }
        catch (error) {
            console.error("Error in getActiveImpersonationSession:", error);
            return undefined;
        }
    }
    async createImpersonationSession(superAdminId, targetUserId) {
        try {
            // Primeiro, encerrar qualquer sessão ativa existente para este usuário
            await db_1.db.update(schema_1.userSessionsAdmin)
                .set({
                ativo: false,
                data_fim: new Date()
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userSessionsAdmin.target_user_id, targetUserId), (0, drizzle_orm_1.eq)(schema_1.userSessionsAdmin.ativo, true)));
            // Criar nova sessão
            const result = await db_1.db.insert(schema_1.userSessionsAdmin)
                .values({
                super_admin_id: superAdminId,
                target_user_id: targetUserId,
                ativo: true
            })
                .returning();
            return result[0];
        }
        catch (error) {
            console.error("Error in createImpersonationSession:", error);
            throw error;
        }
    }
    async endImpersonationSession(sessionId) {
        try {
            const result = await db_1.db.update(schema_1.userSessionsAdmin)
                .set({
                ativo: false,
                data_fim: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.userSessionsAdmin.id, sessionId))
                .returning();
            return result.length > 0;
        }
        catch (error) {
            console.error("Error in endImpersonationSession:", error);
            return false;
        }
    }
    async getAllUsers() {
        try {
            const result = await db_1.db.select()
                .from(schema_1.users)
                .orderBy(schema_1.users.nome);
            return result;
        }
        catch (error) {
            console.error("Error in getAllUsers:", error);
            return [];
        }
    }
    async getRecentUsers(limit = 5) {
        try {
            const result = await db_1.db.select()
                .from(schema_1.users)
                .orderBy((0, drizzle_orm_1.desc)(schema_1.users.data_cadastro))
                .limit(limit);
            return result;
        }
        catch (error) {
            console.error("Error in getRecentUsers:", error);
            return [];
        }
    }
    async getAllAdminSessions() {
        try {
            const result = await db_1.db.select()
                .from(schema_1.userSessionsAdmin)
                .orderBy((0, drizzle_orm_1.desc)(schema_1.userSessionsAdmin.data_inicio));
            return result;
        }
        catch (error) {
            console.error("Error in getAllAdminSessions:", error);
            return [];
        }
    }
    async deleteAllGlobalCategories() {
        await db_1.db.delete(schema_1.categories).where((0, drizzle_orm_1.eq)(schema_1.categories.global, true));
    }
    async deleteAllGlobalPaymentMethods() {
        await db_1.db.delete(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.global, true));
    }
    // Exclusão definitiva de usuário e todos os dados relacionados
    async deleteUserCascade(userId) {
        try {
            // Buscar carteiras do usuário
            const userWallets = await db_1.db.select().from(schema_1.wallets).where((0, drizzle_orm_1.eq)(schema_1.wallets.usuario_id, userId));
            const walletIds = userWallets.map((w) => w.id);
            if (walletIds.length > 0) {
                // Remover transações das carteiras do usuário
                const arrayStr = `'{${walletIds.join(",")}}'::int[]`;
                await db_1.db.delete(schema_1.transactions).where((0, drizzle_orm_1.sql) `carteira_id = ANY(${drizzle_orm_1.sql.raw(arrayStr)})`);
            }
            // Remover lembretes
            await db_1.db.delete(schema_1.reminders).where((0, drizzle_orm_1.eq)(schema_1.reminders.usuario_id, userId));
            // Remover categorias
            await db_1.db.delete(schema_1.categories).where((0, drizzle_orm_1.eq)(schema_1.categories.usuario_id, userId));
            // Remover carteiras
            await db_1.db.delete(schema_1.wallets).where((0, drizzle_orm_1.eq)(schema_1.wallets.usuario_id, userId));
            // Remover tokens de API
            await db_1.db.delete(schema_1.apiTokens).where((0, drizzle_orm_1.eq)(schema_1.apiTokens.usuario_id, userId));
            // Remover sessões admin
            await db_1.db.delete(schema_1.userSessionsAdmin).where((0, drizzle_orm_1.eq)(schema_1.userSessionsAdmin.target_user_id, userId));
            // Remover métodos de pagamento
            await db_1.db.delete(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.usuario_id, userId));
            // Remover dados de assinatura
            await db_1.db.delete(schema_1.paymentTransactions).where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.usuarioId, userId));
            await db_1.db.delete(schema_1.userSubscriptions).where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.usuarioId, userId));
            await db_1.db.delete(schema_1.asaasCustomers).where((0, drizzle_orm_1.eq)(schema_1.asaasCustomers.usuarioId, userId));
            // Remover usuário
            await db_1.db.delete(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
            return true;
        }
        catch (error) {
            console.error('Erro ao deletar usuário em cascata:', error);
            return false;
        }
    }
    // ============================================
    // SUBSCRIPTION PLAN METHODS
    // ============================================
    async getSubscriptionPlanById(id) {
        const result = await db_1.db.select().from(schema_1.subscriptionPlans).where((0, drizzle_orm_1.eq)(schema_1.subscriptionPlans.id, id)).limit(1);
        return result[0];
    }
    async getSubscriptionPlanByCode(code) {
        const result = await db_1.db.select().from(schema_1.subscriptionPlans).where((0, drizzle_orm_1.eq)(schema_1.subscriptionPlans.planCode, code)).limit(1);
        return result[0];
    }
    async getAllSubscriptionPlans() {
        return await db_1.db.select().from(schema_1.subscriptionPlans).orderBy(schema_1.subscriptionPlans.priceMonthly);
    }
    async getActiveSubscriptionPlans() {
        return await db_1.db.select()
            .from(schema_1.subscriptionPlans)
            .where((0, drizzle_orm_1.eq)(schema_1.subscriptionPlans.active, true))
            .orderBy(schema_1.subscriptionPlans.priceMonthly);
    }
    // Planos que valem para um tipo de pessoa ('fisica' | 'juridica').
    // Prefere os planos marcados para o tipo; se não houver nenhum, cai nos
    // planos sem tipo (que servem aos dois). Ver filtrarPlanosPorTipo.
    async getActiveSubscriptionPlansForTipo(tipoPessoa) {
        const todos = await this.getActiveSubscriptionPlans();
        return filtrarPlanosPorTipo(todos, tipoPessoa);
    }
    async createSubscriptionPlan(planData) {
        const result = await db_1.db.insert(schema_1.subscriptionPlans).values(Object.assign(Object.assign({}, planData), { createdAt: new Date() })).returning();
        return result[0];
    }
    async updateSubscriptionPlan(id, planData) {
        const result = await db_1.db.update(schema_1.subscriptionPlans)
            .set(Object.assign(Object.assign({}, planData), { updatedAt: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.subscriptionPlans.id, id))
            .returning();
        return result[0];
    }
    async deleteSubscriptionPlan(id) {
        // Soft delete - apenas desativar
        const result = await db_1.db.update(schema_1.subscriptionPlans)
            .set({ active: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.subscriptionPlans.id, id))
            .returning();
        return result.length > 0;
    }
    // ============================================
    // ASAAS CUSTOMER METHODS
    // ============================================
    async getAsaasCustomerByUserId(userId) {
        const result = await db_1.db.select()
            .from(schema_1.asaasCustomers)
            .where((0, drizzle_orm_1.eq)(schema_1.asaasCustomers.usuarioId, userId))
            .limit(1);
        return result[0];
    }
    async getAsaasCustomerByAsaasId(asaasCustomerId) {
        const result = await db_1.db.select()
            .from(schema_1.asaasCustomers)
            .where((0, drizzle_orm_1.eq)(schema_1.asaasCustomers.asaasCustomerId, asaasCustomerId))
            .limit(1);
        return result[0];
    }
    async createAsaasCustomer(customerData) {
        const result = await db_1.db.insert(schema_1.asaasCustomers).values(Object.assign(Object.assign({}, customerData), { createdAt: new Date() })).returning();
        return result[0];
    }
    async updateAsaasCustomer(id, customerData) {
        const result = await db_1.db.update(schema_1.asaasCustomers)
            .set(Object.assign(Object.assign({}, customerData), { updatedAt: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.asaasCustomers.id, id))
            .returning();
        return result[0];
    }
    // ============================================
    // USER SUBSCRIPTION METHODS
    // ============================================
    async getUserSubscriptionById(id) {
        const result = await db_1.db.select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.id, id))
            .limit(1);
        return result[0];
    }
    async getActiveSubscriptionByUserId(userId) {
        const result = await db_1.db.select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.usuarioId, userId), (0, drizzle_orm_1.eq)(schema_1.userSubscriptions.status, 'active')))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.userSubscriptions.createdAt))
            .limit(1);
        return result[0];
    }
    async getAllSubscriptionsByUserId(userId) {
        return await db_1.db.select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.usuarioId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.userSubscriptions.createdAt));
    }
    async getSubscriptionByAsaasId(asaasSubscriptionId) {
        const result = await db_1.db.select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.asaasSubscriptionId, asaasSubscriptionId))
            .limit(1);
        return result[0];
    }
    async createUserSubscription(subscriptionData) {
        const result = await db_1.db.insert(schema_1.userSubscriptions).values(Object.assign(Object.assign({}, subscriptionData), { createdAt: new Date() })).returning();
        return result[0];
    }
    async updateUserSubscription(id, subscriptionData) {
        const result = await db_1.db.update(schema_1.userSubscriptions)
            .set(Object.assign(Object.assign({}, subscriptionData), { updatedAt: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.id, id))
            .returning();
        return result[0];
    }
    async getAllActiveSubscriptions() {
        return await db_1.db.select()
            .from(schema_1.userSubscriptions)
            .where((0, drizzle_orm_1.eq)(schema_1.userSubscriptions.status, 'active'));
    }
    // ============================================
    // PAYMENT TRANSACTION METHODS
    // ============================================
    async getPaymentTransactionById(id) {
        const result = await db_1.db.select()
            .from(schema_1.paymentTransactions)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.id, id))
            .limit(1);
        return result[0];
    }
    async getPaymentTransactionByAsaasId(asaasPaymentId) {
        const result = await db_1.db.select()
            .from(schema_1.paymentTransactions)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.asaasPaymentId, asaasPaymentId))
            .limit(1);
        return result[0];
    }
    async getPaymentTransactionsByUserId(userId, limit = 50) {
        return await db_1.db.select()
            .from(schema_1.paymentTransactions)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.usuarioId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentTransactions.createdAt))
            .limit(limit);
    }
    async getPaymentTransactionsBySubscriptionId(subscriptionId) {
        return await db_1.db.select()
            .from(schema_1.paymentTransactions)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.subscriptionId, subscriptionId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentTransactions.createdAt));
    }
    async getOverduePayments() {
        return await db_1.db.select()
            .from(schema_1.paymentTransactions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.status, 'overdue'), (0, drizzle_orm_1.sql) `${schema_1.paymentTransactions.retryCount} < 3`))
            .orderBy(schema_1.paymentTransactions.dueDate);
    }
    async searchPaymentTransactions(filters, limit = 50, offset = 0) {
        const conditions = [];
        // Busca por nome, email ou telefone do usuário
        if (filters.searchTerm && filters.searchTerm.trim()) {
            const searchPattern = `%${filters.searchTerm.trim()}%`;
            conditions.push((0, drizzle_orm_1.sql) `(
          ${schema_1.users.nome} ILIKE ${searchPattern} OR
          ${schema_1.users.email} ILIKE ${searchPattern} OR
          ${schema_1.users.telefone} ILIKE ${searchPattern}
        )`);
        }
        // Filtro por status
        if (filters.status) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.status, filters.status));
        }
        // Filtro por método de pagamento
        if (filters.paymentMethod) {
            conditions.push((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.paymentMethod, filters.paymentMethod));
        }
        // Filtro por data de vencimento (intervalo)
        if (filters.dateFrom) {
            conditions.push((0, drizzle_orm_1.gte)(schema_1.paymentTransactions.dueDate, new Date(filters.dateFrom)));
        }
        if (filters.dateTo) {
            conditions.push((0, drizzle_orm_1.lte)(schema_1.paymentTransactions.dueDate, new Date(filters.dateTo)));
        }
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        return await db_1.db
            .select({
            id: schema_1.paymentTransactions.id,
            usuarioId: schema_1.paymentTransactions.usuarioId,
            userName: schema_1.users.nome,
            userEmail: schema_1.users.email,
            userPhone: schema_1.users.telefone,
            subscriptionId: schema_1.paymentTransactions.subscriptionId,
            asaasPaymentId: schema_1.paymentTransactions.asaasPaymentId,
            asaasInvoiceUrl: schema_1.paymentTransactions.asaasInvoiceUrl,
            amount: schema_1.paymentTransactions.amount,
            currency: schema_1.paymentTransactions.currency,
            status: schema_1.paymentTransactions.status,
            paymentMethod: schema_1.paymentTransactions.paymentMethod,
            dueDate: schema_1.paymentTransactions.dueDate,
            confirmedDate: schema_1.paymentTransactions.confirmedDate,
            description: schema_1.paymentTransactions.description,
            retryCount: schema_1.paymentTransactions.retryCount,
            metadata: schema_1.paymentTransactions.metadata,
            createdAt: schema_1.paymentTransactions.createdAt,
            updatedAt: schema_1.paymentTransactions.updatedAt
        })
            .from(schema_1.paymentTransactions)
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.paymentTransactions.usuarioId, schema_1.users.id))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.paymentTransactions.createdAt))
            .limit(limit)
            .offset(offset);
    }
    async createPaymentTransaction(paymentData) {
        const result = await db_1.db.insert(schema_1.paymentTransactions).values(Object.assign(Object.assign({}, paymentData), { createdAt: new Date() })).returning();
        return result[0];
    }
    async updatePaymentTransaction(id, paymentData) {
        const result = await db_1.db.update(schema_1.paymentTransactions)
            .set(Object.assign(Object.assign({}, paymentData), { updatedAt: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.paymentTransactions.id, id))
            .returning();
        return result[0];
    }
    // ============================================
    // ASAAS WEBHOOK METHODS
    // ============================================
    async getAsaasWebhookById(id) {
        const result = await db_1.db.select()
            .from(schema_1.asaasWebhooks)
            .where((0, drizzle_orm_1.eq)(schema_1.asaasWebhooks.id, id))
            .limit(1);
        return result[0];
    }
    async getAsaasWebhookByEventId(eventId) {
        const result = await db_1.db.select()
            .from(schema_1.asaasWebhooks)
            .where((0, drizzle_orm_1.eq)(schema_1.asaasWebhooks.asaasEventId, eventId))
            .limit(1);
        return result[0];
    }
    async getUnprocessedWebhooks(limit = 100) {
        return await db_1.db.select()
            .from(schema_1.asaasWebhooks)
            .where((0, drizzle_orm_1.eq)(schema_1.asaasWebhooks.processed, false))
            .orderBy(schema_1.asaasWebhooks.createdAt)
            .limit(limit);
    }
    async createAsaasWebhook(webhookData) {
        const result = await db_1.db.insert(schema_1.asaasWebhooks).values(Object.assign(Object.assign({}, webhookData), { createdAt: new Date() })).returning();
        return result[0];
    }
    async updateAsaasWebhook(id, webhookData) {
        const result = await db_1.db.update(schema_1.asaasWebhooks)
            .set(webhookData)
            .where((0, drizzle_orm_1.eq)(schema_1.asaasWebhooks.id, id))
            .returning();
        return result[0];
    }
    // ============================================
    // CANCELLATION HISTORY METHODS
    // ============================================
    async createCancellationHistory(data) {
        const result = await db_1.db.insert(schema_1.historicoCancelamentos).values(Object.assign(Object.assign({}, data), { data_criacao: new Date() })).returning();
        return result[0];
    }
    // ============================================
    // WHATSAPP ONBOARDING METHODS
    // ============================================
    async getWhatsAppOnboardingState(remoteJid) {
        const [state] = await db_1.db.select().from(schema_1.whatsappOnboardingStates).where((0, drizzle_orm_1.eq)(schema_1.whatsappOnboardingStates.remoteJid, remoteJid));
        return state || null;
    }
    async createWhatsAppOnboardingState(state) {
        const [inserted] = await db_1.db.insert(schema_1.whatsappOnboardingStates).values(state).returning();
        return inserted;
    }
    async updateWhatsAppOnboardingState(remoteJid, updates) {
        await db_1.db.update(schema_1.whatsappOnboardingStates).set(updates).where((0, drizzle_orm_1.eq)(schema_1.whatsappOnboardingStates.remoteJid, remoteJid));
    }
    async deleteWhatsAppOnboardingState(remoteJid) {
        const r = await db_1.db.delete(schema_1.whatsappOnboardingStates).where((0, drizzle_orm_1.eq)(schema_1.whatsappOnboardingStates.remoteJid, remoteJid)).returning({ remoteJid: schema_1.whatsappOnboardingStates.remoteJid });
        return r.length > 0;
    }
    // ============================================
    // PJ — EMPRESAS METHODS (convive com PF; nada acima é alterado)
    // ============================================
    async createEmpresa(empresaData) {
        const usuarioId = Number(empresaData.usuario_id);
        if (!usuarioId || Number.isNaN(usuarioId)) {
            throw new Error("usuario_id é obrigatório para criar empresa.");
        }
        const existentes = await this.getEmpresasByUsuarioId(usuarioId);
        if (existentes.length > 0) {
            const err = new Error("Este usuário já possui uma empresa cadastrada. Cada login gerencia apenas uma empresa.");
            err.code = "EMPRESA_UNICA";
            err.status = 409;
            throw err;
        }
        const result = await db_1.db.insert(schema_1.empresas).values(Object.assign(Object.assign({}, empresaData), { created_at: new Date() })).returning();
        return result[0];
    }
    async getEmpresasByUsuarioId(usuarioId) {
        return db_1.db.select()
            .from(schema_1.empresas)
            .where((0, drizzle_orm_1.eq)(schema_1.empresas.usuario_id, usuarioId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.empresas.created_at));
    }
    async getEmpresaById(id) {
        const result = await db_1.db.select().from(schema_1.empresas).where((0, drizzle_orm_1.eq)(schema_1.empresas.id, id)).limit(1);
        return result[0];
    }
    async updateEmpresa(id, empresaData) {
        const result = await db_1.db.update(schema_1.empresas)
            .set(Object.assign(Object.assign({}, empresaData), { updated_at: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.empresas.id, id))
            .returning();
        return result[0];
    }
    async deleteEmpresa(id) {
        const result = await db_1.db.delete(schema_1.empresas).where((0, drizzle_orm_1.eq)(schema_1.empresas.id, id)).returning({ id: schema_1.empresas.id });
        return result.length > 0;
    }
    // Plano de contas padrão (Yampa-like), criado quando a empresa é cadastrada.
    async seedEmpresasContas(empresaId) {
        // ativo/is_cmv têm default no banco; omitidos aqui de propósito (cast no insert).
        const seed = [
            // Receitas
            { empresa_id: empresaId, codigo: '1.01', nome: 'Receita de Vendas', tipo: 'Receita', classificacao: 'OUTRA', icone: 'shopping-bag', cor: '#10B981', descricao: 'Vendas de mercadorias/produtos.' },
            { empresa_id: empresaId, codigo: '1.02', nome: 'Receita de Serviços', tipo: 'Receita', classificacao: 'OUTRA', icone: 'briefcase', cor: '#10B981', descricao: 'Prestação de serviços.' },
            { empresa_id: empresaId, codigo: '1.03', nome: 'Outras Receitas Operacionais', tipo: 'Receita', classificacao: 'OUTRA', icone: 'plus-circle', cor: '#10B981', descricao: 'Receitas operacionais diversas.' },
            { empresa_id: empresaId, codigo: '1.04', nome: 'Receitas Financeiras', tipo: 'Receita', classificacao: 'OUTRA', icone: 'trending-up', cor: '#10B981', descricao: 'Rendimentos de aplicações, juros recebidos.' },
            // Despesas Fixas
            { empresa_id: empresaId, codigo: '2.01', nome: 'Folha de Pagamento', tipo: 'Despesa', classificacao: 'FIXA', icone: 'users', cor: '#EF4444', descricao: 'Salários, encargos e benefícios.' },
            { empresa_id: empresaId, codigo: '2.02', nome: 'Aluguel', tipo: 'Despesa', classificacao: 'FIXA', icone: 'home', cor: '#EF4444', descricao: 'Aluguel do imóvel comercial.' },
            { empresa_id: empresaId, codigo: '2.03', nome: 'Energia / Água / Internet', tipo: 'Despesa', classificacao: 'FIXA', icone: 'zap', cor: '#EF4444', descricao: 'Contas de consumo fixo.' },
            { empresa_id: empresaId, codigo: '2.04', nome: 'Contabilidade', tipo: 'Despesa', classificacao: 'FIXA', icone: 'file-text', cor: '#EF4444', descricao: 'Honorários contábeis.' },
            { empresa_id: empresaId, codigo: '2.05', nome: 'Impostos e Taxas', tipo: 'Despesa', classificacao: 'FIXA', icone: 'percent', cor: '#EF4444', descricao: 'Impostos fixos, taxas municipais.' },
            { empresa_id: empresaId, codigo: '2.06', nome: 'Pró-labore / Retiradas', tipo: 'Despesa', classificacao: 'FIXA', icone: 'user-check', cor: '#EF4444', descricao: 'Retirada dos sócios.' },
            // Despesas Variáveis
            { empresa_id: empresaId, codigo: '3.01', nome: 'Compras de Mercadoria (CMV)', tipo: 'Despesa', classificacao: 'VARIAVEL', icone: 'package', cor: '#F59E0B', descricao: 'CMV — Custo da Mercadoria Vendida.' },
            { empresa_id: empresaId, codigo: '3.02', nome: 'Matéria-prima / Insumos', tipo: 'Despesa', classificacao: 'VARIAVEL', icone: 'tool', cor: '#F59E0B', descricao: 'Insumos para produção/serviço.' },
            { empresa_id: empresaId, codigo: '3.03', nome: 'Comissão de Vendedores', tipo: 'Despesa', classificacao: 'VARIAVEL', icone: 'percent', cor: '#F59E0B', descricao: 'Comissões variáveis sobre vendas.' },
            { empresa_id: empresaId, codigo: '3.04', nome: 'Frete', tipo: 'Despesa', classificacao: 'VARIAVEL', icone: 'truck', cor: '#F59E0B', descricao: 'Fretes e logística variável.' },
            { empresa_id: empresaId, codigo: '3.05', nome: 'Marketing / Anúncios', tipo: 'Despesa', classificacao: 'VARIAVEL', icone: 'megaphone', cor: '#F59E0B', descricao: 'Mídia, tráfego pago, anúncios.' },
            { empresa_id: empresaId, codigo: '3.06', nome: 'Despesas Financeiras', tipo: 'Despesa', classificacao: 'VARIAVEL', icone: 'credit-card', cor: '#F59E0B', descricao: 'Juros, taxas bancárias, IOF.' },
            // Outras
            { empresa_id: empresaId, codigo: '4.01', nome: 'Outras Despesas Operacionais', tipo: 'Despesa', classificacao: 'OUTRA', icone: 'more-horizontal', cor: '#6366F1', descricao: 'Demais despesas operacionais.' }
        ];
        if (seed.length === 0)
            return [];
        const result = await db_1.db.insert(schema_1.empresasContas).values(seed).returning();
        return result;
    }
    async getEmpresasContasByEmpresaId(empresaId) {
        return db_1.db.select()
            .from(schema_1.empresasContas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.empresasContas.empresa_id, empresaId), (0, drizzle_orm_1.eq)(schema_1.empresasContas.ativo, true)))
            .orderBy(schema_1.empresasContas.codigo);
    }
    async getEmpresaContaById(id) {
        const result = await db_1.db.select().from(schema_1.empresasContas).where((0, drizzle_orm_1.eq)(schema_1.empresasContas.id, id)).limit(1);
        return result[0];
    }
    // Próximo código livre da sequência, no mesmo padrão G.NN do plano base
    // (seedEmpresasContas): 1=Receita, 2=Despesa FIXA, 3=Despesa VARIAVEL, 4=Despesa OUTRA.
    async proximoCodigoConta(empresaId, tipo, classificacao) {
        const grupo = tipo === 'Receita'
            ? '1'
            : { FIXA: '2', VARIAVEL: '3' }[(classificacao || 'OUTRA').toUpperCase()] || '4';
        // Consulta a tabela direto (e não getEmpresasContasByEmpresaId, que filtra
        // ativo=true): a constraint única não ignora conta inativa.
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT codigo FROM empresas_contas
      WHERE empresa_id = ${empresaId} AND codigo LIKE ${grupo + '.%'}
    `);
        let maior = 0;
        for (const r of rows) {
            const m = String(r.codigo).match(/^\d+\.(\d+)$/);
            if (m)
                maior = Math.max(maior, parseInt(m[1], 10));
        }
        return `${grupo}.${String(maior + 1).padStart(2, '0')}`;
    }
    async createEmpresaConta(contaData) {
        const inserir = (codigo) => db_1.db.insert(schema_1.empresasContas).values(Object.assign(Object.assign({}, contaData), { codigo, created_at: new Date() })).returning();
        if (contaData.codigo) {
            const result = await inserir(contaData.codigo);
            return result[0];
        }
        // Sem código informado: gera na sequência. Em corrida (23505), tenta o próximo.
        for (let tentativa = 0; tentativa < 5; tentativa++) {
            const codigo = await this.proximoCodigoConta(contaData.empresa_id, contaData.tipo, contaData.classificacao);
            try {
                const result = await inserir(codigo);
                return result[0];
            }
            catch (err) {
                if ((err === null || err === void 0 ? void 0 : err.code) !== '23505')
                    throw err;
            }
        }
        throw new Error('Não foi possível gerar um código livre para a conta.');
    }
    async updateEmpresaConta(id, contaData) {
        const result = await db_1.db.update(schema_1.empresasContas).set(contaData).where((0, drizzle_orm_1.eq)(schema_1.empresasContas.id, id)).returning();
        return result[0];
    }
    async deleteEmpresaConta(id) {
        var _a, _b;
        // Bloqueia exclusão se houver transação vinculada
        const used = await db_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.empresasTransacoes).where((0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.categoria_id, id));
        if (((_b = (_a = used[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) > 0)
            return false;
        const result = await db_1.db.delete(schema_1.empresasContas).where((0, drizzle_orm_1.eq)(schema_1.empresasContas.id, id)).returning({ id: schema_1.empresasContas.id });
        return result.length > 0;
    }
    async createEmpresaTransacao(transacaoData) {
        const insertValues = Object.assign(Object.assign({}, transacaoData), { valor: typeof transacaoData.valor === 'number' ? transacaoData.valor.toString() : transacaoData.valor, data_registro: new Date() });
        const result = await db_1.db.insert(schema_1.empresasTransacoes).values(insertValues).returning();
        const created = result[0];
        const withDetails = await this.getEmpresaTransacaoById(created.id);
        return withDetails || created;
    }
    async getEmpresaTransacoesByEmpresaId(empresaId, opts = {}) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.empresa_id, empresaId),
            // Reembolso a receber (pendente) vive só na tela de Reembolsos até marcar recebido.
            (0, drizzle_orm_1.sql) `NOT (COALESCE(${schema_1.empresasTransacoes.reembolso_pessoal}, false) = true AND ${schema_1.empresasTransacoes.status} = 'Pendente')`,
        ];
        if (opts.de)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.empresasTransacoes.data_transacao, opts.de));
        if (opts.ate)
            conditions.push((0, drizzle_orm_1.lte)(schema_1.empresasTransacoes.data_transacao, opts.ate));
        let q = db_1.db.select({
            id: schema_1.empresasTransacoes.id,
            empresa_id: schema_1.empresasTransacoes.empresa_id,
            carteira_id: schema_1.empresasTransacoes.carteira_id,
            categoria_id: schema_1.empresasTransacoes.categoria_id,
            forma_pagamento_id: schema_1.empresasTransacoes.forma_pagamento_id,
            empresa_forma_pagamento_id: schema_1.empresasTransacoes.empresa_forma_pagamento_id,
            descricao: schema_1.empresasTransacoes.descricao,
            valor: schema_1.empresasTransacoes.valor,
            tipo: schema_1.empresasTransacoes.tipo,
            data_transacao: schema_1.empresasTransacoes.data_transacao,
            data_registro: schema_1.empresasTransacoes.data_registro,
            status: schema_1.empresasTransacoes.status,
            metodo_pagamento: schema_1.empresasTransacoes.metodo_pagamento,
            origem: schema_1.empresasTransacoes.origem,
            reembolso_pessoal: schema_1.empresasTransacoes.reembolso_pessoal,
            data_vencimento: schema_1.empresasTransacoes.data_vencimento,
            data_pagamento: schema_1.empresasTransacoes.data_pagamento,
            itens_agrupados: schema_1.empresasTransacoes.itens_agrupados,
            cartao_id: schema_1.empresasTransacoes.cartao_id,
            fatura_id: schema_1.empresasTransacoes.fatura_id,
            movimenta_caixa: schema_1.empresasTransacoes.movimenta_caixa,
            competencia: schema_1.empresasTransacoes.competencia,
            conta_bancaria_id: schema_1.empresasTransacoes.conta_bancaria_id,
            compra_grupo: schema_1.empresasTransacoes.compra_grupo,
            parcela_num: schema_1.empresasTransacoes.parcela_num,
            parcela_total: schema_1.empresasTransacoes.parcela_total,
            categoria_nome: schema_1.empresasContas.nome,
            categoria_classificacao: schema_1.empresasContas.classificacao,
            categoria_codigo: schema_1.empresasContas.codigo,
            metodo_pagamento_nome: schema_1.paymentMethods.nome,
            empresa_forma_nome: schema_1.empresasFormasPagamento.nome,
        })
            .from(schema_1.empresasTransacoes)
            .leftJoin(schema_1.empresasContas, (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.categoria_id, schema_1.empresasContas.id))
            .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.forma_pagamento_id, schema_1.paymentMethods.id))
            .leftJoin(schema_1.empresasFormasPagamento, (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.empresa_forma_pagamento_id, schema_1.empresasFormasPagamento.id))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.empresasTransacoes.data_transacao), (0, drizzle_orm_1.desc)(schema_1.empresasTransacoes.data_registro));
        if (opts.limit)
            q = q.limit(opts.limit);
        const rows = await q;
        return rows.map((r) => {
            var _a, _b, _c;
            return (Object.assign(Object.assign({}, r), { metodo_pagamento: (_c = (_b = (_a = r.empresa_forma_nome) !== null && _a !== void 0 ? _a : r.metodo_pagamento) !== null && _b !== void 0 ? _b : r.metodo_pagamento_nome) !== null && _c !== void 0 ? _c : null }));
        });
    }
    async getEmpresaTransacaoById(id) {
        var _a, _b, _c;
        const result = await db_1.db.select({
            id: schema_1.empresasTransacoes.id,
            empresa_id: schema_1.empresasTransacoes.empresa_id,
            carteira_id: schema_1.empresasTransacoes.carteira_id,
            categoria_id: schema_1.empresasTransacoes.categoria_id,
            forma_pagamento_id: schema_1.empresasTransacoes.forma_pagamento_id,
            empresa_forma_pagamento_id: schema_1.empresasTransacoes.empresa_forma_pagamento_id,
            descricao: schema_1.empresasTransacoes.descricao,
            valor: schema_1.empresasTransacoes.valor,
            tipo: schema_1.empresasTransacoes.tipo,
            data_transacao: schema_1.empresasTransacoes.data_transacao,
            data_registro: schema_1.empresasTransacoes.data_registro,
            status: schema_1.empresasTransacoes.status,
            metodo_pagamento: schema_1.empresasTransacoes.metodo_pagamento,
            origem: schema_1.empresasTransacoes.origem,
            reembolso_pessoal: schema_1.empresasTransacoes.reembolso_pessoal,
            data_vencimento: schema_1.empresasTransacoes.data_vencimento,
            data_pagamento: schema_1.empresasTransacoes.data_pagamento,
            itens_agrupados: schema_1.empresasTransacoes.itens_agrupados,
            cartao_id: schema_1.empresasTransacoes.cartao_id,
            fatura_id: schema_1.empresasTransacoes.fatura_id,
            movimenta_caixa: schema_1.empresasTransacoes.movimenta_caixa,
            competencia: schema_1.empresasTransacoes.competencia,
            conta_bancaria_id: schema_1.empresasTransacoes.conta_bancaria_id,
            compra_grupo: schema_1.empresasTransacoes.compra_grupo,
            parcela_num: schema_1.empresasTransacoes.parcela_num,
            parcela_total: schema_1.empresasTransacoes.parcela_total,
            categoria_nome: schema_1.empresasContas.nome,
            categoria_classificacao: schema_1.empresasContas.classificacao,
            categoria_codigo: schema_1.empresasContas.codigo,
            metodo_pagamento_nome: schema_1.paymentMethods.nome,
            empresa_forma_nome: schema_1.empresasFormasPagamento.nome,
        })
            .from(schema_1.empresasTransacoes)
            .leftJoin(schema_1.empresasContas, (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.categoria_id, schema_1.empresasContas.id))
            .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.forma_pagamento_id, schema_1.paymentMethods.id))
            .leftJoin(schema_1.empresasFormasPagamento, (0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.empresa_forma_pagamento_id, schema_1.empresasFormasPagamento.id))
            .where((0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.id, id))
            .limit(1);
        const row = result[0];
        if (!row)
            return undefined;
        return Object.assign(Object.assign({}, row), { metodo_pagamento: (_c = (_b = (_a = row.empresa_forma_nome) !== null && _a !== void 0 ? _a : row.metodo_pagamento) !== null && _b !== void 0 ? _b : row.metodo_pagamento_nome) !== null && _c !== void 0 ? _c : null });
    }
    async updateEmpresaTransacao(id, transacaoData) {
        const updateValues = Object.assign({}, transacaoData);
        if (typeof updateValues.valor === 'number') {
            updateValues.valor = updateValues.valor.toString();
        }
        await db_1.db.update(schema_1.empresasTransacoes).set(updateValues).where((0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.id, id)).returning();
        return this.getEmpresaTransacaoById(id);
    }
    async deleteEmpresaTransacao(id) {
        const result = await db_1.db.delete(schema_1.empresasTransacoes).where((0, drizzle_orm_1.eq)(schema_1.empresasTransacoes.id, id)).returning({ id: schema_1.empresasTransacoes.id });
        return result.length > 0;
    }
    async getEmpresaResumo(empresaId, opts = {}) {
        var _a, _b;
        const now = new Date();
        const de = (_a = opts.de) !== null && _a !== void 0 ? _a : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const ate = (_b = opts.ate) !== null && _b !== void 0 ? _b : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
        AND t.status = 'Efetivada'
        AND NOT (COALESCE(t.reembolso_pessoal, false) = true AND t.status = 'Pendente')
        AND ${NAO_E_PAGAMENTO_FATURA}
      GROUP BY t.tipo, c.classificacao
    `);
        let entradas = 0;
        let saidasFixas = 0;
        let saidasVariaveis = 0;
        let saidasOutras = 0;
        let totalTransacoes = 0;
        for (const row of rows) {
            const total = parseFloat(row.total) || 0;
            const qtd = parseInt(row.qtd) || 0;
            totalTransacoes += qtd;
            if (row.tipo === 'Receita') {
                entradas += total;
            }
            else if (row.tipo === 'Despesa') {
                if (row.classificacao === 'FIXA')
                    saidasFixas += total;
                else if (row.classificacao === 'VARIAVEL')
                    saidasVariaveis += total;
                else
                    saidasOutras += total;
            }
        }
        const totalSaidas = saidasFixas + saidasVariaveis + saidasOutras;
        const margemContribuicao = entradas - saidasVariaveis;
        const lucroPrejuizo = entradas - totalSaidas;
        const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);
        const result = {
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
            total_transacoes: totalTransacoes,
            reembolsos_pessoais_pendentes: 0,
            reembolsos_pessoais_qtd: 0,
        };
        try {
            const reb = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT COALESCE(SUM(valor::numeric), 0) AS total, COUNT(*) AS qtd
        FROM empresas_transacoes
        WHERE empresa_id = ${empresaId}
          AND reembolso_pessoal = true
          AND status = 'Pendente'
          AND data_transacao >= ${de}
          AND data_transacao <= ${ate}
      `);
            const r0 = reb[0];
            result.reembolsos_pessoais_pendentes = round2(parseFloat(r0 === null || r0 === void 0 ? void 0 : r0.total) || 0);
            result.reembolsos_pessoais_qtd = parseInt(r0 === null || r0 === void 0 ? void 0 : r0.qtd) || 0;
        }
        catch ( /* coluna ainda não migrada */_c) { /* coluna ainda não migrada */ }
        return result;
    }
    async getEmpresaDRE(empresaId, opts = {}) {
        var _a, _b, _c;
        const now = new Date();
        const de = (_a = opts.de) !== null && _a !== void 0 ? _a : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const ate = (_b = opts.ate) !== null && _b !== void 0 ? _b : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT
        c.classificacao,
        COALESCE(SUM(t.valor::numeric), 0) AS total
      FROM empresas_transacoes t
      JOIN empresas_contas c ON t.categoria_id = c.id
      WHERE t.empresa_id = ${empresaId}
        AND t.tipo = 'Despesa'
        AND t.data_transacao >= ${de}
        AND t.data_transacao <= ${ate}
        AND t.status = 'Efetivada'
        AND NOT (COALESCE(t.reembolso_pessoal, false) = true AND t.status = 'Pendente')
        AND ${NAO_E_PAGAMENTO_FATURA}
      GROUP BY c.classificacao
    `);
        let receita = 0;
        let variaveis = 0;
        let fixas = 0;
        let outras = 0;
        // receita
        const recRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT COALESCE(SUM(valor::numeric), 0) AS total
      FROM empresas_transacoes
      WHERE empresa_id = ${empresaId}
        AND tipo = 'Receita'
        AND data_transacao >= ${de}
        AND data_transacao <= ${ate}
        AND status = 'Efetivada'
        AND NOT (COALESCE(reembolso_pessoal, false) = true AND status = 'Pendente')
    `);
        receita = parseFloat((_c = recRows[0]) === null || _c === void 0 ? void 0 : _c.total) || 0;
        for (const row of rows) {
            const total = parseFloat(row.total) || 0;
            if (row.classificacao === 'FIXA')
                fixas += total;
            else if (row.classificacao === 'VARIAVEL')
                variaveis += total;
            else
                outras += total;
        }
        const margem = receita - variaveis;
        const lucro = receita - variaveis - fixas - outras;
        const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);
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
    //
    // REALIZADO: só entra o que já se moveu (status Efetivada). Conta a pagar em
    // aberto é previsão e vive no Fluxo Projetado — se entrasse aqui, o saldo do
    // mês mostraria dinheiro que ainda não saiu.
    async getEmpresaFluxoCaixaMensal(empresaId, ano) {
        var _a;
        const contas = await db_1.db.select().from(schema_1.empresasContas)
            .where((0, drizzle_orm_1.eq)(schema_1.empresasContas.empresa_id, empresaId))
            .orderBy(schema_1.empresasContas.codigo);
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT t.categoria_id AS conta_id,
             EXTRACT(MONTH FROM t.data_transacao)::int AS mes,
             SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND COALESCE(t.movimenta_caixa, true) = true
        AND t.status = 'Efetivada'
        AND EXTRACT(YEAR FROM t.data_transacao) = ${ano}
      GROUP BY t.categoria_id, mes
    `);
        const agregado = rows.map((r) => ({
            conta_id: Number(r.conta_id),
            mes: Number(r.mes),
            total: parseFloat(r.total) || 0,
        }));
        // ---- Disponibilidades: contas bancárias + movimento por conta × mês ----
        const contasBancRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT id, banco, saldo_inicial::numeric AS saldo_inicial
      FROM contas_bancarias
      WHERE empresa_id = ${empresaId} AND ativo = true
      ORDER BY banco
    `);
        const contasBancarias = contasBancRows.map((r) => ({
            id: Number(r.id), banco: String(r.banco), saldo_inicial: parseFloat(r.saldo_inicial) || 0,
        }));
        // Movimento (com sinal) por conta bancária × mês, dentro do ano.
        const movRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT t.conta_bancaria_id,
             EXTRACT(MONTH FROM t.data_transacao)::int AS mes,
             SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND t.conta_bancaria_id IS NOT NULL
        AND COALESCE(t.movimenta_caixa, true) = true
        AND t.status = 'Efetivada'
        AND EXTRACT(YEAR FROM t.data_transacao) = ${ano}
      GROUP BY t.conta_bancaria_id, mes
    `);
        const movContas = movRows.map((r) => ({
            conta_bancaria_id: Number(r.conta_bancaria_id), mes: Number(r.mes), total: parseFloat(r.total) || 0,
        }));
        // Movimento acumulado ANTES do ano (para o saldo inicial de janeiro).
        const antesRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT t.conta_bancaria_id,
             SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND t.conta_bancaria_id IS NOT NULL
        AND COALESCE(t.movimenta_caixa, true) = true
        AND t.status = 'Efetivada'
        AND EXTRACT(YEAR FROM t.data_transacao) < ${ano}
      GROUP BY t.conta_bancaria_id
    `);
        const saldoAntesAno = antesRows.map((r) => ({
            conta_bancaria_id: Number(r.conta_bancaria_id), total: parseFloat(r.total) || 0,
        }));
        // Caixa acumulado antes do ano considerando TODOS os lançamentos (inclusive
        // os sem conta bancária). É a abertura de janeiro da linha de saldo: sem
        // isso, empresa que não usa conta bancária começaria zerada todo ano.
        const antesTotalRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT COALESCE(SUM(
        CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END
      ), 0) AS total
      FROM empresas_transacoes t
      WHERE t.empresa_id = ${empresaId}
        AND COALESCE(t.movimenta_caixa, true) = true
        AND t.status = 'Efetivada'
        AND EXTRACT(YEAR FROM t.data_transacao) < ${ano}
    `);
        const movimentoAntesAno = parseFloat((_a = antesTotalRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        return {
            empresa_id: empresaId, ano, contas: contas, agregado,
            contasBancarias, movContas, saldoAntesAno, movimentoAntesAno,
        };
    }
}
exports.DbStorage = DbStorage;
// ============================================
// METAS FINANCEIRAS — caixinhas, sonhos, orçamentos
// ============================================
async function createMeta(userId, metaData) {
    var _a, _b, _c;
    // Meta por ambiente: se o login é PJ (tem empresa), a meta pertence à empresa.
    // Um login = um ambiente, então basta pegar a empresa do usuário (PF não tem).
    let empresaId = (_a = metaData.empresa_id) !== null && _a !== void 0 ? _a : null;
    if (empresaId == null) {
        const empresasDoUser = await db_1.db.select({ id: schema_1.empresas.id })
            .from(schema_1.empresas)
            .where((0, drizzle_orm_1.eq)(schema_1.empresas.usuario_id, userId))
            .orderBy(schema_1.empresas.id)
            .limit(1);
        empresaId = (_c = (_b = empresasDoUser[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null;
    }
    const result = await db_1.db.insert(schema_1.metasFinanceiras).values(Object.assign(Object.assign({}, metaData), { usuario_id: userId, empresa_id: empresaId, valor_alvo: metaData.valor_alvo.toString(), valor_atual: (metaData.valor_atual || 0).toString(), valor_recorrencia: metaData.valor_recorrencia ? metaData.valor_recorrencia.toString() : null, created_at: new Date() })).returning();
    return result[0];
}
async function getMetasByUsuarioId(userId) {
    const metas = await db_1.db.select()
        .from(schema_1.metasFinanceiras)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.usuario_id, userId), (0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.ativo, true)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.metasFinanceiras.created_at));
    return metas.map(m => {
        const alvo = parseFloat(m.valor_alvo) || 0;
        const atual = parseFloat(m.valor_atual) || 0;
        const falta = Math.max(0, alvo - atual);
        const progresso = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;
        // Calcular meses restantes baseado na recorrência
        let mesesRestantes = null;
        const valorRec = parseFloat(m.valor_recorrencia) || 0;
        if (valorRec > 0 && falta > 0) {
            mesesRestantes = Math.ceil(falta / valorRec);
        }
        return Object.assign(Object.assign({}, m), { progresso_pct: Math.round(progresso * 10) / 10, falta: Math.round(falta * 100) / 100, meses_restantes: mesesRestantes });
    });
}
async function getMetaById(id) {
    const result = await db_1.db.select().from(schema_1.metasFinanceiras).where((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.id, id)).limit(1);
    return result[0];
}
async function depositarMeta(id, valor) {
    const meta = await getMetaById(id);
    if (!meta)
        return undefined;
    const novoValor = (parseFloat(meta.valor_atual) || 0) + valor;
    const result = await db_1.db.update(schema_1.metasFinanceiras)
        .set({ valor_atual: novoValor.toString() })
        .where((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.id, id))
        .returning();
    return result[0];
}
async function sacarMeta(id, valor) {
    const meta = await getMetaById(id);
    if (!meta)
        return undefined;
    const atual = parseFloat(meta.valor_atual) || 0;
    const novoValor = Math.max(0, atual - valor);
    const result = await db_1.db.update(schema_1.metasFinanceiras)
        .set({ valor_atual: novoValor.toString() })
        .where((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.id, id))
        .returning();
    return result[0];
}
async function ajustarSaldoMeta(id, novoSaldo) {
    const result = await db_1.db.update(schema_1.metasFinanceiras)
        .set({ valor_atual: novoSaldo.toString() })
        .where((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.id, id))
        .returning();
    return result[0];
}
async function updateMeta(id, data) {
    const updateValues = Object.assign({}, data);
    if (data.valor_alvo)
        updateValues.valor_alvo = data.valor_alvo.toString();
    if (data.valor_atual !== undefined)
        updateValues.valor_atual = data.valor_atual.toString();
    if (data.valor_recorrencia)
        updateValues.valor_recorrencia = data.valor_recorrencia.toString();
    const result = await db_1.db.update(schema_1.metasFinanceiras).set(updateValues).where((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.id, id)).returning();
    return result[0];
}
async function deleteMeta(id) {
    const result = await db_1.db.update(schema_1.metasFinanceiras)
        .set({ ativo: false })
        .where((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.id, id))
        .returning();
    return result.length > 0;
}
// Verifica orçamento: compara gastos do mês atual por categoria vs metas tipo 'limite_categoria'
async function verificarOrcamentos(userId, walletId) {
    var _a, _b;
    // Buscar metas tipo limite_categoria ativas
    const limites = await db_1.db.select()
        .from(schema_1.metasFinanceiras)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.usuario_id, userId), (0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.tipo, 'limite_categoria'), (0, drizzle_orm_1.eq)(schema_1.metasFinanceiras.ativo, true)));
    if (limites.length === 0)
        return [];
    // Período: mês atual
    const now = new Date();
    const de = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const ate = now.toISOString().slice(0, 10);
    const results = [];
    for (const limite of limites) {
        if (!limite.categoria_id)
            continue;
        // Buscar gasto na categoria no mês
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT COALESCE(SUM(valor::numeric), 0) AS total
      FROM transacoes
      WHERE carteira_id = ${walletId}
        AND categoria_id = ${limite.categoria_id}
        AND tipo = 'Despesa'
        AND COALESCE(reembolsavel, false) = false
        AND data_transacao >= ${de}
        AND data_transacao <= ${ate}
    `);
        const gasto = parseFloat((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const limiteVal = parseFloat(limite.valor_alvo) || 0;
        const pct = limiteVal > 0 ? (gasto / limiteVal) * 100 : 0;
        // Buscar nome da categoria
        const cat = await db_1.db.select().from(schema_1.categories).where((0, drizzle_orm_1.eq)(schema_1.categories.id, limite.categoria_id)).limit(1);
        const catNome = ((_b = cat[0]) === null || _b === void 0 ? void 0 : _b.nome) || 'Desconhecida';
        let status = '✅ OK';
        if (pct >= 100)
            status = '🚨 ESTOURADO';
        else if (pct >= 80)
            status = '⚠️ ATENÇÃO';
        else if (pct >= 60)
            status = '📊 Moderado';
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
async function getSaldoCartao(cartaoId, _walletId) {
    const { getSaldoCartaoPf } = await Promise.resolve().then(() => __importStar(require("./services/fatura-pf.service")));
    return getSaldoCartaoPf(cartaoId);
}
/**
 * Lista todos os cartões do usuário com saldo atual.
 */
async function getCartoesComSaldo(userId, walletId) {
    const cartoes = await db_1.db.select()
        .from(schema_1.paymentMethods)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.paymentMethods.usuario_id, userId), (0, drizzle_orm_1.eq)(schema_1.paymentMethods.ativo, true), (0, drizzle_orm_1.sql) `${schema_1.paymentMethods.dia_fechamento} IS NOT NULL AND ${schema_1.paymentMethods.dia_vencimento} IS NOT NULL`));
    const result = [];
    for (const cartao of cartoes) {
        try {
            const saldo = await getSaldoCartao(cartao.id, walletId);
            result.push(saldo);
        }
        catch (_) { /* skip */ }
    }
    return result;
}
/**
 * Janela de uma fatura de cartão: [inicio, fim) — fim é EXCLUSIVO.
 *
 * A competência é o mês em que a fatura ABRE (o mês das compras): com
 * fechamento no dia 1, a competência 8/2026 vai de 2026-08-01 a 2026-09-01.
 * Sem mês/ano informados devolve a fatura ATUAL, com a mesma regra de sempre
 * (se hoje já passou do fechamento, a fatura aberta é a que começou neste mês).
 */
function janelaFatura(diaFechamento, mes, ano) {
    const diaFech = diaFechamento || 1;
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Fechamento no dia 31 num mês de 30 (ou em fevereiro) tem que cair no último
    // dia do mês. Sem isso a data transborda e a fatura vaza para o mês seguinte.
    const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate();
    const noMes = (a, m) => new Date(a, m, Math.min(diaFech, ultimoDia(a, m)));
    let anoIni;
    let mesIni; // 0-based
    if (mes && mes >= 1 && mes <= 12) {
        anoIni = ano || new Date().getFullYear();
        mesIni = mes - 1;
    }
    else {
        const now = new Date();
        anoIni = now.getFullYear();
        const fechEsteMes = Math.min(diaFech, ultimoDia(now.getFullYear(), now.getMonth()));
        mesIni = now.getDate() >= fechEsteMes ? now.getMonth() : now.getMonth() - 1;
    }
    return {
        inicio: iso(noMes(anoIni, mesIni)),
        fim: iso(noMes(anoIni, mesIni + 1)),
    };
}
/**
 * Lista transações de um cartão específico no período de uma fatura (para
 * conciliação). Sem mês/ano usa a fatura atual.
 */
async function getFaturaCartao(cartaoId, walletId, mes, ano) {
    const cartaoRows = await db_1.db.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, cartaoId)).limit(1);
    const cartao = cartaoRows[0];
    if (!cartao)
        throw new Error("Cartão não encontrado");
    const { inicio: inicioFatura, fim: fimFatura } = janelaFatura(cartao.dia_fechamento || 1, mes, ano);
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const total = rows.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    return {
        cartao: cartao.nome,
        periodo_de: inicioFatura,
        periodo_ate: fimFatura,
        total: Math.round(total * 100) / 100,
        transacoes: rows
    };
}
// ============================================
// CONTAS A PAGAR + FLUXO DE CAIXA
// ============================================
/**
 * Cria o plano de contas pessoal para um novo usuário (cópia do template base).
 * Cada usuário recebe seu próprio plano — pode editar/excluir sem afetar outros.
 */
async function seedPlanoContasPessoal(userId) {
    const { PLANO_CONTAS_BASE } = await Promise.resolve().then(() => __importStar(require("./data/plano-contas-base")));
    for (const cat of PLANO_CONTAS_BASE) {
        await db_1.db.insert(schema_1.categories).values({
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
async function getContasAPagar(walletId, status) {
    var _a, _b;
    const today = new Date().toISOString().slice(0, 10);
    const tresDias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    try {
        // Query simples — busca todas as pendentes com vencimento, depois filtra em JS
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
        const result = rows.map(r => {
            const venc = r.data_vencimento;
            let urgencia = 'futura';
            if (venc < today)
                urgencia = 'atrasada';
            else if (venc <= tresDias)
                urgencia = 'proxima';
            return Object.assign(Object.assign({}, r), { urgencia });
        });
        // Filtrar por status se informado
        if (status === 'atrasada')
            return result.filter(r => r.urgencia === 'atrasada');
        if (status === 'proximas')
            return result.filter(r => r.urgencia === 'proxima');
        return result;
    }
    catch (err) {
        // Se coluna data_vencimento não existe ainda (migration não rodou), retorna vazio
        if (((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes('data_vencimento')) || ((_b = err.message) === null || _b === void 0 ? void 0 : _b.includes('column'))) {
            console.warn('[getContasAPagar] Coluna data_vencimento não existe ainda. Rode a migration.');
            return [];
        }
        throw err;
    }
}
async function marcarComoPaga(transacaoId) {
    const today = new Date().toISOString().slice(0, 10);
    const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE transacoes
    SET status = 'Efetivada', data_pagamento = ${today}
    WHERE id = ${transacaoId}
    RETURNING *
  `);
    return result[0];
}
async function reabrirTransacao(transacaoId) {
    const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE transacoes
    SET status = 'Pendente', data_pagamento = NULL
    WHERE id = ${transacaoId}
    RETURNING *
  `);
    return result[0];
}
async function marcarRecorrente(transacaoId, recorrente) {
    const classificacao = recorrente ? 'fixa' : 'variavel';
    const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE transacoes
    SET recorrente = ${recorrente}, classificacao_despesa = ${classificacao}
    WHERE id = ${transacaoId}
    RETURNING *
  `);
    return result[0];
}
/**
 * Lista gastos de terceiros lançados no cartão e ainda não reembolsados.
 * Eles continuam compondo a fatura, mas não são obrigação nem despesa pessoal.
 */
async function getReembolsosAReceber(walletId) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    return rows;
}
async function marcarReembolsoRecebido(transacaoId, walletId) {
    const today = new Date().toISOString().slice(0, 10);
    const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE transacoes
    SET status = 'Efetivada', data_pagamento = ${today}
    WHERE id = ${transacaoId}
      AND carteira_id = ${walletId}
      AND COALESCE(reembolsavel, false) = true
    RETURNING *
  `);
    return result[0];
}
async function getFluxoCaixaResumo(walletId, mes, ano) {
    var _a, _b, _c, _d, _e, _f, _g;
    const now = new Date();
    const m = mes || (now.getMonth() + 1);
    const a = ano || now.getFullYear();
    const de = `${a}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(a, m, 0).getDate();
    const ate = `${a}-${String(m).padStart(2, '0')}-${lastDay}`;
    const today = now.toISOString().slice(0, 10);
    // Renda (receitas do mês)
    const rendaRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM transacoes WHERE carteira_id = ${walletId} AND tipo = 'Receita'
      AND data_transacao >= ${de} AND data_transacao <= ${ate}
  `);
    const renda = parseFloat((_a = rendaRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
    // Dízimos e Ofertas (categoria específica)
    const dizimosRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(t.valor::numeric), 0) AS total
    FROM transacoes t
    JOIN categorias c ON t.categoria_id = c.id
    WHERE t.carteira_id = ${walletId} AND t.tipo = 'Despesa'
      AND COALESCE(t.reembolsavel, false) = false
      AND (c.nome ILIKE '%dízimo%' OR c.nome ILIKE '%dizimo%' OR c.nome ILIKE '%oferta%')
      AND t.data_transacao >= ${de} AND t.data_transacao <= ${ate}
      AND ${NAO_E_PAGAMENTO_FATURA}
  `);
    const dizimos = parseFloat((_b = dizimosRows[0]) === null || _b === void 0 ? void 0 : _b.total) || 0;
    // Sonhos (depósitos em metas no mês — calculado pela diferença de valor_atual)
    // Simplificado: soma de metas.valor_recorrencia * 1 (se mensal) para o mês
    const sonhosRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(valor_recorrencia::numeric), 0) AS total
    FROM metas_financeiras
    WHERE usuario_id = (SELECT usuario_id FROM carteiras WHERE id = ${walletId})
      AND ativo = true AND tipo IN ('caixinha', 'sonho', 'reserva')
      AND recorrencia = 'mensal'
  `);
    const sonhos = parseFloat((_c = sonhosRows[0]) === null || _c === void 0 ? void 0 : _c.total) || 0;
    // Despesas fixas (recorrente=true OU classificacao_despesa='fixa')
    const fixasRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(t.valor::numeric), 0) AS total
    FROM transacoes t
    WHERE t.carteira_id = ${walletId} AND t.tipo = 'Despesa'
      AND COALESCE(t.reembolsavel, false) = false
      AND (t.recorrente = true OR t.classificacao_despesa = 'fixa')
      AND t.data_transacao >= ${de} AND t.data_transacao <= ${ate}
      AND ${NAO_E_PAGAMENTO_FATURA}
  `);
    const fixas = parseFloat((_d = fixasRows[0]) === null || _d === void 0 ? void 0 : _d.total) || 0;
    // Despesas variáveis (não fixa, não dízimo)
    const variaveisRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(t.valor::numeric), 0) AS total
    FROM transacoes t
    LEFT JOIN categorias c ON t.categoria_id = c.id
    WHERE t.carteira_id = ${walletId} AND t.tipo = 'Despesa'
      AND COALESCE(t.reembolsavel, false) = false
      AND (t.recorrente = false OR t.recorrente IS NULL)
      AND (t.classificacao_despesa IS NULL OR t.classificacao_despesa = 'variavel')
      AND NOT (c.nome ILIKE '%dízimo%' OR c.nome ILIKE '%dizimo%' OR c.nome ILIKE '%oferta%')
      AND t.data_transacao >= ${de} AND t.data_transacao <= ${ate}
      AND ${NAO_E_PAGAMENTO_FATURA}
  `);
    const variaveis = parseFloat((_e = variaveisRows[0]) === null || _e === void 0 ? void 0 : _e.total) || 0;
    // Contas pendentes e atrasadas
    const pendentesRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT
      COUNT(*) FILTER (WHERE data_vencimento IS NOT NULL AND status = 'Pendente') AS pendentes,
      COUNT(*) FILTER (WHERE data_vencimento < ${today} AND status = 'Pendente') AS atrasadas
    FROM transacoes WHERE carteira_id = ${walletId}
      AND COALESCE(reembolsavel, false) = false
  `);
    const pendentes = parseInt((_f = pendentesRows[0]) === null || _f === void 0 ? void 0 : _f.pendentes) || 0;
    const atrasadas = parseInt((_g = pendentesRows[0]) === null || _g === void 0 ? void 0 : _g.atrasadas) || 0;
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
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
// ============================================
// QUERIES INTELIGENTES — usadas pelo agente IA
// Resumos por dia, semana, período customizado,
// breakdown por categoria, comparação entre períodos.
// ============================================
async function getDailySummary(walletId, date) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor::numeric ELSE 0 END), 0) AS despesa,
      COUNT(*) AS qtd
    FROM transacoes
    WHERE carteira_id = ${walletId}
      AND data_transacao = ${date}
      AND (tipo <> 'Despesa' OR COALESCE(reembolsavel, false) = false)
      AND ${NAO_E_PAGAMENTO_FATURA_PF}
  `);
    const row = rows[0] || { receita: 0, despesa: 0, qtd: 0 };
    const receita = parseFloat(row.receita) || 0;
    const despesa = parseFloat(row.despesa) || 0;
    return { totalReceita: round2(receita), totalDespesa: round2(despesa), saldo: round2(receita - despesa), transacoes: parseInt(row.qtd) || 0 };
}
async function getPeriodSummary(walletId, de, ate) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor::numeric ELSE 0 END), 0) AS despesa,
      COUNT(*) AS qtd
    FROM transacoes
    WHERE carteira_id = ${walletId}
      AND data_transacao >= ${de}
      AND data_transacao <= ${ate}
      AND (tipo <> 'Despesa' OR COALESCE(reembolsavel, false) = false)
      AND ${NAO_E_PAGAMENTO_FATURA_PF}
  `);
    const row = rows[0] || { receita: 0, despesa: 0, qtd: 0 };
    const receita = parseFloat(row.receita) || 0;
    const despesa = parseFloat(row.despesa) || 0;
    return { totalReceita: round2(receita), totalDespesa: round2(despesa), saldo: round2(receita - despesa), transacoes: parseInt(row.qtd) || 0 };
}
async function getWeeklySummary(walletId, weekOffset = 0) {
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
    return Object.assign({ de, ate }, result);
}
async function getCategoryBreakdown(walletId, de, ate) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
      AND ${NAO_E_PAGAMENTO_FATURA}
    GROUP BY c.nome, t.tipo
    ORDER BY total DESC
  `);
    // Calcular percentuais separados por tipo
    const despesaTotal = rows.filter(r => r.tipo === 'Despesa').reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    const receitaTotal = rows.filter(r => r.tipo === 'Receita').reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    return rows.map(r => {
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
async function createAuditLog(data) {
    const result = await db_1.db.insert(auditoriaAdmin)
        .values(Object.assign(Object.assign({}, data), { created_at: new Date() }))
        .returning();
    return result[0];
}
async function getAuditLogs(opts = {}) {
    var _a, _b;
    const limit = Math.min((_a = opts.limit) !== null && _a !== void 0 ? _a : 100, 500);
    const offset = (_b = opts.offset) !== null && _b !== void 0 ? _b : 0;
    let query = db_1.db.select().from(auditoriaAdmin).orderBy((0, drizzle_orm_1.desc)(auditoriaAdmin.created_at)).limit(limit).offset(offset);
    if (opts.adminId) {
        query = query.where((0, drizzle_orm_1.eq)(auditoriaAdmin.admin_id, opts.adminId));
    }
    if (opts.acao) {
        query = query.where((0, drizzle_orm_1.eq)(auditoriaAdmin.acao, opts.acao));
    }
    return query;
}
async function comparePeriods(walletId, p1Start, p1End, p2Start, p2End) {
    const p1 = await getPeriodSummary(walletId, p1Start, p1End);
    const p2 = await getPeriodSummary(walletId, p2Start, p2End);
    const varPct = (atual, anterior) => {
        if (anterior === 0)
            return null;
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
exports.storage = new DbStorage();
// ============================================
// Log de ingestão por IA (diagnóstico / painel admin)
// ============================================
async function createIngestionEvent(ev) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO ingestion_events
        (usuario_id, remote_jid, canal, tipo_mensagem, mensagem_raw, resultado, etapa, detalhe, provider)
      VALUES
        (${(_a = ev.usuario_id) !== null && _a !== void 0 ? _a : null}, ${(_b = ev.remote_jid) !== null && _b !== void 0 ? _b : null}, ${(_c = ev.canal) !== null && _c !== void 0 ? _c : 'whatsapp'},
         ${(_d = ev.tipo_mensagem) !== null && _d !== void 0 ? _d : null}, ${(_e = ev.mensagem_raw) !== null && _e !== void 0 ? _e : null}, ${ev.resultado},
         ${(_f = ev.etapa) !== null && _f !== void 0 ? _f : null}, ${(_g = ev.detalhe) !== null && _g !== void 0 ? _g : null}, ${(_h = ev.provider) !== null && _h !== void 0 ? _h : null})
    `);
    }
    catch (err) {
        // Nunca deixar o log de ingestão derrubar o fluxo principal.
        console.error("[IngestionEvent] falha ao registrar evento:", err === null || err === void 0 ? void 0 : err.message);
    }
}
async function listIngestionEvents(opts = {}) {
    var _a, _b;
    const limit = Math.min((_a = opts.limit) !== null && _a !== void 0 ? _a : 100, 500);
    const offset = (_b = opts.offset) !== null && _b !== void 0 ? _b : 0;
    const result = opts.resultado
        ? await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT * FROM ingestion_events WHERE resultado = ${opts.resultado}
        ORDER BY data_criacao DESC LIMIT ${limit} OFFSET ${offset}`)
        : await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT * FROM ingestion_events
        ORDER BY data_criacao DESC LIMIT ${limit} OFFSET ${offset}`);
    return result;
}
// ============================================
// FASE 4 — Memória de conversa (contexto entre mensagens)
// ============================================
async function getConversaRecente(userId, limit = 6) {
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT role, content FROM conversa_historico
      WHERE usuario_id = ${userId}
      ORDER BY id DESC LIMIT ${limit}
    `);
        return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
    }
    catch (err) {
        console.error("[Conversa] falha ao ler histórico:", err === null || err === void 0 ? void 0 : err.message);
        return [];
    }
}
async function appendConversa(userId, role, content) {
    try {
        const trimmed = (content || "").slice(0, 4000);
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO conversa_historico (usuario_id, role, content)
      VALUES (${userId}, ${role}, ${trimmed})
    `);
        // Poda: mantém só as últimas 20 mensagens por usuário.
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      DELETE FROM conversa_historico
      WHERE usuario_id = ${userId}
        AND id NOT IN (
          SELECT id FROM conversa_historico
          WHERE usuario_id = ${userId}
          ORDER BY id DESC LIMIT 20
        )
    `);
    }
    catch (err) {
        console.error("[Conversa] falha ao gravar histórico:", err === null || err === void 0 ? void 0 : err.message);
    }
}
// ============================================
// FASE 4 — Memória por usuário (comerciante → categoria)
// ============================================
function normalizeChaveMem(s) {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
async function resolveMemoriaCategoria(userId, texto) {
    const alvo = normalizeChaveMem(texto);
    if (!alvo)
        return undefined;
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT chave, valor FROM memoria_usuario
      WHERE usuario_id = ${userId} AND tipo = 'merchant_categoria'
    `);
        let melhor;
        for (const r of rows) {
            const k = normalizeChaveMem(r.chave);
            if (k && (alvo.includes(k) || k.includes(alvo))) {
                if (!melhor || k.length > normalizeChaveMem(melhor.chave).length)
                    melhor = r;
            }
        }
        if (!melhor)
            return undefined;
        const v = typeof melhor.valor === "string" ? JSON.parse(melhor.valor) : melhor.valor;
        if (!(v === null || v === void 0 ? void 0 : v.categoria_id))
            return undefined;
        return { categoria_id: Number(v.categoria_id), categoria_nome: v.categoria_nome };
    }
    catch (err) {
        console.error("[Memória] falha ao resolver:", err === null || err === void 0 ? void 0 : err.message);
        return undefined;
    }
}
async function aprenderMemoriaCategoria(userId, chave, categoriaId, categoriaNome) {
    const chaveNorm = normalizeChaveMem(chave);
    if (!chaveNorm)
        return;
    try {
        const valor = JSON.stringify({ categoria_id: categoriaId, categoria_nome: categoriaNome });
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO memoria_usuario (usuario_id, tipo, chave, valor)
      VALUES (${userId}, 'merchant_categoria', ${chaveNorm}, ${valor}::jsonb)
      ON CONFLICT (usuario_id, tipo, chave)
      DO UPDATE SET valor = ${valor}::jsonb, hits = memoria_usuario.hits + 1,
                    updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    `);
    }
    catch (err) {
        console.error("[Memória] falha ao aprender:", err === null || err === void 0 ? void 0 : err.message);
    }
}
// ============================================
// Compra parcelada (agrupamento) e edição de compra
// ============================================
// Resolve uma forma de pagamento pelo nome (usuário + globais); cria se não achar.
// Nomes genéricos que NÃO são cartões nominais (não pedimos limite/fechamento).
const FORMAS_GENERICAS = /^(pix|dinheiro|d[eé]bito|cart[aã]o([_\s-]?de)?[_\s-]?d[eé]bito|cart[aã]o([_\s-]?de)?[_\s-]?cr[eé]dito|cartao_credito|cartao_debito|credit[_\s-]?card|debit[_\s-]?card|boleto|transfer[eê]ncia|esp[eé]cie|cart[aã]o)$/i;
function ehFormaGenerica(nome) {
    return FORMAS_GENERICAS.test((nome || "").trim());
}
async function resolveOuCriaFormaPagamento(userId, nome) {
    const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const alvo = norm(nome);
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, nome, dia_fechamento, dia_vencimento, limite, global, usuario_id FROM formas_pagamento
    WHERE (usuario_id = ${userId} OR global = true) AND ativo = true
  `);
    const lista = rows;
    // 1) match EXATO (preferindo o do usuário sobre o global)
    const exatos = lista.filter((r) => norm(r.nome) === alvo);
    let match = exatos.find((r) => Number(r.usuario_id) === userId) ||
        exatos.find((r) => r.global) ||
        exatos[0];
    // 2) substring só entre nomes NÃO genéricos e com alvo razoável (>= 3 chars)
    //    Nunca deixa "Cartão de Crédito" engolir "CC Nubank" / "Inter" / etc.
    if (!match && alvo.length >= 3 && !ehFormaGenerica(nome)) {
        const candidatos = lista.filter((r) => {
            const n = norm(r.nome);
            if (!n || ehFormaGenerica(r.nome))
                return false;
            if (n.includes(alvo) || alvo.includes(n))
                return true;
            return false;
        });
        match = candidatos.sort((a, b) => norm(b.nome).length - norm(a.nome).length)[0];
    }
    const analisar = (r) => {
        const ehCartaoNominal = !ehFormaGenerica(r.nome);
        const faltando = [];
        if (ehCartaoNominal) {
            if (r.limite == null)
                faltando.push("limite");
            if (r.dia_fechamento == null)
                faltando.push("dia de fechamento");
            if (r.dia_vencimento == null)
                faltando.push("dia de vencimento");
        }
        return { incompleto: faltando.length > 0, faltando };
    };
    if (match) {
        const a = analisar(match);
        return Object.assign({ id: match.id, nome: match.nome, criado: false }, a);
    }
    try {
        // Cartão nominal: dias padrão para já aparecer em Contas e Cartões / gerar fatura.
        // Limite fica incompleto até o usuário informar.
        const diaFech = 1;
        const diaVenc = 10;
        const ins = await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO formas_pagamento (nome, usuario_id, global, ativo, descricao, icone, cor, dia_fechamento, dia_vencimento)
      VALUES (${nome.trim()}, ${userId}, false, true, ${'Cartão'}, ${'💳'}, ${'#FF6B35'}, ${diaFech}, ${diaVenc})
      RETURNING id, nome, dia_fechamento, dia_vencimento, limite
    `);
        const created = ins[0];
        const a = analisar(created);
        return Object.assign({ id: created.id, nome: created.nome, criado: true }, a);
    }
    catch (_a) {
        const again = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT id, nome, dia_fechamento, dia_vencimento, limite FROM formas_pagamento
      WHERE lower(nome) = ${alvo} AND (usuario_id = ${userId} OR global = true)
      ORDER BY CASE WHEN usuario_id = ${userId} THEN 0 ELSE 1 END
      LIMIT 1
    `);
        const row = again[0];
        if (row) {
            const a = analisar(row);
            return Object.assign({ id: row.id, nome: row.nome, criado: false }, a);
        }
        return { id: 0, nome, criado: false, incompleto: false, faltando: [] };
    }
}
// Cria N parcelas de uma compra, agrupadas por compra_grupo (mesma compra).
// No cartão: cada parcela vai para a fatura da sua competência e não mexe no caixa.
async function criarCompraParcelada(params) {
    var _a, _b;
    const { walletId, categoriaId, descricao, parcelas, formaPagamentoId, dataInicio, contaBancariaId, usuarioId, status = "Efetivada", } = params;
    const { valoresParcelas, competenciaDaCompra, competenciaMaisMeses } = await Promise.resolve().then(() => __importStar(require("./services/fatura-core")));
    const total = params.valorTotal != null
        ? Number(params.valorTotal)
        : Number(params.valorParcela || 0) * parcelas;
    const valores = valoresParcelas(total, parcelas);
    const grupo = (0, crypto_1.randomUUID)();
    const [y, m, d] = dataInicio.split("-").map(Number);
    const ids = [];
    let cartao = null;
    if (formaPagamentoId && usuarioId) {
        const { cartaoPfDoUsuario } = await Promise.resolve().then(() => __importStar(require("./services/fatura-pf.service")));
        cartao = await cartaoPfDoUsuario(formaPagamentoId, usuarioId);
    }
    // A fatura da 1ª parcela é decidida UMA vez; as seguintes andam de mês em mês.
    // Antes cada parcela reaplicava a regra de fechamento sobre a data deslocada,
    // e no fim de mês duas parcelas caíam na mesma fatura.
    const competenciaBase = cartao
        ? (params.competenciaInicial && /^\d{4}-\d{2}$/.test(params.competenciaInicial)
            ? params.competenciaInicial
            : competenciaDaCompra(dataInicio, Number(cartao.dia_fechamento) || 1, Number(cartao.dia_vencimento) || 10).competencia)
        : null;
    for (let i = 0; i < parcelas; i++) {
        const mesTotal = (m - 1) + i;
        const ano = y + Math.floor(mesTotal / 12);
        const mes = (mesTotal % 12) + 1;
        const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        const dia = Math.min(d, ultimoDia);
        const dataISO = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const descParcela = parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao;
        const valorParcela = (_a = valores[i]) !== null && _a !== void 0 ? _a : 0;
        let faturaId = null;
        let competencia = null;
        let movimentaCaixa = true;
        let contaId = contaBancariaId !== null && contaBancariaId !== void 0 ? contaBancariaId : null;
        let statusParcela = status;
        if (cartao && usuarioId && competenciaBase) {
            const { resolverFaturaPfPorCompetencia } = await Promise.resolve().then(() => __importStar(require("./services/fatura-pf.service")));
            const { fatura, competencia: comp } = await resolverFaturaPfPorCompetencia(usuarioId, walletId, cartao, competenciaMaisMeses(competenciaBase, i));
            faturaId = fatura.id;
            competencia = comp;
            movimentaCaixa = false;
            contaId = null;
            statusParcela = "Pendente";
        }
        const res = await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO transacoes
        (carteira_id, categoria_id, forma_pagamento_id, tipo, valor, data_transacao, descricao, status,
         compra_grupo, parcela_num, parcela_total, conta_bancaria_id, fatura_id, competencia, movimenta_caixa)
      VALUES
        (${walletId}, ${categoriaId}, ${formaPagamentoId !== null && formaPagamentoId !== void 0 ? formaPagamentoId : null}, 'Despesa', ${valorParcela.toFixed(2)},
         ${dataISO}, ${descParcela}, ${statusParcela}, ${grupo}, ${i + 1}, ${parcelas},
         ${contaId}, ${faturaId}, ${competencia}, ${movimentaCaixa})
      RETURNING id
    `);
        ids.push(res[0].id);
    }
    return { compra_grupo: grupo, ids, parcelas, valor_parcela: (_b = valores[0]) !== null && _b !== void 0 ? _b : 0 };
}
/** Parcelamento PJ — cada parcela no cartão vai para a fatura da competência. */
async function criarCompraParceladaPj(params) {
    var _a, _b;
    const { empresaId, userId, categoriaId, descricao, parcelas, dataInicio, cartaoId, contaBancariaId, status = "Efetivada", origem = "manual", } = params;
    const { valoresParcelas, competenciaDaCompra, competenciaMaisMeses } = await Promise.resolve().then(() => __importStar(require("./services/fatura-core")));
    const valores = valoresParcelas(Number(params.valorTotal) || 0, parcelas);
    const grupo = (0, crypto_1.randomUUID)();
    const [y, m, d] = dataInicio.split("-").map(Number);
    const ids = [];
    let cartao = null;
    if (cartaoId) {
        const { cartaoDoUsuario } = await Promise.resolve().then(() => __importStar(require("./services/fatura-pj.service")));
        cartao = await cartaoDoUsuario(cartaoId, userId);
        if (!cartao || cartao.empresa_id !== empresaId) {
            throw new Error("Cartão não encontrado nesta empresa.");
        }
    }
    // Mesma âncora do PF: competência da 1ª parcela + i meses.
    const competenciaBase = cartao
        ? (params.competenciaInicial && /^\d{4}-\d{2}$/.test(params.competenciaInicial)
            ? params.competenciaInicial
            : competenciaDaCompra(dataInicio, Number(cartao.dia_fechamento) || 1, Number(cartao.dia_vencimento) || 10).competencia)
        : null;
    for (let i = 0; i < parcelas; i++) {
        const mesTotal = (m - 1) + i;
        const ano = y + Math.floor(mesTotal / 12);
        const mes = (mesTotal % 12) + 1;
        const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        const dia = Math.min(d, ultimoDia);
        const dataISO = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const descParcela = parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao;
        const valorParcela = (_a = valores[i]) !== null && _a !== void 0 ? _a : 0;
        let faturaId = null;
        let competencia = null;
        let movimentaCaixa = true;
        let contaId = contaBancariaId !== null && contaBancariaId !== void 0 ? contaBancariaId : null;
        let cartaoFinal = null;
        let metodo = null;
        let statusParcela = status;
        if (cartao && competenciaBase) {
            const { resolverFaturaPorCompetencia } = await Promise.resolve().then(() => __importStar(require("./services/fatura-pj.service")));
            const r = await resolverFaturaPorCompetencia(empresaId, cartao, competenciaMaisMeses(competenciaBase, i));
            faturaId = r.fatura.id;
            competencia = r.competencia;
            metodo = r.metodo;
            movimentaCaixa = false;
            contaId = null;
            cartaoFinal = cartao.id;
            statusParcela = "Efetivada";
        }
        else if (contaId) {
            const contas = await getContasBancariasByEmpresa(empresaId);
            const c = contas.find((x) => x.id === contaId);
            metodo = c ? (c.nome || c.banco || "Conta") : null;
        }
        // Vencimento: mesma lógica de mês da parcela (boletos parcelados).
        let dataVenc = null;
        if (params.dataVencimentoBase && /^\d{4}-\d{2}-\d{2}/.test(params.dataVencimentoBase)) {
            const [vy, vm, vd] = params.dataVencimentoBase.slice(0, 10).split("-").map(Number);
            const mesV = (vm - 1) + i;
            const anoV = vy + Math.floor(mesV / 12);
            const mesVV = (mesV % 12) + 1;
            const ultV = new Date(Date.UTC(anoV, mesVV, 0)).getUTCDate();
            dataVenc = `${anoV}-${String(mesVV).padStart(2, "0")}-${String(Math.min(vd, ultV)).padStart(2, "0")}`;
        }
        else if (!cartao) {
            dataVenc = dataISO;
        }
        const res = await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO empresas_transacoes
        (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem,
         compra_grupo, parcela_num, parcela_total, conta_bancaria_id, cartao_id, fatura_id,
         competencia, movimenta_caixa, metodo_pagamento, data_vencimento)
      VALUES
        (${empresaId}, ${categoriaId}, ${descParcela}, ${valorParcela.toFixed(2)}, 'Despesa', ${dataISO},
         ${statusParcela}, ${origem}, ${grupo}, ${i + 1}, ${parcelas}, ${contaId}, ${cartaoFinal},
         ${faturaId}, ${competencia}, ${movimentaCaixa}, ${metodo}, ${dataVenc})
      RETURNING id
    `);
        ids.push(res[0].id);
    }
    return { compra_grupo: grupo, ids, parcelas, valor_parcela: (_b = valores[0]) !== null && _b !== void 0 ? _b : 0 };
}
// Identifica a "última compra" da carteira: pega a transação mais recente e
// agrupa por compra_grupo (se houver) ou pela mesma descrição-base + data de
// registro (cobre compras antigas sem grupo).
async function getUltimaCompra(walletId) {
    const ult = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, descricao, compra_grupo, data_registro
    FROM transacoes WHERE carteira_id = ${walletId}
    ORDER BY id DESC LIMIT 1
  `);
    const u = ult[0];
    if (!u)
        return null;
    let rows;
    if (u.compra_grupo) {
        rows = (await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT id, valor FROM transacoes WHERE carteira_id = ${walletId} AND compra_grupo = ${u.compra_grupo}
    `));
    }
    else {
        // remove sufixo "(i/N)" para casar todas as parcelas da mesma compra
        const base = (u.descricao || "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
        rows = (await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT id, valor FROM transacoes
      WHERE carteira_id = ${walletId}
        AND regexp_replace(descricao, '\\s*\\(\\d+/\\d+\\)\\s*$', '') = ${base}
        AND data_registro::date = ${new Date(u.data_registro).toISOString().slice(0, 10)}
    `));
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
async function editarTransacoesPorIds(ids, patch) {
    if (!ids.length)
        return 0;
    let n = 0;
    for (const id of ids) {
        const sets = [];
        if (patch.forma_pagamento_id != null)
            sets.push((0, drizzle_orm_1.sql) `forma_pagamento_id = ${patch.forma_pagamento_id}`);
        if (patch.categoria_id != null)
            sets.push((0, drizzle_orm_1.sql) `categoria_id = ${patch.categoria_id}`);
        if (patch.descricao_base != null) {
            // preserva o sufixo (i/N) se existir
            sets.push((0, drizzle_orm_1.sql) `descricao = ${patch.descricao_base} || COALESCE(substring(descricao from '\\s*\\(\\d+/\\d+\\)\\s*$'), '')`);
        }
        if (!sets.length)
            continue;
        let setClause = sets[0];
        for (let i = 1; i < sets.length; i++)
            setClause = (0, drizzle_orm_1.sql) `${setClause}, ${sets[i]}`;
        await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE transacoes SET ${setClause} WHERE id = ${id}`);
        n++;
    }
    return n;
}
// Status do orçamento (limite_categoria) de UMA categoria no mês atual.
// Usado para avisar o percentual logo após um gasto. null = sem limite definido.
async function getStatusOrcamentoCategoria(userId, walletId, categoriaId) {
    var _a, _b;
    try {
        const metaRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT valor_alvo FROM metas_financeiras
      WHERE usuario_id = ${userId} AND tipo = 'limite_categoria' AND ativo = true AND categoria_id = ${categoriaId}
      LIMIT 1
    `);
        const meta = metaRows[0];
        if (!meta)
            return null;
        const limite = parseFloat(meta.valor_alvo) || 0;
        if (limite <= 0)
            return null;
        const now = new Date();
        const de = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const ate = now.toISOString().slice(0, 10);
        const gRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT COALESCE(SUM(valor::numeric), 0) AS total FROM transacoes
      WHERE carteira_id = ${walletId} AND categoria_id = ${categoriaId} AND tipo = 'Despesa'
        AND COALESCE(reembolsavel, false) = false
        AND data_transacao >= ${de} AND data_transacao <= ${ate}
    `);
        const gasto = parseFloat((_a = gRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const pct = (gasto / limite) * 100;
        const catRows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT nome FROM categorias WHERE id = ${categoriaId} LIMIT 1`);
        const catNome = ((_b = catRows[0]) === null || _b === void 0 ? void 0 : _b.nome) || "";
        let status = "ok";
        if (pct >= 100)
            status = "estourado";
        else if (pct >= 80)
            status = "atencao";
        return {
            categoria: catNome,
            limite: Math.round(limite * 100) / 100,
            gasto: Math.round(gasto * 100) / 100,
            percentual: Math.round(pct * 10) / 10,
            status,
        };
    }
    catch (err) {
        console.error("[Orçamento] falha ao calcular status:", err === null || err === void 0 ? void 0 : err.message);
        return null;
    }
}
// Versão PJ do aviso de orçamento na hora: dado um lançamento de despesa numa
// conta do plano de contas da empresa, verifica se existe meta 'limite_categoria'
// (empresa_id + conta_id) e retorna o status do mês. conta_id null na meta =
// limite do TOTAL de despesas da empresa (soma tudo).
async function getStatusOrcamentoContaPJ(empresaId, contaId) {
    var _a, _b;
    try {
        const metaRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT valor_alvo, conta_id FROM metas_financeiras
      WHERE empresa_id = ${empresaId} AND tipo = 'limite_categoria' AND ativo = true
        AND (conta_id = ${contaId} OR conta_id IS NULL)
      ORDER BY conta_id NULLS LAST
      LIMIT 1
    `);
        const meta = metaRows[0];
        if (!meta)
            return null;
        const limite = parseFloat(meta.valor_alvo) || 0;
        if (limite <= 0)
            return null;
        const now = new Date();
        const de = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const ate = now.toISOString().slice(0, 10);
        // Se a meta é de uma conta específica, soma só ela; se é geral, soma tudo.
        const metaContaId = meta.conta_id;
        const gRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT COALESCE(SUM(valor::numeric), 0) AS total FROM empresas_transacoes
      WHERE empresa_id = ${empresaId} AND tipo = 'Despesa' AND status = 'Efetivada'
        AND (${metaContaId}::int IS NULL OR categoria_id = ${metaContaId})
        AND data_transacao >= ${de} AND data_transacao <= ${ate}
    `);
        const gasto = parseFloat((_a = gRows[0]) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const pct = (gasto / limite) * 100;
        const cRows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT nome FROM empresas_contas WHERE id = ${contaId} LIMIT 1`);
        const contaNome = metaContaId ? (((_b = cRows[0]) === null || _b === void 0 ? void 0 : _b.nome) || "") : "Despesas da empresa";
        let status = "ok";
        if (pct >= 100)
            status = "estourado";
        else if (pct >= 80)
            status = "atencao";
        return {
            categoria: contaNome,
            limite: Math.round(limite * 100) / 100,
            gasto: Math.round(gasto * 100) / 100,
            percentual: Math.round(pct * 10) / 10,
            status,
        };
    }
    catch (err) {
        console.error("[Orçamento PJ] falha ao calcular status:", err === null || err === void 0 ? void 0 : err.message);
        return null;
    }
}
// ============================================
// Isolamento + Soft delete (lixeira/undo) + Backup por usuário
// ============================================
// Confirma que a transação pertence à carteira do usuário (isolamento).
async function transacaoPertenceAoWallet(transacaoId, walletId) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM transacoes WHERE id = ${transacaoId} AND carteira_id = ${walletId} LIMIT 1`);
    return rows.length > 0;
}
// Confirma que a transação PJ pertence à empresa (isolamento PJ).
async function empresaTransacaoPertenceAEmpresa(transacaoId, empresaId) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM empresas_transacoes WHERE id = ${transacaoId} AND empresa_id = ${empresaId} LIMIT 1`);
    return rows.length > 0;
}
// Teto de candidatos devolvidos: o suficiente para o usuário escolher pelo
// código no WhatsApp sem virar uma parede de texto.
const LIMITE_CANDIDATOS = 8;
// "era 80" pode ser 79,90 no lançamento — casa por aproximação, não por igualdade.
const TOLERANCIA_VALOR = 0.05;
// Monta as condições comuns às buscas PF e PJ. 'alias' é o prefixo da tabela.
function condicoesBusca(filtro, alias) {
    const cond = [];
    const col = (c) => drizzle_orm_1.sql.raw(`${alias}.${c}`);
    if (filtro.descricao) {
        // Casa por qualquer palavra relevante: "mercado de ontem" acha "Compras
        // Supermercado". Se sobrar mais de um, o fluxo de desambiguação assume.
        const termos = filtro.descricao
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 3);
        const alvos = termos.length > 0 ? termos : [filtro.descricao];
        cond.push(drizzle_orm_1.sql.join(alvos.map((t) => (0, drizzle_orm_1.sql) `${col('descricao')} ILIKE ${'%' + t + '%'}`), (0, drizzle_orm_1.sql) ` OR `));
    }
    if (typeof filtro.valor === "number" && !isNaN(filtro.valor)) {
        const margem = Math.max(Math.abs(filtro.valor) * TOLERANCIA_VALOR, 0.01);
        cond.push((0, drizzle_orm_1.sql) `ABS(${col('valor')}::numeric - ${filtro.valor}) <= ${margem}`);
    }
    if (filtro.data_inicio)
        cond.push((0, drizzle_orm_1.sql) `${col('data_transacao')} >= ${filtro.data_inicio}`);
    if (filtro.data_fim)
        cond.push((0, drizzle_orm_1.sql) `${col('data_transacao')} <= ${filtro.data_fim}`);
    if (filtro.tipo)
        cond.push((0, drizzle_orm_1.sql) `${col('tipo')} = ${filtro.tipo}`);
    return cond;
}
// PF — busca restrita à carteira do usuário (nunca vaza transação de outro).
async function buscarTransacoesPorFiltro(walletId, filtro) {
    const cond = [(0, drizzle_orm_1.sql) `t.carteira_id = ${walletId}`, ...condicoesBusca(filtro, "t")];
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.descricao, t.valor::float8 AS valor, t.data_transacao::text AS data,
           t.tipo, c.nome AS categoria
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE ${drizzle_orm_1.sql.join(cond.map((c) => (0, drizzle_orm_1.sql) `(${c})`), (0, drizzle_orm_1.sql) ` AND `)}
    ORDER BY t.data_transacao DESC, t.id DESC
    LIMIT ${LIMITE_CANDIDATOS}
  `);
    return rows;
}
// PJ — busca restrita à empresa (nunca vaza transação de outra empresa nem do PF).
async function buscarEmpresaTransacoesPorFiltro(empresaId, filtro) {
    const cond = [(0, drizzle_orm_1.sql) `t.empresa_id = ${empresaId}`, ...condicoesBusca(filtro, "t")];
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.descricao, t.valor::float8 AS valor, t.data_transacao::text AS data,
           t.tipo, (c.codigo || ' — ' || c.nome) AS categoria
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE ${drizzle_orm_1.sql.join(cond.map((c) => (0, drizzle_orm_1.sql) `(${c})`), (0, drizzle_orm_1.sql) ` AND `)}
    ORDER BY t.data_transacao DESC, t.id DESC
    LIMIT ${LIMITE_CANDIDATOS}
  `);
    return rows;
}
// Quantos meses ao redor da competência olhamos para dizer "está lançado, mas
// na fatura errada" em vez de simplesmente "não achei".
const MESES_VIZINHOS_FATURA = 4;
function normalizarTexto(s) {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
}
function tokensDescricao(s) {
    return normalizarTexto(s).split(/\s+/).filter((t) => t.length >= 3);
}
// Aqui a tolerância é MUITO menor que a da busca por filtro (5%): conferir
// fatura é justamente achar diferença de valor. 5% deixaria 175 passar por
// 180,50 como se conferisse. Só centavos de arredondamento são tolerados.
const TOLERANCIA_CONFERENCIA = 0.001;
function valorCasa(a, b) {
    const margem = Math.max(Math.abs(a) * TOLERANCIA_CONFERENCIA, 0.02);
    return Math.abs(a - b) <= margem;
}
function descricaoCasa(informada, lancada) {
    const alvo = normalizarTexto(lancada);
    const termos = tokensDescricao(informada);
    if (termos.length === 0)
        return alvo.includes(normalizarTexto(informada));
    return termos.some((t) => alvo.includes(t));
}
/**
 * Confere uma lista de itens ditados pelo usuário contra os lançamentos do
 * cartão na competência. Não altera nada — só compara e classifica.
 */
async function conferirFaturaCartao(walletId, cartaoId, itens, mes, ano) {
    const cartaoRows = await db_1.db.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, cartaoId)).limit(1);
    const cartao = cartaoRows[0];
    if (!cartao)
        throw new Error("Cartão não encontrado");
    const { inicio, fim } = janelaFatura(cartao.dia_fechamento || 1, mes, ano);
    // Janela alargada: serve só para dizer em que outra fatura o lançamento está.
    const desloca = (iso, meses) => {
        const [a, m, d] = iso.split("-").map(Number);
        const dt = new Date(a, m - 1 + meses, d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const inicioAmplo = desloca(inicio, -MESES_VIZINHOS_FATURA);
    const fimAmplo = desloca(fim, MESES_VIZINHOS_FATURA);
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.descricao, t.valor::float8 AS valor, t.data_transacao::text AS data,
           t.tipo, c.nome AS categoria
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE t.carteira_id = ${walletId}
      AND t.forma_pagamento_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND t.data_transacao >= ${inicioAmplo}
      AND t.data_transacao < ${fimAmplo}
    ORDER BY t.data_transacao ASC, t.id ASC
  `);
    const todos = rows;
    const naFatura = todos.filter((t) => t.data >= inicio && t.data < fim);
    const foraDaFatura = todos.filter((t) => t.data < inicio || t.data >= fim);
    // Um lançamento só pode confirmar UM item ditado — senão dois itens iguais na
    // fatura seriam ambos dados como conferidos pelo mesmo lançamento.
    const usados = new Set();
    const conferidos = [];
    for (const item of itens) {
        const valor = Number(item.valor);
        const livres = naFatura.filter((t) => !usados.has(t.id));
        const casamPleno = livres.filter((t) => valorCasa(valor, t.valor) && descricaoCasa(item.descricao, t.descricao));
        if (casamPleno.length === 1) {
            usados.add(casamPleno[0].id);
            conferidos.push({ informado: item, status: "confere", lancamentos: casamPleno });
            continue;
        }
        if (casamPleno.length > 1) {
            casamPleno.forEach((t) => usados.add(t.id));
            conferidos.push({
                informado: item,
                status: "duplicado",
                lancamentos: casamPleno,
                observacao: `A fatura tem 1 item, mas há ${casamPleno.length} lançamentos iguais na competência.`,
            });
            continue;
        }
        const soDescricao = livres.filter((t) => descricaoCasa(item.descricao, t.descricao));
        if (soDescricao.length > 0) {
            // Descrição batendo com um único lançamento é o mesmo item com valor
            // errado — consome, senão ele reapareceria em 'nao_informados'. Com
            // descrição casando em vários, não consome nada: o usuário escolhe.
            if (soDescricao.length === 1)
                usados.add(soDescricao[0].id);
            conferidos.push({
                informado: item,
                status: "valor_divergente",
                lancamentos: soDescricao,
                observacao: "Achei a descrição na competência, mas com outro valor.",
            });
            continue;
        }
        const soValor = livres.filter((t) => valorCasa(valor, t.valor));
        if (soValor.length > 0) {
            conferidos.push({
                informado: item,
                status: "descricao_divergente",
                lancamentos: soValor,
                observacao: "Achei o valor na competência, mas com outra descrição.",
            });
            continue;
        }
        const vizinhos = foraDaFatura.filter((t) => valorCasa(valor, t.valor) && descricaoCasa(item.descricao, t.descricao));
        if (vizinhos.length > 0) {
            conferidos.push({
                informado: item,
                status: "outra_competencia",
                lancamentos: vizinhos,
                observacao: "Está lançado no cartão, mas fora do período desta fatura.",
            });
            continue;
        }
        conferidos.push({ informado: item, status: "nao_encontrado", lancamentos: [] });
    }
    const naoInformados = naFatura.filter((t) => !usados.has(t.id));
    const totalLancado = naFatura.reduce((s, t) => s + (Number(t.valor) || 0), 0);
    const totalInformado = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
    const cent = (n) => Math.round(n * 100) / 100;
    return {
        cartao: cartao.nome,
        periodo_de: inicio,
        periodo_ate: fim,
        total_lancado: cent(totalLancado),
        total_informado: cent(totalInformado),
        diferenca: cent(totalLancado - totalInformado),
        itens: conferidos,
        nao_informados: naoInformados,
    };
}
// Soft delete: move a transação para a lixeira (mantém 30 dias) e remove da tabela.
// Só afeta transação da PRÓPRIA carteira (nunca de outro usuário).
async function softDeleteTransacao(transacaoId, walletId, userId) {
    const dono = await transacaoPertenceAoWallet(transacaoId, walletId);
    if (!dono)
        return false;
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO transacoes_lixeira (usuario_id, carteira_id, transacao_id, dados)
    SELECT ${userId}, carteira_id, id, to_jsonb(t) FROM transacoes t WHERE id = ${transacaoId} AND carteira_id = ${walletId}
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM transacoes WHERE id = ${transacaoId} AND carteira_id = ${walletId}`);
    return true;
}
// Move TODAS as transações da carteira para a lixeira. Retorna a quantidade.
async function softDeleteTodasTransacoes(walletId, userId) {
    var _a;
    const cnt = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT COUNT(*)::int AS n FROM transacoes WHERE carteira_id = ${walletId}`);
    const n = ((_a = cnt[0]) === null || _a === void 0 ? void 0 : _a.n) || 0;
    if (n === 0)
        return 0;
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO transacoes_lixeira (usuario_id, carteira_id, transacao_id, dados)
    SELECT ${userId}, carteira_id, id, to_jsonb(t) FROM transacoes t WHERE carteira_id = ${walletId}
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM transacoes WHERE carteira_id = ${walletId}`);
    return n;
}
// Restaura a última transação excluída da carteira (arrependimento).
async function restaurarUltimaExcluida(walletId) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, dados FROM transacoes_lixeira WHERE carteira_id = ${walletId}
    ORDER BY excluida_em DESC LIMIT 1
  `);
    const item = rows[0];
    if (!item)
        return { restaurada: false };
    // Reconstrói a linha original a partir do JSON e reinsere.
    await db_1.db.execute((0, drizzle_orm_1.sql) `INSERT INTO transacoes SELECT (jsonb_populate_record(NULL::transacoes, ${item.dados}::jsonb)).*`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM transacoes_lixeira WHERE id = ${item.id}`);
    const desc = (item.dados && (item.dados.descricao || item.dados["descricao"])) || undefined;
    return { restaurada: true, descricao: desc };
}
// Backup: lista os itens na lixeira do usuário (para conferência/recuperação).
async function listarLixeira(walletId, limit = 50) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, transacao_id, dados, excluida_em FROM transacoes_lixeira
    WHERE carteira_id = ${walletId} ORDER BY excluida_em DESC LIMIT ${Math.min(limit, 200)}
  `);
    return rows;
}
// Limpa a lixeira antiga (>30 dias). Chamado no boot / periodicamente.
async function limparLixeiraAntiga() {
    try {
        await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM transacoes_lixeira WHERE excluida_em < (CURRENT_DATE - INTERVAL '30 days')`);
    }
    catch (err) {
        console.error("[Lixeira] falha ao limpar antigas:", err === null || err === void 0 ? void 0 : err.message);
    }
}
// Cadastra OU atualiza um cartão pelo nome (evita erro de nome duplicado).
// Nunca reaproveita o global "Cartão de Crédito" — cartão nominal é sempre do usuário.
async function cadastrarOuAtualizarCartao(userId, data) {
    var _a, _b, _c, _d, _e, _f;
    const nomeLimpo = (data.nome || "").trim();
    if (!nomeLimpo) {
        throw new Error("Nome do cartão é obrigatório");
    }
    // Se alguém mandar o genérico, NÃO cria cartão nominal — devolve a forma global.
    if (ehFormaGenerica(nomeLimpo)) {
        const gen = await resolveOuCriaFormaPagamento(userId, nomeLimpo);
        return { id: gen.id, nome: gen.nome, atualizado: false };
    }
    const alvo = nomeLimpo.toLowerCase();
    // Defaults: se só veio vencimento, fecha 5 dias antes (mín. 1).
    let diaVenc = data.dia_vencimento != null ? Number(data.dia_vencimento) : null;
    let diaFech = data.dia_fechamento != null ? Number(data.dia_fechamento) : null;
    if (diaVenc != null && !(diaVenc >= 1 && diaVenc <= 31))
        diaVenc = null;
    if (diaFech != null && !(diaFech >= 1 && diaFech <= 31))
        diaFech = null;
    if (diaVenc != null && diaFech == null) {
        diaFech = Math.max(1, diaVenc - 5);
    }
    // Só cartões DO USUÁRIO (nunca atualiza o global genérico)
    const existentes = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, nome FROM formas_pagamento
    WHERE lower(nome) = ${alvo} AND usuario_id = ${userId}
    LIMIT 1
  `);
    const ex = existentes[0];
    if (ex) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE formas_pagamento SET
        limite = COALESCE(${(_a = data.limite) !== null && _a !== void 0 ? _a : null}, limite),
        dia_fechamento = COALESCE(${diaFech}, dia_fechamento),
        dia_vencimento = COALESCE(${diaVenc}, dia_vencimento),
        bandeira = COALESCE(${(_b = data.bandeira) !== null && _b !== void 0 ? _b : null}, bandeira),
        ultimos_digitos = COALESCE(${(_c = data.ultimos_digitos) !== null && _c !== void 0 ? _c : null}, ultimos_digitos),
        ativo = true
      WHERE id = ${ex.id}
    `);
        return { id: ex.id, nome: ex.nome, atualizado: true };
    }
    const ins = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO formas_pagamento (nome, descricao, icone, cor, usuario_id, global, ativo, limite, dia_fechamento, dia_vencimento, bandeira, ultimos_digitos)
    VALUES (${nomeLimpo}, ${'Cartão'}, ${'💳'}, ${'#FF6B35'}, ${userId}, false, true,
            ${(_d = data.limite) !== null && _d !== void 0 ? _d : null}, ${diaFech}, ${diaVenc}, ${(_e = data.bandeira) !== null && _e !== void 0 ? _e : null}, ${(_f = data.ultimos_digitos) !== null && _f !== void 0 ? _f : null})
    RETURNING id, nome
  `);
    const created = ins[0];
    return { id: created.id, nome: created.nome, atualizado: false };
}
// ============================================
// Cérebro coletivo (memória global agregada) — PF
// ============================================
// Agrega a memória PESSOAL de todos (que participam do coletivo) em regras
// GLOBAIS anônimas. Só promove comerciante→categoria com >= minUsuarios
// usuários DISTINTOS (k-anonimato). Grava apenas o agregado (sem usuario_id).
async function agregarMemoriaGlobalPF(minUsuarios = 5) {
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
        for (const r of rows) {
            await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    }
    catch (err) {
        console.error("[MemóriaGlobal] falha na agregação:", err === null || err === void 0 ? void 0 : err.message);
        return 0;
    }
}
// Resolve um texto contra o cérebro global do escopo (pf/pj). Só devolve o
// consenso da multidão — nunca dado de indivíduo.
async function resolveMemoriaGlobal(escopo, texto) {
    const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const alvo = norm(texto);
    if (!alvo)
        return undefined;
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT chave, resposta, votos FROM memoria_global WHERE escopo = ${escopo}`);
        let melhor;
        for (const r of rows) {
            const k = norm(r.chave);
            if (k && (alvo.includes(k) || k.includes(alvo))) {
                if (!melhor || k.length > norm(melhor.chave).length)
                    melhor = r;
            }
        }
        return melhor ? { categoria_nome: melhor.resposta, votos: melhor.votos } : undefined;
    }
    catch (err) {
        console.error("[MemóriaGlobal] falha ao resolver:", err === null || err === void 0 ? void 0 : err.message);
        return undefined;
    }
}
// ============================================
// Consentimento LGPD (registro de aceite)
// ============================================
exports.LGPD_VERSAO_ATUAL = "1.0";
async function jaConsentiuLgpd(userId, versao = exports.LGPD_VERSAO_ATUAL) {
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM consentimentos_lgpd WHERE usuario_id = ${userId} AND versao = ${versao} LIMIT 1`);
        return rows.length > 0;
    }
    catch (_a) {
        return false;
    }
}
async function registrarConsentimentoLgpd(userId, versao, ip, userAgent) {
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO consentimentos_lgpd (usuario_id, versao, ip, user_agent)
    VALUES (${userId}, ${versao}, ${ip !== null && ip !== void 0 ? ip : null}, ${(userAgent || "").slice(0, 400) || null})
  `);
}
async function listarConsentimentosLgpd(opts = {}) {
    var _a, _b;
    const limit = Math.min((_a = opts.limit) !== null && _a !== void 0 ? _a : 200, 1000);
    const offset = (_b = opts.offset) !== null && _b !== void 0 ? _b : 0;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT c.id, c.usuario_id, u.nome, u.email, c.versao, c.aceito_em, c.ip, c.user_agent
    FROM consentimentos_lgpd c
    JOIN usuarios u ON u.id = c.usuario_id
    ORDER BY c.aceito_em DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
    return rows;
}
// ============================================
// Conciliação bancária — Contas bancárias
// ============================================
async function createContaBancaria(data) {
    var _a, _b, _c, _d, _e;
    const banco = String(data.banco || data.nome || "").trim();
    const nome = String(data.nome || data.banco || "").trim() || banco;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO contas_bancarias (empresa_id, usuario_id, banco, nome, agencia, numero, tipo, saldo_inicial, ativo)
    VALUES (${data.empresa_id}, ${(_a = data.usuario_id) !== null && _a !== void 0 ? _a : null}, ${banco}, ${nome}, ${(_b = data.agencia) !== null && _b !== void 0 ? _b : null},
            ${(_c = data.numero) !== null && _c !== void 0 ? _c : null}, ${(_d = data.tipo) !== null && _d !== void 0 ? _d : 'corrente'}, ${Number((_e = data.saldo_inicial) !== null && _e !== void 0 ? _e : 0).toFixed(2)}, true)
    RETURNING *
  `);
    return r[0];
}
async function getContasBancariasByEmpresa(empresaId) {
    return (await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM contas_bancarias WHERE empresa_id = ${empresaId} ORDER BY banco`));
}
async function getContaBancariaById(id) {
    return (await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM contas_bancarias WHERE id = ${id} LIMIT 1`))[0];
}
async function updateContaBancaria(id, data) {
    var _a, _b, _c, _d, _e, _f;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE contas_bancarias SET
      banco = COALESCE(${(_a = data.banco) !== null && _a !== void 0 ? _a : null}, banco),
      nome = COALESCE(${(_b = data.nome) !== null && _b !== void 0 ? _b : null}, nome),
      agencia = COALESCE(${(_c = data.agencia) !== null && _c !== void 0 ? _c : null}, agencia),
      numero = COALESCE(${(_d = data.numero) !== null && _d !== void 0 ? _d : null}, numero),
      tipo = COALESCE(${(_e = data.tipo) !== null && _e !== void 0 ? _e : null}, tipo),
      saldo_inicial = COALESCE(${data.saldo_inicial != null ? Number(data.saldo_inicial).toFixed(2) : null}, saldo_inicial),
      ativo = COALESCE(${(_f = data.ativo) !== null && _f !== void 0 ? _f : null}, ativo)
    WHERE id = ${id} RETURNING *
  `);
    return r[0];
}
async function deleteContaBancaria(id) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM contas_bancarias WHERE id = ${id} RETURNING id`);
    return r.length > 0;
}
// Saldo do sistema para a conta = saldo_inicial + Σ(Receita) − Σ(Despesa) das
// transações vinculadas àquela conta bancária.
async function getSaldoSistemaConta(contaBancariaId) {
    var _a;
    const conta = await getContaBancariaById(contaBancariaId);
    if (!conta)
        return 0;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE -valor::numeric END), 0) AS mov
    FROM empresas_transacoes WHERE conta_bancaria_id = ${contaBancariaId}
  `);
    const mov = parseFloat(((_a = r[0]) === null || _a === void 0 ? void 0 : _a.mov) || "0") || 0;
    return Math.round((parseFloat(conta.saldo_inicial) + mov) * 100) / 100;
}
// ============================================
// Conciliação — Importação e movimentos
// ============================================
async function getUltimoSaldoInformado(contaBancariaId) {
    var _a;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT saldo_final_informado FROM importacoes_extrato
    WHERE conta_bancaria_id = ${contaBancariaId} AND saldo_final_informado IS NOT NULL
    ORDER BY criado_em DESC LIMIT 1
  `);
    const v = (_a = r[0]) === null || _a === void 0 ? void 0 : _a.saldo_final_informado;
    return v != null ? parseFloat(v) : null;
}
async function hashExtratoJaImportado(contaBancariaId, hash) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM importacoes_extrato WHERE conta_bancaria_id = ${contaBancariaId} AND hash_arquivo = ${hash} LIMIT 1`);
    return r.length > 0;
}
async function criarImportacao(data) {
    var _a, _b, _c, _d, _e, _f;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO importacoes_extrato (empresa_id, conta_bancaria_id, arquivo_nome, formato, periodo_de, periodo_ate, saldo_final_informado, hash_arquivo, status)
    VALUES (${data.empresa_id}, ${data.conta_bancaria_id}, ${(_a = data.arquivo_nome) !== null && _a !== void 0 ? _a : null}, ${(_b = data.formato) !== null && _b !== void 0 ? _b : 'ofx'},
            ${(_c = data.periodo_de) !== null && _c !== void 0 ? _c : null}, ${(_d = data.periodo_ate) !== null && _d !== void 0 ? _d : null}, ${(_e = data.saldo_final_informado) !== null && _e !== void 0 ? _e : null}, ${(_f = data.hash_arquivo) !== null && _f !== void 0 ? _f : null}, 'revisao')
    RETURNING *
  `);
    return r[0];
}
// Insere um movimento; se o FITID já existe naquela conta, ignora (dedup).
async function criarExtratoMovimento(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO extrato_movimentos
      (importacao_id, conta_bancaria_id, empresa_id, fitid, data, valor, tipo, descricao, memo, status,
       transacao_id, conta_contabil_id, sugestao_conta_id, sugestao_origem, sugestao_confianca)
    VALUES (${data.importacao_id}, ${data.conta_bancaria_id}, ${data.empresa_id}, ${(_a = data.fitid) !== null && _a !== void 0 ? _a : null},
            ${data.data}, ${Number(data.valor).toFixed(2)}, ${data.tipo}, ${(_b = data.descricao) !== null && _b !== void 0 ? _b : null}, ${(_c = data.memo) !== null && _c !== void 0 ? _c : null},
            ${(_d = data.status) !== null && _d !== void 0 ? _d : 'pendente'}, ${(_e = data.transacao_id) !== null && _e !== void 0 ? _e : null}, ${(_f = data.conta_contabil_id) !== null && _f !== void 0 ? _f : null},
            ${(_g = data.sugestao_conta_id) !== null && _g !== void 0 ? _g : null}, ${(_h = data.sugestao_origem) !== null && _h !== void 0 ? _h : null}, ${(_j = data.sugestao_confianca) !== null && _j !== void 0 ? _j : null})
    ON CONFLICT (conta_bancaria_id, fitid) DO NOTHING
    RETURNING *
  `);
    return r[0] || null;
}
async function getMovimentos(opts = {}) {
    const conds = [];
    if (opts.importacaoId)
        conds.push((0, drizzle_orm_1.sql) `importacao_id = ${opts.importacaoId}`);
    if (opts.contaBancariaId)
        conds.push((0, drizzle_orm_1.sql) `conta_bancaria_id = ${opts.contaBancariaId}`);
    if (opts.status)
        conds.push((0, drizzle_orm_1.sql) `status = ${opts.status}`);
    let where = (0, drizzle_orm_1.sql) ``;
    if (conds.length) {
        where = (0, drizzle_orm_1.sql) `WHERE ${conds[0]}`;
        for (let i = 1; i < conds.length; i++)
            where = (0, drizzle_orm_1.sql) `${where} AND ${conds[i]}`;
    }
    return (await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM extrato_movimentos ${where} ORDER BY data DESC, id DESC`));
}
async function getMovimentoById(id) {
    return (await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM extrato_movimentos WHERE id = ${id} LIMIT 1`))[0];
}
async function updateMovimento(id, patch) {
    const sets = [];
    if (patch.status !== undefined)
        sets.push((0, drizzle_orm_1.sql) `status = ${patch.status}`);
    if (patch.transacao_id !== undefined)
        sets.push((0, drizzle_orm_1.sql) `transacao_id = ${patch.transacao_id}`);
    if (patch.conta_contabil_id !== undefined)
        sets.push((0, drizzle_orm_1.sql) `conta_contabil_id = ${patch.conta_contabil_id}`);
    if (!sets.length)
        return getMovimentoById(id);
    let setClause = sets[0];
    for (let i = 1; i < sets.length; i++)
        setClause = (0, drizzle_orm_1.sql) `${setClause}, ${sets[i]}`;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE extrato_movimentos SET ${setClause} WHERE id = ${id} RETURNING *`);
    return r[0];
}
// Casamento determinístico: transação PJ não conciliada, mesmo valor absoluto,
// MESMO sentido (crédito↔Receita, débito↔Despesa) e data dentro de ±tolDias.
// O sentido evita casar um crédito de +100 com uma despesa de 100.
async function buscarCandidatosConciliacao(empresaId, valor, data, tolDias = 3) {
    const abs = Math.abs(valor).toFixed(2);
    const tipoEsperado = valor >= 0 ? "Receita" : "Despesa";
    return (await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, descricao, valor, tipo, data_transacao
    FROM empresas_transacoes
    WHERE empresa_id = ${empresaId}
      AND conciliado = false
      AND LOWER(tipo) = LOWER(${tipoEsperado})
      AND ABS(valor::numeric) = ${abs}
      AND data_transacao BETWEEN (${data}::date - ${tolDias} * INTERVAL '1 day') AND (${data}::date + ${tolDias} * INTERVAL '1 day')
    ORDER BY ABS(data_transacao - ${data}::date) ASC
    LIMIT 5
  `));
}
// ============================================
// Memória de classificação PJ (descrição bancária -> conta contábil)
// ============================================
async function resolveMemoriaContaPJ(userId, texto) {
    const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const alvo = norm(texto);
    if (!alvo)
        return undefined;
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT chave, valor FROM memoria_usuario WHERE usuario_id = ${userId} AND tipo = 'merchant_conta_pj'`);
        let melhor;
        for (const r of rows) {
            const k = norm(r.chave);
            if (k && (alvo.includes(k) || k.includes(alvo))) {
                if (!melhor || k.length > norm(melhor.chave).length)
                    melhor = r;
            }
        }
        if (!melhor)
            return undefined;
        const v = typeof melhor.valor === "string" ? JSON.parse(melhor.valor) : melhor.valor;
        return (v === null || v === void 0 ? void 0 : v.conta_contabil_id) ? { conta_contabil_id: Number(v.conta_contabil_id), nome: v.nome } : undefined;
    }
    catch (_a) {
        return undefined;
    }
}
async function aprenderMemoriaContaPJ(userId, chave, contaContabilId, nome) {
    const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const chaveNorm = norm(chave);
    if (!chaveNorm)
        return;
    try {
        const valor = JSON.stringify({ conta_contabil_id: contaContabilId, nome });
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO memoria_usuario (usuario_id, tipo, chave, valor)
      VALUES (${userId}, 'merchant_conta_pj', ${chaveNorm}, ${valor}::jsonb)
      ON CONFLICT (usuario_id, tipo, chave)
      DO UPDATE SET valor = ${valor}::jsonb, hits = memoria_usuario.hits + 1, updated_at = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    `);
    }
    catch (err) {
        console.error("[MemóriaPJ] falha ao aprender:", err === null || err === void 0 ? void 0 : err.message);
    }
}
// Concilia um movimento a uma transação PJ existente (marca ambos).
async function conciliarMovimentoComTransacao(movId, txId) {
    await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE extrato_movimentos SET status = 'conciliado', transacao_id = ${txId} WHERE id = ${movId}`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE empresas_transacoes SET conciliado = true WHERE id = ${txId}`);
}
// Lança um movimento como nova transação PJ na conta contábil escolhida,
// já conciliada e ligada à conta bancária. Retorna a transação criada.
async function lancarMovimentoComoTransacao(mov, contaContabilId) {
    var _a;
    const tipo = Number(mov.valor) >= 0 ? "Receita" : "Despesa";
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, conta_bancaria_id, conciliado, fitid)
    VALUES (${mov.empresa_id}, ${contaContabilId}, ${mov.descricao || 'Movimento bancário'},
            ${Math.abs(Number(mov.valor)).toFixed(2)}, ${tipo}, ${mov.data}, 'Efetivada', 'conciliacao',
            ${mov.conta_bancaria_id}, true, ${(_a = mov.fitid) !== null && _a !== void 0 ? _a : null})
    RETURNING *
  `);
    const tx = r[0];
    await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE extrato_movimentos SET status = 'lancado', transacao_id = ${tx.id}, conta_contabil_id = ${contaContabilId} WHERE id = ${mov.id}`);
    return tx;
}
// ============================================
// Soft-delete PJ (lixeira + undo) — Parte 2 do plano
// Reutiliza `transacoes_lixeira` com empresa_id (coluna opcional).
// ============================================
// Confirma que a transação PJ pertence à empresa.
async function transacaoPjPertenceAEmpresa(transacaoId, empresaId) {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM empresas_transacoes WHERE id = ${transacaoId} AND empresa_id = ${empresaId} LIMIT 1`);
    return rows.length > 0;
}
// Soft-delete PJ: move para lixeira, remove da tabela principal.
async function softDeleteEmpresaTransacao(transacaoId, empresaId, userId) {
    const dono = await transacaoPjPertenceAEmpresa(transacaoId, empresaId);
    if (!dono)
        return false;
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO transacoes_lixeira (usuario_id, empresa_id, transacao_id, dados)
    SELECT ${userId}, ${empresaId}, id, to_jsonb(t) FROM empresas_transacoes t WHERE id = ${transacaoId} AND empresa_id = ${empresaId}
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM empresas_transacoes WHERE id = ${transacaoId} AND empresa_id = ${empresaId}`);
    return true;
}
// Restaurar última transação PJ excluída da empresa.
async function restaurarUltimaExcluidaPJ(empresaId) {
    var _a;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, dados FROM transacoes_lixeira WHERE empresa_id = ${empresaId}
    ORDER BY excluida_em DESC LIMIT 1
  `);
    const item = rows[0];
    if (!item)
        return { restaurada: false };
    await db_1.db.execute((0, drizzle_orm_1.sql) `INSERT INTO empresas_transacoes SELECT (jsonb_populate_record(NULL::empresas_transacoes, ${item.dados}::jsonb)).*`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM transacoes_lixeira WHERE id = ${item.id}`);
    const desc = ((_a = item.dados) === null || _a === void 0 ? void 0 : _a.descricao) || undefined;
    return { restaurada: true, descricao: desc };
}
// Listar lixeira PJ para uma empresa.
async function listarLixeiraPJ(empresaId, limit = 50) {
    return (await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, transacao_id, dados, excluida_em FROM transacoes_lixeira
    WHERE empresa_id = ${empresaId} ORDER BY excluida_em DESC LIMIT ${Math.min(limit, 200)}
  `));
}
