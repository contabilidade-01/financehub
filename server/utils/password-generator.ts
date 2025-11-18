/**
 * Utilitário para geração de senhas aleatórias
 * Usado tanto na ativação manual (admin) quanto automática (pagamento)
 */

/**
 * Gera uma senha aleatória com caracteres alfanuméricos
 * @param length - Tamanho da senha (padrão: 8 caracteres)
 * @returns String com a senha gerada
 */
export function generateRandomPassword(length: number = 8): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset.charAt(randomIndex);
  }

  return password;
}
