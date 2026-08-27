import { Request, Response } from 'express';
import { storage } from '../storage';
import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';

/**
 * @swagger
 * /reports/pdf:
 *   get:
 *     summary: Gera PDF do relatório financeiro
 *     description: Cria um PDF com os dados financeiros formatados igual à página de relatórios
 *     tags:
 *       - Relatórios
 *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: URL do PDF gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Status da operação
 *                 downloadUrl:
 *                   type: string
 *                   description: URL para download do PDF
 *                 filename:
 *                   type: string
 *                   description: Nome do arquivo PDF
 *               example:
 *                 success: true
 *                 downloadUrl: "/api/reports/download/relatorio-financeiro-2024-05-27.pdf"
 *                 filename: "relatorio-financeiro-2024-05-27.pdf"
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Carteira não encontrada
 *       500:
 *         description: Erro ao gerar PDF
 */
export async function generateReportPDF(req: Request, res: Response) {
  console.log('\n=== PDF GENERATION - START ===');
  try {
    if (!req.user) {
      console.log('PDF Generation: User not authenticated');
      return res.status(401).json({ error: "Não autenticado" });
    }

    const userId = req.user.id;
    console.log(`PDF Generation: User ID ${userId}`);

    // Get user's wallet
    const wallet = await storage.getWalletByUserId(userId);
    if (!wallet) {
      return res.status(404).json({ message: "Carteira não encontrada" });
    }

    // Get dashboard summary data
    const monthlyData = await storage.getMonthlyTransactionSummary(wallet.id);
    const expensesData = await storage.getExpensesByCategory(wallet.id);
    const { totalIncome, totalExpenses } = await storage.getIncomeExpenseTotals(wallet.id);

    // Calculate total expenses for percentage calculation
    const totalExpensesAmount = expensesData.reduce(
      (total: number, item: any) => total + Number(item.total), 
      0
    );

    // Add percentage to each category
    const expensesByCategory = expensesData.map((item: any) => ({
      categoryId: Number(item.category_id || 0),
      name: item.name || 'Categoria',
      total: Number(item.total || 0),
      color: item.color || '#6B7280',
      icon: item.icon || '📊',
      percentage: totalExpensesAmount > 0 
        ? Math.round((Number(item.total || 0) / totalExpensesAmount) * 100) 
        : 0
    }));
    
    console.log('PDF Generation: Dados processados com sucesso', { 
      expensesByCategory: expensesByCategory.length,
      monthlyData: monthlyData.length 
    });

    // Prepare chart data matching the reports page
    const monthlyChartData = monthlyData.map((month: any) => ({
      month: month.mes,
      income: Number(month.receitas || 0),
      expense: Number(month.despesas || 0),
      balance: Number(month.receitas || 0) - Number(month.despesas || 0)
    }));

    const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#A569BD", "#FF6B6B", "#6BCB77", "#4D96FF"];
    
    // Generate PDF using only jsPDF - no external dependencies
    console.log('PDF Generation: Criando PDF final com hash único para evitar cache');
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Header estilizado igual à página
    doc.setFillColor(16, 16, 20); // Fundo escuro como na página
    doc.rect(0, 0, 210, 50, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatórios', 20, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175); // Gray-400
    doc.text('Acompanhe suas finanças com análises detalhadas', 20, 35);
    
    const reportDate = new Date().toLocaleDateString('pt-BR');
    doc.setTextColor(255, 255, 255);
    doc.text(`${req.user.nome} • ${wallet.nome} • ${reportDate}`, 20, 45);

    let currentY = 60;

    // SEÇÃO 1: Resumo Financeiro Simplificado
    if (monthlyChartData.length > 0) {
      // Título do gráfico
      doc.setFillColor(31, 41, 55); // Gray-800
      doc.rect(10, currentY, 90, 60, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Receitas vs Despesas', 55, currentY + 10, { align: 'center' });

      // Encontrar valor máximo para escala
      const maxValue = Math.max(
        ...monthlyChartData.map(d => Math.max(d.income, d.expense))
      );
      
      // Desenhar barras
      const barWidth = 6;
      const chartHeight = 35;
      const startX = 15;
      const startY = currentY + 15;
      
      monthlyChartData.forEach((data: any, index: number) => {
        const x = startX + (index * 15);
        
        // Barra de receitas (verde) - validar parâmetros
        const incomeHeight = Math.max(0, (data.income / maxValue) * chartHeight);
        doc.setFillColor(74, 222, 128); // Green-400
        if (incomeHeight > 0) {
          doc.rect(x, startY + chartHeight - incomeHeight, barWidth, incomeHeight, 'F');
        }
        
        // Barra de despesas (vermelho) - validar parâmetros
        const expenseHeight = Math.max(0, (data.expense / maxValue) * chartHeight);
        doc.setFillColor(248, 113, 113); // Red-400
        if (expenseHeight > 0) {
          doc.rect(x + barWidth + 1, startY + chartHeight - expenseHeight, barWidth, expenseHeight, 'F');
        }
        
        // Rótulo do mês
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(8);
        doc.text(data.month || '', x + barWidth, startY + chartHeight + 5);
      });

      // Legenda
      doc.setFontSize(8);
      doc.setFillColor(74, 222, 128);
      doc.rect(15, currentY + 55, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('Receitas', 20, currentY + 57);
      
      doc.setFillColor(248, 113, 113);
      doc.rect(50, currentY + 55, 3, 3, 'F');
      doc.text('Despesas', 55, currentY + 57);
    }

    // SEÇÃO 2: Gráfico de Linha - Fluxo de Caixa
    if (monthlyChartData.length > 0) {
      // Título do gráfico
      doc.setFillColor(31, 41, 55); // Gray-800
      doc.rect(110, currentY, 90, 60, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Fluxo de Caixa', 155, currentY + 10, { align: 'center' });

      // Encontrar valores min/max para escala
      const balances = monthlyChartData.map(d => d.balance);
      const minBalance = Math.min(...balances);
      const maxBalance = Math.max(...balances);
      const range = maxBalance - minBalance;
      
      // Desenhar linha
      const chartHeight = 35;
      const chartWidth = 70;
      const startX = 115;
      const startY = currentY + 15;
      
      doc.setDrawColor(136, 132, 216); // Purple line
      doc.setLineWidth(0.5);
      
      for (let i = 0; i < monthlyChartData.length - 1; i++) {
        const x1 = startX + (i / (monthlyChartData.length - 1)) * chartWidth;
        const y1 = startY + chartHeight - ((balances[i] - minBalance) / range) * chartHeight;
        const x2 = startX + ((i + 1) / (monthlyChartData.length - 1)) * chartWidth;
        const y2 = startY + chartHeight - ((balances[i + 1] - minBalance) / range) * chartHeight;
        
        doc.line(x1, y1, x2, y2);
        
        // Pontos
        doc.setFillColor(136, 132, 216);
        doc.circle(x1, y1, 1, 'F');
      }
      
      // Último ponto
      if (monthlyChartData.length > 0) {
        const lastIndex = monthlyChartData.length - 1;
        const x = startX + chartWidth;
        const y = startY + chartHeight - ((balances[lastIndex] - minBalance) / range) * chartHeight;
        doc.circle(x, y, 1, 'F');
      }

      // Rótulos dos meses
      monthlyChartData.forEach((data, index) => {
        const x = startX + (index / Math.max(1, monthlyChartData.length - 1)) * chartWidth;
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(8);
        doc.text(data.month, x, startY + chartHeight + 5);
      });
    }

    currentY += 70;

    // SEÇÃO 3: Gráfico de Pizza - Despesas por Categoria
    if (expensesByCategory.length > 0) {
      doc.setFillColor(31, 41, 55); // Gray-800
      doc.rect(10, currentY, 190, 80, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Despesas por Categoria', 15, currentY + 15);

      // Calcular ângulos para o gráfico de pizza
      const total = expensesByCategory.reduce((sum: number, cat: any) => sum + cat.total, 0);
      const centerX = 60;
      const centerY = currentY + 45;
      const radius = 25;
      
      let currentAngle = 0;
      
      expensesByCategory.forEach((category: any, index: number) => {
        const angle = (category.total / total) * 2 * Math.PI;
        const color = category.color || COLORS[index % COLORS.length];
        
        // Converter cor hex para RGB
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Desenhar fatia da pizza (simulada com polígono)
        doc.setFillColor(r, g, b);
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        
        // Aproximar arco com linhas
        const points = [];
        points.push([centerX, centerY]); // Centro
        for (let a = startAngle; a <= endAngle; a += 0.1) {
          points.push([
            centerX + Math.cos(a) * radius,
            centerY + Math.sin(a) * radius
          ]);
        }
        points.push([
          centerX + Math.cos(endAngle) * radius,
          centerY + Math.sin(endAngle) * radius
        ]);
        
        // Simular fatia com triângulos
        for (let i = 1; i < points.length - 1; i++) {
          doc.triangle(
            points[0][0], points[0][1],
            points[i][0], points[i][1],
            points[i+1][0], points[i+1][1],
            'F'
          );
        }
        
        currentAngle += angle;
      });

      // Legenda à direita
      let legendY = currentY + 25;
      expensesByCategory.forEach((category: any, index: number) => {
        const color = category.color || COLORS[index % COLORS.length];
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Cor da legenda
        doc.setFillColor(r, g, b);
        doc.rect(110, legendY - 2, 4, 4, 'F');
        
        // Texto da legenda
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(
          `${category.name}: R$ ${category.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${category.percentage}%)`,
          117, legendY
        );
        
        legendY += 8;
      });
      
      currentY += 90;
    }

    // SEÇÃO 4: Resumo Financeiro (Cards com estilo da página)
    doc.setFillColor(31, 41, 55); // Gray-800 como na página
    doc.rect(10, currentY, 190, 50, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo Financeiro', 15, currentY + 15);

    // Cards em linha
    const cardY = currentY + 25;
    
    // Card 1 - Total Receitas
    doc.setTextColor(156, 163, 175); // Gray-400
    doc.setFontSize(10);
    doc.text('Total de Receitas', 15, cardY);
    doc.setTextColor(74, 222, 128); // Green-400
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 15, cardY + 10);

    // Card 2 - Total Despesas
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Total de Despesas', 75, cardY);
    doc.setTextColor(248, 113, 113); // Red-400
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 75, cardY + 10);

    // Card 3 - Saldo Atual
    const saldoAtual = Number(wallet.saldo_atual);
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Saldo Atual', 135, cardY);
    doc.setTextColor(saldoAtual >= 0 ? 59 : 248, saldoAtual >= 0 ? 130 : 113, saldoAtual >= 0 ? 246 : 113);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${saldoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 135, cardY + 10);

    // Footer
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Relatório gerado em ${new Date().toLocaleString('pt-BR')} • Magen`, 105, 285, { align: 'center' });
    doc.text('Página 1 de 1', 190, 285, { align: 'right' });

    // Generate filename with unique timestamp hash to avoid caching
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.getTime().toString();
    const hash = Buffer.from(`${req.user.id}-${timeStr}`).toString('base64').substring(0, 8);
    const filename = `relatorio-financeiro-${dateStr}-${hash}.pdf`;
    const filepath = path.join(process.cwd(), 'public', 'reports', filename);
    
    // Ensure reports directory exists
    const reportsDir = path.dirname(filepath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save PDF to file
    const pdfBuffer = doc.output('arraybuffer');
    fs.writeFileSync(filepath, Buffer.from(pdfBuffer));
    
    console.log(`PDF Generation: Arquivo PDF salvo em ${filepath}`);

    // Return download URL
    const downloadUrl = `/api/reports/download/${filename}`;
    
    res.status(200).json({
      success: true,
      downloadUrl,
      filename,
      message: "Relatório PDF gerado com sucesso."
    });

  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ message: "Erro ao gerar PDF do relatório" });
  }
}

/**
 * @swagger
 * /reports/download/{filename}:
 *   get:
 *     summary: Download do arquivo PDF do relatório
 *     description: Faz o download do arquivo PDF gerado
 *     tags:
 *       - Relatórios
 *     parameters:
 *       - in: path
 *         name: filename
 *         schema:
 *           type: string
 *         required: true
 *         description: Nome do arquivo PDF para download
 *     responses:
 *       200:
 *         description: Arquivo PDF
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Arquivo não encontrado
 */
export async function downloadReportPDF(req: Request, res: Response) {
  try {
    const { filename } = req.params;
    const filepath = path.join(process.cwd(), 'public', 'reports', filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: "Arquivo não encontrado" });
    }

    // Check if it's HTML or PDF file
    const isHtml = filename.endsWith('.html');
    
    if (isHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    
    res.sendFile(filepath);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ message: "Erro ao fazer download do arquivo" });
  }
}

// Função generateReportHTML removida para evitar erros