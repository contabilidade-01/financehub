/**
 * 2FA por aplicativo autenticador (TOTP, RFC 6238) — lógica pura, sem banco.
 * Compatível com Google Authenticator, Microsoft Authenticator, Authy etc.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const ALFABETO_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const PASSO_SEGUNDOS = 30;
export const DIGITOS = 6;
/** Aceita o código do passo anterior e do seguinte (relógio do celular adiantado/atrasado ~30s). */
export const JANELA_PASSOS = 1;
export const QTD_CODIGOS_RECUPERACAO = 10;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let out = "";
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO_B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO_B32[(valor << (5 - bits)) & 31];
  return out;
}

export function base32Decode(txt: string): Buffer {
  const limpo = txt.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO_B32.indexOf(c);
    if (i < 0) throw new Error("Segredo base32 inválido");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo novo de 160 bits (padrão dos autenticadores), em base32. */
export function gerarSegredo(): string {
  return base32Encode(randomBytes(20));
}

export function passoAtual(agoraMs = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS);
}

/** Código TOTP (HOTP com contador = passo de 30s), 6 dígitos, HMAC-SHA1. */
export function codigoDoPasso(segredoB32: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac("sha1", base32Decode(segredoB32)).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Confere o código digitado. Retorna o passo que bateu (para impedir reuso do
 * mesmo código) ou null. `ultimoPassoUsado` bloqueia replay: um código já aceito
 * (ou anterior a ele) não vale de novo.
 */
export function verificarCodigoTotp(
  segredoB32: string,
  codigoDigitado: unknown,
  opts: { agoraMs?: number; ultimoPassoUsado?: number | null } = {},
): number | null {
  const codigo = String(codigoDigitado ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(codigo)) return null;
  const atual = passoAtual(opts.agoraMs);
  for (let d = -JANELA_PASSOS; d <= JANELA_PASSOS; d++) {
    const passo = atual + d;
    if (opts.ultimoPassoUsado != null && passo <= opts.ultimoPassoUsado) continue;
    if (iguais(codigoDoPasso(segredoB32, passo), codigo)) return passo;
  }
  return null;
}

/** Link otpauth:// que o app autenticador lê pelo QR code. */
export function urlOtpAuth(segredoB32: string, conta: string, emissor: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const p = new URLSearchParams({
    secret: segredoB32,
    issuer: emissor,
    algorithm: "SHA1",
    digits: String(DIGITOS),
    period: String(PASSO_SEGUNDOS),
  });
  return `otpauth://totp/${rotulo}?${p.toString()}`;
}

// ---- Códigos de recuperação (uso único) ----

const ALFABETO_REC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I

/** Normaliza o que a pessoa digitou: maiúsculas, sem espaço nem hífen. */
export function normalizarCodigoRecuperacao(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[\s-]/g, "");
}

/** Gera códigos no formato XXXX-XXXX (40 bits cada). */
export function gerarCodigosRecuperacao(qtd = QTD_CODIGOS_RECUPERACAO): string[] {
  const out: string[] = [];
  for (let i = 0; i < qtd; i++) {
    const bytes = randomBytes(8);
    let c = "";
    for (const b of bytes) c += ALFABETO_REC[b % ALFABETO_REC.length];
    out.push(`${c.slice(0, 4)}-${c.slice(4)}`);
  }
  return out;
}

/** Hash guardado no banco (códigos são aleatórios, então SHA-256 basta). */
export function hashCodigoRecuperacao(codigo: string): string {
  return createHash("sha256").update(normalizarCodigoRecuperacao(codigo)).digest("hex");
}

/** Retorna a lista sem o código usado, ou null se o código não vale. */
export function consumirCodigoRecuperacao(hashes: string[], digitado: unknown): string[] | null {
  const norm = normalizarCodigoRecuperacao(digitado);
  if (!/^[A-Z0-9]{8}$/.test(norm)) return null;
  const h = hashCodigoRecuperacao(norm);
  const idx = hashes.findIndex((x) => iguais(x, h));
  if (idx < 0) return null;
  return hashes.filter((_, i) => i !== idx);
}

// ---- "Lembrar este navegador" (não pedir o código em toda entrada) ----

export const DIAS_NAVEGADOR_CONFIAVEL = 30;

/**
 * Token do cookie de navegador confiável: usuário + validade + impressão do
 * segredo atual, assinado com HMAC. Desativar/reativar o 2FA troca o segredo e
 * invalida todos os navegadores lembrados.
 */
export function assinarNavegadorConfiavel(
  chave: string,
  usuarioId: number,
  segredoB32: string,
  agoraMs = Date.now(),
): string {
  const exp = agoraMs + DIAS_NAVEGADOR_CONFIAVEL * 24 * 60 * 60 * 1000;
  const impressao = createHash("sha256").update(segredoB32).digest("hex").slice(0, 16);
  const corpo = `${usuarioId}.${exp}.${impressao}`;
  const assinatura = createHmac("sha256", chave).update(corpo).digest("base64url");
  return `${corpo}.${assinatura}`;
}

export function navegadorConfiavelValido(
  chave: string,
  token: unknown,
  usuarioId: number,
  segredoB32: string,
  agoraMs = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const partes = token.split(".");
  if (partes.length !== 4) return false;
  const [uid, exp, impressao, assinatura] = partes;
  const corpo = `${uid}.${exp}.${impressao}`;
  const esperada = createHmac("sha256", chave).update(corpo).digest("base64url");
  if (!iguais(assinatura, esperada)) return false;
  if (Number(uid) !== usuarioId || !(Number(exp) > agoraMs)) return false;
  return impressao === createHash("sha256").update(segredoB32).digest("hex").slice(0, 16);
}
