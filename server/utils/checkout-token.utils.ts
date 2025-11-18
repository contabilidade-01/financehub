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
export function generateCheckoutToken(userId: number, email: string): string {
  const payload = `${userId}:${email}`;
  const token = Buffer.from(payload).toString('base64');
  return token;
}

/**
 * Decodifica um token de checkout externo
 * @param token - Token em formato base64
 * @returns Objeto com userId e email, ou null se inválido
 */
export function decodeCheckoutToken(token: string): { userId: number; email: string } | null {
  try {
    // Decodifica base64
    const decoded = Buffer.from(token, 'base64').toString('utf-8');

    // Encontra o primeiro ':' para separar userId do email
    // (email pode conter ':' então não podemos usar split simples)
    const firstColonIndex = decoded.indexOf(':');
    if (firstColonIndex === -1) {
      return null;
    }

    const userIdStr = decoded.substring(0, firstColonIndex);
    const email = decoded.substring(firstColonIndex + 1);

    const userId = parseInt(userIdStr, 10);

    // Valida que userId é um número válido
    if (isNaN(userId) || userId <= 0) {
      return null;
    }

    // Valida formato básico de email
    if (!email || !email.includes('@')) {
      return null;
    }

    return { userId, email };
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
