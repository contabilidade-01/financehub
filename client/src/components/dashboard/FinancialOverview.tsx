import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart 
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/contexts/LocalizationContext";

interface FinancialOverviewProps {
  isLoading: boolean;
  chartData?: Array<{
    month: string;
    income: number;
    expense: number;
  }>;
  from?: string;
  to?: string;
}

export default function FinancialOverview({ isLoading, chartData, from, to }: FinancialOverviewProps) {
  const [viewType, setViewType] = useState<"monthly" | "annual">("monthly");
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  // Buscar dados específicos baseado no tipo de visualização
  const { data: filteredData, isLoading: isFilteredLoading } = useQuery({
    queryKey: ["/api/dashboard/summary", viewType, from, to],
    queryFn: async () => {
      if (viewType === "monthly") {
        // Para visão mensal, buscar transações detalhadas para agrupar por dia
        const transactions = await apiRequest<Array<{
          id: number;
          data_transacao: string;
          tipo: string;
          valor: number;
        }>>("/api/transactions");
        return { transactions };
      } else {
        const params = new URLSearchParams();
        if (from && to) {
          params.set("from", from);
          params.set("to", to);
        } else {
          params.set("period", "year");
        }
        return apiRequest(`/api/dashboard/summary?${params.toString()}`);
      }
    },
  });

  // Função para processar dados baseado no viewType
  const getProcessedData = () => {
    if (viewType === "monthly") {
      // Para visão mensal, processar transações por dia
      if (!filteredData?.transactions) {
        // Gerar 30 dias vazios se não houver transações
        return Array.from({ length: 30 }, (_, index) => ({
          month: `${index + 1}`,
          income: 0,
          expense: 0
        }));
      }

      const refDate = from ? new Date(`${from}T00:00:00`) : new Date();
      const year = refDate.getFullYear();
      const month = refDate.getMonth();
      
      const currentMonthTransactions = filteredData.transactions.filter(transaction => {
        const d = String(transaction.data_transacao).slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });

      // Agrupar por dia
      const dailyData: { [key: number]: { income: number; expense: number } } = {};
      
      currentMonthTransactions.forEach(transaction => {
        const day = new Date(transaction.data_transacao).getDate();
        
        if (!dailyData[day]) {
          dailyData[day] = { income: 0, expense: 0 };
        }
        
        if (transaction.tipo === "Receita") {
          dailyData[day].income += Number(transaction.valor);
        } else if (transaction.tipo === "Despesa") {
          dailyData[day].expense += Number(transaction.valor);
        }
      });

      // Criar array com todos os dias do mês (30 dias)
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: Math.min(30, daysInMonth) }, (_, index) => {
        const day = index + 1;
        return {
          month: day.toString(),
          income: dailyData[day]?.income || 0,
          expense: dailyData[day]?.expense || 0
        };
      });
      
    } else {
      // Para visão anual, usar dados mensais
      if (!filteredData?.monthlyData) {
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return monthNames.map(month => ({ month, income: 0, expense: 0 }));
      }

      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      return monthNames.map(monthName => {
        const monthData = filteredData.monthlyData.find(d => {
          const normalizedMonth = d.month === "Sep" ? "Set" : d.month;
          return normalizedMonth === monthName;
        });
        
        if (monthData) {
          return {
            month: monthData.month === "Sep" ? "Set" : monthData.month,
            income: monthData.income,
            expense: monthData.expense
          };
        }
        
        return { month: monthName, income: 0, expense: 0 };
      });
    }
  };
  
  const data = getProcessedData();
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-md border bg-popover p-2 text-sm text-popover-foreground shadow-md">
          <p className="font-numeric text-xs mb-1">{viewType === "monthly" ? `${t('dashboard.overview.day', 'Dia')} ${label}` : label}</p>
          <p className="text-income font-medium">
            {t('dashboard.overview.income', 'Receitas')}: {formatCurrency(payload[0].value)}
          </p>
          <p className="text-expense font-medium">
            {t('dashboard.overview.expenses', 'Despesas')}: {formatCurrency(payload[1].value)}
          </p>
        </div>
      );
    }
  
    return null;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="h-full"
    >
      <Card className="h-full">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold">{t('dashboard.overview.title', 'Visão Geral')}</h2>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant={viewType === "monthly" ? "default" : "outline"}
                  onClick={() => setViewType("monthly")}
                >
                  {t('dashboard.overview.monthly', 'Mensal')}
                </Button>
                <Button
                  size="sm"
                  variant={viewType === "annual" ? "default" : "outline"}
                  onClick={() => setViewType("annual")}
                >
                  {t('dashboard.overview.annual', 'Anual')}
                </Button>
              </div>
            </div>
            
            <div className="h-[260px] w-full">
              {(isLoading || isFilteredLoading) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Skeleton className="h-[220px] w-full rounded-lg" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--income))" stopOpacity={0.18}/>
                        <stop offset="95%" stopColor="hsl(var(--income))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--expense))" stopOpacity={0.14}/>
                        <stop offset="95%" stopColor="hsl(var(--expense))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--border))" tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis 
                      stroke="hsl(var(--border))"
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="income" 
                      stroke="hsl(var(--income))" 
                      fillOpacity={1}
                      fill="url(#colorIncome)"
                      strokeWidth={2}
                      activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2, fill: "hsl(var(--income))" }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="expense" 
                      stroke="hsl(var(--expense))" 
                      fillOpacity={1}
                      fill="url(#colorExpense)"
                      strokeWidth={2}
                      activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2, fill: "hsl(var(--expense))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            
            <div className="flex justify-center space-x-10 mt-4">
              <div className="flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-income mr-2"></div>
                <span className={`text-sm text-foreground`}>{t('dashboard.overview.income', 'Receitas')}</span>
              </div>
              <div className="flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-expense mr-2"></div>
                <span className={`text-sm text-foreground`}>{t('dashboard.overview.expenses', 'Despesas')}</span>
              </div>
            </div>
          </CardContent>
      </Card>
    </motion.div>
  );
}
