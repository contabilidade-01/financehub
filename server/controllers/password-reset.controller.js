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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gerarLinkDefinirSenha = gerarLinkDefinirSenha;
exports.forgotPassword = forgotPassword;
exports.checkResetToken = checkResetToken;
exports.resetPassword = resetPassword;
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const storage_1 = require("../storage");
const mailer_1 = require("../services/mailer");
const admin_notify_1 = require("../services/admin-notify");
const uazapi_service_1 = require("../services/uazapi.service");
const GENERIC_FORGOT_MSG = "Se o e-mail estiver cadastrado, você receberá um link em instantes.";
function hashToken(raw) {
    return crypto_1.default.createHash("sha256").update(raw, "utf8").digest("hex");
}
function normalizeEmail(val) {
    if (val == null)
        return "";
    return String(val).trim().toLowerCase();
}
function isPlaceholderEmail(email) {
    return !email || email.toLowerCase().endsWith("@tel.local");
}
function isCadastroPendente(user) {
    const status = user.status_assinatura || "";
    if (isPlaceholderEmail(user.email))
        return true;
    return (status === "aguardando_cadastro" ||
        status === "aguardando_email" ||
        status === "aguardando_form");
}
function onlyDigits(v, max = 20) {
    return String(v || "").replace(/\D/g, "").slice(0, max);
}
function resetTtlMinutes() {
    return Math.min(Math.max(parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || "60", 10), 5), 24 * 7);
}
/**
 * Gera um link de "criar/definir senha" para um usuário (reaproveita a infra de
 * reset). Usado no onboarding e na ativação manual pelo admin. TTL longo (7 dias
 * por padrão), pois é o primeiro acesso. Retorna a URL ou null se faltar config.
 */
async function gerarLinkDefinirSenha(userId, ttlMinutos = 60 * 24 * 7) {
    const publicUrl = (0, mailer_1.getPublicAppUrl)();
    if (!publicUrl)
        return null;
    const rawToken = crypto_1.default.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlMinutos * 60 * 1000);
    await db_1.db.delete(schema_1.passwordResetTokens).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.usuario_id, userId), (0, drizzle_orm_1.isNull)(schema_1.passwordResetTokens.used_at)));
    await db_1.db.insert(schema_1.passwordResetTokens).values({
        token_hash: tokenHash, usuario_id: userId, expires_at: expiresAt,
    });
    return `${publicUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}
/**
 * POST /api/auth/forgot-password  { email }
 * Resposta sempre genérica (não vaza se a conta existe).
 */
async function forgotPassword(req, res) {
    var _a, _b;
    try {
        const schema = zod_1.z.object({
            email: zod_1.z.string().email("E-mail inválido"),
        });
        const { email: rawEmail } = schema.parse(req.body);
        const email = normalizeEmail(rawEmail);
        if (!(0, mailer_1.isSmtpConfigured)()) {
            return res.status(503).json({
                message: "Envio de e-mail não configurado. Contate o suporte.",
            });
        }
        const publicUrl = (0, mailer_1.getPublicAppUrl)();
        if (!publicUrl) {
            console.error("[forgotPassword] PUBLIC_APP_URL / FRONTEND_URL / BASE_URL não definido");
            return res.status(503).json({
                message: "URL pública do sistema não configurada. Contate o suporte.",
            });
        }
        const userRows = await db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.sql) `lower(${schema_1.users.email}) = ${email}`)
            .limit(1);
        const user = userRows[0];
        // Sempre 200 genérico — evita enumeração de e-mails
        if (!user || !user.ativo) {
            return res.status(200).json({ message: GENERIC_FORGOT_MSG });
        }
        const rawToken = crypto_1.default.randomBytes(32).toString("hex");
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + resetTtlMinutes() * 60 * 1000);
        // Invalida tokens anteriores não usados deste usuário
        await db_1.db
            .delete(schema_1.passwordResetTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.usuario_id, user.id), (0, drizzle_orm_1.isNull)(schema_1.passwordResetTokens.used_at)));
        await db_1.db.insert(schema_1.passwordResetTokens).values({
            token_hash: tokenHash,
            usuario_id: user.id,
            expires_at: expiresAt,
        });
        const resetUrl = `${publicUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
        try {
            await (0, mailer_1.sendPasswordResetEmail)({
                to: user.email,
                resetUrl,
                systemName: process.env.SYSTEM_NAME || "Khesef",
            });
        }
        catch (err) {
            console.error("[forgotPassword] sendPasswordResetEmail:", (err === null || err === void 0 ? void 0 : err.message) || err);
            await db_1.db
                .delete(schema_1.passwordResetTokens)
                .where((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.token_hash, tokenHash));
            return res.status(503).json({
                message: "Não foi possível enviar o e-mail. Tente novamente mais tarde.",
            });
        }
        return res.status(200).json({ message: GENERIC_FORGOT_MSG });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) === "ZodError") {
            return res.status(400).json({ message: ((_b = (_a = error.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) || "Dados inválidos" });
        }
        console.error("[forgotPassword]", error);
        return res.status(500).json({ message: "Erro ao processar pedido" });
    }
}
/**
 * GET /api/auth/reset-token?token=
 */
async function checkResetToken(req, res) {
    try {
        const token = String(req.query.token || "");
        if (!token || token.length < 32) {
            return res.status(200).json({ valid: false });
        }
        const tokenHash = hashToken(token);
        const rows = await db_1.db
            .select({
            id: schema_1.passwordResetTokens.id,
            nome: schema_1.users.nome,
            telefone: schema_1.users.telefone,
            email: schema_1.users.email,
            status_assinatura: schema_1.users.status_assinatura,
        })
            .from(schema_1.passwordResetTokens)
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.passwordResetTokens.usuario_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.token_hash, tokenHash), (0, drizzle_orm_1.isNull)(schema_1.passwordResetTokens.used_at), (0, drizzle_orm_1.gt)(schema_1.passwordResetTokens.expires_at, new Date())))
            .limit(1);
        const row = rows[0];
        if (!row) {
            return res.status(200).json({ valid: false });
        }
        const cadastroPendente = isCadastroPendente(row);
        const email = isPlaceholderEmail(row.email) ? "" : (row.email || "");
        return res.status(200).json({
            valid: true,
            cadastroPendente,
            nome: row.nome || "",
            telefone: onlyDigits(row.telefone || ""),
            email,
        });
    }
    catch (error) {
        console.error("[checkResetToken]", error);
        return res.status(200).json({ valid: false });
    }
}
/**
 * POST /api/auth/reset-password  { token, novaSenha, nome?, telefone?, email? }
 * No cadastro via WhatsApp, o mesmo link completa nome/telefone/e-mail/senha.
 */
async function resetPassword(req, res) {
    var _a, _b;
    try {
        const schema = zod_1.z.object({
            token: zod_1.z.string().min(32, "Token inválido"),
            novaSenha: zod_1.z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
            nova_senha: zod_1.z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
            password: zod_1.z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
            nome: zod_1.z.string().min(2, "Informe o nome completo").optional(),
            telefone: zod_1.z.string().optional(),
            email: zod_1.z.string().optional(),
            tipo_pessoa: zod_1.z.enum(["fisica", "juridica"]).optional(),
            razao_social: zod_1.z.string().optional(),
            nome_fantasia: zod_1.z.string().optional(),
            cnpj: zod_1.z.string().optional(),
            regime_tributario: zod_1.z.string().optional(),
            segmento: zod_1.z.string().optional(),
        }).refine((d) => d.novaSenha || d.nova_senha || d.password, { message: "Nova senha é obrigatória" });
        const parsed = schema.parse(req.body);
        const novaSenha = parsed.novaSenha || parsed.nova_senha || parsed.password || "";
        const tokenHash = hashToken(parsed.token);
        const rows = await db_1.db
            .select()
            .from(schema_1.passwordResetTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.token_hash, tokenHash), (0, drizzle_orm_1.isNull)(schema_1.passwordResetTokens.used_at), (0, drizzle_orm_1.gt)(schema_1.passwordResetTokens.expires_at, new Date())))
            .limit(1);
        const row = rows[0];
        if (!row) {
            return res.status(400).json({
                message: "Link inválido ou expirado. Solicite uma nova recuperação.",
            });
        }
        const user = await storage_1.storage.getUserById(row.usuario_id);
        if (!user) {
            return res.status(400).json({ message: "Usuário não encontrado." });
        }
        const cadastroPendente = isCadastroPendente(user);
        let tipoPessoaResposta;
        if (cadastroPendente) {
            const nome = String(parsed.nome || "").trim();
            const telefone = onlyDigits(parsed.telefone || user.telefone || "");
            const email = normalizeEmail(parsed.email);
            if (nome.length < 2) {
                return res.status(400).json({ message: "Informe o nome completo." });
            }
            if (telefone.length < 10 || telefone.length > 20) {
                return res.status(400).json({ message: "Informe um telefone válido." });
            }
            if (!email || !email.includes("@") || email.endsWith("@tel.local")) {
                return res.status(400).json({ message: "Informe um e-mail válido." });
            }
            const tipoPessoa = parsed.tipo_pessoa === "juridica" ? "juridica" : parsed.tipo_pessoa === "fisica" ? "fisica" : null;
            if (!tipoPessoa) {
                return res.status(400).json({ message: "Escolha se o cadastro é pessoal (PF) ou empresarial (PJ)." });
            }
            tipoPessoaResposta = tipoPessoa;
            const existing = await storage_1.storage.getUserByEmail(email);
            if (existing && existing.id !== user.id) {
                return res.status(400).json({ message: "Esse e-mail já está cadastrado em outra conta." });
            }
            const razaoSocial = String(parsed.razao_social || "").trim();
            const nomeFantasia = String(parsed.nome_fantasia || "").trim() || null;
            const cnpj = onlyDigits(parsed.cnpj || "", 20);
            const regime = String(parsed.regime_tributario || "").trim() || null;
            const segmento = String(parsed.segmento || "").trim() || null;
            if (tipoPessoa === "juridica") {
                if (razaoSocial.length < 2) {
                    return res.status(400).json({ message: "Informe a razão social da empresa." });
                }
                if (cnpj.length !== 14) {
                    return res.status(400).json({ message: "Informe um CNPJ válido (14 dígitos)." });
                }
                const cnpjDup = await db_1.db.select({ id: schema_1.empresas.id }).from(schema_1.empresas).where((0, drizzle_orm_1.eq)(schema_1.empresas.cnpj, cnpj)).limit(1);
                if (cnpjDup.length > 0) {
                    return res.status(400).json({ message: "Este CNPJ já está cadastrado." });
                }
            }
            const fim = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
            const fmtData = (d) => d.toLocaleDateString("pt-BR");
            try {
                await storage_1.storage.updateUser(user.id, {
                    nome,
                    telefone,
                    email,
                    tipo_pessoa: tipoPessoa,
                    ativo: true,
                    status_assinatura: "degustacao",
                    data_expiracao_assinatura: fim,
                    subscriptionActive: true,
                });
            }
            catch (err) {
                const msg = String((err === null || err === void 0 ? void 0 : err.message) || "");
                if ((err === null || err === void 0 ? void 0 : err.code) === "23505" || /unique|duplicate/i.test(msg)) {
                    return res.status(400).json({ message: "Esse e-mail já está cadastrado em outra conta." });
                }
                throw err;
            }
            let empresaNome = null;
            if (tipoPessoa === "juridica") {
                try {
                    const jaTem = await storage_1.storage.getEmpresasByUsuarioId(user.id);
                    if (jaTem.length === 0) {
                        const empresa = await storage_1.storage.createEmpresa({
                            usuario_id: user.id,
                            razao_social: razaoSocial,
                            nome_fantasia: nomeFantasia || razaoSocial,
                            cnpj,
                            regime_tributario: regime,
                            segmento: segmento || "servicos",
                            ativo: true,
                        });
                        await storage_1.storage.seedEmpresasContas(empresa.id);
                        const { garantirCaixinhaPj } = await Promise.resolve().then(() => __importStar(require("../services/meio-pagamento-pj")));
                        await garantirCaixinhaPj(empresa.id, user.id);
                        empresaNome = empresa.razao_social;
                    }
                    else {
                        empresaNome = jaTem[0].razao_social;
                    }
                    if (user.remoteJid) {
                        try {
                            await storage_1.storage.deleteWhatsAppOnboardingState(user.remoteJid);
                        }
                        catch ( /* ok */_c) { /* ok */ }
                    }
                }
                catch (err) {
                    console.error("[resetPassword] falha ao criar empresa:", (err === null || err === void 0 ? void 0 : err.message) || err);
                    const msg = String((err === null || err === void 0 ? void 0 : err.message) || "");
                    if ((err === null || err === void 0 ? void 0 : err.code) === "23505" || /cnpj/i.test(msg)) {
                        return res.status(400).json({ message: "Este CNPJ já está cadastrado." });
                    }
                }
            }
            try {
                await (0, admin_notify_1.notificarAdmin)(`🆕 Cadastro WhatsApp ${tipoPessoa === "juridica" ? "PJ" : "PF"} no formulário: ${nome} | ${email} | tel ${telefone} | id=${user.id} — expira ${fmtData(fim)}`);
            }
            catch ( /* não bloquear */_d) { /* não bloquear */ }
            const uazBase = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
            const uazToken = process.env.UAZAPI_TOKEN || "";
            const primeiro = nome.split(" ")[0] || "";
            if (user.remoteJid && uazToken) {
                try {
                    if (tipoPessoa === "juridica") {
                        const nomeEmp = empresaNome || razaoSocial;
                        await uazapi_service_1.uazapiService.sendText(uazBase, uazToken, user.remoteJid, `Prontinho${primeiro ? `, ${primeiro}` : ""}! ✅ Sua degustação *empresarial* de *15 dias* está ativa até *${fmtData(fim)}*.\n\nA empresa *${nomeEmp}* já está no painel. Pode começar a registrar entradas e saídas por aqui. 📊`);
                    }
                    else {
                        await uazapi_service_1.uazapiService.sendText(uazBase, uazToken, user.remoteJid, `Prontinho${primeiro ? `, ${primeiro}` : ""}! ✅ Sua degustação de *15 dias* está ativa até *${fmtData(fim)}*.\n\nPode começar agora: me manda suas receitas e despesas por aqui que eu registro tudo. 📊`);
                    }
                }
                catch (e) {
                    console.error("[resetPassword] falha ao avisar no WhatsApp:", (e === null || e === void 0 ? void 0 : e.message) || e);
                }
            }
        }
        const success = await storage_1.storage.updatePassword(row.usuario_id, novaSenha);
        if (!success) {
            return res.status(500).json({ message: "Erro ao atualizar senha" });
        }
        await db_1.db
            .update(schema_1.passwordResetTokens)
            .set({ used_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.id, row.id));
        await db_1.db
            .delete(schema_1.passwordResetTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.passwordResetTokens.usuario_id, row.usuario_id), (0, drizzle_orm_1.isNull)(schema_1.passwordResetTokens.used_at)));
        try {
            req.session.userId = row.usuario_id;
        }
        catch (e) {
            console.error("[resetPassword] falha ao abrir sessão (auto-login):", e);
        }
        return res.status(200).json({
            message: cadastroPendente
                ? "Cadastro concluído. Você já está conectado."
                : "Senha redefinida com sucesso. Você já está conectado.",
            autenticado: true,
            tipo_pessoa: tipoPessoaResposta,
        });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) === "ZodError") {
            return res.status(400).json({ message: ((_b = (_a = error.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) || "Dados inválidos" });
        }
        const msg = String((error === null || error === void 0 ? void 0 : error.message) || "");
        if ((error === null || error === void 0 ? void 0 : error.code) === "23505" || /unique|duplicate/i.test(msg)) {
            return res.status(400).json({ message: "Esse e-mail já está cadastrado em outra conta." });
        }
        console.error("[resetPassword]", error);
        return res.status(500).json({ message: "Erro ao redefinir senha" });
    }
}
