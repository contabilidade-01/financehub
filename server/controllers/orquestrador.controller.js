"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusOrquestrador = statusOrquestrador;
exports.chatOrquestrador = chatOrquestrador;
const storage_1 = require("../storage");
const storage_2 = require("../storage");
const ai_agent_service_1 = require("../services/ai-agent.service");
const deepseek_service_1 = require("../services/deepseek.service");
/**
 * Orquestrador admin — chat com DeepSeek (não usa OpenAI do WhatsApp).
 * Super admin escolhe o usuário e conversa; as tools agem na carteira desse usuário.
 */
async function statusOrquestrador(_req, res) {
    return res.json(Object.assign(Object.assign({ provider: "deepseek" }, (0, deepseek_service_1.deepseekStatusPublico)()), { canal: "admin-orquestrador" }));
}
async function chatOrquestrador(req, res) {
    var _a, _b;
    const status = (0, deepseek_service_1.deepseekStatusPublico)();
    if (!status.configured) {
        return res.status(503).json({
            error: "DeepSeek não configurada",
            detalhe: "Defina DEEPSEEK_API_KEY no ambiente (só o orquestrador usa essa key).",
        });
    }
    const usuarioId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.usuario_id);
    const texto = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.texto) || "").trim();
    if (!Number.isFinite(usuarioId) || !texto) {
        return res.status(400).json({ error: "Informe usuario_id e texto" });
    }
    const user = await storage_1.storage.getUserById(usuarioId);
    if (!user)
        return res.status(404).json({ error: "Usuário não encontrado" });
    const wallet = await storage_1.storage.getWalletByUserId(user.id);
    if (!wallet) {
        return res.status(400).json({ error: "Usuário sem carteira — orquestrador precisa de carteira PF" });
    }
    const categories = await storage_1.storage.getCategoriesByUserId(user.id);
    let empresaAtiva = null;
    if (user.tipo_pessoa === "juridica" && user.ativo) {
        const empresas = await storage_1.storage.getEmpresasByUsuarioId(user.id);
        const comCnpj = empresas.find((e) => e.cnpj && e.cnpj.trim().length > 0);
        const emp = comCnpj || empresas[0];
        if (emp) {
            empresaAtiva = {
                id: emp.id,
                nome: emp.nome_fantasia || emp.razao_social,
                cnpj: emp.cnpj || null,
                segmento: emp.segmento || null,
            };
        }
    }
    const toolTrace = [];
    const agentContext = {
        userId: user.id,
        walletId: wallet.id,
        categories: categories.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
        tipoPessoa: user.tipo_pessoa || "fisica",
        empresaAtiva,
        origemMidia: false,
        toolTrace,
        canal: "admin-orquestrador",
    };
    const historico = await (0, storage_2.getConversaRecente)(user.id, 8);
    const t0 = Date.now();
    let resposta;
    try {
        resposta = await (0, ai_agent_service_1.runAgent)(texto, agentContext, historico, { llm: "deepseek" });
    }
    catch (e) {
        return res.status(500).json({
            error: (e === null || e === void 0 ? void 0 : e.message) || "Erro no orquestrador",
            provider: "deepseek",
            model: status.model,
            usuario: { id: user.id, nome: user.nome, email: user.email },
            tools: toolTrace,
        });
    }
    await (0, storage_2.appendConversa)(user.id, "user", texto);
    await (0, storage_2.appendConversa)(user.id, "assistant", resposta);
    return res.json({
        success: true,
        ms: Date.now() - t0,
        provider: "deepseek",
        model: status.model,
        usuario: { id: user.id, nome: user.nome, email: user.email },
        empresa: empresaAtiva,
        texto_enviado: texto,
        resposta,
        tools: toolTrace,
    });
}
