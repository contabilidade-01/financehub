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
exports.listarCartoes = listarCartoes;
exports.criarCartao = criarCartao;
exports.excluirCartao = excluirCartao;
exports.registrarCompra = registrarCompra;
exports.listarFaturas = listarFaturas;
exports.saldoCartao = saldoCartao;
exports.listarCartoesComSaldo = listarCartoesComSaldo;
exports.lancamentosCartao = lancamentosCartao;
exports.detalheFatura = detalheFatura;
exports.fecharFatura = fecharFatura;
exports.reabrirFatura = reabrirFatura;
exports.conciliarFatura = conciliarFatura;
exports.pagarFatura = pagarFatura;
const fatura = __importStar(require("../services/fatura-pj.service"));
const conciliacao_service_1 = require("../services/conciliacao.service");
/**
 * Fatura de cartão PJ (competência × caixa).
 * Cartões da empresa, compras (competência) e pagamento (caixa).
 */
async function guardEmpresa(req, res) {
    const userId = req.user.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) {
        res.status(400).json({ error: "ID inválido." });
        return null;
    }
    if (!(await fatura.empresaDoUsuario(empresaId, userId))) {
        res.status(404).json({ error: "Empresa não encontrada." });
        return null;
    }
    return empresaId;
}
// GET /api/empresas/:id/cartoes
async function listarCartoes(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    return res.json(await fatura.listarCartoes(empresaId));
}
// POST /api/empresas/:id/cartoes
async function criarCartao(req, res) {
    var _a;
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const b = req.body || {};
    const nome = (b.nome || "").toString().trim();
    const diaFech = Number(b.dia_fechamento), diaVenc = Number(b.dia_vencimento);
    if (!nome)
        return res.status(400).json({ error: "nome é obrigatório" });
    if (!(diaFech >= 1 && diaFech <= 31))
        return res.status(400).json({ error: "dia_fechamento deve ser 1-31" });
    if (!(diaVenc >= 1 && diaVenc <= 31))
        return res.status(400).json({ error: "dia_vencimento deve ser 1-31" });
    const cartao = await fatura.criarCartao(empresaId, {
        nome, bandeira: (_a = b.bandeira) !== null && _a !== void 0 ? _a : null,
        limite: b.limite != null ? Number(b.limite).toFixed(2) : null,
        dia_fechamento: diaFech, dia_vencimento: diaVenc,
    });
    return res.status(201).json(cartao);
}
// DELETE /api/empresas/:id/cartoes/:cartaoId
async function excluirCartao(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user.id);
    if (!cartao || cartao.empresa_id !== empresaId)
        return res.status(404).json({ error: "Cartão não encontrado" });
    await fatura.excluirCartao(cartao.id);
    return res.json({ success: true });
}
// POST /api/empresas/:id/cartoes/:cartaoId/compras  { categoria_id, descricao, valor, data_transacao }
async function registrarCompra(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user.id);
    if (!cartao || cartao.empresa_id !== empresaId)
        return res.status(404).json({ error: "Cartão não encontrado" });
    const b = req.body || {};
    if (!b.categoria_id)
        return res.status(400).json({ error: "categoria_id (conta contábil) é obrigatória" });
    if (!b.descricao)
        return res.status(400).json({ error: "descricao é obrigatória" });
    if (b.valor == null || isNaN(Number(b.valor)))
        return res.status(400).json({ error: "valor inválido" });
    const data_transacao = /^\d{4}-\d{2}-\d{2}/.test(b.data_transacao || "") ? b.data_transacao : new Date().toISOString().slice(0, 10);
    const r = await fatura.registrarCompra(empresaId, cartao, { categoria_id: b.categoria_id, descricao: b.descricao, valor: b.valor, data_transacao });
    return res.status(201).json(r);
}
// GET /api/empresas/:id/cartoes/:cartaoId/faturas
async function listarFaturas(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user.id);
    if (!cartao || cartao.empresa_id !== empresaId)
        return res.status(404).json({ error: "Cartão não encontrado" });
    return res.json({ cartao, faturas: await fatura.listarFaturas(cartao.id) });
}
// GET /api/empresas/:id/cartoes/:cartaoId/saldo
async function saldoCartao(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user.id);
    if (!cartao || cartao.empresa_id !== empresaId)
        return res.status(404).json({ error: "Cartão não encontrado" });
    try {
        return res.json(await fatura.getSaldoCartaoEmpresa(cartao.id));
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao calcular saldo" });
    }
}
// GET /api/empresas/:id/cartoes-com-saldo
async function listarCartoesComSaldo(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const de = req.query.de || undefined;
    const ate = req.query.ate || undefined;
    return res.json(await fatura.listarCartoesComSaldo(empresaId, de, ate));
}
// GET /api/empresas/:id/cartoes/:cartaoId/lancamentos
async function lancamentosCartao(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const cartao = await fatura.cartaoDoUsuario(Number(req.params.cartaoId), req.user.id);
    if (!cartao || cartao.empresa_id !== empresaId) {
        return res.status(404).json({ error: "Cartão não encontrado" });
    }
    const de = req.query.de || undefined;
    const ate = req.query.ate || undefined;
    const lista = await fatura.listarLancamentosCartaoPj(empresaId, cartao.id, de, ate);
    const mov = await fatura.movimentoCartaoPeriodoPj(cartao.id, de, ate);
    return res.json({
        cartao_id: cartao.id,
        cartao_nome: cartao.nome,
        periodo: { de: de || null, ate: ate || null },
        saldo: mov.usado,
        usado: mov.usado,
        lancamentos: lista,
    });
}
// GET /api/empresas/:id/faturas/:faturaId
async function detalheFatura(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const f = await fatura.getFaturaById(Number(req.params.faturaId));
    if (!f || f.empresa_id !== empresaId)
        return res.status(404).json({ error: "Fatura não encontrada" });
    return res.json(await fatura.detalheFatura(f.id));
}
// POST /api/empresas/:id/faturas/:faturaId/fechar
async function fecharFatura(req, res) {
    const empresaId = await guardEmpresa(req, res);
    if (!empresaId)
        return;
    const f = await fatura.getFaturaById(Number(req.params.faturaId));
    if (!f || f.empresa_id !== empresaId)
        return res.status(404).json({ error: "Fatura não encontrada" });
    if (f.status === "paga")
        return res.status(409).json({ error: "Fatura já paga" });
    return res.json(await fatura.fecharFatura(f.id));
}
// POST /api/empresas/:id/faturas/:faturaId/reabrir
async function reabrirFatura(req, res) {
    try {
        const empresaId = await guardEmpresa(req, res);
        if (!empresaId)
            return;
        const f = await fatura.getFaturaById(Number(req.params.faturaId));
        if (!f || f.empresa_id !== empresaId)
            return res.status(404).json({ error: "Fatura não encontrada" });
        if (f.status === "aberta")
            return res.json(f);
        return res.json(await fatura.reabrirFatura(f));
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao reabrir fatura" });
    }
}
// POST /api/empresas/:id/faturas/:faturaId/conciliar  (multipart: arquivo OFX/CSV/XLSX)
async function conciliarFatura(req, res) {
    try {
        const empresaId = await guardEmpresa(req, res);
        if (!empresaId)
            return;
        const f = await fatura.getFaturaById(Number(req.params.faturaId));
        if (!f || f.empresa_id !== empresaId)
            return res.status(404).json({ error: "Fatura não encontrada" });
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: "Envie o extrato do cartão (OFX, CSV ou XLSX) no campo 'arquivo'." });
        const movimentos = (0, conciliacao_service_1.parseArquivoExtrato)(file.buffer, file.originalname || "");
        if (!movimentos.length)
            return res.status(400).json({ error: "Nenhum lançamento reconhecido no arquivo." });
        const resultado = await fatura.conciliarFatura(f, movimentos.map((m) => ({ data: m.data, valor: m.valor, descricao: m.descricao })));
        return res.json(resultado);
    }
    catch (e) {
        console.error("conciliarFatura PJ:", e);
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao conciliar fatura" });
    }
}
// POST /api/empresas/:id/faturas/:faturaId/pagar  { conta_contabil_id, conta_bancaria_id?, data_pagamento? }
async function pagarFatura(req, res) {
    try {
        const empresaId = await guardEmpresa(req, res);
        if (!empresaId)
            return;
        const f = await fatura.getFaturaById(Number(req.params.faturaId));
        if (!f || f.empresa_id !== empresaId)
            return res.status(404).json({ error: "Fatura não encontrada" });
        if (f.status === "paga")
            return res.status(409).json({ error: "Fatura já está paga" });
        const cartao = await fatura.cartaoDoUsuario(f.cartao_id, req.user.id);
        if (!cartao)
            return res.status(404).json({ error: "Cartão não encontrado" });
        const b = req.body || {};
        if (!b.conta_contabil_id)
            return res.status(400).json({ error: "conta_contabil_id é obrigatória (classificação do pagamento)" });
        const r = await fatura.pagarFatura(empresaId, f, cartao, {
            conta_contabil_id: Number(b.conta_contabil_id),
            conta_bancaria_id: b.conta_bancaria_id ? Number(b.conta_bancaria_id) : null,
            data_pagamento: b.data_pagamento,
        });
        return res.json(r);
    }
    catch (e) {
        console.error("pagarFatura PJ:", e);
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao pagar fatura" });
    }
}
