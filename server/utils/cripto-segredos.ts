/**
 * Criptografia de segredos de integração guardados no banco (certificado e
 * chave privada do Cora, por exemplo). AES-256-GCM com chave derivada de
 * INTEGRACOES_SECRET; o banco nunca vê o segredo em claro e um vazamento do
 * banco sozinho não expõe as credenciais das empresas.
 *
 * Formato: "v1:<iv b64>:<tag b64>:<cifra b64>".
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export class SegredoIndisponivel extends Error {}

let avisado = false;

function chave(): Buffer {
  const segredo = process.env.INTEGRACOES_SECRET?.trim();
  if (segredo && segredo.length >= 32) return createHash("sha256").update(`integracoes:${segredo}`).digest();
  if (process.env.NODE_ENV === "production") {
    throw new SegredoIndisponivel("Integrações indisponíveis: defina INTEGRACOES_SECRET (32+ caracteres) no servidor.");
  }
  // Desenvolvimento: deriva do SESSION_SECRET para não travar o ambiente local.
  if (!avisado) {
    console.warn("[Integrações] INTEGRACOES_SECRET ausente; usando chave derivada do SESSION_SECRET (só em desenvolvimento).");
    avisado = true;
  }
  return createHash("sha256").update(`integracoes-dev:${process.env.SESSION_SECRET || "dev"}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const cifra = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${cifra.toString("base64")}`;
}

export function decifrar(guardado: string): string {
  const [versao, iv, tag, cifra] = String(guardado || "").split(":");
  if (versao !== "v1" || !iv || !tag || !cifra) throw new SegredoIndisponivel("Segredo em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(cifra, "base64")), d.final()]).toString("utf8");
}

/** Hash para localizar um token sem guardá-lo em claro (e sem comparação sensível a tempo). */
export function hashToken(token: string): string {
  return createHash("sha256").update(`token:${token}`).digest("hex");
}
