"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWeeklyReportImage = generateWeeklyReportImage;
const storage_1 = require("../storage");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sharp_1 = __importDefault(require("sharp"));
async function generateWeeklyReportImage(req, res) {
    var _a, _b;
    try {
        console.log('=== WEEKLY REPORT IMAGE GENERATION ===');
        console.log('Report Generation: User ID', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
        if (!req.user) {
            return res.status(401).json({ message: "Usuário não autenticado" });
        }
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(req.user.id);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        // Parse date parameter or use current week
        const { date } = req.query;
        let startDate;
        if (date && typeof date === 'string') {
            // If date provided, find the Monday of that week
            const providedDate = new Date(date);
            const dayOfWeek = providedDate.getDay();
            const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            startDate = new Date(providedDate);
            startDate.setDate(providedDate.getDate() - daysFromMonday);
        }
        else {
            // Use current week
            const today = new Date();
            const currentDayOfWeek = today.getDay();
            const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
            startDate = new Date(today);
            startDate.setDate(today.getDate() - daysFromMonday);
        }
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        console.log('Report Generation: Semana de', startDate.toISOString(), 'até', endDate.toISOString());
        // Get transactions for the period
        const transactions = await storage_1.storage.getTransactionsByWalletId(wallet.id);
        // Group transactions by day (Monday to Sunday)
        const weeklyData = [];
        const dayNames = ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];
        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const dayTransactions = transactions.filter(t => {
                const transactionDate = new Date(t.data_transacao);
                return transactionDate.toDateString() === currentDate.toDateString();
            });
            const income = dayTransactions
                .filter(t => t.tipo === 'Receita')
                .reduce((sum, t) => sum + Number(t.valor), 0);
            const expense = dayTransactions
                .filter(t => t.tipo === 'Despesa')
                .reduce((sum, t) => sum + Number(t.valor), 0);
            weeklyData.push({
                day: dayNames[i],
                date: currentDate.toISOString().split('T')[0],
                income,
                expense
            });
        }
        // Get totals
        const totalIncome = weeklyData.reduce((sum, d) => sum + d.income, 0);
        const totalExpenses = weeklyData.reduce((sum, d) => sum + d.expense, 0);
        const currentBalance = Number(wallet.saldo_atual);
        // Get category expenses
        const weekTransactions = transactions.filter(t => {
            const transactionDate = new Date(t.data_transacao);
            return transactionDate >= startDate && transactionDate <= endDate && t.tipo === 'Despesa';
        });
        // Get categories to map names
        const categories = await storage_1.storage.getCategoriesByUserId(req.user.id);
        const categoryMap = new Map();
        for (const transaction of weekTransactions) {
            const category = categories.find(c => c.id === transaction.categoria_id);
            const categoryName = category ? category.nome : 'Outros';
            categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + Number(transaction.valor));
        }
        const categoryColors = ['#22d3ee', '#f87171', '#a78bfa', '#34d399'];
        const categoryData = Array.from(categoryMap.entries())
            .map(([name, value], index) => ({
            name,
            value,
            percentage: totalExpenses > 0 ? Math.round((value / totalExpenses) * 100) : 0,
            color: categoryColors[index % categoryColors.length]
        }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
        console.log('Report Generation: Dados processados', { weeklyData, totalIncome, totalExpenses, categoryData });
        // Generate SVG
        const svgContent = generateReportSVG(weeklyData, totalIncome, totalExpenses, currentBalance, categoryData);
        // Generate filename with hash
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.getTime().toString();
        const hash = Buffer.from(`${(_b = req.user) === null || _b === void 0 ? void 0 : _b.id}-${timeStr}`).toString('base64').substring(0, 8);
        const filename = `relatorio-semanal-${dateStr}-${hash}.png`;
        const filepath = path.join(process.cwd(), 'public', 'charts', filename);
        // Ensure charts directory exists
        const chartsDir = path.dirname(filepath);
        if (!fs.existsSync(chartsDir)) {
            fs.mkdirSync(chartsDir, { recursive: true });
        }
        // Convert SVG to PNG using Sharp
        const svgBuffer = Buffer.from(svgContent.trim());
        await (0, sharp_1.default)(svgBuffer)
            .png({ quality: 100 })
            .toFile(filepath);
        console.log(`Report Generation: Arquivo PNG salvo em ${filepath}`);
        // Return download URL
        const downloadUrl = `/api/charts/download/${filename}`;
        res.json({
            success: true,
            downloadUrl,
            filename,
            data: {
                weeklyData,
                totalIncome,
                totalExpenses,
                currentBalance,
                categoryData
            },
            message: "Relatório semanal gerado com sucesso."
        });
    }
    catch (error) {
        console.error('Erro ao gerar relatório semanal:', error);
        res.status(500).json({ message: "Erro interno do servidor ao gerar relatório" });
    }
}
function generateReportSVG(weeklyData, totalIncome, totalExpenses, currentBalance, categoryData) {
    // Report dimensions (16:9 aspect ratio wide format)
    const width = 1920;
    const height = 1080;
    const padding = 40;
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    // Calculate week period (Monday to Sunday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayDate = new Date(today);
    mondayDate.setDate(today.getDate() + mondayOffset);
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 6);
    const formatDate = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const periodText = `${formatDate(mondayDate)} - ${formatDate(sundayDate)}`;
    // Perfect grid layout matching reference image
    const cardWidth = 470;
    const cardHeight = 250;
    const gap = 30;
    const topRowY = 130;
    const bottomRowY = 400;
    const summaryY = 680;
    const summaryHeight = 80;
    // Generate components with exact positioning
    const incomeExpensesChart = generateWeeklyBarChart(weeklyData, totalIncome, totalExpenses, cardWidth, cardHeight);
    const cashFlowChart = generateWeeklyCashFlow(weeklyData, cardWidth, cardHeight);
    const categoryPieChart = generateCategoryPieChart(categoryData, totalExpenses, cardWidth, cardHeight);
    const categoryDetails = generateCategoryDetailPanel(categoryData, cardWidth, cardHeight);
    const financialSummary = generateBottomSummary(totalIncome, totalExpenses, currentBalance, width - padding * 2, summaryHeight);
    return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .header-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 28px; font-weight: 600; fill: white; }
          .header-subtitle { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; fill: #94a3b8; }
          .period-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; fill: #94a3b8; }
          .card-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 600; fill: white; }
          .axis-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; fill: #94a3b8; }
          .day-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; fill: #94a3b8; }
          .legend-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; fill: #94a3b8; }
          .legend-value { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 500; fill: white; }
          .percentage-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 500; fill: white; }
          .summary-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; fill: white; }
          .summary-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; fill: #94a3b8; }
          .summary-value { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 20px; font-weight: 700; }
          .export-button { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; fill: white; }
        </style>
      </defs>
      
      <!-- Background -->
      <rect width="100%" height="100%" fill="#0a0a0a"/>
      
      <!-- Header -->
      <text x="${padding}" y="50" class="header-title">Relatórios</text>
      <text x="${padding}" y="75" class="header-subtitle">Acompanhe suas finanças com análises detalhadas</text>
      <text x="${padding}" y="95" class="period-text">Período: ${periodText}</text>
      
      <!-- Period Selector -->
      <rect x="${width - 200}" y="25" width="80" height="30" fill="#374151" stroke="#4b5563" stroke-width="1" rx="6"/>
      <text x="${width - 160}" y="43" text-anchor="middle" class="legend-text">Este mês</text>
      
      <!-- Export Button -->
      <rect x="${width - 110}" y="25" width="70" height="30" fill="#3b82f6" stroke="none" rx="6"/>
      <text x="${width - 75}" y="43" text-anchor="middle" class="export-button">Exportar</text>
      
      <!-- Top Row: Receitas vs Despesas (Left) + Fluxo de Caixa (Right) -->
      <g transform="translate(${padding}, ${topRowY})">
        ${incomeExpensesChart}
      </g>
      
      <g transform="translate(${padding + cardWidth + gap}, ${topRowY})">
        ${cashFlowChart}
      </g>
      
      <!-- Bottom Row: Despesas por Categoria (Left) + Detalhamento (Right) -->
      <g transform="translate(${padding}, ${bottomRowY})">
        ${categoryPieChart}
      </g>
      
      <g transform="translate(${padding + cardWidth + gap}, ${bottomRowY})">
        ${categoryDetails}
      </g>
      
      <!-- Bottom: Resumo Financeiro -->
      <g transform="translate(${padding}, ${summaryY})">
        ${financialSummary}
      </g>
    </svg>
  `.trim();
}
function generateIncomeExpensesBarChart(weeklyData, width, height, categoryData) {
    const chartPadding = 50;
    const chartWidth = width - chartPadding * 2;
    const chartHeight = height - 100;
    const barWidth = chartWidth / 7;
    const maxValue = Math.max(...weeklyData.map(d => Math.max(d.income, d.expense)), 1000);
    const dayLabels = ['ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.', 'seg.'];
    let bars = '';
    let labels = '';
    weeklyData.forEach((data, index) => {
        const x = chartPadding + index * barWidth;
        const incomeHeight = (data.income / maxValue) * chartHeight;
        const expenseHeight = (data.expense / maxValue) * chartHeight;
        // Income bar (cyan/blue)
        if (data.income > 0) {
            bars += `<rect x="${x + 5}" y="${chartHeight - incomeHeight + 50}" width="${barWidth * 0.4}" height="${incomeHeight}" fill="#22d3ee" rx="2"/>`;
        }
        // Expense bar with category colors
        if (data.expense > 0) {
            // For now, use first category color, but this could be enhanced to show stacked categories
            const expenseColor = categoryData.length > 0 ? categoryData[0].color : "#f87171";
            bars += `<rect x="${x + barWidth * 0.5}" y="${chartHeight - expenseHeight + 50}" width="${barWidth * 0.4}" height="${expenseHeight}" fill="${expenseColor}" rx="2"/>`;
        }
        // Day labels
        labels += `<text x="${x + barWidth / 2}" y="${height - 15}" text-anchor="middle" class="day-label">${dayLabels[index]}</text>`;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="25" class="card-title">Receitas vs Despesas</text>
    
    <!-- Chart area -->
    <g>
      <!-- Grid lines -->
      ${Array.from({ length: 5 }, (_, i) => {
        const y = 50 + (chartHeight / 4) * i;
        return `<line x1="${chartPadding}" y1="${y}" x2="${width - chartPadding}" y2="${y}" stroke="#334155" stroke-width="0.5" stroke-dasharray="2,2"/>`;
    }).join('')}
      
      <!-- Y-axis labels -->
      ${Array.from({ length: 5 }, (_, i) => {
        const value = maxValue - (maxValue / 4) * i;
        const y = 55 + (chartHeight / 4) * i;
        return `<text x="${chartPadding - 10}" y="${y}" text-anchor="end" class="axis-label">R$${value.toFixed(0)}</text>`;
    }).join('')}
      
      <!-- Bars -->
      ${bars}
      
      <!-- Day labels -->
      ${labels}
    </g>
    
    <!-- Legend -->
    <g transform="translate(20, ${height - 35})">
      <rect x="0" y="0" width="10" height="10" fill="#22d3ee"/>
      <text x="15" y="8" class="legend-text">Receitas</text>
      <rect x="80" y="0" width="10" height="10" fill="#f87171"/>
      <text x="95" y="8" class="legend-text">Despesas</text>
    </g>
  `;
}
function generateCashFlowLineChart(weeklyData, width, height) {
    const chartPadding = 60;
    const chartWidth = width - chartPadding * 2;
    const chartHeight = height - 120;
    // Calculate cumulative cash flow
    let cumulativeBalance = 0;
    const points = [];
    weeklyData.forEach((data, index) => {
        cumulativeBalance += data.income - data.expense;
        const x = chartPadding + (index / (weeklyData.length - 1)) * chartWidth;
        const y = chartHeight - Math.max(0, (cumulativeBalance / 4000) * chartHeight) + 60;
        points.push({ x, y: Math.max(60, Math.min(chartHeight + 60, y)), balance: cumulativeBalance });
    });
    const pathData = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="35" class="card-title">Fluxo de Caixa</text>
    
    <!-- Chart area -->
    <g>
      <!-- Grid lines -->
      ${Array.from({ length: 5 }, (_, i) => {
        const y = 60 + (chartHeight / 4) * i;
        return `<line x1="${chartPadding}" y1="${y}" x2="${width - chartPadding}" y2="${y}" stroke="#334155" stroke-width="1" stroke-dasharray="2,2"/>`;
    }).join('')}
      
      <!-- Y-axis labels -->
      ${Array.from({ length: 5 }, (_, i) => {
        const value = 4000 - (1000 * i);
        const y = 65 + (chartHeight / 4) * i;
        return `<text x="${chartPadding - 10}" y="${y}" text-anchor="end" class="axis-label">R$${value}</text>`;
    }).join('')}
      
      <!-- Cash flow line -->
      <path d="${pathData}" stroke="#22d3ee" stroke-width="3" fill="none"/>
      
      <!-- Points -->
      ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#22d3ee"/>`).join('')}
      
      <!-- Month label -->
      <text x="${width / 2}" y="${height - 20}" text-anchor="middle" class="day-label">May</text>
    </g>
  `;
}
function generateCategoryExpensesPieChart(categoryData, totalExpenses, width, height) {
    const pieX = 200;
    const pieY = height / 2;
    const radius = 120;
    let currentAngle = -Math.PI / 2; // Start from top
    let slices = '';
    let legend = '';
    // Generate pie slices
    categoryData.forEach((category, index) => {
        const percentage = totalExpenses > 0 ? category.value / totalExpenses : 0;
        const sliceAngle = percentage * 2 * Math.PI;
        const endAngle = currentAngle + sliceAngle;
        const x1 = pieX + radius * Math.cos(currentAngle);
        const y1 = pieY + radius * Math.sin(currentAngle);
        const x2 = pieX + radius * Math.cos(endAngle);
        const y2 = pieY + radius * Math.sin(endAngle);
        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        slices += `
      <path d="M ${pieX} ${pieY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z" 
            fill="${category.color}" stroke="#1e293b" stroke-width="2"/>
    `;
        // Add percentage label on slice
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = pieX + (radius * 0.7) * Math.cos(labelAngle);
        const labelY = pieY + (radius * 0.7) * Math.sin(labelAngle);
        if (category.percentage > 15) {
            slices += `<text x="${labelX}" y="${labelY}" class="percentage-text" text-anchor="middle" fill="white">${category.name}: ${category.percentage}%</text>`;
        }
        currentAngle = endAngle;
    });
    // Generate legend on the right side
    categoryData.forEach((category, index) => {
        const legendY = 100 + (index * 35);
        legend += `
      <rect x="450" y="${legendY - 8}" width="14" height="14" fill="${category.color}"/>
      <text x="475" y="${legendY + 4}" class="legend-text">${category.name}</text>
      <text x="${width - 40}" y="${legendY + 4}" class="legend-value" text-anchor="end">R$ ${category.value.toFixed(2)}</text>
    `;
    });
    // Generate bottom legend with colors
    let bottomLegend = '';
    categoryData.forEach((category, index) => {
        bottomLegend += `
      <rect x="${40 + index * 120}" y="${height - 40}" width="14" height="14" fill="${category.color}"/>
      <text x="${60 + index * 120}" y="${height - 28}" class="legend-text">${category.name}</text>
    `;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="35" class="card-title">Despesas por Categoria</text>
    
    <!-- Pie Chart -->
    ${slices}
    
    <!-- Legend Title -->
    <text x="450" y="60" class="card-title">Detalhamento</text>
    
    <!-- Right Legend -->
    ${legend}
    
    <!-- Bottom Legend -->
    ${bottomLegend}
  `;
}
// Weekly bar chart for Income vs Expenses with daily data
function generateWeeklyBarChart(weeklyData, totalIncome, totalExpenses, width, height) {
    const chartPadding = 40;
    const chartWidth = width - chartPadding * 2;
    const chartHeight = height - 80;
    const barWidth = chartWidth / 7;
    const maxValue = Math.max(...weeklyData.map(d => Math.max(d.income, d.expense)), 1000);
    const dayLabels = ['ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.', 'seg.'];
    let bars = '';
    let labels = '';
    weeklyData.forEach((data, index) => {
        const x = chartPadding + index * barWidth;
        const incomeHeight = (data.income / maxValue) * (chartHeight - 60);
        const expenseHeight = (data.expense / maxValue) * (chartHeight - 60);
        // Income bar (green)
        if (data.income > 0) {
            bars += `<rect x="${x + 8}" y="${chartHeight - incomeHeight + 40}" width="${barWidth * 0.4}" height="${incomeHeight}" fill="#10b981" rx="2"/>`;
        }
        // Expense bar (red)
        if (data.expense > 0) {
            bars += `<rect x="${x + barWidth * 0.52}" y="${chartHeight - expenseHeight + 40}" width="${barWidth * 0.4}" height="${expenseHeight}" fill="#ef4444" rx="2"/>`;
        }
        // Day labels
        labels += `<text x="${x + barWidth / 2}" y="${height - 15}" text-anchor="middle" class="day-label">${dayLabels[index]}</text>`;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#374151" stroke="#4b5563" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" class="card-title">Receitas vs Despesas</text>
    
    <!-- Y-axis labels -->
    <text x="35" y="60" text-anchor="end" class="axis-label">R$6k</text>
    <text x="35" y="100" text-anchor="end" class="axis-label">R$4.5k</text>
    <text x="35" y="140" text-anchor="end" class="axis-label">R$3k</text>
    <text x="35" y="180" text-anchor="end" class="axis-label">R$1.5k</text>
    <text x="35" y="220" text-anchor="end" class="axis-label">R$0</text>
    
    <!-- Grid lines -->
    <line x1="${chartPadding}" y1="60" x2="${width - 20}" y2="60" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="100" x2="${width - 20}" y2="100" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="140" x2="${width - 20}" y2="140" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="180" x2="${width - 20}" y2="180" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="220" x2="${width - 20}" y2="220" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    
    <!-- Bars -->
    ${bars}
    
    <!-- Day labels -->
    ${labels}
  `;
}
// Weekly cash flow chart
function generateWeeklyCashFlow(weeklyData, width, height) {
    const chartPadding = 40;
    const chartWidth = width - chartPadding * 2;
    const chartHeight = height - 80;
    // Calculate cumulative cash flow for the week
    let cumulativeBalance = 0;
    const points = [];
    weeklyData.forEach((data, index) => {
        cumulativeBalance += data.income - data.expense;
        const x = chartPadding + (index / (weeklyData.length - 1)) * chartWidth;
        const y = chartHeight - Math.max(0, (cumulativeBalance / 4000) * (chartHeight - 60)) + 40;
        points.push({ x, y: Math.max(60, Math.min(chartHeight + 40, y)) });
    });
    const pathData = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#374151" stroke="#4b5563" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" class="card-title">Fluxo de Caixa</text>
    
    <!-- Y-axis labels -->
    <text x="35" y="60" text-anchor="end" class="axis-label">R$4000</text>
    <text x="35" y="100" text-anchor="end" class="axis-label">R$3000</text>
    <text x="35" y="140" text-anchor="end" class="axis-label">R$2000</text>
    <text x="35" y="180" text-anchor="end" class="axis-label">R$1000</text>
    <text x="35" y="220" text-anchor="end" class="axis-label">R$0</text>
    
    <!-- Grid lines -->
    <line x1="${chartPadding}" y1="60" x2="${width - 20}" y2="60" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="100" x2="${width - 20}" y2="100" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="140" x2="${width - 20}" y2="140" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="180" x2="${width - 20}" y2="180" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    <line x1="${chartPadding}" y1="220" x2="${width - 20}" y2="220" stroke="#4b5563" stroke-width="0.5" stroke-dasharray="2,2"/>
    
    <!-- Cash flow line -->
    <path d="${pathData}" stroke="#06b6d4" stroke-width="3" fill="none"/>
    
    <!-- Points -->
    ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#06b6d4"/>`).join('')}
    
    <!-- Month label -->
    <text x="${width / 2}" y="${height - 15}" text-anchor="middle" class="day-label">May</text>
  `;
}
// Category pie chart with labels
function generateCategoryPieChart(categoryData, totalExpenses, width, height) {
    const centerX = 150;
    const centerY = 125;
    const radius = 80;
    let currentAngle = -Math.PI / 2;
    let slices = '';
    let legend = '';
    categoryData.forEach((category, index) => {
        const percentage = totalExpenses > 0 ? category.value / totalExpenses : 0;
        const sliceAngle = percentage * 2 * Math.PI;
        const endAngle = currentAngle + sliceAngle;
        const x1 = centerX + radius * Math.cos(currentAngle);
        const y1 = centerY + radius * Math.sin(currentAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        slices += `
      <path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z" 
            fill="${category.color}" stroke="#374151" stroke-width="2"/>
    `;
        // Add percentage label on slice if significant
        if (category.percentage > 15) {
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + (radius * 0.6) * Math.cos(labelAngle);
            const labelY = centerY + (radius * 0.6) * Math.sin(labelAngle);
            slices += `<text x="${labelX}" y="${labelY}" class="percentage-label" text-anchor="middle">${category.name}: ${category.percentage}%</text>`;
        }
        currentAngle = endAngle;
    });
    // Bottom legend
    categoryData.forEach((category, index) => {
        legend += `
      <circle cx="${30 + index * 100}" cy="${height - 25}" r="6" fill="${category.color}"/>
      <text x="${45 + index * 100}" y="${height - 20}" class="legend-text">${category.name}</text>
    `;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#374151" stroke="#4b5563" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" class="card-title">Despesas por Categoria</text>
    
    <!-- Pie Chart -->
    ${slices}
    
    <!-- Legend -->
    ${legend}
  `;
}
// Category detail panel
function generateCategoryDetailPanel(categoryData, width, height) {
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    let details = '';
    categoryData.forEach((category, index) => {
        details += `
      <g transform="translate(0, ${index * 40})">
        <circle cx="15" cy="15" r="6" fill="${category.color}"/>
        <text x="35" y="12" class="legend-text">${category.name}</text>
        <text x="${width - 30}" y="12" class="legend-value" text-anchor="end">${formatCurrency(category.value)}</text>
        <text x="${width - 30}" y="28" class="legend-text" text-anchor="end">${category.percentage}%</text>
      </g>
    `;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#374151" stroke="#4b5563" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" class="card-title">Detalhamento</text>
    
    <!-- Category Details -->
    <g transform="translate(20, 60)">
      ${details}
    </g>
  `;
}
// Bottom financial summary
function generateBottomSummary(totalIncome, totalExpenses, currentBalance, width, height) {
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    return `
    <!-- Summary Background -->
    <rect width="${width}" height="${height}" fill="#374151" stroke="#4b5563" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="25" class="summary-title">Resumo Financeiro</text>
    
    <!-- Income -->
    <g transform="translate(40, 35)">
      <text x="0" y="0" class="summary-label">Total de Receitas</text>
      <text x="0" y="20" class="summary-value" fill="#10b981">${formatCurrency(totalIncome)}</text>
    </g>
    
    <!-- Expenses -->
    <g transform="translate(${width / 3}, 35)">
      <text x="0" y="0" class="summary-label">Total de Despesas</text>
      <text x="0" y="20" class="summary-value" fill="#ef4444">${formatCurrency(totalExpenses)}</text>
    </g>
    
    <!-- Current Balance -->
    <g transform="translate(${(width / 3) * 2}, 35)">
      <text x="0" y="0" class="summary-label">Saldo Atual</text>
      <text x="0" y="20" class="summary-value" fill="#3b82f6">${formatCurrency(currentBalance)}</text>
    </g>
  `;
}
// Simple pie chart for Categories
function generateSimplePieChart(categoryData, totalExpenses, width, height) {
    const centerX = 200;
    const centerY = 150;
    const radius = 100;
    let currentAngle = -Math.PI / 2;
    let slices = '';
    let legend = '';
    categoryData.forEach((category, index) => {
        const percentage = totalExpenses > 0 ? category.value / totalExpenses : 0;
        const sliceAngle = percentage * 2 * Math.PI;
        const endAngle = currentAngle + sliceAngle;
        const x1 = centerX + radius * Math.cos(currentAngle);
        const y1 = centerY + radius * Math.sin(currentAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        slices += `
      <path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z" 
            fill="${category.color}" stroke="#1e293b" stroke-width="2"/>
    `;
        // Add percentage label on slice
        if (category.percentage > 10) {
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + (radius * 0.7) * Math.cos(labelAngle);
            const labelY = centerY + (radius * 0.7) * Math.sin(labelAngle);
            slices += `<text x="${labelX}" y="${labelY}" class="percentage-label" text-anchor="middle">${category.name}: ${category.percentage}%</text>`;
        }
        currentAngle = endAngle;
    });
    // Bottom legend
    categoryData.forEach((category, index) => {
        legend += `
      <rect x="${50 + index * 80}" y="270" width="12" height="12" fill="${category.color}"/>
      <text x="${68 + index * 80}" y="282" class="legend-text">${category.name}</text>
    `;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#374151" stroke-width="1" rx="12"/>
    
    <!-- Title -->
    <text x="30" y="40" class="card-title">Despesas por Categoria</text>
    
    <!-- Pie Chart -->
    ${slices}
    
    <!-- Legend -->
    ${legend}
  `;
}
// Category details panel
function generateCategoryDetails(categoryData, width, height) {
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    let details = '';
    categoryData.forEach((category, index) => {
        details += `
      <g transform="translate(0, ${index * 45})">
        <circle cx="15" cy="15" r="6" fill="${category.color}"/>
        <text x="35" y="12" class="legend-text">${category.name}</text>
        <text x="${width - 40}" y="12" class="legend-value" text-anchor="end">${formatCurrency(category.value)}</text>
        <text x="${width - 40}" y="28" class="legend-text" text-anchor="end">${category.percentage}%</text>
      </g>
    `;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#374151" stroke-width="1" rx="12"/>
    
    <!-- Title -->
    <text x="30" y="40" class="card-title">Detalhamento</text>
    
    <!-- Category Details -->
    <g transform="translate(30, 70)">
      ${details}
    </g>
  `;
}
// Financial summary row
function generateFinancialSummaryRow(totalIncome, totalExpenses, currentBalance, width, height) {
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    return `
    <!-- Summary Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#374151" stroke-width="1" rx="12"/>
    
    <!-- Title -->
    <text x="30" y="40" class="summary-title">Resumo Financeiro</text>
    
    <!-- Income -->
    <g transform="translate(50, 60)">
      <text x="0" y="0" class="summary-label">Total de Receitas</text>
      <text x="0" y="30" class="summary-value" fill="#10b981">${formatCurrency(totalIncome)}</text>
    </g>
    
    <!-- Expenses -->
    <g transform="translate(${width / 3 + 50}, 60)">
      <text x="0" y="0" class="summary-label">Total de Despesas</text>
      <text x="0" y="30" class="summary-value" fill="#ef4444">${formatCurrency(totalExpenses)}</text>
    </g>
    
    <!-- Current Balance -->
    <g transform="translate(${(width / 3) * 2 + 50}, 60)">
      <text x="0" y="0" class="summary-label">Saldo Atual</text>
      <text x="0" y="30" class="summary-value" fill="#3b82f6">${formatCurrency(currentBalance)}</text>
    </g>
  `;
}
function generateFinancialSummaryCard(totalIncome, totalExpenses, currentBalance, width, height) {
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1a1a1a" stroke="#333" stroke-width="1" rx="12"/>
    
    <!-- Title -->
    <text x="20" y="35" class="card-title">Resumo Financeiro</text>
    
    <!-- Income Section -->
    <g transform="translate(60, 80)">
      <text x="0" y="0" class="card-text">Total de Receitas</text>
      <text x="0" y="30" class="value-text" fill="#22d3ee">${formatCurrency(totalIncome)}</text>
    </g>
    
    <!-- Expenses Section -->
    <g transform="translate(${width / 2}, 80)">
      <text x="0" y="0" class="card-text">Total de Despesas</text>
      <text x="0" y="30" class="value-text" fill="#f87171">${formatCurrency(totalExpenses)}</text>
    </g>
    
    <!-- Balance Section -->
    <g transform="translate(${width - 300}, 80)">
      <text x="0" y="0" class="card-text">Saldo Atual</text>
      <text x="0" y="30" class="value-text" fill="#a78bfa">${formatCurrency(currentBalance)}</text>
    </g>
  `;
}
function generateBarChart(weeklyData, width, height) {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(...weeklyData.map(d => Math.max(d.income, d.expense)));
    const scale = chartHeight / (maxValue || 1);
    const barWidth = chartWidth / weeklyData.length;
    let bars = '';
    let labels = '';
    weeklyData.forEach((data, index) => {
        const x = index * barWidth;
        const incomeHeight = data.income * scale;
        const expenseHeight = data.expense * scale;
        // Income bar (green)
        bars += `<rect x="${x + barWidth * 0.1}" y="${chartHeight - incomeHeight}" width="${barWidth * 0.35}" height="${incomeHeight}" fill="#22d3ee" />`;
        // Expense bar (red)
        bars += `<rect x="${x + barWidth * 0.55}" y="${chartHeight - expenseHeight}" width="${barWidth * 0.35}" height="${expenseHeight}" fill="#f87171" />`;
        // Day label
        labels += `<text x="${x + barWidth / 2}" y="${chartHeight + 30}" text-anchor="middle" font-family="Arial" font-size="12" fill="#94a3b8">${data.day}</text>`;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" font-family="Arial" font-size="18" font-weight="bold" fill="white">Receitas vs Despesas</text>
    
    <!-- Chart -->
    <g transform="translate(${margin.left}, ${margin.top})">
      ${bars}
      ${labels}
    </g>
    
    <!-- Legend -->
    <g transform="translate(20, ${height - 30})">
      <rect x="0" y="-10" width="12" height="12" fill="#22d3ee"/>
      <text x="20" y="0" font-family="Arial" font-size="12" fill="#94a3b8">Receitas</text>
      <rect x="80" y="-10" width="12" height="12" fill="#f87171"/>
      <text x="100" y="0" font-family="Arial" font-size="12" fill="#94a3b8">Despesas</text>
    </g>
  `;
}
function generateLineChart(weeklyData, width, height) {
    const margin = { top: 60, right: 40, bottom: 80, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    let cumulativeBalance = 0;
    const points = [];
    weeklyData.forEach((data, index) => {
        cumulativeBalance += data.income - data.expense;
        const x = (index / (weeklyData.length - 1)) * chartWidth;
        const y = chartHeight - (cumulativeBalance > 0 ? (cumulativeBalance / 5000) * chartHeight : 0);
        points.push({ x, y: Math.max(0, Math.min(chartHeight, y)), balance: cumulativeBalance });
    });
    const pathData = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" font-family="Arial" font-size="18" font-weight="bold" fill="white">Fluxo de Caixa</text>
    
    <!-- Chart -->
    <g transform="translate(${margin.left}, ${margin.top})">
      <path d="${pathData}" stroke="#22d3ee" stroke-width="3" fill="none"/>
      ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#22d3ee"/>`).join('')}
    </g>
  `;
}
function generatePieChart(categoryData, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.25;
    let currentAngle = 0;
    const total = categoryData.reduce((sum, cat) => sum + cat.value, 0);
    let slices = '';
    let legend = '';
    categoryData.forEach((category, index) => {
        const sliceAngle = (category.value / total) * 2 * Math.PI;
        const endAngle = currentAngle + sliceAngle;
        const x1 = centerX + radius * Math.cos(currentAngle);
        const y1 = centerY + radius * Math.sin(currentAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);
        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
        slices += `
      <path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z" 
            fill="${category.color}" stroke="#1e293b" stroke-width="2"/>
    `;
        // Legend
        const legendY = height - 120 + (index * 25);
        legend += `
      <rect x="${width - 200}" y="${legendY - 8}" width="12" height="12" fill="${category.color}"/>
      <text x="${width - 180}" y="${legendY + 2}" font-family="Arial" font-size="12" fill="#94a3b8">${category.name}</text>
      <text x="${width - 20}" y="${legendY + 2}" text-anchor="end" font-family="Arial" font-size="12" fill="#94a3b8">R$ ${category.value.toFixed(2)}</text>
    `;
        currentAngle = endAngle;
    });
    return `
    <!-- Card Background -->
    <rect width="${width}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" font-family="Arial" font-size="18" font-weight="bold" fill="white">Despesas por Categoria</text>
    
    <!-- Pie Chart -->
    ${slices}
    
    <!-- Legend -->
    <text x="${width - 200}" y="50" font-family="Arial" font-size="14" font-weight="bold" fill="white">Detalhamento</text>
    ${legend}
  `;
}
function generateSummaryCard(totalIncome, totalExpenses, currentBalance, width, height) {
    const formatCurrency = (value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    return `
    <!-- Card Background -->
    <rect width="${width * 2 + 60}" height="${height}" fill="#1e293b" stroke="#334155" stroke-width="1" rx="8"/>
    
    <!-- Title -->
    <text x="20" y="30" font-family="Arial" font-size="18" font-weight="bold" fill="white">Resumo Financeiro</text>
    
    <!-- Income -->
    <g transform="translate(40, 80)">
      <text x="0" y="0" font-family="Arial" font-size="14" fill="#94a3b8">Total de Receitas</text>
      <text x="0" y="30" font-family="Arial" font-size="32" font-weight="bold" fill="#22d3ee">${formatCurrency(totalIncome)}</text>
    </g>
    
    <!-- Expenses -->
    <g transform="translate(${width / 2 + 60}, 80)">
      <text x="0" y="0" font-family="Arial" font-size="14" fill="#94a3b8">Total de Despesas</text>
      <text x="0" y="30" font-family="Arial" font-size="32" font-weight="bold" fill="#f87171">${formatCurrency(totalExpenses)}</text>
    </g>
    
    <!-- Balance -->
    <g transform="translate(${width + 120}, 80)">
      <text x="0" y="0" font-family="Arial" font-size="14" fill="#94a3b8">Saldo Atual</text>
      <text x="0" y="30" font-family="Arial" font-size="32" font-weight="bold" fill="#a78bfa">${formatCurrency(currentBalance)}</text>
    </g>
  `;
}
