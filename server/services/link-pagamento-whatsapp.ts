/**
 * Link de pagamento (Asaas) pelo WhatsApp.
 *
 *  - Cadastro (flag FLAG_LINK_PAGAMENTO_CADASTRO): logo depois das boas-vindas,
 *    manda o link do checkout (página do app que leva ao Asaas). Não cria
 *    cobrança no Asaas no cadastro: o cliente escolhe o plano e informa o CPF/CNPJ.
 *  - Admin > Assinaturas > "Enviar no WhatsApp": gera a fatura no Asaas (mesmo
 *    fluxo do "Gerar link") e manda ao cliente. Sem CPF/CNPJ cadastrado, manda o
 *    link do checkout no lugar.
 *
 * Destino: o chat já vinculado (remotejid); senão, o telefone do cadastro.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { uazapiService } from "./uazapi.service";
import { generateCheckoutToken } from "../utils/checkout-token.utils";

function primeiroNome(nome: string | null | undefined): string {
  return String(nome || "").trim().split(/\s+/)[0] || "";
}

/** Chat de destino: chat vinculado (não grupo) ou telefone só com dígitos. */
export function destinoWhatsApp(u: { remotejid?: string | null; telefone?: string | null }): string | null {
  const jid = String(u.remotejid || "").trim();
  if (jid && !jid.includes("@g.us")) return jid;
  const tel = String(u.telefone || "").replace(/\D/g, "");
  return tel.length >= 10 ? tel : null;
}

export function textoLinkPagamento(nome: string | null | undefined, link: string, vencimentoISO?: string | null): string {
  const oi = `Oi ${primeiroNome(nome)}!`.replace(" !", "!");
  const venc = vencimentoISO ? String(vencimentoISO).slice(0, 10).split("-").reverse().join("/") : null;
  return (
    `${oi} Segue o link para pagar a sua assinatura do Tudo Contado (Pix, boleto ou cartão):\n${link}` +
    (venc ? `\n\nVencimento: *${venc}*.` : "") +
    `\n\nAssim que o pagamento for confirmado, o acesso é liberado automaticamente.`
  );
}

export function textoLinkPagamentoCadastro(nome: string | null | undefined, link: string): string {
  const oi = `Oi ${primeiroNome(nome)}!`.replace(" !", "!");
  return (
    `${oi} Este é o seu link para assinar o Tudo Contado (Pix, boleto ou cartão):\n${link}\n\n` +
    `Você já pode usar tudo durante a degustação. Se assinar antes, não perde nenhum dia: a mensalidade começa quando a degustação termina.`
  );
}

/** Link do checkout do app (escolhe plano, informa CPF/CNPJ e vai para o Asaas). Não cria cobrança. */
export function linkCheckoutApp(userId: number, email: string, ciclo?: string): string {
  const base = String(process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || process.env.BASE_URL || "https://app.tudocontado.com.br").replace(/\/+$/, "");
  return `${base}/checkout/plans?tokenaccess=${generateCheckoutToken(userId, email, ciclo)}`;
}

async function enviarTexto(destino: string, texto: string): Promise<void> {
  const baseUrl = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
  const token = process.env.UAZAPI_TOKEN || "";
  if (!token) throw new Error("UAZAPI_TOKEN não configurado");
  await uazapiService.sendText(baseUrl, token, destino, texto);
}

async function lerUsuario(userId: number) {
  const rows = (await db.execute(sql`
    SELECT id, nome, email, telefone, remotejid FROM usuarios WHERE id = ${userId}
  `)) as any;
  return ((rows?.rows ?? rows) as any[])[0] as
    | { id: number; nome: string; email: string; telefone: string | null; remotejid: string | null }
    | undefined;
}

export type ResultadoEnvioLink = { url: string; tipo: "asaas" | "checkout"; enviadoPara: string; vencimento?: string };

/** Admin: gera a fatura no Asaas (ou, sem CPF/CNPJ, o link do checkout) e manda no WhatsApp. */
export async function enviarLinkPagamentoAdmin(
  userId: number,
  ciclo: string,
  gerarFatura: (userId: number, ciclo: string) => Promise<{ url: string; vencimento?: string }>,
): Promise<ResultadoEnvioLink> {
  const u = await lerUsuario(userId);
  if (!u) throw new Error("Usuário não encontrado");
  const destino = destinoWhatsApp(u);
  if (!destino) throw new Error("Cliente sem WhatsApp vinculado e sem telefone no cadastro");

  let url: string;
  let tipo: ResultadoEnvioLink["tipo"] = "asaas";
  let vencimento: string | undefined;
  try {
    const r = await gerarFatura(userId, ciclo);
    url = r.url;
    vencimento = r.vencimento;
  } catch (err: any) {
    // Sem CPF/CNPJ não dá para criar a cobrança: o checkout pede ao cliente.
    if (!/CPF|CNPJ/i.test(String(err?.message || ""))) throw err;
    url = linkCheckoutApp(userId, u.email, ciclo);
    tipo = "checkout";
  }

  await enviarTexto(destino, textoLinkPagamento(u.nome, url, vencimento));
  console.log(`[LinkPagamento] Admin enviou link (${tipo}) para user ${userId}`);
  return { url, tipo, enviadoPara: destino, vencimento };
}

/** Cadastro: manda o link do checkout logo após as boas-vindas (flag; nunca lança). */
export async function enviarLinkPagamentoCadastro(user: {
  id: number;
  nome?: string | null;
  email: string;
  telefone?: string | null;
}): Promise<void> {
  try {
    const { flagAtiva, FLAG_LINK_PAGAMENTO_CADASTRO } = await import("./feature-flags.service");
    if (!(await flagAtiva(FLAG_LINK_PAGAMENTO_CADASTRO, user.id))) return;
    const destino = destinoWhatsApp({ telefone: user.telefone });
    if (!destino) return;
    // Deixa as boas-vindas chegarem primeiro.
    await new Promise((r) => setTimeout(r, 4000));
    await enviarTexto(destino, textoLinkPagamentoCadastro(user.nome, linkCheckoutApp(user.id, user.email)));
    console.log(`[LinkPagamento] Link do cadastro enviado para user ${user.id}`);
  } catch (err: any) {
    console.error(`[LinkPagamento] Falha ao enviar link do cadastro para user ${user.id}:`, err?.message || err);
  }
}
