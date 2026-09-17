"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBarChartSVG = generateBarChartSVG;
exports.generatePieChartSVG = generatePieChartSVG;
exports.downloadChartFile = downloadChartFile;
const storage_1 = require("../storage");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
async function generateBarChartSVG(req, res) {
    var _a, _b, _c, _d;
    try {
        console.log("=== CHART GENERATION - BAR CHART SVG ===");
        console.log("Chart Generation: User ID", (_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
        // Get wallet data
        const wallet = await storage_1.storage.getWalletByUserId((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        // Get date parameter (optional)
        const { date } = req.query;
        let startDate;
        let endDate;
        let periodType;
        let inputDate;
        if (date) {
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res
                    .status(400)
                    .json({ message: "Formato de data inválido. Use YYYY-MM-DD" });
            }
            inputDate = new Date(date);
            if (isNaN(inputDate.getTime())) {
                return res.status(400).json({ message: "Data inválida" });
            }
            // Corrigir timezone - garantir que a data seja interpretada no timezone local
            const [year, month, day] = date.split('-').map(Number);
            inputDate = new Date(year, month - 1, day); // month - 1 porque Date usa 0-11 para meses
            // Check if date is not in the future
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            if (inputDate > today) {
                return res.status(400).json({ message: "Data não pode ser no futuro" });
            }
            // Calculate last 7 days including the specified date
            endDate = new Date(inputDate);
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date(inputDate);
            startDate.setDate(inputDate.getDate() - 6); // 6 days before + the specified date = 7 days total
            startDate.setHours(0, 0, 0, 0);
            // Debug: verificar se o cálculo está correto
            console.log(`Chart Generation: Debug - Data informada: ${inputDate.toISOString().split('T')[0]}`);
            console.log(`Chart Generation: Debug - StartDate calculado: ${startDate.toISOString().split('T')[0]} (deveria ser ${inputDate.getDate() - 6}/${inputDate.getMonth() + 1}/${inputDate.getFullYear()})`);
            console.log(`Chart Generation: Debug - EndDate calculado: ${endDate.toISOString().split('T')[0]}`);
            // Verificar se o período tem exatamente 7 dias
            const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            console.log(`Chart Generation: Debug - Diferença em dias: ${daysDiff} (deveria ser 7)`);
            periodType = "últimos 7 dias";
        }
        else {
            // Get last week (Monday to Sunday) - semana passada
            const today = new Date();
            const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // Adjust for Monday start
            // Go back 7 days to get last week
            const lastWeekStart = new Date(today);
            lastWeekStart.setDate(today.getDate() - 7 - daysFromMonday); // Go back to last Monday
            lastWeekStart.setHours(0, 0, 0, 0);
            startDate = lastWeekStart;
            endDate = new Date(lastWeekStart);
            endDate.setDate(lastWeekStart.getDate() + 6); // Sunday
            endDate.setHours(23, 59, 59, 999);
            periodType = "semana passada";
        }
        console.log(`Chart Generation: ${periodType} de`, startDate.toISOString(), "até", endDate.toISOString());
        console.log(`Chart Generation: Data informada: ${date}, Input date: ${inputDate === null || inputDate === void 0 ? void 0 : inputDate.toISOString()}`);
        // Get transactions for the period
        const transactions = await storage_1.storage.getTransactionsByWalletId(wallet.id);
        console.log(`Chart Generation: Total de transações encontradas: ${transactions.length}`);
        // Filtrar transações do período específico
        const periodTransactions = transactions.filter((t) => {
            const transactionDate = new Date(t.data_transacao);
            return transactionDate >= startDate && transactionDate <= endDate;
        });
        console.log(`Chart Generation: Transações do período: ${periodTransactions.length}`);
        // Group transactions by day
        const dailyData = [];
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dayTransactions = periodTransactions.filter((t) => {
                const transactionDate = new Date(t.data_transacao);
                // Corrigir timezone - usar apenas a data local
                const transactionDateLocal = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), transactionDate.getDate());
                const currentDateLocal = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                // Comparação por timestamp para evitar problemas de timezone
                return transactionDateLocal.getTime() === currentDateLocal.getTime();
            });
            const income = dayTransactions
                .filter((t) => t.tipo === "Receita")
                .reduce((sum, t) => sum + Number(t.valor), 0);
            const expense = dayTransactions
                .filter((t) => t.tipo === "Despesa")
                .reduce((sum, t) => sum + Number(t.valor), 0);
            // Get day name based on actual date
            const dayName = currentDate.toLocaleDateString("pt-BR", {
                weekday: "short",
            });
            console.log(`Chart Generation: Dia ${i + 1} - ${currentDate.toISOString().split('T')[0]} (${dayName}): Receitas: ${income}, Despesas: ${expense}, Transações: ${dayTransactions.length}`);
            // Debug: mostrar transações encontradas para este dia
            if (dayTransactions.length > 0) {
                console.log(`Chart Generation: Transações do dia ${currentDate.toISOString().split('T')[0]}:`, dayTransactions.map(t => ({
                    id: t.id,
                    data: t.data_transacao,
                    tipo: t.tipo,
                    valor: t.valor,
                    descricao: t.descricao
                })));
            }
            // Verificar se este é o último dia (deveria ser a data informada)
            if (i === 6) {
                console.log(`Chart Generation: ÚLTIMO DIA - Este deveria ser a data informada: ${currentDate.toISOString().split('T')[0]}`);
            }
            dailyData.push({
                day: dayName,
                date: currentDate.toISOString().split("T")[0],
                income,
                expense,
            });
        }
        console.log("Chart Generation: Dados processados", dailyData);
        // Verificar se há transações no período
        const hasTransactions = dailyData.some(d => d.income > 0 || d.expense > 0);
        if (!hasTransactions) {
            return res.status(200).json({
                success: false,
                message: `Nenhuma transação encontrada no período de ${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
                period: {
                    start: startDate.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0]
                },
                data: dailyData
            });
        }
        // Chart dimensions (16:9 aspect ratio)
        const width = 1280;
        const height = 720;
        const chartX = 100;
        const chartY = 120;
        const chartWidth = width - 200;
        const chartHeight = height - 240;
        // Find max value for scaling
        const maxValue = Math.max(...dailyData.map((d) => Math.max(d.income, d.expense)));
        const roundedMax = Math.ceil(maxValue / 1000) * 1000 || 1000; // Round up to nearest 1000
        // Generate Y-axis labels
        const ySteps = 5;
        let yAxisLabels = "";
        let gridLines = "";
        for (let i = 0; i <= ySteps; i++) {
            const y = chartY + chartHeight - (i * chartHeight) / ySteps;
            const value = (roundedMax / ySteps) * i;
            // Grid line
            gridLines += `<line x1="${chartX}" y1="${y}" x2="${chartX + chartWidth}" y2="${y}" stroke="#374151" stroke-width="1" stroke-dasharray="5,5"/>`;
            // Y-axis label
            yAxisLabels += `<text x="${chartX - 10}" y="${y + 5}" fill="#9ca3af" font-family="Arial" font-size="16" text-anchor="end">R$${value.toLocaleString("pt-BR")}</text>`;
        }
        // Generate bars
        const barWidth = (chartWidth / dailyData.length) * 0.6;
        const barSpacing = chartWidth / dailyData.length;
        let bars = "";
        let dayLabels = "";
        dailyData.forEach((data, index) => {
            const x = chartX + index * barSpacing + (barSpacing - barWidth) / 2;
            const scale = chartHeight / roundedMax;
            // Income bar (green)
            if (data.income > 0) {
                const incomeHeight = data.income * scale;
                bars += `<rect x="${x}" y="${chartY + chartHeight - incomeHeight}" width="${barWidth * 0.45}" height="${incomeHeight}" fill="#4ade80"/>`;
                // Legend above income bar
                bars += `<text x="${x + barWidth * 0.225}" y="${chartY + chartHeight - incomeHeight - 5}" fill="#ffcc00" font-family="Arial" font-size="16" text-anchor="middle">R$${data.income.toLocaleString("pt-BR")}</text>`;
            }
            // Expense bar (red)
            if (data.expense > 0) {
                const expenseHeight = data.expense * scale;
                bars += `<rect x="${x + barWidth * 0.55}" y="${chartY + chartHeight - expenseHeight}" width="${barWidth * 0.45}" height="${expenseHeight}" fill="#f87171"/>`;
                // Legend above expense bar
                bars += `<text x="${x + barWidth * 0.775}" y="${chartY + chartHeight - expenseHeight - 5}" fill="#ffcc00" font-family="Arial" font-size="16" text-anchor="middle">R$${data.expense.toLocaleString("pt-BR")}</text>`;
            }
            // Day label
            dayLabels += `<text x="${x + barWidth / 2}" y="${chartY + chartHeight + 25}" fill="#9ca3af" font-family="Arial" font-size="14" text-anchor="middle">${data.day}</text>`;
        });
        // SVG content
        const svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="100%" height="100%" fill="#1f2937"/>
        
        <!-- Border -->
        <rect x="5" y="5" width="${width - 10}" height="${height - 10}" fill="none" stroke="#0088fe" stroke-width="2"/>
        
        <!-- Title -->
        <!-- Centralized Title -->
        <text x="50%" y="60" fill="#ffffff" font-family="Arial" font-size="32" font-weight="bold" text-anchor="middle">Receitas vs Despesas</text>
        <text x="50%" y="90" fill="#ffffff" font-family="Arial" font-size="16" text-anchor="middle">(${startDate.toLocaleDateString("pt-BR")} à ${endDate.toLocaleDateString("pt-BR")})</text>
        
        <!-- Grid lines -->
        ${gridLines}
        
        <!-- Y-axis labels -->
        ${yAxisLabels}
        
        <!-- Bars -->
        ${bars}
        
        <!-- Day labels -->
        ${dayLabels}
        <!-- Dates -->
        ${dailyData
            .map((data) => {
            const formattedDate = data.date
                .split("-")
                .reverse()
                .slice(0, 2)
                .join("/");
            return `<text x="${chartX + dailyData.indexOf(data) * barSpacing + barWidth / 2 + 30}" y="${chartY + chartHeight + 45}" fill="#9ca3af" font-family="Arial" font-size="14" text-anchor="middle">${formattedDate}</text>`;
        })
            .join("")}        
        
        <!-- Legend -->
        <rect x="${width / 2 - 100}" y="${height - 60}" width="15" height="15" fill="#4ade80"/>
        <text x="${width / 2 - 80}" y="${height - 50}" fill="#ffffff" font-family="Arial" font-size="14">Receitas</text>

        <rect x="${width / 2 + 20}" y="${height - 60}" width="15" height="15" fill="#f87171"/>
        <text x="${width / 2 + 40}" y="${height - 50}" fill="#ffffff" font-family="Arial" font-size="14">Despesas</text>

        <!-- Totals -->
        <text x="${width / 2 - 230}" y="${height - 20}" fill="#ffffff" font-family="Arial" font-size="14">Total Receitas: R$${dailyData.reduce((sum, data) => sum + data.income, 0).toLocaleString("pt-BR")}</text>
        <text x="${width / 2 + 60}" y="${height - 20}" fill="#ffffff" font-family="Arial" font-size="14">Total Despesas: R$${dailyData.reduce((sum, data) => sum + data.expense, 0).toLocaleString("pt-BR")}</text>
      </svg>
    `;
        // Generate filename with unique timestamp hash to avoid caching
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];
        const timeStr = now.getTime().toString();
        const randomId = Math.random().toString(36).substring(2, 10);
        const periodStartStr = startDate.toISOString().split("T")[0].replace(/-/g, "");
        const periodEndStr = endDate.toISOString().split("T")[0].replace(/-/g, "");
        const userHash = Buffer.from(`${(_c = req.user) === null || _c === void 0 ? void 0 : _c.id}-${timeStr}-${randomId}`)
            .toString("base64")
            .substring(0, 8);
        const filename = `chart-receitas-despesas-svg-${periodStartStr}-${periodEndStr}-${timeStr.slice(-6)}-${userHash}.png`;
        const filepath = path_1.default.join(process.cwd(), "public", "charts", filename);
        // Ensure charts directory exists
        const chartsDir = path_1.default.dirname(filepath);
        if (!fs_1.default.existsSync(chartsDir)) {
            fs_1.default.mkdirSync(chartsDir, { recursive: true });
        }
        // Convert SVG to PNG using Sharp
        const svgBuffer = Buffer.from(svgContent.trim());
        await (0, sharp_1.default)(svgBuffer).png({ quality: 100 }).toFile(filepath);
        console.log(`Chart Generation: Arquivo PNG salvo em ${filepath}`);
        // Get full domain URL for download
        const protocol = req.headers["x-forwarded-proto"] || ((_d = req.connection) === null || _d === void 0 ? void 0 : _d.encrypted)
            ? "https"
            : "http";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const fullDownloadUrl = `${protocol}://${host}/api/charts/download/${filename}`;
        res.status(200).json({
            success: true,
            downloadUrl: fullDownloadUrl,
            filename,
            data: dailyData,
            message: "Gráfico de barras gerado com sucesso.",
        });
    }
    catch (error) {
        console.error("Error generating bar chart:", error);
        res.status(500).json({ message: "Erro ao gerar gráfico de barras" });
    }
}
async function generatePieChartSVG(req, res) {
    var _a, _b, _c, _d, _e;
    try {
        console.log("=== CHART GENERATION - PIE CHART SVG ===");
        console.log("Chart Generation: User ID", (_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
        // Get wallet data
        const wallet = await storage_1.storage.getWalletByUserId((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        // Date validation and period calculation
        let startDate;
        let endDate;
        let periodType;
        let inputDate;
        const { date } = req.query;
        if (date) {
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res
                    .status(400)
                    .json({ message: "Formato de data inválido. Use YYYY-MM-DD" });
            }
            inputDate = new Date(date);
            if (isNaN(inputDate.getTime())) {
                return res.status(400).json({ message: "Data inválida" });
            }
            // Corrigir timezone - garantir que a data seja interpretada no timezone local
            const [year, month, day] = date.split('-').map(Number);
            inputDate = new Date(year, month - 1, day); // month - 1 porque Date usa 0-11 para meses
            // Check if date is not in the future
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            if (inputDate > today) {
                return res.status(400).json({ message: "Data não pode ser no futuro" });
            }
            // Calculate last 7 days including the specified date
            endDate = new Date(inputDate);
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date(inputDate);
            startDate.setDate(inputDate.getDate() - 6); // 6 days before + the specified date = 7 days total
            startDate.setHours(0, 0, 0, 0);
            // Debug: verificar se o cálculo está correto
            console.log(`Chart Generation: Debug - Data informada: ${inputDate.toISOString().split('T')[0]}`);
            console.log(`Chart Generation: Debug - StartDate calculado: ${startDate.toISOString().split('T')[0]} (deveria ser ${inputDate.getDate() - 6}/${inputDate.getMonth() + 1}/${inputDate.getFullYear()})`);
            console.log(`Chart Generation: Debug - EndDate calculado: ${endDate.toISOString().split('T')[0]}`);
            // Verificar se o período tem exatamente 7 dias
            const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            console.log(`Chart Generation: Debug - Diferença em dias: ${daysDiff} (deveria ser 7)`);
            periodType = "últimos 7 dias";
        }
        else {
            // Get current week (Sunday to Saturday) - domingo a sábado da semana atual
            const today = new Date();
            const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            // Go back to Sunday of current week
            startDate = new Date(today);
            startDate.setDate(today.getDate() - currentDayOfWeek); // Go back to Sunday
            startDate.setHours(0, 0, 0, 0);
            // Go forward to Saturday of current week
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6); // Saturday
            endDate.setHours(23, 59, 59, 999);
            periodType = "semana atual (domingo a sábado)";
        }
        console.log(`Chart Generation: ${periodType} de`, startDate.toISOString(), "até", endDate.toISOString());
        console.log(`Chart Generation: Data informada: ${date}, Input date: ${inputDate === null || inputDate === void 0 ? void 0 : inputDate.toISOString()}`);
        // Get transactions for the period
        const transactions = await storage_1.storage.getTransactionsByWalletId(wallet.id);
        console.log(`Chart Generation: Total de transações encontradas: ${transactions.length}`);
        // Filtrar transações do período específico
        const periodTransactions = transactions.filter((t) => {
            const transactionDate = new Date(t.data_transacao);
            return transactionDate >= startDate && transactionDate <= endDate;
        });
        console.log(`Chart Generation: Transações do período: ${periodTransactions.length}`);
        // Filter only expenses for pie chart
        const expenses = periodTransactions.filter((t) => t.tipo === "Despesa");
        if (expenses.length === 0) {
            return res.status(200).json({
                success: false,
                message: `Nenhuma despesa encontrada no período de ${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
                period: {
                    start: startDate.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0]
                }
            });
        }
        // Get categories and group expenses
        const categories = await storage_1.storage.getCategoriesByUserId((_c = req.user) === null || _c === void 0 ? void 0 : _c.id);
        const globalCategories = await storage_1.storage.getGlobalCategories();
        const allCategories = [...categories, ...globalCategories];
        const categoryExpenses = new Map();
        expenses.forEach((transaction) => {
            const categoryId = transaction.categoria_id;
            const amount = Number(transaction.valor);
            categoryExpenses.set(categoryId, (categoryExpenses.get(categoryId) || 0) + amount);
        });
        // Prepare data for pie chart
        const pieData = [];
        const colors = [
            "#ff6b6b",
            "#4ecdc4",
            "#45b7d1",
            "#96ceb4",
            "#feca57",
            "#ff9ff3",
            "#54a0ff",
            "#5f27cd",
            "#00d2d3",
            "#ff9f43",
            "#10ac84",
            "#ee5a52",
            "#0abde3",
            "#3867d6",
            "#8854d0",
        ];
        let colorIndex = 0;
        categoryExpenses.forEach((amount, categoryId) => {
            const category = allCategories.find((c) => c.id === categoryId);
            if (category && amount > 0) {
                pieData.push({
                    category: category.nome,
                    amount,
                    color: colors[colorIndex % colors.length],
                });
                colorIndex++;
            }
        });
        // Sort by amount (largest first)
        pieData.sort((a, b) => b.amount - a.amount);
        const totalExpenses = pieData.reduce((sum, item) => sum + item.amount, 0);
        if (totalExpenses === 0) {
            return res
                .status(400)
                .json({ message: "Nenhuma despesa encontrada no período" });
        }
        // Generate SVG
        const width = 800;
        const height = 450;
        const centerX = 250;
        const centerY = 225;
        const radius = 100;
        // Create title with period
        const startDateFormatted = startDate.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
        });
        const endDateFormatted = endDate.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
        });
        const title = `Despesas por Categoria (${startDateFormatted} - ${endDateFormatted})`;
        // Generate pie slices with external labels positioned around the circle
        let pieSlices = "";
        let externalLabels = "";
        let rightLegend = "";
        let bottomLegend = "";
        let currentAngle = -Math.PI / 2; // Start from top
        // Right legend setup
        const legendX = 480;
        let legendY = 100;
        rightLegend += `<text x="${legendX}" y="80" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="bold">Detalhamento</text>`;
        // Colors to match the reference
        const categoryColors = {
            'Compras': '#4ecdc4',
            'Alimentação': '#ff6b6b',
            'Lazer': '#8b5cf6',
            'Transporte': '#10b981'
        };
        pieData.forEach((data, index) => {
            const percentage = data.amount / totalExpenses;
            const sliceAngle = percentage * 2 * Math.PI;
            const x1 = centerX + radius * Math.cos(currentAngle);
            const y1 = centerY + radius * Math.sin(currentAngle);
            const x2 = centerX + radius * Math.cos(currentAngle + sliceAngle);
            const y2 = centerY + radius * Math.sin(currentAngle + sliceAngle);
            const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
            const pathData = [
                `M ${centerX} ${centerY}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                "Z",
            ].join(" ");
            // Use specific colors or fallback to original
            const sliceColor = categoryColors[data.category] || data.color;
            // Add slice with no border for cleaner look
            pieSlices += `<path d="${pathData}" fill="${sliceColor}" stroke="none"/>`;
            // Calculate position for external label
            const midAngle = currentAngle + sliceAngle / 2;
            const labelRadius = radius + 50;
            const labelX = centerX + labelRadius * Math.cos(midAngle);
            const labelY = centerY + labelRadius * Math.sin(midAngle);
            const percentageText = ((data.amount / totalExpenses) * 100).toFixed(0);
            // Add external category label with percentage
            externalLabels += `<text x="${labelX}" y="${labelY}" fill="${sliceColor}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" alignment-baseline="central">${data.category}: ${percentageText}%</text>`;
            // Add right legend items
            const amount = data.amount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
            });
            // Color circle
            rightLegend += `<circle cx="${legendX}" cy="${legendY - 5}" r="6" fill="${sliceColor}"/>`;
            // Category name
            rightLegend += `<text x="${legendX + 15}" y="${legendY}" fill="#ffffff" font-family="Arial, sans-serif" font-size="14">${data.category}</text>`;
            // Amount aligned to the right
            rightLegend += `<text x="${width - 20}" y="${legendY}" fill="#ffffff" font-family="Arial, sans-serif" font-size="14" text-anchor="end">${amount}</text>`;
            // Underline for each item
            rightLegend += `<line x1="${legendX}" y1="${legendY + 8}" x2="${width - 20}" y2="${legendY + 8}" stroke="${sliceColor}" stroke-width="2"/>`;
            legendY += 30;
            currentAngle += sliceAngle;
        });
        // Bottom legend with color squares
        let bottomLegendX = centerX - (pieData.length * 60) / 2;
        const bottomLegendY = height - 50;
        pieData.forEach((data, index) => {
            const sliceColor = categoryColors[data.category] || data.color;
            // Color square
            bottomLegend += `<rect x="${bottomLegendX}" y="${bottomLegendY}" width="12" height="12" fill="${sliceColor}"/>`;
            // Category name
            bottomLegend += `<text x="${bottomLegendX + 18}" y="${bottomLegendY + 10}" fill="#ffffff" font-family="Arial, sans-serif" font-size="12">${data.category}</text>`;
            bottomLegendX += 120;
        });
        // SVG content with circular background
        const svgContent = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="100%" height="100%" fill="#1f2937"/>
        
        <!-- Border -->
        <rect x="5" y="5" width="${width - 10}" height="${height - 10}" fill="none" stroke="#0088fe" stroke-width="2" style="border-radius:10px"/>
        
        <!-- Title -->
        <text x="50%" y="40" fill="#ffffff" font-family="Arial" font-size="30" font-weight="bold" text-anchor="middle">${title}</text>
        
        <!-- Pie Chart -->
        ${pieSlices}
        
        <!-- External Labels -->
        ${externalLabels}
        
        <!-- Right Legend -->
        ${rightLegend}
        
        <!-- Bottom Legend -->
        ${bottomLegend}
      </svg>
    `;
        // Generate filename with unique timestamp hash to avoid caching
        const now = new Date();
        const timeStr = now.getTime().toString();
        const randomId = Math.random().toString(36).substring(2, 10);
        const periodStartStr = startDate.toISOString().split("T")[0].replace(/-/g, "");
        const periodEndStr = endDate.toISOString().split("T")[0].replace(/-/g, "");
        const userHash = Buffer.from(`${(_d = req.user) === null || _d === void 0 ? void 0 : _d.id}-${timeStr}-${randomId}`)
            .toString("base64")
            .substring(0, 8);
        const filename = `chart-despesas-categoria-svg-${periodStartStr}-${periodEndStr}-${timeStr.slice(-6)}-${userHash}.png`;
        const filepath = path_1.default.join(process.cwd(), "public", "charts", filename);
        // Ensure charts directory exists
        const chartsDir = path_1.default.dirname(filepath);
        if (!fs_1.default.existsSync(chartsDir)) {
            fs_1.default.mkdirSync(chartsDir, { recursive: true });
        }
        // Convert SVG to PNG using Sharp
        const svgBuffer = Buffer.from(svgContent.trim());
        await (0, sharp_1.default)(svgBuffer).png({ quality: 100 }).toFile(filepath);
        console.log(`Chart Generation: Arquivo PNG salvo em ${filepath}`);
        // Get full domain URL for download
        const protocol = req.headers["x-forwarded-proto"] || ((_e = req.connection) === null || _e === void 0 ? void 0 : _e.encrypted)
            ? "https"
            : "http";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const fullDownloadUrl = `${protocol}://${host}/api/charts/download/${filename}`;
        res.status(200).json({
            success: true,
            downloadUrl: fullDownloadUrl,
            filename,
            data: pieData,
            message: "Gráfico de pizza gerado com sucesso.",
        });
    }
    catch (error) {
        console.error("Error generating pie chart:", error);
        res.status(500).json({ message: "Erro ao gerar gráfico de pizza" });
    }
}
async function downloadChartFile(req, res) {
    try {
        const { filename } = req.params;
        const filepath = path_1.default.join(process.cwd(), "public", "charts", filename);
        if (!fs_1.default.existsSync(filepath)) {
            return res.status(404).json({ message: "Arquivo não encontrado" });
        }
        // Anti-cache headers
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
        // Set content type based on file extension
        const fileExt = path_1.default.extname(filename).toLowerCase();
        if (fileExt === ".jpg" || fileExt === ".jpeg") {
            res.setHeader("Content-Type", "image/jpeg");
        }
        else if (fileExt === ".png") {
            res.setHeader("Content-Type", "image/png");
        }
        else if (fileExt === ".svg") {
            res.setHeader("Content-Type", "image/svg+xml");
        }
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const fileStream = fs_1.default.createReadStream(filepath);
        fileStream.pipe(res);
    }
    catch (error) {
        console.error("Error downloading chart:", error);
        res.status(500).json({ message: "Erro ao baixar gráfico" });
    }
}
