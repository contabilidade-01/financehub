"use strict";
/**
 * @swagger
 * tags:
 *   name: Carteiras
 *   description: API para gerenciamento de carteiras financeiras
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     Carteira:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID da carteira (auto-gerado)
 *         usuario_id:
 *           type: integer
 *           description: ID do usuário proprietário da carteira
 *         nome:
 *           type: string
 *           description: Nome da carteira
 *         descricao:
 *           type: string
 *           description: Descrição da carteira
 *         saldo_atual:
 *           type: number
 *           format: decimal
 *           description: Saldo atual da carteira
 *         data_criacao:
 *           type: string
 *           format: date-time
 *           description: Data de criação da carteira
 *       example:
 *         id: 1
 *         usuario_id: 2
 *         nome: Carteira Principal
 *         descricao: Carteira para transações diárias
 *         saldo_atual: 5000.00
 *         data_criacao: "2025-05-01T10:30:00Z"
 *
 *     AtualizarCarteira:
 *       type: object
 *       properties:
 *         nome:
 *           type: string
 *           description: Novo nome da carteira
 *         descricao:
 *           type: string
 *           description: Nova descrição da carteira
 *       example:
 *         nome: Carteira Atualizada
 *         descricao: Nova descrição da carteira principal
 */
/**
 * @swagger
 * /wallet/current:
 *   get:
 *     summary: Obtém a carteira principal do usuário autenticado
 *     tags: [Carteiras] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dados da carteira principal
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Carteira'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Carteira não encontrada
 */
/**
 * @swagger
 * /wallet/{id}:
 *   get:
 *     summary: Obtém uma carteira específica pelo ID
 *     tags: [Carteiras] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da carteira
 *     responses:
 *       200:
 *         description: Dados da carteira
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Carteira'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Carteira não encontrada
 *       403:
 *         description: Acesso negado (não é proprietário da carteira)
 *
 *   patch:
 *     summary: Atualiza uma carteira específica pelo ID
 *     tags: [Carteiras] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da carteira
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AtualizarCarteira'
 *     responses:
 *       200:
 *         description: Carteira atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Carteira'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Carteira não encontrada
 *       403:
 *         description: Acesso negado (não é proprietário da carteira)
 *       400:
 *         description: Dados inválidos
 */ 
