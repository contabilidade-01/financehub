/**
 * Checkout Token Utilities
 *
 * Utilitário para geração e validação de tokens de checkout externo.
 * O token é um base64 do formato: userId:email
 */

/**
 * Gera um token de checkout externo
 * @param userId - ID do usuário
 * @param email - Email do usuário
 * @returns Token em formato base64
 */
import { createHmac, timingSafeEqual } from 'crypto';

// Segurança: o token é assinado (HMAC) para ninguém forjar checkout de outro
// usuário a partir de id + email. Formato: <base64url(payload)>.<assinatura>
function segredoCheckout(): string {
  return process.env.CHECKOUT_TOKEN_SECRET || process.env.SESSION_SECRET || 'dev-only-checkout-secret';
}

function assinar(payloadB64: string): string {
  return createHmac('sha256', segredoCheckout()).update(payloadB64).digest('base64url').slice(0, 32);
}

// Tokens antigos (sem assinatura) seguem válidos até esta data, para não
// quebrar links de pagamento já enviados. Depois, só tokens assinados.
function aceitaTokenLegado(): boolean {
  const limite = process.env.CHECKOUT_LEGACY_ATE || '2026-10-25';
  return Date.now() < new Date(`${limite}T23:59:59-03:00`).getTime();
}

export function generateCheckoutToken(userId: number, email: string, ciclo?: string): string {
  // Formato: userId:ciclo:email (ciclo opcional — retrocompatível com userId:email)
  const payload = ciclo ? `${userId}:${ciclo}:${email}` : `${userId}:${email}`;
  // base64url evita `/` e `+`, que quebram a URL e a rota do Express
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${assinar(b64)}`;
}

const CICLOS_VALIDOS = ['mensal', 'trimestral', 'anual'];

/**
 * Decodifica um token de checkout externo
 * @param token - Token em formato base64
 * @returns Objeto com userId e email, ou null se inválido
 */
function normalizeCheckoutToken(token: string): string {
  let t = token.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    // já estava decodificado
  }
  return t.replace(/-/g, '+').replace(/_/g, '/');
}

export function decodeCheckoutToken(token: string): { userId: number; email: string; ciclo?: string } | null {
  try {
    let bruto = token.trim();
    try {
      bruto = decodeURIComponent(bruto);
    } catch {
      // já estava decodificado
    }
    const ponto = bruto.lastIndexOf('.');
    if (ponto !== -1) {
      const b64 = bruto.slice(0, ponto);
      const esperada = Buffer.from(assinar(b64));
      const recebida = Buffer.from(bruto.slice(ponto + 1));
      if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) {
        return null;
      }
      bruto = b64;
    } else if (!aceitaTokenLegado()) {
      return null;
    }
    const decoded = Buffer.from(normalizeCheckoutToken(bruto), 'base64').toString('utf-8');

    // Encontra o primeiro ':' para separar userId do resto
    const firstColonIndex = decoded.indexOf(':');
    if (firstColonIndex === -1) {
      return null;
    }

    const userIdStr = decoded.substring(0, firstColonIndex);
    let rest = decoded.substring(firstColonIndex + 1);

    // Segmento opcional de ciclo (userId:ciclo:email). Só extrai se casar com
    // um ciclo válido — assim tokens antigos (userId:email) seguem funcionando.
    let ciclo: string | undefined;
    const secondColon = rest.indexOf(':');
    if (secondColon !== -1) {
      const maybe = rest.substring(0, secondColon);
      if (CICLOS_VALIDOS.includes(maybe)) {
        ciclo = maybe;
        rest = rest.substring(secondColon + 1);
      }
    }
    const email = rest;

    const userId = parseInt(userIdStr, 10);

    // Valida que userId é um número válido
    if (isNaN(userId) || userId <= 0) {
      return null;
    }

    // Valida formato básico de email
    if (!email || !email.includes('@')) {
      return null;
    }

    return { userId, email, ciclo };
  } catch (error) {
    // Erro ao decodificar base64 ou processar
    return null;
  }
}

/**
 * Valida um token de checkout externo
 * @param token - Token em formato base64
 * @returns true se o token é válido (formato correto), false caso contrário
 */
export function validateCheckoutToken(token: string): boolean {
  return decodeCheckoutToken(token) !== null;
}
