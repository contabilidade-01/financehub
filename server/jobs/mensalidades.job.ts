/**
 * Mensalidades Job — gera, todo mês, os lançamentos das recorrências ativas
 * (boleto = conta a pagar; cartão = lançamento na fatura). Idempotente por mês.
 * Roda periódico (a idempotência por competência evita duplicar em reexecuções).
 * Inicializado no bootstrap do app (server/index.ts).
 */
import { gerarMensalidadesPendentes } from "../services/mensalidades.service";

const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas
let jobInterval: NodeJS.Timeout | null = null;

async function run(): Promise<void> {
  try {
    await gerarMensalidadesPendentes();
  } catch (err: any) {
    console.error("[Mensalidades] ❌ Erro ao gerar:", err?.message || err);
  }
}

export function initializeMensalidades(): void {
  console.log("[Mensalidades] ✅ Job de mensalidades inicializado (intervalo: 6h)");
  // Primeira execução após 2 minutos (deixa o app estabilizar / migração rodar).
  setTimeout(run, 2 * 60 * 1000);
  jobInterval = setInterval(run, CHECK_INTERVAL);
}

export function stopMensalidades(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    console.log("[Mensalidades] Parado.");
  }
}
