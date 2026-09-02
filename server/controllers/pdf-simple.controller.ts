import { Request, Response } from "express";
import { storage } from "../storage";
import fs from "fs";
import path from "path";
import { jsPDF } from "jspdf";

export async function generateSimpleReportPDF(req: Request, res: Response) {
  try {
    console.log("=== PDF GENERATION - SIMPLE VERSION ===");
    console.log("PDF Generation: User ID", req.user!.id);

    // Get wallet data
    const wallet = await storage.getWalletByUserId(req.user!.id);
    if (!wallet) {
      return res.status(404).json({ message: "Carteira não encontrada" });
    }

    // Get financial data
    const expensesByCategory = await storage.getExpensesByCategory(wallet.id);
    const monthlyData = await storage.getMonthlyTransactionSummary(wallet.id);
    const { totalIncome, totalExpenses } = await storage.getIncomeExpenseTotals(
      wallet.id,
    );

    console.log("PDF Generation: Dados processados com sucesso", {
      expensesByCategory: expensesByCategory.length,
      monthlyData: monthlyData.length,
      totalIncome,
      totalExpenses,
    });

    // Cores exatas da interface web
    const COLORS = [
      "#0088FE",
      "#00C49F",
      "#FFBB28",
      "#FF8042",
      "#A569BD",
      "#FF6B6B",
      "#6BCB77",
      "#4D96FF",
    ];

    // Generate PDF using only jsPDF - replicando layout exato da web
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Header com fundo escuro exato da web (bg-gray-900)
    doc.setFillColor(17, 24, 39); // gray-900
    doc.rect(0, 0, 210, 50, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("Relatórios", 20, 25);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175); // text-gray-400
    doc.text("Acompanhe suas finanças com análises detalhadas", 20, 35);

    const reportDate = new Date().toLocaleDateString("pt-BR");
    doc.setTextColor(255, 255, 255);
    doc.text(`${req.user?.nome} • ${wallet.nome} • ${reportDate}`, 20, 45);

    let currentY = 60;

    // SEÇÃO 1: GRÁFICO DE BARRAS - Receitas vs Despesas (layout exato da web)
    if (monthlyData && monthlyData.length > 0) {
      // Card glass-card neon-border
      doc.setFillColor(31, 41, 55); // glass-card background
      doc.rect(10, currentY, 95, 80, "F");

      // Neon border simulation
      doc.setDrawColor(0, 136, 254); // neon blue
      doc.setLineWidth(0.5);
      doc.rect(10, currentY, 95, 80);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Receitas vs Despesas", 15, currentY + 12);

      // Desenhar gráfico de barras (replicando exatamente o Recharts)
      const chartStartY = currentY + 20;
      const chartHeight = 45;
      const barWidth = 6;

      // Calcular escala baseada nos dados reais
      const maxValue = Math.max(
        ...monthlyData.map((d: any) =>
          Math.max(Number(d.receitas || 0), Number(d.despesas || 0)),
        ),
      );
      console.log("PDF: Escala gráfico barras - maxValue:", maxValue);

      monthlyData.slice(0, 6).forEach((data: any, index: number) => {
        const x = 15 + index * 12;
        const receitas = Number(data.receitas || 0);
        const despesas = Number(data.despesas || 0);

        console.log(
          `PDF: Mês ${data.mes} - Receitas: ${receitas}, Despesas: ${despesas}`,
        );

        // Barra de receitas (#4ade80 = verde exato da web) - altura mínima 2mm
        const incomeHeight =
          maxValue > 0
            ? Math.max(2, (receitas / maxValue) * chartHeight)
            : receitas > 0
              ? 5
              : 0;
        if (receitas > 0) {
          doc.setFillColor(74, 222, 128); // #4ade80
          doc.rect(
            x,
            chartStartY + chartHeight - incomeHeight,
            barWidth,
            incomeHeight,
            "F",
          );
          console.log(
            `PDF: Barra receita - x:${x}, y:${chartStartY + chartHeight - incomeHeight}, w:${barWidth}, h:${incomeHeight}`,
          );
        }

        // Barra de despesas (#f87171 = vermelho exato da web) - altura mínima 2mm
        const expenseHeight =
          maxValue > 0
            ? Math.max(2, (despesas / maxValue) * chartHeight)
            : despesas > 0
              ? 5
              : 0;
        if (despesas > 0) {
          doc.setFillColor(248, 113, 113); // #f87171
          doc.rect(
            x + barWidth + 1,
            chartStartY + chartHeight - expenseHeight,
            barWidth,
            expenseHeight,
            "F",
          );
          console.log(
            `PDF: Barra despesa - x:${x + barWidth + 1}, y:${chartStartY + chartHeight - expenseHeight}, w:${barWidth}, h:${expenseHeight}`,
          );
        }

        // Label do mês
        doc.setTextColor(136, 136, 136);
        doc.setFontSize(8);
        doc.text(
          data.mes?.substring(0, 3) || `M${index + 1}`,
          x + 2,
          chartStartY + chartHeight + 8,
        );
      });
    }

    // SEÇÃO 2: GRÁFICO DE LINHA - Fluxo de Caixa (layout exato da web)
    if (monthlyData && monthlyData.length > 0) {
      // Card glass-card neon-border
      doc.setFillColor(31, 41, 55);
      doc.rect(110, currentY, 95, 80, "F");

      // Neon border
      doc.setDrawColor(0, 136, 254);
      doc.setLineWidth(0.5);
      doc.rect(110, currentY, 95, 80);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Fluxo de Caixa", 115, currentY + 12);

      // Desenhar gráfico de linha (replicando exatamente o Recharts)
      const chartStartY = currentY + 20;
      const chartHeight = 45;
      const chartWidth = 80;

      // Calcular saldos mensais
      const balances = monthlyData
        .slice(0, 6)
        .map((d: any) => Number(d.receitas || 0) - Number(d.despesas || 0));
      const minBalance = Math.min(...balances);
      const maxBalance = Math.max(...balances);
      const range = maxBalance - minBalance || 1;

      console.log("PDF: Gráfico linha - saldos:", balances);
      console.log("PDF: Range:", range, "Min:", minBalance, "Max:", maxBalance);

      // Se temos apenas 1 mês, criar pontos extras para visualização
      if (balances.length === 1) {
        // Adicionar pontos virtuais para mostrar tendência
        const currentBalance = balances[0];
        const extendedBalances = [
          currentBalance * 0.8,
          currentBalance * 0.9,
          currentBalance,
        ];
        const extendedRange = Math.abs(currentBalance * 0.2) || 100;

        // Desenhar linha (#8884d8 = cor exata da web)
        doc.setDrawColor(136, 132, 216); // #8884d8
        doc.setLineWidth(2);

        for (let i = 0; i < extendedBalances.length - 1; i++) {
          const x1 = 115 + (i / (extendedBalances.length - 1)) * chartWidth;
          const y1 =
            chartStartY +
            chartHeight -
            ((extendedBalances[i] - currentBalance * 0.8) / extendedRange) *
              chartHeight;
          const x2 =
            115 + ((i + 1) / (extendedBalances.length - 1)) * chartWidth;
          const y2 =
            chartStartY +
            chartHeight -
            ((extendedBalances[i + 1] - currentBalance * 0.8) / extendedRange) *
              chartHeight;

          doc.line(x1, y1, x2, y2);

          // Ponto na linha
          doc.setFillColor(136, 132, 216);
          doc.circle(x1, y1, 1.5, "F");
        }

        // Último ponto
        const lastX = 115 + chartWidth;
        const lastY =
          chartStartY +
          chartHeight -
          ((currentBalance - currentBalance * 0.8) / extendedRange) *
            chartHeight;
        doc.circle(lastX, lastY, 1.5, "F");
      } else {
        // Múltiplos meses - desenhar normalmente
        doc.setDrawColor(136, 132, 216); // #8884d8
        doc.setLineWidth(2);

        for (let i = 0; i < balances.length - 1; i++) {
          const x1 = 115 + (i / Math.max(1, balances.length - 1)) * chartWidth;
          const y1 =
            chartStartY +
            chartHeight -
            ((balances[i] - minBalance) / range) * chartHeight;
          const x2 =
            115 + ((i + 1) / Math.max(1, balances.length - 1)) * chartWidth;
          const y2 =
            chartStartY +
            chartHeight -
            ((balances[i + 1] - minBalance) / range) * chartHeight;

          doc.line(x1, y1, x2, y2);

          // Ponto na linha
          doc.setFillColor(136, 132, 216);
          doc.circle(x1, y1, 1.5, "F");
        }

        // Último ponto
        if (balances.length > 0) {
          const lastX = 115 + chartWidth;
          const lastY =
            chartStartY +
            chartHeight -
            ((balances[balances.length - 1] - minBalance) / range) *
              chartHeight;
          doc.circle(lastX, lastY, 1.5, "F");
        }
      }
    }

    currentY += 90;

    // SEÇÃO 3: GRÁFICO DE PIZZA - Despesas por Categoria (layout exato da web)
    if (expensesByCategory && expensesByCategory.length > 0) {
      // Card glass-card neon-border (largura completa como na web)
      const cardHeight = Math.max(100, expensesByCategory.length * 15 + 60);
      doc.setFillColor(31, 41, 55);
      doc.rect(10, currentY, 190, cardHeight, "F");

      // Neon border
      doc.setDrawColor(0, 136, 254);
      doc.setLineWidth(0.5);
      doc.rect(10, currentY, 190, cardHeight);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Despesas por Categoria", 15, currentY + 12);

      // GRÁFICO DE PIZZA (lado esquerdo)
      const pieX = 60;
      const pieY = currentY + 50;
      const radius = 25;

      // Calcular total e ângulos
      const totalExpenses = expensesByCategory.reduce(
        (sum: number, cat: any) => sum + Number(cat.total || 0),
        0,
      );
      let currentAngle = 0;

      expensesByCategory.forEach((category: any, index: number) => {
        const value = Number(category.total || 0);
        const percentage = totalExpenses > 0 ? value / totalExpenses : 0;
        const angle = percentage * 2 * Math.PI;

        // Cor da categoria (usando cores exatas da web)
        const colorIndex = index % COLORS.length;
        const hex = COLORS[colorIndex].replace("#", "");
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Desenhar fatia (aproximação com triângulos)
        doc.setFillColor(r, g, b);
        const steps = Math.max(8, Math.floor(angle * 20)); // Mais suave

        for (let i = 0; i < steps; i++) {
          const a1 = currentAngle + (i / steps) * angle;
          const a2 = currentAngle + ((i + 1) / steps) * angle;

          const x1 = pieX + Math.cos(a1) * radius;
          const y1 = pieY + Math.sin(a1) * radius;
          const x2 = pieX + Math.cos(a2) * radius;
          const y2 = pieY + Math.sin(a2) * radius;

          // Triângulo da fatia
          doc.triangle(pieX, pieY, x1, y1, x2, y2, "F");
        }

        currentAngle += angle;
      });

      // DETALHAMENTO (lado direito, como na web)
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Detalhamento", 120, currentY + 25);

      let detailY = currentY + 35;
      expensesByCategory.forEach((category: any, index: number) => {
        const colorIndex = index % COLORS.length;
        const hex = COLORS[colorIndex].replace("#", "");
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Círculo de cor (como na web)
        doc.setFillColor(r, g, b);
        doc.circle(120, detailY + 1, 1.5, "F");

        // Nome da categoria
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(category.name || "", 125, detailY + 2);

        // Valor (alinhado à direita)
        doc.setTextColor(248, 113, 113); // text-red-400
        doc.setFont("helvetica", "bold");
        doc.text(
          `R$ ${Number(category.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          195,
          detailY + 2,
          { align: "right" },
        );

        // Barra de progresso (como na web)
        const barY = detailY + 5;
        const barWidth = 70;
        const percentage = Number(category.percentage || 0);

        // Fundo da barra
        doc.setFillColor(55, 65, 81); // bg-gray-700/30
        doc.rect(120, barY, barWidth, 2, "F");

        // Preenchimento da barra
        if (percentage > 0) {
          doc.setFillColor(r, g, b);
          doc.rect(120, barY, (barWidth * percentage) / 100, 2, "F");
        }

        detailY += 12;
      });

      currentY += cardHeight + 10;
    }

    // SEÇÃO 4: RESUMO FINANCEIRO (layout exato da web)
    // Card glass-card neon-border
    doc.setFillColor(31, 41, 55);
    doc.rect(10, currentY, 190, 70, "F");

    // Neon border
    doc.setDrawColor(0, 136, 254);
    doc.setLineWidth(0.5);
    doc.rect(10, currentY, 190, 70);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Financeiro", 15, currentY + 12);

    // Grid de 3 colunas (como na web)
    const cardStartY = currentY + 25;

    // Card 1 - Total de Receitas (verde como na web)
    doc.setTextColor(156, 163, 175); // text-gray-400
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Total de Receitas", 15, cardStartY);

    doc.setTextColor(74, 222, 128); // text-green-400 (exato da web)
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(
      `R$ ${totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      15,
      cardStartY + 15,
    );

    // Card 2 - Total de Despesas (vermelho como na web)
    doc.setTextColor(156, 163, 175); // text-gray-400
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Total de Despesas", 80, cardStartY);

    doc.setTextColor(248, 113, 113); // text-red-400 (exato da web)
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(
      `R$ ${totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      80,
      cardStartY + 15,
    );

    // Card 3 - Saldo Atual (azul/vermelho dinâmico como na web)
    const currentBalance = Number(wallet.saldo_atual);
    doc.setTextColor(156, 163, 175); // text-gray-400
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Saldo Atual", 145, cardStartY);

    // Cor dinâmica: azul se positivo, vermelho se negativo (como na web)
    if (currentBalance >= 0) {
      doc.setTextColor(59, 130, 246); // text-primary (azul)
    } else {
      doc.setTextColor(248, 113, 113); // text-red-400 (vermelho)
    }
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(
      `R$ ${currentBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      145,
      cardStartY + 15,
    );

    currentY += 80;

    // Footer
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Relatório gerado em ${new Date().toLocaleString("pt-BR")} • Khesef`,
      105,
      285,
      { align: "center" },
    );
    doc.text("Página 1 de 1", 190, 285, { align: "right" });

    // Generate filename with unique timestamp hash to avoid caching
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.getTime().toString();
    const hash = Buffer.from(`${req.user!.id}-${timeStr}`)
      .toString("base64")
      .substring(0, 8);
    const filename = `relatorio-${dateStr}-${hash}.pdf`;
    const filepath = path.join(process.cwd(), "public", "reports", filename);

    // Ensure reports directory exists
    const reportsDir = path.dirname(filepath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save PDF to file
    const pdfBuffer = doc.output("arraybuffer");
    fs.writeFileSync(filepath, Buffer.from(pdfBuffer));

    console.log(`PDF Generation: Arquivo PDF salvo em ${filepath}`);

    // Return download URL
    const downloadUrl = `/api/reports/download/${filename}`;

    res.status(200).json({
      success: true,
      downloadUrl,
      filename,
      message: "Relatório PDF gerado com sucesso.",
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ message: "Erro ao gerar PDF do relatório" });
  }
}
