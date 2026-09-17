"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filtrarContasPorEscopo = filtrarContasPorEscopo;
exports.escolherContaPadraoPf = escolherContaPadraoPf;
exports.listarContasPf = listarContasPf;
exports.contaPadraoPf = contaPadraoPf;
exports.saldoConta = saldoConta;
exports.movimentoContaPeriodo = movimentoContaPeriodo;
exports.listarLancamentosContaPf = listarLancamentosContaPf;
exports.listarContasComSaldoPf = listarContasComSaldoPf;
exports.criarContaPf = criarContaPf;
exports.atualizarContaPf = atualizarContaPf;
exports.excluirContaPf = excluirContaPf;
exports.listarLancamentosContaPj = listarLancamentosContaPj;
exports.montarExtratoContaPj = montarExtratoContaPj;
exports.listarContasComSaldoPj = listarContasComSaldoPj;
exports.saldoGeralPf = saldoGeralPf;
/**
 * Contas bancárias — PF (usuario_id, empresa_id NULL) e helpers de saldo.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const fatura_core_1 = require("./fatura-core");
/** Isolamento puro: PF = empresa_id null; PJ = empresa concreta. */
function filtrarContasPorEscopo(contas, escopo) {
    if (escopo.empresaId != null) {
        return contas.filter((c) => c.empresa_id === escopo.empresaId);
    }
    return contas.filter((c) => c.usuario_id === escopo.usuarioId && (c.empresa_id == null));
}
/** Conta padrão: tipo carteira ativa, senão a primeira ativa (não depende do nome). */
function escolherContaPadraoPf(contas) {
    var _a, _b;
    const ativas = contas.filter((c) => c.ativo !== false);
    const carteira = ativas.find((c) => c.tipo === "carteira");
    return (_b = (_a = (carteira || ativas[0])) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
}
async function listarContasPf(userId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM contas_bancarias
    WHERE usuario_id = ${userId} AND empresa_id IS NULL
    ORDER BY ativo DESC, tipo = 'carteira' DESC, nome NULLS LAST, banco
  `);
    return r;
}
async function contaPadraoPf(userId) {
    const contas = await listarContasPf(userId);
    return escolherContaPadraoPf(contas);
}
async function saldoConta(contaId, ate) {
    var _a, _b, _c;
    const contaRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT saldo_inicial FROM contas_bancarias WHERE id = ${contaId} LIMIT 1
  `);
    const ini = (0, fatura_core_1.num)((_a = contaRows[0]) === null || _a === void 0 ? void 0 : _a.saldo_inicial);
    // SALDO ATUAL = só dinheiro que JÁ se moveu (status Efetivada). Conta a pagar
    // em aberto é PREVISÃO e nunca entra aqui — ela aparece no Fluxo Projetado e
    // no "Saldo em aberto" da tela de Lançamentos. Regra idêntica para PF e PJ.
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const pf = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const pj = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    return Math.round((ini + (0, fatura_core_1.num)((_b = pf[0]) === null || _b === void 0 ? void 0 : _b.mov) + (0, fatura_core_1.num)((_c = pj[0]) === null || _c === void 0 ? void 0 : _c.mov)) * 100) / 100;
}
/** Movimento líquido da conta no intervalo [de, ate] (só Efetivada + caixa). */
async function movimentoContaPeriodo(contaId, de, ate) {
    var _a, _b, _c, _d, _e, _f;
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const pf = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const pj = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const entradas = (0, fatura_core_1.num)((_a = pf[0]) === null || _a === void 0 ? void 0 : _a.entradas) + (0, fatura_core_1.num)((_b = pj[0]) === null || _b === void 0 ? void 0 : _b.entradas);
    const saidas = (0, fatura_core_1.num)((_c = pf[0]) === null || _c === void 0 ? void 0 : _c.saidas) + (0, fatura_core_1.num)((_d = pj[0]) === null || _d === void 0 ? void 0 : _d.saidas);
    const qtd = Number(((_e = pf[0]) === null || _e === void 0 ? void 0 : _e.qtd) || 0) + Number(((_f = pj[0]) === null || _f === void 0 ? void 0 : _f.qtd) || 0);
    return {
        entradas: Math.round(entradas * 100) / 100,
        saidas: Math.round(saidas * 100) / 100,
        movimento: Math.round((entradas - saidas) * 100) / 100,
        qtd,
    };
}
async function listarLancamentosContaPf(userId, contaId, de, ate) {
    const conta = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id FROM contas_bancarias
    WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    LIMIT 1
  `);
    if (!conta[0])
        return [];
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND t.data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND t.data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    return rows;
}
async function listarContasComSaldoPf(userId, de, ate) {
    const contas = await listarContasPf(userId);
    const comPeriodo = Boolean(de || ate);
    return Promise.all(contas.map(async (c) => {
        const mov = await movimentoContaPeriodo(c.id, de, ate);
        const saldoFechamento = await saldoConta(c.id, ate);
        return Object.assign(Object.assign({}, c), { nome: c.nome || c.banco, 
            // Com período: saldo exibido = movimento líquido do intervalo.
            // Sem período: saldo acumulado atual.
            saldo: comPeriodo ? mov.movimento : saldoFechamento, saldo_atual: saldoFechamento, movimento: mov.movimento, entradas: mov.entradas, saidas: mov.saidas, qtd_lancamentos: mov.qtd, periodo: { de: de || null, ate: ate || null } });
    }));
}
async function criarContaPf(userId, b) {
    const nome = String(b.nome || "").trim();
    if (!nome)
        throw new Error("Nome é obrigatório");
    const tipo = b.tipo || "corrente";
    const banco = (b.banco || nome).trim();
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO contas_bancarias
      (empresa_id, usuario_id, banco, nome, tipo, saldo_inicial, ativo, cor, agencia, numero)
    VALUES
      (NULL, ${userId}, ${banco}, ${nome}, ${tipo},
       ${(Number(b.saldo_inicial) || 0).toFixed(2)}, true,
       ${b.cor || null}, ${b.agencia || null}, ${b.numero || null})
    RETURNING *
  `);
    return r[0];
}
async function atualizarContaPf(userId, contaId, b) {
    const atual = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM contas_bancarias
    WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    LIMIT 1
  `);
    if (!atual[0])
        return null;
    const a = atual[0];
    const nome = b.nome != null ? String(b.nome).trim() : a.nome;
    const banco = b.banco != null ? String(b.banco).trim() : a.banco;
    const tipo = b.tipo != null ? b.tipo : a.tipo;
    const cor = b.cor !== undefined ? b.cor : a.cor;
    const ativo = b.ativo != null ? !!b.ativo : a.ativo;
    const saldoIni = b.saldo_inicial != null ? Number(b.saldo_inicial).toFixed(2) : a.saldo_inicial;
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE contas_bancarias
    SET nome = ${nome}, banco = ${banco}, tipo = ${tipo}, cor = ${cor},
        ativo = ${ativo}, saldo_inicial = ${saldoIni}
    WHERE id = ${contaId} AND usuario_id = ${userId}
    RETURNING *
  `);
    return r[0] || null;
}
async function excluirContaPf(userId, contaId) {
    const usada = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT 1 FROM transacoes WHERE conta_bancaria_id = ${contaId} LIMIT 1
  `);
    if (usada.length > 0) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE contas_bancarias SET ativo = false
      WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    `);
        return { ok: true };
    }
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    DELETE FROM contas_bancarias
    WHERE id = ${contaId} AND usuario_id = ${userId} AND empresa_id IS NULL
    RETURNING id
  `);
    return { ok: r.length > 0 };
}
async function listarLancamentosContaPj(empresaId, contaId, de, ate) {
    const conta = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, nome, banco FROM contas_bancarias
    WHERE id = ${contaId} AND empresa_id = ${empresaId}
    LIMIT 1
  `);
    if (!conta[0])
        return [];
    const rotuloConta = conta[0].nome || conta[0].banco || "Conta";
    const filtroDe = de ? (0, drizzle_orm_1.sql) `AND t.data_transacao >= ${de}` : (0, drizzle_orm_1.sql) ``;
    const filtroAte = ate ? (0, drizzle_orm_1.sql) `AND t.data_transacao <= ${ate}` : (0, drizzle_orm_1.sql) ``;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT t.id, t.descricao, t.valor, t.tipo, t.data_transacao, t.status,
           t.movimenta_caixa, t.metodo_pagamento, t.parcela_num, t.parcela_total,
           c.nome AS categoria, c.codigo AS categoria_codigo
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.conta_bancaria_id = ${contaId}
      AND t.empresa_id = ${empresaId}
      AND COALESCE(t.movimenta_caixa, true) = true
      AND t.status = 'Efetivada'
      ${filtroDe}
      ${filtroAte}
    ORDER BY t.data_transacao ASC, t.id ASC
  `);
    return rows.map((r) => (Object.assign(Object.assign({}, r), { forma: r.metodo_pagamento || rotuloConta })));
}
/** Extrato PJ com saldo anterior, saldo por linha e saldo final. */
async function montarExtratoContaPj(empresaId, contaId, de, ate) {
    const contaRows = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, saldo_inicial FROM contas_bancarias
    WHERE id = ${contaId} AND empresa_id = ${empresaId} LIMIT 1
  `);
    const conta = contaRows[0];
    if (!conta) {
        return { saldo_inicial: 0, saldo_final: 0, saldo: 0, entradas: 0, saidas: 0, lancamentos: [] };
    }
    let saldoAnterior;
    if (de) {
        const d = new Date(`${de}T12:00:00`);
        d.setDate(d.getDate() - 1);
        const vespera = d.toISOString().slice(0, 10);
        saldoAnterior = await saldoConta(contaId, vespera);
    }
    else {
        saldoAnterior = (0, fatura_core_1.num)(conta.saldo_inicial);
    }
    const lista = await listarLancamentosContaPj(empresaId, contaId, de, ate);
    let saldo = saldoAnterior;
    let entradas = 0;
    let saidas = 0;
    const lancamentos = lista.map((l) => {
        const valor = Math.abs((0, fatura_core_1.num)(l.valor));
        const receita = l.tipo === "Receita";
        if (receita)
            entradas += valor;
        else
            saidas += valor;
        saldo = Math.round((saldo + (receita ? valor : -valor)) * 100) / 100;
        return Object.assign(Object.assign({}, l), { saldo });
    });
    const mov = await movimentoContaPeriodo(contaId, de, ate);
    return {
        saldo_inicial: Math.round(saldoAnterior * 100) / 100,
        saldo_final: Math.round(saldo * 100) / 100,
        saldo: mov.movimento,
        entradas: Math.round(entradas * 100) / 100,
        saidas: Math.round(saidas * 100) / 100,
        lancamentos,
    };
}
/** Lista contas PJ com saldo acumulado + movimento do período (se de/ate). */
async function listarContasComSaldoPj(empresaId, de, ate) {
    const { getContasBancariasByEmpresa } = await Promise.resolve().then(() => __importStar(require("../storage")));
    const contas = await getContasBancariasByEmpresa(empresaId);
    const comPeriodo = Boolean(de || ate);
    return Promise.all(contas.map(async (c) => {
        const saldoSistema = await saldoConta(c.id);
        const mov = await movimentoContaPeriodo(c.id, de, ate);
        return Object.assign(Object.assign({}, c), { nome: c.nome || c.banco, saldo_sistema: saldoSistema, saldo: comPeriodo ? mov.movimento : saldoSistema, movimento: mov.movimento, entradas: mov.entradas, saidas: mov.saidas, qtd_lancamentos: mov.qtd, periodo: { de: de || null, ate: ate || null } });
    }));
}
/** Soma dos saldos das contas ativas do usuário (= novo "saldo geral" PF). */
async function saldoGeralPf(userId) {
    const contas = await listarContasComSaldoPf(userId);
    return Math.round(contas.filter((c) => c.ativo !== false).reduce((s, c) => s + Number(c.saldo || 0), 0) * 100) / 100;
}
