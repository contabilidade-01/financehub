"use strict";
/**
 * @swagger
 * tags:
 *   name: Lembretes
 *   description: Gerenciamento de lembretes do usuário
 *
 * components:
 *   schemas:
 *     Reminder:
 *       type: object
 *       required:
 *         - id
 *         - usuario_id
 *         - titulo
 *         - data_lembrete
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único do lembrete
 *         usuario_id:
 *           type: integer
 *           description: ID do usuário que criou o lembrete
 *         titulo:
 *           type: string
 *           description: Título do lembrete
 *         descricao:
 *           type: string
 *           nullable: true
 *           description: Descrição detalhada do lembrete (opcional)
 *         data_lembrete:
 *           type: string
 *           format: date-time
 *           description: Data e hora do lembrete
 *         data_criacao:
 *           type: string
 *           format: date-time
 *           description: Data e hora de criação do lembrete
 *         concluido:
 *           type: boolean
 *           description: Indica se o lembrete foi concluído
 *           default: false
 *       example:
 *         id: 1
 *         usuario_id: 2
 *         titulo: "Reunião de equipe"
 *         descricao: "Discutir os novos projetos"
 *         data_lembrete: "2025-06-15T14:30:00Z"
 *         data_criacao: "2025-05-16T10:00:00Z"
 *         concluido: false
 *
 * paths:
 *   /api/reminders:
 *     get:
 *       summary: Obtém todos os lembretes do usuário atual
 *       description: Retorna todos os lembretes cadastrados pelo usuário autenticado
 *       tags: [Lembretes] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *         - apiKeyAuth: []
 *       responses:
 *         200:
 *           description: Lista de lembretes do usuário
 *           content:
 *             application/json:
 *               schema:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Reminder'
 *         401:
 *           description: Não autenticado
 *         500:
 *           description: Erro no servidor
 *     post:
 *       summary: Cria um novo lembrete
 *       description: Cria um novo lembrete para o usuário autenticado
 *       tags: [Lembretes] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *         - apiKeyAuth: []
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - titulo
 *                 - data_lembrete
 *               properties:
 *                 titulo:
 *                   type: string
 *                   description: Título do lembrete
 *                   example: "Reunião de equipe"
 *                 descricao:
 *                   type: string
 *                   description: Descrição detalhada do lembrete (opcional)
 *                   example: "Discutir os novos projetos"
 *                 data_lembrete:
 *                   type: string
 *                   format: date-time
 *                   description: Data e hora do lembrete (formato ISO)
 *                   example: "2025-06-15T14:30:00Z"
 *                 concluido:
 *                   type: boolean
 *                   description: Indica se o lembrete foi concluído (opcional)
 *                   default: false
 *       responses:
 *         201:
 *           description: Lembrete criado com sucesso
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/Reminder'
 *         400:
 *           description: Dados inválidos
 *         401:
 *           description: Não autenticado
 *         500:
 *           description: Erro no servidor
 *
 *   /api/reminders/{id}:
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do lembrete
 *     get:
 *       summary: Obtém um lembrete específico
 *       description: Retorna um lembrete específico do usuário autenticado
 *       tags: [Lembretes] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *         - apiKeyAuth: []
 *       responses:
 *         200:
 *           description: Detalhes do lembrete
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/Reminder'
 *         401:
 *           description: Não autenticado
 *         403:
 *           description: Acesso negado
 *         404:
 *           description: Lembrete não encontrado
 *         500:
 *           description: Erro no servidor
 *     put:
 *       summary: Atualiza um lembrete existente
 *       description: Atualiza um lembrete específico pertencente ao usuário autenticado
 *       tags: [Lembretes] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *         - apiKeyAuth: []
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 titulo:
 *                   type: string
 *                   description: Título do lembrete
 *                 descricao:
 *                   type: string
 *                   description: Descrição detalhada do lembrete
 *                 data_lembrete:
 *                   type: string
 *                   format: date-time
 *                   description: Data e hora do lembrete (formato ISO)
 *                 concluido:
 *                   type: boolean
 *                   description: Indica se o lembrete foi concluído
 *       responses:
 *         200:
 *           description: Lembrete atualizado com sucesso
 *           content:
 *             application/json:
 *               schema:
 *                 $ref: '#/components/schemas/Reminder'
 *         400:
 *           description: Dados inválidos ou ID inválido
 *         401:
 *           description: Não autenticado
 *         403:
 *           description: Acesso negado - o lembrete não pertence ao usuário
 *         404:
 *           description: Lembrete não encontrado
 *         500:
 *           description: Erro no servidor
 *     delete:
 *       summary: Exclui um lembrete existente
 *       description: Exclui um lembrete específico pertencente ao usuário autenticado
 *       tags: [Lembretes] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *         - apiKeyAuth: []
 *       responses:
 *         204:
 *           description: Lembrete excluído com sucesso
 *         400:
 *           description: ID inválido
 *         401:
 *           description: Não autenticado
 *         403:
 *           description: Acesso negado - o lembrete não pertence ao usuário
 *         404:
 *           description: Lembrete não encontrado
 *         500:
 *           description: Erro no servidor
 *
 *   /api/reminders/range:
 *     get:
 *       summary: Obtém lembretes em um intervalo de datas
 *       description: Retorna todos os lembretes do usuário dentro do intervalo de datas especificado
 *       tags: [Lembretes] *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *         - apiKeyAuth: []
 *       parameters:
 *         - in: query
 *           name: start_date
 *           required: true
 *           schema:
 *             type: string
 *             format: date-time
 *           description: Data de início do intervalo (formato ISO)
 *         - in: query
 *           name: end_date
 *           required: true
 *           schema:
 *             type: string
 *             format: date-time
 *           description: Data de fim do intervalo (formato ISO)
 *       responses:
 *         200:
 *           description: Lista de lembretes no intervalo especificado
 *           content:
 *             application/json:
 *               schema:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Reminder'
 *         400:
 *           description: Parâmetros de consulta inválidos
 *         401:
 *           description: Não autenticado
 *         500:
 *           description: Erro no servidor
 */ 
