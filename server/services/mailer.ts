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

/** Boas-vindas com senha inicial (cadastro via WhatsApp). */
export async function sendWelcomeWithPasswordEmail(opts: {
  to: string;
  nome?: string;
  password: string;
  loginUrl?: string;
  systemName?: string;
}): Promise<void> {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP não configurado");
  }

  const systemName = opts.systemName || "Magen";
  const loginUrl = (opts.loginUrl || getPublicAppUrl() || "").replace(/\/+$/, "");
  const from = smtpFrom()!;
  const transport = createTransport();
  const firstName = (opts.nome || "").split(" ")[0] || "";
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";

  const subject = `Bem-vindo ao ${systemName} — seus dados de acesso`;
  const text = [
    greeting,
    "",
    `Sua conta no ${systemName} foi criada com sucesso.`,
    "",
    `E-mail (login): ${opts.to}`,
    `Senha temporária: ${opts.password}`,
    loginUrl ? `Acesse: ${loginUrl}` : "",
    "",
    "Você pode alterar essa senha a qualquer momento em Configurações ou em Esqueci minha senha.",
    "",
    "Se não foi você, ignore este e-mail.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <p>${greeting}</p>
    <p>Sua conta no <strong>${systemName}</strong> foi criada com sucesso.</p>
    <p>
      <strong>E-mail (login):</strong> ${opts.to}<br/>
      <strong>Senha temporária:</strong> ${opts.password}
    </p>
    ${
      loginUrl
        ? `<p><a href="${loginUrl.replace(/"/g, "&quot;")}">Acessar o ${systemName}</a></p>`
        : ""
    }
    <p>Você pode alterar essa senha a qualquer momento em <em>Configurações</em> ou em <em>Esqueci minha senha</em>.</p>
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
