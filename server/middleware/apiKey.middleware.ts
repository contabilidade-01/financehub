import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { contaBloqueadaPeloAdmin } from "../utils/usuario-ativo";

/**
 * Middleware para autenticação via API Key
 * Verifica se o token API fornecido no cabeçalho "apikey" é válido
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Obter o token do cabeçalho apikey
    const apiKey = req.headers.apikey as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: "Token de API ausente" });
    }
    
    // Verificar se o token existe e está ativo
    const token = await storage.getApiTokenByToken(apiKey);
    
    if (!token) {
      return res.status(401).json({ error: "Token de API inválido" });
    }
    
    if (!token.ativo) {
      return res.status(401).json({ error: "Token de API inativo" });
    }
    
    // Verificar se o token expirou
    if (token.data_expiracao && new Date(token.data_expiracao) < new Date()) {
      return res.status(401).json({ error: "Token de API expirado" });
    }
    
    // Carregar o usuário associado ao token
    const user = await storage.getUserById(token.usuario_id);
    
    if (!user) {
      return res.status(401).json({ error: "Usuário associado ao token não encontrado" });
    }
    if (contaBloqueadaPeloAdmin(user)) {
      return res.status(401).json({ error: "Conta desativada" });
    }
    
    // Adicionar usuário e token à requisição
    req.user = user;
    
    // Continuar para o próximo middleware
    next();
  } catch (error) {
    console.error("API Key auth error:", error);
    res.status(500).json({ error: "Erro de autenticação" });
  }
}