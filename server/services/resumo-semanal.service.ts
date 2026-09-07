/**
 * Resumo semanal WhatsApp — PF (transacoes) e PJ (empresas_transacoes).
 * Isolado do job para testar período e filtros sem UazAPI.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

export type ResumoSemanalNums = {
  receita: number;
  despesa: number;
  saldo: number;
  qtd: number;
  de: string;
  ate: string;
  escopo: "pf" | "pj";
  empresa_id?: number;
  empresa_nome?: string;
};

/** Semana passada (seg–dom) relativa a um instante em SP. */
export function periodoSemanaAnterior(spNow: Date): { de: string; ate: string } {
  const monday = new Date(spNow);
  monday.setDate(spNow.getDate() - 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  // Usar componentes locais do Date já “em SP” (job passa spNow via toLocaleString).
  return { de: iso(monday), ate: iso(sunday) };
}

export function deveEnviarResumoSemanal(spNow: Date): boolean {
  return spNow.getDay() === 1 && spNow.getHours() >= 8 && spNow.getHours() <= 9;
}

/** Exclui quitação de fatura (mesma regra do resumo PJ). */
const NAO_PAG_FATURA_PF = sql`NOT EXISTS (
  SELECT 1 FROM faturas f WHERE f.transacao_pagamento_id = transacoes.id
)`;

export async function calcularResumoSemanalPf(
  walletId: number,
  de: string,
  ate: string,
): Promise<ResumoSemanalNums> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor::numeric ELSE 0 END), 0) AS despesa,
      COUNT(*) AS qtd
    FROM transacoes
    WHERE carteira_id = ${walletId}
      AND data_transacao >= ${de}
      AND data_transacao <= ${ate}
      AND ${NAO_PAG_FATURA_PF}
  `);
  const row = (rows as any[])[0] ?? (rows as any).rows?.[0];
  const receita = parseFloat(row?.receita) || 0;
  const despesa = parseFloat(row?.despesa) || 0;
  return {
    receita,
    despesa,
    saldo: receita - despesa,
    qtd: parseInt(String(row?.qtd || 0), 10) || 0,
    de,
    ate,
    escopo: "pf",
  };
}

export async function calcularResumoSemanalPj(
  empresaId: number,
  de: string,
  ate: string,
  empresaNome?: string,
): Promise<ResumoSemanalNums> {
  const r = await storage.getEmpresaResumo(empresaId, { de, ate });
  return {
    receita: r.entradas,
    despesa: r.total_saidas,
    saldo: r.lucro_prejuizo,
    qtd: r.total_transacoes,
    de,
    ate,
    escopo: "pj",
    empresa_id: empresaId,
    empresa_nome: empresaNome,
  };
}

export function montarMensagemResumoSemanal(r: ResumoSemanalNums): string {
  const emoji = r.saldo >= 0 ? "✅" : "🔴";
  const titulo =
    r.escopo === "pj"
      ? `📊 *Resumo Semanal* (empresa${r.empresa_nome ? `: ${r.empresa_nome}` : ""})`
      : `📊 *Resumo Semanal*`;
  return (
    `${titulo}\n🗓 ${r.de} a ${r.ate}\n\n` +
    `💰 Receitas: R$ ${r.receita.toFixed(2)}\n` +
    `💸 Despesas: R$ ${r.despesa.toFixed(2)}\n` +
    `${emoji} Saldo: R$ ${r.saldo.toFixed(2)}\n` +
    `📝 ${r.qtd} transações\n\n` +
    `Boa semana! 🚀`
  );
}

/** Resolve empresa do usuário PJ (mesma preferência do webhook). */
export async function resolverEmpresaParaResumo(usuarioId: number): Promise<{
  id: number;
  nome: string;
} | null> {
  const empresas = await storage.getEmpresasByUsuarioId(usuarioId);
  if (!empresas.length) return null;
  const comCnpj = empresas.find((e) => e.cnpj && String(e.cnpj).trim().length > 0);
  const emp = comCnpj || empresas[0];
  return {
    id: emp.id,
    nome: emp.nome_fantasia || emp.razao_social,
  };
}
