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
exports.atualizarTransacaoEmpresa = atualizarTransacaoEmpresa;
exports.baixarTransacaoEmpresa = baixarTransacaoEmpresa;
exports.reabrirTransacaoEmpresa = reabrirTransacaoEmpresa;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
const meio_pagamento_pj_1 = require("./meio-pagamento-pj");
async function atualizarTransacaoEmpresa(empresaId, transacaoId, userId, dados) {
    var _a, _b, _c, _d, _e, _f, _g;
    const empresa = await storage_1.storage.getEmpresaById(empresaId);
    if (!empresa)
        return { ok: false, status: 404, error: "Empresa não encontrada." };
    if (empresa.usuario_id !== userId)
        return { ok: false, status: 403, error: "Acesso negado." };
    const transacao = await storage_1.storage.getEmpresaTransacaoById(transacaoId);
    if (!transacao)
        return { ok: false, status: 404, error: "Transação não encontrada." };
    if (transacao.empresa_id !== empresaId) {
        return { ok: false, status: 403, error: "Transação não pertence a esta empresa." };
    }
    const bruto = (dados || {});
    const parsed = schema_1.updateEmpresaTransacaoSchema.safeParse(dados);
    if (!parsed.success) {
        return { ok: false, status: 400, error: "Dados inválidos", details: parsed.error.errors };
    }
    const tipoFinal = (_a = parsed.data.tipo) !== null && _a !== void 0 ? _a : transacao.tipo;
    const contaFinalId = (_b = parsed.data.categoria_id) !== null && _b !== void 0 ? _b : transacao.categoria_id;
    const conta = await storage_1.storage.getEmpresaContaById(contaFinalId);
    if (!conta)
        return { ok: false, status: 400, error: "Categoria não encontrada." };
    if (conta.empresa_id !== empresaId) {
        return { ok: false, status: 400, error: "Categoria não pertence a esta empresa." };
    }
    if (conta.tipo !== tipoFinal) {
        return {
            ok: false,
            status: 400,
            error: `Tipo '${tipoFinal}' incompatível com a conta '${conta.codigo} — ${conta.nome}' (${conta.tipo}). Escolha uma conta de ${tipoFinal}.`,
        };
    }
    const patch = Object.assign({}, parsed.data);
    const dataISO = String((_c = parsed.data.data_transacao) !== null && _c !== void 0 ? _c : transacao.data_transacao).slice(0, 10);
    const mudouCartao = Object.prototype.hasOwnProperty.call(bruto, "cartao_id");
    const mudouContaBanc = Object.prototype.hasOwnProperty.call(bruto, "conta_bancaria_id");
    if (mudouCartao || mudouContaBanc) {
        const cartaoId = mudouCartao
            ? (bruto.cartao_id == null || bruto.cartao_id === "" ? null : Number(bruto.cartao_id))
            : ((_d = transacao.cartao_id) !== null && _d !== void 0 ? _d : null);
        // Se trocou para cartão, zera conta; se trocou para conta, zera cartão.
        let contaBancId = mudouContaBanc
            ? (bruto.conta_bancaria_id == null || bruto.conta_bancaria_id === "" ? null : Number(bruto.conta_bancaria_id))
            : ((_e = transacao.conta_bancaria_id) !== null && _e !== void 0 ? _e : null);
        let cartaoFinal = cartaoId;
        if (mudouCartao && cartaoId)
            contaBancId = null;
        if (mudouContaBanc && !mudouCartao)
            cartaoFinal = null;
        if (mudouContaBanc && contaBancId && !cartaoId)
            cartaoFinal = null;
        if (mudouCartao && cartaoId == null && !mudouContaBanc) {
            // Saiu do cartão sem informar conta → usa padrão / exige.
            contaBancId = (_f = transacao.conta_bancaria_id) !== null && _f !== void 0 ? _f : null;
        }
        try {
            const meio = await (0, meio_pagamento_pj_1.aplicarMeioPagamentoPj)({
                userId,
                empresaId,
                tipo: tipoFinal,
                dataISO,
                cartao_id: cartaoFinal,
                conta_bancaria_id: contaBancId,
                exigirMeio: true,
                statusAtual: (_g = parsed.data.status) !== null && _g !== void 0 ? _g : transacao.status,
            });
            patch.cartao_id = meio.cartao_id;
            patch.conta_bancaria_id = meio.conta_bancaria_id;
            patch.fatura_id = meio.fatura_id;
            patch.competencia = meio.competencia;
            patch.movimenta_caixa = meio.movimenta_caixa;
            patch.empresa_forma_pagamento_id = meio.empresa_forma_pagamento_id;
            patch.metodo_pagamento = meio.metodo_pagamento;
        }
        catch (meioErr) {
            return { ok: false, status: 400, error: (meioErr === null || meioErr === void 0 ? void 0 : meioErr.message) || "Meio de pagamento inválido." };
        }
    }
    else if (transacao.cartao_id) {
        // Continua no mesmo cartão: se mudou a data, reatribui a fatura da competência.
        const dataNova = parsed.data.data_transacao
            ? String(parsed.data.data_transacao).slice(0, 10)
            : null;
        if (dataNova && dataNova !== String(transacao.data_transacao).slice(0, 10)) {
            try {
                const meio = await (0, meio_pagamento_pj_1.aplicarMeioPagamentoPj)({
                    userId,
                    empresaId,
                    tipo: tipoFinal,
                    dataISO: dataNova,
                    cartao_id: Number(transacao.cartao_id),
                    exigirMeio: true,
                });
                patch.fatura_id = meio.fatura_id;
                patch.competencia = meio.competencia;
                patch.metodo_pagamento = meio.metodo_pagamento;
                patch.movimenta_caixa = false;
                patch.conta_bancaria_id = null;
            }
            catch (meioErr) {
                return { ok: false, status: 400, error: (meioErr === null || meioErr === void 0 ? void 0 : meioErr.message) || "Meio de pagamento inválido." };
            }
        }
    }
    const updated = await storage_1.storage.updateEmpresaTransacao(transacaoId, patch);
    return { ok: true, transacao: updated, anterior: transacao };
}
/**
 * Baixa uma conta a pagar PJ: Pendente → Efetivada.
 * - Sem cartão: liga movimenta_caixa (entra no fluxo de caixa).
 * - Com cartão: mantém competência (não mexe caixa); garante vínculo na fatura
 *   aberta — o saldo do cartão continua refletindo até a fatura ser paga.
 */
async function baixarTransacaoEmpresa(empresaId, transacaoId, userId, dataPagamento) {
    const empresa = await storage_1.storage.getEmpresaById(empresaId);
    if (!empresa)
        return { ok: false, status: 404, error: "Empresa não encontrada." };
    if (empresa.usuario_id !== userId)
        return { ok: false, status: 403, error: "Acesso negado." };
    const transacao = await storage_1.storage.getEmpresaTransacaoById(transacaoId);
    if (!transacao)
        return { ok: false, status: 404, error: "Transação não encontrada." };
    if (transacao.empresa_id !== empresaId) {
        return { ok: false, status: 403, error: "Transação não pertence a esta empresa." };
    }
    if (transacao.status === "Efetivada" && transacao.data_pagamento) {
        return { ok: false, status: 400, error: "Este lançamento já está baixado." };
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const data = (dataPagamento && /^\d{4}-\d{2}-\d{2}/.test(dataPagamento))
        ? dataPagamento.slice(0, 10)
        : hoje;
    const cartaoId = transacao.cartao_id;
    if (cartaoId) {
        const { cartaoDoUsuario, resolverFaturaDoCartao } = await Promise.resolve().then(() => __importStar(require("./fatura-pj.service")));
        const cartao = await cartaoDoUsuario(cartaoId, userId);
        const patch = {
            status: "Efetivada",
            data_pagamento: data,
            movimenta_caixa: false,
        };
        if (cartao && cartao.empresa_id === empresaId) {
            const dataTx = String(transacao.data_transacao).slice(0, 10);
            const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataTx);
            patch.fatura_id = fatura.id;
            patch.competencia = competencia;
            patch.metodo_pagamento = metodo;
        }
        const updated = await storage_1.storage.updateEmpresaTransacao(transacaoId, patch);
        return { ok: true, transacao: updated, anterior: transacao };
    }
    const updated = await storage_1.storage.updateEmpresaTransacao(transacaoId, {
        status: "Efetivada",
        data_pagamento: data,
        movimenta_caixa: true,
    });
    return { ok: true, transacao: updated, anterior: transacao };
}
/**
 * Reabre lançamento PJ: Efetivada → Pendente (some do realizado dos relatórios).
 * Cartão: mantém competência/fatura; limpa data_pagamento.
 * Conta/caixa: desliga movimenta_caixa até nova baixa.
 */
async function reabrirTransacaoEmpresa(empresaId, transacaoId, userId) {
    const empresa = await storage_1.storage.getEmpresaById(empresaId);
    if (!empresa)
        return { ok: false, status: 404, error: "Empresa não encontrada." };
    if (empresa.usuario_id !== userId)
        return { ok: false, status: 403, error: "Acesso negado." };
    const transacao = await storage_1.storage.getEmpresaTransacaoById(transacaoId);
    if (!transacao)
        return { ok: false, status: 404, error: "Transação não encontrada." };
    if (transacao.empresa_id !== empresaId) {
        return { ok: false, status: 403, error: "Transação não pertence a esta empresa." };
    }
    if (transacao.status !== "Efetivada") {
        return { ok: false, status: 400, error: "Só é possível reabrir lançamento efetivado." };
    }
    const patch = {
        status: "Pendente",
        data_pagamento: null,
        movimenta_caixa: false,
    };
    const updated = await storage_1.storage.updateEmpresaTransacao(transacaoId, patch);
    return { ok: true, transacao: updated, anterior: transacao };
}
