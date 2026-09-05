/**
 * Faturas de cartão PF — competência × caixa.
 * Espelha fatura-pj.service sobre as tabelas do PF (formas_pagamento = cartão,
 * faturas, transacoes).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { competenciaDaCompra, ehFormaCartaoCredito, num } from "./fatura-core";

export { ehFormaCartaoCredito };

/** Cartão = dias de fechamento/vencimento preenchidos (limite é opcional). */
export async function cartaoPfDoUsuario(cartaoId: number, userId: number): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT * FROM formas_pagamento
    WHERE id = ${cartaoId}
      AND dia_fechamento IS NOT NULL
      AND dia_vencimento IS NOT NULL
      AND usuario_id = ${userId}
      AND COALESCE(global, false) = false
    LIMIT 1
  `);
  return (r as any[])[0] || null;
}

export async function listarCartoesPf(userId: number): Promise<any[]> {
  // Só cartões do usuário (nunca a forma global genérica).
  const r = await db.execute(sql`
    SELECT * FROM formas_pagamento
    WHERE usuario_id = ${userId}
      AND COALESCE(global, false) = false
      AND dia_fechamento IS NOT NULL
      AND dia_vencimento IS NOT NULL
      AND ativo = true
    ORDER BY nome
  `);
  return r as any[];
}

async function getOrCreateFaturaPf(
  usuarioId: number,
  carteiraId: number,
  cartaoId: number,
  competencia: string,
  dataFech: string,
  dataVenc: string,
): Promise<any> {
  const existente = await db.execute(sql`
    SELECT * FROM faturas
    WHERE forma_pagamento_id = ${cartaoId} AND competencia = ${competencia}
    LIMIT 1
  `);
  if ((existente as any[])[0]) return (existente as any[])[0];
  const r = await db.execute(sql`
    INSERT INTO faturas
      (usuario_id, carteira_id, forma_pagamento_id, competencia, data_fechamento, data_vencimento, status)
    VALUES
      (${usuarioId}, ${carteiraId}, ${cartaoId}, ${competencia}, ${dataFech}, ${dataVenc}, 'aberta')
    ON CONFLICT (forma_pagamento_id, competencia)
    DO UPDATE SET competencia = EXCLUDED.competencia
    RETURNING *
  `);
  return (r as any[])[0];
}

export async function resolverFaturaPf(
  usuarioId: number,
  carteiraId: number,
  cartao: { id: number; dia_fechamento: number; dia_vencimento: number; nome: string },
  dataISO: string,
): Promise<{ fatura: any; competencia: string }> {
  const { competencia, dataFech, dataVenc } = competenciaDaCompra(
    dataISO,
    Number(cartao.dia_fechamento) || 1,
    Number(cartao.dia_vencimento) || 10,
  );
  const fatura = await getOrCreateFaturaPf(usuarioId, carteiraId, cartao.id, competencia, dataFech, dataVenc);
  return { fatura, competencia };
}

export async function getFaturaTotalPf(faturaId: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM transacoes
    WHERE fatura_id = ${faturaId} AND COALESCE(movimenta_caixa, true) = false
  `);
  return num((r as any[])[0]?.total);
}

export async function listarFaturasPf(cartaoId: number): Promise<any[]> {
  const faturas = await db.execute(sql`
    SELECT * FROM faturas WHERE forma_pagamento_id = ${cartaoId}
    ORDER BY competencia DESC
  `);
  const out = [];
  for (const f of faturas as any[]) {
    out.push({ ...f, total: await getFaturaTotalPf(f.id) });
  }
  return out;
}

export async function getFaturaPfById(faturaId: number): Promise<any | null> {
  const r = await db.execute(sql`SELECT * FROM faturas WHERE id = ${faturaId} LIMIT 1`);
  return (r as any[])[0] || null;
}

export async function detalheFaturaPf(faturaId: number): Promise<any> {
  const fatura = await getFaturaPfById(faturaId);
  if (!fatura) return null;
  const compras = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.status, t.parcela_num, t.parcela_total,
           c.nome AS categoria
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE t.fatura_id = ${faturaId} AND COALESCE(t.movimenta_caixa, true) = false
    ORDER BY t.data_transacao, t.id
  `);
  return { fatura: { ...fatura, total: await getFaturaTotalPf(faturaId) }, compras };
}

/** Resolve/cria a categoria "Pagamento de fatura" — nunca uma categoria aleatória. */
export async function resolverCategoriaPagamentoFatura(
  usuarioId: number,
  categoriaId?: number,
): Promise<number> {
  if (categoriaId) {
    const ok = await db.execute(sql`
      SELECT id FROM categorias
      WHERE id = ${categoriaId} AND tipo = 'Despesa'
        AND (usuario_id = ${usuarioId} OR global = true)
      LIMIT 1
    `);
    if ((ok as any[])[0]) return (ok as any[])[0].id;
  }
  const named = await db.execute(sql`
    SELECT id FROM categorias
    WHERE tipo = 'Despesa'
      AND lower(nome) = 'pagamento de fatura'
      AND (usuario_id = ${usuarioId} OR global = true)
    ORDER BY CASE WHEN usuario_id = ${usuarioId} THEN 0 ELSE 1 END, id
    LIMIT 1
  `);
  if ((named as any[])[0]) return (named as any[])[0].id;

  try {
    const created = await db.execute(sql`
      INSERT INTO categorias (usuario_id, nome, tipo, global, cor, icone)
      VALUES (${usuarioId}, 'Pagamento de fatura', 'Despesa', false, '#64748b', 'credit-card')
      RETURNING id
    `);
    return (created as any[])[0].id;
  } catch {
    // unique(nome, global) pode colidir entre usuários — reusa a existente.
    const again = await db.execute(sql`
      SELECT id FROM categorias
      WHERE tipo = 'Despesa' AND lower(nome) = 'pagamento de fatura'
      ORDER BY id LIMIT 1
    `);
    if ((again as any[])[0]) return (again as any[])[0].id;
    throw new Error("Não foi possível criar a categoria Pagamento de fatura.");
  }
}

/**
 * Paga a fatura: exige conta bancária. Cria UMA saída de caixa na conta,
 * marca compras como Efetivada + data_pagamento, fatura → paga.
 */
export async function pagarFaturaPf(
  fatura: any,
  cartao: any,
  opts: { conta_bancaria_id: number; data_pagamento?: string; categoria_id?: number; usuario_id?: number },
): Promise<any> {
  if (!opts.conta_bancaria_id) throw new Error("Escolha a conta de onde sai o pagamento.");
  const total = await getFaturaTotalPf(fatura.id);
  if (total <= 0) throw new Error("Fatura sem valor a pagar");

  const dataPg = opts.data_pagamento && /^\d{4}-\d{2}-\d{2}/.test(opts.data_pagamento)
    ? opts.data_pagamento.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const usuarioId = opts.usuario_id ?? fatura.usuario_id;
  const categoriaId = await resolverCategoriaPagamentoFatura(usuarioId, opts.categoria_id);

  const descricao = `Pagamento fatura ${cartao.nome} ${fatura.competencia}`;
  const r = await db.execute(sql`
    INSERT INTO transacoes
      (carteira_id, categoria_id, forma_pagamento_id, tipo, valor, data_transacao, descricao,
       status, data_pagamento, conta_bancaria_id, movimenta_caixa)
    VALUES
      (${fatura.carteira_id}, ${categoriaId}, ${cartao.id}, 'Despesa', ${total.toFixed(2)}, ${dataPg},
       ${descricao}, 'Efetivada', ${dataPg}, ${opts.conta_bancaria_id}, true)
    RETURNING id
  `);
  const txId = (r as any[])[0]?.id;

  await db.execute(sql`
    UPDATE faturas
    SET status = 'paga',
        transacao_pagamento_id = ${txId},
        conta_bancaria_id = ${opts.conta_bancaria_id},
        data_pagamento = NOW()
    WHERE id = ${fatura.id}
  `);

  await db.execute(sql`
    UPDATE transacoes
    SET status = 'Efetivada', data_pagamento = ${dataPg}
    WHERE fatura_id = ${fatura.id} AND COALESCE(movimenta_caixa, false) = false
  `);

  return { fatura_id: fatura.id, transacao_id: txId, total };
}

/**
 * Estorno simétrico: apaga a saída de pagamento, devolve compras a Pendente,
 * fatura volta a aberta.
 */
export async function reabrirFaturaPf(fatura: any): Promise<any> {
  if (fatura.status !== "paga") throw new Error("Só é possível reabrir fatura paga.");

  if (fatura.transacao_pagamento_id) {
    await db.execute(sql`DELETE FROM transacoes WHERE id = ${fatura.transacao_pagamento_id}`);
  }

  await db.execute(sql`
    UPDATE transacoes
    SET status = 'Pendente', data_pagamento = NULL
    WHERE fatura_id = ${fatura.id} AND COALESCE(movimenta_caixa, false) = false
  `);

  const r = await db.execute(sql`
    UPDATE faturas
    SET status = 'aberta', transacao_pagamento_id = NULL, conta_bancaria_id = NULL, data_pagamento = NULL
    WHERE id = ${fatura.id}
    RETURNING *
  `);
  return (r as any[])[0];
}

function periodoFaturaCorrente(diaFech: number): { inicio: string; fim: string } {
  const now = new Date();
  const df = Math.min(Math.max(diaFech || 1, 1), 28);
  if (now.getDate() >= df) {
    const inicio = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(df).padStart(2, "0")}`;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, df);
    return { inicio, fim: next.toISOString().slice(0, 10) };
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, df);
  const fim = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(df).padStart(2, "0")}`;
  return { inicio: prev.toISOString().slice(0, 10), fim };
}

export async function getSaldoCartaoPf(cartaoId: number): Promise<{
  cartao_nome: string;
  limite: number;
  usado: number;
  disponivel: number | null;
  percentual: number;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  sem_limite: boolean;
}> {
  const cartaoRows = await db.execute(sql`SELECT * FROM formas_pagamento WHERE id = ${cartaoId} LIMIT 1`);
  const cartao = (cartaoRows as any[])[0];
  if (!cartao) throw new Error("Cartão não encontrado");

  const limite = num(cartao.limite);
  const semLimite = !(limite > 0);
  const { inicio, fim } = periodoFaturaCorrente(Number(cartao.dia_fechamento) || 1);

  // Fluxo novo (faturas abertas) + legado (sem fatura_id, período corrente).
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(t.valor::numeric)), 0) AS total
    FROM transacoes t
    LEFT JOIN faturas f ON f.id = t.fatura_id
    WHERE t.forma_pagamento_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND NOT EXISTS (SELECT 1 FROM faturas fp WHERE fp.transacao_pagamento_id = t.id)
      AND (
        (
          COALESCE(t.movimenta_caixa, false) = false
          AND (t.fatura_id IS NULL OR f.status IN ('aberta', 'fechada'))
        )
        OR (
          t.fatura_id IS NULL
          AND COALESCE(t.movimenta_caixa, true) = true
          AND t.data_transacao >= ${inicio}
          AND t.data_transacao < ${fim}
        )
      )
  `);
  const usado = num((rows as any[])[0]?.total);
  const disponivel = semLimite ? null : Math.max(0, limite - usado);
  const percentual = semLimite ? 0 : (usado / limite) * 100;

  return {
    cartao_nome: cartao.nome,
    limite: Math.round(limite * 100) / 100,
    usado: Math.round(usado * 100) / 100,
    disponivel: disponivel == null ? null : Math.round(disponivel * 100) / 100,
    percentual: Math.round(percentual * 10) / 10,
    dia_fechamento: cartao.dia_fechamento ?? null,
    dia_vencimento: cartao.dia_vencimento ?? null,
    sem_limite: semLimite,
  };
}

/** Gastos do cartão no intervalo civil [de, ate] (compras, não pagamento de fatura). */
export async function movimentoCartaoPeriodo(
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
    FROM transacoes t
    WHERE t.forma_pagamento_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND NOT EXISTS (SELECT 1 FROM faturas fp WHERE fp.transacao_pagamento_id = t.id)
      AND (
        COALESCE(t.movimenta_caixa, false) = false
        OR t.fatura_id IS NOT NULL
      )
      ${filtroDe}
      ${filtroAte}
  `);
  return {
    usado: Math.round(num((rows as any[])[0]?.total) * 100) / 100,
    qtd: Number((rows as any[])[0]?.qtd || 0),
  };
}

export async function listarLancamentosCartaoPf(
  userId: number,
  cartaoId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const cartao = await cartaoPfDoUsuario(cartaoId, userId);
  if (!cartao || Number(cartao.usuario_id) !== userId) return [];

  const filtroDe = de ? sql`AND t.data_transacao >= ${de}` : sql``;
  const filtroAte = ate ? sql`AND t.data_transacao <= ${ate}` : sql``;

  const rows = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.tipo, t.data_transacao, t.status,
           t.parcela_num, t.parcela_total, t.competencia, t.fatura_id,
           c.nome AS categoria
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE t.forma_pagamento_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND NOT EXISTS (SELECT 1 FROM faturas fp WHERE fp.transacao_pagamento_id = t.id)
      AND (
        COALESCE(t.movimenta_caixa, false) = false
        OR t.fatura_id IS NOT NULL
      )
      ${filtroDe}
      ${filtroAte}
    ORDER BY t.data_transacao DESC, t.id DESC
  `);
  return rows as any[];
}

export async function listarCartoesComSaldoPf(
  userId: number,
  de?: string,
  ate?: string,
): Promise<any[]> {
  const cartoes = await listarCartoesPf(userId);
  const comPeriodo = Boolean(de || ate);
  return Promise.all(cartoes.map(async (c) => {
    try {
      const saldo = await getSaldoCartaoPf(c.id);
      const faturas = (await listarFaturasPf(c.id)).slice(0, 3);
      if (comPeriodo) {
        const mov = await movimentoCartaoPeriodo(c.id, de, ate);
        const limite = saldo.limite;
        const semLimite = saldo.sem_limite;
        const disponivel = semLimite ? null : Math.max(0, limite - mov.usado);
        const percentual = semLimite || !(limite > 0) ? 0 : (mov.usado / limite) * 100;
        return {
          ...c,
          ...saldo,
          usado: mov.usado,
          disponivel,
          percentual: Math.round(percentual * 10) / 10,
          qtd_lancamentos: mov.qtd,
          periodo: { de: de || null, ate: ate || null },
          faturas_recentes: faturas,
        };
      }
      return { ...c, ...saldo, periodo: { de: null, ate: null }, faturas_recentes: faturas };
    } catch {
      return {
        ...c,
        limite: num(c.limite),
        usado: 0,
        disponivel: num(c.limite) > 0 ? num(c.limite) : null,
        percentual: 0,
        sem_limite: !(num(c.limite) > 0),
        qtd_lancamentos: 0,
        periodo: { de: de || null, ate: ate || null },
        faturas_recentes: [],
      };
    }
  }));
}

const NOME_FORMA_GENERICA_CC = sql`(
  nome ILIKE 'Cartão de Crédito'
  OR nome ILIKE 'Cartao de Credito'
  OR lower(nome) IN ('cartao de credito', 'cartão de crédito', 'cartao_credito', 'credit card', 'cartao', 'cartão')
)`;

async function garantirCartaoLegadoPf(userId: number): Promise<any | null> {
  const ins = await db.execute(sql`
    INSERT INTO formas_pagamento
      (usuario_id, nome, global, ativo, limite, dia_fechamento, dia_vencimento, cor, icone, descricao)
    SELECT ${userId}, 'Cartão de Crédito (legado)', false, true, NULL, 1, 10, '#FF6B35', '💳', 'Migrado da forma genérica'
    WHERE NOT EXISTS (
      SELECT 1 FROM formas_pagamento
      WHERE usuario_id = ${userId}
        AND COALESCE(global, false) = false
        AND (
          nome ILIKE 'Cartão de Crédito (legado)'
          OR lower(nome) = 'cartão de crédito (legado)'
        )
    )
    RETURNING *
  `);
  let cartao = (ins as any[])[0] || null;
  if (!cartao) {
    const again = await db.execute(sql`
      SELECT * FROM formas_pagamento
      WHERE usuario_id = ${userId}
        AND COALESCE(global, false) = false
        AND (
          nome ILIKE 'Cartão de Crédito (legado)'
          OR lower(nome) LIKE '%legado%'
        )
      ORDER BY id ASC LIMIT 1
    `);
    cartao = (again as any[])[0] || null;
  }
  if (cartao && (cartao.dia_fechamento == null || cartao.dia_vencimento == null)) {
    await db.execute(sql`
      UPDATE formas_pagamento
      SET dia_fechamento = COALESCE(dia_fechamento, 1),
          dia_vencimento = COALESCE(dia_vencimento, 10)
      WHERE id = ${cartao.id}
    `);
    cartao.dia_fechamento = cartao.dia_fechamento ?? 1;
    cartao.dia_vencimento = cartao.dia_vencimento ?? 10;
  }
  return cartao;
}

/** Anexa fatura e tira do caixa despesas já vinculadas a um cartão do usuário. */
async function anexarFaturasDoCartaoPf(
  userId: number,
  carteiraId: number,
  cartao: { id: number; dia_fechamento: number; dia_vencimento: number },
): Promise<number> {
  const txsUser = await db.execute(sql`
    SELECT id, data_transacao
    FROM transacoes
    WHERE carteira_id = ${carteiraId}
      AND forma_pagamento_id = ${cartao.id}
      AND tipo = 'Despesa'
      AND NOT EXISTS (SELECT 1 FROM faturas fp WHERE fp.transacao_pagamento_id = transacoes.id)
      AND (
        fatura_id IS NULL
        OR COALESCE(movimenta_caixa, true) = true
        OR conta_bancaria_id IS NOT NULL
      )
    ORDER BY data_transacao, id
  `);

  const faturaByComp = new Map<string, { id: number; competencia: string }>();
  let n = 0;
  for (const t of txsUser as any[]) {
    const dataISO = String(t.data_transacao).slice(0, 10);
    const { competencia } = competenciaDaCompra(
      dataISO,
      Number(cartao.dia_fechamento) || 1,
      Number(cartao.dia_vencimento) || 10,
    );
    let cached = faturaByComp.get(competencia);
    if (!cached) {
      const { fatura, competencia: comp } = await resolverFaturaPf(userId, carteiraId, cartao as any, dataISO);
      cached = { id: fatura.id, competencia: comp };
      faturaByComp.set(comp, cached);
    }
    await db.execute(sql`
      UPDATE transacoes
      SET conta_bancaria_id = NULL,
          movimenta_caixa = false,
          fatura_id = ${cached.id},
          competencia = ${cached.competencia},
          status = CASE
            WHEN status = 'Efetivada' AND data_pagamento IS NULL THEN 'Pendente'
            ELSE status
          END
      WHERE id = ${t.id}
    `);
    n++;
  }
  return n;
}

/**
 * Migração idempotente no boot:
 * 1) Promove formas do usuário que já parecem cartão (limite/bandeira/…) preenchendo dias.
 * 2) Cria "Cartão de Crédito (legado)" e move txs da forma genérica para ele (não misturam no Nubank).
 * 3) Anexa fatura/caixa em todas as despesas dos cartões do usuário.
 */
export async function migrarTxsCartaoGenericoPf(): Promise<{
  usuarios: number;
  txs: number;
  promovidos: number;
  anexadas: number;
}> {
  // 1) Formas incompletas → viram cartão (aparecem em Contas e Cartões).
  //    Inclui: dados de cartão preenchidos OU já usadas em despesas (ex.: Inter criado pelo agente sem dias).
  const promo = await db.execute(sql`
    UPDATE formas_pagamento fp
    SET dia_fechamento = COALESCE(fp.dia_fechamento, 1),
        dia_vencimento = COALESCE(
          fp.dia_vencimento,
          CASE WHEN fp.dia_fechamento IS NOT NULL THEN LEAST(31, fp.dia_fechamento + 5) ELSE 10 END
        ),
        descricao = COALESCE(NULLIF(fp.descricao, ''), 'Cartão'),
        icone = COALESCE(NULLIF(fp.icone, ''), '💳')
    WHERE fp.usuario_id IS NOT NULL
      AND COALESCE(fp.global, false) = false
      AND fp.ativo = true
      AND (fp.dia_fechamento IS NULL OR fp.dia_vencimento IS NULL)
      AND NOT (${NOME_FORMA_GENERICA_CC})
      AND (
        fp.limite IS NOT NULL
        OR fp.bandeira IS NOT NULL
        OR fp.ultimos_digitos IS NOT NULL
        OR fp.descricao ILIKE '%cart%'
        OR fp.icone IN ('💳', 'credit-card', 'CreditCard')
        OR EXISTS (
          SELECT 1 FROM transacoes t
          WHERE t.forma_pagamento_id = fp.id AND t.tipo = 'Despesa'
        )
      )
    RETURNING fp.id
  `);
  const promovidos = (promo as any[]).length;

  // Formas genéricas (global OU cópia do usuário) — nunca o próprio "legado".
  const g2 = await db.execute(sql`
    SELECT id FROM formas_pagamento
    WHERE (${NOME_FORMA_GENERICA_CC})
      AND nome NOT ILIKE '%legado%'
  `);
  const genIds = (g2 as any[]).map((r) => Number(r.id)).filter(Boolean);

  let usuarios = 0;
  let txs = 0;
  let anexadas = 0;

  if (genIds.length > 0) {
    const genIdsSql = sql.join(genIds.map((id) => sql`${id}`), sql`, `);
    const users = await db.execute(sql`
      SELECT DISTINCT w.usuario_id AS usuario_id, w.id AS carteira_id
      FROM transacoes t
      JOIN carteiras w ON w.id = t.carteira_id
      WHERE t.forma_pagamento_id IN (${genIdsSql})
        AND t.tipo = 'Despesa'
    `);

    for (const u of users as any[]) {
      const userId = Number(u.usuario_id);
      const carteiraId = Number(u.carteira_id);
      if (!userId || !carteiraId) continue;

      // Sempre cartão legado — não despejar no Nubank/outro cartão nominal.
      const cartao = await garantirCartaoLegadoPf(userId);
      if (!cartao) continue;
      usuarios++;

      const txsUser = await db.execute(sql`
        SELECT id, data_transacao
        FROM transacoes
        WHERE carteira_id = ${carteiraId}
          AND forma_pagamento_id IN (${genIdsSql})
          AND tipo = 'Despesa'
        ORDER BY data_transacao, id
      `);

      const faturaByComp = new Map<string, { id: number; competencia: string }>();
      for (const t of txsUser as any[]) {
        const dataISO = String(t.data_transacao).slice(0, 10);
        const { competencia } = competenciaDaCompra(
          dataISO,
          Number(cartao.dia_fechamento) || 1,
          Number(cartao.dia_vencimento) || 10,
        );
        let cached = faturaByComp.get(competencia);
        if (!cached) {
          const { fatura, competencia: comp } = await resolverFaturaPf(userId, carteiraId, cartao, dataISO);
          cached = { id: fatura.id, competencia: comp };
          faturaByComp.set(comp, cached);
        }
        await db.execute(sql`
          UPDATE transacoes
          SET forma_pagamento_id = ${cartao.id},
              conta_bancaria_id = NULL,
              movimenta_caixa = false,
              fatura_id = ${cached.id},
              competencia = ${cached.competencia},
              status = CASE
                WHEN status = 'Efetivada' AND data_pagamento IS NULL THEN 'Pendente'
                ELSE status
              END
          WHERE id = ${t.id}
        `);
        txs++;
      }
    }
  }

  // 3) Cartões já existentes (Nubank etc.): amarrar fatura e tirar do caixa.
  const pares = await db.execute(sql`
    SELECT DISTINCT w.usuario_id AS usuario_id, w.id AS carteira_id, fp.id AS cartao_id,
           fp.dia_fechamento, fp.dia_vencimento
    FROM formas_pagamento fp
    JOIN carteiras w ON w.usuario_id = fp.usuario_id
    WHERE fp.usuario_id IS NOT NULL
      AND COALESCE(fp.global, false) = false
      AND fp.dia_fechamento IS NOT NULL
      AND fp.dia_vencimento IS NOT NULL
      AND fp.ativo = true
  `);
  for (const p of pares as any[]) {
    const userId = Number(p.usuario_id);
    const carteiraId = Number(p.carteira_id);
    if (!userId || !carteiraId) continue;
    anexadas += await anexarFaturasDoCartaoPf(userId, carteiraId, {
      id: Number(p.cartao_id),
      dia_fechamento: Number(p.dia_fechamento),
      dia_vencimento: Number(p.dia_vencimento),
    });
  }

  return { usuarios, txs, promovidos, anexadas };
}
