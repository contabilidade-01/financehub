import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Transaction, TransactionStatus, TransactionType } from "@shared/schema";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight as ArrowRightIcon } from "lucide-react";
import { ArrowUpIcon, ArrowDownIcon, ArrowRightFromLine, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTranslation } from "@/contexts/LocalizationContext";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionForm } from "@/components/shared/TransactionForm";

interface RecentTransactionsProps {
  isLoading: boolean;
  transactions?: Transaction[];
  onRefetch: () => void;
}

export default function RecentTransactions({ isLoading, transactions, onRefetch }: RecentTransactionsProps) {
  const [, navigate] = useLocation();
  const [transactionFilter, setTransactionFilter] = useState<"all" | "income" | "expense">("all");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const { toast } = useToast();
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  // WebSocket para atualizações em tempo real
  const { isConnected } = useWebSocket();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
    };

    if (openMenuId !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);
  
  const filteredTransactions = transactions?.filter(transaction => {
    if (transactionFilter === "all") return true;
    if (transactionFilter === "income") return transaction.tipo === TransactionType.INCOME;
    if (transactionFilter === "expense") return transaction.tipo === TransactionType.EXPENSE;
    return true;
  }).slice(0, 5);
  
  const handleDeleteTransaction = async (id: number) => {
    try {
      await apiRequest(`/api/transactions/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      onRefetch();
      toast({
        title: t('transactions.transaction_deleted', 'Transação excluída'),
        description: t('transactions.delete_success', 'A transação foi excluída com sucesso.'),
      });
      setDeletingTransaction(null);
    } catch (error) {
      toast({
        title: t('transactions.error', 'Erro'),
        description: t('transactions.delete_error', 'Não foi possível excluir a transação.'),
        variant: "destructive",
      });
    }
  };
  
  const getCategoryDisplay = (transaction: Transaction) => (
    <span className={`px-2 py-1 rounded-lg ${
      transaction.tipo === TransactionType.INCOME ? 'bg-green-500/10 text-green-400' : 'bg-primary/10 text-primary'
    } text-xs`}>
      {t('transactions.table.category', 'Categoria')}
    </span>
  );
  
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case TransactionStatus.COMPLETED:
        return <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">{t('transactions.filters.completed', 'Efetivada')}</span>;
      case TransactionStatus.PENDING:
        return <span className="px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs">{t('transactions.filters.pending', 'Pendente')}</span>;
      case TransactionStatus.SCHEDULED:
        return <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs">{t('transactions.filters.scheduled', 'Agendada')}</span>;
      case TransactionStatus.CANCELED:
        return <span className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs">{t('transactions.filters.cancelled', 'Cancelada')}</span>;
      default:
        return <span className="px-2 py-1 rounded-lg bg-gray-500/10 text-gray-400 text-xs">{status}</span>;
    }
  };
  
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card className={`neon-border rounded-2xl ${theme === 'light' ? 'bg-white' : 'glass-card'}`}>
        <CardContent className={`p-5 ${theme === 'light' ? 'text-gray-900' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h2 className="font-space text-xl mb-3 md:mb-0">{t('dashboard.recent_transactions.title', 'Transações Recentes')}</h2>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm"
                variant={transactionFilter === "all" ? "default" : "outline"}
                className={transactionFilter === "all" ? "bg-primary/20" : ""}
                onClick={() => setTransactionFilter("all")}
              >
                {t('dashboard.recent_transactions.all', 'Todas')}
              </Button>
              <Button 
                size="sm"
                variant={transactionFilter === "income" ? "default" : "outline"}
                className={transactionFilter === "income" ? "bg-green-500/20 text-green-400" : "text-gray-400 hover:text-green-400"}
                onClick={() => setTransactionFilter("income")}
              >
                <ArrowUpIcon className="h-4 w-4 mr-1" />
                {t('dashboard.recent_transactions.income', 'Receitas')}
              </Button>
              <Button 
                size="sm"
                variant={transactionFilter === "expense" ? "default" : "outline"}
                className={transactionFilter === "expense" ? "bg-red-500/20 text-red-400" : "text-gray-400 hover:text-red-400"}
                onClick={() => setTransactionFilter("expense")}
              >
                <ArrowDownIcon className="h-4 w-4 mr-1" />
                {t('dashboard.recent_transactions.expenses', 'Despesas')}
              </Button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className={`w-full min-w-[640px] ${theme === 'light' ? 'bg-white' : ''}`}>
              <thead>
                <tr>
                  <th className={`text-left pb-4 text-xs font-orbitron tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{t('transactions.table.description', 'DESCRIÇÃO')}</th>
                  <th className={`text-left pb-4 text-xs font-orbitron tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{t('transactions.table.category', 'CATEGORIA')}</th>
                  <th className={`text-left pb-4 text-xs font-orbitron tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{t('transactions.table.date', 'DATA')}</th>
                  <th className={`text-left pb-4 text-xs font-orbitron tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{t('transactions.table.value', 'VALOR')}</th>
                  <th className={`text-left pb-4 text-xs font-orbitron tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{t('transactions.table.status', 'STATUS')}</th>
                  <th className={`text-right pb-4 text-xs font-orbitron tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{t('transactions.table.actions', 'AÇÕES')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array(5).fill(0).map((_, index) => (
                    <tr key={index} className="border-t border-white/5">
                      <td className="py-4 pr-4">
                        <div className="flex items-center">
                          <Skeleton className="w-8 h-8 rounded-full mr-3" />
                          <div>
                            <Skeleton className="h-4 w-24 mb-1" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </td>
                      <td className="py-4"><Skeleton className="h-6 w-16 rounded-lg" /></td>
                      <td className="py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-4"><Skeleton className="h-6 w-16 rounded-lg" /></td>
                      <td className="py-4 text-right"><Skeleton className="h-8 w-8 rounded-lg ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredTransactions?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-400">
                      {t('transactions.table.no_transactions', 'Nenhuma transação encontrada')}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions?.map((transaction) => (
                    <tr key={transaction.id} className={`transition-colors cursor-pointer border-t ${theme === 'light' ? 'border-gray-100 hover:bg-primary/10' : 'border-white/5 hover:bg-primary/5'}` }>
                      <td className="py-4 pr-4">
                        <div className="flex items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${transaction.tipo === TransactionType.INCOME
                            ? theme === 'light' ? 'bg-green-100' : 'bg-green-500/20'
                            : theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'}`}>
                            {transaction.tipo === TransactionType.INCOME ? (
                              <ArrowUpIcon className={`h-4 w-4 ${theme === 'light' ? 'text-green-600' : 'text-green-500'}`} />
                            ) : (
                              <ArrowDownIcon className={`h-4 w-4 ${theme === 'light' ? 'text-red-600' : 'text-red-500'}`} />
                            )}
                          </div>
                          <div>
                            <div className={`font-medium ${theme === 'light' ? 'text-gray-900' : ''}`}>{transaction.descricao}</div>
                            <div className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{transaction.metodo_pagamento}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        {getCategoryDisplay(transaction)}
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        <span className={theme === 'light' ? 'text-gray-500' : 'text-gray-400'}>{formatDate(transaction.data_transacao)}</span>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        <span className={`${transaction.tipo === TransactionType.INCOME
                          ? theme === 'light' ? 'text-green-600' : 'text-green-400'
                          : theme === 'light' ? 'text-red-600' : 'text-red-400'} font-orbitron`}>
                          {transaction.tipo === TransactionType.INCOME ? '+ ' : '- '}
                          {formatCurrency(Number(transaction.valor))}
                        </span>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        {getStatusDisplay(transaction.status)}
                      </td>
                      <td className="py-4 whitespace-nowrap text-right">
                        <div className="relative">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === transaction.id ? null : transaction.id);
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                          
                          {openMenuId === transaction.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div 
                                className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-600 rounded-md shadow-lg z-50"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setEditingTransaction(transaction);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center w-full px-3 py-2 text-sm text-white hover:bg-slate-700 rounded-t-md"
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  <span>{t('transactions.edit_transaction', 'Editar')}</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setDeletingTransaction(transaction);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex items-center w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700 rounded-b-md"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span>{t('transactions.delete_transaction', 'Excluir')}</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="flex justify-center mt-6">
            <Button 
              variant="outline" 
              onClick={() => navigate("/transactions")}
              className="bg-dark-purple/20 hover:bg-dark-purple/40 text-primary hover:text-white"
            >
              <span>{t('dashboard.recent_transactions.view_more', 'Ver mais transações')}</span>
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent className="glass-card sm:max-w-[600px]">
          <TransactionForm 
            transaction={editingTransaction}
            onSuccess={() => {
              setEditingTransaction(null);
              onRefetch();
              queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
              toast({
                title: t('transactions.transaction_updated', 'Transação atualizada'),
                description: t('transactions.update_success', 'A transação foi atualizada com sucesso.'),
              });
            }}
          />
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingTransaction} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.delete_transaction', 'Excluir transação')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.confirm_delete', 'Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingTransaction && handleDeleteTransaction(deletingTransaction.id)}
              className="bg-destructive"
            >
              {t('common.delete', 'Excluir')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  );
}
