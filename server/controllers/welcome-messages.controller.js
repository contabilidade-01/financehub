"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProcessedWelcomeMessage = exports.createWelcomeMessage = exports.updateWelcomeMessage = exports.getWelcomeMessageByType = exports.getWelcomeMessages = void 0;
const postgres_1 = __importDefault(require("postgres"));
const storage_1 = require("../storage");
const notification_service_1 = require("../services/notification.service");
// Configuração da conexão
const getClient = () => (0, postgres_1.default)(process.env.DATABASE_URL || '', { prepare: false });
// Buscar todas as mensagens de boas vindas
const getWelcomeMessages = async (req, res) => {
    const client = getClient();
    try {
        const result = await client `
      SELECT * FROM welcome_messages 
      ORDER BY type
    `;
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.getWelcomeMessages = getWelcomeMessages;
/**
 * @swagger
 * /api/admin/welcome-messages/{type}:
 *   get:
 *     summary: Buscar mensagem de boas-vindas por tipo
 *     description: Retorna uma mensagem de boas-vindas. Se o parâmetro userId for fornecido, processa todas as tags incluindo {link_pagamento}.
 *     tags: [Welcome Messages]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [welcome, activation, pre_activation]
 *         description: Tipo da mensagem
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: integer
 *         description: ID do usuário para processar tags personalizadas
 *         example: 123
 *     responses:
 *       200:
 *         description: Mensagem encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     type:
 *                       type: string
 *                     title:
 *                       type: string
 *                       description: Título da mensagem (tags processadas se userId fornecido)
 *                     message:
 *                       type: string
 *                       description: Conteúdo da mensagem (tags processadas se userId fornecido)
 *                     email_content:
 *                       type: string
 *       404:
 *         description: Mensagem não encontrada
 */
// Buscar mensagem específica por tipo
const getWelcomeMessageByType = async (req, res) => {
    const client = getClient();
    try {
        const { type } = req.params;
        const { userId } = req.query; // Parâmetro opcional para processar tags
        const result = await client `
      SELECT * FROM welcome_messages
      WHERE type = ${type}
    `;
        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mensagem não encontrada'
            });
        }
        let message = result[0];
        // Se userId foi fornecido, processar tags
        if (userId) {
            const user = await storage_1.storage.getUserById(parseInt(userId));
            if (user) {
                const notificationService = (0, notification_service_1.getNotificationService)();
                message = Object.assign(Object.assign({}, message), { title: notificationService.processMessageTags(message.title, user), message: notificationService.processMessageTags(message.message, user), email_content: notificationService.processMessageTags(message.email_content || message.message, user) });
            }
        }
        res.json({
            success: true,
            data: message
        });
    }
    catch (error) {
        console.error('Erro ao buscar mensagem:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.getWelcomeMessageByType = getWelcomeMessageByType;
// Atualizar ou criar mensagem de boas vindas (UPSERT)
const updateWelcomeMessage = async (req, res) => {
    const client = getClient();
    try {
        const { type } = req.params;
        const { title, message, email_content, payment_link, send_email_welcome, send_email_activation, show_dashboard_message } = req.body;
        // Validação básica
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Título e mensagem são obrigatórios'
            });
        }
        // UPSERT: Tenta fazer UPDATE, se não encontrar faz INSERT
        const result = await client `
      INSERT INTO welcome_messages (
        type, title, message, email_content, payment_link,
        send_email_welcome, send_email_activation, show_dashboard_message
      ) VALUES (
        ${type}, ${title}, ${message}, ${email_content || null}, 
        ${payment_link || null}, ${send_email_welcome || false}, 
        ${send_email_activation || false}, ${show_dashboard_message || false}
      )
      ON CONFLICT (type) DO UPDATE SET
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        email_content = EXCLUDED.email_content,
        payment_link = EXCLUDED.payment_link,
        send_email_welcome = EXCLUDED.send_email_welcome,
        send_email_activation = EXCLUDED.send_email_activation,
        show_dashboard_message = EXCLUDED.show_dashboard_message,
        updated_at = NOW()
      RETURNING *
    `;
        res.json({
            success: true,
            message: 'Mensagem salva com sucesso',
            data: result[0]
        });
    }
    catch (error) {
        console.error('Erro ao salvar mensagem:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.updateWelcomeMessage = updateWelcomeMessage;
// Criar nova mensagem de boas vindas
const createWelcomeMessage = async (req, res) => {
    const client = getClient();
    try {
        const { type, title, message, email_content, payment_link, send_email_welcome, send_email_activation, show_dashboard_message } = req.body;
        // Validação básica
        if (!type || !title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Tipo, título e mensagem são obrigatórios'
            });
        }
        const result = await client `
      INSERT INTO welcome_messages (
        type, title, message, email_content, payment_link,
        send_email_welcome, send_email_activation, show_dashboard_message
      ) VALUES (
        ${type}, ${title}, ${message}, ${email_content || null}, 
        ${payment_link || null}, ${send_email_welcome || false}, 
        ${send_email_activation || false}, ${show_dashboard_message || false}
      )
      RETURNING *
    `;
        res.status(201).json({
            success: true,
            message: 'Mensagem criada com sucesso',
            data: result[0]
        });
    }
    catch (error) {
        console.error('Erro ao criar mensagem:', error);
        // Tratar erro de tipo duplicado
        if (error instanceof Error && error.message.includes('unique constraint')) {
            return res.status(409).json({
                success: false,
                message: 'Já existe uma mensagem com este tipo'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.createWelcomeMessage = createWelcomeMessage;
/**
 * @swagger
 * /api/welcome-messages/{type}/user/{userId}:
 *   get:
 *     summary: Buscar mensagem processada para um usuário específico
 *     description: Retorna uma mensagem de boas-vindas com todas as tags substituídas pelos dados do usuário, incluindo {link_pagamento}. Este endpoint é público.
 *     tags: [Welcome Messages]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [welcome, activation, pre_activation]
 *         description: Tipo da mensagem
 *         example: welcome
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *         example: 123
 *     responses:
 *       200:
 *         description: Mensagem processada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                       example: "Bem-vindo, João!"
 *                     message:
 *                       type: string
 *                       example: "Olá João! Clique aqui: http://localhost:5000/checkout/plans?tokenaccess=ABC123"
 *                     email_content:
 *                       type: string
 *       404:
 *         description: Mensagem ou usuário não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
/**
 * Buscar mensagem de boas-vindas processada para um usuário específico
 * Processa todas as tags incluindo {link_pagamento}
 */
const getProcessedWelcomeMessage = async (req, res) => {
    const client = getClient();
    try {
        const { type, userId } = req.params;
        // Buscar mensagem do banco
        const messageResult = await client `
      SELECT * FROM welcome_messages
      WHERE type = ${type}
    `;
        if (messageResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mensagem não encontrada'
            });
        }
        // Buscar dados do usuário
        const user = await storage_1.storage.getUserById(parseInt(userId));
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        const message = messageResult[0];
        const notificationService = (0, notification_service_1.getNotificationService)();
        // Processar todas as tags na mensagem
        const processedMessage = Object.assign(Object.assign({}, message), { title: notificationService.processMessageTags(message.title, user), message: notificationService.processMessageTags(message.message, user), email_content: notificationService.processMessageTags(message.email_content || message.message, user) });
        res.json({
            success: true,
            data: processedMessage
        });
    }
    catch (error) {
        console.error('Erro ao buscar mensagem processada:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
    finally {
        await client.end();
    }
};
exports.getProcessedWelcomeMessage = getProcessedWelcomeMessage;
