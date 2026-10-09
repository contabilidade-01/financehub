import { sql, type SQL } from "drizzle-orm";

/**
 * Lançamento PJ que movimenta (ou vai movimentar) o caixa de um banco.
 *
 * `movimenta_caixa` só vira true na baixa para contas a receber/pagar criadas
 * pelo ERP e para mensalidades em boleto; enquanto Pendente, elas ficariam de
 * fora da projeção e de Vencimentos. Compra no cartão continua fora (sai no
 * vencimento da fatura) e reembolso pessoal pendente continua fora (é dívida
 * com a pessoa, tratado à parte).
 */
export function condicaoCaixaPj(alias = "t"): SQL {
  const a = sql.raw(alias);
  return sql`(
    COALESCE(${a}.movimenta_caixa, true) = true
    OR (
      ${a}.status = 'Pendente'
      AND ${a}.cartao_id IS NULL
      AND ${a}.fatura_id IS NULL
      AND COALESCE(${a}.reembolso_pessoal, false) = false
    )
  )`;
}

/** Data em que o dinheiro efetivamente entrou/saiu (caixa). */
export function dataCaixaPj(alias = "t"): SQL {
  const a = sql.raw(alias);
  return sql`(CASE WHEN ${a}.cartao_id IS NULL THEN COALESCE(${a}.data_pagamento, ${a}.data_transacao) ELSE ${a}.data_transacao END)`;
}
