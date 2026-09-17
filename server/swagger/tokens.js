"use strict";
/**
 * @swagger
 * tags:
 *   name: Tokens API
 *   description: Gerenciamento de tokens de acesso à API
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     ApiToken:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID do token
 *         usuario_id:
 *           type: integer
 *           description: ID do usuário proprietário do token
 *         nome:
 *           type: string
 *           description: Nome/descrição do token
 *         token:
 *           type: string
 *           description: Token de acesso à API (visível apenas na criação)
 *         ultimo_acesso:
 *           type: string
 *           format: date-time
 *           description: Data e hora do último acesso usando este token
 *         ativo:
 *           type: boolean
 *           description: Status do token (ativo ou revogado)
 *         data_criacao:
 *           type: string
 *           format: date-time
 *           description: Data de criação do token
 *       example:
 *         id: 1
 *         usuario_id: 2
 *         nome: Token para Integração ERP
 *         token: "fin_7a9s8d7f9as87df98as7df9as87df"
 *         ultimo_acesso: "2025-05-10T15:30:00Z"
 *         ativo: true
 *         data_criacao: "2025-05-01T10:30:00Z"
 *
 *     NovoApiToken:
 *       type: object
 *       required:
 *         - nome
 *       properties:
 *         nome:
 *           type: string
 *           description: Nome/descrição do token
 *       example:
 *         nome: Token para Aplicativo Mobile
 */
/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Obtém todos os tokens de API do usuário
 *     tags: [Tokens API] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiToken'
 *       401:
 *         description: Não autenticado
 *
 *   post:
 *     summary: Cria um novo token de API
 *     tags: [Tokens API] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovoApiToken'
 *     responses:
 *       201:
 *         description: Token criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiToken'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 */
/**
 * @swagger
 * /api/tokens/{id}:
 *   get:
 *     summary: Obtém um token específico pelo ID
 *     tags: [Tokens API] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID do token
 *     responses:
 *       200:
 *         description: Detalhes do token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiToken'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (token de outro usuário)
 *       404:
 *         description: Token não encontrado
 *
 *   patch:
 *     summary: Atualiza um token (nome ou status)
 *     tags: [Tokens API] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID do token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Novo nome/descrição do token
 *               ativo:
 *                 type: boolean
 *                 description: Status do token (ativo ou inativo)
 *     responses:
 *       200:
 *         description: Token atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiToken'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (token de outro usuário)
 *       404:
 *         description: Token não encontrado
 *
 *   delete:
 *     summary: Revoga (exclui) um token de API
 *     tags: [Tokens API] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID do token
 *     responses:
 *       200:
 *         description: Token revogado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (token de outro usuário)
 *       404:
 *         description: Token não encontrado
 */ 
