/**
 * Altera só o DIA da transação (mês/ano ficam). Recalcula a fatura do cartão
 * pelo novo dia + fechamento — conserto de “caiu uma competência à frente”
 * quando a compra estava depois do fechamento (ex.: dia 28 com fecha dia 10).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { cartaoPfDoUsuario, resolverFaturaPfPorCompetencia } from "./fatura-pf.service";
import { chaveGrupoParcela, expandirIdsComParcelasPf, type LinhaParcelaPf } from "./parcelas-grupo.service";
import { comDiaNoMes, competenciaDaCompra, competenciaMaisMeses } from "./fatura-core";

export async function alterarDiaTransacoesPf(opts: {
  userId: number;
  walletId: number;
  ids: number[];
  dia: number;
  todasParcelas: boolean;
}): Promise<{ alterados: number; extra_parcelas: number; ignorados_pagos: number; ids: number[] }> {
  const dia = Math.floor(Number(opts.dia));
  if (!(dia >= 1 && dia <= 31)) throw new Error("Informe um dia entre 1 e 31.");

  const exp = await expandirIdsComParcelasPf(opts.walletId, opts.ids);
  const linhasBase = opts.todasParcelas ? exp.linhas : exp.linhas.filter((l) => opts.ids.includes(l.id));
  if (!linhasBase.length) throw new Error("Lançamento não encontrado.");

  const faturaIds = linhasBase.map((l) => l.fatura_id).filter((x): x is number => !!x);
  const pagas = new Set<number>();
  if (faturaIds.length) {
    const listaF = sql.join(faturaIds.map((i) => sql`${i}`), sql`, `);
    const rPagas = (await db.execute(sql`
      SELECT id FROM faturas WHERE id IN (${listaF}) AND status = 'paga'
    `)) as any[];
    for (const p of rPagas) pagas.add(Number(p.id));
  }

  let ignoradosPagos = 0;
  const linhasOk = linhasBase.filter((l) => {
    if (l.fatura_id && pagas.has(l.fatura_id)) {
      ignoradosPagos++;
      return false;
    }
    return true;
  });
  if (!linhasOk.length) {
    throw new Error("Todos os lançamentos estão em fatura já paga. Reabra a fatura antes de alterar a data.");
  }

  const novas = new Map<number, string>();
  for (const l of linhasOk) {
    novas.set(l.id, comDiaNoMes(l.data_transacao, dia));
  }

  for (const l of linhasOk) {
    const nova = novas.get(l.id)!;
    const velha = String(l.data_transacao).slice(0, 10);
    const venc = l.data_vencimento ? String(l.data_vencimento).slice(0, 10) : null;
    await db.execute(sql`
      UPDATE transacoes
      SET data_transacao = ${nova}::date,
          data_vencimento = CASE
            WHEN data_vencimento IS NOT NULL AND data_vencimento::date = ${velha}::date THEN ${nova}::date
            ELSE data_vencimento
          END
      WHERE id = ${l.id} AND carteira_id = ${opts.walletId}
    `);
    if (venc && venc === velha) l.data_vencimento = nova;
    l.data_transacao = nova;
  }

  // Recalcula fatura: 1ª parcela do grupo ancora; as seguintes + i meses.
  const porGrupo = new Map<string, LinhaParcelaPf[]>();
  for (const l of linhasOk) {
    const k = chaveGrupoParcela(l);
    const arr = porGrupo.get(k) || [];
    arr.push(l);
    porGrupo.set(k, arr);
  }

  for (const arr of porGrupo.values()) {
    arr.sort((a, b) => (a.parcela_num || 1) - (b.parcela_num || 1));
    const formaId = arr[0].forma_pagamento_id;
    if (!formaId) continue;
    const cartao = await cartaoPfDoUsuario(formaId, opts.userId);
    if (!cartao) continue;
    const diaF = Number((cartao as any).dia_fechamento) || 1;
    const diaV = Number((cartao as any).dia_vencimento) || 10;
    const primeira = arr[0];
    const base = competenciaDaCompra(String(primeira.data_transacao).slice(0, 10), diaF, diaV).competencia;

    for (const l of arr) {
      let competencia = competenciaDaCompra(String(l.data_transacao).slice(0, 10), diaF, diaV).competencia;
      if (l.parcela_num && primeira.parcela_num && l.id !== primeira.id) {
        competencia = competenciaMaisMeses(base, (l.parcela_num || 1) - (primeira.parcela_num || 1));
      }
      const { fatura, competencia: comp } = await resolverFaturaPfPorCompetencia(
        opts.userId,
        opts.walletId,
        cartao as any,
        competencia,
      );
      await db.execute(sql`
        UPDATE transacoes
        SET fatura_id = ${fatura.id},
            competencia = ${comp},
            movimenta_caixa = false,
            conta_bancaria_id = NULL
        WHERE id = ${l.id} AND carteira_id = ${opts.walletId} AND tipo = 'Despesa'
      `);
    }
  }

  return {
    alterados: linhasOk.length,
    extra_parcelas: Math.max(0, (opts.todasParcelas ? exp.ids.length : opts.ids.length) - opts.ids.length),
    ignorados_pagos: ignoradosPagos,
    ids: linhasOk.map((l) => l.id),
  };
}
