import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { insertUserSchema, loginUserSchema } from "@shared/schema";
import { z } from "zod";
import { getNotificationService } from "../services/notification.service";

// Função utilitária para validar telefone numérico com country code 55
function validateTelefone(telefone: number): string | null {
  const digits = telefone.toString();
  if (!digits.startsWith("55")) return "O telefone deve começar com o código do Brasil (55)";
  if (digits.length < 12 || digits.length > 13) return "Telefone deve ter 12 ou 13 dígitos (incluindo DDI)";
  if (!/^\d+$/.test(digits)) return "Telefone deve conter apenas números";
  return null;
}

// User registration
export async function register(req: Request, res: Response) {
  try {
    // Novo schema: telefone flexível
    const registerSchema = z.object({
      nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
      email: z.string().email("Email inválido"),
      senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
      telefone: z.union([z.string(), z.number()]).optional().refine((val) => {
        if (val === undefined || val === null || val === "") return true;
        const digits = typeof val === "number" ? val.toString() : val;
        return /^55\d{10,11}$/.test(digits);
      }, "Telefone deve ser numérico, começar com 55 e ter 12 ou 13 dígitos"),
      remoteJid: z.string().optional(),
      tipo_usuario: z.string().optional(),
    });
    const userData = registerSchema.parse(req.body);
    
    // Check if user with email already exists
    const existingUser = await storage.getUserByEmail(userData.email);
    if (existingUser) {
      return res.status(400).json({ message: "Email já está em uso." });
    }
    
    // Check if remoteJid already exists (if provided)
    if (userData.remoteJid) {
      const existingRemoteJid = await storage.getUserByRemoteJid(userData.remoteJid);
      if (existingRemoteJid) {
        return res.status(400).json({ message: "RemoteJid já está em uso." });
      }
    }
    
    // Validação de telefone (opcional, mas se fornecido deve ser válido)
    let telefoneNum: number | undefined = undefined;
    if (userData.telefone !== undefined && userData.telefone !== null && userData.telefone !== "") {
      telefoneNum = Number(userData.telefone);
      const err = validateTelefone(telefoneNum);
      if (err) return res.status(400).json({ message: err });
      userData.telefone = telefoneNum.toString();
    }
    
    // Após normalizar o telefone, verificar duplicidade
    if (userData.telefone) {
      const existingPhoneUser = await storage.getUserByPhone(userData.telefone);
      if (existingPhoneUser) {
        return res.status(400).json({ message: "Este número de telefone já está em uso por outro usuário." });
      }
    }
    
    // Create user
    const userDataToSave = {
      ...userData,
      telefone: telefoneNum ? telefoneNum.toString() : undefined
    };
    const newUser = await storage.createUser(userDataToSave);

    console.log(`[Register] User created - ID: ${newUser.id}, Email: ${newUser.email}`);

    // Create default wallet for new user
    await storage.createWallet({
      usuario_id: newUser.id,
      nome: "Principal"
    });
    
    // Don't send back password
    const { senha, ...userWithoutPassword } = newUser;

    // Set session
    (req.session as any).userId = newUser.id;

    // Enviar webhook de boas-vindas com link de pagamento (async, não bloqueia resposta)
    (async () => {
      try {
        const postgres = (await import('postgres')).default;
        const client = postgres(process.env.DATABASE_URL || '', { prepare: false });

        const result = await client`
          SELECT title, message, email_content
          FROM welcome_messages
          WHERE type = 'welcome'
        `;

        if (result.length > 0) {
          const welcomeMessage = result[0];
          const notificationService = getNotificationService();

          // Processar tags incluindo {link_pagamento}
          const processedTitle = notificationService.processMessageTags(welcomeMessage.title, newUser);
          const processedMessage = notificationService.processMessageTags(welcomeMessage.message, newUser);
          const processedEmailContent = notificationService.processMessageTags(
            welcomeMessage.email_content || welcomeMessage.message,
            newUser
          );

          // Enviar webhook de boas-vindas
          const webhookData = {
            evento: "usuario_registrado",
            timestamp: new Date().toISOString(),
            dominio: process.env.BASE_URL || 'https://financehub.xpiria.com.br',
            id: newUser.id,
            nome: newUser.nome,
            email: newUser.email,
            telefone: newUser.telefone,
            tipo_usuario: newUser.tipo_usuario,
            data_cadastro: newUser.data_cadastro,
            mensagem_boas_vindas: {
              titulo: processedTitle,
              mensagem: processedMessage,
              conteudo_email: processedEmailContent
            }
          };

          console.log('[UserRegister] Enviando webhook de boas-vindas...');
          const webhookResponse = await fetch(
            process.env.WEBHOOK_BOAS_VINDAS_URL || process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/boasvindas',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(webhookData)
            }
          );

          if (webhookResponse.ok) {
            console.log('[UserRegister] Webhook de boas-vindas enviado com sucesso');
          } else {
            console.error('[UserRegister] Erro ao enviar webhook:', webhookResponse.status);
          }
        }

        await client.end();
      } catch (webhookError) {
        console.error('[UserRegister] Erro ao enviar webhook de boas-vindas:', webhookError);
      }
    })();

    res.status(201).json({ user: userWithoutPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
    }
    console.error("Error in register:", error);
    res.status(500).json({ message: "Erro ao registrar usuário" });
  }
}

// User login
export async function login(req: Request, res: Response) {
  try {
    console.log("=== LOGIN ATTEMPT ===");
    console.log("Email:", req.body.email);
    
    // Validate request body
    const loginData = loginUserSchema.parse(req.body);
    
    // Find user by email
    const user = await storage.getUserByEmail(loginData.email);
    console.log("User found:", user ? { id: user.id, email: user.email, ativo: user.ativo } : "not found");
    
    if (!user) {
      console.log("LOGIN DENIED: User not found");
      return res.status(401).json({ message: "Usuário ou senha incorretos ou inexistentes!" });
    }
    
    // Verify password first
    const isPasswordValid = await bcrypt.compare(loginData.senha, user.senha);
    if (!isPasswordValid) {
      console.log("LOGIN DENIED: Invalid password");
      return res.status(401).json({ message: "Usuário ou senha incorretos ou inexistentes!" });
    }

    // Check subscription expiration BEFORE checking if user is active
    if (user.data_expiracao_assinatura) {
      const now = new Date();
      const expirationDate = new Date(user.data_expiracao_assinatura);
      
      console.log("=== SUBSCRIPTION EXPIRATION CHECK ===");
      console.log(`Current date: ${now.toISOString()}`);
      console.log(`Expiration date: ${expirationDate.toISOString()}`);
      console.log(`Is expired: ${now > expirationDate}`);
      console.log("====================================");
      
      if (now > expirationDate) {
        console.log("LOGIN DENIED: Subscription expired - ensuring user is deactivated");
        
        // Ensure user is deactivated if subscription expired
        if (user.ativo) {
          await storage.updateUser(user.id, { 
            ativo: false,
            ultimo_acesso: new Date()
          });
        }
        
        return res.status(401).json({ 
          message: "Sua assinatura expirou. Entre em contato com o administrador.",
          subscriptionExpired: true
        });
      }
    }

    // Check if user is active - AFTER subscription check
    if (user.ativo !== true) {
      console.log("LOGIN DENIED: User is not active. Status:", user.ativo);
      return res.status(401).json({ message: "Usuário ou senha incorretos ou inexistentes!" });
    }
    
    console.log("LOGIN SUCCESS: User authenticated successfully");
    
    // Update last access
    await storage.updateUser(user.id, { ultimo_acesso: new Date() });
    
    // Set session
    (req.session as any).userId = user.id;
    
    // Don't send back password
    const { senha, ...userWithoutPassword } = user;
    
    res.status(200).json({ user: userWithoutPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
    }
    console.error("Error in login:", error);
    res.status(500).json({ message: "Erro ao fazer login" });
  }
}

// User logout
export async function logout(req: Request, res: Response) {
  try {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao fazer logout" });
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ message: "Logout realizado com sucesso" });
    });
  } catch (error) {
    console.error("Error in logout:", error);
    res.status(500).json({ message: "Erro ao fazer logout" });
  }
}

// Get current logged-in user
export async function getCurrentUser(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const session = req.session as any;
    const impersonationContext = (req as any).impersonationContext;
    
    // Don't send back password
    const { senha, ...userWithoutPassword } = req.user;
    
    // Estrutura base da resposta
    const response: any = {
      ...userWithoutPassword,
      isImpersonating: false,
      originalAdmin: null
    };
    
    // Se está impersonificando, adiciona contexto
    if (session.isImpersonating) {
      response.isImpersonating = true;
      
      // Use originalAdmin from session or impersonationContext
      if (session.originalAdmin) {
        const { senha: adminPassword, ...originalAdminWithoutPassword } = session.originalAdmin;
        response.originalAdmin = originalAdminWithoutPassword;
        
        console.log("=== SESSÃO COM IMPERSONIFICAÇÃO ===");
        console.log("Usuário atual (impersonificado):", userWithoutPassword.email);
        console.log("Admin original:", originalAdminWithoutPassword.email);
        console.log("=====================================");
      } else if (impersonationContext) {
        const { senha: adminPassword, ...originalAdminWithoutPassword } = impersonationContext.originalAdmin;
        response.originalAdmin = originalAdminWithoutPassword;
        
        console.log("=== SESSÃO COM IMPERSONIFICAÇÃO (CONTEXT) ===");
        console.log("Usuário atual (impersonificado):", userWithoutPassword.email);
        console.log("Admin original:", originalAdminWithoutPassword.email);
        console.log("==========================================");
      }
    }
    
    res.status(200).json(response);
  } catch (error) {
    console.error("Error in getCurrentUser:", error);
    res.status(500).json({ message: "Erro ao obter usuário atual" });
  }
}

// Get user profile
export async function getProfile(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    
    // Get user
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    
    // Don't send back password
    const { senha, ...userWithoutPassword } = user;
    
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    console.error("Error in getProfile:", error);
    res.status(500).json({ message: "Erro ao obter perfil do usuário" });
  }
}

// Update user profile
export async function updateProfile(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    
    // Novo schema: telefone flexível
    const updateSchema = z.object({
      nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
      email: z.string().email("Email inválido"),
      telefone: z.union([z.string(), z.number()]).optional().refine((val) => {
        if (val === undefined || val === null || val === "") return true;
        const digits = typeof val === "number" ? val.toString() : val;
        return /^55\d{10,11}$/.test(digits);
      }, "Telefone deve ser numérico, começar com 55 e ter 12 ou 13 dígitos"),
    });
    
    const updateData = updateSchema.parse(req.body);
    
    // Check if email is already in use by another user
    if (updateData.email) {
      const existingUser = await storage.getUserByEmail(updateData.email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Email já está em uso por outro usuário." });
      }
    }
    
    // Para updateProfile, só bloquear se o telefone for de outro usuário
    let telefoneNum: number | undefined = undefined;
    if (updateData.telefone) {
      telefoneNum = Number(updateData.telefone);
      const existingPhoneUser = await storage.getUserByPhone(telefoneNum.toString());
      if (existingPhoneUser && existingPhoneUser.id !== userId) {
        return res.status(400).json({ message: "Este número de telefone já está em uso por outro usuário." });
      }
    }
    
    // Validação de telefone (opcional, mas se fornecido deve ser válido)
    if (telefoneNum) {
      const err = validateTelefone(telefoneNum);
      if (err) return res.status(400).json({ message: err });
    }
    // Converter telefone para string antes de salvar no banco
    const updateDataToSave = {
      ...updateData,
      telefone: telefoneNum ? telefoneNum.toString() : undefined
    };
    
    // Update user
    const updatedUser = await storage.updateUser(userId, updateDataToSave);
    if (!updatedUser) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    
    // Don't send back password
    const { senha, ...userWithoutPassword } = updatedUser;
    
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
    }
    console.error("Error in updateProfile:", error);
    res.status(500).json({ message: "Erro ao atualizar perfil do usuário" });
  }
}

// Update user password
export async function updatePassword(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    
    // Validate request body - aceitar ambos os formatos (camelCase e snake_case)
    const passwordSchema = z.object({
      senhaAtual: z.string().min(1, "Senha atual é obrigatória").optional(),
      novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
      senha_atual: z.string().min(1, "Senha atual é obrigatória").optional(),
      nova_senha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
    }).refine(
      (data) => (data.senhaAtual || data.senha_atual) && (data.novaSenha || data.nova_senha),
      { message: "Senha atual e nova senha são obrigatórias" }
    );
    
    const parsedData = passwordSchema.parse(req.body);
    
    // Normalizar os dados para usar sempre o mesmo formato
    const passwordData = {
      senhaAtual: parsedData.senhaAtual || parsedData.senha_atual || '',
      novaSenha: parsedData.novaSenha || parsedData.nova_senha || ''
    };
    
    // Get user
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(passwordData.senhaAtual, user.senha);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Senha atual incorreta" });
    }
    
    // Update password
    const success = await storage.updatePassword(userId, passwordData.novaSenha);
    if (!success) {
      return res.status(500).json({ message: "Erro ao atualizar senha" });
    }
    
    res.status(200).json({ message: "Senha atualizada com sucesso" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
    }
    console.error("Error in updatePassword:", error);
    res.status(500).json({ message: "Erro ao atualizar senha" });
  }
}
