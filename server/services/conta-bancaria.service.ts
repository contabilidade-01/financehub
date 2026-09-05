/**
 * Contas bancárias — PF (usuario_id, empresa_id NULL) e helpers de saldo.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { num } from "./fatura-core";

/** Isolamento puro: PF = empresa_id null; PJ = empresa concreta. */
export function filtrarContasPorEscopo<T extends { empresa_id?: number | null; usuario_id?: number | null }>(
  contas: T[],
  escopo: { usuarioId: number; empresaId?: number | null },
): T[] {
  if (escopo.empresaId != null) {
    return contas.filter((c) => c.empresa_id === escopo.empresaId);
  }
  return contas.filter((c) => c.usuario_id === escopo.usuarioId && (c.empresa_id == null));
}

/** Conta padrão: tipo carteira ativa, senão a primeira ativa (não depende do nome). */
export function escolherContaPadraoPf(
  contas: { id: number; tipo: string; ativo?: boolean | null }[],
): number | null {
  const ativas = contas.filter((c) => c.ativo !== false);
  const carteira = ativas.find((c) => c.tipo === "carteira");
  return (carteira || ativas[0])?.id ?? null;
}

export async function listarContasPf(userId: number): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT * FROM contas_bancarias
    WHERE usuario_id = ${userId} AND empresa_id IS NULL
    ORDER BY ativo DESC, tipo = 'carteira' DESC, nome NULLS LAST, banco
  `);
  return r as any[];
}

export async function contaPadraoPf(userId: number): Promise<number | null> {
  const contas = await listarContasPf(userId);
  return escolherContaPadraoPf(contas);
}

export async function saldoConta(contaId: number, ate?: string): Promise<number> {
  const contaRows = await db.execute(sql`
    SELECT saldo_inicial FROM contas_bancarias WHERE id = ${contaId} LIMIT 1
  `);
  const ini = num((contaRows as any[])[0]?.saldo_inicial);

  // SALDO ATUAL = só dinheiro que JÁ se moveu (status Efetivada). Conta a pagar
  // em aberto é PREVISÃO e nunca entra aqui — ela aparece no Fluxo Projetado e
  // no "Saldo em aberto" da tela de Lançamentos. Regra idêntica para PF e PJ.
  const filtroAte = ate ? sql`AND data_transacao <= ${ate}` : sql``;

  const pf = await db.execute(sql`
    SELECT COALESCE(SUM(
      CASE WHEN tipo = 'Receita' THEN valor::numeric
           WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN -valor::numeric
           ELSE 0 END
    ), 0) AS mov
    FROM transacoes
    WHERE conta_bancaria_id = ${contaId}
      AND COALESCE(movimenta_caixa, true) = true
      AND status = 'Efetivada'
      ${filtroAte}
  `);

  const pj = await db.execute(sql`
    SELECT COALESCE(SUM(
      CASE WHEN tipo = 'Receita' THEN valor::numeric
           WHEN tipo = 'Despesa' THEN -valor::numeric
           ELSE 0 END
    ), 0) AS mov
    FROM empresas_transacoes
    WHERE conta_bancaria_id = ${contaId}
      AND COALESCE(movimenta_caixa, true) = true
      AND status = 'Efetivada'
      ${filtroAte}
  `);

  return Math.round((ini + num((pf as any[])[0]?.mov) + num((pj as any[])[0]?.mov)) * 100) / 100;
}

/** Movimento líquido da conta no intervalo [de, ate] (só Efetivada + caixa). */
export async function movimentoContaPeriodo(
  contaId: number,
  de?: string,
  ate?: string,
): Promise<{ movimento: number; entradas: number; saidas: number; qtd: number }> {
  const filtroDe = de ? sql`AND data_transacao >= ${de}` : sql``;
  const filtroAte = ate ? sql`AND data_transacao <= ${ate}` : sql``;

  const pf = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' AND COALESCE(reembolsavel, false) = false THEN valor::numeric ELSE 0 END), 0) AS saidas,
      COUNT(*)::int AS qtd
    FROM transacoes
    WHERE conta_bancaria_id = ${contaId}
      AND COALESCE(movimenta_caixa, true) = true
      AND status = 'Efetivada'
      ${filtroDe}
      ${filtroAte}
  `);

  const pj = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor::numeric ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor::numeric ELSE 0 END), 0) AS saidas,
      COUNT(*)::int AS qtd
    FROM empresas_transacoes
    WHERE conta_bancaria_id = ${contaId}
      AND COALESCE(movimenta_caixa, true) = true
      AND status = 'Efetivada'
      ${filtroDe}
      ${filtroAte}
  `);

  const entradas = num((pf as any[])[0]?.entradas) + num((pj as any[])[0]?.entradas);
  const saidas = num((pf as any[])[0]?.saidas) + num((pj as any[])[0]?.saidas);
  const qtd = Number((pf as any[])[0]?.qtd || 0) + Number((pj as any[])[0]?.qtd || 0);
  return {
    entradas: Math.round(entradas * 100) / 100,
    saidas: Math.round(saidas * 100) / 100,
    movimento: Math.round((entradas - saidas) * 100) / 100,
    qtd,
  };
}

export async function listarLancamentosContaPf(
  userId: number,
  contaId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const conta = await db.execute(sql`
    SELECT id FROM contas_bancarias
    WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    LIMIT 1
  `);
  if (!(conta as any[])[0]) return [];

  const filtroDe = de ? sql`AND t.data_transacao >= ${de}` : sql``;
  const filtroAte = ate ? sql`AND t.data_transacao <= ${ate}` : sql``;

  const rows = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.tipo, t.data_transacao, t.status,
           t.movimenta_caixa, c.nome AS categoria, fp.nome AS forma_pagamento
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    LEFT JOIN formas_pagamento fp ON fp.id = t.forma_pagamento_id
    WHERE t.conta_bancaria_id = ${contaId}
      AND COALESCE(t.movimenta_caixa, true) = true
      AND t.status = 'Efetivada'
      ${filtroDe}
      ${filtroAte}
    ORDER BY t.data_transacao DESC, t.id DESC
  `);
  return rows as any[];
}

export async function listarContasComSaldoPf(
  userId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const contas = await listarContasPf(userId);
  const comPeriodo = Boolean(de || ate);
  return Promise.all(contas.map(async (c) => {
    const mov = await movimentoContaPeriodo(c.id, de, ate);
    const saldoFechamento = await saldoConta(c.id, ate);
    return {
      ...c,
      nome: c.nome || c.banco,
      // Com período: saldo exibido = movimento líquido do intervalo.
      // Sem período: saldo acumulado atual.
      saldo: comPeriodo ? mov.movimento : saldoFechamento,
      saldo_atual: saldoFechamento,
      movimento: mov.movimento,
      entradas: mov.entradas,
      saidas: mov.saidas,
      qtd_lancamentos: mov.qtd,
      periodo: { de: de || null, ate: ate || null },
    };
  }));
}

export async function criarContaPf(userId: number, b: {
  nome: string;
  tipo?: string;
  banco?: string;
  saldo_inicial?: number;
  cor?: string;
  agencia?: string;
  numero?: string;
}): Promise<any> {
  const nome = String(b.nome || "").trim();
  if (!nome) throw new Error("Nome é obrigatório");
  const tipo = b.tipo || "corrente";
  const banco = (b.banco || nome).trim();
  const r = await db.execute(sql`
    INSERT INTO contas_bancarias
      (empresa_id, usuario_id, banco, nome, tipo, saldo_inicial, ativo, cor, agencia, numero)
    VALUES
      (NULL, ${userId}, ${banco}, ${nome}, ${tipo},
       ${(Number(b.saldo_inicial) || 0).toFixed(2)}, true,
       ${b.cor || null}, ${b.agencia || null}, ${b.numero || null})
    RETURNING *
  `);
  return (r as any[])[0];
}

export async function atualizarContaPf(userId: number, contaId: number, b: any): Promise<any | null> {
  const atual = await db.execute(sql`
    SELECT * FROM contas_bancarias
    WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    LIMIT 1
  `);
  if (!(atual as any[])[0]) return null;

  const a = (atual as any[])[0];
  const nome = b.nome != null ? String(b.nome).trim() : a.nome;
  const banco = b.banco != null ? String(b.banco).trim() : a.banco;
  const tipo = b.tipo != null ? b.tipo : a.tipo;
  const cor = b.cor !== undefined ? b.cor : a.cor;
  const ativo = b.ativo != null ? !!b.ativo : a.ativo;
  const saldoIni = b.saldo_inicial != null ? Number(b.saldo_inicial).toFixed(2) : a.saldo_inicial;

  const r = await db.execute(sql`
    UPDATE contas_bancarias
    SET nome = ${nome}, banco = ${banco}, tipo = ${tipo}, cor = ${cor},
        ativo = ${ativo}, saldo_inicial = ${saldoIni}
    WHERE id = ${contaId} AND usuario_id = ${userId}
    RETURNING *
  `);
  return (r as any[])[0] || null;
}

export async function excluirContaPf(userId: number, contaId: number): Promise<{ ok: boolean; error?: string }> {
  const usada = await db.execute(sql`
    SELECT 1 FROM transacoes WHERE conta_bancaria_id = ${contaId} LIMIT 1
  `);
  if ((usada as any[]).length > 0) {
    await db.execute(sql`
      UPDATE contas_bancarias SET ativo = false
      WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    `);
    return { ok: true };
  }
  const r = await db.execute(sql`
    DELETE FROM contas_bancarias
    WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    RETURNING id
  `);
  return { ok: (r as any[]).length > 0 };
}

export async function listarLancamentosContaPj(
  empresaId: number,
  contaId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const conta = await db.execute(sql`
    SELECT id FROM contas_bancarias
    WHERE id = ${contaId} AND empresa_id = ${empresaId}
    LIMIT 1
  `);
  if (!(conta as any[])[0]) return [];

  const filtroDe = de ? sql`AND t.data_transacao >= ${de}` : sql``;
  const filtroAte = ate ? sql`AND t.data_transacao <= ${ate}` : sql``;

  const rows = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.tipo, t.data_transacao, t.status,
           t.movimenta_caixa, c.nome AS categoria, c.codigo AS categoria_codigo
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.conta_bancaria_id = ${contaId}
      AND t.empresa_id = ${empresaId}
      AND COALESCE(t.movimenta_caixa, true) = true
      AND t.status = 'Efetivada'
      ${filtroDe}
      ${filtroAte}
    ORDER BY t.data_transacao DESC, t.id DESC
  `);
  return rows as any[];
}

/** Lista contas PJ com saldo acumulado + movimento do período (se de/ate). */
export async function listarContasComSaldoPj(
  empresaId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const { getContasBancariasByEmpresa, getSaldoSistemaConta } = await import("../storage");
  const contas = await getContasBancariasByEmpresa(empresaId);
  const comPeriodo = Boolean(de || ate);
  return Promise.all(
    (contas as any[]).map(async (c) => {
      const saldoSistema = await getSaldoSistemaConta(c.id);
      const mov = await movimentoContaPeriodo(c.id, de, ate);
      return {
        ...c,
        saldo_sistema: saldoSistema,
        saldo: comPeriodo ? mov.movimento : saldoSistema,
        movimento: mov.movimento,
        entradas: mov.entradas,
        saidas: mov.saidas,
        qtd_lancamentos: mov.qtd,
        periodo: { de: de || null, ate: ate || null },
      };
    }),
  );
}

/** Soma dos saldos das contas ativas do usuário (= novo "saldo geral" PF). */
export async function saldoGeralPf(userId: number): Promise<number> {
  const contas = await listarContasComSaldoPf(userId);
  return Math.round(contas.filter((c) => c.ativo !== false).reduce((s, c) => s + Number(c.saldo || 0), 0) * 100) / 100;
}
