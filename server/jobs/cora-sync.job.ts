/**
 * Cora Sync — rede de segurança do webhook: a cada 30 minutos revisa as
 * cobranças em aberto das empresas conectadas e baixa as que foram pagas.
 * Inicializado no bootstrap do app (server/index.ts).
 */
import { sincronizarTudo } from "../services/cora/cora.service";

const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutos
let jobInterval: NodeJS.Timeout | null = null;
let rodando = false;

async function run(): Promise<void> {
  if (rodando) return; // uma rodada por vez
  rodando = true;
  try {
    const r = await sincronizarTudo();
    if (r.revisadas || r.falhas) console.log(`[Cora] sync: ${r.empresas} empresa(s), ${r.revisadas} revisada(s), ${r.baixadas} baixada(s), ${r.falhas} falha(s)`);
  } catch (err: any) {
    console.error("[Cora] ❌ Erro na sincronização:", err?.message || err);
  } finally {
    rodando = false;
  }
}

export function initializeCoraSync(): void {
  console.log("[Cora] ✅ Job de sincronização inicializado (intervalo: 30min)");
  setTimeout(run, 3 * 60 * 1000);
  jobInterval = setInterval(run, CHECK_INTERVAL);
}

export function stopCoraSync(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
}
