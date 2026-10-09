import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

// Estender o tipo Request para incluir informações de personificação
declare global {
  namespace Express {
    interface Request {
      originalUser?: {
        id: number;
        tipo_usuario: string;
        nome: string;
        email: string;
      };
      isImpersonating?: boolean;
    }
  }
}

// Middleware para verificar se o usuário é super admin
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Verificar se o usuário atual (ou original) é super admin
    const userToCheck = req.originalUser || req.user;
    
    if (userToCheck.tipo_usuario !== 'super_admin') {
      console.log(`=== ACESSO NEGADO - SUPER ADMIN REQUERIDO ===`);
      console.log(`Usuário: ${userToCheck.email} (${userToCheck.tipo_usuario})`);
      console.log(`Endpoint: ${req.method} ${req.originalUrl}`);
      console.log(`==========================================`);
      
      return res.status(403).json({ 
        error: "Acesso negado", 
        message: "Apenas super administradores podem acessar este recurso" 
      });
    }

    console.log(`=== ACESSO AUTORIZADO - SUPER ADMIN ===`);
    console.log(`Super Admin: ${userToCheck.email}`);
    if (req.isImpersonating) {
      console.log(`Personificando: ${req.user.email}`);
    }
    console.log(`Endpoint: ${req.method} ${req.originalUrl}`);
    console.log(`====================================`);

    next();
  } catch (error) {
    console.error("Erro no middleware requireSuperAdmin:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

// Middleware para verificar sessões de personificação ativas
export async function checkImpersonation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return next();
    }

    // Segurança: a personificação pertence à SESSÃO do super admin. Sem a marca
    // na sessão (ex.: o próprio usuário-alvo logado, ou chamada via API token),
    // nunca herdar privilégios, mesmo que exista uma linha ativa no banco.
    const sess = req.session as any;
    if (!sess?.isImpersonating || !sess?.originalAdmin?.id) {
      return next();
    }

    // Verificar se existe uma sessão de personificação ativa para este usuário
    const activeSession = await storage.getActiveImpersonationSession(req.user.id);
    
    if (activeSession && activeSession.super_admin_id === sess.originalAdmin.id) {
      // Buscar dados do super admin original
      const originalUser = await storage.getUserById(activeSession.super_admin_id);
      
      if (originalUser && originalUser.tipo_usuario === 'super_admin') {
        req.originalUser = {
          id: originalUser.id,
          tipo_usuario: originalUser.tipo_usuario,
          nome: originalUser.nome,
          email: originalUser.email
        };
        req.isImpersonating = true;
        
        // Set impersonation context for the user controller
        (req as any).impersonationContext = {
          originalAdmin: originalUser,
          impersonatedUser: req.user
        };
        
        console.log(`=== SESSÃO DE PERSONIFICAÇÃO ATIVA ===`);
        console.log(`Super Admin Original: ${originalUser.email}`);
        console.log(`Usuário Personificado: ${req.user.email}`);
        console.log(`===================================`);
      }
    }

    next();
  } catch (error) {
    console.error("Erro no middleware checkImpersonation:", error);
    next(); // Continuar mesmo em caso de erro
  }
}