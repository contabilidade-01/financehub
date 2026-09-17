"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simularWhatsapp = simularWhatsapp;
const storage_1 = require("../storage");
const storage_2 = require("../storage");
const ai_agent_service_1 = require("../services/ai-agent.service");
/**
 * Simulador de mensagem WhatsApp (somente homologação).
 * Exige SIMULADOR_WHATSAPP=true + super_admin.
 *
 * Mesmo pipeline do WhatsApp: histórico + runAgent (não envia UazAPI).
 */
async function simularWhatsapp(req, res) {
    var _a, _b;
    if (process.env.SIMULADOR_WHATSAPP !== "true") {
        return res.status(404).json({
            error: "Simulador indisponível neste ambiente",
            detalhe: "Defina SIMULADOR_WHATSAPP=true apenas na homologação",
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
    const phoneRaw = String(user.telefone || "").replace(/\D/g, "");
    const chatid = phoneRaw
        ? `${phoneRaw.startsWith("55") ? phoneRaw : `55${phoneRaw}`}@s.whatsapp.net`
        : `simulado${usuarioId}@s.whatsapp.net`;
    const wallet = await storage_1.storage.getWalletByUserId(user.id);
    if (!wallet) {
        return res.status(400).json({ error: "Usuário sem carteira — não dá para simular o agente" });
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
    };
    const historico = await (0, storage_2.getConversaRecente)(user.id, 6);
    const t0 = Date.now();
    let resposta;
    try {
        resposta = await (0, ai_agent_service_1.runAgent)(texto, agentContext, historico);
    }
    catch (e) {
        return res.status(500).json({
            error: (e === null || e === void 0 ? void 0 : e.message) || "Erro no agente",
            usuario: { id: user.id, nome: user.nome, email: user.email },
            tools: toolTrace,
        });
    }
    await (0, storage_2.appendConversa)(user.id, "user", texto);
    await (0, storage_2.appendConversa)(user.id, "assistant", resposta);
    // Payload espelho do webhook (documentação / debug) — não reenvia à UazAPI.
    const payloadUazapi = {
        EventType: "messages",
        BaseUrl: "https://simulador.local",
        token: "SIMULADOR",
        message: {
            chatid,
            messageType: "Conversation",
            text: texto,
            messageid: `sim-${Date.now()}`,
            messageTimestamp: Math.floor(Date.now() / 1000),
            fromMe: false,
            senderName: user.nome || "Simulador",
        },
    };
    return res.json({
        success: true,
        ms: Date.now() - t0,
        usuario: { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone },
        empresa: empresaAtiva,
        texto_enviado: texto,
        resposta,
        tools: toolTrace,
        payload_uazapi_espelho: payloadUazapi,
        nota: "Mesmo runAgent + histórico do WhatsApp. Envio UazAPI não é chamado (homologação sem token).",
    });
}
