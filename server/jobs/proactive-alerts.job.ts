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
import { notificarAdmin } from "../services/admin-notify";

// Config
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";

// Horário de São Paulo — alertas ao cliente só saem em horário comercial (8h–20h),
// e uma vez por dia (hora 9), para nunca enviar de madrugada nem repetir de hora em hora.
const HORA_ALERTAS = 9; // hora do dia (SP) em que os alertas ao cliente são enviados
function nowSP(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

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
      AND m.empresa_id IS NULL
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
// 1b. ALERTA DE ORÇAMENTO PJ (empresas_transacoes)
// ============================================
async function checkBudgetAlertsPJ(): Promise<void> {
  console.log("[Alerts] Verificando orçamentos PJ...");

  // Limites de despesa do ambiente PJ: meta 'limite_categoria' com empresa_id.
  // conta_id preenchido = limite daquela conta; null = limite do TOTAL de despesas.
  const rows = await db.execute(sql`
    SELECT
      m.id, m.usuario_id, m.titulo, m.valor_alvo, m.conta_id,
      ec.nome AS conta_nome,
      u.remotejid, u.nome AS user_nome,
      COALESCE(SUM(et.valor::numeric), 0) AS gasto
    FROM metas_financeiras m
    JOIN empresas e ON e.id = m.empresa_id
    JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN empresas_contas ec ON ec.id = m.conta_id
    LEFT JOIN empresas_transacoes et ON et.empresa_id = m.empresa_id
      AND et.tipo = 'Despesa'
      AND et.status = 'Efetivada'
      AND (m.conta_id IS NULL OR et.categoria_id = m.conta_id)
      AND et.data_transacao >= date_trunc('month', CURRENT_DATE)::date
      AND et.data_transacao <= CURRENT_DATE
    WHERE m.tipo = 'limite_categoria'
      AND m.ativo = true
      AND m.empresa_id IS NOT NULL
      AND u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
    GROUP BY m.id, m.usuario_id, m.titulo, m.valor_alvo, m.conta_id, ec.nome, u.remotejid, u.nome
  `);

  for (const row of rows as any[]) {
    const limite = parseFloat(row.valor_alvo) || 0;
    const gasto = parseFloat(row.gasto) || 0;
    const pct = limite > 0 ? (gasto / limite) * 100 : 0;

    if (pct >= 80 && row.remotejid) {
      const status = pct >= 100 ? "🚨 ESTOURADO" : "⚠️ ATENÇÃO";
      const alvoNome = row.conta_nome || row.titulo || "Despesas da empresa";
      const msg = `${status}\n\n*Limite de ${alvoNome}* (empresa)\n💸 Gasto no mês: R$ ${gasto.toFixed(2)} / R$ ${limite.toFixed(2)}\n📊 ${Math.round(pct)}% do limite\n\n${pct >= 100 ? "Você ultrapassou o limite definido!" : "Fique atento — está chegando no limite!"}`;

      try {
        await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, row.remotejid, msg);
        console.log(`[Alerts] Orçamento PJ: enviado para ${row.user_nome} (${alvoNome}: ${Math.round(pct)}%)`);
      } catch (err: any) {
        console.error(`[Alerts] Erro ao enviar alerta orçamento PJ:`, err.message);
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
// 4. (REMOVIDO) Alerta de "Gastos Acima do Normal" (baseado em média)
// ============================================
// A lógica antiga comparava o gasto do mês com a MÉDIA dos meses anteriores por
// categoria e disparava quando passava de 2x a média. Foi removida por:
//   - gerar falsos positivos / média imprecisa;
//   - rodar de hora em hora no dia 15 e no último dia do mês (mensagens repetidas).
// Substituída pelo alerta de % do LIMITE de gastos (checkBudgetAlerts / checkBudgetAlertsPJ),
// que usa o limite definido pelo próprio usuário e agora só envia 1x/dia, em horário comercial.

// ============================================
// 5. DEGUSTAÇÃO EXPIRADA (proativo — não espera o cliente mandar mensagem)
// ============================================
async function checkDegustacaoExpirada(): Promise<void> {
  console.log("[Alerts] Verificando degustações expiradas...");
  const rows = await db.execute(sql`
    SELECT id, nome, remotejid, telefone
    FROM usuarios
    WHERE status_assinatura = 'degustacao'
      AND ativo = true
      AND data_expiracao_assinatura IS NOT NULL
      AND data_expiracao_assinatura < NOW()
  `);
  for (const u of rows as any[]) {
    try {
      await db.execute(sql`UPDATE usuarios SET ativo = false, status_assinatura = 'degustacao_expirada' WHERE id = ${u.id}`);
      if (u.remotejid && !String(u.remotejid).includes("@g.us")) {
        const nome = String(u.nome || "").split(" ")[0];
        await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, u.remotejid,
          `Oi ${nome}! Seus *15 dias* de degustação chegaram ao fim. 🙌\n\nNossa equipe vai entrar em contato para você continuar. Qualquer coisa, estou por aqui!`);
      }
      await notificarAdmin(`⏰ Degustação EXPIRADA — validar/contatar: ${u.nome} (${u.telefone || u.remotejid}) id=${u.id}`);
    } catch (err: any) {
      console.error(`[Alerts] Erro degustação expirada (user ${u.id}):`, err.message);
    }
  }
}

// ============================================
// 6. ASSINATURAS VENCIDAS (proativo — marca e avisa o admin uma única vez)
// ============================================
async function checkAssinaturasVencidas(): Promise<void> {
  console.log("[Alerts] Verificando assinaturas vencidas...");
  const rows = await db.execute(sql`
    SELECT id, nome, telefone, ciclo_assinatura
    FROM usuarios
    WHERE status_assinatura = 'ativa'
      AND ciclo_assinatura IS NOT NULL
      AND data_expiracao_assinatura IS NOT NULL
      AND data_expiracao_assinatura < NOW()
  `);
  for (const u of rows as any[]) {
    try {
      await db.execute(sql`UPDATE usuarios SET status_assinatura = 'vencida' WHERE id = ${u.id}`);
      await notificarAdmin(`💳 Assinatura VENCIDA (${u.ciclo_assinatura}) — cobrar/renovar: ${u.nome} (${u.telefone}) id=${u.id}`);
    } catch (err: any) {
      console.error(`[Alerts] Erro assinatura vencida (user ${u.id}):`, err.message);
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
  // Janela diária: alertas ao cliente só saem 1x por dia, às 9h (horário de SP).
  // Isso garante horário comercial (8h–20h) e evita repetição de hora em hora.
  const hora = nowSP().getHours();
  if (hora !== HORA_ALERTAS) {
    console.log(`[Alerts] Fora da janela diária de alertas (hora SP=${hora}, alvo=${HORA_ALERTAS}). Nada a enviar.`);
    return;
  }

  console.log("[Alerts] Executando verificações (janela diária das 9h)...");
  try {
    await checkBudgetAlerts();      // PF: % do limite de gastos definido pelo usuário
    await checkBudgetAlertsPJ();    // PJ: % do limite de gastos definido pelo usuário
    await sendWeeklySummary();      // valida internamente: segunda, 8–9h
    await checkUpcomingReminders();
    await checkDegustacaoExpirada();
    await checkAssinaturasVencidas();
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
