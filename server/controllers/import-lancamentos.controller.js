"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportLancamentosController = void 0;
const storage_1 = require("../storage");
const import_lancamentos_service_1 = require("../services/import-lancamentos.service");
/**
 * Importação de lançamentos PF (contas a pagar) a partir de planilha.
 * preview = dry-run (não grava); importar = grava com dedup.
 */
exports.ImportLancamentosController = {
    // POST /api/importacao/lancamentos/preview  (multipart: arquivo)
    async preview(req, res) {
        try {
            const userId = req.user.id;
            const file = req.file;
            if (!(file === null || file === void 0 ? void 0 : file.buffer))
                return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });
            const wallet = await storage_1.storage.getWalletByUserId(userId);
            if (!wallet)
                return res.status(400).json({ error: "Carteira não encontrada para este usuário." });
            const parsed = (0, import_lancamentos_service_1.parseLancamentos)(file.buffer);
            if (parsed.linhas.length === 0 && parsed.erros.length === 0) {
                return res.status(400).json({ error: "Não encontrei lançamentos na planilha. Confira o formato." });
            }
            const previewData = await (0, import_lancamentos_service_1.montarPreview)(userId, wallet.id, parsed);
            return res.json(previewData);
        }
        catch (err) {
            console.error("[ImportLancamentos] preview:", err === null || err === void 0 ? void 0 : err.message);
            return res.status(500).json({ error: "Falha ao ler a planilha: " + ((err === null || err === void 0 ? void 0 : err.message) || "erro interno") });
        }
    },
    // POST /api/importacao/lancamentos  (multipart: arquivo)
    async importar(req, res) {
        try {
            const userId = req.user.id;
            const file = req.file;
            if (!(file === null || file === void 0 ? void 0 : file.buffer))
                return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });
            const wallet = await storage_1.storage.getWalletByUserId(userId);
            if (!wallet)
                return res.status(400).json({ error: "Carteira não encontrada para este usuário." });
            const parsed = (0, import_lancamentos_service_1.parseLancamentos)(file.buffer);
            if (parsed.linhas.length === 0) {
                return res.status(400).json({ error: "Nenhum lançamento válido para importar.", erros: parsed.erros });
            }
            const result = await (0, import_lancamentos_service_1.commitImport)(userId, wallet.id, parsed);
            return res.json(result);
        }
        catch (err) {
            console.error("[ImportLancamentos] importar:", err === null || err === void 0 ? void 0 : err.message);
            return res.status(500).json({ error: "Falha ao importar: " + ((err === null || err === void 0 ? void 0 : err.message) || "erro interno") });
        }
    },
};
