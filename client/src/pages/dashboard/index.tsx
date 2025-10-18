import { useQuery, useQueryClient } from "@tanstack/react-query";
import WalletSummary from "@/components/dashboard/WalletSummary";
import FinancialOverview from "@/components/dashboard/FinancialOverview";
import CategorySummary from "@/components/dashboard/CategorySummary";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import AdminStatsWidget from "@/components/admin/AdminStatsWidget";
import { TransactionForm } from "@/components/shared/TransactionForm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PlusIcon, RefreshCw } from "lucide-react";
import { Transaction, User } from "@shared/schema";

export default function Dashboard() {
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: userData } = useQuery<User>({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
  });
  
  const { data: walletData, isLoading: isWalletLoading, refetch: refetchWallet } = useQuery<{
    id: number;
    saldo_atual: number;
    nome: string;
  }>({
    queryKey: ["/api/wallet/current"],
    staleTime: 0,
    gcTime: 0
  });
  
  const { data: transactionsData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/recent"]
  });
  
  const { data: summaryData, isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery<{
    totalExpenses: number;
    totalIncome: number;
    expensesByCategory: Array<{
      categoryId: number;
      name: string;
      total: number;
      color: string;
      icon: string;
      percentage: number;
    }>;
    monthlyData: Array<{
      month: string;
      income: number;
      expense: number;
    }>;
  }>({
    queryKey: ["/api/dashboard/summary"]
  });
  
  const refreshData = () => {
    refetchWallet();
    refetchTransactions();
    refetchSummary();
    queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
    toast({
      title: t('dashboard.data_updated', 'Dados atualizados'),
      description: t('dashboard.data_updated_desc', 'Os dados financeiros foram atualizados com sucesso'),
      variant: "default",
    });
  };
  
  return (
    <>
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 md:mb-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-1">{t('dashboard.title', 'Dashboard Financeiro')}</h1>
            <p className="text-gray-400">{t('dashboard.subtitle', 'Acompanhe e gerencie suas finanças')}</p>
          </div>
          <div className="flex space-x-3">
            <Button 
              onClick={() => setIsTransactionFormOpen(true)}
              className="neon-border"
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              {t('dashboard.new_transaction', 'Nova Transação')}
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={refreshData}
              title={t('dashboard.refresh_data', 'Atualizar dados')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      
      <div className="space-y-8">
        <WalletSummary 
          isWalletLoading={isWalletLoading}
          isSummaryLoading={isSummaryLoading}
          walletData={walletData} 
          summaryData={summaryData}
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <FinancialOverview 
              isLoading={isSummaryLoading} 
              chartData={summaryData?.monthlyData} 
            />
          </div>
          <div>
            <CategorySummary 
              isLoading={isSummaryLoading} 
              categories={summaryData?.expensesByCategory}
            />
          </div>
        </div>
        
        <RecentTransactions 
          isLoading={isTransactionsLoading} 
          transactions={transactionsData}
          onRefetch={refetchTransactions}
        />
      </div>
      
      <Dialog open={isTransactionFormOpen} onOpenChange={setIsTransactionFormOpen}>
        <DialogContent className="glass-card sm:max-w-[600px]">
          <TransactionForm 
            onSuccess={() => {
              setIsTransactionFormOpen(false);
              refreshData();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
