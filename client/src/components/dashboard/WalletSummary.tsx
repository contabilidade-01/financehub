import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { ArrowUpIcon, ArrowDownIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "@/contexts/LocalizationContext";

interface WalletSummaryProps {
  isWalletLoading: boolean;
  isSummaryLoading: boolean;
  periodLabel?: string;
  walletData?: {
    id: number;
    saldo_atual: number;
    nome: string;
  };
  summaryData?: {
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
  };
}

export default function WalletSummary({ isWalletLoading, isSummaryLoading, walletData, summaryData, periodLabel }: WalletSummaryProps) {
  const { t } = useTranslation();
  const income = summaryData?.totalIncome || 0;
  const expenses = summaryData?.totalExpenses || 0;
  const periodBalance = income - expenses;
  const periodo = periodLabel || t('wallet.this_month', 'este mês');
  
  return (
    <section>
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">{t('wallet.title', 'Sua Carteira')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('wallet.updated_on', 'Atualizado em')} {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {isWalletLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                walletData?.nome || t('wallet.main_wallet', 'Principal')
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
            <StatCard
              icon={WalletIcon}
              tone="primary"
              label={t('wallet.period_balance', 'Saldo do período')}
              value={formatCurrency(periodBalance)}
              valueClassName={periodBalance < 0 ? "text-expense" : undefined}
              hint={<>{t('wallet.wallet_total', 'Carteira')}: {formatCurrency(walletData?.saldo_atual || 0)} · {periodo}</>}
              isLoading={isWalletLoading}
            />
            <StatCard
              icon={ArrowUpIcon}
              tone="income"
              label={t('wallet.period_income', 'Receitas')}
              value={formatCurrency(income)}
              hint={periodo}
              isLoading={isSummaryLoading}
            />
            <StatCard
              icon={ArrowDownIcon}
              tone="expense"
              label={t('wallet.period_expenses', 'Despesas')}
              value={formatCurrency(expenses)}
              hint={periodo}
              isLoading={isSummaryLoading}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
