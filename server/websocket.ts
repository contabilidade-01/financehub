import { WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'
import { storage } from './storage.js'

// Interface para conexões ativas
interface ActiveConnection {
  ws: WebSocket
  userId: string
  userRole: string
  userName: string
  connectedAt: Date
  lastPing: Date
}

// Mapa de conexões ativas por usuário ID
const activeConnections = new Map<string, ActiveConnection>()

// Interface para notificações
interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: string
  autoClose?: number
  persistent?: boolean
  from?: {
    id: string
    name: string
    role: string
  }
  broadcast?: boolean
  test?: boolean
}

let wss: WebSocketServer | null = null

type SessionParser = (req: any, res: any, next: (err?: any) => void) => void
let sessionParser: SessionParser | null = null

/** Registrado em server/index.ts com o mesmo middleware de sessão do Express. */
export const setWebSocketSessionParser = (parser: SessionParser) => {
  sessionParser = parser
}

/**
 * Validar sessão do usuário pelo cookie de sessão (express-session).
 * O parâmetro ?token= da URL é ignorado: não é prova de identidade.
 */
const validateUserSession = async (req: IncomingMessage): Promise<{ user: any; isValid: boolean; error?: string }> => {
  try {
    if (!sessionParser) {
      return { user: null, isValid: false, error: 'Sessão indisponível' }
    }
    await new Promise<void>((resolve, reject) =>
      sessionParser!(req, {}, (err?: any) => (err ? reject(err) : resolve())),
    )
    const session = (req as any).session
    const userId = session?.isImpersonating && session?.user?.id ? session.user.id : session?.userId

    if (!userId) {
      return { user: null, isValid: false, error: 'Não autenticado' }
    }

    const user = await storage.getUserById(Number(userId))
    if (!user) {
      return { user: null, isValid: false, error: 'Usuário não encontrado' }
    }

    return { user, isValid: true }
  } catch (error) {
    console.error('[WebSocket] Erro na validação da sessão:', error)
    return { user: null, isValid: false, error: 'Erro interno na validação' }
  }
}

/**
 * Inicializar o servidor WebSocket
 */
export const initializeWebSocketServer = (server: any) => {
  wss = new WebSocketServer({ 
    server,
    path: '/ws',
    clientTracking: true
  })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WebSocket] Nova conexão recebida')

    // Validar sessão do usuário
    const { user, isValid, error } = await validateUserSession(req)
    
    if (!isValid || !user) {
      console.log(`[WebSocket] ❌ Conexão rejeitada - ${error}`)
      ws.close(1008, `Acesso negado: ${error}`)
      return
    }

    console.log(`[WebSocket] ✅ Usuário autenticado: ${user.nome} (${user.tipo_usuario})`)

    // Criar conexão ativa
    const connection: ActiveConnection = {
      ws,
      userId: user.id.toString(),
      userRole: user.tipo_usuario,
      userName: user.nome,
      connectedAt: new Date(),
      lastPing: new Date()
    }

    // Adicionar à lista de conexões ativas
    activeConnections.set(user.id.toString(), connection)

    console.log(`[WebSocket] Usuário conectado: ${user.nome} (${user.tipo_usuario}) - Total: ${activeConnections.size}`)

    // Enviar mensagem de confirmação
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'Conectado ao sistema de notificações',
      timestamp: new Date().toISOString(),
      connectionId: user.id.toString()
    }))

    // Handlers de eventos do WebSocket
    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data.toString())
        handleWebSocketMessage(connection, message)
      } catch (error) {
        console.error('[WebSocket] Erro ao processar mensagem:', error)
      }
    })

    ws.on('pong', () => {
      connection.lastPing = new Date()
    })

    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Usuário desconectado: ${user.nome} (${code}: ${reason})`)
      activeConnections.delete(user.id.toString())
    })

    ws.on('error', (error) => {
      console.error(`[WebSocket] Erro na conexão de ${user.nome}:`, error)
      activeConnections.delete(user.id.toString())
    })
  })

  // Ping periódico para manter conexões vivas
  const pingInterval = setInterval(() => {
    const now = new Date()
    const timeout = 30000 // 30 segundos

    activeConnections.forEach((connection, userId) => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        // Verificar se a conexão está ativa
        if (now.getTime() - connection.lastPing.getTime() > timeout) {
          console.log(`[WebSocket] Timeout para usuário ${connection.userName}`)
          connection.ws.terminate()
          activeConnections.delete(userId)
        } else {
          // Enviar ping
          connection.ws.ping()
        }
      } else {
        // Remover conexões mortas
        activeConnections.delete(userId)
      }
    })
  }, 15000) // Verificar a cada 15 segundos

  wss.on('close', () => {
    clearInterval(pingInterval)
  })

  console.log('[WebSocket] Servidor WebSocket inicializado na rota /ws')
}

/**
 * Processar mensagens recebidas via WebSocket
 */
const handleWebSocketMessage = (connection: ActiveConnection, message: any) => {
  switch (message.type) {
    case 'ping':
      connection.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }))
      break

    case 'notification_read':
      console.log(`[WebSocket] Notificação ${message.notificationId} marcada como lida por ${connection.userName}`)
      break

    default:
      console.log(`[WebSocket] Mensagem não reconhecida de ${connection.userName}:`, message.type)
  }
}

/**
 * Enviar notificação para usuários específicos
 */
export const broadcastNotification = (notification: Notification, targetUserIds: string[] = []) => {
  console.log('[WebSocket] 🚀 INÍCIO broadcastNotification - versão com correção')
  console.log('[WebSocket] broadcastNotification chamada com:', {
    notificationId: notification.id,
    targetUserIds,
    activeConnections: activeConnections.size
  })
  
  // Log das conexões ativas para debug
  console.log('[WebSocket] 🔍 Listando conexões ativas:')
  if (activeConnections.size === 0) {
    console.log('[WebSocket] ❌ NENHUMA CONEXÃO ATIVA!')
  } else {
    activeConnections.forEach((connection, userId) => {
      console.log(`[WebSocket]   - UserId: "${userId}" (${typeof userId}) -> ${connection.userName} (${connection.userRole})`)
    })
  }
  
  if (!wss) {
    console.error('[WebSocket] Servidor WebSocket não inicializado')
    return false
  }

  let sentCount = 0

  // Se não há usuários específicos, enviar para todos os usuários conectados
  if (targetUserIds.length === 0) {
    console.log('[WebSocket] Enviando para todos os usuários conectados')
    activeConnections.forEach((connection) => {
      console.log(`[WebSocket] Verificando conexão: ${connection.userName} (${connection.userRole})`)
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          console.log(`[WebSocket] Enviando notificação para ${connection.userName}`)
          connection.ws.send(JSON.stringify({
            type: 'notification',
            data: notification
          }))
          sentCount++
        } catch (error) {
          console.error(`[WebSocket] Erro ao enviar para ${connection.userName}:`, error)
        }
      }
    })
  } else {
    // Enviar para usuários específicos
    console.log('[WebSocket] Enviando para usuários específicos:', targetUserIds)
    targetUserIds.forEach((userId) => {
      // Converter para string se for número
      const userIdString = userId.toString()
      const connection = activeConnections.get(userIdString)
      console.log(`[WebSocket] Procurando usuário ${userId} (como string: ${userIdString}):`, connection ? 'encontrado' : 'não encontrado')
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          console.log(`[WebSocket] Enviando notificação para usuário ${userIdString} (${connection.userName})`)
          connection.ws.send(JSON.stringify({
            type: 'notification',
            data: notification
          }))
          sentCount++
        } catch (error) {
          console.error(`[WebSocket] Erro ao enviar para usuário ${userIdString}:`, error)
        }
      }
    })
  }

  console.log(`[WebSocket] Notificação enviada para ${sentCount} conexões ativas`)
  return sentCount > 0
}

/**
 * Enviar notificação para todos os usuários de uma role específica
 */
export const broadcastToRole = (notification: Notification, role: string) => {
  if (!wss) {
    console.error('[WebSocket] Servidor WebSocket não inicializado')
    return false
  }

  let sentCount = 0

  activeConnections.forEach((connection) => {
    if (connection.userRole === role && connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify({
          type: 'notification',
          data: notification
        }))
        sentCount++
      } catch (error) {
        console.error(`[WebSocket] Erro ao enviar para ${connection.userName}:`, error)
      }
    }
  })

  console.log(`[WebSocket] Notificação enviada para ${sentCount} usuários com role '${role}'`)
  return sentCount > 0
}

/**
 * Obter estatísticas das conexões ativas
 */
export const getConnectionStats = () => {
  const stats = {
    totalConnections: activeConnections.size,
    connectionsByRole: {} as Record<string, number>,
    connections: [] as Array<{
      userId: string
      userName: string
      userRole: string
      connectedAt: string
      lastPing: string
    }>
  }

  activeConnections.forEach((connection) => {
    // Contar por role
    stats.connectionsByRole[connection.userRole] = (stats.connectionsByRole[connection.userRole] || 0) + 1

    // Adicionar detalhes da conexão
    stats.connections.push({
      userId: connection.userId,
      userName: connection.userName,
      userRole: connection.userRole,
      connectedAt: connection.connectedAt.toISOString(),
      lastPing: connection.lastPing.toISOString()
    })
  })

  return stats
}

/**
 * Fechar conexão de um usuário específico
 */
export const disconnectUser = (userId: string, reason: string = 'Desconectado pelo servidor') => {
  const connection = activeConnections.get(userId)
  if (connection) {
    connection.ws.close(1000, reason)
    activeConnections.delete(userId)
    console.log(`[WebSocket] Usuário ${connection.userName} desconectado: ${reason}`)
    return true
  }
  return false
}

/**
 * Verificar se um usuário está conectado
 */
export const isUserConnected = (userId: string): boolean => {
  const connection = activeConnections.get(userId)
  return connection ? connection.ws.readyState === WebSocket.OPEN : false
}