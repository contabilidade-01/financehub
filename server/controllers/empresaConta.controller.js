"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmpresaConta = exports.updateEmpresaConta = exports.createEmpresaConta = exports.listEmpresasContas = void 0;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
/**
 * Controller: empresaConta
 * CRUD do plano de contas PJ (empresas_contas) por empresa.
 * Verifica que a empresa pertence ao usuário logado antes de qualquer operação.
 */
// Helpers
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
// GET /api/empresas/:id/contas
const listEmpresasContas = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const contas = await storage_1.storage.getEmpresasContasByEmpresaId(empresaId);
        return res.json(contas);
    }
    catch (err) {
        console.error("listEmpresasContas:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.listEmpresasContas = listEmpresasContas;
// POST /api/empresas/:id/contas
const createEmpresaConta = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        if (isNaN(empresaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const parsed = schema_1.insertEmpresaContaSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
        }
        const conta = await storage_1.storage.createEmpresaConta(Object.assign(Object.assign({}, parsed.data), { empresa_id: empresaId }));
        return res.status(201).json(conta);
    }
    catch (err) {
        console.error("createEmpresaConta:", err);
        if (err.code === "23505")
            return res.status(409).json({ error: "Código já existe nesta empresa." });
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.createEmpresaConta = createEmpresaConta;
// PUT /api/empresas/:id/contas/:contaId
const updateEmpresaConta = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const contaId = parseInt(req.params.contaId);
        if (isNaN(empresaId) || isNaN(contaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const conta = await storage_1.storage.getEmpresaContaById(contaId);
        if (!conta)
            return res.status(404).json({ error: "Conta não encontrada." });
        if (conta.empresa_id !== empresaId)
            return res.status(403).json({ error: "Conta não pertence a esta empresa." });
        const parsed = schema_1.updateEmpresaContaSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
        }
        const updated = await storage_1.storage.updateEmpresaConta(contaId, parsed.data);
        return res.json(updated);
    }
    catch (err) {
        console.error("updateEmpresaConta:", err);
        if (err.code === "23505")
            return res.status(409).json({ error: "Código já existe nesta empresa." });
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.updateEmpresaConta = updateEmpresaConta;
// DELETE /api/empresas/:id/contas/:contaId
const deleteEmpresaConta = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = parseInt(req.params.id);
        const contaId = parseInt(req.params.contaId);
        if (isNaN(empresaId) || isNaN(contaId))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await resolveEmpresa(empresaId, userId, res);
        if (!empresa)
            return;
        const conta = await storage_1.storage.getEmpresaContaById(contaId);
        if (!conta)
            return res.status(404).json({ error: "Conta não encontrada." });
        if (conta.empresa_id !== empresaId)
            return res.status(403).json({ error: "Conta não pertence a esta empresa." });
        const deleted = await storage_1.storage.deleteEmpresaConta(contaId);
        if (!deleted) {
            return res.status(400).json({ error: "Não é possível excluir conta com transações vinculadas." });
        }
        return res.status(204).send();
    }
    catch (err) {
        console.error("deleteEmpresaConta:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.deleteEmpresaConta = deleteEmpresaConta;
