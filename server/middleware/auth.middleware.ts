import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { User } from "../../shared/schema";

// Declaração global para estender o tipo Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = req.session as any;
    
    // Se há impersonificação ativa, usar o usuário impersonificado
    if (session.isImpersonating && session.user) {
      const impersonatedUser = await storage.getUserById(session.user.id);
      if (!impersonatedUser) {
        // Usuário impersonificado não existe mais, limpar sessão
        session.isImpersonating = false;
        delete session.user;
        delete session.originalAdmin;
        return res.status(401).json({ error: "Usuário impersonificado não encontrado" });
      }
      
      req.user = impersonatedUser;
      return next();
    }
    
    // Check if user ID exists in session
    const userId = session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    // Verify user exists
    const user = await storage.getUserById(userId);
    if (!user) {
      // Clear invalid session
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
      });
      
      return res.status(401).json({ error: "Usuário não encontrado" });
    }
    
    // Adicionar o usuário à requisição
    req.user = user;
    
    // User is authenticated, proceed to next middleware
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Erro de autenticação" });
  }
}
