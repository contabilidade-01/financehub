import { Request, Response } from "express";
import { tokenArquivo } from "../utils/safe-path";
import { storage } from "../storage";
import fs from "fs";
import path from "path";

interface DailyData {
  day: string;
  date: string;
  income: number;
  expense: number;
}

export async function generateBarChartImage(req: Request, res: Response) {
  try {
    console.log("=== CHART GENERATION - BAR CHART ===");
    console.log("Chart Generation: User ID", req.user?.id);

    // Dynamic import for Canvas
    const { createCanvas } = await import("canvas");

    // Get wallet data
    const wallet = await storage.getWalletByUserId(req.user?.id!);
    if (!wallet) {
      return res.status(404).json({ message: "Carteira não encontrada" });
    }

    // Get last 7 days data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 6); // Last 7 days including today

    console.log(
      "Chart Generation: Período",
      startDate.toISOString(),
      "até",
      endDate.toISOString(),
    );

    // Get transactions for the period
    const transactions = await storage.getTransactionsByWalletId(wallet.id);

    // Group transactions by day
    const dailyData: DailyData[] = [];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      const dayTransactions = transactions.filter((t) => {
        const transactionDate = new Date(t.data_transacao);
        return transactionDate.toDateString() === currentDate.toDateString();
      });

      const income = dayTransactions
        .filter((t) => t.tipo === "Receita")
        .reduce((sum, t) => sum + Number(t.valor), 0);

      const expense = dayTransactions
        .filter((t) => t.tipo === "Despesa")
        .reduce((sum, t) => sum + Number(t.valor), 0);

      dailyData.push({
        day: currentDate.toLocaleDateString("pt-BR", { weekday: "short" }),
        date: currentDate.toISOString().split("T")[0],
        income,
        expense,
      });
    }

    console.log("Chart Generation: Dados processados", dailyData);

    // Canvas dimensions (matching the reference image proportions)
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background with dark theme (matching PDF style)
    ctx.fillStyle = "#1f2937"; // gray-800
    ctx.fillRect(0, 0, width, height);

    // Neon border (matching PDF style)
    ctx.strokeStyle = "#0088fe"; // neon blue
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Title with period
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Receitas vs Despesas", 40, 55);

    // Period subtitle
    ctx.font = "20px Arial";
    ctx.fillStyle = "#9ca3af";
    const periodText = `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`;
    ctx.fillText(periodText, 40, 85);

    // Chart area
    const chartX = 80;
    const chartY = 100;
    const chartWidth = width - 160;
    const chartHeight = height - 200;

    // Find max value for scaling
    const maxValue = Math.max(
      ...dailyData.map((d) => Math.max(d.income, d.expense)),
    );
    const roundedMax = Math.ceil(maxValue / 1000) * 1000; // Round up to nearest 1000
    const scale = chartHeight / (roundedMax || 1000);

    // Draw grid lines and Y-axis labels
    ctx.strokeStyle = "#374151"; // gray-700
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]); // Dotted lines

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = chartY + chartHeight - (i * chartHeight) / ySteps;
      const value = (roundedMax / ySteps) * i;

      // Grid line
      ctx.beginPath();
      ctx.moveTo(chartX, y);
      ctx.lineTo(chartX + chartWidth, y);
      ctx.stroke();

      // Y-axis label
      ctx.fillStyle = "#9ca3af"; // gray-400
      ctx.font = "18px Arial";
      ctx.textAlign = "right";
      ctx.fillText(`R$${value.toLocaleString("pt-BR")}`, chartX - 10, y + 6);
    }

    // Reset line dash for bars
    ctx.setLineDash([]);

    // Draw bars
    const barWidth = (chartWidth / dailyData.length) * 0.6;
    const barSpacing = chartWidth / dailyData.length;

    dailyData.forEach((data, index) => {
      const x = chartX + index * barSpacing + (barSpacing - barWidth) / 2;

      // Income bar (green - exact color from web)
      if (data.income > 0) {
        const incomeHeight = data.income * scale;
        ctx.fillStyle = "#4ade80"; // green-400 (exact from web)
        ctx.fillRect(
          x,
          chartY + chartHeight - incomeHeight,
          barWidth * 0.45,
          incomeHeight,
        );
      }

      // Expense bar (red - exact color from web)
      if (data.expense > 0) {
        const expenseHeight = data.expense * scale;
        ctx.fillStyle = "#f87171"; // red-400 (exact from web)
        ctx.fillRect(
          x + barWidth * 0.55,
          chartY + chartHeight - expenseHeight,
          barWidth * 0.45,
          expenseHeight,
        );
      }

      // Day label
      ctx.fillStyle = "#9ca3af"; // gray-400
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(data.day, x + barWidth / 2, chartY + chartHeight + 25);
    });

    // Legend
    const legendY = height - 50;

    // Income legend
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(width / 2 - 100, legendY - 10, 15, 15);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Receitas", width / 2 - 80, legendY);

    // Expense legend
    ctx.fillStyle = "#f87171";
    ctx.fillRect(width / 2 + 20, legendY - 10, 15, 15);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Despesas", width / 2 + 40, legendY);

    // Generate filename with unique timestamp hash to avoid caching
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.getTime().toString();
    const randomId = Math.random().toString(36).substring(2, 10);
    const hash = Buffer.from(`${req.user?.id}-${timeStr}-${randomId}`)
      .toString("base64")
      .substring(0, 12);
    const filename = `chart-receitas-despesas-${dateStr}-${timeStr.slice(-6)}-${tokenArquivo()}-novo.png`;
    const filepath = path.join(process.cwd(), "public", "charts", filename);

    // Ensure charts directory exists
    const chartsDir = path.dirname(filepath);
    if (!fs.existsSync(chartsDir)) {
      fs.mkdirSync(chartsDir, { recursive: true });
    }

    // Save image to file
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(filepath, buffer);

    console.log(`Chart Generation: Arquivo PNG salvo em ${filepath}`);

    // Get full domain URL for download
    const protocol =
      req.headers["x-forwarded-proto"] || (req.connection as any)?.encrypted
        ? "https"
        : "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const fullDownloadUrl = `${protocol}://${host}/api/charts/download/${filename}`;

    console.log(`Gráfico de barras gerado com sucesso.${fullDownloadUrl}`);

    res.status(200).json({
      success: true,
      downloadUrl: fullDownloadUrl,
      filename,
      data: dailyData,
      message: "Gráfico de barras gerado com sucesso.",
    });
  } catch (error) {
    console.error("Error generating bar chart:", error);
    res.status(500).json({ message: "Erro ao gerar gráfico de barras" });
  }
}

export async function downloadChartImage(req: Request, res: Response) {
  try {
    const { filename } = req.params;
    const filepath = path.join(process.cwd(), "public", "charts", filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: "Arquivo não encontrado" });
    }

    // Anti-cache headers
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error downloading chart:", error);
    res.status(500).json({ message: "Erro ao baixar gráfico" });
  }
}
