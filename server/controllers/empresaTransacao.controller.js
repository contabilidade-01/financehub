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
exports.listarVencimentosPj = exports.getEmpresaFluxoCaixa = exports.getEmpresaDRE = exports.getEmpresaResumo = exports.deleteEmpresaForma = exports.updateEmpresaForma = exports.createEmpresaForma = exports.listEmpresaFormas = exports.reabrirEmpresaTransacao = exports.pagarEmpresaTransacao = exports.deleteEmpresaTransacao = exports.updateEmpresaTransacao = exports.getEmpresaTransacao = exports.listEmpresaTransacoes = exports.createEmpresaTransacao = void 0;
const storage_1 = require("../storage");
const storage_2 = require("../storage");
const schema_1 = require("../../shared/schema");
const empresa_transacao_service_1 = require("../services/empresa-transacao.service");
const meio_pagamento_pj_1 = require("../services/meio-pagamento-pj");
const formas = __importStar(require("../services/empresa-forma.service"));
/**
 * Controller: empresaTransacao
 * CRUD de transações PJ + dashboard (resumo + DRE).
 * Endpoint N8N para PJ: POST /api/empresas/:id/transacoes (mesma apikey do usuário).
 */
// Helper: valida empresa e pertença ao usuário
const resolveEmpresa = async (empresaId, userId, res) => {
    const empresa = await storage_1.storage.getEmpresaById(empresaId);
    if (!empresa) {
        res.status(404).json({ error: "Empresa não encontrada." });
        return null;
    }
    if (empresa.usuario_id !== userId) {
        res.status(403).json({ error: "Acesso negado." });
        return null;
    }
    return empresa;
};
// Helper: parseia datas de query string com default = mês corrente
const parsePeriodo = (de, ate) => {
    const now = new Date();
    const deDate = de !== null && de !== void 0 ? de : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const ateDate = ate !== null && ate !== void 0 ? ate : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { de: deDate, ate: ateDate };
};
// POST /api/empresas/:id/transacoes
// Endpoint equivalente ao POST /api/transactions para PF.
// N8N usa este endpoint com o mesmo payload (campo categoria_id aponta para empresas_contas).
const createEmpresaTransacao = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const parsed = schema_1.insertEmpresaTransacaoSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
        }
        // Validar que a categoria_id pertence a esta empresa
        const conta = await storage_1.storage.getEmpresaContaById(parsed.data.categoria_id);
        if (!conta)
            return res.status(400).json({ error: "Categoria não encontrada." });
        if (conta.empresa_id !== empresaId) {
            return res.status(400).json({ error: "Categoria não pertence a esta empresa." });
        }
        // Validar que o tipo da transação bate com o tipo da conta
        const tipoNorm = parsed.data.tipo.charAt(0).toUpperCase() + parsed.data.tipo.slice(1).toLowerCase();
        if (tipoNorm !== conta.tipo) {
            return res.status(400).json({
                error: `Tipo '${tipoNorm}' incompatível com o tipo da conta '${conta.tipo}'.`
            });
        }
        const dataISO = String(parsed.data.data_transacao).slice(0, 10);
        const ehReembolso = !!parsed.data.reembolso_pessoal || !!((_a = req.body) === null || _a === void 0 ? void 0 : _a.reembolso_pessoal);
        const cartaoIdBody = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.cartao_id) != null
            ? Number(req.body.cartao_id)
            : (parsed.data.cartao_id != null ? Number(parsed.data.cartao_id) : null);
        const contaBancariaBody = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.conta_bancaria_id) != null
            ? Number(req.body.conta_bancaria_id)
            : (parsed.data.conta_bancaria_id != null ? Number(parsed.data.conta_bancaria_id) : null);
        // Reembolso a receber: fica Pendente, fora do caixa/Transações até marcar recebido.
        // Meio só é obrigatório se o usuário informou conta/cartão no form.
        let meio;
        try {
            meio = await (0, meio_pagamento_pj_1.aplicarMeioPagamentoPj)({
                userId,
                empresaId,
                tipo: tipoNorm,
                dataISO,
                cartao_id: cartaoIdBody,
                conta_bancaria_id: contaBancariaBody,
                exigirMeio: ehReembolso ? !!(cartaoIdBody || contaBancariaBody) : true,
                statusAtual: ehReembolso ? "Pendente" : parsed.data.status,
            });
        }
        catch (meioErr) {
            return res.status(400).json({ error: (meioErr === null || meioErr === void 0 ? void 0 : meioErr.message) || "Meio de pagamento inválido." });
        }
        const parcelasN = Math.min(60, Math.max(1, Number((_d = req.body) === null || _d === void 0 ? void 0 : _d.parcelas) || 1));
        if (parcelasN > 1 && tipoNorm === "Despesa" && !ehReembolso) {
            const { criarCompraParceladaPj } = await Promise.resolve().then(() => __importStar(require("../storage")));
            // Aceita valor total OU valor da parcela (ex.: 5x de 35 → valor_parcela=35).
            const valorInformado = Number(parsed.data.valor) || 0;
            const valorParcelaBody = ((_e = req.body) === null || _e === void 0 ? void 0 : _e.valor_parcela) != null && req.body.valor_parcela !== ""
                ? Number(req.body.valor_parcela)
                : null;
            const modo = String(((_f = req.body) === null || _f === void 0 ? void 0 : _f.valor_modo) || "").toLowerCase();
            let valorTotal = valorInformado;
            if ((modo === "parcela" || (valorParcelaBody != null && Number.isFinite(valorParcelaBody) && valorParcelaBody > 0))) {
                const vp = valorParcelaBody != null && valorParcelaBody > 0 ? valorParcelaBody : valorInformado;
                valorTotal = Math.round(vp * parcelasN * 100) / 100;
            }
            else if (((_g = req.body) === null || _g === void 0 ? void 0 : _g.valor_total) != null && Number(req.body.valor_total) > 0) {
                valorTotal = Number(req.body.valor_total);
            }
            if (!(valorTotal > 0)) {
                return res.status(400).json({ error: "Informe o valor total ou o valor da parcela." });
            }
            if (!meio.cartao_id) {
                return res.status(400).json({
                    error: "Parcelamento em várias competências é para cartão de crédito. Escolha o cartão.",
                });
            }
            try {
                const result = await criarCompraParceladaPj({
                    empresaId,
                    userId,
                    categoriaId: parsed.data.categoria_id,
                    descricao: parsed.data.descricao,
                    valorTotal,
                    parcelas: parcelasN,
                    dataInicio: dataISO,
                    cartaoId: meio.cartao_id,
                    contaBancariaId: null,
                    status: "Efetivada",
                    origem: (_h = req.body.origem) !== null && _h !== void 0 ? _h : "manual",
                    dataVencimentoBase: parsed.data.data_vencimento
                        ? String(parsed.data.data_vencimento).slice(0, 10)
                        : null,
                    competenciaInicial: typeof ((_j = req.body) === null || _j === void 0 ? void 0 : _j.competencia_inicial) === "string"
                        ? req.body.competencia_inicial
                        : null,
                });
                const first = await storage_1.storage.getEmpresaTransacaoById(result.ids[0]);
                return res.status(201).json(Object.assign(Object.assign({}, first), { compra_grupo: result.compra_grupo, parcelas_criadas: result.ids.length, valor_parcela: result.valor_parcela, valor_total: valorTotal }));
            }
            catch (parcErr) {
                return res.status(400).json({ error: (parcErr === null || parcErr === void 0 ? void 0 : parcErr.message) || "Erro ao parcelar." });
            }
        }
        const transacao = await storage_1.storage.createEmpresaTransacao(Object.assign(Object.assign({}, parsed.data), { empresa_id: empresaId, tipo: tipoNorm, reembolso_pessoal: ehReembolso, status: ehReembolso ? "Pendente" : (parsed.data.status || "Efetivada"), cartao_id: meio.cartao_id, conta_bancaria_id: meio.conta_bancaria_id, fatura_id: meio.fatura_id, competencia: meio.competencia, movimenta_caixa: ehReembolso ? false : meio.movimenta_caixa, empresa_forma_pagamento_id: meio.empresa_forma_pagamento_id, metodo_pagamento: (_l = (_k = meio.metodo_pagamento) !== null && _k !== void 0 ? _k : parsed.data.metodo_pagamento) !== null && _l !== void 0 ? _l : null, origem: (_m = req.body.origem) !== null && _m !== void 0 ? _m : "manual" }));
        return res.status(201).json(transacao);
    }
    catch (err) {
        console.error("createEmpresaTransacao:", err);
        return res.status(500).json({ error: "Erro interno ao criar transação." });
    }
};
exports.createEmpresaTransacao = createEmpresaTransacao;
// GET /api/empresas/:id/transacoes
const listEmpresaTransacoes = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const todos = req.query.todos === "1" || req.query.todos === "true";
        const { de, ate } = parsePeriodo(req.query.de, req.query.ate);
        const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
        const transacoes = await storage_1.storage.getEmpresaTransacoesByEmpresaId(empresaId, todos ? { limit } : { de, ate, limit });
        return res.json(transacoes);
    }
    catch (err) {
        console.error("listEmpresaTransacoes:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.listEmpresaTransacoes = listEmpresaTransacoes;
// GET /api/empresas/:id/transacoes/:transacaoId
const getEmpresaTransacao = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const transacaoId = parseInt(req.params.transacaoId);
        if (isNaN(empresaId) || isNaN(transacaoId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const transacao = await storage_1.storage.getEmpresaTransacaoById(transacaoId);
        if (!transacao)
            return res.status(404).json({ error: "Transação não encontrada." });
        if (transacao.empresa_id !== empresaId)
            return res.status(403).json({ error: "Transação não pertence a esta empresa." });
        return res.json(transacao);
    }
    catch (err) {
        console.error("getEmpresaTransacao:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.getEmpresaTransacao = getEmpresaTransacao;
// PUT /api/empresas/:id/transacoes/:transacaoId
const updateEmpresaTransacao = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const transacaoId = parseInt(req.params.transacaoId);
        if (isNaN(empresaId) || isNaN(transacaoId))
            return res.status(400).json({ error: "ID inválido." });
        // Posse e validações ficam no serviço, compartilhado com a tool do agente.
        const resultado = await (0, empresa_transacao_service_1.atualizarTransacaoEmpresa)(empresaId, transacaoId, userId, req.body);
        if (!resultado.ok) {
            return res.status(resultado.status).json({ error: resultado.error, details: resultado.details });
        }
        return res.json(resultado.transacao);
    }
    catch (err) {
        console.error("updateEmpresaTransacao:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.updateEmpresaTransacao = updateEmpresaTransacao;
// DELETE /api/empresas/:id/transacoes/:transacaoId
const deleteEmpresaTransacao = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const transacaoId = parseInt(req.params.transacaoId);
        if (isNaN(empresaId) || isNaN(transacaoId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const transacao = await storage_1.storage.getEmpresaTransacaoById(transacaoId);
        if (!transacao)
            return res.status(404).json({ error: "Transação não encontrada." });
        if (transacao.empresa_id !== empresaId)
            return res.status(403).json({ error: "Transação não pertence a esta empresa." });
        // Soft-delete: move para lixeira
        const deletado = await (0, storage_2.softDeleteEmpresaTransacao)(transacaoId, empresaId, userId);
        if (!deletado)
            return res.status(500).json({ error: "Erro ao deletar transação." });
        return res.status(200).json({
            message: "Transação movida para a lixeira",
            recuperavel: true,
            dias: 30,
        });
    }
    catch (err) {
        console.error("deleteEmpresaTransacao:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.deleteEmpresaTransacao = deleteEmpresaTransacao;
// PUT /api/empresas/:id/transacoes/:transacaoId/pagar
const pagarEmpresaTransacao = async (req, res) => {
    var _a;
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const transacaoId = parseInt(req.params.transacaoId);
        if (isNaN(empresaId) || isNaN(transacaoId))
            return res.status(400).json({ error: "ID inválido." });
        const resultado = await (0, empresa_transacao_service_1.baixarTransacaoEmpresa)(empresaId, transacaoId, userId, (_a = req.body) === null || _a === void 0 ? void 0 : _a.data_pagamento);
        if (!resultado.ok) {
            return res.status(resultado.status).json({ error: resultado.error });
        }
        return res.json(resultado.transacao);
    }
    catch (err) {
        console.error("pagarEmpresaTransacao:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.pagarEmpresaTransacao = pagarEmpresaTransacao;
// PUT /api/empresas/:id/transacoes/:transacaoId/reabrir
const reabrirEmpresaTransacao = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const transacaoId = parseInt(req.params.transacaoId);
        if (isNaN(empresaId) || isNaN(transacaoId))
            return res.status(400).json({ error: "ID inválido." });
        const resultado = await (0, empresa_transacao_service_1.reabrirTransacaoEmpresa)(empresaId, transacaoId, userId);
        if (!resultado.ok) {
            return res.status(resultado.status).json({ error: resultado.error });
        }
        return res.json(resultado.transacao);
    }
    catch (err) {
        console.error("reabrirEmpresaTransacao:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.reabrirEmpresaTransacao = reabrirEmpresaTransacao;
// ----- Formas de pagamento PJ -----
const listEmpresaFormas = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const lista = await formas.listarFormas(empresaId);
        return res.json(lista.filter((f) => f.ativo !== false));
    }
    catch (err) {
        console.error("listEmpresaFormas:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.listEmpresaFormas = listEmpresaFormas;
const createEmpresaForma = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        return res.status(400).json({
            error: "Forma solta não é mais meio de pagamento. Cadastre Conta bancária, use a Caixinha ou um Cartão em Cartões e Faturas.",
        });
    }
    catch (err) {
        console.error("createEmpresaForma:", err);
        return res.status((err === null || err === void 0 ? void 0 : err.status) || 500).json({ error: (err === null || err === void 0 ? void 0 : err.message) || "Erro interno." });
    }
};
exports.createEmpresaForma = createEmpresaForma;
const updateEmpresaForma = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const formaId = parseInt(req.params.formaId);
        if (isNaN(empresaId) || isNaN(formaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const atualizada = await formas.atualizarForma(empresaId, formaId, req.body || {});
        if (!atualizada)
            return res.status(404).json({ error: "Forma não encontrada." });
        return res.json(atualizada);
    }
    catch (err) {
        console.error("updateEmpresaForma:", err);
        return res.status((err === null || err === void 0 ? void 0 : err.status) || 500).json({ error: (err === null || err === void 0 ? void 0 : err.message) || "Erro interno." });
    }
};
exports.updateEmpresaForma = updateEmpresaForma;
const deleteEmpresaForma = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const formaId = parseInt(req.params.formaId);
        if (isNaN(empresaId) || isNaN(formaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const ok = await formas.excluirForma(empresaId, formaId);
        if (!ok)
            return res.status(404).json({ error: "Forma não encontrada." });
        return res.status(204).send();
    }
    catch (err) {
        console.error("deleteEmpresaForma:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.deleteEmpresaForma = deleteEmpresaForma;
// GET /api/empresas/:id/dashboard/resumo?de=YYYY-MM-DD&ate=YYYY-MM-DD
const getEmpresaResumo = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const { de, ate } = parsePeriodo(req.query.de, req.query.ate);
        const resumo = await storage_1.storage.getEmpresaResumo(empresaId, { de, ate });
        return res.json(resumo);
    }
    catch (err) {
        console.error("getEmpresaResumo:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.getEmpresaResumo = getEmpresaResumo;
// GET /api/empresas/:id/relatorios/dre?de=YYYY-MM-DD&ate=YYYY-MM-DD
const getEmpresaDRE = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const { de, ate } = parsePeriodo(req.query.de, req.query.ate);
        const dre = await storage_1.storage.getEmpresaDRE(empresaId, { de, ate });
        return res.json(dre);
    }
    catch (err) {
        console.error("getEmpresaDRE:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.getEmpresaDRE = getEmpresaDRE;
// GET /api/empresas/:id/relatorios/fluxo-caixa?ano=YYYY
const getEmpresaFluxoCaixa = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const ano = parseInt(req.query.ano) || new Date().getFullYear();
        const data = await storage_1.storage.getEmpresaFluxoCaixaMensal(empresaId, ano);
        return res.json(data);
    }
    catch (err) {
        console.error("getEmpresaFluxoCaixa:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.getEmpresaFluxoCaixa = getEmpresaFluxoCaixa;
// GET /api/empresas/:id/vencimentos?status=aberta|paga&de=&ate=
// Faturas de cartão + despesas Pendentes (boleto/PIX/TED) do período.
const listarVencimentosPj = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const { db } = await Promise.resolve().then(() => __importStar(require("../db")));
        const { sql } = await Promise.resolve().then(() => __importStar(require("drizzle-orm")));
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        const status = req.query.status || "aberta";
        let statusFilter = sql `f.status IN ('aberta', 'fechada')`;
        if (status === "paga")
            statusFilter = sql `f.status = 'paga'`;
        else if (status === "todas")
            statusFilter = sql `true`;
        const faturas = await db.execute(sql `
      SELECT f.*, c.nome AS cartao_nome, c.bandeira AS cartao_cor,
             COALESCE((
               SELECT SUM(t.valor::numeric) FROM empresas_transacoes t
               WHERE t.fatura_id = f.id AND COALESCE(t.movimenta_caixa, false) = false
             ), 0) AS total
      FROM empresas_faturas f
      JOIN empresas_cartoes c ON c.id = f.cartao_id
      WHERE f.empresa_id = ${empresaId}
        AND ${statusFilter}
        ${de ? sql `AND f.data_vencimento >= ${de}` : sql ``}
        ${ate ? sql `AND f.data_vencimento <= ${ate}` : sql ``}
      ORDER BY f.data_vencimento ASC
    `);
        const st = status === "paga" ? "Efetivada" : "Pendente";
        const boletos = await db.execute(sql `
      SELECT t.id, t.descricao, t.valor, t.data_vencimento, t.data_transacao, t.status, t.tipo,
             t.fatura_id, t.movimenta_caixa, t.metodo_pagamento AS forma_pagamento,
             t.parcela_num, t.parcela_total, t.conta_bancaria_id,
             ec.nome AS categoria, ec.codigo AS categoria_codigo
      FROM empresas_transacoes t
      LEFT JOIN empresas_contas ec ON ec.id = t.categoria_id
      WHERE t.empresa_id = ${empresaId}
        AND t.status = ${st}
        AND t.tipo = 'Despesa'
        AND COALESCE(t.reembolso_pessoal, false) = false
        AND t.fatura_id IS NULL
        AND COALESCE(t.movimenta_caixa, true) = true
        AND (t.data_vencimento IS NOT NULL OR t.data_transacao IS NOT NULL)
        ${de ? sql `AND COALESCE(t.data_vencimento, t.data_transacao) >= ${de}` : sql ``}
        ${ate ? sql `AND COALESCE(t.data_vencimento, t.data_transacao) <= ${ate}` : sql ``}
      ORDER BY COALESCE(t.data_vencimento, t.data_transacao) ASC
    `);
        return res.json({ faturas, boletos });
    }
    catch (err) {
        console.error("listarVencimentosPj:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.listarVencimentosPj = listarVencimentosPj;
