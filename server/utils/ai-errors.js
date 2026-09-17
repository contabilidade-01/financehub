"use strict";
/**
 * Classificação de erros da IA + retry com backoff.
 *
 * Distingue a ORIGEM da falha (sem crédito × instabilidade × timeout × bug),
 * para o pipeline dar a resposta certa ao usuário, avisar o admin quando for
 * falta de crédito, e registrar no log de ingestão o motivo real.
 *
 * Aditivo: não altera o caminho de sucesso. Só melhora o tratamento de falha.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyAiError = classifyAiError;
exports.userMessageFor = userMessageFor;
exports.withRetry = withRetry;
function detailOf(err) {
    var _a, _b, _c, _d, _e, _f;
    return (((_c = (_b = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) ||
        ((_f = (_e = (_d = err === null || err === void 0 ? void 0 : err.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.error) === null || _f === void 0 ? void 0 : _f.status) ||
        (err === null || err === void 0 ? void 0 : err.message) ||
        String(err)).toString().slice(0, 500);
}
/**
 * Classifica um erro de chamada à IA (axios/fetch). `provider` só rotula o log.
 */
function classifyAiError(err, provider = "openai") {
    var _a, _b, _c, _d, _e;
    const status = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status;
    const data = (_b = err === null || err === void 0 ? void 0 : err.response) === null || _b === void 0 ? void 0 : _b.data;
    const code = ((_c = data === null || data === void 0 ? void 0 : data.error) === null || _c === void 0 ? void 0 : _c.code) || ((_d = data === null || data === void 0 ? void 0 : data.error) === null || _d === void 0 ? void 0 : _d.type) || ((_e = data === null || data === void 0 ? void 0 : data.error) === null || _e === void 0 ? void 0 : _e.status);
    const netCode = err === null || err === void 0 ? void 0 : err.code; // ECONNABORTED, ECONNRESET, ETIMEDOUT, ENOTFOUND...
    const detail = detailOf(err);
    const msgLower = detail.toLowerCase();
    let kind = "bug";
    let retryable = false;
    // Chave ausente/inválida (config)
    if (msgLower.includes("não configurada") ||
        msgLower.includes("api key") ||
        status === 401 ||
        status === 403) {
        kind = "auth";
        retryable = false;
    }
    // Sem crédito / quota esgotada — NÃO repetir
    else if (code === "insufficient_quota" ||
        code === "RESOURCE_EXHAUSTED" ||
        msgLower.includes("insufficient_quota") ||
        msgLower.includes("exceeded your current quota") ||
        msgLower.includes("billing")) {
        kind = "sem_credito";
        retryable = false;
    }
    // Rate limit (429 sem ser quota) — repetir com espera
    else if (status === 429) {
        kind = "rate_limit";
        retryable = true;
    }
    // Timeout / rede — repetir
    else if (netCode === "ECONNABORTED" ||
        netCode === "ETIMEDOUT" ||
        netCode === "ECONNRESET" ||
        netCode === "ENOTFOUND" ||
        msgLower.includes("timeout")) {
        kind = "timeout";
        retryable = true;
    }
    // Instabilidade do provedor — repetir
    else if (typeof status === "number" && status >= 500) {
        kind = "transitorio";
        retryable = true;
    }
    return {
        kind,
        retryable,
        status,
        provider,
        detail,
        userMessage: userMessageFor(kind),
    };
}
/** Mensagem amigável ao usuário conforme a origem da falha. */
function userMessageFor(kind) {
    switch (kind) {
        case "sem_credito":
            return "⚠️ Estou momentaneamente indisponível (limite do serviço de IA). Já avisei o suporte — tente novamente em alguns minutos.";
        case "rate_limit":
        case "transitorio":
        case "timeout":
            return "⏳ Tive uma instabilidade rápida por aqui. Pode reenviar sua mensagem, por favor?";
        case "auth":
            return "⚠️ Estou com um problema de configuração no momento. O suporte já foi notificado.";
        case "bug":
        default:
            return "😕 Tive um erro inesperado ao processar. Já registrei aqui — pode tentar novamente?";
    }
}
/**
 * Executa `fn` com retry exponencial APENAS para erros repetíveis
 * (rate_limit, transitório, timeout). sem_credito/auth/bug falham na hora.
 */
async function withRetry(fn, opts = {}) {
    var _a, _b, _c;
    const retries = (_a = opts.retries) !== null && _a !== void 0 ? _a : 2;
    const base = (_b = opts.baseDelayMs) !== null && _b !== void 0 ? _b : 600;
    const provider = (_c = opts.provider) !== null && _c !== void 0 ? _c : "openai";
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            const c = classifyAiError(err, provider);
            if (!c.retryable || attempt === retries)
                throw err;
            const delay = Math.round(base * Math.pow(2, attempt) + Math.random() * 200);
            console.warn(`[AI retry] ${provider}: tentativa ${attempt + 1} falhou (${c.kind}); aguardando ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
