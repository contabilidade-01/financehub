"use strict";
/**
 * @swagger
 * tags:
 *   name: Transações
 *   description: API para gerenciamento de transações financeiras
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     MetodoPagamento:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID do método de pagamento
 *         nome:
 *           type: string
 *           description: Nome do método de pagamento
 *         descricao:
 *           type: string
 *           description: Descrição do método
 *         icone:
 *           type: string
 *           description: Ícone do método
 *         cor:
 *           type: string
 *           description: Cor associada ao método
 *         global:
 *           type: boolean
 *           description: Se é um método global (disponível para todos)
 *         ativo:
 *           type: boolean
 *           description: Se o método está ativo
 *       example:
 *         id: 1
 *         nome: PIX
 *         descricao: Transferências instantâneas via PIX
 *         icone: Smartphone
 *         cor: "#10B981"
 *         global: true
 *         ativo: true
 *     Transacao:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID da transação
 *         descricao:
 *           type: string
 *           description: Descrição da transação
 *         valor:
 *           type: number
 *           format: decimal
 *           description: Valor da transação
 *         tipo:
 *           type: string
 *           enum: [Despesa, Receita]
 *           description: Tipo da transação (Despesa ou Receita)
 *         categoria_id:
 *           type: integer
 *           description: ID da categoria da transação
 *         forma_pagamento_id:
 *           type: integer
 *           description: ID do método de pagamento (PIX=1, Cartão de Crédito=2, Dinheiro=3)
 *         data_transacao:
 *           type: string
 *           format: date
 *           description: Data da transação
 *         status:
 *           type: string
 *           enum: [Efetivada, Pendente, Agendada, Cancelada]
 *           description: Status da transação
 *         carteira_id:
 *           type: integer
 *           description: ID da carteira associada à transação
 *         data_registro:
 *           type: string
 *           format: date-time
 *           description: Data de registro no sistema
 *       example:
 *         id: 1
 *         descricao: Supermercado Mensal
 *         valor: 250.75
 *         tipo: Despesa
 *         categoria_id: 3
 *         data_transacao: "2025-05-10"
 *         status: Efetivada
 *         carteira_id: 1
 *         data_registro: "2025-05-10T15:30:00Z"
 *
 *     NovaTransacao:
 *       type: object
 *       required:
 *         - descricao
 *         - valor
 *         - tipo
 *         - categoria_id
 *         - data_transacao
 *       properties:
 *         descricao:
 *           type: string
 *           description: Descrição da transação (obrigatório)
 *           example: "Almoço no restaurante"
 *         valor:
 *           type: number
 *           format: decimal
 *           description: Valor da transação (obrigatório)
 *           example: 45.90
 *         tipo:
 *           type: string
 *           enum: [Despesa, Receita]
 *           description: Tipo da transação (obrigatório)
 *           example: "Despesa"
 *         categoria_id:
 *           type: integer
 *           description: ID da categoria (obrigatório)
 *           example: 3
 *         forma_pagamento_id:
 *           type: integer
 *           description: |
 *             ID do método de pagamento (OPCIONAL)
 *
 *             Se não informado ou 0, será automaticamente atribuído PIX (ID: 1)
 *
 *             Métodos disponíveis:
 *             - PIX: 1 (padrão)
 *             - Cartão de Crédito: 2
 *             - Dinheiro: 3
 *             - Cartão de Débito: 4
 *             - Transferência: 5
 *             - Boleto: 6
 *           example: 1
 *         data_transacao:
 *           type: string
 *           format: date
 *           description: Data da transação no formato YYYY-MM-DD (obrigatório)
 *           example: "2025-01-15"
 *         status:
 *           type: string
 *           enum: [Efetivada, Pendente, Agendada, Cancelada]
 *           default: Efetivada
 *           description: Status da transação (OPCIONAL - padrão: Efetivada)
 *           example: "Efetivada"
 *         carteira_id:
 *           type: integer
 *           description: |
 *             ID da carteira (OPCIONAL)
 *
 *             Se não informado, será automaticamente atribuída a carteira do usuário logado
 *           example: 1
 *       example:
 *         descricao: "Almoço Executivo"
 *         valor: 45.90
 *         tipo: "Despesa"
 *         categoria_id: 3
 *         forma_pagamento_id: 1
 *         data_transacao: "2025-01-15"
 *         status: "Efetivada"
 *         carteira_id: 1
 *
 *     NovaTransacaoMinima:
 *       type: object
 *       description: Exemplo com apenas campos obrigatórios (PIX e carteira serão atribuídos automaticamente)
 *       required:
 *         - descricao
 *         - valor
 *         - tipo
 *         - categoria_id
 *         - data_transacao
 *       properties:
 *         descricao:
 *           type: string
 *           example: "Compras no supermercado"
 *         valor:
 *           type: number
 *           format: decimal
 *           example: 125.50
 *         tipo:
 *           type: string
 *           enum: [Despesa, Receita]
 *           example: "Despesa"
 *         categoria_id:
 *           type: integer
 *           example: 1
 *         data_transacao:
 *           type: string
 *           format: date
 *           example: "2025-01-15"
 *       example:
 *         descricao: "Compras no supermercado"
 *         valor: 125.50
 *         tipo: "Despesa"
 *         categoria_id: 1
 *         data_transacao: "2025-01-15"
 */
/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Obtém todas as transações da carteira atual
 *     tags: [Transações] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de transações
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transacao'
 *       401:
 *         description: Não autenticado
 *
 *   post:
 *     summary: Cria uma nova transação
 *     description: |
 *       Cria uma nova transação financeira.
 *
 *       **Método de Pagamento**: Se `forma_pagamento_id` não for informado ou for 0, será automaticamente atribuído PIX como padrão.
 *
 *       **Métodos de Pagamento Globais Disponíveis**:
 *       - PIX (ID: 1) - Padrão
 *       - Cartão de Crédito (ID: 2)
 *       - Dinheiro (ID: 3)
 *     tags: [Transações]
 *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovaTransacao'
 *           examples:
 *             completo:
 *               summary: "Exemplo com todos os campos"
 *               description: "Transação com todos os campos preenchidos (opcionais e obrigatórios)"
 *               value:
 *                 descricao: "Almoço Executivo"
 *                 valor: 45.90
 *                 tipo: "Despesa"
 *                 categoria_id: 3
 *                 data_transacao: "2025-01-15"
 *                 forma_pagamento_id: 1
 *                 status: "Efetivada"
 *                 carteira_id: 1
 *             minimo:
 *               summary: "Exemplo apenas campos obrigatórios"
 *               description: "PIX e carteira do usuário serão atribuídos automaticamente"
 *               value:
 *                 descricao: "Compras no supermercado"
 *                 valor: 125.50
 *                 tipo: "Despesa"
 *                 categoria_id: 1
 *                 data_transacao: "2025-01-15"
 *     responses:
 *       201:
 *         description: Transação criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transacao'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Categoria não encontrada
 */
/**
 * @swagger
 * /transactions/recent:
 *   get:
 *     summary: Obtém as transações recentes da carteira atual
 *     tags: [Transações] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de transações recentes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transacao'
 *       401:
 *         description: Não autenticado
 */
/**
 * @swagger
 * /transactions/{id}:
 *   get:
 *     summary: Obtém uma transação específica
 *     tags: [Transações] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da transação
 *     responses:
 *       200:
 *         description: Dados da transação
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transacao'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Transação não encontrada
 *       403:
 *         description: Acesso negado (transação de outra carteira)
 *
 *   patch:
 *     summary: Atualiza uma transação
 *     tags: [Transações] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da transação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovaTransacao'
 *     responses:
 *       200:
 *         description: Transação atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transacao'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (transação de outra carteira)
 *       404:
 *         description: Transação não encontrada
 *
 *   delete:
 *     summary: Remove uma transação
 *     tags: [Transações] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da transação
 *     responses:
 *       200:
 *         description: Transação removida com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado (transação de outra carteira)
 *       404:
 *         description: Transação não encontrada
 */ 
