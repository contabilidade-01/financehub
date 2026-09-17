"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ehFormaCartaoCredito = void 0;
exports.cartaoPfDoUsuario = cartaoPfDoUsuario;
exports.listarCartoesPf = listarCartoesPf;
exports.resolverFaturaPf = resolverFaturaPf;
exports.resolverFaturaPfPorCompetencia = resolverFaturaPfPorCompetencia;
exports.recalcularFaturasCartaoPf = recalcularFaturasCartaoPf;
exports.getFaturaTotalPf = getFaturaTotalPf;
exports.listarFaturasPf = listarFaturasPf;
exports.getFaturaPfById = getFaturaPfById;
exports.detalheFaturaPf = detalheFaturaPf;
exports.resolverCategoriaPagamentoFatura = resolverCategoriaPagamentoFatura;
exports.pagarFaturaPf = pagarFaturaPf;
exports.reabrirFaturaPf = reabrirFaturaPf;
exports.getSaldoCartaoPf = getSaldoCartaoPf;
exports.movimentoCartaoPeriodo = movimentoCartaoPeriodo;
exports.listarLancamentosCartaoPf = listarLancamentosCartaoPf;
exports.listarCartoesComSaldoPf = listarCartoesComSaldoPf;
exports.migrarTxsCartaoGenericoPf = migrarTxsCartaoGenericoPf;
/**
 * Faturas de cartão PF — competência × caixa.
 * Espelha fatura-pj.service sobre as tabelas do PF (formas_pagamento = cartão,
 * faturas, transacoes).
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const fatura_core_1 = require("./fatura-core");
Object.defineProperty(exports, "ehFormaCartaoCredito", { enumerable: true, get: function () { return fatura_core_1.ehFormaCartaoCredito; } });
/** Cartão = dias de fechamento/vencimento preenchidos (limite é opcional). */
async function cartaoPfDoUsuario(cartaoId, userId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM formas_pagamento
    WHERE id = ${cartaoId}
      AND dia_fechamento IS NOT NULL
      AND dia_vencimento IS NOT NULL
      AND usuario_id = ${userId}
      AND COALESCE(global, false) = false
    LIMIT 1
  `);
    return r[0] || null;
}
async function listarCartoesPf(userId) {
    // Só cartões do usuário (nunca a forma global genérica).
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM formas_pagamento
    WHERE usuario_id = ${userId}
      AND COALESCE(global, false) = false
      AND dia_fechamento IS NOT NULL
      AND dia_vencimento IS NOT NULL
      AND ativo = true
    ORDER BY nome
  `);
    return r;
}
async function getOrCreateFaturaPf(usuarioId, carteiraId, cartaoId, competencia, dataFech, dataVenc) {
    const existente = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM faturas
    WHERE forma_pagamento_id = ${cartaoId} AND competencia = ${competencia}
    LIMIT 1
  `);
    if (existente[0])
        return existente[0];
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO faturas
      (usuario_id, carteira_id, forma_pagamento_id, competencia, data_fechamento, data_vencimento, status)
    VALUES
      (${usuarioId}, ${carteiraId}, ${cartaoId}, ${competencia}, ${dataFech}, ${dataVenc}, 'aberta')
    ON CONFLICT (forma_pagamento_id, competencia)
    DO UPDATE SET competencia = EXCLUDED.competencia
    RETURNING *
  `);
    return r[0];
}
async function resolverFaturaPf(usuarioId, carteiraId, cartao, dataISO) {
    const { competencia, dataFech, dataVenc } = (0, fatura_core_1.competenciaDaCompra)(dataISO, Number(cartao.dia_fechamento) || 1, Number(cartao.dia_vencimento) || 10);
    const fatura = await getOrCreateFaturaPf(usuarioId, carteiraId, cartao.id, competencia, dataFech, dataVenc);
    return { fatura, competencia };
}
/** Fatura de uma competência já decidida (parcela i = competência da 1ª + i meses). */
async function resolverFaturaPfPorCompetencia(usuarioId, carteiraId, cartao, competencia) {
    const { competencia: comp, dataFech, dataVenc } = (0, fatura_core_1.datasDaCompetencia)(competencia, Number(cartao.dia_fechamento) || 1, Number(cartao.dia_vencimento) || 10);
    const fatura = await getOrCreateFaturaPf(usuarioId, carteiraId, cartao.id, comp, dataFech, dataVenc);
    return { fatura, competencia: comp };
}
/**
 * Recalcula TODAS as faturas de um cartão PF a partir das DATAS ATUAIS do cartão
 * (dia_fechamento/dia_vencimento). Corrige o estrago de cartões que estavam sem
 * dias (competência/vencimento errados). NÃO toca em faturas já PAGAS.
 */
async function recalcularFaturasCartaoPf(usuarioId, carteiraId, cartao) {
    const diaF = Number(cartao.dia_fechamento) || 1;
    const diaV = Number(cartao.dia_vencimento) || 10;
    // 1) Re-resolve cada COMPRA do cartão (ignora pagamentos de fatura).
    //    À VISTA: pela DATA + dias do cartão.
    //    PARCELADO: pela SEQUÊNCIA (base + i meses), espelhando a criação — a data
    //    FIXA da parcela NÃO reaplica a regra de fechamento (senão, no fim de mês,
    //    duas parcelas colapsavam na mesma fatura / deslocavam).
    const txs = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.data_transacao, t.parcela_num, t.parcela_total, t.compra_grupo
    FROM transacoes t
    WHERE t.forma_pagamento_id = ${cartao.id}
      AND t.carteira_id = ${carteiraId}
      AND t.tipo = 'Despesa'
      AND NOT EXISTS (SELECT 1 FROM faturas fp WHERE fp.transacao_pagamento_id = t.id)
    ORDER BY t.compra_grupo NULLS LAST, t.parcela_num NULLS LAST, t.data_transacao, t.id
  `);
    // Competência-base de cada compra parcelada = a da 1ª parcela (menor parcela_num),
    // decidida UMA vez pela data dela + dias atuais do cartão.
    const baseGrupo = new Map();
    for (const t of txs) {
        const grupo = t.compra_grupo;
        if (!grupo || Number(t.parcela_total) <= 1)
            continue;
        if (!baseGrupo.has(grupo)) {
            baseGrupo.set(grupo, (0, fatura_core_1.competenciaDaCompra)(String(t.data_transacao).slice(0, 10), diaF, diaV).competencia);
        }
    }
    let movidas = 0;
    for (const t of txs) {
        const ehParcelado = t.compra_grupo && Number(t.parcela_total) > 1;
        let fatura;
        let competencia;
        if (ehParcelado && baseGrupo.has(t.compra_grupo)) {
            const base = baseGrupo.get(t.compra_grupo);
            const comp = (0, fatura_core_1.competenciaMaisMeses)(base, (Number(t.parcela_num) || 1) - 1);
            const r = await resolverFaturaPfPorCompetencia(usuarioId, carteiraId, cartao, comp);
            fatura = r.fatura;
            competencia = r.competencia;
        }
        else {
            const r = await resolverFaturaPf(usuarioId, carteiraId, cartao, String(t.data_transacao).slice(0, 10));
            fatura = r.fatura;
            competencia = r.competencia;
        }
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE transacoes
      SET fatura_id = ${fatura.id}, competencia = ${competencia},
          movimenta_caixa = false, conta_bancaria_id = NULL
      WHERE id = ${t.id}
    `);
        movidas++;
    }
    // 2) Corrige data_fechamento/data_vencimento das faturas NÃO pagas pelos dias atuais.
    const faturas = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, competencia FROM faturas
    WHERE forma_pagamento_id = ${cartao.id} AND status <> 'paga'
  `);
    let faturasCorrigidas = 0;
    for (const f of faturas) {
        const { dataFech, dataVenc } = (0, fatura_core_1.datasDaCompetencia)(String(f.competencia), diaF, diaV);
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE faturas SET data_fechamento = ${dataFech}, data_vencimento = ${dataVenc}
      WHERE id = ${f.id}
    `);
        faturasCorrigidas++;
    }
    // 3) Remove faturas NÃO pagas e VAZIAS (ex.: as de outubro que ficaram sem lançamentos).
    const del = await db_1.db.execute((0, drizzle_orm_1.sql) `
    DELETE FROM faturas f
    WHERE f.forma_pagamento_id = ${cartao.id}
      AND f.status <> 'paga'
      AND NOT EXISTS (SELECT 1 FROM transacoes t WHERE t.fatura_id = f.id)
    RETURNING f.id
  `);
    const faturasRemovidas = del.length;
    return { movidas, faturasCorrigidas, faturasRemovidas };
}
async function getFaturaTotalPf(faturaId) {
    var _a;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM transacoes
    WHERE fatura_id = ${faturaId} AND COALESCE(movimenta_caixa, true) = false
  `);
    return (0, fatura_core_1.num)((_a = r[0]) === null || _a === void 0 ? void 0 : _a.total);
}
async function listarFaturasPf(cartaoId) {
    const faturas = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM faturas WHERE forma_pagamento_id = ${cartaoId}
    ORDER BY competencia DESC
  `);
    const out = [];
    for (const f of faturas) {
        out.push(Object.assign(Object.assign({}, f), { total: await getFaturaTotalPf(f.id) }));
    }
    return out;
}
async function getFaturaPfById(faturaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM faturas WHERE id = ${faturaId} LIMIT 1`);
    return r[0] || null;
}
async function detalheFaturaPf(faturaId) {
    const fatura = await getFaturaPfById(faturaId);
    if (!fatura)
        return null;
    const compras = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.status, t.parcela_num, t.parcela_total,
           c.nome AS categoria
    FROM transacoes t
    LEFT JOIN categorias c ON c.id = t.categoria_id
    WHERE t.fatura_id = ${faturaId} AND COALESCE(t.movimenta_caixa, true) = false
    ORDER BY t.data_transacao, t.id
  `);
    return { fatura: Object.assign(Object.assign({}, fatura), { total: await getFaturaTotalPf(faturaId) }), compras };
}
/** Resolve/cria a categoria "Pagamento de fatura" — nunca uma categoria aleatória. */
async function resolverCategoriaPagamentoFatura(usuarioId, categoriaId) {
    if (categoriaId) {
        const ok = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT id FROM categorias
      WHERE id = ${categoriaId} AND tipo = 'Despesa'
        AND (usuario_id = ${usuarioId} OR global = true)
      LIMIT 1
    `);
        if (ok[0])
            return ok[0].id;
    }
    const named = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id FROM categorias
    WHERE tipo = 'Despesa'
      AND lower(nome) = 'pagamento de fatura'
      AND (usuario_id = ${usuarioId} OR global = true)
    ORDER BY CASE WHEN usuario_id = ${usuarioId} THEN 0 ELSE 1 END, id
    LIMIT 1
  `);
    if (named[0])
        return named[0].id;
    try {
        const created = await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO categorias (usuario_id, nome, tipo, global, cor, icone)
      VALUES (${usuarioId}, 'Pagamento de fatura', 'Despesa', false, '#64748b', 'credit-card')
      RETURNING id
    `);
        return created[0].id;
    }
    catch (_a) {
        // unique(nome, global) pode colidir entre usuários — reusa a existente.
        const again = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT id FROM categorias
      WHERE tipo = 'Despesa' AND lower(nome) = 'pagamento de fatura'
      ORDER BY id LIMIT 1
    `);
        if (again[0])
            return again[0].id;
        throw new Error("Não foi possível criar a categoria Pagamento de fatura.");
    }
}
/**
 * Paga a fatura: exige conta bancária. Cria UMA saída de caixa na conta,
 * marca compras como Efetivada + data_pagamento, fatura → paga.
 */
async function pagarFaturaPf(fatura, cartao, opts) {
    var _a, _b;
    if (!opts.conta_bancaria_id)
        throw new Error("Escolha a conta de onde sai o pagamento.");
    const total = await getFaturaTotalPf(fatura.id);
    if (total <= 0)
        throw new Error("Fatura sem valor a pagar");
    const dataPg = opts.data_pagamento && /^\d{4}-\d{2}-\d{2}/.test(opts.data_pagamento)
        ? opts.data_pagamento.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const usuarioId = (_a = opts.usuario_id) !== null && _a !== void 0 ? _a : fatura.usuario_id;
    const categoriaId = await resolverCategoriaPagamentoFatura(usuarioId, opts.categoria_id);
    const descricao = `Pagamento fatura ${cartao.nome} ${fatura.competencia}`;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO transacoes
      (carteira_id, categoria_id, forma_pagamento_id, tipo, valor, data_transacao, descricao,
       status, data_pagamento, conta_bancaria_id, movimenta_caixa)
    VALUES
      (${fatura.carteira_id}, ${categoriaId}, ${cartao.id}, 'Despesa', ${total.toFixed(2)}, ${dataPg},
       ${descricao}, 'Efetivada', ${dataPg}, ${opts.conta_bancaria_id}, true)
    RETURNING id
  `);
    const txId = (_b = r[0]) === null || _b === void 0 ? void 0 : _b.id;
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE faturas
    SET status = 'paga',
        transacao_pagamento_id = ${txId},
        conta_bancaria_id = ${opts.conta_bancaria_id},
        data_pagamento = NOW()
    WHERE id = ${fatura.id}
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `
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
async function reabrirFaturaPf(fatura) {
    if (fatura.status !== "paga")
        throw new Error("Só é possível reabrir fatura paga.");
    if (fatura.transacao_pagamento_id) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM transacoes WHERE id = ${fatura.transacao_pagamento_id}`);
    }
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE transacoes
    SET status = 'Pendente', data_pagamento = NULL
    WHERE fatura_id = ${fatura.id} AND COALESCE(movimenta_caixa, false) = false
  `);
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE faturas
    SET status = 'aberta', transacao_pagamento_id = NULL, conta_bancaria_id = NULL, data_pagamento = NULL
    WHERE id = ${fatura.id}
    RETURNING *
  `);
    return r[0];
}
function periodoFaturaCorrente(diaFech) {
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
async function getSaldoCartaoPf(cartaoId) {
    var _a, _b, _c;
    const cartaoRows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM formas_pagamento WHERE id = ${cartaoId} LIMIT 1`);
    const cartao = cartaoRows[0];
    if (!cartao)
        throw new Error("Cartão não encontrado");
    const limite = (0, fatura_core_1.num)(cartao.limite);
    const semLimite = !(limite > 0);
    const { inicio, fim } = periodoFaturaCorrente(Number(cartao.dia_fechamento) || 1);
    // Fluxo novo (faturas abertas) + legado (sem fatura_id, período corrente).
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const usado = (0, fatura_core_1.num)((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.total);
    const disponivel = semLimite ? null : Math.max(0, limite - usado);
    const percentual = semLimite ? 0 : (usado / limite) * 100;
    return {
        cartao_nome: cartao.nome,
        limite: Math.round(limite * 100) / 100,
        usado: Math.round(usado * 100) / 100,
        disponivel: disponivel == null ? null : Math.round(disponivel * 100) / 100,
        percentual: Math.round(percentual * 10) / 10,
        dia_fechamento: (_b = cartao.dia_fechamento) !== null && _b !== void 0 ? _b : null,
        dia_vencimento: (_c = cartao.dia_vencimento) !== null && _c !== void 0 ? _c : null,
        sem_limite: semLimite,
    };
}
/** Gastos do cartão no intervalo civil [de, ate] (compras, não pagamento de fatura). */
async function movimentoCartaoPeriodo(cartaoId, de, ate) {
    var _a, _b;
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND t.data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND t.data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
        usado: Math.round((0, fatura_core_1.num)((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.total) * 100) / 100,
        qtd: Number(((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.qtd) || 0),
    };
}
async function listarLancamentosCartaoPf(userId, cartaoId, de, ate) {
    const cartao = await cartaoPfDoUsuario(cartaoId, userId);
    if (!cartao || Number(cartao.usuario_id) !== userId)
        return [];
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND t.data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND t.data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    return rows;
}
async function listarCartoesComSaldoPf(userId, de, ate) {
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
                return Object.assign(Object.assign(Object.assign({}, c), saldo), { usado: mov.usado, disponivel, percentual: Math.round(percentual * 10) / 10, qtd_lancamentos: mov.qtd, periodo: { de: de || null, ate: ate || null }, faturas_recentes: faturas });
            }
            return Object.assign(Object.assign(Object.assign({}, c), saldo), { periodo: { de: null, ate: null }, faturas_recentes: faturas });
        }
        catch (_a) {
            return Object.assign(Object.assign({}, c), { limite: (0, fatura_core_1.num)(c.limite), usado: 0, disponivel: (0, fatura_core_1.num)(c.limite) > 0 ? (0, fatura_core_1.num)(c.limite) : null, percentual: 0, sem_limite: !((0, fatura_core_1.num)(c.limite) > 0), qtd_lancamentos: 0, periodo: { de: de || null, ate: ate || null }, faturas_recentes: [] });
        }
    }));
}
const NOME_FORMA_GENERICA_CC = (0, drizzle_orm_1.sql) `(
  nome ILIKE 'Cartão de Crédito'
  OR nome ILIKE 'Cartao de Credito'
  OR lower(nome) IN ('cartao de credito', 'cartão de crédito', 'cartao_credito', 'credit card', 'cartao', 'cartão')
)`;
async function garantirCartaoLegadoPf(userId) {
    var _a, _b;
    const ins = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    let cartao = ins[0] || null;
    if (!cartao) {
        const again = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT * FROM formas_pagamento
      WHERE usuario_id = ${userId}
        AND COALESCE(global, false) = false
        AND (
          nome ILIKE 'Cartão de Crédito (legado)'
          OR lower(nome) LIKE '%legado%'
        )
      ORDER BY id ASC LIMIT 1
    `);
        cartao = again[0] || null;
    }
    if (cartao && (cartao.dia_fechamento == null || cartao.dia_vencimento == null)) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE formas_pagamento
      SET dia_fechamento = COALESCE(dia_fechamento, 1),
          dia_vencimento = COALESCE(dia_vencimento, 10)
      WHERE id = ${cartao.id}
    `);
        cartao.dia_fechamento = (_a = cartao.dia_fechamento) !== null && _a !== void 0 ? _a : 1;
        cartao.dia_vencimento = (_b = cartao.dia_vencimento) !== null && _b !== void 0 ? _b : 10;
    }
    return cartao;
}
/** Anexa fatura e tira do caixa despesas já vinculadas a um cartão do usuário. */
async function anexarFaturasDoCartaoPf(userId, carteiraId, cartao) {
    const txsUser = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const faturaByComp = new Map();
    let n = 0;
    for (const t of txsUser) {
        const dataISO = String(t.data_transacao).slice(0, 10);
        const { competencia } = (0, fatura_core_1.competenciaDaCompra)(dataISO, Number(cartao.dia_fechamento) || 1, Number(cartao.dia_vencimento) || 10);
        let cached = faturaByComp.get(competencia);
        if (!cached) {
            const { fatura, competencia: comp } = await resolverFaturaPf(userId, carteiraId, cartao, dataISO);
            cached = { id: fatura.id, competencia: comp };
            faturaByComp.set(comp, cached);
        }
        await db_1.db.execute((0, drizzle_orm_1.sql) `
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
async function migrarTxsCartaoGenericoPf() {
    // 1) Formas incompletas → viram cartão (aparecem em Contas e Cartões).
    //    Inclui: dados de cartão preenchidos OU já usadas em despesas (ex.: Inter criado pelo agente sem dias).
    const promo = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const promovidos = promo.length;
    // Formas genéricas (global OU cópia do usuário) — nunca o próprio "legado".
    const g2 = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id FROM formas_pagamento
    WHERE (${NOME_FORMA_GENERICA_CC})
      AND nome NOT ILIKE '%legado%'
  `);
    const genIds = g2.map((r) => Number(r.id)).filter(Boolean);
    let usuarios = 0;
    let txs = 0;
    let anexadas = 0;
    if (genIds.length > 0) {
        const genIdsSql = drizzle_orm_1.sql.join(genIds.map((id) => (0, drizzle_orm_1.sql) `${id}`), (0, drizzle_orm_1.sql) `, `);
        const users = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT DISTINCT w.usuario_id AS usuario_id, w.id AS carteira_id
      FROM transacoes t
      JOIN carteiras w ON w.id = t.carteira_id
      WHERE t.forma_pagamento_id IN (${genIdsSql})
        AND t.tipo = 'Despesa'
    `);
        for (const u of users) {
            const userId = Number(u.usuario_id);
            const carteiraId = Number(u.carteira_id);
            if (!userId || !carteiraId)
                continue;
            // Sempre cartão legado — não despejar no Nubank/outro cartão nominal.
            const cartao = await garantirCartaoLegadoPf(userId);
            if (!cartao)
                continue;
            usuarios++;
            const txsUser = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT id, data_transacao
        FROM transacoes
        WHERE carteira_id = ${carteiraId}
          AND forma_pagamento_id IN (${genIdsSql})
          AND tipo = 'Despesa'
        ORDER BY data_transacao, id
      `);
            const faturaByComp = new Map();
            for (const t of txsUser) {
                const dataISO = String(t.data_transacao).slice(0, 10);
                const { competencia } = (0, fatura_core_1.competenciaDaCompra)(dataISO, Number(cartao.dia_fechamento) || 1, Number(cartao.dia_vencimento) || 10);
                let cached = faturaByComp.get(competencia);
                if (!cached) {
                    const { fatura, competencia: comp } = await resolverFaturaPf(userId, carteiraId, cartao, dataISO);
                    cached = { id: fatura.id, competencia: comp };
                    faturaByComp.set(comp, cached);
                }
                await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const pares = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    for (const p of pares) {
        const userId = Number(p.usuario_id);
        const carteiraId = Number(p.carteira_id);
        if (!userId || !carteiraId)
            continue;
        anexadas += await anexarFaturasDoCartaoPf(userId, carteiraId, {
            id: Number(p.cartao_id),
            dia_fechamento: Number(p.dia_fechamento),
            dia_vencimento: Number(p.dia_vencimento),
        });
    }
    return { usuarios, txs, promovidos, anexadas };
}
