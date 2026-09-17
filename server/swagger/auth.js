"use strict";
/**
 * @swagger
 * tags:
 *   name: Autenticação
 *   description: Endpoints para autenticação e gerenciamento de usuários
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     Login:
 *       type: object
 *       required:
 *         - email
 *         - senha
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Email do usuário
 *         senha:
 *           type: string
 *           format: password
 *           description: Senha do usuário
 *       example:
 *         email: usuario@exemplo.com
 *         senha: senha123
 *
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID do usuário
 *         nome:
 *           type: string
 *           description: Nome completo do usuário
 *         email:
 *           type: string
 *           format: email
 *           description: Email do usuário
 *         data_cadastro:
 *           type: string
 *           format: date-time
 *           description: Data de criação da conta
 *         ultimo_acesso:
 *           type: string
 *           format: date-time
 *           description: Data do último acesso
 *       example:
 *         id: 1
 *         nome: João Silva
 *         email: joao@exemplo.com
 *         data_cadastro: "2023-05-01T10:30:00Z"
 *         ultimo_acesso: "2023-05-05T15:20:00Z"
 */
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Autentica um usuário
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Login'
 *     responses:
 *       200:
 *         description: Autenticação bem-sucedida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Credenciais inválidas
 *       400:
 *         description: Dados de entrada inválidos
 *
 * /auth/me:
 *   get:
 *     summary: Obtém o usuário atualmente autenticado
 *     tags: [Autenticação] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Usuário autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Não autenticado
 */
/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Encerra a sessão do usuário
 *     tags: [Autenticação] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Sessão encerrada com sucesso
 *       401:
 *         description: Não autenticado
 */ 
