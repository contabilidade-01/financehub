import { useState, useEffect } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Transaction, TransactionStatus, TransactionType } from "@shared/schema";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
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
        description: t('transactions.delete_success_undo', 'Foi para a lixeira. Você pode desfazer por 30 dias.'),
        action: (
          <ToastAction
            altText="Desfazer"
            onClick={async () => {
              try {
                await apiRequest("/api/transactions/lixeira/restaurar", { method: "POST" });
                queryClient.invalidateQueries({ queryKey: ["/api/transactions/recent"] });
                queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
                onRefetch();
                toast({ title: "Transação restaurada" });
              } catch {
                toast({ title: "Não foi possível restaurar", variant: "destructive" });
              }
            }}
          >
            Desfazer
          </ToastAction>
        ),
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
      transaction.tipo === TransactionType.INCOME ? 'bg-green-500/10 text-income' : 'bg-primary/10 text-primary'
    } text-xs`}>
      {t('transactions.table.category', 'Categoria')}
    </span>
  );
  
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case TransactionStatus.COMPLETED:
        return <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-income text-xs">{t('transactions.filters.completed', 'Efetivada')}</span>;
      case TransactionStatus.PENDING:
        return <span className="px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs">{t('transactions.filters.pending', 'Pendente')}</span>;
      case TransactionStatus.SCHEDULED:
        return <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs">{t('transactions.filters.scheduled', 'Agendada')}</span>;
      case TransactionStatus.CANCELED:
        return <span className="px-2 py-1 rounded-lg bg-red-500/10 text-expense text-xs">{t('transactions.filters.cancelled', 'Cancelada')}</span>;
      default:
        return <span className="px-2 py-1 rounded-lg bg-gray-500/10 text-muted-foreground text-xs">{status}</span>;
    }
  };
  
  // Menu de ações (editar / excluir) — Radix DropdownMenu: teclado, Esc e foco corretos.
  const renderAcoes = (transaction: Transaction) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('transactions.table.actions', 'Ações')}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => setEditingTransaction(transaction)}>
          <Pencil className="h-4 w-4" />
          <span>{t('transactions.edit_transaction', 'Editar')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDeletingTransaction(transaction)} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" />
          <span>{t('transactions.delete_transaction', 'Excluir')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card className={` rounded-lg bg-card`}>
        <CardContent className="p-4 text-foreground md:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h2 className="text-base font-semibold mb-3 md:mb-0">{t('dashboard.recent_transactions.title', 'Transações Recentes')}</h2>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm"
                variant="outline"
                className={transactionFilter === "all" ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground"}
                onClick={() => setTransactionFilter("all")}
              >
                {t('dashboard.recent_transactions.all', 'Todas')}
              </Button>
              <Button 
                size="sm"
                variant="outline"
                className={transactionFilter === "income" ? "border-income/40 bg-income/10 text-income hover:bg-income/15 hover:text-income" : "text-muted-foreground"}
                onClick={() => setTransactionFilter("income")}
              >
                <ArrowUpIcon className="h-4 w-4 mr-1" />
                {t('dashboard.recent_transactions.income', 'Receitas')}
              </Button>
              <Button 
                size="sm"
                variant="outline"
                className={transactionFilter === "expense" ? "border-expense/40 bg-expense/10 text-expense hover:bg-expense/15 hover:text-expense" : "text-muted-foreground"}
                onClick={() => setTransactionFilter("expense")}
              >
                <ArrowDownIcon className="h-4 w-4 mr-1" />
                {t('dashboard.recent_transactions.expenses', 'Despesas')}
              </Button>
            </div>
          </div>
          
          {/* Mobile: lista compacta */}
          <ul className="divide-y md:hidden">
            {isLoading ? (
              Array(4).fill(0).map((_, index) => (
                <li key={index} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="mb-1 h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </li>
              ))
            ) : filteredTransactions?.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">
                {t('transactions.table.no_transactions', 'Nenhuma transação encontrada')}
              </li>
            ) : (
              filteredTransactions?.map((transaction) => (
                <li key={transaction.id} className="flex items-center gap-3 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${transaction.tipo === TransactionType.INCOME ? "bg-income/10" : "bg-expense/10"}`}>
                    {transaction.tipo === TransactionType.INCOME ? (
                      <ArrowUpIcon className="h-4 w-4 text-income" />
                    ) : (
                      <ArrowDownIcon className="h-4 w-4 text-expense" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{transaction.descricao}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(transaction.data_transacao)}
                      {transaction.metodo_pagamento ? ` · ${transaction.metodo_pagamento}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${transaction.tipo === TransactionType.INCOME ? "text-income" : "text-expense"}`}>
                    {transaction.tipo === TransactionType.INCOME ? '+ ' : '− '}
                    {formatCurrency(Number(transaction.valor))}
                  </span>
                  <div className="-mr-2 shrink-0">{renderAcoes(transaction)}</div>
                </li>
              ))
            )}
          </ul>

          {/* md+: tabela */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`text-left pb-4 text-xs font-label text-muted-foreground`}>{t('transactions.table.description', 'DESCRIÇÃO')}</th>
                  <th className={`text-left pb-4 text-xs font-label text-muted-foreground`}>{t('transactions.table.category', 'CATEGORIA')}</th>
                  <th className={`text-left pb-4 text-xs font-label text-muted-foreground`}>{t('transactions.table.date', 'DATA')}</th>
                  <th className={`text-left pb-4 text-xs font-label text-muted-foreground`}>{t('transactions.table.value', 'VALOR')}</th>
                  <th className={`text-left pb-4 text-xs font-label text-muted-foreground`}>{t('transactions.table.status', 'STATUS')}</th>
                  <th className={`text-right pb-4 text-xs font-label text-muted-foreground`}>{t('transactions.table.actions', 'AÇÕES')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array(5).fill(0).map((_, index) => (
                    <tr key={index} className="border-t border-border">
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
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      {t('transactions.table.no_transactions', 'Nenhuma transação encontrada')}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions?.map((transaction) => (
                    <tr key={transaction.id} className="border-t border-border transition-colors hover:bg-muted/40">
                      <td className="py-4 pr-4">
                        <div className="flex items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${transaction.tipo === TransactionType.INCOME
                            ? "bg-income/10"
                            : "bg-expense/10"}`}>
                            {transaction.tipo === TransactionType.INCOME ? (
                              <ArrowUpIcon className={`h-4 w-4 text-income`} />
                            ) : (
                              <ArrowDownIcon className={`h-4 w-4 text-expense`} />
                            )}
                          </div>
                          <div>
                            <div className={`font-medium text-foreground`}>{transaction.descricao}</div>
                            <div className={`text-xs text-muted-foreground`}>{transaction.metodo_pagamento}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        {getCategoryDisplay(transaction)}
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        <span className="text-muted-foreground">{formatDate(transaction.data_transacao)}</span>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        <span className={`${transaction.tipo === TransactionType.INCOME
                          ? "text-income"
                          : "text-expense"} font-numeric`}>
                          {transaction.tipo === TransactionType.INCOME ? '+ ' : '- '}
                          {formatCurrency(Number(transaction.valor))}
                        </span>
                      </td>
                      <td className="py-4 whitespace-nowrap">
                        {getStatusDisplay(transaction.status)}
                      </td>
                      <td className="py-4 whitespace-nowrap text-right">
                        {renderAcoes(transaction)}
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
            >
              <span>{t('dashboard.recent_transactions.view_more', 'Ver mais transações')}</span>
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent className="border bg-card sm:max-w-[600px]">
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
        <AlertDialogContent className="border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.delete_transaction', 'Excluir transação')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.confirm_delete', 'Tem certeza que deseja excluir esta transação? Ela vai para a lixeira e pode ser restaurada por 30 dias.')}
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
