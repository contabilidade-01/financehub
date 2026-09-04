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
      AND (usuario_id = ${userId} OR global = true)
    LIMIT 1
  `);
  return (r as any[])[0] || null;
}

export async function listarCartoesPf(userId: number): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT * FROM formas_pagamento
    WHERE (usuario_id = ${userId} OR global = true)
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

export async function listarCartoesComSaldoPf(userId: number): Promise<any[]> {
  const cartoes = await listarCartoesPf(userId);
  return Promise.all(cartoes.map(async (c) => {
    try {
      const saldo = await getSaldoCartaoPf(c.id);
      const faturas = (await listarFaturasPf(c.id)).slice(0, 3);
      return { ...c, ...saldo, faturas_recentes: faturas };
    } catch {
      return {
        ...c,
        limite: num(c.limite),
        usado: 0,
        disponivel: num(c.limite) > 0 ? num(c.limite) : null,
        percentual: 0,
        sem_limite: !(num(c.limite) > 0),
        faturas_recentes: [],
      };
    }
  }));
}

/**
 * Migração idempotente: txs na forma global genérica "Cartão de Crédito"
 * passam para um cartão real do usuário (existente ou legado) com fatura.
 */
export async function migrarTxsCartaoGenericoPf(): Promise<{ usuarios: number; txs: number }> {
  const g2 = await db.execute(sql`
    SELECT id FROM formas_pagamento
    WHERE global = true
      AND (
        nome ILIKE 'Cartão de Crédito'
        OR nome ILIKE 'Cartao de Credito'
        OR lower(nome) IN ('cartao de credito', 'cartao_credito', 'credit card', 'cartão', 'cartao')
      )
  `);
  const genIds = (g2 as any[]).map((r) => Number(r.id)).filter(Boolean);
  if (genIds.length === 0) return { usuarios: 0, txs: 0 };
  const genIdsSql = sql.join(genIds.map((id) => sql`${id}`), sql`, `);

  const users = await db.execute(sql`
    SELECT DISTINCT w.usuario_id AS usuario_id, w.id AS carteira_id
    FROM transacoes t
    JOIN carteiras w ON w.id = t.carteira_id
    WHERE t.forma_pagamento_id IN (${genIdsSql})
      AND t.tipo = 'Despesa'
  `);

  let usuarios = 0;
  let txs = 0;

  for (const u of users as any[]) {
    const userId = Number(u.usuario_id);
    const carteiraId = Number(u.carteira_id);
    if (!userId || !carteiraId) continue;

    let cartoes = (await listarCartoesPf(userId)).filter((c) => c.usuario_id === userId);
    let cartao = cartoes.sort((a, b) => a.id - b.id)[0] || null;

    if (!cartao) {
      const ins = await db.execute(sql`
        INSERT INTO formas_pagamento
          (usuario_id, nome, global, ativo, limite, dia_fechamento, dia_vencimento, cor, icone, descricao)
        SELECT ${userId}, 'Cartão de Crédito (legado)', false, true, NULL, 1, 10, '#FF6B35', '💳', 'Migrado da forma genérica'
        WHERE NOT EXISTS (
          SELECT 1 FROM formas_pagamento
          WHERE usuario_id = ${userId}
            AND (nome ILIKE 'Cartão de Crédito (legado)' OR lower(nome) = 'cartão de crédito (legado)')
        )
        RETURNING *
      `);
      cartao = (ins as any[])[0] || null;
      if (!cartao) {
        const again = await db.execute(sql`
          SELECT * FROM formas_pagamento
          WHERE usuario_id = ${userId}
            AND (nome ILIKE 'Cartão de Crédito (legado)' OR lower(nome) LIKE '%legado%')
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
    }
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
    const { competenciaDaCompra } = await import("./fatura-core");

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

  return { usuarios, txs };
}
