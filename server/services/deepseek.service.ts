/**
 * Cliente DeepSeek — exclusivo do orquestrador (chat admin).
 * WhatsApp / OpenAI / Gemini não passam por aqui.
 *
 * Env:
 *   DEEPSEEK_API_KEY   (obrigatória para o orquestrador)
 *   DEEPSEEK_BASE_URL  (default https://api.deepseek.com)
 *   DEEPSEEK_MODEL     (default deepseek-chat)
 */
import axios from "axios";

export function deepseekConfig() {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    .trim()
    .replace(/\/$/, "");
  const model = String(process.env.DEEPSEEK_MODEL || "deepseek-chat").trim();
  return { apiKey, baseUrl, model, configured: apiKey.length > 0 && apiKey.startsWith("sk-") };
}

export function deepseekStatusPublico() {
  const c = deepseekConfig();
  return {
    configured: c.configured,
    model: c.model,
    base_url: c.baseUrl,
    key_prefix: c.configured ? c.apiKey.slice(0, 6) + "…" : null,
  };
}

/** Chat completions no formato OpenAI (tools / tool_choice). */
export async function deepseekChatCompletions(payload: {
  messages: any[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
}): Promise<any> {
  const { apiKey, baseUrl, model, configured } = deepseekConfig();
  if (!configured) {
    throw new Error("DEEPSEEK_API_KEY não configurada — defina no ambiente para o orquestrador.");
  }
  const body: any = {
    model,
    messages: payload.messages,
    temperature: payload.temperature ?? 0.3,
  };
  if (payload.tools?.length) {
    body.tools = payload.tools;
    body.tool_choice = payload.tool_choice ?? "auto";
  }
  return axios.post(`${baseUrl}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 90000,
  });
}
