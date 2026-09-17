"use strict";
/**
 * Utilitário para geração de senhas aleatórias
 * Usado tanto na ativação manual (admin) quanto automática (pagamento)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomPassword = generateRandomPassword;
/**
 * Gera uma senha aleatória com caracteres alfanuméricos
 * @param length - Tamanho da senha (padrão: 8 caracteres)
 * @returns String com a senha gerada
 */
function generateRandomPassword(length = 8) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset.charAt(randomIndex);
    }
    return password;
}
