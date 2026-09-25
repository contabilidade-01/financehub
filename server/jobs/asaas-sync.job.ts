/**
 * Asaas Sync — rede de segurança do webhook de pagamentos. Confere no Asaas
 * quem pagou e ainda não teve o acesso liberado (webhook perdido, fila
 * pausada, token trocado). Inicializado em server/index.ts.
 *
 * Roda a cada 30 minutos. A conferência manual ("Conferir pagamento" no
 * admin, "Já paguei" do cliente) conta como feita: a automática daquele
 * cliente só volta 30 minutos depois dela.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { getSubscriptionService } from "../services/subscription.service";

const CHECK_INTERVAL = 30 * 60 * 1000;
// Quem foi conferido (manual ou automático) há menos disso é pulado. Um pouco
// abaixo de 30 min para a rodada seguinte não pular por segundos.
export const JANELA_CONFERENCIA_MIN = 28;
const MAX_POR_RODADA = 200;
let jobInterval: NodeJS.Timeout | null = null;
let rodando = false;

/**
 * Clientes com cadastro no Asaas cujo acesso não está garantido pelos próximos
 * 5 dias e que não foram conferidos (manual ou automático) na última meia hora.
 */
async function candidatos(): Promise<number[]> {
  const { garantirTabelaConferencias } = await import("../services/subscription.service");
  await garantirTabelaConferencias();
  const rows = (await db.execute(sql`
    SELECT u.id
    FROM usuarios u
    JOIN asaas_customers c ON c.usuario_id = u.id
    LEFT JOIN asaas_conferencias k ON k.usuario_id = u.id
    WHERE (k.conferido_em IS NULL OR k.conferido_em < now() - make_interval(mins => ${JANELA_CONFERENCIA_MIN}))
      AND EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.usuario_id = u.id AND s.asaas_subscription_id IS NOT NULL)
      AND (
        u.status_assinatura IS DISTINCT FROM 'ativa'
        OR u.data_expiracao_assinatura IS NULL
        OR u.data_expiracao_assinatura < now() + interval '5 days'
      )
    ORDER BY k.conferido_em NULLS FIRST, u.id
    LIMIT ${MAX_POR_RODADA}
  `)) as any[];
  return rows.map((r) => Number(r.id));
}

export async function sincronizarPagamentosAsaasTodos(): Promise<{ revisados: number; ativados: number; falhas: number }> {
  const svc = getSubscriptionService(storage);
  const ids = await candidatos();
  let ativados = 0;
  let falhas = 0;
  for (const id of ids) {
    try {
      const r = await svc.sincronizarPagamentosAsaas(id);
      if (r.ativado) ativados++;
    } catch (err: any) {
      falhas++;
      console.warn(`[AsaasSync] user ${id}:`, err?.message || err);
    }
  }
  return { revisados: ids.length, ativados, falhas };
}

async function run(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const r = await sincronizarPagamentosAsaasTodos();
    if (r.ativados || r.falhas) console.log(`[AsaasSync] ${r.revisados} revisado(s), ${r.ativados} liberado(s), ${r.falhas} falha(s)`);
  } catch (err: any) {
    console.error("[AsaasSync] ❌ Erro na sincronização:", err?.message || err);
  } finally {
    rodando = false;
  }
}

export function initializeAsaasSync(): void {
  console.log("[AsaasSync] ✅ Conferência de pagamentos no Asaas inicializada (intervalo: 30min)");
  setTimeout(run, 2 * 60 * 1000);
  jobInterval = setInterval(run, CHECK_INTERVAL);
}

export function stopAsaasSync(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
}
