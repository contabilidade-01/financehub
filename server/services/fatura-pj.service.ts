/**
 * Fatura de cartão PJ — competência × caixa.
 *
 * Compras no cartão entram como COMPETÊNCIA (movimenta_caixa=false) e são
 * agrupadas numa fatura por competência. Só o PAGAMENTO da fatura gera a saída
 * de CAIXA (movimenta_caixa=true), que aparece no Fluxo de Caixa.
 *
 * Usa SQL cru (padrão do repo para o PJ/conciliação). Tabelas criadas no
 * auto-migrate: empresas_cartoes, empresas_faturas + colunas em empresas_transacoes.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { competenciaDaCompra, num } from "./fatura-core";

export { competenciaDaCompra };

// Valida que o cartão pertence a uma empresa do usuário. Retorna o cartão + empresa_id.
export async function cartaoDoUsuario(cartaoId: number, userId: number): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT c.*, e.usuario_id
    FROM empresas_cartoes c
    JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = ${cartaoId} AND e.usuario_id = ${userId}
    LIMIT 1
  `);
  return (r as any[])[0] || null;
}

export async function empresaDoUsuario(empresaId: number, userId: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM empresas WHERE id = ${empresaId} AND usuario_id = ${userId} LIMIT 1`);
  return (r as any[]).length > 0;
}

export async function listarCartoes(empresaId: number): Promise<any[]> {
  const r = await db.execute(sql`SELECT * FROM empresas_cartoes WHERE empresa_id = ${empresaId} ORDER BY ativo DESC, nome`);
  return r as any[];
}

export async function criarCartao(empresaId: number, b: any): Promise<any> {
  const r = await db.execute(sql`
    INSERT INTO empresas_cartoes (empresa_id, nome, bandeira, limite, dia_fechamento, dia_vencimento, ativo)
    VALUES (${empresaId}, ${b.nome}, ${b.bandeira ?? null}, ${b.limite ?? null}, ${b.dia_fechamento}, ${b.dia_vencimento}, true)
    RETURNING *
  `);
  return (r as any[])[0];
}

export async function excluirCartao(cartaoId: number): Promise<void> {
  await db.execute(sql`DELETE FROM empresas_cartoes WHERE id = ${cartaoId}`);
}

async function getOrCreateFatura(empresaId: number, cartaoId: number, competencia: string, dataFech: string, dataVenc: string): Promise<any> {
  const existente = await db.execute(sql`SELECT * FROM empresas_faturas WHERE cartao_id = ${cartaoId} AND competencia = ${competencia} LIMIT 1`);
  if ((existente as any[])[0]) return (existente as any[])[0];
  const r = await db.execute(sql`
    INSERT INTO empresas_faturas (empresa_id, cartao_id, competencia, data_fechamento, data_vencimento, status)
    VALUES (${empresaId}, ${cartaoId}, ${competencia}, ${dataFech}, ${dataVenc}, 'aberta')
    ON CONFLICT (cartao_id, competencia) DO UPDATE SET competencia = EXCLUDED.competencia
    RETURNING *
  `);
  return (r as any[])[0];
}

/**
 * Resolve cartão + fatura da competência para uma compra.
 * Usado por registrarCompra e pelo create/update de Transações PJ.
 */
export async function resolverFaturaDoCartao(
  empresaId: number,
  cartao: { id: number; dia_fechamento: number; dia_vencimento: number; nome: string },
  dataISO: string,
): Promise<{ fatura: any; competencia: string; metodo: string }> {
  const { competencia, dataFech, dataVenc } = competenciaDaCompra(
    dataISO,
    Number(cartao.dia_fechamento),
    Number(cartao.dia_vencimento),
  );
  const fatura = await getOrCreateFatura(empresaId, cartao.id, competencia, dataFech, dataVenc);
  return { fatura, competencia, metodo: cartao.nome };
}

// Registra uma compra no cartão (competência, não mexe no caixa).
export async function registrarCompra(empresaId: number, cartao: any, b: any): Promise<any> {
  const dataISO = String(b.data_transacao).slice(0, 10);
  const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataISO);
  const valor = Number(b.valor).toFixed(2);
  const r = await db.execute(sql`
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, movimenta_caixa, cartao_id, fatura_id, competencia, metodo_pagamento)
    VALUES
      (${empresaId}, ${Number(b.categoria_id)}, ${b.descricao}, ${valor}, 'Despesa', ${dataISO}, 'Efetivada', 'manual', false, ${cartao.id}, ${fatura.id}, ${competencia}, ${metodo})
    RETURNING *
  `);
  return { compra: (r as any[])[0], fatura };
}

export async function getFaturaTotal(faturaId: number): Promise<number> {
  // Só as compras (competência); o pagamento não entra no total da fatura.
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM empresas_transacoes
    WHERE fatura_id = ${faturaId} AND COALESCE(movimenta_caixa, true) = false
  `);
  return num((r as any[])[0]?.total);
}

export async function listarFaturas(cartaoId: number): Promise<any[]> {
  const faturas = await db.execute(sql`SELECT * FROM empresas_faturas WHERE cartao_id = ${cartaoId} ORDER BY competencia DESC`);
  const out = [];
  for (const f of faturas as any[]) out.push({ ...f, total: await getFaturaTotal(f.id) });
  return out;
}

export async function getFaturaById(faturaId: number): Promise<any | null> {
  const r = await db.execute(sql`SELECT * FROM empresas_faturas WHERE id = ${faturaId} LIMIT 1`);
  return (r as any[])[0] || null;
}

export async function detalheFatura(faturaId: number): Promise<any> {
  const fatura = await getFaturaById(faturaId);
  if (!fatura) return null;
  const compras = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.categoria_id, c.nome AS categoria_nome, c.codigo AS categoria_codigo
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.fatura_id = ${faturaId}
    ORDER BY t.data_transacao
  `);
  return { fatura, compras: compras as any[], total: await getFaturaTotal(faturaId) };
}

// Concilia o extrato do cartão (linhas do banco) com as compras registradas na
// fatura. Casa por valor + data (±3 dias) e marca as compras casadas como
// conciliado=true. Retorna o comparativo (casados, sem-par dos dois lados, totais).
export async function conciliarFatura(fatura: any, movimentos: Array<{ data: string; valor: number; descricao: string }>): Promise<any> {
  const comprasRows = await db.execute(sql`
    SELECT id, descricao, valor, data_transacao, COALESCE(conciliado, false) AS conciliado
    FROM empresas_transacoes
    WHERE fatura_id = ${fatura.id} AND COALESCE(movimenta_caixa, true) = false
  `);
  const compras = (comprasRows as any[]).map((c) => ({ id: Number(c.id), descricao: c.descricao, valor: Math.abs(num(c.valor)), data: String(c.data_transacao).slice(0, 10), conciliado: c.conciliado === true, usado: false }));

  const conciliados: any[] = [];
  const extratoSemPar: any[] = [];
  const dias = (a: string, b: string) => Math.abs((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86400000);

  for (const mov of movimentos) {
    const alvo = Math.abs(mov.valor);
    let melhor: any = null, melhorDelta = Infinity;
    for (const c of compras) {
      if (c.usado) continue;
      if (Math.abs(c.valor - alvo) > 0.005) continue;
      const d = dias(c.data, mov.data);
      if (d <= 3 && d < melhorDelta) { melhor = c; melhorDelta = d; }
    }
    if (melhor) {
      melhor.usado = true;
      conciliados.push({ extrato: { data: mov.data, valor: mov.valor, descricao: mov.descricao }, compra_id: melhor.id, compra_descricao: melhor.descricao });
      await db.execute(sql`UPDATE empresas_transacoes SET conciliado = true WHERE id = ${melhor.id}`);
    } else {
      extratoSemPar.push({ data: mov.data, valor: mov.valor, descricao: mov.descricao });
    }
  }
  const comprasSemPar = compras.filter((c) => !c.usado).map((c) => ({ id: c.id, descricao: c.descricao, valor: c.valor, data: c.data }));
  const totalExtrato = movimentos.reduce((s, m) => s + Math.abs(m.valor), 0);
  const totalFatura = compras.reduce((s, c) => s + c.valor, 0);
  return {
    conciliados_qtd: conciliados.length,
    conciliados,
    extrato_sem_par: extratoSemPar,
    compras_sem_par: comprasSemPar,
    total_extrato: totalExtrato,
    total_fatura: totalFatura,
    diferenca: totalExtrato - totalFatura,
  };
}

export async function fecharFatura(faturaId: number): Promise<any> {
  const r = await db.execute(sql`UPDATE empresas_faturas SET status = 'fechada' WHERE id = ${faturaId} AND status <> 'paga' RETURNING *`);
  return (r as any[])[0];
}

// Paga a fatura: cria UMA saída de caixa (movimenta_caixa=true) e marca como paga.
export async function pagarFatura(
  empresaId: number,
  fatura: any,
  cartao: any,
  opts: { conta_contabil_id: number; conta_bancaria_id?: number | null; data_pagamento?: string },
): Promise<any> {
  const total = await getFaturaTotal(fatura.id);
  if (total <= 0) throw new Error("Fatura sem valor a pagar");
  const dataPg = opts.data_pagamento && /^\d{4}-\d{2}-\d{2}/.test(opts.data_pagamento) ? opts.data_pagamento.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const descricao = `Pagamento fatura ${cartao.nome} ${fatura.competencia}`;
  // NÃO leva fatura_id (senão entraria no total da fatura). O vínculo é via
  // empresas_faturas.transacao_pagamento_id.
  const r = await db.execute(sql`
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, movimenta_caixa, conta_bancaria_id, cartao_id)
    VALUES
      (${empresaId}, ${opts.conta_contabil_id}, ${descricao}, ${total.toFixed(2)}, 'Despesa', ${dataPg}, 'Efetivada', 'manual', true, ${opts.conta_bancaria_id ?? null}, ${cartao.id})
    RETURNING id
  `);
  const txId = (r as any[])[0]?.id;
  const upd = await db.execute(sql`
    UPDATE empresas_faturas SET status = 'paga', transacao_pagamento_id = ${txId}, data_pagamento = NOW()
    WHERE id = ${fatura.id} RETURNING *
  `);
  // Baixa as compras da fatura: marcam data_pagamento (saem do "usado" do cartão
  // porque a fatura agora está paga — getSaldoCartaoEmpresa filtra status paga).
  await db.execute(sql`
    UPDATE empresas_transacoes
    SET status = 'Efetivada', data_pagamento = ${dataPg}
    WHERE fatura_id = ${fatura.id}
      AND COALESCE(movimenta_caixa, false) = false
  `);
  return { fatura: (upd as any[])[0], transacao_id: txId, total };
}

/**
 * Saldo do cartão PJ: limite − compras ainda não pagas (faturas abertas/fechadas).
 * Espelha o getSaldoCartao do PF, mas sobre empresas_cartoes + empresas_transacoes.
 */
export async function getSaldoCartaoEmpresa(cartaoId: number): Promise<{
  cartao_nome: string;
  limite: number;
  usado: number;
  disponivel: number;
  percentual: number;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}> {
  const cartaoRows = await db.execute(sql`SELECT * FROM empresas_cartoes WHERE id = ${cartaoId} LIMIT 1`);
  const cartao = (cartaoRows as any[])[0];
  if (!cartao) throw new Error("Cartão não encontrado");

  const limite = num(cartao.limite);

  // Usado = compras (competência) em faturas ainda não pagas + compras sem fatura.
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(t.valor::numeric)), 0) AS total
    FROM empresas_transacoes t
    LEFT JOIN empresas_faturas f ON f.id = t.fatura_id
    WHERE t.cartao_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND COALESCE(t.movimenta_caixa, false) = false
      AND (t.fatura_id IS NULL OR f.status IN ('aberta', 'fechada'))
  `);

  const usado = num((rows as any[])[0]?.total);
  const disponivel = limite > 0 ? Math.max(0, limite - usado) : 0;
  const percentual = limite > 0 ? (usado / limite) * 100 : 0;

  return {
    cartao_nome: cartao.nome,
    limite: Math.round(limite * 100) / 100,
    usado: Math.round(usado * 100) / 100,
    disponivel: Math.round(disponivel * 100) / 100,
    percentual: Math.round(percentual * 10) / 10,
    dia_fechamento: cartao.dia_fechamento ?? null,
    dia_vencimento: cartao.dia_vencimento ?? null,
  };
}

/** Gastos do cartão PJ no intervalo civil [de, ate]. */
export async function movimentoCartaoPeriodoPj(
  cartaoId: number,
  de?: string,
  ate?: string,
): Promise<{ usado: number; qtd: number }> {
  const filtroDe = de ? sql`AND t.data_transacao >= ${de}` : sql``;
  const filtroAte = ate ? sql`AND t.data_transacao <= ${ate}` : sql``;
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(ABS(t.valor::numeric)), 0) AS total,
      COUNT(*)::int AS qtd
    FROM empresas_transacoes t
    WHERE t.cartao_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND COALESCE(t.movimenta_caixa, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM empresas_faturas fp WHERE fp.transacao_pagamento_id = t.id
      )
      ${filtroDe}
      ${filtroAte}
  `);
  return {
    usado: Math.round(num((rows as any[])[0]?.total) * 100) / 100,
    qtd: Number((rows as any[])[0]?.qtd || 0),
  };
}

export async function listarLancamentosCartaoPj(
  empresaId: number,
  cartaoId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const cartao = await db.execute(sql`
    SELECT id FROM empresas_cartoes
    WHERE id = ${cartaoId} AND empresa_id = ${empresaId}
    LIMIT 1
  `);
  if (!(cartao as any[])[0]) return [];

  const filtroDe = de ? sql`AND t.data_transacao >= ${de}` : sql``;
  const filtroAte = ate ? sql`AND t.data_transacao <= ${ate}` : sql``;

  const rows = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.tipo, t.data_transacao, t.status,
           t.competencia, t.fatura_id,
           c.nome AS categoria, c.codigo AS categoria_codigo
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.cartao_id = ${cartaoId}
      AND t.empresa_id = ${empresaId}
      AND t.tipo = 'Despesa'
      AND COALESCE(t.movimenta_caixa, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM empresas_faturas fp WHERE fp.transacao_pagamento_id = t.id
      )
      ${filtroDe}
      ${filtroAte}
    ORDER BY t.data_transacao DESC, t.id DESC
  `);
  return rows as any[];
}

export async function listarCartoesComSaldo(
  empresaId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const cartoes = await listarCartoes(empresaId);
  const comPeriodo = Boolean(de || ate);
  return Promise.all(cartoes.map(async (c) => {
    try {
      const saldo = await getSaldoCartaoEmpresa(c.id);
      if (comPeriodo) {
        const mov = await movimentoCartaoPeriodoPj(c.id, de, ate);
        const limite = saldo.limite;
        const disponivel = limite > 0 ? Math.max(0, limite - mov.usado) : 0;
        const percentual = limite > 0 ? (mov.usado / limite) * 100 : 0;
        return {
          ...c,
          ...saldo,
          usado: mov.usado,
          disponivel: Math.round(disponivel * 100) / 100,
          percentual: Math.round(percentual * 10) / 10,
          qtd_lancamentos: mov.qtd,
          periodo: { de: de || null, ate: ate || null },
        };
      }
      return { ...c, ...saldo, periodo: { de: null, ate: null } };
    } catch {
      return {
        ...c,
        limite: num(c.limite),
        usado: 0,
        disponivel: num(c.limite),
        percentual: 0,
        qtd_lancamentos: 0,
        periodo: { de: de || null, ate: ate || null },
      };
    }
  }));
}
