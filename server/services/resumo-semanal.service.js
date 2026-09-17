"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.periodoSemanaAnterior = periodoSemanaAnterior;
exports.deveEnviarResumoSemanal = deveEnviarResumoSemanal;
exports.calcularResumoSemanalPf = calcularResumoSemanalPf;
exports.calcularResumoSemanalPj = calcularResumoSemanalPj;
exports.montarMensagemResumoSemanal = montarMensagemResumoSemanal;
exports.resolverEmpresaParaResumo = resolverEmpresaParaResumo;
/**
 * Resumo semanal WhatsApp — PF (transacoes) e PJ (empresas_transacoes).
 * Isolado do job para testar período e filtros sem UazAPI.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const storage_1 = require("../storage");
/** Semana passada (seg–dom) relativa a um instante em SP. */
function periodoSemanaAnterior(spNow) {
    const monday = new Date(spNow);
    monday.setDate(spNow.getDate() - 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const iso = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };
    // Usar componentes locais do Date já “em SP” (job passa spNow via toLocaleString).
    return { de: iso(monday), ate: iso(sunday) };
}
function deveEnviarResumoSemanal(spNow) {
    return spNow.getDay() === 1 && spNow.getHours() >= 8 && spNow.getHours() <= 9;
}
/** Exclui quitação de fatura (mesma regra do resumo PJ). */
const NAO_PAG_FATURA_PF = (0, drizzle_orm_1.sql) `NOT EXISTS (
  SELECT 1 FROM faturas f WHERE f.transacao_pagamento_id = transacoes.id
)`;
async function calcularResumoSemanalPf(walletId, de, ate) {
    var _a, _b;
    const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
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
    const row = (_a = rows[0]) !== null && _a !== void 0 ? _a : (_b = rows.rows) === null || _b === void 0 ? void 0 : _b[0];
    const receita = parseFloat(row === null || row === void 0 ? void 0 : row.receita) || 0;
    const despesa = parseFloat(row === null || row === void 0 ? void 0 : row.despesa) || 0;
    return {
        receita,
        despesa,
        saldo: receita - despesa,
        qtd: parseInt(String((row === null || row === void 0 ? void 0 : row.qtd) || 0), 10) || 0,
        de,
        ate,
        escopo: "pf",
    };
}
async function calcularResumoSemanalPj(empresaId, de, ate, empresaNome) {
    const r = await storage_1.storage.getEmpresaResumo(empresaId, { de, ate });
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
function montarMensagemResumoSemanal(r) {
    const emoji = r.saldo >= 0 ? "✅" : "🔴";
    const titulo = r.escopo === "pj"
        ? `📊 *Resumo Semanal* (empresa${r.empresa_nome ? `: ${r.empresa_nome}` : ""})`
        : `📊 *Resumo Semanal*`;
    return (`${titulo}\n🗓 ${r.de} a ${r.ate}\n\n` +
        `💰 Receitas: R$ ${r.receita.toFixed(2)}\n` +
        `💸 Despesas: R$ ${r.despesa.toFixed(2)}\n` +
        `${emoji} Saldo: R$ ${r.saldo.toFixed(2)}\n` +
        `📝 ${r.qtd} transações\n\n` +
        `Boa semana! 🚀`);
}
/** Resolve empresa do usuário PJ (mesma preferência do webhook). */
async function resolverEmpresaParaResumo(usuarioId) {
    const empresas = await storage_1.storage.getEmpresasByUsuarioId(usuarioId);
    if (!empresas.length)
        return null;
    const comCnpj = empresas.find((e) => e.cnpj && String(e.cnpj).trim().length > 0);
    const emp = comCnpj || empresas[0];
    return {
        id: emp.id,
        nome: emp.nome_fantasia || emp.razao_social,
    };
}
