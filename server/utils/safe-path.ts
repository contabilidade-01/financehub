import path from "path";

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
