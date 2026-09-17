"use strict";
/**
 * @swagger
 * tags:
 *   name: Categorias
 *   description: API para gerenciamento de categorias de transações
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     Categoria:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID da categoria
 *         nome:
 *           type: string
 *           description: Nome da categoria
 *         tipo:
 *           type: string
 *           enum: [Despesa, Receita]
 *           description: Tipo da categoria (Despesa ou Receita)
 *         descricao:
 *           type: string
 *           description: Descrição detalhada da categoria
 *         icone:
 *           type: string
 *           description: Nome do ícone associado à categoria
 *         cor:
 *           type: string
 *           description: Código de cor hexadecimal da categoria
 *         global:
 *           type: boolean
 *           description: Indica se é uma categoria global (disponível para todos) ou pessoal
 *         usuario_id:
 *           type: integer
 *           description: ID do usuário que criou a categoria (null para categorias globais)
 *       example:
 *         id: 1
 *         nome: Alimentação
 *         tipo: Despesa
 *         descricao: Gastos com alimentação
 *         icone: food
 *         cor: "#FF5722"
 *         global: false
 *         usuario_id: 2
 *
 *     NovaCategoria:
 *       type: object
 *       required:
 *         - nome
 *         - tipo
 *       properties:
 *         nome:
 *           type: string
 *           description: Nome da categoria
 *         tipo:
 *           type: string
 *           enum: [Despesa, Receita]
 *           description: Tipo da categoria
 *         descricao:
 *           type: string
 *           description: Descrição detalhada da categoria
 *         icone:
 *           type: string
 *           description: Nome do ícone
 *         cor:
 *           type: string
 *           description: Código de cor hexadecimal
 *       example:
 *         nome: Lazer
 *         tipo: Despesa
 *         descricao: Gastos com entretenimento e diversão
 *         icone: beach
 *         cor: "#9C27B0"
 */
/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Obtém todas as categorias disponíveis para o usuário
 *     tags: [Categorias] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de categorias
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Categoria'
 *       401:
 *         description: Não autenticado
 *
 *   post:
 *     summary: Cria uma nova categoria
 *     tags: [Categorias] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovaCategoria'
 *     responses:
 *       201:
 *         description: Categoria criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Categoria'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 */
/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Obtém uma categoria específica
 *     tags: [Categorias] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da categoria
 *     responses:
 *       200:
 *         description: Dados da categoria
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Categoria'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Categoria não encontrada
 *       403:
 *         description: Acesso negado (categoria pessoal de outro usuário)
 *
 *   patch:
 *     summary: Atualiza uma categoria
 *     tags: [Categorias] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da categoria
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovaCategoria'
 *     responses:
 *       200:
 *         description: Categoria atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Categoria'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (categoria global ou pertence a outro usuário)
 *       404:
 *         description: Categoria não encontrada
 *
 *   delete:
 *     summary: Remove uma categoria
 *     tags: [Categorias] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da categoria
 *     responses:
 *       200:
 *         description: Categoria removida com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (categoria global ou pertence a outro usuário)
 *       404:
 *         description: Categoria não encontrada
 */ 
