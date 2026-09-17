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
exports.ReembolsosPjController = exports.ImportLancamentosPjController = void 0;
const storage_1 = require("../storage");
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const import_lancamentos_pj_service_1 = require("../services/import-lancamentos-pj.service");
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
exports.ImportLancamentosPjController = {
    async preview(req, res) {
        try {
            const empresaId = parseInt(req.params.id);
            if (isNaN(empresaId))
                return res.status(400).json({ error: "ID inválido." });
            const empresa = await resolveEmpresa(empresaId, req.user.id, res);
            if (!empresa)
                return;
            const file = req.file;
            if (!(file === null || file === void 0 ? void 0 : file.buffer))
                return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });
            const parsed = (0, import_lancamentos_pj_service_1.parseLancamentosPj)(file.buffer);
            if (parsed.linhas.length === 0 && parsed.erros.length === 0) {
                return res.status(400).json({ error: "Não encontrei lançamentos na planilha. Use Data, Descrição, Categoria, Forma, Valor." });
            }
            return res.json(await (0, import_lancamentos_pj_service_1.montarPreviewPj)(empresaId, parsed));
        }
        catch (err) {
            console.error("[ImportPj] preview:", err === null || err === void 0 ? void 0 : err.message);
            return res.status(500).json({ error: "Falha ao ler a planilha: " + ((err === null || err === void 0 ? void 0 : err.message) || "erro interno") });
        }
    },
    async importar(req, res) {
        try {
            const empresaId = parseInt(req.params.id);
            if (isNaN(empresaId))
                return res.status(400).json({ error: "ID inválido." });
            const empresa = await resolveEmpresa(empresaId, req.user.id, res);
            if (!empresa)
                return;
            const file = req.file;
            if (!(file === null || file === void 0 ? void 0 : file.buffer))
                return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });
            const parsed = (0, import_lancamentos_pj_service_1.parseLancamentosPj)(file.buffer);
            if (parsed.linhas.length === 0) {
                return res.status(400).json({ error: "Nenhum lançamento válido para importar.", erros: parsed.erros });
            }
            return res.json(await (0, import_lancamentos_pj_service_1.commitImportPj)(empresaId, parsed));
        }
        catch (err) {
            console.error("[ImportPj] importar:", err === null || err === void 0 ? void 0 : err.message);
            return res.status(500).json({ error: "Falha ao importar: " + ((err === null || err === void 0 ? void 0 : err.message) || "erro interno") });
        }
    },
};
const dataISO = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
exports.ReembolsosPjController = {
    // GET /api/empresas/:id/reembolsos-pessoais?de=YYYY-MM-DD&ate=YYYY-MM-DD&status=Pendente
    async listar(req, res) {
        try {
            const empresaId = parseInt(req.params.id);
            if (isNaN(empresaId))
                return res.status(400).json({ error: "ID inválido." });
            const empresa = await resolveEmpresa(empresaId, req.user.id, res);
            if (!empresa)
                return;
            // A receber: data de referência = vencimento (previsão) ou lançamento.
            const ref = (0, drizzle_orm_1.sql) `COALESCE(t.data_vencimento, t.data_transacao)`;
            const de = dataISO(req.query.de);
            const ate = dataISO(req.query.ate);
            const status = typeof req.query.status === "string" ? req.query.status : "";
            const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT t.id, t.descricao, t.valor, t.data_transacao, t.data_vencimento, t.status, t.tipo,
               t.itens_agrupados, t.metodo_pagamento, c.nome AS categoria, c.codigo AS categoria_codigo
        FROM empresas_transacoes t
        JOIN empresas_contas c ON c.id = t.categoria_id
        WHERE t.empresa_id = ${empresaId}
          AND t.reembolso_pessoal = true
          ${de ? (0, drizzle_orm_1.sql) `AND ${ref} >= ${de}` : (0, drizzle_orm_1.sql) ``}
          ${ate ? (0, drizzle_orm_1.sql) `AND ${ref} <= ${ate}` : (0, drizzle_orm_1.sql) ``}
          ${status ? (0, drizzle_orm_1.sql) `AND t.status = ${status}` : (0, drizzle_orm_1.sql) ``}
        ORDER BY ${ref} DESC, t.id DESC
      `);
            return res.json(rows);
        }
        catch (err) {
            console.error("[ReembolsosPj] listar:", err);
            return res.status(500).json({ error: "Erro interno." });
        }
    },
    /** Marca recebido → vira Receita efetivada e passa a entrar em Transações/relatórios. */
    async receber(req, res) {
        try {
            const empresaId = parseInt(req.params.id);
            const transacaoId = parseInt(req.params.transacaoId);
            if (isNaN(empresaId) || isNaN(transacaoId))
                return res.status(400).json({ error: "ID inválido." });
            const empresa = await resolveEmpresa(empresaId, req.user.id, res);
            if (!empresa)
                return;
            const atual = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT id, tipo, categoria_id, conta_bancaria_id, cartao_id
        FROM empresas_transacoes
        WHERE id = ${transacaoId} AND empresa_id = ${empresaId} AND reembolso_pessoal = true
        LIMIT 1
      `);
            const row = atual[0];
            if (!row)
                return res.status(404).json({ error: "Reembolso não encontrado." });
            let categoriaId = Number(row.categoria_id);
            const catAtual = await storage_1.storage.getEmpresaContaById(categoriaId);
            if (!catAtual || catAtual.tipo !== "Receita") {
                const contas = await storage_1.storage.getEmpresasContasByEmpresaId(empresaId);
                const receita = contas.find((c) => c.codigo === "1.03") ||
                    contas.find((c) => c.tipo === "Receita" && /outras/i.test(String(c.nome || ""))) ||
                    contas.find((c) => c.tipo === "Receita");
                if (!receita) {
                    return res.status(400).json({
                        error: "Cadastre uma conta de Receita no plano de contas para receber o reembolso.",
                    });
                }
                categoriaId = receita.id;
            }
            let contaBancariaId = row.conta_bancaria_id != null ? Number(row.conta_bancaria_id) : null;
            if (!contaBancariaId) {
                const { garantirCaixinhaPj } = await Promise.resolve().then(() => __importStar(require("../services/meio-pagamento-pj")));
                const caixa = await garantirCaixinhaPj(empresaId, req.user.id);
                contaBancariaId = caixa.id;
            }
            const upd = await db_1.db.execute((0, drizzle_orm_1.sql) `
        UPDATE empresas_transacoes
        SET status = 'Efetivada',
            tipo = 'Receita',
            categoria_id = ${categoriaId},
            movimenta_caixa = true,
            cartao_id = NULL,
            fatura_id = NULL,
            competencia = NULL,
            conta_bancaria_id = ${contaBancariaId},
            data_pagamento = CURRENT_DATE
        WHERE id = ${transacaoId} AND empresa_id = ${empresaId} AND reembolso_pessoal = true
        RETURNING id, status, tipo, categoria_id, conta_bancaria_id
      `);
            if (!upd[0])
                return res.status(404).json({ error: "Reembolso não encontrado." });
            return res.json(upd[0]);
        }
        catch (err) {
            console.error("[ReembolsosPj] receber:", err);
            return res.status(500).json({ error: "Erro interno." });
        }
    },
    /** Alias legado — mesmo comportamento de receber. */
    async pagar(req, res) {
        return exports.ReembolsosPjController.receber(req, res);
    },
};
