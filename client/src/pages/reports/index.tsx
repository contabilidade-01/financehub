import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Transaction } from "@shared/schema";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Calendar as CalendarIcon, Download, Filter, PieChart as PieChartIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/contexts/LocalizationContext";

// Tipos para os dados de resumo
interface MonthlyData {
  month: string;
  income: number;
  expense: number;
}

interface CategoryData {
  categoryId: number;
  name: string;
  total: number;
  color: string;
  icon: string;
  percentage: number;
}

interface SummaryData {
  monthlyData: MonthlyData[];
  expensesByCategory: CategoryData[];
  totalIncome: number;
  totalExpenses: number;
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");

  const { data: walletData, isLoading: isLoadingWallet } = useQuery<Wallet>({
    queryKey: ["/api/wallet/current"],
  });

  // Buscar dados com filtro de período
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery<SummaryData>({
    queryKey: ["/api/dashboard/summary", period],
    queryFn: async () => {
      // Por enquanto, usar a rota padrão e filtrar no frontend
      // Quando a API suportar filtros, podemos adicionar os parâmetros aqui
      return apiRequest<SummaryData>("/api/dashboard/summary");
    },
  });

  // Buscar transações para exportação CSV
  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    queryFn: () => apiRequest<Transaction[]>("/api/transactions"),
  });

  // Função para filtrar dados baseado no período selecionado
  const getFilteredData = (): MonthlyData[] => {
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth(); // 0-11
    
    // Se não há dados, retornar estrutura vazia baseada no período
    if (!summaryData || !summaryData.monthlyData || summaryData.monthlyData.length === 0) {
      if (period === "month") {
        return [{ month: monthNames[currentMonth], income: 0, expense: 0 }];
      } else if (period === "quarter") {
        // Últimos 3 meses
        const months = [];
        for (let i = 2; i >= 0; i--) {
          const monthIndex = (currentMonth - i + 12) % 12;
          months.push({ month: monthNames[monthIndex], income: 0, expense: 0 });
        }
        return months;
      } else {
        // Ano completo - retornar todos os 12 meses vazios
        return monthNames.map(month => ({ month, income: 0, expense: 0 }));
      }
    }

    // Log para debug
    console.log("Dados do backend:", summaryData.monthlyData);
    console.log("Período selecionado:", period);
    console.log("Mês atual:", currentMonth, monthNames[currentMonth]);

    const allData = summaryData.monthlyData;

    if (period === "month") {
      // Filtrar apenas o mês atual
      // O backend retorna "Sep" enquanto esperamos "Set" para setembro
      const currentMonthName = monthNames[currentMonth];
      
      // Procurar pelo mês atual nos dados
      // Setembro pode vir como "Sep" ou "Set"
      const monthData = allData.find(d => {
        // Normalizar comparação - Sep -> Set
        const normalizedMonth = d.month === "Sep" ? "Set" : d.month;
        return normalizedMonth === currentMonthName;
      });
      
      if (monthData) {
        // Normalizar o nome do mês antes de retornar
        const normalizedData = {
          ...monthData,
          month: monthData.month === "Sep" ? "Set" : monthData.month
        };
        return [normalizedData];
      }
      
      // Caso contrário, retornar estrutura vazia para o mês atual
      return [{ month: currentMonthName, income: 0, expense: 0 }];
      
    } else if (period === "quarter") {
      // Últimos 3 meses
      const quarterData = [];
      
      for (let i = 2; i >= 0; i--) {
        const targetMonth = (currentMonth - i + 12) % 12;
        const targetMonthName = monthNames[targetMonth];
        
        // Procurar dados com normalização
        const monthData = allData.find(d => {
          const normalizedMonth = d.month === "Sep" ? "Set" : d.month;
          return normalizedMonth === targetMonthName;
        });
        
        if (monthData) {
          // Normalizar o nome do mês
          quarterData.push({
            ...monthData,
            month: monthData.month === "Sep" ? "Set" : monthData.month
          });
        } else {
          quarterData.push({ month: targetMonthName, income: 0, expense: 0 });
        }
      }
      
      return quarterData;
      
    } else if (period === "year") {
      // Para o ano completo, garantir que todos os 12 meses estejam presentes
      const yearData = monthNames.map(monthName => {
        const monthData = allData.find(d => {
          const normalizedMonth = d.month === "Sep" ? "Set" : d.month;
          return normalizedMonth === monthName;
        });
        
        if (monthData) {
          return {
            ...monthData,
            month: monthData.month === "Sep" ? "Set" : monthData.month
          };
        }
        
        return { month: monthName, income: 0, expense: 0 };
      });
      
      return yearData;
    }
    
    // Fallback - retornar todos os dados disponíveis com normalização
    return allData.map(d => ({
      ...d,
      month: d.month === "Sep" ? "Set" : d.month
    }));
  };

  // Gerar dados de exemplo para visualização
  const getMonthlyData = (): MonthlyData[] => {
    return getFilteredData();
  };

  const getMonthlyBalance = () => {
    return getMonthlyData().map((item: MonthlyData) => ({
      ...item,
      balance: item.income - item.expense,
    }));
  };

  const getCategoryData = (): CategoryData[] => {
    return (summaryData && summaryData.expensesByCategory && summaryData.expensesByCategory.length > 0)
      ? summaryData.expensesByCategory 
      : [];
  };

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A569BD", "#FF6B6B", "#6BCB77", "#4D96FF"];

  // Função para filtrar transações por período
  const getFilteredTransactions = () => {
    if (!transactions) return [];
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.data_transacao);
      const transMonth = transactionDate.getMonth();
      const transYear = transactionDate.getFullYear();
      
      if (period === "month") {
        // Filtrar apenas o mês atual
        return transMonth === currentMonth && transYear === currentYear;
      } else if (period === "quarter") {
        // Últimos 3 meses
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return transactionDate >= threeMonthsAgo && transactionDate <= now;
      } else if (period === "year") {
        // Ano atual
        return transYear === currentYear;
      }
      
      return true;
    });
  };

  // Função para exportar para CSV
  const handleExportCSV = () => {
    const filteredTransactions = getFilteredTransactions();
    
    if (!filteredTransactions || filteredTransactions.length === 0) {
      alert(t('reports.no_transactions_to_export', 'Não há transações para exportar neste período.'));
      return;
    }
    
    // Criar cabeçalho do CSV
    const headers = [
      t('reports.csv.date', 'Data'),
      t('reports.csv.description', 'Descrição'),
      t('reports.csv.type', 'Tipo'),
      t('reports.csv.category', 'Categoria'),
      t('reports.csv.payment_method', 'Forma de Pagamento'),
      t('reports.csv.amount', 'Valor'),
      t('reports.csv.status', 'Status')
    ];
    
    // Criar linhas do CSV
    const rows = filteredTransactions.map(transaction => {
      const date = new Date(transaction.data_transacao);
      const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
      
      return [
        formattedDate,
        transaction.descricao,
        transaction.tipo,
        transaction.categoria_name || t('reports.csv.uncategorized', 'Não categorizada'),
        transaction.metodo_pagamento || t('reports.csv.not_specified', 'Não especificado'),
        transaction.valor.toString().replace('.', ','),
        transaction.status
      ];
    });
    
    // Adicionar linha de totais
    const totalReceitas = filteredTransactions
      .filter(t => t.tipo === "Receita")
      .reduce((sum, t) => sum + Number(t.valor), 0);
    
    const totalDespesas = filteredTransactions
      .filter(t => t.tipo === "Despesa")
      .reduce((sum, t) => sum + Number(t.valor), 0);
    
    rows.push([]);
    rows.push(["", "", "", "", t('reports.csv.total_income', 'Total Receitas:'), totalReceitas.toString().replace('.', ','), ""]);
    rows.push(["", "", "", "", t('reports.csv.total_expenses', 'Total Despesas:'), totalDespesas.toString().replace('.', ','), ""]);
    rows.push(["", "", "", "", t('reports.csv.balance', 'Saldo:'), (totalReceitas - totalDespesas).toString().replace('.', ','), ""]);
    
    // Converter para formato CSV
    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.join(";"))
    ].join("\n");
    
    // Adicionar BOM para suportar caracteres especiais no Excel
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    
    // Criar link de download
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    // Definir nome do arquivo
    const periodText = period === "month" ? t('reports.csv.current_month', 'mes_atual') : 
                      period === "quarter" ? t('reports.csv.quarter', 'trimestre') : 
                      t('reports.csv.year', 'ano');
    const fileName = `${t('reports.csv.filename_prefix', 'transacoes')}_${periodText}_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Função removida - exportação para PDF
  /* const handleExportPDF = async () => {
    if (!contentRef.current) return;
    
    setIsExporting(true);
    
    // Aguardar um momento para garantir que os gráficos estejam renderizados
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Obter o texto do período selecionado
      const periodText = period === "month" ? "Este mês" : 
                        period === "quarter" ? "Último trimestre" : 
                        "Este ano";
      
      // Criar um container temporário para o PDF
      const pdfContainer = document.createElement('div');
      pdfContainer.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        width: 1200px;
        background-color: #0f0f23;
        padding: 40px;
      `;
      
      // Clonar o conteúdo
      const clonedContent = contentRef.current.cloneNode(true) as HTMLElement;
      
      // Criar cabeçalho
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = `
        background-color: #0f0f23;
        color: white;
        padding: 30px;
        text-align: center;
        font-family: 'Inter', sans-serif;
        margin-bottom: 30px;
      `;
      headerDiv.innerHTML = `
        <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 10px; color: white;">Relatórios Financeiros</h1>
        <p style="font-size: 20px; color: #9ca3af;">Período: ${periodText}</p>
        <p style="font-size: 16px; color: #6b7280; margin-top: 10px;">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
      `;
      
      // Adicionar ao container
      pdfContainer.appendChild(headerDiv);
      pdfContainer.appendChild(clonedContent);
      document.body.appendChild(pdfContainer);
      
      // Aguardar renderização dos gráficos SVG
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Configurações otimizadas do html2canvas
      const canvas = await html2canvas(pdfContainer, {
        backgroundColor: '#0f0f23',
        scale: 3, // Aumentar a escala para melhor qualidade
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: 1200,
        windowHeight: pdfContainer.scrollHeight,
        onclone: (clonedDoc) => {
          // Garantir que os SVGs sejam renderizados corretamente
          const svgElements = clonedDoc.querySelectorAll('svg');
          svgElements.forEach((svg: SVGElement) => {
            svg.setAttribute('width', svg.getBoundingClientRect().width.toString());
            svg.setAttribute('height', svg.getBoundingClientRect().height.toString());
          });
          
          // Garantir que os estilos dos cards sejam preservados
          const cards = clonedDoc.querySelectorAll('.glass-card');
          cards.forEach((card: HTMLElement) => {
            card.style.backgroundColor = 'rgba(31, 41, 55, 0.5)';
            card.style.border = '1px solid rgba(108, 99, 255, 0.2)';
            card.style.backdropFilter = 'blur(10px)';
          });
        }
      });
      
      // Remover o container temporário
      document.body.removeChild(pdfContainer);
      
      // Criar o PDF
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      // Calcular dimensões
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20; // Margens de 10mm cada lado
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 10; // Margem superior
      
      // Adicionar primeira página com fundo preto
      pdf.setFillColor(15, 15, 35);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= (pageHeight - 20);
      
      // Adicionar páginas adicionais se necessário
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.setFillColor(15, 15, 35);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= (pageHeight - 20);
      }
      
      // Salvar o PDF
      const fileName = `relatorio_financeiro_${period}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }; */

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl md:text-3xl font-bold mb-1">{t('reports.title', 'Relatórios')}</h1>
          <p className="text-gray-400">{t('reports.subtitle', 'Análise detalhada das suas finanças')}</p>
        </motion.div>
        <div className="flex gap-2 mt-4 md:mt-0">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t('reports.this_month', 'Este mês')}</SelectItem>
              <SelectItem value="quarter">{t('reports.last_quarter', 'Último trimestre')}</SelectItem>
              <SelectItem value="year">{t('reports.this_year', 'Este ano')}</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4" />
            {t('reports.export_csv', 'Exportar CSV')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="glass-card neon-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold">{t('reports.income_vs_expenses', 'Income vs Expenses')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="w-full h-[300px]" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getMonthlyData()}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `R$${value}`}
                    />
                    <Tooltip 
                      cursor={false}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div style={{
                              backgroundColor: 'rgba(17, 24, 39, 0.95)',
                              border: '1px solid rgba(108, 99, 255, 0.3)',
                              borderRadius: '8px',
                              padding: '12px',
                              backdropFilter: 'blur(10px)',
                              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                              pointerEvents: 'none'
                            }}>
                              <p style={{ color: '#fff', marginBottom: '8px', fontWeight: 'bold' }}>{label}</p>
                              {payload.map((entry: any, index: number) => (
                                <p key={index} style={{ color: entry.color, margin: '4px 0', fontSize: '14px' }}>
                                  {entry.name}: {formatCurrency(Number(entry.value))}
                                </p>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="income" name={t('reports.chart.income', 'Income')} radius={[4, 4, 0, 0]} fill="#4ade80" fillOpacity={0.8} />
                    <Bar dataKey="expense" name={t('reports.chart.expenses', 'Expenses')} radius={[4, 4, 0, 0]} fill="#f87171" fillOpacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="glass-card neon-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold">{t('reports.cash_flow', 'Cash Flow')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <Skeleton className="w-full h-[300px]" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getMonthlyBalance()}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `R$${value}`}
                    />
                    <Tooltip 
                      formatter={(value) => formatCurrency(Number(value))} 
                      contentStyle={{ 
                        backgroundColor: 'transparent', 
                        border: 'none',
                        padding: '8px',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ display: 'none' }}
                      itemStyle={{ 
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                      wrapperStyle={{ 
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        border: '1px solid rgba(108, 99, 255, 0.2)',
                        borderRadius: '8px',
                        backdropFilter: 'blur(10px)'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      name={t('reports.chart.balance', 'Saldo')}
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card className="glass-card neon-border mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold">{t('reports.expenses_by_category', 'Expenses by Category')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="w-full h-[400px]" />
            ) : getCategoryData().length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <PieChartIcon className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="text-xl font-bold text-gray-300 mb-2">{t('reports.no_data', 'No data found for the selected period')}</h3>
                <p className="text-gray-400 max-w-md">
                  {t('reports.no_data_description', 'You don\'t have any expenses recorded for this period yet. Start recording your transactions to view this report.')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={getCategoryData()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="total"
                        nameKey="name"
                        label={({ name, percent }: { name: string; percent: number }) => 
                          `${name}: ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {getCategoryData().map((entry: CategoryData, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                      formatter={(value) => formatCurrency(Number(value))} 
                      contentStyle={{ 
                        backgroundColor: 'transparent', 
                        border: 'none',
                        padding: '8px',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ display: 'none' }}
                      itemStyle={{ 
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                      wrapperStyle={{ 
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        border: '1px solid rgba(108, 99, 255, 0.2)',
                        borderRadius: '8px',
                        backdropFilter: 'blur(10px)'
                      }}
                    />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-4">{t('reports.breakdown', 'Detalhamento')}</h3>
                  <div className="space-y-4">
                    {getCategoryData().map((category: CategoryData, index: number) => (
                      <div key={index}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center">
                            <div
                              className="w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: category.color || COLORS[index % COLORS.length] }}
                            ></div>
                            <span>{category.name}</span>
                          </div>
                          <span className="font-orbitron">{formatCurrency(Number(category.total))}</span>
                        </div>
                        <div className="w-full bg-gray-700/30 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(category.percentage ? category.percentage * 100 : 0, 100)}%`,
                              backgroundColor: category.color || COLORS[index % COLORS.length],
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Seção de resumo de métricas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card className="glass-card neon-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold">{t('reports.financial_summary', 'Financial Summary')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <h3 className="text-sm text-gray-400">{t('reports.total_income', 'Total Income')}</h3>
                <p className="text-2xl font-orbitron text-green-400">
                  {isLoadingSummary ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    formatCurrency(Number(summaryData?.totalIncome || 0))
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm text-gray-400">{t('reports.total_expenses', 'Total Expenses')}</h3>
                <p className="text-2xl font-orbitron text-red-400">
                  {isLoadingSummary ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    formatCurrency(Number(summaryData?.totalExpenses || 0))
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm text-gray-400">{t('reports.current_balance', 'Current Balance')}</h3>
                <p 
                  className={`text-2xl font-orbitron ${
                    Number(walletData?.saldo_atual || 0) >= 0 ? "text-primary" : "text-red-400"
                  }`}
                >
                  {isLoadingWallet ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    formatCurrency(Number(walletData?.saldo_atual || 0))
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}