import { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { transactions, wallets, users } from "../../shared/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";

interface AnalyticsData {
  userGrowth: Array<{ month: string; users: number; activeUsers: number }>;
  transactionVolume: Array<{ month: string; transactions: number; volume: number }>;
  userStatusDistribution: Array<{ name: string; count: number; color: string }>;
  walletDistribution: Array<{ range: string; count: number }>;
  recentActivity: Array<{ date: string; users: number; transactions: number }>;
  monthlyTransactionTrends: Array<{ month: string; income: number; expenses: number }>;
}

export class AnalyticsController {
  static async getAnalyticsData(req: Request, res: Response) {
    try {
      console.log("=== ANALYTICS DATA - REQUEST ===");
      console.log(`Admin: ${req.user?.email} (${req.user?.tipo_usuario})`);
      console.log("============================");

      // Verificar se é super admin
      if (req.user?.tipo_usuario !== 'super_admin') {
        return res.status(403).json({ error: "Acesso negado: requer privilégios de super administrador" });
      }

      // Buscar todos os usuários
      const allUsers = await storage.getAllUsers();
      
      // Buscar todas as transações
      const allTransactions = await db.select({
        id: transactions.id,
        valor: transactions.valor,
        tipo: transactions.tipo,
        data_transacao: transactions.data_transacao,
        usuario_id: wallets.usuario_id
      })
      .from(transactions)
      .innerJoin(wallets, eq(transactions.carteira_id, wallets.id));

      // Buscar apenas carteiras vinculadas a usuários existentes
      const allWallets = await db.select({
        id: wallets.id,
        usuario_id: wallets.usuario_id,
        saldo_atual: wallets.saldo_atual
      })
      .from(wallets)
      .innerJoin(users, eq(wallets.usuario_id, users.id));

      // Gerar dados de crescimento de usuários (últimos 6 meses)
      const currentDate = new Date();
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const userGrowth = [];
      
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthName = months[date.getMonth()];
        
        // Contar usuários criados até esta data
        const usersUntilDate = allUsers.filter(user => {
          if (!user.data_cadastro) return false;
          const userDate = typeof user.data_cadastro === 'string' ? new Date(user.data_cadastro) : user.data_cadastro;
          return userDate <= date;
        }).length;
        
        const activeUsersUntilDate = allUsers.filter(user => {
          if (!user.data_cadastro) return false;
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
      const walletBalances = new Map<number, number>();

      // Inicializar todas as carteiras com saldo 0
      allWallets.forEach(wallet => {
        walletBalances.set(wallet.id, 0);
      });

      // Buscar transações por carteira para calcular saldo real
      const transactionsByWallet = await db.select({
        carteira_id: transactions.carteira_id,
        tipo: transactions.tipo,
        valor: transactions.valor
      }).from(transactions);

      // Calcular saldo real de cada carteira
      transactionsByWallet.forEach(t => {
        const currentBalance = walletBalances.get(t.carteira_id) || 0;
        const valor = parseFloat(t.valor);
        if (t.tipo === 'Receita') {
          walletBalances.set(t.carteira_id, currentBalance + valor);
        } else if (t.tipo === 'Despesa') {
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
        } else if (saldo <= 5000) {
          walletDistribution[1].count++;
        } else {
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
        const activeUsersInDay = new Set(
          allTransactions.filter(t => {
            const transactionDate = new Date(t.data_transacao);
            return transactionDate >= dayStart && transactionDate < dayEnd;
          }).map(t => t.usuario_id).filter(id => id !== null)
        ).size;

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

      const analyticsData: AnalyticsData = {
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
    } catch (error) {
      console.error('Erro ao buscar dados analíticos:', error);
      res.status(500).json({ error: 'Erro interno do servidor ao buscar dados analíticos' });
    }
  }
}