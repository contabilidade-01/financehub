"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competenciaDaCompra = void 0;
exports.cartaoDoUsuario = cartaoDoUsuario;
exports.empresaDoUsuario = empresaDoUsuario;
exports.listarCartoes = listarCartoes;
exports.chaveNomeCartao = chaveNomeCartao;
exports.criarCartao = criarCartao;
exports.excluirCartao = excluirCartao;
exports.resolverFaturaDoCartao = resolverFaturaDoCartao;
exports.resolverFaturaPorCompetencia = resolverFaturaPorCompetencia;
exports.registrarCompra = registrarCompra;
exports.getFaturaTotal = getFaturaTotal;
exports.listarFaturas = listarFaturas;
exports.getFaturaById = getFaturaById;
exports.detalheFatura = detalheFatura;
exports.conciliarFatura = conciliarFatura;
exports.fecharFatura = fecharFatura;
exports.reabrirFatura = reabrirFatura;
exports.pagarFatura = pagarFatura;
exports.getSaldoCartaoEmpresa = getSaldoCartaoEmpresa;
exports.movimentoCartaoPeriodoPj = movimentoCartaoPeriodoPj;
exports.listarLancamentosCartaoPj = listarLancamentosCartaoPj;
exports.listarCartoesComSaldo = listarCartoesComSaldo;
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
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const fatura_core_1 = require("./fatura-core");
Object.defineProperty(exports, "competenciaDaCompra", { enumerable: true, get: function () { return fatura_core_1.competenciaDaCompra; } });
// Valida que o cartão pertence a uma empresa do usuário. Retorna o cartão + empresa_id.
async function cartaoDoUsuario(cartaoId, userId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT c.*, e.usuario_id
    FROM empresas_cartoes c
    JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = ${cartaoId} AND e.usuario_id = ${userId}
    LIMIT 1
  `);
    return r[0] || null;
}
async function empresaDoUsuario(empresaId, userId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM empresas WHERE id = ${empresaId} AND usuario_id = ${userId} LIMIT 1`);
    return r.length > 0;
}
async function listarCartoes(empresaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM empresas_cartoes WHERE empresa_id = ${empresaId} ORDER BY ativo DESC, nome`);
    return r;
}
/** "CC Nubank" / "Nubank" / "nubank pj" → mesma chave (evita cartão duplicado). */
function chaveNomeCartao(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/^cc\s+/, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
/**
 * Cadastra OU atualiza cartão pelo nome na empresa.
 * O agente WhatsApp às vezes chama cadastrar_cartao_empresa 2× no mesmo fluxo —
 * sem upsert isso gerava dois "CC Nubank" no seletor.
 */
async function criarCartao(empresaId, b) {
    var _a, _b;
    const nome = String(b.nome || "").trim();
    if (!nome)
        throw new Error("Nome do cartão é obrigatório");
    const chave = chaveNomeCartao(nome);
    const lista = await listarCartoes(empresaId);
    const existente = lista.find((c) => chaveNomeCartao(c.nome) === chave);
    if (existente) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE empresas_cartoes SET
        bandeira = COALESCE(${(_a = b.bandeira) !== null && _a !== void 0 ? _a : null}, bandeira),
        limite = COALESCE(${b.limite != null ? Number(b.limite).toFixed(2) : null}, limite),
        dia_fechamento = COALESCE(${b.dia_fechamento != null ? Number(b.dia_fechamento) : null}, dia_fechamento),
        dia_vencimento = COALESCE(${b.dia_vencimento != null ? Number(b.dia_vencimento) : null}, dia_vencimento),
        ativo = true
      WHERE id = ${existente.id}
    `);
        const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM empresas_cartoes WHERE id = ${existente.id} LIMIT 1`);
        return Object.assign(Object.assign({}, r[0]), { atualizado: true });
    }
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO empresas_cartoes (empresa_id, nome, bandeira, limite, dia_fechamento, dia_vencimento, ativo)
    VALUES (
      ${empresaId},
      ${nome},
      ${(_b = b.bandeira) !== null && _b !== void 0 ? _b : null},
      ${b.limite != null ? Number(b.limite).toFixed(2) : null},
      ${Number(b.dia_fechamento)},
      ${Number(b.dia_vencimento)},
      true
    )
    RETURNING *
  `);
    return Object.assign(Object.assign({}, r[0]), { atualizado: false });
}
async function excluirCartao(cartaoId) {
    await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM empresas_cartoes WHERE id = ${cartaoId}`);
}
async function getOrCreateFatura(empresaId, cartaoId, competencia, dataFech, dataVenc) {
    const existente = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM empresas_faturas WHERE cartao_id = ${cartaoId} AND competencia = ${competencia} LIMIT 1`);
    if (existente[0])
        return existente[0];
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO empresas_faturas (empresa_id, cartao_id, competencia, data_fechamento, data_vencimento, status)
    VALUES (${empresaId}, ${cartaoId}, ${competencia}, ${dataFech}, ${dataVenc}, 'aberta')
    ON CONFLICT (cartao_id, competencia) DO UPDATE SET competencia = EXCLUDED.competencia
    RETURNING *
  `);
    return r[0];
}
/**
 * Resolve cartão + fatura da competência para uma compra.
 * Usado por registrarCompra e pelo create/update de Transações PJ.
 */
async function resolverFaturaDoCartao(empresaId, cartao, dataISO) {
    const { competencia, dataFech, dataVenc } = (0, fatura_core_1.competenciaDaCompra)(dataISO, Number(cartao.dia_fechamento), Number(cartao.dia_vencimento));
    const fatura = await getOrCreateFatura(empresaId, cartao.id, competencia, dataFech, dataVenc);
    return { fatura, competencia, metodo: cartao.nome };
}
/** Fatura de uma competência já decidida (parcela i = competência da 1ª + i meses). */
async function resolverFaturaPorCompetencia(empresaId, cartao, competencia) {
    const { competencia: comp, dataFech, dataVenc } = (0, fatura_core_1.datasDaCompetencia)(competencia, Number(cartao.dia_fechamento), Number(cartao.dia_vencimento));
    const fatura = await getOrCreateFatura(empresaId, cartao.id, comp, dataFech, dataVenc);
    return { fatura, competencia: comp, metodo: cartao.nome };
}
// Registra uma compra no cartão (competência, não mexe no caixa).
async function registrarCompra(empresaId, cartao, b) {
    const dataISO = String(b.data_transacao).slice(0, 10);
    const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataISO);
    const valor = Number(b.valor).toFixed(2);
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, movimenta_caixa, cartao_id, fatura_id, competencia, metodo_pagamento)
    VALUES
      (${empresaId}, ${Number(b.categoria_id)}, ${b.descricao}, ${valor}, 'Despesa', ${dataISO}, 'Efetivada', 'manual', false, ${cartao.id}, ${fatura.id}, ${competencia}, ${metodo})
    RETURNING *
  `);
    return { compra: r[0], fatura };
}
async function getFaturaTotal(faturaId) {
    var _a;
    // Só as compras (competência); o pagamento não entra no total da fatura.
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM empresas_transacoes
    WHERE fatura_id = ${faturaId} AND COALESCE(movimenta_caixa, true) = false
  `);
    return (0, fatura_core_1.num)((_a = r[0]) === null || _a === void 0 ? void 0 : _a.total);
}
async function listarFaturas(cartaoId) {
    const faturas = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM empresas_faturas WHERE cartao_id = ${cartaoId} ORDER BY competencia DESC`);
    const out = [];
    for (const f of faturas)
        out.push(Object.assign(Object.assign({}, f), { total: await getFaturaTotal(f.id) }));
    return out;
}
async function getFaturaById(faturaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM empresas_faturas WHERE id = ${faturaId} LIMIT 1`);
    return r[0] || null;
}
async function detalheFatura(faturaId) {
    const fatura = await getFaturaById(faturaId);
    if (!fatura)
        return null;
    const compras = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.categoria_id,
           t.parcela_num, t.parcela_total,
           c.nome AS categoria_nome, c.codigo AS categoria_codigo
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.fatura_id = ${faturaId}
      AND COALESCE(t.movimenta_caixa, true) = false
    ORDER BY t.data_transacao
  `);
    return { fatura, compras: compras, total: await getFaturaTotal(faturaId) };
}
// Concilia o extrato do cartão (linhas do banco) com as compras registradas na
// fatura. Casa por valor + data (±3 dias) e marca as compras casadas como
// conciliado=true. Retorna o comparativo (casados, sem-par dos dois lados, totais).
async function conciliarFatura(fatura, movimentos) {
    const comprasRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, descricao, valor, data_transacao, COALESCE(conciliado, false) AS conciliado
    FROM empresas_transacoes
    WHERE fatura_id = ${fatura.id} AND COALESCE(movimenta_caixa, true) = false
  `);
    const compras = comprasRows.map((c) => ({ id: Number(c.id), descricao: c.descricao, valor: Math.abs((0, fatura_core_1.num)(c.valor)), data: String(c.data_transacao).slice(0, 10), conciliado: c.conciliado === true, usado: false }));
    const conciliados = [];
    const extratoSemPar = [];
    const dias = (a, b) => Math.abs((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86400000);
    for (const mov of movimentos) {
        const alvo = Math.abs(mov.valor);
        let melhor = null, melhorDelta = Infinity;
        for (const c of compras) {
            if (c.usado)
                continue;
            if (Math.abs(c.valor - alvo) > 0.005)
                continue;
            const d = dias(c.data, mov.data);
            if (d <= 3 && d < melhorDelta) {
                melhor = c;
                melhorDelta = d;
            }
        }
        if (melhor) {
            melhor.usado = true;
            conciliados.push({ extrato: { data: mov.data, valor: mov.valor, descricao: mov.descricao }, compra_id: melhor.id, compra_descricao: melhor.descricao });
            await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE empresas_transacoes SET conciliado = true WHERE id = ${melhor.id}`);
        }
        else {
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
async function fecharFatura(faturaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `UPDATE empresas_faturas SET status = 'fechada' WHERE id = ${faturaId} AND status <> 'paga' RETURNING *`);
    return r[0];
}
/**
 * Reabre fatura:
 * - fechada → aberta (só muda status)
 * - paga → estorna a saída de caixa do pagamento e volta a aberta
 */
async function reabrirFatura(fatura) {
    if (fatura.status === "aberta") {
        return fatura;
    }
    if (fatura.status === "fechada") {
        const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE empresas_faturas SET status = 'aberta'
      WHERE id = ${fatura.id} AND status = 'fechada'
      RETURNING *
    `);
        return r[0] || fatura;
    }
    if (fatura.status !== "paga") {
        throw new Error(`Não é possível reabrir fatura com status "${fatura.status}".`);
    }
    if (fatura.transacao_pagamento_id) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      DELETE FROM empresas_transacoes WHERE id = ${fatura.transacao_pagamento_id}
    `);
    }
    // Compras voltam a “em aberto” no limite do cartão (sem data_pagamento).
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE empresas_transacoes
    SET data_pagamento = NULL
    WHERE fatura_id = ${fatura.id}
      AND COALESCE(movimenta_caixa, false) = false
  `);
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE empresas_faturas
    SET status = 'aberta', transacao_pagamento_id = NULL, data_pagamento = NULL
    WHERE id = ${fatura.id}
    RETURNING *
  `);
    return r[0];
}
// Paga a fatura: cria UMA saída de caixa (movimenta_caixa=true) e marca como paga.
async function pagarFatura(empresaId, fatura, cartao, opts) {
    var _a, _b;
    const total = await getFaturaTotal(fatura.id);
    if (total <= 0)
        throw new Error("Fatura sem valor a pagar");
    const dataPg = opts.data_pagamento && /^\d{4}-\d{2}-\d{2}/.test(opts.data_pagamento) ? opts.data_pagamento.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const descricao = `Pagamento fatura ${cartao.nome} ${fatura.competencia}`;
    // NÃO leva fatura_id (senão entraria no total da fatura). O vínculo é via
    // empresas_faturas.transacao_pagamento_id.
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, movimenta_caixa, conta_bancaria_id, cartao_id)
    VALUES
      (${empresaId}, ${opts.conta_contabil_id}, ${descricao}, ${total.toFixed(2)}, 'Despesa', ${dataPg}, 'Efetivada', 'manual', true, ${(_a = opts.conta_bancaria_id) !== null && _a !== void 0 ? _a : null}, ${cartao.id})
    RETURNING id
  `);
    const txId = (_b = r[0]) === null || _b === void 0 ? void 0 : _b.id;
    const upd = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE empresas_faturas SET status = 'paga', transacao_pagamento_id = ${txId}, data_pagamento = NOW()
    WHERE id = ${fatura.id} RETURNING *
  `);
    // Baixa as compras da fatura: marcam data_pagamento (saem do "usado" do cartão
    // porque a fatura agora está paga — getSaldoCartaoEmpresa filtra status paga).
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE empresas_transacoes
    SET status = 'Efetivada', data_pagamento = ${dataPg}
    WHERE fatura_id = ${fatura.id}
      AND COALESCE(movimenta_caixa, false) = false
  `);
    return { fatura: upd[0], transacao_id: txId, total };
}
/**
 * Saldo do cartão PJ: limite − compras ainda não pagas (faturas abertas/fechadas).
 * Espelha o getSaldoCartao do PF, mas sobre empresas_cartoes + empresas_transacoes.
 */
async function getSaldoCartaoEmpresa(cartaoId) {
    var _a, _b, _c;
    const cartaoRows = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM empresas_cartoes WHERE id = ${cartaoId} LIMIT 1`);
    const cartao = cartaoRows[0];
    if (!cartao)
        throw new Error("Cartão não encontrado");
    const limite = (0, fatura_core_1.num)(cartao.limite);
    // Usado = compras (competência) em faturas ainda não pagas + compras sem fatura.
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COALESCE(SUM(ABS(t.valor::numeric)), 0) AS total
    FROM empresas_transacoes t
    LEFT JOIN empresas_faturas f ON f.id = t.fatura_id
    WHERE t.cartao_id = ${cartaoId}
      AND t.tipo = 'Despesa'
      AND COALESCE(t.movimenta_caixa, false) = false
      AND (t.fatura_id IS NULL OR f.status IN ('aberta', 'fechada'))
  `);
    const usado = (0, fatura_core_1.num)((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.total);
    const disponivel = limite > 0 ? Math.max(0, limite - usado) : 0;
    const percentual = limite > 0 ? (usado / limite) * 100 : 0;
    return {
        cartao_nome: cartao.nome,
        limite: Math.round(limite * 100) / 100,
        usado: Math.round(usado * 100) / 100,
        disponivel: Math.round(disponivel * 100) / 100,
        percentual: Math.round(percentual * 10) / 10,
        dia_fechamento: (_b = cartao.dia_fechamento) !== null && _b !== void 0 ? _b : null,
        dia_vencimento: (_c = cartao.dia_vencimento) !== null && _c !== void 0 ? _c : null,
    };
}
/** Gastos do cartão PJ no intervalo civil [de, ate]. */
async function movimentoCartaoPeriodoPj(cartaoId, de, ate) {
    var _a, _b;
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND t.data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND t.data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
        usado: Math.round((0, fatura_core_1.num)((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.total) * 100) / 100,
        qtd: Number(((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.qtd) || 0),
    };
}
async function listarLancamentosCartaoPj(empresaId, cartaoId, de, ate) {
    const cartao = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id FROM empresas_cartoes
    WHERE id = ${cartaoId} AND empresa_id = ${empresaId}
    LIMIT 1
  `);
    if (!cartao[0])
        return [];
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND t.data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND t.data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    return rows;
}
async function listarCartoesComSaldo(empresaId, de, ate) {
    const cartoes = await listarCartoes(empresaId);
    const hoje = new Date().toISOString().slice(0, 10);
    return Promise.all(cartoes.map(async (c) => {
        var _a, _b;
        try {
            const saldo = await getSaldoCartaoEmpresa(c.id);
            // Fatura corrente (competência de hoje) — número principal do card.
            let fatura_corrente = null;
            try {
                const { competencia } = (0, fatura_core_1.competenciaDaCompra)(hoje, Number(c.dia_fechamento), Number(c.dia_vencimento));
                const fatRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
          SELECT * FROM empresas_faturas
          WHERE cartao_id = ${c.id} AND competencia = ${competencia}
          LIMIT 1
        `);
                const f = fatRows[0];
                if (f) {
                    fatura_corrente = {
                        id: f.id,
                        competencia: f.competencia,
                        total: await getFaturaTotal(f.id),
                        status: f.status,
                    };
                }
                else {
                    fatura_corrente = { id: 0, competencia, total: 0, status: "aberta" };
                }
            }
            catch ( /* sem fatura corrente */_c) { /* sem fatura corrente */ }
            const mov = de || ate ? await movimentoCartaoPeriodoPj(c.id, de, ate) : null;
            return Object.assign(Object.assign(Object.assign({}, c), saldo), { fatura_corrente, 
                // Mantém gasto do período civil como extra; o card usa fatura_corrente.
                gasto_periodo: (_a = mov === null || mov === void 0 ? void 0 : mov.usado) !== null && _a !== void 0 ? _a : null, qtd_lancamentos: (_b = mov === null || mov === void 0 ? void 0 : mov.qtd) !== null && _b !== void 0 ? _b : undefined, periodo: { de: de || null, ate: ate || null } });
        }
        catch (_d) {
            return Object.assign(Object.assign({}, c), { limite: (0, fatura_core_1.num)(c.limite), usado: 0, disponivel: (0, fatura_core_1.num)(c.limite), percentual: 0, fatura_corrente: null, qtd_lancamentos: 0, periodo: { de: de || null, ate: ate || null } });
        }
    }));
}
