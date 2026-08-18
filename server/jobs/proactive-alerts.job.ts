/**
 * Proactive Alerts Job — roda periodicamente e envia mensagens via UazAPI
 * para usuários com situações relevantes.
 *
 * Alertas:
 * 1. Orçamento: gasto atingiu 80%+ do limite definido
 * 2. Resumo semanal: toda segunda de manhã
 * 3. Lembrete de vencimento: 3 dias antes
 * 4. Anomalias: gasto 2x+ acima da média em categoria
 *
 * Inicializado no bootstrap do app (server/index.ts).
 * Usa setInterval (sem dependência de node-cron).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { uazapiService } from "../services/uazapi.service";

// Config
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";

interface UserWithWallet {
  id: number;
  nome: string;
  remotejid: string;
  wallet_id: number;
}

// Buscar usuários ativos com remotejid (WhatsApp)
async function getActiveUsersWithWhatsApp(): Promise<UserWithWallet[]> {
  const rows = await db.execute(sql`
    SELECT u.id, u.nome, u.remotejid, c.id AS wallet_id
    FROM usuarios u
    JOIN carteiras c ON c.usuario_id = u.id
    WHERE u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
      AND u.remotejid NOT LIKE '%@g.us'
  `);
  return (rows as any[]).map(r => ({
    id: r.id,
    nome: r.nome,
    remotejid: r.remotejid,
    wallet_id: r.wallet_id
  }));
}

// ============================================
// 1. ALERTA DE ORÇAMENTO (80%+)
// ============================================
async function checkBudgetAlerts(): Promise<void> {
  console.log("[Alerts] Verificando orçamentos...");

  const rows = await db.execute(sql`
    SELECT
      m.usuario_id, m.titulo, m.valor_alvo,
      c.nome AS categoria,
      u.remotejid, u.nome AS user_nome,
      COALESCE(SUM(t.valor::numeric), 0) AS gasto
    FROM metas_financeiras m
    JOIN usuarios u ON m.usuario_id = u.id
    JOIN categorias c ON m.categoria_id = c.id
    LEFT JOIN carteiras w ON w.usuario_id = u.id
    LEFT JOIN transacoes t ON t.carteira_id = w.id
      AND t.categoria_id = m.categoria_id
      AND t.tipo = 'Despesa'
      AND t.data_transacao >= date_trunc('month', CURRENT_DATE)::date
      AND t.data_transacao <= CURRENT_DATE
    WHERE m.tipo = 'limite_categoria'
      AND m.ativo = true
      AND u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
    GROUP BY m.id, m.usuario_id, m.titulo, m.valor_alvo, c.nome, u.remotejid, u.nome
  `);

  for (const row of rows as any[]) {
    const limite = parseFloat(row.valor_alvo) || 0;
    const gasto = parseFloat(row.gasto) || 0;
    const pct = limite > 0 ? (gasto / limite) * 100 : 0;

    if (pct >= 80 && row.remotejid) {
      const status = pct >= 100 ? "🚨 ESTOURADO" : "⚠️ ATENÇÃO";
      const msg = `${status}\n\n*Orçamento de ${row.categoria}*\n💸 Gasto: R$ ${gasto.toFixed(2)} / R$ ${limite.toFixed(2)}\n📊 ${Math.round(pct)}% do limite\n\n${pct >= 100 ? "Você ultrapassou o limite definido!" : "Fique atento — está chegando no limite!"}`;

      try {
        await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, row.remotejid, msg);
        console.log(`[Alerts] Orçamento: enviado para ${row.user_nome} (${row.categoria}: ${Math.round(pct)}%)`);
      } catch (err: any) {
        console.error(`[Alerts] Erro ao enviar alerta orçamento:`, err.message);
      }
    }
  }
}

// ============================================
// 2. RESUMO SEMANAL (toda segunda)
// ============================================
async function sendWeeklySummary(): Promise<void> {
  const now = new Date();
  // Só roda na segunda-feira entre 8h e 9h (SP)
  const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  if (spNow.getDay() !== 1 || spNow.getHours() < 8 || spNow.getHours() > 9) return;

  console.log("[Alerts] Enviando resumo semanal...");

  const users = await getActiveUsersWithWhatsApp();

  for (const user of users) {
    try {
      // Semana passada (seg-dom)
      const monday = new Date(spNow);
      monday.setDate(spNow.getDate() - 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const de = monday.toISOString().slice(0, 10);
      const ate = sunday.toISOString().slice(0, 10);

      const rows = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS receita,
          COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor::numeric ELSE 0 END), 0) AS despesa,
          COUNT(*) AS qtd
        FROM transacoes
        WHERE carteira_id = ${user.wallet_id}
          AND data_transacao >= ${de}
          AND data_transacao <= ${ate}
      `);

      const row = (rows as any[])[0];
      const receita = parseFloat(row?.receita) || 0;
      const despesa = parseFloat(row?.despesa) || 0;
      const saldo = receita - despesa;

      // Só envia se tiver transações na semana
      if (parseInt(row?.qtd) === 0) continue;

      const emoji = saldo >= 0 ? "✅" : "🔴";
      const msg = `📊 *Resumo Semanal*\n🗓 ${de} a ${ate}\n\n💰 Receitas: R$ ${receita.toFixed(2)}\n💸 Despesas: R$ ${despesa.toFixed(2)}\n${emoji} Saldo: R$ ${saldo.toFixed(2)}\n📝 ${row.qtd} transações\n\nBoa semana! 🚀`;

      await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, user.remotejid, msg);
      console.log(`[Alerts] Resumo semanal enviado para ${user.nome}`);
    } catch (err: any) {
      console.error(`[Alerts] Erro resumo semanal para ${user.nome}:`, err.message);
    }
  }
}

// ============================================
// 3. LEMBRETE DE VENCIMENTO (3 dias antes)
// ============================================
async function checkUpcomingReminders(): Promise<void> {
  console.log("[Alerts] Verificando lembretes próximos...");

  const rows = await db.execute(sql`
    SELECT l.id, l.titulo, l.descricao, l.data_lembrete,
           u.remotejid, u.nome AS user_nome
    FROM lembretes l
    JOIN usuarios u ON l.usuario_id = u.id
    WHERE l.concluido = false
      AND u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
      AND l.data_lembrete >= CURRENT_DATE
      AND l.data_lembrete <= CURRENT_DATE + INTERVAL '3 days'
  `);

  for (const row of rows as any[]) {
    const dataFormatada = new Date(row.data_lembrete).toLocaleDateString("pt-BR");
    const diasRestantes = Math.ceil((new Date(row.data_lembrete).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const urgencia = diasRestantes <= 1 ? "🚨" : "🔔";

    const msg = `${urgencia} *Lembrete*\n\n*${row.titulo}*\n${row.descricao ? row.descricao + "\n" : ""}🗓 Vence em: ${dataFormatada} (${diasRestantes <= 0 ? "HOJE" : `${diasRestantes} dia(s)`})`;

    try {
      await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, row.remotejid, msg);
      console.log(`[Alerts] Lembrete enviado para ${row.user_nome}: "${row.titulo}"`);
    } catch (err: any) {
      console.error(`[Alerts] Erro lembrete:`, err.message);
    }
  }
}

// ============================================
// 4. DETECÇÃO DE ANOMALIAS (2x+ a média)
// ============================================
async function checkSpendingAnomalies(): Promise<void> {
  // Só roda no dia 15 e último dia do mês (2x/mês)
  const now = new Date();
  const day = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (day !== 15 && day !== lastDay) return;

  console.log("[Alerts] Verificando anomalias de gasto...");

  const users = await getActiveUsersWithWhatsApp();

  for (const user of users) {
    try {
      // Média mensal dos últimos 3 meses por categoria
      const rows = await db.execute(sql`
        WITH monthly_by_cat AS (
          SELECT
            c.nome AS categoria,
            date_trunc('month', t.data_transacao::timestamp) AS mes,
            SUM(t.valor::numeric) AS total
          FROM transacoes t
          JOIN categorias c ON t.categoria_id = c.id
          WHERE t.carteira_id = ${user.wallet_id}
            AND t.tipo = 'Despesa'
            AND t.data_transacao >= (CURRENT_DATE - INTERVAL '3 months')
            AND t.data_transacao < date_trunc('month', CURRENT_DATE)
          GROUP BY c.nome, date_trunc('month', t.data_transacao::timestamp)
        ),
        avg_by_cat AS (
          SELECT categoria, AVG(total) AS media_mensal
          FROM monthly_by_cat
          GROUP BY categoria
          HAVING COUNT(*) >= 2
        ),
        current_month AS (
          SELECT
            c.nome AS categoria,
            SUM(t.valor::numeric) AS gasto_atual
          FROM transacoes t
          JOIN categorias c ON t.categoria_id = c.id
          WHERE t.carteira_id = ${user.wallet_id}
            AND t.tipo = 'Despesa'
            AND t.data_transacao >= date_trunc('month', CURRENT_DATE)::date
          GROUP BY c.nome
        )
        SELECT cm.categoria, cm.gasto_atual, ac.media_mensal
        FROM current_month cm
        JOIN avg_by_cat ac ON cm.categoria = ac.categoria
        WHERE cm.gasto_atual >= ac.media_mensal * 2
      `);

      if ((rows as any[]).length === 0) continue;

      let msg = "📈 *Alerta de Gastos Acima do Normal*\n\n";
      for (const row of rows as any[]) {
        const gasto = parseFloat(row.gasto_atual).toFixed(2);
        const media = parseFloat(row.media_mensal).toFixed(2);
        const mult = (parseFloat(row.gasto_atual) / parseFloat(row.media_mensal)).toFixed(1);
        msg += `⚠️ *${row.categoria}*: R$ ${gasto} (${mult}x a média de R$ ${media})\n`;
      }
      msg += "\nQuer que eu detalhe alguma dessas categorias?";

      await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, user.remotejid, msg);
      console.log(`[Alerts] Anomalia detectada para ${user.nome}: ${(rows as any[]).length} categoria(s)`);
    } catch (err: any) {
      console.error(`[Alerts] Erro anomalia para ${user.nome}:`, err.message);
    }
  }
}

// ============================================
// MAIN — inicializa o loop de alertas
// ============================================
let alertInterval: NodeJS.Timeout | null = null;

export function initializeAlerts(): void {
  if (!UAZAPI_TOKEN) {
    console.log("[Alerts] ⚠️ UAZAPI_TOKEN não configurado — alertas proativos desativados.");
    return;
  }

  console.log("[Alerts] ✅ Alertas proativos inicializados (intervalo: 1h)");

  // Primeira execução após 5 minutos (dar tempo do app estabilizar)
  setTimeout(runAllChecks, 5 * 60 * 1000);

  // Loop a cada 1 hora
  alertInterval = setInterval(runAllChecks, CHECK_INTERVAL);
}

async function runAllChecks(): Promise<void> {
  console.log("[Alerts] Executando verificações...");
  try {
    await checkBudgetAlerts();
    await sendWeeklySummary();
    await checkUpcomingReminders();
    await checkSpendingAnomalies();
    console.log("[Alerts] ✅ Verificações concluídas.");
  } catch (err: any) {
    console.error("[Alerts] ❌ Erro nas verificações:", err.message);
  }
}

export function stopAlerts(): void {
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
    console.log("[Alerts] Parado.");
  }
}
