/**
 * Estado pendente da conversa no WhatsApp ("em qual meio foi?", "quer criar a
 * conta X?", "repetir a última despesa?").
 *
 * Antes: Map em memória — perdia tudo num restart/deploy e não funcionava com
 * mais de uma réplica. Agora: mesma interface de Map (set/get/delete, síncrona
 * para quem já usa), com gravação no banco (write-through) e recarga do banco
 * no início de cada mensagem (hidratarPendencias).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

type ComExpiracao = { expiresAt: number };

const lojas = new Map<string, Map<number, ComExpiracao>>();
// Última gravação local por tipo/usuário: a gravação no banco é assíncrona, então
// a recarga não apaga o que acabou de ser gravado aqui e ainda não chegou lá.
const gravadoEm = new Map<string, number>();
const JANELA_GRAVACAO_MS = 5000;

function persistir(tipo: string, userId: number, valor: ComExpiracao | null): void {
  if (!db) return; // sem banco (testes unitários): só memória
  const op = valor
    ? db.execute(sql`
        INSERT INTO ia_pendencias (usuario_id, tipo, dados, expira_em)
        VALUES (${userId}, ${tipo}, ${JSON.stringify(valor)}::jsonb, to_timestamp(${valor.expiresAt / 1000}))
        ON CONFLICT (usuario_id, tipo)
        DO UPDATE SET dados = EXCLUDED.dados, expira_em = EXCLUDED.expira_em
      `)
    : db.execute(sql`DELETE FROM ia_pendencias WHERE usuario_id = ${userId} AND tipo = ${tipo}`);
  op.catch((err: any) => console.warn(`[IA pendências] falha ao gravar ${tipo}/${userId}:`, err?.message));
}

/** Loja de pendências de um tipo, com a mesma API de Map usada antes. */
export function criarPendencias<T extends ComExpiracao>(tipo: string) {
  const mapa = new Map<number, ComExpiracao>();
  lojas.set(tipo, mapa);
  return {
    get(userId: number): T | undefined {
      const v = mapa.get(userId) as T | undefined;
      if (v && Date.now() > v.expiresAt) {
        mapa.delete(userId);
        persistir(tipo, userId, null);
        return undefined;
      }
      return v;
    },
    set(userId: number, valor: T): void {
      mapa.set(userId, valor);
      gravadoEm.set(`${tipo}:${userId}`, Date.now());
      persistir(tipo, userId, valor);
    },
    delete(userId: number): void {
      mapa.delete(userId);
      persistir(tipo, userId, null);
    },
  };
}

/** Carrega do banco as pendências válidas do usuário (após restart ou vindas de outra réplica). */
export async function hidratarPendencias(userId: number): Promise<void> {
  if (!db) return;
  try {
    const rows = (await db.execute(sql`
      SELECT tipo, dados FROM ia_pendencias
      WHERE usuario_id = ${userId} AND expira_em > now()
    `)) as any[];
    const vistos = new Set<string>();
    for (const r of rows) {
      const mapa = lojas.get(String(r.tipo));
      if (!mapa) continue;
      vistos.add(String(r.tipo));
      const dados = typeof r.dados === "string" ? JSON.parse(r.dados) : r.dados;
      mapa.set(userId, dados);
    }
    // O banco é a fonte da verdade: o que não está lá foi resolvido em outra réplica.
    for (const [tipo, mapa] of lojas) {
      if (vistos.has(tipo)) continue;
      const recente = Date.now() - (gravadoEm.get(`${tipo}:${userId}`) || 0) < JANELA_GRAVACAO_MS;
      if (!recente) mapa.delete(userId);
    }
  } catch (err: any) {
    console.warn("[IA pendências] falha ao hidratar:", err?.message);
  }
}
