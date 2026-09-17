"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.logout = logout;
exports.getCurrentUser = getCurrentUser;
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.updatePassword = updatePassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
const zod_1 = require("zod");
const notification_service_1 = require("../services/notification.service");
// Função utilitária para validar telefone numérico com country code 55
function validateTelefone(telefone) {
    const digits = telefone.toString();
    if (!digits.startsWith("55"))
        return "O telefone deve começar com o código do Brasil (55)";
    if (digits.length < 12 || digits.length > 13)
        return "Telefone deve ter 12 ou 13 dígitos (incluindo DDI)";
    if (!/^\d+$/.test(digits))
        return "Telefone deve conter apenas números";
    return null;
}
// User registration
async function register(req, res) {
    try {
        // Novo schema: telefone flexível
        const registerSchema = zod_1.z.object({
            nome: zod_1.z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
            email: zod_1.z.string().email("Email inválido"),
            senha: zod_1.z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
            telefone: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().refine((val) => {
                if (val === undefined || val === null || val === "")
                    return true;
                const digits = typeof val === "number" ? val.toString() : val;
                return /^55\d{10,11}$/.test(digits);
            }, "Telefone deve ser numérico, começar com 55 e ter 12 ou 13 dígitos"),
            remoteJid: zod_1.z.string().optional(),
            tipo_usuario: zod_1.z.string().optional(),
            // PF/PJ: vem da página de vendas (?tipo). Default PF. Define qual plano
            // (39,90 PF / 79,90 PJ) o checkout vai oferecer e cobrar no Asaas.
            tipo_pessoa: zod_1.z.enum(["fisica", "juridica"]).optional(),
        });
        const userData = registerSchema.parse(req.body);
        // Check if user with email already exists
        const existingUser = await storage_1.storage.getUserByEmail(userData.email);
        if (existingUser) {
            return res.status(400).json({ message: "Email já está em uso." });
        }
        // Check if remoteJid already exists (if provided)
        if (userData.remoteJid) {
            const existingRemoteJid = await storage_1.storage.getUserByRemoteJid(userData.remoteJid);
            if (existingRemoteJid) {
                return res.status(400).json({ message: "RemoteJid já está em uso." });
            }
        }
        // Validação de telefone (opcional, mas se fornecido deve ser válido)
        let telefoneNum = undefined;
        if (userData.telefone !== undefined && userData.telefone !== null && userData.telefone !== "") {
            telefoneNum = Number(userData.telefone);
            const err = validateTelefone(telefoneNum);
            if (err)
                return res.status(400).json({ message: err });
            userData.telefone = telefoneNum.toString();
        }
        // Após normalizar o telefone, verificar duplicidade
        if (userData.telefone) {
            const existingPhoneUser = await storage_1.storage.getUserByPhone(userData.telefone);
            if (existingPhoneUser) {
                return res.status(400).json({ message: "Este número de telefone já está em uso por outro usuário." });
            }
        }
        // Create user
        const userDataToSave = Object.assign(Object.assign({}, userData), { telefone: telefoneNum ? telefoneNum.toString() : undefined, tipo_pessoa: userData.tipo_pessoa || "fisica" });
        const newUser = await storage_1.storage.createUser(userDataToSave);
        console.log(`[Register] User created - ID: ${newUser.id}, Email: ${newUser.email}`);
        // Ativação automática: 1º acesso ao portal inicia a degustação de 15 dias.
        try {
            const fim = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
            await storage_1.storage.updateUser(newUser.id, {
                ativo: true,
                status_assinatura: "degustacao",
                data_expiracao_assinatura: fim,
                subscriptionActive: true,
            });
            newUser.data_expiracao_assinatura = fim;
            newUser.status_assinatura = "degustacao";
            newUser.subscriptionActive = true;
            console.log(`[Register] Degustação de 15 dias iniciada para user ${newUser.id} (expira ${fim.toISOString().slice(0, 10)})`);
        }
        catch (e) {
            console.error(`[Register] Falha ao iniciar degustação:`, e === null || e === void 0 ? void 0 : e.message);
        }
        // Create default wallet for new user
        await storage_1.storage.createWallet({
            usuario_id: newUser.id,
            nome: "Principal"
        });
        // Don't send back password
        const { senha } = newUser, userWithoutPassword = __rest(newUser, ["senha"]);
        // Set session
        req.session.userId = newUser.id;
        // Enviar webhook de boas-vindas com link de pagamento (async, não bloqueia resposta)
        (async () => {
            try {
                const postgres = (await Promise.resolve().then(() => __importStar(require('postgres')))).default;
                const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
                const result = await client `
          SELECT title, message, email_content
          FROM welcome_messages
          WHERE type = 'welcome'
        `;
                if (result.length > 0) {
                    const welcomeMessage = result[0];
                    const notificationService = (0, notification_service_1.getNotificationService)();
                    // Processar tags incluindo {link_pagamento}
                    const processedTitle = notificationService.processMessageTags(welcomeMessage.title, newUser);
                    const processedMessage = notificationService.processMessageTags(welcomeMessage.message, newUser);
                    const processedEmailContent = notificationService.processMessageTags(welcomeMessage.email_content || welcomeMessage.message, newUser);
                    // Enviar webhook de boas-vindas
                    const webhookData = {
                        evento: "usuario_registrado",
                        timestamp: new Date().toISOString(),
                        dominio: process.env.BASE_URL || 'https://app.controledinheiro.com.br',
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
                    // === N8N DESATIVADO — pipeline agora roda via app (POST /api/webhook/uazapi) ===
                    // const webhookResponse = await fetch(
                    //   process.env.WEBHOOK_BOAS_VINDAS_URL || process.env.WEBHOOK_ATIVACAO_URL || 'https://prod-wf.pulsofinanceiro.net.br/webhook/boasvindas',
                    //   {
                    //     method: 'POST',
                    //     headers: {
                    //       'Content-Type': 'application/json',
                    //     },
                    //     body: JSON.stringify(webhookData)
                    //   }
                    // );
                    //
                    // if (webhookResponse.ok) {
                    //   console.log('[UserRegister] Webhook de boas-vindas enviado com sucesso');
                    // } else {
                    //   console.error('[UserRegister] Erro ao enviar webhook:', webhookResponse.status);
                    // }
                    console.log('[UserRegister] Webhook N8N desativado — boas-vindas agora via pipeline interno (UazAPI).');
                }
                await client.end();
            }
            catch (webhookError) {
                console.error('[UserRegister] Erro ao enviar webhook de boas-vindas:', webhookError);
            }
        })();
        res.status(201).json({ user: userWithoutPassword });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in register:", error);
        res.status(500).json({ message: "Erro ao registrar usuário" });
    }
}
// User login
async function login(req, res) {
    try {
        console.log("=== LOGIN ATTEMPT ===");
        console.log("Email:", req.body.email);
        // Validate request body
        const loginData = schema_1.loginUserSchema.parse(req.body);
        // Find user by email
        const user = await storage_1.storage.getUserByEmail(loginData.email);
        console.log("User found:", user ? { id: user.id, email: user.email, ativo: user.ativo } : "not found");
        if (!user) {
            console.log("LOGIN DENIED: User not found");
            return res.status(401).json({ message: "Usuário ou senha incorretos ou inexistentes!" });
        }
        // Verify password first
        const isPasswordValid = await bcryptjs_1.default.compare(loginData.senha, user.senha);
        if (!isPasswordValid) {
            console.log("LOGIN DENIED: Invalid password");
            return res.status(401).json({ message: "Usuário ou senha incorretos ou inexistentes!" });
        }
        // Expirado NÃO impede o login: o overlay + /subscription/renew deixam o
        // cliente pagar sozinho no Asaas. Só bloqueia conta desligada pelo admin
        // (ativo=false) quando ainda não venceu — nesses casos não é self-service.
        const expiradoPorData = !!(user.data_expiracao_assinatura &&
            new Date(user.data_expiracao_assinatura) <= new Date());
        const statusAssinatura = String(user.status_assinatura || "");
        const expiradoParaPagar = expiradoPorData ||
            statusAssinatura.startsWith("degustacao_expirada") ||
            statusAssinatura === "inativa";
        if (!expiradoParaPagar && user.ativo !== true) {
            console.log("LOGIN DENIED: User is not active. Status:", user.ativo);
            return res.status(401).json({ message: "Usuário ou senha incorretos ou inexistentes!" });
        }
        console.log("LOGIN SUCCESS: User authenticated successfully");
        // Update last access
        await storage_1.storage.updateUser(user.id, { ultimo_acesso: new Date() });
        // Set session
        req.session.userId = user.id;
        // Don't send back password
        const { senha } = user, userWithoutPassword = __rest(user, ["senha"]);
        res.status(200).json({ user: userWithoutPassword });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in login:", error);
        res.status(500).json({ message: "Erro ao fazer login" });
    }
}
// User logout
async function logout(req, res) {
    try {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ message: "Erro ao fazer logout" });
            }
            res.clearCookie("connect.sid");
            res.status(200).json({ message: "Logout realizado com sucesso" });
        });
    }
    catch (error) {
        console.error("Error in logout:", error);
        res.status(500).json({ message: "Erro ao fazer logout" });
    }
}
// Get current logged-in user
async function getCurrentUser(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const session = req.session;
        const impersonationContext = req.impersonationContext;
        // Don't send back password
        const _a = req.user, { senha } = _a, userWithoutPassword = __rest(_a, ["senha"]);
        // Estrutura base da resposta
        const response = Object.assign(Object.assign({}, userWithoutPassword), { isImpersonating: false, originalAdmin: null });
        // Se está impersonificando, adiciona contexto
        if (session.isImpersonating) {
            response.isImpersonating = true;
            // Use originalAdmin from session or impersonationContext
            if (session.originalAdmin) {
                const _b = session.originalAdmin, { senha: adminPassword } = _b, originalAdminWithoutPassword = __rest(_b, ["senha"]);
                response.originalAdmin = originalAdminWithoutPassword;
                console.log("=== SESSÃO COM IMPERSONIFICAÇÃO ===");
                console.log("Usuário atual (impersonificado):", userWithoutPassword.email);
                console.log("Admin original:", originalAdminWithoutPassword.email);
                console.log("=====================================");
            }
            else if (impersonationContext) {
                const _c = impersonationContext.originalAdmin, { senha: adminPassword } = _c, originalAdminWithoutPassword = __rest(_c, ["senha"]);
                response.originalAdmin = originalAdminWithoutPassword;
                console.log("=== SESSÃO COM IMPERSONIFICAÇÃO (CONTEXT) ===");
                console.log("Usuário atual (impersonificado):", userWithoutPassword.email);
                console.log("Admin original:", originalAdminWithoutPassword.email);
                console.log("==========================================");
            }
        }
        res.status(200).json(response);
    }
    catch (error) {
        console.error("Error in getCurrentUser:", error);
        res.status(500).json({ message: "Erro ao obter usuário atual" });
    }
}
// Get user profile
async function getProfile(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Get user
        const user = await storage_1.storage.getUserById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado" });
        }
        // Don't send back password
        const { senha } = user, userWithoutPassword = __rest(user, ["senha"]);
        res.status(200).json(userWithoutPassword);
    }
    catch (error) {
        console.error("Error in getProfile:", error);
        res.status(500).json({ message: "Erro ao obter perfil do usuário" });
    }
}
// Update user profile
async function updateProfile(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Novo schema: telefone flexível
        const updateSchema = zod_1.z.object({
            nome: zod_1.z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
            email: zod_1.z.string().email("Email inválido"),
            telefone: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional().refine((val) => {
                if (val === undefined || val === null || val === "")
                    return true;
                const digits = typeof val === "number" ? val.toString() : val;
                return /^55\d{10,11}$/.test(digits);
            }, "Telefone deve ser numérico, começar com 55 e ter 12 ou 13 dígitos"),
        });
        const updateData = updateSchema.parse(req.body);
        // Check if email is already in use by another user
        if (updateData.email) {
            const existingUser = await storage_1.storage.getUserByEmail(updateData.email);
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({ message: "Email já está em uso por outro usuário." });
            }
        }
        // Para updateProfile, só bloquear se o telefone for de outro usuário
        let telefoneNum = undefined;
        if (updateData.telefone) {
            telefoneNum = Number(updateData.telefone);
            const existingPhoneUser = await storage_1.storage.getUserByPhone(telefoneNum.toString());
            if (existingPhoneUser && existingPhoneUser.id !== userId) {
                return res.status(400).json({ message: "Este número de telefone já está em uso por outro usuário." });
            }
        }
        // Validação de telefone (opcional, mas se fornecido deve ser válido)
        if (telefoneNum) {
            const err = validateTelefone(telefoneNum);
            if (err)
                return res.status(400).json({ message: err });
        }
        // Converter telefone para string antes de salvar no banco
        const updateDataToSave = Object.assign(Object.assign({}, updateData), { telefone: telefoneNum ? telefoneNum.toString() : undefined });
        // Update user
        const updatedUser = await storage_1.storage.updateUser(userId, updateDataToSave);
        if (!updatedUser) {
            return res.status(404).json({ message: "Usuário não encontrado" });
        }
        // Don't send back password
        const { senha } = updatedUser, userWithoutPassword = __rest(updatedUser, ["senha"]);
        res.status(200).json(userWithoutPassword);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in updateProfile:", error);
        res.status(500).json({ message: "Erro ao atualizar perfil do usuário" });
    }
}
// Update user password
async function updatePassword(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Validate request body - aceitar ambos os formatos (camelCase e snake_case)
        const passwordSchema = zod_1.z.object({
            senhaAtual: zod_1.z.string().min(1, "Senha atual é obrigatória").optional(),
            novaSenha: zod_1.z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
            senha_atual: zod_1.z.string().min(1, "Senha atual é obrigatória").optional(),
            nova_senha: zod_1.z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
        }).refine((data) => (data.senhaAtual || data.senha_atual) && (data.novaSenha || data.nova_senha), { message: "Senha atual e nova senha são obrigatórias" });
        const parsedData = passwordSchema.parse(req.body);
        // Normalizar os dados para usar sempre o mesmo formato
        const passwordData = {
            senhaAtual: parsedData.senhaAtual || parsedData.senha_atual || '',
            novaSenha: parsedData.novaSenha || parsedData.nova_senha || ''
        };
        // Get user
        const user = await storage_1.storage.getUserById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuário não encontrado" });
        }
        // Verify current password
        const isPasswordValid = await bcryptjs_1.default.compare(passwordData.senhaAtual, user.senha);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Senha atual incorreta" });
        }
        // Update password
        const success = await storage_1.storage.updatePassword(userId, passwordData.novaSenha);
        if (!success) {
            return res.status(500).json({ message: "Erro ao atualizar senha" });
        }
        res.status(200).json({ message: "Senha atualizada com sucesso" });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in updatePassword:", error);
        res.status(500).json({ message: "Erro ao atualizar senha" });
    }
}
