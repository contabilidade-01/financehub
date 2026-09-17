"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const storage_1 = require("../storage");
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
class AnalyticsController {
    static async getAnalyticsData(req, res) {
        var _a, _b, _c;
        try {
            console.log("=== ANALYTICS DATA - REQUEST ===");
            console.log(`Admin: ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.email} (${(_b = req.user) === null || _b === void 0 ? void 0 : _b.tipo_usuario})`);
            console.log("============================");
            // Verificar se é super admin
            if (((_c = req.user) === null || _c === void 0 ? void 0 : _c.tipo_usuario) !== 'super_admin') {
                return res.status(403).json({ error: "Acesso negado: requer privilégios de super administrador" });
            }
            // Buscar todos os usuários
            const allUsers = await storage_1.storage.getAllUsers();
            // Buscar todas as transações
            const allTransactions = await db_1.db.select({
                id: schema_1.transactions.id,
                valor: schema_1.transactions.valor,
                tipo: schema_1.transactions.tipo,
                data_transacao: schema_1.transactions.data_transacao,
                usuario_id: schema_1.wallets.usuario_id
            })
                .from(schema_1.transactions)
                .innerJoin(schema_1.wallets, (0, drizzle_orm_1.eq)(schema_1.transactions.carteira_id, schema_1.wallets.id));
            // Buscar apenas carteiras vinculadas a usuários existentes
            const allWallets = await db_1.db.select({
                id: schema_1.wallets.id,
                usuario_id: schema_1.wallets.usuario_id,
                saldo_atual: schema_1.wallets.saldo_atual
            })
                .from(schema_1.wallets)
                .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.wallets.usuario_id, schema_1.users.id));
            // Gerar dados de crescimento de usuários (últimos 6 meses)
            const currentDate = new Date();
            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            const userGrowth = [];
            for (let i = 5; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const monthName = months[date.getMonth()];
                // Contar usuários criados até esta data
                const usersUntilDate = allUsers.filter(user => {
                    if (!user.data_cadastro)
                        return false;
                    const userDate = typeof user.data_cadastro === 'string' ? new Date(user.data_cadastro) : user.data_cadastro;
                    return userDate <= date;
                }).length;
                const activeUsersUntilDate = allUsers.filter(user => {
                    if (!user.data_cadastro)
                        return false;
                    const userDate = typeof user.data_cadastro === 'string' ? new Date(user.data_cadastro) : user.data_cadastro;
                    return userDate <= date && user.ativo;
                }).length;
                userGrowth.push({
                    month: monthName,
                    users: usersUntilDate,
                    activeUsers: activeUsersUntilDate
                });
            }
            // Gerar dados de volume de transações por mês
            const transactionVolume = [];
            for (let i = 5; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i + 1, 1);
                const monthName = months[date.getMonth()];
                const monthTransactions = allTransactions.filter(t => {
                    const transactionDate = new Date(t.data_transacao);
                    return transactionDate >= date && transactionDate < nextMonth;
                });
                const totalVolume = monthTransactions.reduce((sum, t) => {
                    return sum + parseFloat(t.valor);
                }, 0);
                transactionVolume.push({
                    month: monthName,
                    transactions: monthTransactions.length,
                    volume: Math.round(totalVolume)
                });
            }
            // Distribuição de status dos usuários
            const activeUsers = allUsers.filter(u => u.ativo && !u.data_cancelamento).length;
            const canceledUsers = allUsers.filter(u => u.data_cancelamento).length;
            const inactiveUsers = allUsers.filter(u => !u.ativo && !u.data_cancelamento).length;
            const userStatusDistribution = [
                { name: 'Usuários Ativos', count: activeUsers, color: '#3B82F6' },
                { name: 'Usuários Cancelados', count: canceledUsers, color: '#EF4444' },
                { name: 'Usuários Inativos', count: inactiveUsers, color: '#8B5CF6' }
            ];
            // Distribuição de carteiras por faixa de saldo
            // Calcular saldo real de cada carteira baseado nas transações
            const walletBalances = new Map();
            // Inicializar todas as carteiras com saldo 0
            allWallets.forEach(wallet => {
                walletBalances.set(wallet.id, 0);
            });
            // Buscar transações por carteira para calcular saldo real
            const transactionsByWallet = await db_1.db.select({
                carteira_id: schema_1.transactions.carteira_id,
                tipo: schema_1.transactions.tipo,
                valor: schema_1.transactions.valor
            }).from(schema_1.transactions);
            // Calcular saldo real de cada carteira
            transactionsByWallet.forEach(t => {
                const currentBalance = walletBalances.get(t.carteira_id) || 0;
                const valor = parseFloat(t.valor);
                if (t.tipo === 'Receita') {
                    walletBalances.set(t.carteira_id, currentBalance + valor);
                }
                else if (t.tipo === 'Despesa') {
                    walletBalances.set(t.carteira_id, currentBalance - valor);
                }
            });
            const walletDistribution = [
                { range: 'R$ 0 - 1.000', count: 0 },
                { range: 'R$ 1.000 - 5.000', count: 0 },
                { range: 'R$ 5.000+', count: 0 }
            ];
            allWallets.forEach(wallet => {
                const saldo = walletBalances.get(wallet.id) || 0;
                if (saldo <= 1000) {
                    walletDistribution[0].count++;
                }
                else if (saldo <= 5000) {
                    walletDistribution[1].count++;
                }
                else {
                    walletDistribution[2].count++;
                }
            });
            // Atividade recente (últimos 7 dias)
            const recentActivity = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
                const dayTransactions = allTransactions.filter(t => {
                    const transactionDate = new Date(t.data_transacao);
                    return transactionDate >= dayStart && transactionDate < dayEnd;
                }).length;
                // Usuários ativos no dia (simplificado - usuários que fizeram transações)
                const activeUsersInDay = new Set(allTransactions.filter(t => {
                    const transactionDate = new Date(t.data_transacao);
                    return transactionDate >= dayStart && transactionDate < dayEnd;
                }).map(t => t.usuario_id).filter(id => id !== null)).size;
                recentActivity.push({
                    date: dateStr,
                    users: activeUsersInDay,
                    transactions: dayTransactions
                });
            }
            // Tendências mensais de receitas vs despesas
            const monthlyTransactionTrends = [];
            for (let i = 5; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i + 1, 1);
                const monthName = months[date.getMonth()];
                const monthTransactions = allTransactions.filter(t => {
                    const transactionDate = new Date(t.data_transacao);
                    return transactionDate >= date && transactionDate < nextMonth;
                });
                const income = monthTransactions
                    .filter(t => t.tipo === 'Receita')
                    .reduce((sum, t) => sum + parseFloat(t.valor), 0);
                const expenses = monthTransactions
                    .filter(t => t.tipo === 'Despesa')
                    .reduce((sum, t) => sum + parseFloat(t.valor), 0);
                monthlyTransactionTrends.push({
                    month: monthName,
                    income: Math.round(income),
                    expenses: Math.round(expenses)
                });
            }
            const analyticsData = {
                userGrowth,
                transactionVolume,
                userStatusDistribution,
                walletDistribution,
                recentActivity,
                monthlyTransactionTrends
            };
            console.log("=== ANALYTICS DATA - RESPONSE ===");
            console.log("Dados analíticos calculados com base nos dados reais do banco");
            console.log("============================");
            res.json(analyticsData);
        }
        catch (error) {
            console.error('Erro ao buscar dados analíticos:', error);
            res.status(500).json({ error: 'Erro interno do servidor ao buscar dados analíticos' });
        }
    }
}
exports.AnalyticsController = AnalyticsController;
