import { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db.js'
import { users } from "../../shared/schema"
import { broadcastNotification } from '../websocket.js'

// Schema para validação da notificação
const notificationSchema = z.object({
  type: z.enum(['info', 'warning', 'error', 'success']),
  title: z.string().min(1, 'Título é obrigatório'),
  message: z.string().min(1, 'Mensagem é obrigatória'),
  targetUser: z.string().optional(), // ID do usuário específico (opcional)
  targetRole: z.enum(['super_admin', 'admin', 'user']).optional(), // Role específica (opcional)
  autoClose: z.number().optional(), // Tempo em ms para fechar automaticamente
  persistent: z.boolean().optional().default(false), // Se deve persistir após refresh
})

/**
 * @swagger
 * /api/notifications/send:
 *   post:
 *     summary: Enviar notificação em tempo real
 *     tags: [Notifications]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - title
 *               - message
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [info, warning, error, success]
 *                 description: Tipo da notificação
 *               title:
 *                 type: string
 *                 description: Título da notificação
 *               message:
 *                 type: string
 *                 description: Mensagem da notificação
 *               targetUser:
 *                 type: string
 *                 description: ID do usuário específico (opcional)
 *               targetRole:
 *                 type: string
 *                 enum: [superadmin, admin, user]
 *                 description: Role específica para enviar (opcional)
 *               autoClose:
 *                 type: number
 *                 description: Tempo em ms para fechar automaticamente
 *               persistent:
 *                 type: boolean
 *                 description: Se deve persistir após refresh
 *     responses:
 *       200:
 *         description: Notificação enviada com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 */
export const sendNotification = async (req: Request, res: Response) => {
  try {
    // Verificar se o usuário é SuperAdmin
    if (req.user?.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas SuperAdmin pode enviar notificações.' })
    }

    // Validar dados da notificação
    const validatedData = notificationSchema.parse(req.body)

    // Criar objeto da notificação
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: validatedData.type,
      title: validatedData.title,
      message: validatedData.message,
      timestamp: new Date().toISOString(),
      autoClose: validatedData.autoClose,
      persistent: validatedData.persistent,
      from: {
        id: req.user.id,
        name: req.user.nome,
        role: req.user.tipo_usuario
      }
    }

    // Determinar destinatários
    let targetUsers: string[] = []

    if (validatedData.targetUser) {
      // Verificar se o usuário existe
      const user = await db.select().from(users).where(eq(users.id, validatedData.targetUser)).limit(1)
      if (user.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' })
      }
      targetUsers = [validatedData.targetUser]
    } else if (validatedData.targetRole) {
      // Buscar todos os usuários com a role específica
      const usersWithRole = await db.select({ id: users.id }).from(users).where(eq(users.tipo_usuario, validatedData.targetRole))
      targetUsers = usersWithRole.map(u => u.id)
    } else {
      // Enviar para todos os SuperAdmins conectados por padrão
      const superAdmins = await db.select({ id: users.id }).from(users).where(eq(users.tipo_usuario, 'super_admin'))
      targetUsers = superAdmins.map(u => u.id)
    }

    // Enviar notificação via WebSocket
    broadcastNotification(notification, targetUsers)

    // Log da notificação enviada
    console.log(`[NOTIFICATION] Enviada por ${req.user.nome} (${req.user.tipo_usuario}):`, {
      type: notification.type,
      title: notification.title,
      targets: targetUsers.length,
      targetRole: validatedData.targetRole,
      targetUser: validatedData.targetUser
    })

    res.json({
      success: true,
      message: 'Notificação enviada com sucesso',
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        timestamp: notification.timestamp,
        targetCount: targetUsers.length
      }
    })

  } catch (error) {
    console.error('Erro ao enviar notificação:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Dados inválidos', 
        details: error.errors 
      })
    }

    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

/**
 * @swagger
 * /api/notifications/broadcast:
 *   post:
 *     summary: Enviar notificação broadcast para todos os SuperAdmins
 *     tags: [Notifications]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - title
 *               - message
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [info, warning, error, success]
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               autoClose:
 *                 type: number
 *               persistent:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Broadcast enviado com sucesso
 */
export const broadcastNotificationToSuperAdmins = async (req: Request, res: Response) => {
  try {
    // Verificar se o usuário é SuperAdmin
    if (req.user?.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas SuperAdmin pode fazer broadcast.' })
    }

    // Validar dados básicos
    const { type, title, message, autoClose, persistent } = req.body

    if (!type || !title || !message) {
      return res.status(400).json({ error: 'Type, title e message são obrigatórios' })
    }

    // Buscar todos os SuperAdmins
    const superAdmins = await db.select({ id: users.id }).from(users).where(eq(users.tipo_usuario, 'super_admin'))

    const notification = {
      id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
      autoClose,
      persistent: persistent || false,
      from: {
        id: req.user.id,
        name: req.user.nome,
        role: req.user.tipo_usuario
      },
      broadcast: true
    }

    // Enviar para todos os SuperAdmins
    broadcastNotification(notification, superAdmins.map(u => u.id))

    console.log(`[BROADCAST] Enviado por ${req.user.nome} para ${superAdmins.length} SuperAdmins:`, {
      type: notification.type,
      title: notification.title
    })

    res.json({
      success: true,
      message: `Broadcast enviado para ${superAdmins.length} SuperAdmins`,
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        timestamp: notification.timestamp,
        targetCount: superAdmins.length
      }
    })

  } catch (error) {
    console.error('Erro ao fazer broadcast:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     summary: Enviar notificação de teste
 *     tags: [Notifications]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Notificação de teste enviada
 */
export const sendTestNotification = async (req: Request, res: Response) => {
  try {
    if (req.user?.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const testNotification = {
      id: `test_${Date.now()}`,
      type: 'info' as const,
      title: 'Teste de Notificação',
      message: `Notificação de teste enviada às ${new Date().toLocaleTimeString('pt-BR')}`,
      timestamp: new Date().toISOString(),
      autoClose: 5000,
      persistent: false,
      from: {
        id: req.user.id,
        name: req.user.nome,
        role: req.user.tipo_usuario
      },
      test: true
    }

    // Enviar apenas para o próprio usuário
    broadcastNotification(testNotification, [req.user.id])

    res.json({
      success: true,
      message: 'Notificação de teste enviada',
      notification: testNotification
    })

  } catch (error) {
    console.error('Erro ao enviar notificação de teste:', error)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}