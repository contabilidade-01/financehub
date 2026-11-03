import path from "path";
import { randomBytes } from "crypto";

// Nomes gerados pelo próprio servidor: letras, números, ponto, hífen e underscore.
const NOME_SEGURO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/**
 * Resolve `filename` dentro de `baseDir` sem permitir path traversal.
 * Retorna null se o nome for inválido ou escapar do diretório base.
 */
export function resolverArquivoSeguro(baseDir: string, filename: unknown): string | null {
  if (typeof filename !== "string") return null;
  if (!NOME_SEGURO.test(filename) || filename.includes("..")) return null;
  const base = path.resolve(baseDir);
  const alvo = path.resolve(base, filename);
  if (path.dirname(alvo) !== base) return null;
  return alvo;
}

/**
 * Parte aleatória (128 bits) dos nomes de relatórios/gráficos baixáveis por link.
 * O download é público (o link vai pelo WhatsApp), então o nome não pode ser
 * adivinhável: antes ele era derivado do id do usuário + horário.
 */
export function tokenArquivo(): string {
  return randomBytes(16).toString("hex");
}

/** Só servimos por link arquivos com token aleatório no nome (formatos antigos eram adivinháveis). */
export function nomeComToken(filename: unknown): boolean {
  return typeof filename === "string" && /-[0-9a-f]{32}(-novo)?\.[a-z]+$/.test(filename);
}
