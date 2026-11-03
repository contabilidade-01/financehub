/**
 * Proactive Alerts Job — roda periodicamente e envia mensagens via UazAPI
 * para usuários com situações relevantes.
 *
 * Alertas:
 * 1. Lembretes: enviados NA HORA marcada (laço de 5 min), uma vez só.
 * 2. Limite de gastos (PF e PJ): avisa ao passar de 80% e de 100%, uma vez
 *    cada por limite e por mês (mesmo cálculo do recibo e da consulta).
 * 3. Contas a vencer (flag lembretes_contas_pagar): hoje e amanhã, 1x por dia.
 * 4. Resumo semanal: segunda-feira.
 *
 * Rodada diária: a 1ª checagem dentro de 9h–20h (SP) de cada dia, marcada no
 * banco (alertas_enviados) — reinício/deploy não repete nem pula o dia.
 * Inicializado no bootstrap do app (server/index.ts). Usa setInterval.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { uazapiService } from "../services/uazapi.service";
import { notificarAdmin } from "../services/admin-notify";

// Config
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";


interface UserWithWallet {
  id: number;
  nome: string;
  remotejid: string;
  wallet_id: number;
  tipo_pessoa: string | null;
}

// Buscar usuários ativos com remotejid (WhatsApp)
async function getActiveUsersWithWhatsApp(): Promise<UserWithWallet[]> {
  const rows = await db.execute(sql`
    SELECT u.id, u.nome, u.remotejid, u.tipo_pessoa, c.id AS wallet_id
    FROM usuarios u
    JOIN carteiras c ON c.usuario_id = u.id
    WHERE u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
      AND u.remotejid NOT LIKE '%@g.us'
  `);
  return (rows as any[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    remotejid: r.remotejid,
    wallet_id: r.wallet_id,
    tipo_pessoa: r.tipo_pessoa ?? null,
  }));
}

// ============================================
// Controle de envio (uma vez por chave) — sobrevive a restart e a réplicas
// ============================================
let tabelaAlertas = false;
async function garantirTabelaAlertas(): Promise<void> {
  if (tabelaAlertas) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alertas_enviados (
      usuario_id  INTEGER NOT NULL,
      chave       VARCHAR(160) NOT NULL,
      enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, chave)
    )
  `);
  const col = (await db.execute(sql`
    SELECT 1 FROM information_schema.columns WHERE table_name = 'lembretes' AND column_name = 'notificado_em'
  `)) as any[];
  if (!col.length) {
    await db.execute(sql`ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS notificado_em TIMESTAMPTZ`);
    // Na 1ª vez: o que já venceu foi tratado pelo job antigo — não reenviar.
    await db.execute(sql`UPDATE lembretes SET notificado_em = now() WHERE notificado_em IS NULL AND data_lembrete <= now()`);
  }
  tabelaAlertas = true;
}

/** true = ainda não enviado (e agora reservado). */
async function reservar(usuarioId: number, chave: string): Promise<boolean> {
  await garantirTabelaAlertas();
  const r = (await db.execute(sql`
    INSERT INTO alertas_enviados (usuario_id, chave) VALUES (${usuarioId}, ${chave})
    ON CONFLICT DO NOTHING RETURNING usuario_id
  `)) as any[];
  return r.length > 0;
}

async function liberar(usuarioId: number, chave: string): Promise<void> {
  await db.execute(sql`DELETE FROM alertas_enviados WHERE usuario_id = ${usuarioId} AND chave = ${chave}`).catch(() => {});
}

/** Envia uma vez por chave; se o envio falhar, libera para tentar na próxima rodada. */
async function enviarUmaVez(usuarioId: number, jid: string, chave: string, texto: string): Promise<boolean> {
  if (!(await reservar(usuarioId, chave))) return false;
  try {
    await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, jid, texto);
    return true;
  } catch (err: any) {
    await liberar(usuarioId, chave);
    console.error(`[Alerts] Falha ao enviar ${chave} (user ${usuarioId}):`, err?.message);
    return false;
  }
}

// ============================================
// 1. LIMITE DE GASTOS (PF e PJ) — 80% e 100%, uma vez cada por mês
// ============================================
async function checkLimitesGasto(): Promise<void> {
  const { gastoLimitePF, gastoLimitePJ, mesAtualSP } = await import("../storage");
  const { faixaLimite, textoAlertaLimite } = await import("../services/limites-gasto");
  const { de, ate } = mesAtualSP();
  const mes = de.slice(0, 7);

  const limites = (await db.execute(sql`
    SELECT m.id, m.usuario_id, m.empresa_id, m.categoria_id, m.conta_id, m.titulo, m.valor_alvo,
           c.nome AS categoria_nome, ec.nome AS conta_nome, u.remotejid
    FROM metas_financeiras m
    JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN categorias c ON c.id = m.categoria_id
    LEFT JOIN empresas_contas ec ON ec.id = m.conta_id
    LEFT JOIN empresas e ON e.id = m.empresa_id
    WHERE m.tipo = 'limite_categoria' AND m.ativo = true
      AND (m.empresa_id IS NULL OR e.usuario_id = m.usuario_id)
      AND u.ativo = true AND u.remotejid IS NOT NULL AND u.remotejid != '' AND u.remotejid NOT LIKE '%@g.us'
  `)) as any[];

  for (const l of limites) {
    try {
      const limite = parseFloat(l.valor_alvo) || 0;
      if (limite <= 0) continue;
      const ehPj = l.empresa_id != null;
      const gasto = ehPj
        ? await gastoLimitePJ(Number(l.empresa_id), l.conta_id ?? null, de, ate)
        : await gastoLimitePF(Number(l.usuario_id), l.categoria_id ?? null, de, ate);
      const faixa = faixaLimite((gasto / limite) * 100);
      if (!faixa) continue;
      const nome = ehPj
        ? l.conta_nome || (l.conta_id ? l.titulo : "Despesas da empresa")
        : l.categoria_nome || (l.categoria_id ? l.titulo : "Despesas do mês");
      // Ao estourar direto (sem ter avisado 80%), só o de 100% sai.
      const enviado = await enviarUmaVez(
        Number(l.usuario_id),
        l.remotejid,
        `limite:${l.id}:${mes}:${faixa}`,
        textoAlertaLimite({ nome, gasto, limite, faixa, empresa: ehPj }),
      );
      if (enviado && faixa === 100) await reservar(Number(l.usuario_id), `limite:${l.id}:${mes}:80`);
      if (enviado) console.log(`[Alerts] Limite ${faixa}%: user ${l.usuario_id} · ${nome}`);
    } catch (err: any) {
      console.error(`[Alerts] Erro no limite ${l.id}:`, err?.message);
    }
  }
}

// ============================================
// 1b. LEMBRETES NA HORA MARCADA (laço de 5 min)
// ============================================
export async function checkLembretesNaHora(): Promise<void> {
  await garantirTabelaAlertas();
  const { textoLembrete } = await import("../services/limites-gasto");
  // Vencidos nas últimas 48h e ainda não avisados (cobre reinício/queda do app).
  const rows = (await db.execute(sql`
    SELECT l.id, l.usuario_id, l.titulo, l.descricao, u.remotejid
    FROM lembretes l JOIN usuarios u ON u.id = l.usuario_id
    WHERE l.concluido = false AND l.notificado_em IS NULL
      AND l.data_lembrete <= now() AND l.data_lembrete > now() - interval '48 hours'
      AND u.ativo = true AND u.remotejid IS NOT NULL AND u.remotejid != '' AND u.remotejid NOT LIKE '%@g.us'
    ORDER BY l.data_lembrete
    LIMIT 200
  `)) as any[];
  for (const r of rows) {
    // "Toma" o lembrete antes de enviar: nunca sai duas vezes (nem com 2 réplicas).
    const tomado = (await db.execute(sql`
      UPDATE lembretes SET notificado_em = now() WHERE id = ${r.id} AND notificado_em IS NULL RETURNING id
    `)) as any[];
    if (!tomado.length) continue;
    try {
      await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, r.remotejid, textoLembrete(r.titulo, r.descricao));
      console.log(`[Alerts] Lembrete #${r.id} enviado (user ${r.usuario_id})`);
    } catch (err: any) {
      await db.execute(sql`UPDATE lembretes SET notificado_em = NULL WHERE id = ${r.id}`).catch(() => {});
      console.error(`[Alerts] Falha no lembrete #${r.id}:`, err?.message);
    }
  }
}

// ============================================
// 1c. CONTAS A VENCER (hoje e amanhã) — flag lembretes_contas_pagar
// ============================================
async function checkContasAVencer(): Promise<void> {
  const { flagAtiva, FLAG_LEMBRETES_CONTAS_PAGAR } = await import("../services/feature-flags.service");
  const { agoraSP, somarDias, textoContasAVencer } = await import("../services/limites-gasto");
  const hoje = agoraSP().dia;
  const amanha = somarDias(hoje, 1);

  // PF: despesa pendente com vencimento hoje/amanhã. Fora: compra no cartão
  // (pendente até a fatura) e reembolsável (gasto de terceiro).
  const pf = (await db.execute(sql`
    SELECT u.id AS usuario_id, u.remotejid, t.id, t.descricao, t.valor,
           COALESCE(t.data_vencimento, t.data_transacao)::text AS venc, NULL::text AS empresa
    FROM transacoes t
    JOIN carteiras c ON c.id = t.carteira_id
    JOIN usuarios u ON u.id = c.usuario_id
    WHERE t.tipo = 'Despesa' AND t.status = 'Pendente'
      AND t.fatura_id IS NULL AND COALESCE(t.reembolsavel, false) = false
      AND COALESCE(t.data_vencimento, t.data_transacao) IN (${hoje}::date, ${amanha}::date)
      AND u.ativo = true AND u.remotejid IS NOT NULL AND u.remotejid != '' AND u.remotejid NOT LIKE '%@g.us'
  `)) as any[];
  // PJ: contas a pagar pendentes da empresa (fora cartão e reembolso pessoal).
  const pj = (await db.execute(sql`
    SELECT u.id AS usuario_id, u.remotejid, et.id, et.descricao, et.valor,
           COALESCE(et.data_vencimento, et.data_transacao)::text AS venc,
           COALESCE(e.nome_fantasia, e.razao_social) AS empresa
    FROM empresas_transacoes et
    JOIN empresas e ON e.id = et.empresa_id
    JOIN usuarios u ON u.id = e.usuario_id
    WHERE et.tipo = 'Despesa' AND et.status = 'Pendente'
      AND et.cartao_id IS NULL AND et.fatura_id IS NULL AND COALESCE(et.reembolso_pessoal, false) = false
      AND COALESCE(et.data_vencimento, et.data_transacao) IN (${hoje}::date, ${amanha}::date)
      AND u.ativo = true AND u.remotejid IS NOT NULL AND u.remotejid != '' AND u.remotejid NOT LIKE '%@g.us'
  `)) as any[];

  const porUsuario = new Map<number, { jid: string; itens: any[] }>();
  for (const r of [...pf, ...pj]) {
    const uid = Number(r.usuario_id);
    const g: { jid: string; itens: any[] } = porUsuario.get(uid) || { jid: r.remotejid, itens: [] };
    g.itens.push({ descricao: r.descricao, valor: Number(r.valor), vencimento: String(r.venc).slice(0, 10), empresa: r.empresa });
    porUsuario.set(uid, g);
  }
  for (const [uid, g] of porUsuario) {
    try {
      if (!(await flagAtiva(FLAG_LEMBRETES_CONTAS_PAGAR, uid))) continue;
      g.itens.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
      await enviarUmaVez(uid, g.jid, `contas:${hoje}`, textoContasAVencer(g.itens.slice(0, 15), hoje));
    } catch (err: any) {
      console.error(`[Alerts] Erro contas a vencer (user ${uid}):`, err?.message);
    }
  }
}

// ============================================
// 2. RESUMO SEMANAL (toda segunda)
// ============================================
async function sendWeeklySummary(): Promise<void> {
  const {
    periodoSemanaAnterior,
    calcularResumoSemanalPf,
    calcularResumoSemanalPj,
    montarMensagemResumoSemanal,
    resolverEmpresaParaResumo,
  } = await import("../services/resumo-semanal.service");

  const now = new Date();
  const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  // Segunda-feira: a rodada diária roda 1x por dia (a partir das 9h); o
  // controle por usuário evita repetir se o processo reiniciar no meio.
  if (spNow.getDay() !== 1) return;
  const diaSemana = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);

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
          console.log(
            `[Alerts] Resumo semanal: PJ ${user.nome} (id=${user.id}) sem empresa — não envia resumo PF.`,
          );
          continue;
        }
        resumo = await calcularResumoSemanalPj(emp.id, de, ate, emp.nome);
        console.log(
          `[Alerts] Resumo PJ empresa=${emp.id} (${emp.nome}) user=${user.id} qtd=${resumo.qtd}`,
        );
      } else {
        resumo = await calcularResumoSemanalPf(user.wallet_id, de, ate);
      }

      if (resumo.qtd === 0) continue;

      const msg = montarMensagemResumoSemanal(resumo);
      if (!(await enviarUmaVez(user.id, user.remotejid, `semanal:${diaSemana}`, msg))) continue;
      console.log(`[Alerts] Resumo semanal enviado para ${user.nome} (${resumo.escopo})`);
    } catch (err: any) {
      console.error(`[Alerts] Erro resumo semanal para ${user.nome}:`, err.message);
    }
  }
}

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
        const { textoDegustacaoEncerrada, linkAssinar } = await import("../services/lembretes-cobranca");
        await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, u.remotejid, textoDegustacaoEncerrada(u.nome, linkAssinar()));
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
let lembretesInterval: NodeJS.Timeout | null = null;
const LEMBRETES_INTERVAL = 5 * 60 * 1000; // 5 min

export function initializeAlerts(): void {
  if (!UAZAPI_TOKEN) {
    console.log("[Alerts] ⚠️ UAZAPI_TOKEN não configurado — alertas proativos desativados.");
    return;
  }

  console.log("[Alerts] ✅ Alertas proativos inicializados (diário 9h–20h SP; lembretes a cada 5 min)");

  // Primeira execução após 2 minutos (dar tempo do app estabilizar)
  setTimeout(runAllChecks, 2 * 60 * 1000);
  setTimeout(() => { checkLembretesNaHora().catch((e) => console.error("[Alerts] lembretes:", e?.message)); }, 60 * 1000);

  // Rodada diária: tenta a cada 1 hora (só executa 1x por dia, ver runAllChecks)
  alertInterval = setInterval(runAllChecks, CHECK_INTERVAL);
  lembretesInterval = setInterval(() => {
    checkLembretesNaHora().catch((e) => console.error("[Alerts] lembretes:", e?.message));
  }, LEMBRETES_INTERVAL);
}

async function etapa(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    // Uma etapa com erro não impede as outras.
    console.error(`[Alerts] ❌ Erro em ${nome}:`, err?.message);
  }
}

export async function runAllChecks(): Promise<void> {
  const { agoraSP, dentroDaJanelaDiaria } = await import("../services/limites-gasto");
  const { dia, hora } = agoraSP();
  if (!dentroDaJanelaDiaria(hora)) {
    console.log(`[Alerts] Fora da janela diária (hora SP=${hora}). Nada a enviar.`);
    return;
  }
  // Uma rodada por dia: a 1ª checagem dentro da janela. Marca no banco, então
  // deploy/reinício no meio do dia não repete nem faz perder o dia.
  try {
    if (!(await reservar(0, `rodada_diaria:${dia}`))) return;
  } catch (err: any) {
    console.error("[Alerts] Não consegui marcar a rodada diária:", err?.message);
    return;
  }

  console.log(`[Alerts] Executando rodada diária de ${dia} (hora SP=${hora})...`);
  await etapa("limites de gasto", checkLimitesGasto);
  await etapa("contas a vencer", checkContasAVencer);
  await etapa("resumo semanal", sendWeeklySummary);
  await etapa("degustação expirada", checkDegustacaoExpirada);
  await etapa("lembretes de cobrança", async () => {
    const { checkLembretesCobranca } = await import("../services/lembretes-cobranca");
    await checkLembretesCobranca();
  });
  await etapa("assinaturas vencidas", checkAssinaturasVencidas);
  console.log("[Alerts] ✅ Rodada diária concluída.");
}

export function stopAlerts(): void {
  if (lembretesInterval) {
    clearInterval(lembretesInterval);
    lembretesInterval = null;
  }
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
    console.log("[Alerts] Parado.");
  }
}
