"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAlerts = initializeAlerts;
exports.stopAlerts = stopAlerts;
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const uazapi_service_1 = require("../services/uazapi.service");
const admin_notify_1 = require("../services/admin-notify");
// Config
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";
// Horário de São Paulo — alertas ao cliente só saem em horário comercial (8h–20h),
// e uma vez por dia (hora 9), para nunca enviar de madrugada nem repetir de hora em hora.
const HORA_ALERTAS = 9; // hora do dia (SP) em que os alertas ao cliente são enviados
function nowSP() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}
// Buscar usuários ativos com remotejid (WhatsApp)
async function getActiveUsersWithWhatsApp() {
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT u.id, u.nome, u.remotejid, u.tipo_pessoa, c.id AS wallet_id
    FROM usuarios u
    JOIN carteiras c ON c.usuario_id = u.id
    WHERE u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
      AND u.remotejid NOT LIKE '%@g.us'
  `);
    return rows.map((r) => {
        var _a;
        return ({
            id: r.id,
            nome: r.nome,
            remotejid: r.remotejid,
            wallet_id: r.wallet_id,
            tipo_pessoa: (_a = r.tipo_pessoa) !== null && _a !== void 0 ? _a : null,
        });
    });
}
// ============================================
// 1. ALERTA DE ORÇAMENTO (80%+)
// ============================================
async function checkBudgetAlerts() {
    console.log("[Alerts] Verificando orçamentos...");
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    for (const row of rows) {
        const limite = parseFloat(row.valor_alvo) || 0;
        const gasto = parseFloat(row.gasto) || 0;
        const pct = limite > 0 ? (gasto / limite) * 100 : 0;
        if (pct >= 80 && row.remotejid) {
            const status = pct >= 100 ? "🚨 ESTOURADO" : "⚠️ ATENÇÃO";
            const msg = `${status}\n\n*Orçamento de ${row.categoria}*\n💸 Gasto: R$ ${gasto.toFixed(2)} / R$ ${limite.toFixed(2)}\n📊 ${Math.round(pct)}% do limite\n\n${pct >= 100 ? "Você ultrapassou o limite definido!" : "Fique atento — está chegando no limite!"}`;
            try {
                await uazapi_service_1.uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, row.remotejid, msg);
                console.log(`[Alerts] Orçamento: enviado para ${row.user_nome} (${row.categoria}: ${Math.round(pct)}%)`);
            }
            catch (err) {
                console.error(`[Alerts] Erro ao enviar alerta orçamento:`, err.message);
            }
        }
    }
}
// ============================================
// 1b. ALERTA DE ORÇAMENTO PJ (empresas_transacoes)
// ============================================
async function checkBudgetAlertsPJ() {
    console.log("[Alerts] Verificando orçamentos PJ...");
    // Limites de despesa do ambiente PJ: meta 'limite_categoria' com empresa_id.
    // conta_id preenchido = limite daquela conta; null = limite do TOTAL de despesas.
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    for (const row of rows) {
        const limite = parseFloat(row.valor_alvo) || 0;
        const gasto = parseFloat(row.gasto) || 0;
        const pct = limite > 0 ? (gasto / limite) * 100 : 0;
        if (pct >= 80 && row.remotejid) {
            const status = pct >= 100 ? "🚨 ESTOURADO" : "⚠️ ATENÇÃO";
            const alvoNome = row.conta_nome || row.titulo || "Despesas da empresa";
            const msg = `${status}\n\n*Limite de ${alvoNome}* (empresa)\n💸 Gasto no mês: R$ ${gasto.toFixed(2)} / R$ ${limite.toFixed(2)}\n📊 ${Math.round(pct)}% do limite\n\n${pct >= 100 ? "Você ultrapassou o limite definido!" : "Fique atento — está chegando no limite!"}`;
            try {
                await uazapi_service_1.uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, row.remotejid, msg);
                console.log(`[Alerts] Orçamento PJ: enviado para ${row.user_nome} (${alvoNome}: ${Math.round(pct)}%)`);
            }
            catch (err) {
                console.error(`[Alerts] Erro ao enviar alerta orçamento PJ:`, err.message);
            }
        }
    }
}
// ============================================
// 2. RESUMO SEMANAL (toda segunda)
// ============================================
async function sendWeeklySummary() {
    const { deveEnviarResumoSemanal, periodoSemanaAnterior, calcularResumoSemanalPf, calcularResumoSemanalPj, montarMensagemResumoSemanal, resolverEmpresaParaResumo, } = await Promise.resolve().then(() => __importStar(require("../services/resumo-semanal.service")));
    const now = new Date();
    const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    if (!deveEnviarResumoSemanal(spNow))
        return;
    console.log("[Alerts] Enviando resumo semanal...");
    const { de, ate } = periodoSemanaAnterior(spNow);
    const users = await getActiveUsersWithWhatsApp();
    for (const user of users) {
        try {
            const ehPj = String(user.tipo_pessoa || "").toLowerCase() === "juridica";
            let resumo;
            if (ehPj) {
                const emp = await resolverEmpresaParaResumo(user.id);
                if (!emp) {
                    console.log(`[Alerts] Resumo semanal: PJ ${user.nome} (id=${user.id}) sem empresa — não envia resumo PF.`);
                    continue;
                }
                resumo = await calcularResumoSemanalPj(emp.id, de, ate, emp.nome);
                console.log(`[Alerts] Resumo PJ empresa=${emp.id} (${emp.nome}) user=${user.id} qtd=${resumo.qtd}`);
            }
            else {
                resumo = await calcularResumoSemanalPf(user.wallet_id, de, ate);
            }
            if (resumo.qtd === 0)
                continue;
            const msg = montarMensagemResumoSemanal(resumo);
            await uazapi_service_1.uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, user.remotejid, msg);
            console.log(`[Alerts] Resumo semanal enviado para ${user.nome} (${resumo.escopo})`);
        }
        catch (err) {
            console.error(`[Alerts] Erro resumo semanal para ${user.nome}:`, err.message);
        }
    }
}
// ============================================
// 3. LEMBRETE DE VENCIMENTO (3 dias antes)
// ============================================
async function checkUpcomingReminders() {
    console.log("[Alerts] Verificando lembretes próximos...");
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    for (const row of rows) {
        const dataFormatada = new Date(row.data_lembrete).toLocaleDateString("pt-BR");
        const diasRestantes = Math.ceil((new Date(row.data_lembrete).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const urgencia = diasRestantes <= 1 ? "🚨" : "🔔";
        const msg = `${urgencia} *Lembrete*\n\n*${row.titulo}*\n${row.descricao ? row.descricao + "\n" : ""}🗓 Vence em: ${dataFormatada} (${diasRestantes <= 0 ? "HOJE" : `${diasRestantes} dia(s)`})`;
        try {
            await uazapi_service_1.uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, row.remotejid, msg);
            console.log(`[Alerts] Lembrete enviado para ${row.user_nome}: "${row.titulo}"`);
        }
        catch (err) {
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
async function checkDegustacaoExpirada() {
    console.log("[Alerts] Verificando degustações expiradas...");
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, nome, remotejid, telefone
    FROM usuarios
    WHERE status_assinatura = 'degustacao'
      AND ativo = true
      AND data_expiracao_assinatura IS NOT NULL
      AND data_expiracao_assinatura < NOW()
  `);
    for (const u of rows) {
        try {
            await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE usuarios SET ativo = false, status_assinatura = 'degustacao_expirada' WHERE id = ${u.id}`);
            if (u.remotejid && !String(u.remotejid).includes("@g.us")) {
                const nome = String(u.nome || "").split(" ")[0];
                await uazapi_service_1.uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, u.remotejid, `Oi ${nome}! Seus *15 dias* de degustação chegaram ao fim. 🙌\n\nNossa equipe vai entrar em contato para você continuar. Qualquer coisa, estou por aqui!`);
            }
            await (0, admin_notify_1.notificarAdmin)(`⏰ Degustação EXPIRADA — validar/contatar: ${u.nome} (${u.telefone || u.remotejid}) id=${u.id}`);
        }
        catch (err) {
            console.error(`[Alerts] Erro degustação expirada (user ${u.id}):`, err.message);
        }
    }
}
// ============================================
// 6. ASSINATURAS VENCIDAS (proativo — marca e avisa o admin uma única vez)
// ============================================
async function checkAssinaturasVencidas() {
    console.log("[Alerts] Verificando assinaturas vencidas...");
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, nome, telefone, ciclo_assinatura
    FROM usuarios
    WHERE status_assinatura = 'ativa'
      AND ciclo_assinatura IS NOT NULL
      AND data_expiracao_assinatura IS NOT NULL
      AND data_expiracao_assinatura < NOW()
  `);
    for (const u of rows) {
        try {
            await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE usuarios SET status_assinatura = 'vencida' WHERE id = ${u.id}`);
            await (0, admin_notify_1.notificarAdmin)(`💳 Assinatura VENCIDA (${u.ciclo_assinatura}) — cobrar/renovar: ${u.nome} (${u.telefone}) id=${u.id}`);
        }
        catch (err) {
            console.error(`[Alerts] Erro assinatura vencida (user ${u.id}):`, err.message);
        }
    }
}
// ============================================
// MAIN — inicializa o loop de alertas
// ============================================
let alertInterval = null;
function initializeAlerts() {
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
async function runAllChecks() {
    // Janela diária: alertas ao cliente só saem 1x por dia, às 9h (horário de SP).
    // Isso garante horário comercial (8h–20h) e evita repetição de hora em hora.
    const hora = nowSP().getHours();
    if (hora !== HORA_ALERTAS) {
        console.log(`[Alerts] Fora da janela diária de alertas (hora SP=${hora}, alvo=${HORA_ALERTAS}). Nada a enviar.`);
        return;
    }
    console.log("[Alerts] Executando verificações (janela diária das 9h)...");
    try {
        await checkBudgetAlerts(); // PF: % do limite de gastos definido pelo usuário
        await checkBudgetAlertsPJ(); // PJ: % do limite de gastos definido pelo usuário
        await sendWeeklySummary(); // valida internamente: segunda, 8–9h
        await checkUpcomingReminders();
        await checkDegustacaoExpirada();
        await checkAssinaturasVencidas();
        console.log("[Alerts] ✅ Verificações concluídas.");
    }
    catch (err) {
        console.error("[Alerts] ❌ Erro nas verificações:", err.message);
    }
}
function stopAlerts() {
    if (alertInterval) {
        clearInterval(alertInterval);
        alertInterval = null;
        console.log("[Alerts] Parado.");
    }
}
