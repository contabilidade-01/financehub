"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarFlags = listarFlags;
exports.criar = criar;
exports.liberarTodos = liberarTodos;
exports.desligarTodos = desligarTodos;
exports.ligarUser = ligarUser;
exports.desligarUser = desligarUser;
exports.minhasFlags = minhasFlags;
exports.buscarUsuarios = buscarUsuarios;
exports.aposentar = aposentar;
const feature_flags_service_1 = require("../services/feature-flags.service");
const storage_1 = require("../storage");
async function listarFlags(req, res) {
    var _a, _b;
    try {
        const flags = await (0, feature_flags_service_1.listarFlagsAdmin)();
        // Enriquecer com nomes/emails dos usuários (busca leve).
        const allIds = [...new Set(flags.flatMap((f) => f.usuarios))];
        const mapa = {};
        for (const id of allIds) {
            try {
                const u = await storage_1.storage.getUserById(id);
                if (u)
                    mapa[id] = { id: u.id, nome: (_a = u.nome) !== null && _a !== void 0 ? _a : null, email: (_b = u.email) !== null && _b !== void 0 ? _b : null };
            }
            catch (_c) {
                mapa[id] = { id, nome: null, email: null };
            }
        }
        return res.json({
            flags: flags.map((f) => (Object.assign(Object.assign({}, f), { usuarios_detalhe: f.usuarios.map((id) => mapa[id] || { id, nome: null, email: null }) }))),
        });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar flags" });
    }
}
async function criar(req, res) {
    var _a, _b;
    try {
        const chave = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.chave) || "");
        const descricao = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.descricao) != null ? String(req.body.descricao) : undefined;
        await (0, feature_flags_service_1.criarFlag)(chave, descricao);
        return res.json({ success: true, chave });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao criar flag" });
    }
}
async function liberarTodos(req, res) {
    try {
        const chave = String(req.params.chave || "");
        await (0, feature_flags_service_1.setAtivoTodos)(chave, true);
        (0, feature_flags_service_1.invalidarCacheFlags)(chave);
        return res.json({ success: true, chave, ativo_todos: true });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro" });
    }
}
async function desligarTodos(req, res) {
    try {
        const chave = String(req.params.chave || "");
        await (0, feature_flags_service_1.setAtivoTodos)(chave, false);
        (0, feature_flags_service_1.invalidarCacheFlags)(chave);
        return res.json({ success: true, chave, ativo_todos: false });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro" });
    }
}
async function ligarUser(req, res) {
    var _a;
    try {
        const chave = String(req.params.chave || "");
        const usuarioId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.usuario_id);
        if (!Number.isFinite(usuarioId)) {
            return res.status(400).json({ error: "Informe usuario_id" });
        }
        await (0, feature_flags_service_1.ligarUsuario)(chave, usuarioId);
        return res.json({ success: true, chave, usuario_id: usuarioId });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro" });
    }
}
async function desligarUser(req, res) {
    var _a, _b;
    try {
        const chave = String(req.params.chave || "");
        const usuarioId = Number((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.usuario_id) !== null && _b !== void 0 ? _b : req.params.usuarioId);
        if (!Number.isFinite(usuarioId)) {
            return res.status(400).json({ error: "Informe usuario_id" });
        }
        await (0, feature_flags_service_1.desligarUsuario)(chave, usuarioId);
        return res.json({ success: true, chave, usuario_id: usuarioId });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro" });
    }
}
/** Flags do usuário autenticado (app). */
async function minhasFlags(req, res) {
    var _a;
    try {
        const uid = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!uid)
            return res.status(401).json({ error: "Não autenticado" });
        const flags = await (0, feature_flags_service_1.flagsDoUsuario)(uid);
        return res.json({ flags });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro" });
    }
}
/** Busca usuários para ligar flag (nome/email). */
async function buscarUsuarios(req, res) {
    try {
        const q = String(req.query.q || "").trim();
        if (q.length < 2)
            return res.json({ usuarios: [] });
        const all = await storage_1.storage.getAllUsers();
        const n = q.toLowerCase();
        const usuarios = all
            .filter((u) => String(u.nome || "").toLowerCase().includes(n) ||
            String(u.email || "").toLowerCase().includes(n) ||
            String(u.telefone || "").includes(n) ||
            String(u.id) === q)
            .slice(0, 20)
            .map((u) => ({ id: u.id, nome: u.nome, email: u.email, telefone: u.telefone }));
        return res.json({ usuarios });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro na busca" });
    }
}
/** Aposenta a linha no banco (só depois de limpar o if no código). */
async function aposentar(req, res) {
    try {
        const chave = String(req.params.chave || "");
        await (0, feature_flags_service_1.aposentarFlag)(chave);
        return res.json({
            success: true,
            chave,
            mensagem: "Linha removida. Se o if (flagAtiva) ainda existir no código, a flag passa a valer false para todos.",
        });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao aposentar" });
    }
}
