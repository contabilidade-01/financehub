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
}

export default function FinancialOverview({ isLoading, chartData }: FinancialOverviewProps) {
  const [viewType, setViewType] = useState<"monthly" | "annual">("monthly");
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  // Buscar dados específicos baseado no tipo de visualização
  const { data: filteredData, isLoading: isFilteredLoading } = useQuery({
    queryKey: ["/api/dashboard/summary", viewType],
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
        // Para visão anual, usar dados mensais normais
        return apiRequest<{
          monthlyData: Array<{
            month: string;
            income: number;
            expense: number;
          }>;
        }>("/api/dashboard/summary");
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

      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      
      // Filtrar transações apenas do mês atual
      const currentMonthTransactions = filteredData.transactions.filter(transaction => {
        const transactionDate = new Date(transaction.data_transacao);
        return transactionDate.getFullYear() === currentYear && 
               transactionDate.getMonth() === currentMonth;
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
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
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
        <div className={`${theme === 'light' ? 'bg-white text-gray-900' : 'glass'} p-2 rounded-lg text-sm`}>
          <p className="font-orbitron text-xs mb-1">{viewType === "monthly" ? `${t('dashboard.overview.day', 'Dia')} ${label}` : label}</p>
          <p className="text-secondary font-medium">
            {t('dashboard.overview.income', 'Receitas')}: {formatCurrency(payload[0].value)}
          </p>
          <p className="text-red-400 font-medium">
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
      <Card className="relative rounded-2xl h-full overflow-hidden">
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
          border: '2px solid transparent',
          borderRadius: '16px',
          background: 'conic-gradient(from 0deg, #00ff99, #0099ff, #ff00cc, #ff9900, #00ff99 100%)',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '2px',
          zIndex: 1
        }} />
        <div className={`${theme === 'light' ? 'bg-white shadow-md' : 'glass-card neon-border'} rounded-2xl h-full relative z-10`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-space text-xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{t('dashboard.overview.title', 'Visão Geral')}</h2>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant={viewType === "monthly" ? "default" : "outline"}
                  onClick={() => setViewType("monthly")}
                  className={viewType === "monthly" ? "bg-primary/20" : ""}
                >
                  {t('dashboard.overview.monthly', 'Mensal')}
                </Button>
                <Button
                  size="sm"
                  variant={viewType === "annual" ? "default" : "outline"}
                  onClick={() => setViewType("annual")}
                  className={viewType === "annual" ? "bg-primary/20" : ""}
                >
                  {t('dashboard.overview.annual', 'Anual')}
                </Button>
              </div>
            </div>
            
            <div className="h-[260px] w-full">
              {(isLoading || isFilteredLoading) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Skeleton className="h-[220px] w-full rounded-xl" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsla(157, 100%, 50%, 0.3)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="hsla(157, 100%, 50%, 0.1)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsla(0, 100%, 67%, 0.3)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="hsla(0, 100%, 67%, 0.1)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'} vertical={false} />
                    <XAxis dataKey="month" stroke={theme === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'} tick={{ fill: theme === 'light' ? '#222' : '#ccc', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14 }} />
                    <YAxis 
                      stroke={theme === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
                      tickFormatter={(value) => `R$${value}`}
                      tick={{ fill: theme === 'light' ? '#222' : '#ccc', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="income" 
                      stroke="hsl(157, 100%, 50%)" 
                      fillOpacity={1}
                      fill="url(#colorIncome)"
                      strokeWidth={2}
                      activeDot={{ r: 6, stroke: "hsl(157, 100%, 50%)", strokeWidth: 2, fill: "hsl(157, 100%, 50%)" }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="expense" 
                      stroke="hsl(0, 100%, 67%)" 
                      fillOpacity={1}
                      fill="url(#colorExpense)"
                      strokeWidth={2}
                      activeDot={{ r: 6, stroke: "hsl(0, 100%, 67%)", strokeWidth: 2, fill: "hsl(0, 100%, 67%)" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            
            <div className="flex justify-center space-x-10 mt-4">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-secondary mr-2"></div>
                <span className={`text-sm ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>{t('dashboard.overview.income', 'Receitas')}</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                <span className={`text-sm ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>{t('dashboard.overview.expenses', 'Despesas')}</span>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}
