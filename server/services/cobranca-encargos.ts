/**
 * Multa e juros das mensalidades (Asaas). Padrão: 2% de multa e 1% ao mês de
 * juros — limites usuais (CDC: multa até 2% para consumidor). O Asaas aplica
 * a multa uma vez após o vencimento e os juros pro rata dia.
 *
 * A tolerância de 3 dias do sistema é só de ACESSO; os encargos correm desde o
 * dia seguinte ao vencimento, como em qualquer boleto.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export const MULTA_PADRAO = 2;
export const JUROS_MES_PADRAO = 1;
export const MULTA_MAXIMA = 2; // CDC (clientes PF); mantém o mesmo teto para todos
export const JUROS_MES_MAXIMO = 10;

export type Encargos = { multa: number; jurosMes: number };

/** Valida e arredonda (2 casas). Lança erro com mensagem para o admin. */
export function validarEncargos(e: { multa: unknown; jurosMes: unknown }): Encargos {
  const multa = Math.round(Number(e.multa) * 100) / 100;
  const jurosMes = Math.round(Number(e.jurosMes) * 100) / 100;
  if (!Number.isFinite(multa) || multa < 0 || multa > MULTA_MAXIMA) throw new Error(`Multa deve ficar entre 0% e ${MULTA_MAXIMA}%.`);
  if (!Number.isFinite(jurosMes) || jurosMes < 0 || jurosMes > JUROS_MES_MAXIMO) throw new Error(`Juros devem ficar entre 0% e ${JUROS_MES_MAXIMO}% ao mês.`);
  return { multa, jurosMes };
}

/** Campos do Asaas (fine/interest em percentual). Zero = não envia o campo. */
export function camposAsaas(e: Encargos): { fine?: { value: number; type: "PERCENTAGE" }; interest?: { value: number } } {
  return {
    ...(e.multa > 0 ? { fine: { value: e.multa, type: "PERCENTAGE" as const } } : {}),
    ...(e.jurosMes > 0 ? { interest: { value: e.jurosMes } } : {}),
  };
}

/** Valor com encargos pago N dias depois do vencimento (mesma conta do Asaas: juros pro rata dia/30). */
export function valorComEncargos(valor: number, diasAtraso: number, e: Encargos): number {
  if (diasAtraso <= 0) return Math.round(valor * 100) / 100;
  const multa = valor * (e.multa / 100);
  const juros = valor * (e.jurosMes / 100) * (diasAtraso / 30);
  return Math.round((valor + multa + juros) * 100) / 100;
}

let tabelaPronta = false;
async function garantirTabela(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cobranca_config (
      id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      multa_pct      NUMERIC(5,2) NOT NULL DEFAULT 2,
      juros_mes_pct  NUMERIC(5,2) NOT NULL DEFAULT 1,
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`INSERT INTO cobranca_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  tabelaPronta = true;
}

export async function obterEncargos(): Promise<Encargos> {
  try {
    await garantirTabela();
    const r = ((await db.execute(sql`SELECT multa_pct, juros_mes_pct FROM cobranca_config WHERE id = 1`)) as any[])[0];
    return { multa: Number(r?.multa_pct ?? MULTA_PADRAO), jurosMes: Number(r?.juros_mes_pct ?? JUROS_MES_PADRAO) };
  } catch (err: any) {
    console.warn("[Encargos] usando padrão:", err?.message);
    return { multa: MULTA_PADRAO, jurosMes: JUROS_MES_PADRAO };
  }
}

export async function salvarEncargos(e: { multa: unknown; jurosMes: unknown }): Promise<Encargos> {
  const v = validarEncargos(e);
  await garantirTabela();
  await db.execute(sql`
    UPDATE cobranca_config SET multa_pct = ${v.multa}, juros_mes_pct = ${v.jurosMes}, atualizado_em = now() WHERE id = 1
  `);
  return v;
}

/**
 * Aplica os encargos atuais às assinaturas que já existem no Asaas e às
 * cobranças em aberto delas (updatePendingPayments).
 */
export async function aplicarEncargosAsaas(
  asaasInjetado?: { updateSubscription: (id: string, dados: any) => Promise<unknown> },
): Promise<{ total: number; atualizadas: number; falhas: { assinatura: string; motivo: string }[] }> {
  const e = await obterEncargos();
  const rows = (await db.execute(sql`
    SELECT DISTINCT asaas_subscription_id FROM user_subscriptions
    WHERE asaas_subscription_id IS NOT NULL AND status IN ('active', 'pending', 'past_due')
  `)) as any[];
  const asaas = asaasInjetado ?? (await (await import("./asaas.service")).getAsaasService());
  const campos = camposAsaas(e);
  // Zerar no Asaas = mandar 0 explicitamente.
  const payload = {
    fine: campos.fine ?? { value: 0 },
    interest: campos.interest ?? { value: 0 },
    updatePendingPayments: true,
  };
  let atualizadas = 0;
  const falhas: { assinatura: string; motivo: string }[] = [];
  for (const r of rows) {
    const id = String(r.asaas_subscription_id);
    try {
      await asaas.updateSubscription(id, payload as any);
      atualizadas++;
    } catch (err: any) {
      falhas.push({ assinatura: id, motivo: err?.response?.data?.errors?.[0]?.description || err?.message || "erro no Asaas" });
    }
  }
  console.log(`[Encargos] multa ${e.multa}% / juros ${e.jurosMes}% a.m. aplicados em ${atualizadas}/${rows.length} assinatura(s) do Asaas.`);
  return { total: rows.length, atualizadas, falhas };
}
