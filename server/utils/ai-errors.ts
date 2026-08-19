/**
 * Classificação de erros da IA + retry com backoff.
 *
 * Distingue a ORIGEM da falha (sem crédito × instabilidade × timeout × bug),
 * para o pipeline dar a resposta certa ao usuário, avisar o admin quando for
 * falta de crédito, e registrar no log de ingestão o motivo real.
 *
 * Aditivo: não altera o caminho de sucesso. Só melhora o tratamento de falha.
 */

export type AiErrorKind =
  | "sem_credito"    // OpenAI/Gemini sem saldo/quota — NÃO adianta repetir
  | "rate_limit"     // 429 por excesso de chamadas — repetir com espera
  | "transitorio"    // 5xx / instabilidade do provedor — repetir
  | "timeout"        // demora/conexão caiu — repetir
  | "auth"           // chave inválida/ausente — configuração
  | "bug";           // erro inesperado no nosso código

export interface ClassifiedAiError {
  kind: AiErrorKind;
  retryable: boolean;
  status?: number;
  provider: string;
  userMessage: string;
  detail: string;
}

function detailOf(err: any): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.status ||
    err?.message ||
    String(err)
  ).toString().slice(0, 500);
}

/**
 * Classifica um erro de chamada à IA (axios/fetch). `provider` só rotula o log.
 */
export function classifyAiError(err: any, provider = "openai"): ClassifiedAiError {
  const status: number | undefined = err?.response?.status;
  const data = err?.response?.data;
  const code = data?.error?.code || data?.error?.type || data?.error?.status;
  const netCode = err?.code; // ECONNABORTED, ECONNRESET, ETIMEDOUT, ENOTFOUND...
  const detail = detailOf(err);
  const msgLower = detail.toLowerCase();

  let kind: AiErrorKind = "bug";
  let retryable = false;

  // Chave ausente/inválida (config)
  if (
    msgLower.includes("não configurada") ||
    msgLower.includes("api key") ||
    status === 401 ||
    status === 403
  ) {
    kind = "auth";
    retryable = false;
  }
  // Sem crédito / quota esgotada — NÃO repetir
  else if (
    code === "insufficient_quota" ||
    code === "RESOURCE_EXHAUSTED" ||
    msgLower.includes("insufficient_quota") ||
    msgLower.includes("exceeded your current quota") ||
    msgLower.includes("billing")
  ) {
    kind = "sem_credito";
    retryable = false;
  }
  // Rate limit (429 sem ser quota) — repetir com espera
  else if (status === 429) {
    kind = "rate_limit";
    retryable = true;
  }
  // Timeout / rede — repetir
  else if (
    netCode === "ECONNABORTED" ||
    netCode === "ETIMEDOUT" ||
    netCode === "ECONNRESET" ||
    netCode === "ENOTFOUND" ||
    msgLower.includes("timeout")
  ) {
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
export function userMessageFor(kind: AiErrorKind): string {
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
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; provider?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 600;
  const provider = opts.provider ?? "openai";

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const c = classifyAiError(err, provider);
      if (!c.retryable || attempt === retries) throw err;
      const delay = Math.round(base * Math.pow(2, attempt) + Math.random() * 200);
      console.warn(`[AI retry] ${provider}: tentativa ${attempt + 1} falhou (${c.kind}); aguardando ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
