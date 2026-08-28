import { useQuery, useQueryClient } from "@tanstack/react-query";
import WalletSummary from "@/components/dashboard/WalletSummary";
import FinancialOverview from "@/components/dashboard/FinancialOverview";
import CategorySummary from "@/components/dashboard/CategorySummary";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import { TransactionForm } from "@/components/shared/TransactionForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PlusIcon, RefreshCw } from "lucide-react";
import { Transaction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import {
  Periodo,
  dataRefTransacao,
  dentroDoPeriodo,
  rangeDoPeriodo,
  rotuloPeriodo,
} from "@/lib/period";

export default function Dashboard() {
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<Periodo>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const range = rangeDoPeriodo(periodFilter, customFrom, customTo);
  const periodReady = periodFilter !== "custom" || Boolean(range.de && range.ate);
  const periodLabel = rotuloPeriodo(periodFilter, range.de, range.ate);

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
    queryKey: ["/api/transactions"]
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
    queryKey: ["/api/dashboard/summary", periodFilter, range.de, range.ate],
    enabled: periodReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.de && range.ate) {
        params.set("from", range.de);
        params.set("to", range.ate);
      } else {
        params.set("period", "all");
      }
      return apiRequest(`/api/dashboard/summary?${params.toString()}`);
    },
  });

  const transacoesDoPeriodo = (transactionsData ?? []).filter((tx) =>
    dentroDoPeriodo(dataRefTransacao(tx), range.de, range.ate),
  );
  
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

  const pills: { id: Periodo; label: string }[] = [
    { id: "current_month", label: t('transactions.filters.current_month', 'Mês atual') },
    { id: "next_month", label: t('transactions.filters.next_month', 'Próximo mês') },
    { id: "custom", label: t('transactions.filters.custom_period', 'Personalizado') },
    { id: "all", label: t('transactions.filters.all_periods', 'Todo o período') },
  ];
  
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

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={periodFilter === p.id ? "default" : "outline"}
                onClick={() => setPeriodFilter(p.id)}
                className={periodFilter === p.id ? "bg-primary/20" : ""}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {periodFilter === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{t('transactions.filters.date_from', 'De')}</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{t('transactions.filters.date_to', 'Até')}</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
              </div>
            </div>
          )}
        </div>
      </header>
      
      <div className="space-y-8">
        <WalletSummary 
          isWalletLoading={isWalletLoading}
          isSummaryLoading={isSummaryLoading} 
          walletData={walletData} 
          summaryData={summaryData}
          periodLabel={periodLabel}
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <FinancialOverview 
              isLoading={isSummaryLoading} 
              chartData={summaryData?.monthlyData}
              from={range.de}
              to={range.ate}
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
          transactions={transacoesDoPeriodo}
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
