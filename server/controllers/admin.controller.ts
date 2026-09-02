import { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { wallets, users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import "../types/session.types";
import { generateCheckoutToken } from "../utils/checkout-token.utils";
import { getNotificationService } from "../services/notification.service";
import { generateRandomPassword } from "../utils/password-generator";
import { uazapiService } from "../services/uazapi.service";
import { gerarLinkDefinirSenha } from "./password-reset.controller";

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
          dominio: process.env.BASE_URL || 'https://app.controledinheiro.com.br',
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

        // === N8N DESATIVADO — pipeline agora roda via app (POST /api/webhook/uazapi) ===
        // const webhookResponse = await fetch(process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify(webhookData)
        // });
        //
        // console.log(`Webhook Response Status: ${webhookResponse.status}`);
        // const responseText = await webhookResponse.text();
        // console.log(`Webhook Response Body: ${responseText}`);
        //
        // if (webhookResponse.ok) {
        //   console.log("✅ Webhook de ativação enviado com sucesso");
        // } else {
        //   console.error("❌ Erro ao enviar webhook:", webhookResponse.status, responseText);
        // }
        console.log("✅ Webhook N8N desativado — ativação agora via pipeline interno.");
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

    const body = req.body || {};

    // Só campos permitidos (evita drizzle rejeitar lixo do form)
    const updateData: Record<string, any> = {};
    if (body.nome !== undefined) updateData.nome = String(body.nome).trim();
    if (body.ativo !== undefined) updateData.ativo = Boolean(body.ativo);
    if (body.tipo_usuario !== undefined) updateData.tipo_usuario = body.tipo_usuario;
    if (body.tipo_pessoa !== undefined) updateData.tipo_pessoa = body.tipo_pessoa;

    // E-mail: normaliza e valida unicidade (necessário p/ recuperação de senha)
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "E-mail inválido" });
      }
      if (email.endsWith("@tel.local")) {
        return res.status(400).json({
          error: "Informe um e-mail real (não use o placeholder @tel.local).",
        });
      }
      const emailOwner = await storage.getUserByEmail(email);
      if (emailOwner && emailOwner.id !== userId) {
        return res.status(400).json({ error: "Este e-mail já está em uso por outro usuário." });
      }
      // Busca case-insensitive extra (cadastros antigos)
      try {
        const { sql: dsql } = await import("drizzle-orm");
        const { db } = await import("../db");
        const { users } = await import("../../shared/schema");
        const rows = await db
          .select()
          .from(users)
          .where(dsql`lower(${users.email}) = ${email}`)
          .limit(1);
        if (rows[0] && rows[0].id !== userId) {
          return res.status(400).json({ error: "Este e-mail já está em uso por outro usuário." });
        }
      } catch {
        // se falhar a query extra, segue com o check exato já feito
      }
      updateData.email = email;
    }

    // Telefone: grava só DDD+número (sem 55), igual ao fluxo WhatsApp
    if (body.telefone !== undefined) {
      let digits = String(body.telefone || "").replace(/\D/g, "");
      if (!digits) {
        updateData.telefone = null;
      } else {
        if (digits.startsWith("55") && digits.length >= 12) {
          digits = digits.slice(2);
        }
        if (digits.length < 10 || digits.length > 11) {
          return res.status(400).json({
            error: "Telefone deve ter 10 ou 11 dígitos (DDD + número).",
          });
        }
        const phoneOwnerExact = await storage.getUserByPhone(digits);
        const phoneOwner55 = await storage.getUserByPhone(`55${digits}`);
        const conflict = [phoneOwnerExact, phoneOwner55].find(
          (u) => u && u.id !== userId
        );
        if (conflict) {
          return res.status(400).json({
            error: "Este número de telefone já está em uso por outro usuário.",
          });
        }
        updateData.telefone = digits;
      }
    }

    // Detectar se está ativando um usuário inativo e é super_admin
    const isActivatingInactiveUser =
      body.ativo === true &&
      existingUser.ativo === false &&
      req.user?.tipo_usuario === "super_admin";

    // Se estiver ativando um usuário que estava cancelado, limpar dados de cancelamento
    if (
      body.ativo === true &&
      (existingUser.status_assinatura === "cancelada" || existingUser.data_cancelamento)
    ) {
      updateData.status_assinatura = "ativa";
      updateData.data_cancelamento = null;
      updateData.motivo_cancelamento = null;

      console.log("=== LIMPANDO DADOS DE CANCELAMENTO (UPDATE) ===");
      console.log(`Usuário ${existingUser.nome} reativado - removendo status de cancelamento`);
      console.log("=============================================");
    }

    // Processar data de expiração da assinatura
    if (body.data_expiracao_assinatura) {
      const expirationDate = new Date(body.data_expiracao_assinatura);
      if (Number.isNaN(expirationDate.getTime())) {
        return res.status(400).json({ error: "Data de expiração inválida" });
      }
      updateData.data_expiracao_assinatura = expirationDate;
      console.log(`Data de expiração definida: ${expirationDate.toISOString()}`);
    } else if (body.data_expiracao_assinatura === "") {
      updateData.data_expiracao_assinatura = null;
      console.log("Assinatura definida como ilimitada");
    }

    const novaSenha =
      typeof body.nova_senha === "string" ? body.nova_senha.trim() : "";
    if (novaSenha && novaSenha.length < 6) {
      return res.status(400).json({
        error: "A nova senha deve ter pelo menos 6 caracteres.",
      });
    }

    // Atualizar usuário (campos cadastrais)
    let updatedUser = existingUser;
    if (Object.keys(updateData).length > 0) {
      const result = await storage.updateUser(userId, updateData);
      if (!result) {
        return res.status(500).json({ error: "Erro ao atualizar usuário" });
      }
      updatedUser = result;
    }

    // Alteração de senha (se informada)
    if (novaSenha) {
      console.log("Atualizando senha do usuário...");
      const hashedPassword = await bcrypt.hash(novaSenha, 10);
      await storage.updateUser(userId, { senha: hashedPassword });
      console.log("Senha atualizada com sucesso");
    }

    // Enviar notificação via webhook quando super_admin ativa usuário inativo
    if (isActivatingInactiveUser) {
      try {
        console.log("=== ENVIANDO WEBHOOK DE ATIVAÇÃO ===");
        console.log(`Super Admin ${req.user?.nome} ativou usuário ${updatedUser.nome}`);

        const userTokens = await storage.getApiTokensByUserId(updatedUser.id);
        const userToken = userTokens && userTokens.length > 0 ? userTokens[0].token : null;

        // Só gera senha aleatória se o admin NÃO definiu uma nova senha neste update
        let accessPassword = novaSenha || null;
        if (!accessPassword) {
          accessPassword = generateRandomPassword(8);
          const hashedPassword = await bcrypt.hash(accessPassword, 10);
          await storage.updateUser(updatedUser.id, { senha: hashedPassword });
          console.log(`Nova senha gerada para o usuário ${updatedUser.nome}: ${accessPassword}`);
        }

        let activationMessage = {
          title: "Sua conta foi ativada!",
          message:
            "Olá! Sua conta foi ativada com sucesso. Agora você tem acesso completo a todos os recursos da plataforma.",
          email_content: "Sua conta foi ativada com sucesso!",
        };

        try {
          const postgres = (await import("postgres")).default;
          const client = postgres(process.env.DATABASE_URL || "", { prepare: false });

          const result = await client`
            SELECT title, message, email_content 
            FROM welcome_messages 
            WHERE type = 'activated'
          `;

          if (result.length > 0) {
            activationMessage = result[0];
            const notificationService = getNotificationService();
            activationMessage.title = notificationService.processMessageTags(
              activationMessage.title,
              updatedUser
            );
            activationMessage.message = notificationService.processMessageTags(
              activationMessage.message,
              updatedUser
            );
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
          dominio: process.env.BASE_URL || "https://app.controledinheiro.com.br",
          id: updatedUser.id,
          nome: updatedUser.nome,
          email: updatedUser.email,
          telefone: updatedUser.telefone,
          tipo_usuario: updatedUser.tipo_usuario,
          data_cadastro: updatedUser.data_cadastro,
          token: userToken,
          acesso_web: {
            usuario: updatedUser.email,
            senha: accessPassword,
          },
          mensagem_ativacao: {
            titulo: activationMessage.title,
            mensagem: activationMessage.message,
            conteudo_email: activationMessage.email_content,
          },
        };

        console.log("=== WEBHOOK DATA ===");
        console.log(JSON.stringify(webhookData, null, 2));
        console.log("====================");

        // Pipeline interno: ENVIA de fato o acesso ao usuário (antes era só log).
        // 1) Link para o usuário DEFINIR a própria senha (melhor que senha temporária).
        let linkSenha: string | null = null;
        try { linkSenha = await gerarLinkDefinirSenha(updatedUser.id); } catch (e) { console.error("Falha ao gerar link de senha:", e); }

        const loginUrl = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || webhookData.dominio;
        const emailReal = updatedUser.email && !String(updatedUser.email).endsWith("@tel.local");

        // 2) WhatsApp com os dados de acesso (usa a sessão configurada por env).
        const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
        const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";
        if (UAZAPI_TOKEN && updatedUser.remoteJid) {
          const primeiroNome = (updatedUser.nome || "").split(" ")[0];
          const linhas = [
            `Olá ${primeiroNome}! 🎉 Sua conta no *Khesef* foi *ativada*!`,
            ``,
            linkSenha ? `👉 Crie sua senha de acesso aqui:\n${linkSenha}` : `Acesse: ${loginUrl}`,
            emailReal ? `\n*Login:* ${updatedUser.email}` : ``,
          ].filter(Boolean);
          try {
            await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, updatedUser.remoteJid, linhas.join("\n"));
            console.log(`✅ Acesso enviado por WhatsApp para ${updatedUser.remoteJid}`);
          } catch (waErr: any) {
            console.error("Falha ao enviar WhatsApp de ativação:", waErr?.message || waErr);
          }
        } else {
          console.warn("⚠️ Sem UAZAPI_TOKEN ou remoteJid — WhatsApp de ativação não enviado.");
        }

        // (E-mail de ativação: o link de criar senha já vai pelo WhatsApp; o
        //  envio por e-mail pode ser adicionado depois via mailer dedicado.)
        void emailReal;
      } catch (webhookError) {
        console.error("Erro no envio de ativação:", webhookError);
      }
    }

    // Recarrega usuário final (email/senha atualizados)
    const finalUser = (await storage.getUserById(userId)) || updatedUser;
    const { senha: _omit, ...safeUser } = finalUser as any;

    console.log("=== ADMIN UPDATE USER - SUCCESS ===");
    console.log(`Usuário ${finalUser.nome} atualizado com sucesso`);
    console.log("===================================");

    res.status(200).json({
      message: "Usuário atualizado com sucesso",
      user: safeUser,
    });
  } catch (error: any) {
    console.error("Error in updateUser:", error);
    // Unique violation Postgres
    if (error?.code === "23505") {
      const detail = String(error?.detail || "");
      if (detail.includes("email")) {
        return res.status(400).json({ error: "Este e-mail já está em uso por outro usuário." });
      }
      if (detail.includes("telefone")) {
        return res.status(400).json({ error: "Este telefone já está em uso por outro usuário." });
      }
      return res.status(400).json({ error: "Dados conflitantes com outro usuário." });
    }
    res.status(500).json({
      error: "Erro ao atualizar usuário",
      message: error?.message || undefined,
    });
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

// ============================================
// Assinaturas — ciclo (mensal/trimestral/anual) + vencimento (controle manual)
// ============================================
const MESES_CICLO: Record<string, number> = { mensal: 1, trimestral: 3, anual: 12 };
function addMeses(base: Date, meses: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// GET /api/admin/assinaturas — lista clientes com ciclo, vencimento e situação.
export async function getAssinaturas(req: Request, res: Response) {
  try {
    const todos = await storage.getAllUsers();
    const hoje = new Date();
    const lista = todos
      .filter((u) => u.tipo_usuario === "normal" || u.tipo_usuario === "usuario")
      .map((u) => {
        const venc = u.data_expiracao_assinatura ? new Date(u.data_expiracao_assinatura) : null;
        let situacao: string = "sem_data";
        let dias: number | null = null;
        if ((u.status_assinatura || "").startsWith("degustacao")) situacao = "degustacao";
        if (venc) {
          dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
          situacao = dias < 0 ? "vencido" : dias <= 7 ? "vence_breve" : "em_dia";
        }
        return {
          id: u.id, nome: u.nome, telefone: u.telefone, email: u.email,
          tipo_pessoa: (u as any).tipo_pessoa || "fisica",
          ativo: u.ativo, status_assinatura: u.status_assinatura,
          ciclo_assinatura: (u as any).ciclo_assinatura || null,
          data_expiracao_assinatura: u.data_expiracao_assinatura,
          situacao, dias_para_vencer: dias,
        };
      });
    return res.json(lista);
  } catch (err) {
    console.error("getAssinaturas:", err);
    return res.status(500).json({ error: "Erro ao listar assinaturas" });
  }
}

// POST /api/admin/assinaturas/:id/definir  { ciclo, inicio? }
// Transforma o cliente em assinante: define ciclo e calcula o vencimento.
export async function definirAssinatura(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    const { ciclo, inicio } = req.body || {};
    const meses = MESES_CICLO[ciclo];
    if (!meses) return res.status(400).json({ error: "ciclo inválido (mensal | trimestral | anual)" });
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const base = typeof inicio === "string" && /^\d{4}-\d{2}-\d{2}/.test(inicio) ? new Date(inicio) : new Date();
    const venc = addMeses(base, meses);
    const updated = await storage.updateUser(userId, {
      ciclo_assinatura: ciclo, data_expiracao_assinatura: venc, ativo: true,
      status_assinatura: "ativa", subscriptionActive: true,
    } as any);
    return res.json(updated);
  } catch (err) {
    console.error("definirAssinatura:", err);
    return res.status(500).json({ error: "Erro ao definir assinatura" });
  }
}

// POST /api/admin/assinaturas/:id/renovar  { ciclo? }
// Empurra o vencimento +1 ciclo. Se ainda válido, soma ao fim atual; se vencido, a partir de hoje.
export async function renovarAssinatura(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const ciclo = (req.body?.ciclo) || (user as any).ciclo_assinatura;
    const meses = MESES_CICLO[ciclo];
    if (!meses) return res.status(400).json({ error: "Defina o ciclo antes de renovar" });
    const hoje = new Date();
    const atual = user.data_expiracao_assinatura ? new Date(user.data_expiracao_assinatura) : hoje;
    const base = atual.getTime() > hoje.getTime() ? atual : hoje;
    const venc = addMeses(base, meses);
    const updated = await storage.updateUser(userId, {
      ciclo_assinatura: ciclo, data_expiracao_assinatura: venc, ativo: true,
      status_assinatura: "ativa", subscriptionActive: true,
    } as any);
    return res.json(updated);
  } catch (err) {
    console.error("renovarAssinatura:", err);
    return res.status(500).json({ error: "Erro ao renovar assinatura" });
  }
}

// POST /api/admin/assinaturas/:id/gerar-link  { ciclo }
// Gera um link de checkout (Asaas) já com o ciclo — o cliente preenche
// CPF/CNPJ + cartão e a assinatura recorrente é criada com o ciclo escolhido.
export async function gerarLinkCobranca(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.id);
    const { ciclo } = req.body || {};
    if (!MESES_CICLO[ciclo]) return res.status(400).json({ error: "ciclo inválido (mensal | trimestral | anual)" });
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const token = generateCheckoutToken(user.id, user.email, ciclo);
    const baseUrl = process.env.BASE_URL || "https://app.controledinheiro.com.br";
    const url = `${baseUrl}/checkout/plans?tokenaccess=${encodeURIComponent(token)}`;
    return res.json({ url, ciclo });
  } catch (err) {
    console.error("gerarLinkCobranca:", err);
    return res.status(500).json({ error: "Erro ao gerar link de cobrança" });
  }
}

// GET /api/admin/export/users-csv — Exportar usuários em formato CSV
export async function exportUsersCsv(req: Request, res: Response) {
  try {
    if (!req.user || req.user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const users = await storage.getAllUsers();
    let csv = "ID,Nome,Email,Telefone,Tipo Usuario,Tipo Pessoa,Ativo,Status Assinatura,Data Cadastro\n";
    for (const u of users) {
      csv += `"${u.id}","${u.nome || ''}","${u.email || ''}","${u.telefone || ''}","${u.tipo_usuario}","${(u as any).tipo_pessoa || 'fisica'}","${u.ativo}","${u.status_assinatura || ''}","${u.data_cadastro || ''}"\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="usuarios_khesef.csv"');
    return res.send(csv);
  } catch (err) {
    console.error("exportUsersCsv:", err);
    return res.status(500).json({ error: "Erro ao exportar usuários" });
  }
}

// GET /api/admin/export/transactions-csv — Exportar transações em formato CSV
export async function exportTransactionsCsv(req: Request, res: Response) {
  try {
    if (!req.user || req.user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const allUsers = await storage.getAllUsers();
    let csv = "ID Usuario,Nome Usuario,ID Transacao,Descricao,Valor,Tipo,Data,Status\n";
    for (const u of allUsers) {
      const wallet = await storage.getWalletByUserId(u.id);
      if (wallet) {
        const txs = await storage.getTransactionsByWalletId(wallet.id);
        for (const tx of txs) {
          csv += `"${u.id}","${u.nome}","${tx.id}","${tx.descricao.replace(/"/g, '""')}","${tx.valor}","${tx.tipo}","${tx.data_transacao}","${tx.status || 'Efetivada'}"\n`;
        }
      }
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transacoes_khesef.csv"');
    return res.send(csv);
  } catch (err) {
    console.error("exportTransactionsCsv:", err);
    return res.status(500).json({ error: "Erro ao exportar transações" });
  }
}