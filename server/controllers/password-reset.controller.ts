/**
 * Recuperação de senha — espelha o fluxo do nescon-clientes (auth forgot/reset).
 * Login do Magen e por e-mail; token hasheado (SHA-256), uso único, TTL configurável.
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

const GENERIC_FORGOT_MSG =
  "Se o e-mail estiver cadastrado, você receberá um link em instantes.";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function normalizeEmail(val: unknown): string {
  if (val == null) return "";
  return String(val).trim().toLowerCase();
}

function resetTtlMinutes(): number {
  return Math.min(
    Math.max(parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || "60", 10), 5),
    24 * 7
  );
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
        systemName: process.env.SYSTEM_NAME || "Magen",
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
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token_hash, tokenHash),
          isNull(passwordResetTokens.used_at),
          gt(passwordResetTokens.expires_at, new Date())
        )
      )
      .limit(1);

    return res.status(200).json({ valid: rows.length > 0 });
  } catch (error) {
    console.error("[checkResetToken]", error);
    return res.status(200).json({ valid: false });
  }
}

/**
 * POST /api/auth/reset-password  { token, novaSenha }
 */
export async function resetPassword(req: Request, res: Response) {
  try {
    const schema = z.object({
      token: z.string().min(32, "Token inválido"),
      novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
      nova_senha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
      password: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").optional(),
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

    const success = await storage.updatePassword(row.usuario_id, novaSenha);
    if (!success) {
      return res.status(500).json({ message: "Erro ao atualizar senha" });
    }

    await db
      .update(passwordResetTokens)
      .set({ used_at: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    // Invalida outros tokens pendentes do mesmo usuário
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.usuario_id, row.usuario_id),
          isNull(passwordResetTokens.used_at)
        )
      );

    return res.status(200).json({ message: "Senha redefinida com sucesso. Você já pode entrar." });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: error.errors?.[0]?.message || "Dados inválidos" });
    }
    console.error("[resetPassword]", error);
    return res.status(500).json({ message: "Erro ao redefinir senha" });
  }
}
