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
exports.deleteEmpresa = exports.updateEmpresa = exports.getEmpresa = exports.listEmpresas = exports.createEmpresa = void 0;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
/**
 * Controller: empresa
 * Gerencia o CRUD de empresas (PJ). Apenas o usuário dono pode acessar sua empresa.
 * O fluxo PF (transações, categorias, dashboard) não é tocado.
 */
// POST /api/empresas — cria empresa e já popula o plano de contas padrão
const createEmpresa = async (req, res) => {
    var _a;
    try {
        const userId = req.user.id;
        const parsed = schema_1.insertEmpresaSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
        }
        // Regra: um login = uma empresa (também em storage.createEmpresa).
        try {
            const empresa = await storage_1.storage.createEmpresa(Object.assign(Object.assign({}, parsed.data), { usuario_id: userId }));
            // Seed automático do plano de contas Yampa-like
            const contas = await storage_1.storage.seedEmpresasContas(empresa.id);
            const { garantirCaixinhaPj } = await Promise.resolve().then(() => __importStar(require("../services/meio-pagamento-pj")));
            await garantirCaixinhaPj(empresa.id, userId);
            return res.status(201).json({ empresa, contas_criadas: contas.length });
        }
        catch (errInner) {
            if ((errInner === null || errInner === void 0 ? void 0 : errInner.code) === "EMPRESA_UNICA" || (errInner === null || errInner === void 0 ? void 0 : errInner.status) === 409) {
                return res.status(409).json({ error: errInner.message || "Este usuário já possui uma empresa cadastrada." });
            }
            throw errInner;
        }
    }
    catch (err) {
        console.error("createEmpresa:", err);
        if (((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("duplicate")) || err.code === "23505") {
            return res.status(409).json({ error: "CNPJ já cadastrado." });
        }
        return res.status(500).json({ error: "Erro interno ao criar empresa." });
    }
};
exports.createEmpresa = createEmpresa;
// GET /api/empresas — lista todas as empresas do usuário logado
const listEmpresas = async (req, res) => {
    try {
        const userId = req.user.id;
        const empresas = await storage_1.storage.getEmpresasByUsuarioId(userId);
        return res.json(empresas);
    }
    catch (err) {
        console.error("listEmpresas:", err);
        return res.status(500).json({ error: "Erro interno ao listar empresas." });
    }
};
exports.listEmpresas = listEmpresas;
// GET /api/empresas/:id — retorna empresa por ID (somente do usuário logado)
const getEmpresa = async (req, res) => {
    try {
        const userId = req.user.id;
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await storage_1.storage.getEmpresaById(id);
        if (!empresa)
            return res.status(404).json({ error: "Empresa não encontrada." });
        if (empresa.usuario_id !== userId)
            return res.status(403).json({ error: "Acesso negado." });
        return res.json(empresa);
    }
    catch (err) {
        console.error("getEmpresa:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.getEmpresa = getEmpresa;
// PUT /api/empresas/:id — atualiza empresa (somente do usuário logado)
const updateEmpresa = async (req, res) => {
    var _a;
    try {
        const userId = req.user.id;
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await storage_1.storage.getEmpresaById(id);
        if (!empresa)
            return res.status(404).json({ error: "Empresa não encontrada." });
        if (empresa.usuario_id !== userId)
            return res.status(403).json({ error: "Acesso negado." });
        const parsed = schema_1.updateEmpresaSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
        }
        const updated = await storage_1.storage.updateEmpresa(id, parsed.data);
        return res.json(updated);
    }
    catch (err) {
        console.error("updateEmpresa:", err);
        if (((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes("duplicate")) || err.code === "23505") {
            return res.status(409).json({ error: "CNPJ já cadastrado." });
        }
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.updateEmpresa = updateEmpresa;
// DELETE /api/empresas/:id — remove empresa (somente do usuário logado)
const deleteEmpresa = async (req, res) => {
    try {
        const userId = req.user.id;
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido." });
        const empresa = await storage_1.storage.getEmpresaById(id);
        if (!empresa)
            return res.status(404).json({ error: "Empresa não encontrada." });
        if (empresa.usuario_id !== userId)
            return res.status(403).json({ error: "Acesso negado." });
        const deleted = await storage_1.storage.deleteEmpresa(id);
        if (!deleted)
            return res.status(400).json({ error: "Não foi possível remover a empresa." });
        return res.status(204).send();
    }
    catch (err) {
        console.error("deleteEmpresa:", err);
        return res.status(500).json({ error: "Erro interno." });
    }
};
exports.deleteEmpresa = deleteEmpresa;
