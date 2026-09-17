"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepseekConfig = deepseekConfig;
exports.deepseekStatusPublico = deepseekStatusPublico;
exports.deepseekChatCompletions = deepseekChatCompletions;
/**
 * Cliente DeepSeek — exclusivo do orquestrador (chat admin).
 * WhatsApp / OpenAI / Gemini não passam por aqui.
 *
 * Env:
 *   DEEPSEEK_API_KEY   (obrigatória para o orquestrador)
 *   DEEPSEEK_BASE_URL  (default https://api.deepseek.com)
 *   DEEPSEEK_MODEL     (default deepseek-chat)
 */
const axios_1 = __importDefault(require("axios"));
function deepseekConfig() {
    const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
    const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
        .trim()
        .replace(/\/$/, "");
    const model = String(process.env.DEEPSEEK_MODEL || "deepseek-chat").trim();
    return { apiKey, baseUrl, model, configured: apiKey.length > 0 && apiKey.startsWith("sk-") };
}
function deepseekStatusPublico() {
    const c = deepseekConfig();
    return {
        configured: c.configured,
        model: c.model,
        base_url: c.baseUrl,
        key_prefix: c.configured ? c.apiKey.slice(0, 6) + "…" : null,
    };
}
/** Chat completions no formato OpenAI (tools / tool_choice). */
async function deepseekChatCompletions(payload) {
    var _a, _b, _c;
    const { apiKey, baseUrl, model, configured } = deepseekConfig();
    if (!configured) {
        throw new Error("DEEPSEEK_API_KEY não configurada — defina no ambiente para o orquestrador.");
    }
    const body = {
        model,
        messages: payload.messages,
        temperature: (_a = payload.temperature) !== null && _a !== void 0 ? _a : 0.3,
    };
    if ((_b = payload.tools) === null || _b === void 0 ? void 0 : _b.length) {
        body.tools = payload.tools;
        body.tool_choice = (_c = payload.tool_choice) !== null && _c !== void 0 ? _c : "auto";
    }
    return axios_1.default.post(`${baseUrl}/chat/completions`, body, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        timeout: 90000,
    });
}
