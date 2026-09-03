/**
 * Recuperação de senha — espelha o fluxo do nescon-clientes (auth forgot/reset).
 * Login do Khesef e por e-mail; token hasheado (SHA-256), uso único, TTL configurável.
 */
import { Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { users, passwordResetTokens } from "../../shared/schema";
import { storage } from "../storage";
import {
  isSmtpConfigured,
  getPublicAppUrl,
  sendPasswordResetEmail,
} from "../services/mailer";
import { notificarAdmin } from "../services/admin-notify";
import { uazapiService } from "../services/uazapi.service";

const GENERIC_FORGOT_MSG =
  "Se o e-mail estiver cadastrado, você receberá um link em instantes.";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function normalizeEmail(val: unknown): string {
  if (val == null) return "";
  return String(val).trim().toLowerCase();
}

function isPlaceholderEmail(email?: string | null): boolean {
  return !email || email.toLowerCase().endsWith("@tel.local");
}

function isCadastroPendente(user: {
  email?: string | null;
  status_assinatura?: string | null;
}): boolean {
  const status = user.status_assinatura || "";
  if (isPlaceholderEmail(user.email)) return true;
  return (
    status === "aguardando_cadastro" ||
    status === "aguardando_email" ||
    status === "aguardando_form"
  );
}

function onlyDigits(v: string, max = 20): string {
  return String(v || "").replace(/\D/g, "").slice(0, max);
}

function resetTtlMinutes(): number {
  return Math.min(
    Math.max(parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || "60", 10), 5),
    24 * 7
  );
}

/**
 * Gera um link de "criar/definir senha" para um usuário (reaproveita a infra de
 * reset). Usado no onboarding e na ativação manual pelo admin. TTL longo (7 dias
 * por padrão), pois é o primeiro acesso. Retorna a URL ou null se faltar config.
 */
export async function gerarLinkDefinirSenha(userId: number, ttlMinutos = 60 * 24 * 7): Promise<string | null> {
  const publicUrl = getPublicAppUrl();
  if (!publicUrl) return null;
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutos * 60 * 1000);
  await db.delete(passwordResetTokens).where(
    and(eq(passwordResetTokens.usuario_id, userId), isNull(passwordResetTokens.used_at))
  );
  await db.insert(passwordResetTokens).values({
    token_hash: tokenHash, usuario_id: userId, expires_at: expiresAt,
  });
  return `${publicUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * POST /api/auth/forgot-password  { email }
 * Resposta sempre genérica (não vaza se a conta existe).
 */
export async function forgotPassword(req: Request, res: Response) {
  try {
    const schema = z.object({
      email: z.string().email("E-mail inválido"),
    });
    const { email: rawEmail } = schema.parse(req.body);
    const email = normalizeEmail(rawEmail);

    if (!isSmtpConfigured()) {
      return res.status(503).json({
        message: "Envio de e-mail não configurado. Contate o suporte.",
      });
    }

    const publicUrl = getPublicAppUrl();
    if (!publicUrl) {
      console.error("[forgotPassword] PUBLIC_APP_URL / FRONTEND_URL / BASE_URL não definido");
      return res.status(503).json({
        message: "URL pública do sistema não configurada. Contate o suporte.",
      });
    }

    const userRows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    const user = userRows[0];

    // Sempre 200 genérico — evita enumeração de e-mails
    if (!user || !user.ativo) {
      return res.status(200).json({ message: GENERIC_FORGOT_MSG });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + resetTtlMinutes() * 60 * 1000);

    // Invalida tokens anteriores não usados deste usuário
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.usuario_id, user.id),
          isNull(passwordResetTokens.used_at)
        )
      );

    await db.insert(passwordResetTokens).values({
      token_hash: tokenHash,
      usuario_id: user.id,
      expires_at: expiresAt,
    });

    const resetUrl = `${publicUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        systemName: process.env.SYSTEM_NAME || "Khesef",
      });
    } catch (err: any) {
      console.error("[forgotPassword] sendPasswordResetEmail:", err?.message || err);
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.token_hash, tokenHash));
      return res.status(503).json({
        message: "Não foi possível enviar o e-mail. Tente novamente mais tarde.",
      });
    }

    return res.status(200).json({ message: GENERIC_FORGOT_MSG });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: error.errors?.[0]?.message || "Dados inválidos" });
    }
    console.error("[forgotPassword]", error);
    return res.status(500).json({ message: "Erro ao processar pedido" });
  }
}

/**
 * GET /api/auth/reset-token?token=
 */
export async function checkResetToken(req: Request, res: Response) {
  try {
    const token = String(req.query.token || "");
    if (!token || token.length < 32) {
      return res.status(200).json({ valid: false });
    }

    const tokenHash = hashToken(token);
    const rows = await db
      .select({
        id: passwordResetTokens.id,
        nome: users.nome,
        telefone: users.telefone,
        email: users.email,
        status_assinatura: users.status_assinatura,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.usuario_id))
      .where(
        and(
          eq(passwordResetTokens.token_hash, tokenHash),
          isNull(passwordResetTokens.used_at),
          gt(passwordResetTokens.expires_at, new Date())
        )
      )
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
  } catch (error) {
    console.error("[checkResetToken]", error);
    return res.status(200).json({ valid: false });
  }
}

/**
 * POST /api/auth/reset-password  { token, novaSenha, nome?, telefone?, email? }
 * No cadastro via WhatsApp, o mesmo link completa nome/telefone/e-mail/senha.
 */
export async function resetPassword(req: Request, res: Response) {
  try {
    const schema = z.object({
      token: z.string().min(32, "Token inválido"),
      novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
      nova_senha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
      password: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
      nome: z.string().min(2, "Informe o nome completo").optional(),
      telefone: z.string().optional(),
      email: z.string().optional(),
    }).refine(
      (d) => d.novaSenha || d.nova_senha || d.password,
      { message: "Nova senha é obrigatória" }
    );

    const parsed = schema.parse(req.body);
    const novaSenha = parsed.novaSenha || parsed.nova_senha || parsed.password || "";
    const tokenHash = hashToken(parsed.token);

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token_hash, tokenHash),
          isNull(passwordResetTokens.used_at),
          gt(passwordResetTokens.expires_at, new Date())
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return res.status(400).json({
        message: "Link inválido ou expirado. Solicite uma nova recuperação.",
      });
    }

    const user = await storage.getUserById(row.usuario_id);
    if (!user) {
      return res.status(400).json({ message: "Usuário não encontrado." });
    }

    const cadastroPendente = isCadastroPendente(user);

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
      const existing = await storage.getUserByEmail(email);
      if (existing && existing.id !== user.id) {
        return res.status(400).json({ message: "Esse e-mail já está cadastrado em outra conta." });
      }

      const fim = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      try {
        await storage.updateUser(user.id, {
          nome,
          telefone,
          email,
          ativo: true,
          status_assinatura: "degustacao",
          data_expiracao_assinatura: fim,
          subscriptionActive: true,
        } as any);
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (err?.code === "23505" || /unique|duplicate/i.test(msg)) {
          return res.status(400).json({ message: "Esse e-mail já está cadastrado em outra conta." });
        }
        throw err;
      }

      try {
        await notificarAdmin(
          `🆕 Cadastro WhatsApp concluído no formulário: ${nome} | ${email} | tel ${telefone} | id=${user.id}`
        );
      } catch { /* não bloquear */ }

      const uazBase = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
      const uazToken = process.env.UAZAPI_TOKEN || "";
      if (user.remoteJid && uazToken) {
        try {
          const primeiro = nome.split(" ")[0] || "";
          await uazapiService.sendText(
            uazBase,
            uazToken,
            user.remoteJid,
            `Pronto${primeiro ? `, ${primeiro}` : ""}! 🎉 Sua conta está criada e você já tem *15 dias grátis*. Pode começar a registrar suas finanças por aqui.`
          );
        } catch (e: any) {
          console.error("[resetPassword] falha ao avisar no WhatsApp:", e?.message || e);
        }
      }
    }

    const success = await storage.updatePassword(row.usuario_id, novaSenha);
    if (!success) {
      return res.status(500).json({ message: "Erro ao atualizar senha" });
    }

    await db
      .update(passwordResetTokens)
      .set({ used_at: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.usuario_id, row.usuario_id),
          isNull(passwordResetTokens.used_at)
        )
      );

    try {
      (req.session as any).userId = row.usuario_id;
    } catch (e) {
      console.error("[resetPassword] falha ao abrir sessão (auto-login):", e);
    }

    return res.status(200).json({
      message: cadastroPendente
        ? "Cadastro concluído. Você já está conectado."
        : "Senha redefinida com sucesso. Você já está conectado.",
      autenticado: true,
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: error.errors?.[0]?.message || "Dados inválidos" });
    }
    const msg = String(error?.message || "");
    if (error?.code === "23505" || /unique|duplicate/i.test(msg)) {
      return res.status(400).json({ message: "Esse e-mail já está cadastrado em outra conta." });
    }
    console.error("[resetPassword]", error);
    return res.status(500).json({ message: "Erro ao redefinir senha" });
  }
}
