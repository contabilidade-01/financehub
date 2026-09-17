"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserConnected = exports.disconnectUser = exports.getConnectionStats = exports.broadcastToRole = exports.broadcastNotification = exports.initializeWebSocketServer = void 0;
const ws_1 = require("ws");
const url_1 = require("url");
const storage_js_1 = require("./storage.js");
// Mapa de conexões ativas por usuário ID
const activeConnections = new Map();
let wss = null;
/**
 * Validar sessão do usuário usando validação interna de sessão
 */
const validateUserSession = async (req) => {
    try {
        // Extrair token do query parameter
        const parsedUrl = (0, url_1.parse)(req.url || '', true);
        const { token } = parsedUrl.query;
        if (!token) {
            return { user: null, isValid: false, error: 'Token não fornecido' };
        }
        const userId = parseInt(token);
        console.log('[WebSocket] Validando sessão diretamente para userId:', userId);
        if (isNaN(userId)) {
            return { user: null, isValid: false, error: 'User ID inválido' };
        }
        // Validar diretamente no banco de dados
        const user = await storage_js_1.storage.getUserById(userId);
        if (!user) {
            console.log('[WebSocket] Usuário não encontrado no banco:', userId);
            return { user: null, isValid: false, error: 'Usuário não encontrado' };
        }
        console.log('[WebSocket] ✅ Sessão válida para usuário:', user.nome, `(${user.tipo_usuario})`);
        console.log('[WebSocket] User ID:', user.id);
        return { user, isValid: true };
    }
    catch (error) {
        console.error('[WebSocket] Erro na validação da sessão:', error);
        return { user: null, isValid: false, error: 'Erro interno na validação' };
    }
};
/**
 * Inicializar o servidor WebSocket
 */
const initializeWebSocketServer = (server) => {
    wss = new ws_1.WebSocketServer({
        server,
        path: '/ws',
        clientTracking: true
    });
    wss.on('connection', async (ws, req) => {
        console.log('[WebSocket] Nova conexão recebida');
        // Validar sessão do usuário
        const { user, isValid, error } = await validateUserSession(req);
        if (!isValid || !user) {
            console.log(`[WebSocket] ❌ Conexão rejeitada - ${error}`);
            ws.close(1008, `Acesso negado: ${error}`);
            return;
        }
        console.log(`[WebSocket] ✅ Usuário autenticado: ${user.nome} (${user.tipo_usuario})`);
        // Criar conexão ativa
        const connection = {
            ws,
            userId: user.id.toString(),
            userRole: user.tipo_usuario,
            userName: user.nome,
            connectedAt: new Date(),
            lastPing: new Date()
        };
        // Adicionar à lista de conexões ativas
        activeConnections.set(user.id.toString(), connection);
        console.log(`[WebSocket] Usuário conectado: ${user.nome} (${user.tipo_usuario}) - Total: ${activeConnections.size}`);
        // Enviar mensagem de confirmação
        ws.send(JSON.stringify({
            type: 'connection_established',
            message: 'Conectado ao sistema de notificações',
            timestamp: new Date().toISOString(),
            connectionId: user.id.toString()
        }));
        // Handlers de eventos do WebSocket
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleWebSocketMessage(connection, message);
            }
            catch (error) {
                console.error('[WebSocket] Erro ao processar mensagem:', error);
            }
        });
        ws.on('pong', () => {
            connection.lastPing = new Date();
        });
        ws.on('close', (code, reason) => {
            console.log(`[WebSocket] Usuário desconectado: ${user.nome} (${code}: ${reason})`);
            activeConnections.delete(user.id.toString());
        });
        ws.on('error', (error) => {
            console.error(`[WebSocket] Erro na conexão de ${user.nome}:`, error);
            activeConnections.delete(user.id.toString());
        });
    });
    // Ping periódico para manter conexões vivas
    const pingInterval = setInterval(() => {
        const now = new Date();
        const timeout = 30000; // 30 segundos
        activeConnections.forEach((connection, userId) => {
            if (connection.ws.readyState === ws_1.WebSocket.OPEN) {
                // Verificar se a conexão está ativa
                if (now.getTime() - connection.lastPing.getTime() > timeout) {
                    console.log(`[WebSocket] Timeout para usuário ${connection.userName}`);
                    connection.ws.terminate();
                    activeConnections.delete(userId);
                }
                else {
                    // Enviar ping
                    connection.ws.ping();
                }
            }
            else {
                // Remover conexões mortas
                activeConnections.delete(userId);
            }
        });
    }, 15000); // Verificar a cada 15 segundos
    wss.on('close', () => {
        clearInterval(pingInterval);
    });
    console.log('[WebSocket] Servidor WebSocket inicializado na rota /ws');
};
exports.initializeWebSocketServer = initializeWebSocketServer;
/**
 * Processar mensagens recebidas via WebSocket
 */
const handleWebSocketMessage = (connection, message) => {
    switch (message.type) {
        case 'ping':
            connection.ws.send(JSON.stringify({
                type: 'pong',
                timestamp: new Date().toISOString()
            }));
            break;
        case 'notification_read':
            console.log(`[WebSocket] Notificação ${message.notificationId} marcada como lida por ${connection.userName}`);
            break;
        default:
            console.log(`[WebSocket] Mensagem não reconhecida de ${connection.userName}:`, message.type);
    }
};
/**
 * Enviar notificação para usuários específicos
 */
const broadcastNotification = (notification, targetUserIds = []) => {
    console.log('[WebSocket] 🚀 INÍCIO broadcastNotification - versão com correção');
    console.log('[WebSocket] broadcastNotification chamada com:', {
        notificationId: notification.id,
        targetUserIds,
        activeConnections: activeConnections.size
    });
    // Log das conexões ativas para debug
    console.log('[WebSocket] 🔍 Listando conexões ativas:');
    if (activeConnections.size === 0) {
        console.log('[WebSocket] ❌ NENHUMA CONEXÃO ATIVA!');
    }
    else {
        activeConnections.forEach((connection, userId) => {
            console.log(`[WebSocket]   - UserId: "${userId}" (${typeof userId}) -> ${connection.userName} (${connection.userRole})`);
        });
    }
    if (!wss) {
        console.error('[WebSocket] Servidor WebSocket não inicializado');
        return false;
    }
    let sentCount = 0;
    // Se não há usuários específicos, enviar para todos os usuários conectados
    if (targetUserIds.length === 0) {
        console.log('[WebSocket] Enviando para todos os usuários conectados');
        activeConnections.forEach((connection) => {
            console.log(`[WebSocket] Verificando conexão: ${connection.userName} (${connection.userRole})`);
            if (connection.ws.readyState === ws_1.WebSocket.OPEN) {
                try {
                    console.log(`[WebSocket] Enviando notificação para ${connection.userName}`);
                    connection.ws.send(JSON.stringify({
                        type: 'notification',
                        data: notification
                    }));
                    sentCount++;
                }
                catch (error) {
                    console.error(`[WebSocket] Erro ao enviar para ${connection.userName}:`, error);
                }
            }
        });
    }
    else {
        // Enviar para usuários específicos
        console.log('[WebSocket] Enviando para usuários específicos:', targetUserIds);
        targetUserIds.forEach((userId) => {
            // Converter para string se for número
            const userIdString = userId.toString();
            const connection = activeConnections.get(userIdString);
            console.log(`[WebSocket] Procurando usuário ${userId} (como string: ${userIdString}):`, connection ? 'encontrado' : 'não encontrado');
            if (connection && connection.ws.readyState === ws_1.WebSocket.OPEN) {
                try {
                    console.log(`[WebSocket] Enviando notificação para usuário ${userIdString} (${connection.userName})`);
                    connection.ws.send(JSON.stringify({
                        type: 'notification',
                        data: notification
                    }));
                    sentCount++;
                }
                catch (error) {
                    console.error(`[WebSocket] Erro ao enviar para usuário ${userIdString}:`, error);
                }
            }
        });
    }
    console.log(`[WebSocket] Notificação enviada para ${sentCount} conexões ativas`);
    return sentCount > 0;
};
exports.broadcastNotification = broadcastNotification;
/**
 * Enviar notificação para todos os usuários de uma role específica
 */
const broadcastToRole = (notification, role) => {
    if (!wss) {
        console.error('[WebSocket] Servidor WebSocket não inicializado');
        return false;
    }
    let sentCount = 0;
    activeConnections.forEach((connection) => {
        if (connection.userRole === role && connection.ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                connection.ws.send(JSON.stringify({
                    type: 'notification',
                    data: notification
                }));
                sentCount++;
            }
            catch (error) {
                console.error(`[WebSocket] Erro ao enviar para ${connection.userName}:`, error);
            }
        }
    });
    console.log(`[WebSocket] Notificação enviada para ${sentCount} usuários com role '${role}'`);
    return sentCount > 0;
};
exports.broadcastToRole = broadcastToRole;
/**
 * Obter estatísticas das conexões ativas
 */
const getConnectionStats = () => {
    const stats = {
        totalConnections: activeConnections.size,
        connectionsByRole: {},
        connections: []
    };
    activeConnections.forEach((connection) => {
        // Contar por role
        stats.connectionsByRole[connection.userRole] = (stats.connectionsByRole[connection.userRole] || 0) + 1;
        // Adicionar detalhes da conexão
        stats.connections.push({
            userId: connection.userId,
            userName: connection.userName,
            userRole: connection.userRole,
            connectedAt: connection.connectedAt.toISOString(),
            lastPing: connection.lastPing.toISOString()
        });
    });
    return stats;
};
exports.getConnectionStats = getConnectionStats;
/**
 * Fechar conexão de um usuário específico
 */
const disconnectUser = (userId, reason = 'Desconectado pelo servidor') => {
    const connection = activeConnections.get(userId);
    if (connection) {
        connection.ws.close(1000, reason);
        activeConnections.delete(userId);
        console.log(`[WebSocket] Usuário ${connection.userName} desconectado: ${reason}`);
        return true;
    }
    return false;
};
exports.disconnectUser = disconnectUser;
/**
 * Verificar se um usuário está conectado
 */
const isUserConnected = (userId) => {
    const connection = activeConnections.get(userId);
    return connection ? connection.ws.readyState === ws_1.WebSocket.OPEN : false;
};
exports.isUserConnected = isUserConnected;
