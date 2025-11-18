import { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { wallets, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import "../types/session.types";
import { getNotificationService } from "../services/notification.service";
import { generateRandomPassword } from "../utils/password-generator";

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Obter estatísticas do sistema
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas do sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 activeUsers:
 *                   type: number
 *                 totalTransactions:
 *                   type: number
 *                 totalWallets:
 *                   type: number
 *                 systemHealth:
 *                   type: string
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado - apenas super admins
 */
export async function getAdminStats(req: Request, res: Response) {
  try {
    console.log("=== ADMIN STATS - REQUEST ===");
    console.log(`Super Admin: ${req.user?.email} (${req.user?.tipo_usuario})`);
    console.log("============================");

    // Buscar todos os usuários
    const allUsers = await storage.getAllUsers();
    
    // Aplicar regras de hierarquia definidas em REGRASUSUARIO.md
    const usuariosAtivos = allUsers.filter(user => 
      user.ativo === true && 
      user.status_assinatura !== 'cancelada' && 
      !user.data_cancelamento
    );
    
    const usuariosCancelados = allUsers.filter(user => 
      user.status_assinatura === 'cancelada' || 
      user.data_cancelamento !== null
    );
    
    const usuariosInativos = allUsers.filter(user => 
      user.ativo === false && 
      user.status_assinatura !== 'cancelada' && 
      !user.data_cancelamento
    );

    // Buscar estatísticas de transações, carteiras e cancelamentos
    const stats = {
      totalUsers: allUsers.length,
      activeUsers: usuariosAtivos.length,
      canceledUsers: usuariosCancelados.length,
      inactiveUsers: usuariosInativos.length,
      totalTransactions: 0,
      totalWallets: 0,
      totalCancelamentos: usuariosCancelados.length,
      systemHealth: "OK"
    };

    // Buscar estatísticas consolidadas em uma única query
    try {
      const walletStats = await storage.getWalletStatsForAllUsers();
      
      stats.totalWallets = walletStats.length;
      stats.totalTransactions = walletStats.reduce((total, wallet) => total + wallet.transactionCount, 0);
      
    } catch (error) {
      console.log('Erro ao buscar dados do sistema:', error);
    }

    console.log("=== ADMIN STATS - RESPONSE ===");
    console.log(JSON.stringify(stats, null, 2));
    console.log("==============================");

    res.status(200).json(stats);
  } catch (error) {
    console.error("Error in getAdminStats:", error);
    res.status(500).json({ error: "Erro ao obter estatísticas do sistema" });
  }
}

export class RecentUsersController {
  /**
   * @swagger
   * /api/admin/recent-users:
   *   get:
   *     summary: Get recent users (last 5 registered)
   *     tags: [Admin]
   *     security:
   *       - sessionAuth: []
   *     responses:
   *       200:
   *         description: Recent users retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden
   */
  static async getRecentUsers(req: Request, res: Response) {
    try {
      console.log("=== RECENT USERS - REQUEST ===");
      console.log(`Admin: ${req.user?.email} (${req.user?.tipo_usuario})`);
      console.log("============================");

      // Verificar se é super admin
      if (req.user?.tipo_usuario !== 'super_admin') {
        return res.status(403).json({ error: "Acesso negado: requer privilégios de super administrador" });
      }

      const recentUsers = await storage.getRecentUsers(5);

      console.log("=== RECENT USERS - RESPONSE ===");
      console.log(`Total de usuários recentes: ${recentUsers.length}`);
      console.log("==============================");

      res.json(recentUsers);
    } catch (error) {
      console.error("Error in getRecentUsers:", error);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  }
}

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Obter lista de todos os usuários
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários com estatísticas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   nome:
 *                     type: string
 *                   email:
 *                     type: string
 *                   tipo_usuario:
 *                     type: string
 *                   ativo:
 *                     type: boolean
 *                   data_cadastro:
 *                     type: string
 *                   ultimo_acesso:
 *                     type: string
 *                   transactionCount:
 *                     type: number
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado - apenas super admins
 */
export async function getAdminUsers(req: Request, res: Response) {
  try {
    console.log("=== ADMIN USERS - REQUEST ===");
    console.log(`Super Admin: ${req.user?.email}`);
    console.log("============================");

    // Buscar usuários e estatísticas em duas queries otimizadas
    const [allUsers, walletStats] = await Promise.all([
      storage.getAllUsers(),
      storage.getWalletStatsForAllUsers()
    ]);
    
    // Criar mapa de estatísticas por usuário
    const statsMap = new Map(
      walletStats.map(stat => [stat.userId, { 
        transactionCount: stat.transactionCount, 
        walletBalance: stat.balance 
      }])
    );
    
    // Combinar dados dos usuários com estatísticas
    const usersWithStats = allUsers.map(user => {
      const stats = statsMap.get(user.id) || { transactionCount: 0, walletBalance: 0 };
      
      return {
        ...user,
        transactionCount: stats.transactionCount,
        walletBalance: stats.walletBalance,
        lastAccess: user.ultimo_acesso
      };
    });

    console.log("=== ADMIN USERS - RESPONSE ===");
    console.log(`Total de usuários: ${usersWithStats.length}`);
    console.log("==============================");

    res.status(200).json(usersWithStats);
  } catch (error) {
    console.error("Error in getAdminUsers:", error);
    res.status(500).json({ error: "Erro ao obter lista de usuários" });
  }
}

/**
 * @swagger
 * /api/admin/impersonate:
 *   post:
 *     summary: Personificar um usuário
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetUserId:
 *                 type: number
 *                 description: ID do usuário a ser personificado
 *             required:
 *               - targetUserId
 *     responses:
 *       200:
 *         description: Personificação iniciada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 sessionId:
 *                   type: number
 *                 targetUser:
 *                   type: object
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Usuário não encontrado
 */
export async function impersonateUser(req: Request, res: Response) {
  try {
    console.log("=== ADMIN IMPERSONATE - REQUEST ===");
    console.log(`Super Admin: ${req.user?.email} (ID: ${req.user?.id})`);
    console.log("Request body:", req.body);
    console.log("==================================");

    const schema = z.object({
      targetUserId: z.number()
    });

    const { targetUserId } = schema.parse(req.body);

    // Verificar se o usuário alvo existe e está ativo
    const targetUser = await storage.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (!targetUser.ativo) {
      return res.status(400).json({ error: "Não é possível personificar um usuário inativo" });
    }

    if (targetUser.tipo_usuario === "super_admin") {
      return res.status(400).json({ error: "Não é possível personificar outro super administrador" });
    }

    // Verificar se o super admin não está tentando personificar a si mesmo
    if (targetUser.id === req.user!.id) {
      return res.status(400).json({ error: "Não é possível personificar a si mesmo" });
    }

    // Salvar o super admin original na sessão antes de personificar
    if (!req.session!.originalAdmin) {
      req.session!.originalAdmin = req.user;
    }

    // Criar sessão de personificação
    const session = await storage.createImpersonationSession(req.user!.id, targetUserId);

    // Atualizar a sessão do usuário para o usuário alvo
    req.session!.user = {
      id: targetUser.id,
      email: targetUser.email,
      nome: targetUser.nome,
      tipo_usuario: targetUser.tipo_usuario
    };

    // Marcar que estamos em modo de personificação
    req.session!.isImpersonating = true;

    console.log("=== ADMIN IMPERSONATE - SUCCESS ===");
    console.log(`Sessão criada: ${session.id}`);
    console.log(`Personificando: ${targetUser.nome} (${targetUser.email})`);
    console.log("==================================");

    res.status(200).json({
      message: "Personificação iniciada com sucesso",
      sessionId: session.id,
      targetUser: {
        id: targetUser.id,
        nome: targetUser.nome,
        email: targetUser.email,
        tipo_usuario: targetUser.tipo_usuario
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.log("=== VALIDATION ERROR ===");
      console.log("Errors:", error.errors);
      console.log("========================");
      return res.status(400).json({ error: "Dados inválidos", details: error.errors });
    }
    console.error("Error in impersonateUser:", error);
    res.status(500).json({ error: "Erro ao iniciar personificação" });
  }
}

/**
 * @swagger
 * /api/admin/stop-impersonation:
 *   post:
 *     summary: Parar personificação e retornar à identidade original
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Personificação encerrada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Nenhuma sessão de personificação ativa
 */
export async function stopImpersonation(req: Request, res: Response) {
  try {
    console.log("=== ADMIN STOP IMPERSONATE - REQUEST ===");
    console.log(`Current User: ${req.user?.email} (ID: ${req.user?.id})`);
    console.log(`Session isImpersonating: ${req.session?.isImpersonating}`);
    console.log(`Session originalAdmin: ${req.session?.originalAdmin?.email}`);
    console.log("=======================================");

    if (!req.session?.isImpersonating || !req.session?.originalAdmin) {
      return res.status(404).json({ error: "Nenhuma sessão de personificação ativa" });
    }

    // Buscar e encerrar a sessão ativa
    const activeSession = await storage.getActiveImpersonationSession(req.user!.id);
    if (activeSession) {
      await storage.endImpersonationSession(activeSession.id);
    }

    // Obter dados atualizados do admin original
    const originalAdmin = await storage.getUserById(req.session.originalAdmin.id);
    if (!originalAdmin) {
      return res.status(400).json({ error: "Administrador original não encontrado" });
    }

    // Restaurar a sessão para o usuário original
    req.session.userId = originalAdmin.id;
    delete req.session.user;
    delete req.session.originalAdmin;
    req.session.isImpersonating = false;

    console.log("=== ADMIN STOP IMPERSONATE - SUCCESS ===");
    console.log(`Sessão encerrada. Retornando para: ${originalAdmin.nome}`);
    console.log("=======================================");

    res.status(200).json({
      message: "Personificação encerrada com sucesso"
    });
  } catch (error) {
    console.error("Error in stopImpersonation:", error);
    res.status(500).json({ error: "Erro ao encerrar personificação" });
  }
}

/**
 * @swagger
 * /api/admin/users/{id}/status:
 *   patch:
 *     summary: Ativar ou desativar um usuário
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ativo:
 *                 type: boolean
 *                 description: Status ativo do usuário
 *             required:
 *               - ativo
 *     responses:
 *       200:
 *         description: Status do usuário atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Usuário não encontrado
 */
export async function updateUserStatus(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    const { ativo } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuário inválido" });
    }

    if (typeof ativo !== 'boolean') {
      return res.status(400).json({ error: "Status ativo deve ser um valor booleano" });
    }

    // Verificar se o usuário existe
    const targetUser = await storage.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Não permitir desativar super admins
    if (targetUser.tipo_usuario === 'super_admin' && !ativo) {
      return res.status(403).json({ error: "Não é possível desativar super administradores" });
    }

    // Detectar se está ativando um usuário inativo e é super_admin
    const isActivatingInactiveUser = 
      ativo === true && 
      targetUser.ativo === false && 
      req.user?.tipo_usuario === 'super_admin';

    // Preparar dados de atualização
    const updateData: any = { ativo };
    
    // Se estiver ativando um usuário que estava cancelado, limpar dados de cancelamento
    if (ativo && (targetUser.status_assinatura === 'cancelada' || targetUser.data_cancelamento)) {
      updateData.status_assinatura = 'ativa';
      updateData.data_cancelamento = null;
      updateData.motivo_cancelamento = null;
      
      console.log("=== LIMPANDO DADOS DE CANCELAMENTO ===");
      console.log(`Usuário ${targetUser.nome} reativado - removendo status de cancelamento`);
      console.log("=====================================");
    }

    // Atualizar o status do usuário
    const updatedUser = await storage.updateUser(userId, updateData);

    // Enviar notificação via webhook quando super_admin ativa usuário inativo
    if (isActivatingInactiveUser) {
      try {
        console.log("=== ENVIANDO WEBHOOK DE ATIVAÇÃO (STATUS) ===");
        console.log(`Super Admin ${req.user?.nome} ativou usuário ${updatedUser.nome}`);
        
        // Buscar token do usuário
        const userTokens = await storage.getApiTokensByUserId(updatedUser.id);
        const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;
        
        // Gerar nova senha aleatória usando utilitário compartilhado
        const newPassword = generateRandomPassword(8);
        
        // Atualizar a senha do usuário
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await storage.updateUser(updatedUser.id, { senha: hashedPassword });
        
        console.log(`Nova senha gerada para o usuário ${updatedUser.nome}: ${newPassword}`);
        
        // Buscar mensagem de ativação personalizada
        let activationMessage = {
          title: 'Sua conta foi ativada!',
          message: 'Olá! Sua conta foi ativada com sucesso. Agora você tem acesso completo a todos os recursos da plataforma.',
          email_content: 'Sua conta foi ativada com sucesso!'
        };
        
        try {
          const postgres = (await import('postgres')).default;
          const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
          
          const result = await client`
            SELECT title, message, email_content 
            FROM welcome_messages 
            WHERE type = 'activated'
          `;
          
          if (result.length > 0) {
            activationMessage = result[0];
            // Processar tags na mensagem usando notification.service
            const notificationService = getNotificationService();
            activationMessage.title = notificationService.processMessageTags(activationMessage.title, updatedUser);
            activationMessage.message = notificationService.processMessageTags(activationMessage.message, updatedUser);
            activationMessage.email_content = notificationService.processMessageTags(
              activationMessage.email_content || activationMessage.message,
              updatedUser
            );
          }
          
          await client.end();
        } catch (msgError) {
          console.error("Erro ao buscar mensagem de ativação, usando padrão:", msgError);
        }
        
        const webhookData = {
          evento: "usuario_ativado",
          timestamp: new Date().toISOString(),
          dominio: process.env.BASE_URL || 'https://financehub.xpiria.com.br',
          id: updatedUser.id,
          nome: updatedUser.nome,
          email: updatedUser.email,
          telefone: updatedUser.telefone,
          tipo_usuario: updatedUser.tipo_usuario,
          data_cadastro: updatedUser.data_cadastro,
          token: userToken,
          acesso_web: {
            usuario: updatedUser.email,
            senha: newPassword
          },
          mensagem_ativacao: {
            titulo: activationMessage.title,
            mensagem: activationMessage.message,
            conteudo_email: activationMessage.email_content
          }
        };

        console.log("=== WEBHOOK DATA ===");
        console.log(JSON.stringify(webhookData, null, 2));
        console.log("====================");

        const webhookResponse = await fetch(process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookData)
        });

        console.log(`Webhook Response Status: ${webhookResponse.status}`);
        const responseText = await webhookResponse.text();
        console.log(`Webhook Response Body: ${responseText}`);

        if (webhookResponse.ok) {
          console.log("✅ Webhook de ativação enviado com sucesso");
        } else {
          console.error("❌ Erro ao enviar webhook:", webhookResponse.status, responseText);
        }
        console.log("==============================================");
      } catch (webhookError) {
        console.error("Erro ao enviar webhook de ativação:", webhookError);
        // Não falhar a operação se o webhook falhar
      }
    }

    console.log("=== USER STATUS UPDATE ===");
    console.log(`Usuário ${targetUser.nome} (${targetUser.email}) ${ativo ? 'ativado' : 'desativado'}`);
    console.log("==========================");

    res.json({
      message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso`,
      user: updatedUser
    });

  } catch (error) {
    console.error("Erro ao atualizar status do usuário:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

/**
 * @swagger
 * /api/admin/impersonation-status:
 *   get:
 *     summary: Verificar status de personificação
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Status de personificação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isImpersonating:
 *                   type: boolean
 *                 originalAdmin:
 *                   type: object
 *                 currentUser:
 *                   type: object
 *       401:
 *         description: Não autenticado
 */
export async function getImpersonationStatus(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const session = req.session as any;
    
    if (!session.isImpersonating) {
      return res.status(200).json({
        isImpersonating: false,
        originalAdmin: null,
        currentUser: req.user
      });
    }

    // Durante impersonificação, obter dados do admin original
    const originalAdmin = await storage.getUserById(session.originalAdmin.id);
    if (!originalAdmin) {
      // Admin original não existe mais, limpar sessão
      session.isImpersonating = false;
      delete session.originalAdmin;
      delete session.user;
      
      return res.status(200).json({
        isImpersonating: false,
        originalAdmin: null,
        currentUser: req.user
      });
    }

    // Remover senha dos dados
    const { senha, ...adminWithoutPassword } = originalAdmin;

    const response = {
      isImpersonating: true,
      originalAdmin: adminWithoutPassword,
      currentUser: req.user
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in getImpersonationStatus:", error);
    res.status(500).json({ error: "Erro ao verificar status de personificação" });
  }
}

/**
 * @swagger
 * /api/admin/users/{id}/reset:
 *   post:
 *     summary: Resetar todos os dados de um usuário
 *     description: Remove todas as transações, lembretes e categorias personalizadas do usuário, mantendo apenas o usuário, senha e um token de API
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: Usuário resetado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 userId:
 *                   type: number
 *                 resetData:
 *                   type: object
 *                   properties:
 *                     transactionsRemoved:
 *                       type: number
 *                     remindersRemoved:
 *                       type: number
 *                     categoriesRemoved:
 *                       type: number
 *                     tokensRemoved:
 *                       type: number
 *       400:
 *         description: ID de usuário inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado - apenas super admins
 *       404:
 *         description: Usuário não encontrado
 */
export async function resetUserData(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    
    console.log("=== ADMIN RESET USER - REQUEST ===");
    console.log(`Admin: ${req.user?.email}`);
    console.log(`Target User ID: ${userId}`);
    console.log("==================================");

    if (isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuário inválido" });
    }

    // Verificar se o usuário existe
    const targetUser = await storage.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Não permitir reset do próprio usuário
    if (userId === req.user?.id) {
      return res.status(400).json({ error: "Não é possível resetar seus próprios dados" });
    }

    console.log(`Resetando dados do usuário: ${targetUser.email}`);

    // Buscar carteira do usuário
    const wallet = await storage.getWalletByUserId(userId);
    let transactionsRemoved = 0;

    if (wallet) {
      // Contar transações antes de remover
      const transactions = await storage.getTransactionsByWalletId(wallet.id);
      transactionsRemoved = transactions.length;

      // Remover todas as transações
      for (const transaction of transactions) {
        await storage.deleteTransaction(transaction.id);
      }

      // Resetar saldo da carteira
      await storage.updateWallet(wallet.id, { saldo_atual: "0.00" });
    }

    // Contar e remover lembretes
    const reminders = await storage.getRemindersByUserId(userId);
    const remindersRemoved = reminders.length;
    for (const reminder of reminders) {
      await storage.deleteReminder(reminder.id);
    }

    // Contar e remover categorias personalizadas
    const userCategories = await storage.getCategoriesByUserId(userId);
    const personalCategories = userCategories.filter(cat => !cat.global);
    const categoriesRemoved = personalCategories.length;
    for (const category of personalCategories) {
      await storage.deleteCategory(category.id);
    }

    // Contar tokens de API e manter apenas 1
    const apiTokens = await storage.getApiTokensByUserId(userId);
    const tokensToRemove = apiTokens.slice(1); // Manter o primeiro token
    const tokensRemoved = tokensToRemove.length;
    for (const token of tokensToRemove) {
      await storage.deleteApiToken(token.id);
    }

    // Atualizar último acesso do usuário
    await storage.updateUser(userId, {
      ultimo_acesso: new Date(),
      ativo: true,
      tipo_usuario: "usuario"
    });

    const resetData = {
      transactionsRemoved,
      remindersRemoved,
      categoriesRemoved,
      tokensRemoved
    };

    console.log("=== ADMIN RESET USER - SUCCESS ===");
    console.log(`Usuário ${targetUser.email} resetado:`);
    console.log(`- Transações removidas: ${transactionsRemoved}`);
    console.log(`- Lembretes removidos: ${remindersRemoved}`);
    console.log(`- Categorias removidas: ${categoriesRemoved}`);
    console.log(`- Tokens removidos: ${tokensRemoved}`);
    console.log("==================================");

    res.status(200).json({
      message: `Dados do usuário ${targetUser.nome} foram resetados com sucesso`,
      userId: userId,
      resetData
    });

  } catch (error) {
    console.error("Error in resetUserData:", error);
    res.status(500).json({ error: "Erro ao resetar dados do usuário" });
  }
}

/**
 * @swagger
 * /api/admin/audit-log:
 *   get:
 *     summary: Obter logs de auditoria do sistema
 *     tags: [Admin]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Número máximo de logs para retornar
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Número de logs para pular
 *     responses:
 *       200:
 *         description: Logs de auditoria
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado
 */
export async function getAuditLog(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Buscar todas as sessões de administração (logs de auditoria)
    const allSessions = await storage.getAllAdminSessions();
    
    // Aplicar paginação
    const paginatedLogs = allSessions.slice(offset, offset + limit);

    // Enriquecer com dados dos usuários
    const enrichedLogs = await Promise.all(
      paginatedLogs.map(async (session) => {
        const superAdmin = await storage.getUserById(session.super_admin_id);
        const targetUser = await storage.getUserById(session.target_user_id);
        
        return {
          ...session,
          super_admin_name: superAdmin?.nome || 'Usuário removido',
          super_admin_email: superAdmin?.email || '',
          target_user_name: targetUser?.nome || 'Usuário removido',
          target_user_email: targetUser?.email || '',
          acao: session.data_fim ? 'Personificação encerrada' : 'Personificação ativa'
        };
      })
    );

    console.log("=== AUDIT LOG REQUEST ===");
    console.log(`Retornando ${enrichedLogs.length} logs de auditoria`);
    console.log("========================");

    res.json({
      logs: enrichedLogs,
      total: allSessions.length,
      limit,
      offset
    });

  } catch (error) {
    console.error("Erro ao buscar logs de auditoria:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

// Função para criar novo usuário
export async function createUser(req: Request, res: Response) {
  try {
    console.log("=== ADMIN CREATE USER - REQUEST ===");
    console.log("Request body:", req.body);
    console.log("Super Admin:", req.user?.email);
    console.log("===============================");

    const { nome, email, senha, tipo_usuario = "usuario", telefone } = req.body;

    // Validação de telefone (opcional, mas se fornecido deve ser válido)
    if (telefone && telefone.trim() !== "") {
      // Remover tudo que não for número
      let digits = telefone.replace(/\D/g, "");
      // Adicionar country code se não tiver
      if (!digits.startsWith("55")) {
        digits = "55" + digits;
      }
      // Validar tamanho (12 ou 13 dígitos)
      if (digits.length < 12 || digits.length > 13) {
        return res.status(400).json({ error: "Telefone deve ter 10 ou 11 dígitos (sem DDI) ou 12/13 com DDI" });
      }
      // Atualizar telefone para salvar no banco
      req.body.telefone = digits;
    }

    // Após normalizar o telefone, verificar duplicidade
    if (req.body.telefone) {
      const existingPhoneUser = await storage.getUserByPhone(req.body.telefone);
      if (existingPhoneUser) {
        return res.status(400).json({ error: "Este número de telefone já está em uso por outro usuário." });
      }
    }

    console.log("Dados extraídos:", { nome, email, senha: senha ? "***" : undefined, tipo_usuario });

    if (!nome || !email || !senha) {
      console.log("Erro: Campos obrigatórios faltando");
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
    }

    console.log("Verificando se email já existe...");
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      console.log("Erro: Email já existe");
      return res.status(400).json({ error: "Email já está em uso" });
    }

    console.log("Criando usuário no banco...");
    // Remover hash manual da senha, deixar storage.createUser hashear
    const userData = {
      nome,
      email,
      senha, // senha em texto puro
      tipo_usuario,
      ativo: true,
      telefone // incluir telefone se fornecido
    };
    console.log("User data:", { ...userData, senha: "***" });

    const newUser = await storage.createUser(userData);
    console.log("Usuário criado:", { id: newUser.id, nome: newUser.nome, email: newUser.email });

    console.log("Criando carteira para o usuário...");
    const walletData = {
      usuario_id: newUser.id,
      nome: "Principal",
      descricao: "Carteira principal",
      saldo_atual: 0
    };
    console.log("Wallet data:", walletData);

    const wallet = await storage.createWallet(walletData);
    console.log("Carteira criada:", { id: wallet.id, nome: wallet.nome });

    console.log("=== USUÁRIO CRIADO COM SUCESSO ===");
    res.status(201).json({
      message: "Usuário criado com sucesso",
      user: { ...newUser, senha: undefined }
    });
  } catch (error: any) {
    console.error("=== ERRO NA CRIAÇÃO DO USUÁRIO ===");
    console.error("Error details:", error);
    console.error("Error message:", error?.message || 'Erro desconhecido');
    console.error("Error stack:", error?.stack);
    console.error("================================");
    res.status(500).json({ error: "Erro ao criar usuário: " + (error?.message || 'Erro desconhecido') });
  }
}

// Função para atualizar usuário
export async function updateUser(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuário inválido" });
    }

    const existingUser = await storage.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (userId === req.user!.id && req.body.ativo === false) {
      return res.status(400).json({ error: "Não é possível desativar sua própria conta" });
    }

    console.log("=== ADMIN UPDATE USER - REQUEST ===");
    console.log(`Atualizando usuário: ${existingUser.nome} (${existingUser.email})`);
    console.log("Dados recebidos:", JSON.stringify(req.body, null, 2));
    console.log("=====================================");

    // Preparar dados de atualização
    const updateData: any = { ...req.body };
    
    // Remover campos especiais que precisam de tratamento
    delete updateData.nova_senha;
    
    // Para updateUser, só bloquear se o telefone for de outro usuário
    if (updateData.telefone) {
      const existingPhoneUser = await storage.getUserByPhone(updateData.telefone);
      if (existingPhoneUser && existingPhoneUser.id !== userId) {
        return res.status(400).json({ error: "Este número de telefone já está em uso por outro usuário." });
      }
    }

    // Detectar se está ativando um usuário inativo e é super_admin
    const isActivatingInactiveUser = 
      req.body.ativo === true && 
      existingUser.ativo === false && 
      req.user?.tipo_usuario === 'super_admin';

    // Se estiver ativando um usuário que estava cancelado, limpar dados de cancelamento
    if (req.body.ativo === true && (existingUser.status_assinatura === 'cancelada' || existingUser.data_cancelamento)) {
      updateData.status_assinatura = 'ativa';
      updateData.data_cancelamento = null;
      updateData.motivo_cancelamento = null;
      
      console.log("=== LIMPANDO DADOS DE CANCELAMENTO (UPDATE) ===");
      console.log(`Usuário ${existingUser.nome} reativado - removendo status de cancelamento`);
      console.log("=============================================");
    }

    // Processar data de expiração da assinatura
    if (req.body.data_expiracao_assinatura) {
      const expirationDate = new Date(req.body.data_expiracao_assinatura);
      updateData.data_expiracao_assinatura = expirationDate;
      console.log(`Data de expiração definida: ${expirationDate.toISOString()}`);
    } else if (req.body.data_expiracao_assinatura === "") {
      // Se campo vazio, remover data de expiração (assinatura ilimitada)
      updateData.data_expiracao_assinatura = null;
      console.log("Assinatura definida como ilimitada");
    }

    // Atualizar usuário
    const updatedUser = await storage.updateUser(userId, updateData);
    if (!updatedUser) {
      return res.status(500).json({ error: "Erro ao atualizar usuário" });
    }

    // Processar alteração de senha se fornecida
    if (req.body.nova_senha && req.body.nova_senha.trim()) {
      console.log("Atualizando senha do usuário...");
      const hashedPassword = await bcrypt.hash(req.body.nova_senha, 10);
      await storage.updateUser(userId, { senha: hashedPassword });
      console.log("Senha atualizada com sucesso");
    }

    // Enviar notificação via webhook quando super_admin ativa usuário inativo
    if (isActivatingInactiveUser) {
      try {
        console.log("=== ENVIANDO WEBHOOK DE ATIVAÇÃO ===");
        console.log(`Super Admin ${req.user?.nome} ativou usuário ${updatedUser.nome}`);
        console.log(`isActivatingInactiveUser: ${isActivatingInactiveUser}`);
        console.log(`req.body.ativo: ${req.body.ativo}`);
        console.log(`existingUser.ativo: ${existingUser.ativo}`);
        console.log(`req.user?.tipo_usuario: ${req.user?.tipo_usuario}`);
        
        // Buscar token do usuário
        const userTokens = await storage.getApiTokensByUserId(updatedUser.id);
        const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;
        
        // Gerar nova senha aleatória usando utilitário compartilhado
        const newPassword = generateRandomPassword(8);
        
        // Atualizar a senha do usuário
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await storage.updateUser(updatedUser.id, { senha: hashedPassword });
        
        console.log(`Nova senha gerada para o usuário ${updatedUser.nome}: ${newPassword}`);
        
        // Buscar mensagem de ativação personalizada
        let activationMessage = {
          title: 'Sua conta foi ativada!',
          message: 'Olá! Sua conta foi ativada com sucesso. Agora você tem acesso completo a todos os recursos da plataforma.',
          email_content: 'Sua conta foi ativada com sucesso!'
        };
        
        try {
          const postgres = (await import('postgres')).default;
          const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
          
          const result = await client`
            SELECT title, message, email_content 
            FROM welcome_messages 
            WHERE type = 'activated'
          `;
          
          if (result.length > 0) {
            activationMessage = result[0];
            // Processar tags na mensagem usando notification.service
            const notificationService = getNotificationService();
            activationMessage.title = notificationService.processMessageTags(activationMessage.title, updatedUser);
            activationMessage.message = notificationService.processMessageTags(activationMessage.message, updatedUser);
            activationMessage.email_content = notificationService.processMessageTags(
              activationMessage.email_content || activationMessage.message,
              updatedUser
            );
          }
          
          await client.end();
        } catch (msgError) {
          console.error("Erro ao buscar mensagem de ativação, usando padrão:", msgError);
        }
        
        const webhookData = {
          evento: "usuario_ativado",
          timestamp: new Date().toISOString(),
          dominio: process.env.BASE_URL || 'https://financehub.xpiria.com.br',
          id: updatedUser.id,
          nome: updatedUser.nome,
          email: updatedUser.email,
          telefone: updatedUser.telefone,
          tipo_usuario: updatedUser.tipo_usuario,
          data_cadastro: updatedUser.data_cadastro,
          token: userToken,
          acesso_web: {
            usuario: updatedUser.email,
            senha: newPassword
          },
          mensagem_ativacao: {
            titulo: activationMessage.title,
            mensagem: activationMessage.message,
            conteudo_email: activationMessage.email_content
          }
        };

        console.log("=== WEBHOOK DATA ===");
        console.log(JSON.stringify(webhookData, null, 2));
        console.log("====================");

        const webhookResponse = await fetch(process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookData)
        });

        console.log(`Webhook Response Status: ${webhookResponse.status}`);
        const responseText = await webhookResponse.text();
        console.log(`Webhook Response Body: ${responseText}`);

        if (webhookResponse.ok) {
          console.log("✅ Webhook de ativação enviado com sucesso");
        } else {
          console.error("❌ Erro ao enviar webhook:", webhookResponse.status, responseText);
        }
        console.log("=====================================");
      } catch (webhookError) {
        console.error("Erro ao enviar webhook de ativação:", webhookError);
        // Não falhar a operação se o webhook falhar
      }
    }

    console.log("=== ADMIN UPDATE USER - SUCCESS ===");
    console.log(`Usuário ${updatedUser.nome} atualizado com sucesso`);
    console.log("===================================");

    res.status(200).json({
      message: "Usuário atualizado com sucesso",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error in updateUser:", error);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
}

// Função para deletar usuário
export async function deleteUser(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuário inválido" });
    }

    const existingUser = await storage.getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (userId === req.user!.id) {
      return res.status(400).json({ error: "Não é possível deletar sua própria conta" });
    }

    // Exclusão definitiva se ?permanente=true
    if (req.query.permanente === 'true') {
      const ok = await storage.deleteUserCascade(userId);
      if (!ok) {
        return res.status(500).json({ error: "Erro ao excluir usuário permanentemente" });
      }
      return res.status(200).json({ message: "Usuário excluído permanentemente" });
    }

    // Soft delete padrão
    const updatedUser = await storage.updateUser(userId, { ativo: false });
    if (!updatedUser) {
      return res.status(500).json({ error: "Erro ao desativar usuário" });
    }

    res.status(200).json({
      message: "Usuário desativado com sucesso",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error in deleteUser:", error);
    res.status(500).json({ error: "Erro ao deletar usuário" });
  }
}

// Resetar categorias e formas de pagamento globais para os padrões
export async function resetGlobals(req: Request, res: Response) {
  try {
    if (!req.user || req.user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso negado: requer superadmin' });
    }
    // Remover todas as categorias globais
    await storage.deleteAllGlobalCategories();
    // Remover todas as formas de pagamento globais
    await storage.deleteAllGlobalPaymentMethods();
    // Recriar categorias globais padrão
    const defaultCategories = [
      { nome: 'Alimentação', tipo: 'Despesa', cor: '#FF6B6B', icone: '🍽️', descricao: 'Gastos com alimentação e refeições', global: true },
      { nome: 'Transporte', tipo: 'Despesa', cor: '#4ECDC4', icone: '🚗', descricao: 'Gastos com transporte e locomoção', global: true },
      { nome: 'Moradia', tipo: 'Despesa', cor: '#45B7D1', icone: '🏠', descricao: 'Gastos com moradia e aluguel', global: true },
      { nome: 'Saúde', tipo: 'Despesa', cor: '#96CEB4', icone: '🏥', descricao: 'Gastos com saúde e medicamentos', global: true },
      { nome: 'Educação', tipo: 'Despesa', cor: '#FFEAA7', icone: '📚', descricao: 'Gastos com educação e cursos', global: true },
      { nome: 'Lazer', tipo: 'Despesa', cor: '#DDA0DD', icone: '🎮', descricao: 'Gastos com lazer e entretenimento', global: true },
      { nome: 'Vestuário', tipo: 'Despesa', cor: '#F8BBD9', icone: '👕', descricao: 'Gastos com roupas e acessórios', global: true },
      { nome: 'Serviços', tipo: 'Despesa', cor: '#FFB74D', icone: '🔧', descricao: 'Gastos com serviços diversos', global: true },
      { nome: 'Impostos', tipo: 'Despesa', cor: '#A1887F', icone: '💰', descricao: 'Pagamento de impostos e taxas', global: true },
      { nome: 'Outros', tipo: 'Despesa', cor: '#90A4AE', icone: '📦', descricao: 'Outros gastos diversos', global: true },
      { nome: 'Salário', tipo: 'Receita', cor: '#4CAF50', icone: '💼', descricao: 'Receita de salário e trabalho', global: true },
      { nome: 'Freelance', tipo: 'Receita', cor: '#8BC34A', icone: '💻', descricao: 'Receita de trabalhos freelancer', global: true },
      { nome: 'Investimentos', tipo: 'Receita', cor: '#FFC107', icone: '📈', descricao: 'Receita de investimentos', global: true },
      { nome: 'Presentes', tipo: 'Receita', cor: '#E91E63', icone: '🎁', descricao: 'Receita de presentes e doações', global: true },
      { nome: 'Reembolso', tipo: 'Receita', cor: '#9C27B0', icone: '💸', descricao: 'Reembolsos e devoluções', global: true },
      { nome: 'Outros', tipo: 'Receita', cor: '#607D8B', icone: '📦', descricao: 'Outras receitas diversas', global: true }
    ];
    for (const category of defaultCategories) {
      await storage.createCategory(category);
    }
    // Recriar formas de pagamento globais padrão
    const defaultPaymentMethods = [
      { nome: 'PIX', descricao: 'Pagamento via PIX', icone: '📱', cor: '#32CD32', global: true, ativo: true },
      { nome: 'Cartão de Crédito', descricao: 'Pagamento com cartão de crédito', icone: '💳', cor: '#FF6B35', global: true, ativo: true },
      { nome: 'Dinheiro', descricao: 'Pagamento em dinheiro', icone: '💵', cor: '#4CAF50', global: true, ativo: true },
      { nome: 'Cartão de Débito', descricao: 'Pagamento com cartão de débito', icone: '🏦', cor: '#2196F3', global: true, ativo: true },
      { nome: 'Transferência', descricao: 'Transferência bancária', icone: '🏛️', cor: '#9C27B0', global: true, ativo: true },
      { nome: 'Boleto', descricao: 'Pagamento via boleto', icone: '📄', cor: '#FF9800', global: true, ativo: true }
    ];
    for (const method of defaultPaymentMethods) {
      await storage.createPaymentMethod(method);
    }
    res.json({ success: true, message: 'Categorias e formas de pagamento globais resetadas com sucesso!' });
  } catch (error) {
    console.error('Erro ao resetar globais:', error);
    res.status(500).json({ success: false, message: 'Erro ao resetar globais', error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
}