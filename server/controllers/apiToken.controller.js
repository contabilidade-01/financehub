"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiTokens = getApiTokens;
exports.getApiToken = getApiToken;
exports.createApiToken = createApiToken;
exports.updateApiToken = updateApiToken;
exports.deleteApiToken = deleteApiToken;
exports.rotateApiToken = rotateApiToken;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
/**
 * Obter todos os tokens de API do usuário atual
 */
async function getApiTokens(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const tokens = await storage_1.storage.getApiTokensByUserId(req.user.id);
        // Não retorna o token completo, apenas uma versão parcial para exibição
        const safeTokens = tokens.map(token => (Object.assign(Object.assign({}, token), { token: token.token.substring(0, 10) + "..." + token.token.substring(token.token.length - 4) })));
        return res.json(safeTokens);
    }
    catch (error) {
        console.error("Error getting API tokens:", error);
        return res.status(500).json({ error: "Erro ao obter tokens de API" });
    }
}
/**
 * Obter um token específico de API
 */
async function getApiToken(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const token = await storage_1.storage.getApiTokenById(id);
        if (!token) {
            return res.status(404).json({ error: "Token não encontrado" });
        }
        // Verificar se o token pertence ao usuário atual
        if (token.usuario_id !== req.user.id) {
            return res.status(403).json({ error: "Acesso negado" });
        }
        // Não retorna o token completo por segurança
        const safeToken = Object.assign(Object.assign({}, token), { token: token.token.substring(0, 10) + "..." + token.token.substring(token.token.length - 4) });
        return res.json(safeToken);
    }
    catch (error) {
        console.error("Error getting API token:", error);
        return res.status(500).json({ error: "Erro ao obter token de API" });
    }
}
/**
 * Criar um novo token de API
 */
async function createApiToken(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        // Validar dados de entrada
        const validationResult = schema_1.insertApiTokenSchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({
                error: "Dados inválidos",
                details: validationResult.error.errors
            });
        }
        // Criar o token
        const token = await storage_1.storage.createApiToken(req.user.id, validationResult.data);
        // Na criação, retornamos o token completo uma única vez
        return res.status(201).json(token);
    }
    catch (error) {
        console.error("Error creating API token:", error);
        return res.status(500).json({ error: "Erro ao criar token de API" });
    }
}
/**
 * Atualizar um token de API existente
 */
async function updateApiToken(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        // Verificar se o token existe
        const token = await storage_1.storage.getApiTokenById(id);
        if (!token) {
            return res.status(404).json({ error: "Token não encontrado" });
        }
        // Verificar se o token pertence ao usuário atual
        if (token.usuario_id !== req.user.id) {
            return res.status(403).json({ error: "Acesso negado" });
        }
        // Validar dados de entrada
        const validationResult = schema_1.updateApiTokenSchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({
                error: "Dados inválidos",
                details: validationResult.error.errors
            });
        }
        // Atualizar o token
        const updatedToken = await storage_1.storage.updateApiToken(id, validationResult.data);
        // Não retorna o token completo por segurança
        if (!updatedToken) {
            return res.status(500).json({ error: "Erro ao atualizar token de API" });
        }
        const safeToken = Object.assign(Object.assign({}, updatedToken), { token: updatedToken.token.substring(0, 10) + "..." + updatedToken.token.substring(updatedToken.token.length - 4) });
        return res.json(safeToken);
    }
    catch (error) {
        console.error("Error updating API token:", error);
        return res.status(500).json({ error: "Erro ao atualizar token de API" });
    }
}
/**
 * Revogar (excluir) um token de API
 */
async function deleteApiToken(req, res) {
    try {
        console.log('\n=== API TOKEN DELETE - REQUEST ===');
        console.log(`ID: ${req.params.id}`);
        console.log(`URL: ${req.originalUrl}`);
        console.log('====================================\n');
        if (!req.user) {
            console.log('\n=== API TOKEN DELETE - UNAUTHORIZED ===');
            console.log('========================================\n');
            return res.status(401).json({ error: "Não autenticado" });
        }
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            console.log('\n=== API TOKEN DELETE - INVALID ID ===');
            console.log(`Valor do parâmetro id: ${req.params.id}`);
            console.log('=====================================\n');
            return res.status(400).json({ error: "ID inválido" });
        }
        // Verificar se o token existe
        const token = await storage_1.storage.getApiTokenById(id);
        if (!token) {
            console.log('\n=== API TOKEN DELETE - NOT FOUND ===');
            console.log(`ID procurado: ${id}`);
            console.log('====================================\n');
            return res.status(404).json({ error: "Token não encontrado" });
        }
        // Verificar se o token pertence ao usuário atual
        if (token.usuario_id !== req.user.id) {
            console.log('\n=== API TOKEN DELETE - FORBIDDEN ===');
            console.log(`Token ID: ${id}, User ID: ${req.user.id}, Token Owner: ${token.usuario_id}`);
            console.log('====================================\n');
            return res.status(403).json({ error: "Acesso negado" });
        }
        // Excluir o token
        const success = await storage_1.storage.deleteApiToken(id);
        if (success) {
            console.log('\n=== API TOKEN DELETE - SUCCESS ===');
            console.log(`Token ID: ${id} excluído com sucesso`);
            console.log('==================================\n');
            return res.status(204).end();
        }
        else {
            console.log('\n=== API TOKEN DELETE - FAILED ===');
            console.log(`Token ID: ${id} - falha na exclusão`);
            console.log('=================================\n');
            return res.status(500).json({ error: "Erro ao excluir token de API" });
        }
    }
    catch (error) {
        console.error('\n=== API TOKEN DELETE - ERROR ===');
        console.error("Error deleting API token:", error);
        console.error('================================\n');
        return res.status(500).json({ error: "Erro ao excluir token de API" });
    }
}
/**
 * Rotacionar (gerar novo valor) para o MasterToken
 */
async function rotateApiToken(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const { senha } = req.body;
        if (!senha || typeof senha !== 'string') {
            return res.status(400).json({ error: "Senha obrigatória para rotacionar o token" });
        }
        const token = await storage_1.storage.getApiTokenById(id);
        if (!token) {
            return res.status(404).json({ error: "Token não encontrado" });
        }
        if (token.usuario_id !== req.user.id) {
            return res.status(403).json({ error: "Acesso negado" });
        }
        if (!token.master) {
            return res.status(400).json({ error: "Só é possível rotacionar o MasterToken" });
        }
        // Validar senha do usuário
        const user = await storage_1.storage.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }
        const senhaOk = await bcryptjs_1.default.compare(senha, user.senha);
        if (!senhaOk) {
            return res.status(401).json({ error: "Senha incorreta" });
        }
        // Gerar novo token seguro
        const newToken = storage_1.storage["generateApiToken"]();
        await storage_1.storage.updateApiToken(id, { token: newToken });
        return res.status(200).json({ token: newToken });
    }
    catch (error) {
        console.error("Erro ao rotacionar MasterToken:", error);
        return res.status(500).json({ error: "Erro ao rotacionar MasterToken" });
    }
}
