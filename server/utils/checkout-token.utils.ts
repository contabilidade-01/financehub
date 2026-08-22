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
export function generateCheckoutToken(userId: number, email: string, ciclo?: string): string {
  // Formato: userId:ciclo:email (ciclo opcional — retrocompatível com userId:email)
  const payload = ciclo ? `${userId}:${ciclo}:${email}` : `${userId}:${email}`;
  const token = Buffer.from(payload).toString('base64');
  return token;
}

const CICLOS_VALIDOS = ['mensal', 'trimestral', 'anual'];

/**
 * Decodifica um token de checkout externo
 * @param token - Token em formato base64
 * @returns Objeto com userId e email, ou null se inválido
 */
export function decodeCheckoutToken(token: string): { userId: number; email: string; ciclo?: string } | null {
  try {
    // Decodifica base64
    const decoded = Buffer.from(token, 'base64').toString('utf-8');

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
