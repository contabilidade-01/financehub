"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listar = listar;
exports.gerarAgora = gerarAgora;
exports.baixar = baixar;
const backup_service_1 = require("../services/backup.service");
async function listar(_req, res) {
    try {
        const backups = await (0, backup_service_1.listarBackups)();
        res.json({
            success: true,
            backups,
            politica: {
                horarios: backup_service_1.HORARIOS,
                fuso: "America/Sao_Paulo",
                maximo: backup_service_1.MAX_BACKUPS,
                slot_atual: (0, backup_service_1.slotAtual)(),
            },
        });
    }
    catch (e) {
        res.status(500).json({ success: false, message: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar backups" });
    }
}
async function gerarAgora(_req, res) {
    try {
        const r = await (0, backup_service_1.criarBackup)("manual");
        if (!r.ok)
            return res.status(500).json({ success: false, message: r.erro });
        res.json({
            success: true,
            id: r.id,
            tamanho_bytes: r.tamanho,
            linhas: r.linhas,
            message: "Backup gerado.",
        });
    }
    catch (e) {
        res.status(500).json({ success: false, message: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao gerar backup" });
    }
}
async function baixar(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Id inválido." });
        }
        const arquivo = await (0, backup_service_1.obterBackup)(id);
        if (!arquivo) {
            return res.status(404).json({ success: false, message: "Backup não encontrado ou sem conteúdo." });
        }
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Disposition", `attachment; filename="${arquivo.nome}"`);
        res.setHeader("Content-Length", String(arquivo.conteudo.length));
        res.end(arquivo.conteudo);
    }
    catch (e) {
        res.status(500).json({ success: false, message: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao baixar backup" });
    }
}
