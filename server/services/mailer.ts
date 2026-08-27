/**
 * Mailer SMTP — mesma lógica/variáveis do nescon-clientes (api/src/mailer.js).
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 * Aceita também SMTP_PASSWORD / EMAIL_FROM por compatibilidade com .env antigo.
 */
import nodemailer from "nodemailer";

function smtpPass(): string | undefined {
  return process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
}

function smtpFrom(): string | undefined {
  return process.env.SMTP_FROM || process.env.EMAIL_FROM;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      smtpPass() &&
      smtpFrom()
  );
}

/** URL pública do front (links de reset). */
export function getPublicAppUrl(): string {
  const base = (
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  return base;
}

export function createTransport() {
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPass(),
    },
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
  systemName?: string;
}): Promise<void> {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP não configurado");
  }

  const systemName = opts.systemName || "Magen";
  const from = smtpFrom()!;
  const transport = createTransport();
  const subject = `Redefinição de senha — ${systemName}`;
  const text = [
    "Recebemos um pedido para redefinir a senha desta conta.",
    "",
    "Abra o link (válido por tempo limitado):",
    opts.resetUrl,
    "",
    "Se não foi você, ignore este e-mail.",
  ].join("\n");

  const html = `
    <p>Recebemos um pedido para redefinir a senha desta conta.</p>
    <p><a href="${opts.resetUrl.replace(/"/g, "&quot;")}">Redefinir senha</a></p>
    <p>Se não foi você, ignore este e-mail.</p>
  `;

  await transport.sendMail({
    from,
    to: opts.to,
    subject,
    text,
    html,
  });
}
