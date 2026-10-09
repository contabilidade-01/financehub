import { createHash } from "crypto";

/**
 * Tokens de API são guardados só como hash (SHA-256): um vazamento do banco ou
 * de um backup não entrega tokens utilizáveis. O valor completo aparece uma
 * única vez, na criação/rotação.
 */
export function hashApiToken(token: string): string {
  return `sha256:${createHash("sha256").update(String(token), "utf8").digest("hex")}`;
}

/** Versão para exibição: "fin_ab12cd...9f3e". */
export function mascararApiToken(token: string): string {
  const t = String(token || "");
  return t.length > 14 ? `${t.slice(0, 10)}...${t.slice(-4)}` : "...";
}

/** Texto a exibir de um registro (hint salvo; nunca o hash). */
export function exibicaoApiToken(row: { token?: string | null; token_hint?: string | null }): string {
  if (row.token_hint) return row.token_hint;
  const t = String(row.token || "");
  return t.startsWith("sha256:") ? "..." : mascararApiToken(t);
}
