/**
 * Lembretes de cobrança no WhatsApp (flag FLAG_LEMBRETES_COBRANCA).
 *
 *  - Degustação: 3 dias antes, 1 dia antes e no último dia, com o link de pagamento.
 *  - Mensalidade a vencer: 3 dias antes e no dia, com o link da fatura do Asaas.
 *  - Mensalidade vencida: 1 e 3 dias depois (o 3º é o último dia da tolerância).
 *  - Pagamento confirmado: na hora, "acesso até dd/mm/aaaa".
 *
 * Nunca cobra quem já pagou: antes de avisar uma cobrança, confere no Asaas; se
 * estiver paga, atualiza o banco e não manda nada. Cada aviso sai uma vez só
 * (tabela avisos_cobranca, única por usuário+chave, vale para várias réplicas).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { dataBrSP, diasAteSP, diaSP } from "../../shared/datas-sp";
import { TOLERANCIA_DIAS, somarDiasISO } from "./assinatura-datas";

// ---------------------------------------------------------------------------
// Regras puras (testáveis)
// ---------------------------------------------------------------------------

export type EtapaDegustacao = "D-3" | "D-1" | "D0";
export type EtapaCobranca = "D-3" | "D0" | "D+1" | "D+3";

/** `dias` = dias de calendário até o fim da degustação (0 = hoje). */
export function etapaDegustacao(dias: number | null): EtapaDegustacao | null {
  if (dias === 3) return "D-3";
  if (dias === 1) return "D-1";
  if (dias === 0) return "D0";
  return null;
}

/** `dias` = dias até o vencimento da cobrança (negativo = vencida). */
export function etapaCobranca(dias: number | null): EtapaCobranca | null {
  if (dias === 3) return "D-3";
  if (dias === 0) return "D0";
  if (dias === -1) return "D+1";
  if (dias === -TOLERANCIA_DIAS) return "D+3";
  return null;
}

/** Status do Asaas que significam "pago" — nunca lembrar. */
export function asaasEstaPago(status: string | null | undefined): boolean {
  return ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"].includes(String(status || "").toUpperCase());
}

/** Status que tiram a cobrança do lembrete (paga, estornada, cancelada…). */
export function asaasEncerrada(status: string | null | undefined): boolean {
  const s = String(status || "").toUpperCase();
  return asaasEstaPago(s) || ["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "DELETED", "CANCELLED"].includes(s);
}

function primeiroNome(nome: string | null | undefined): string {
  return String(nome || "").trim().split(/\s+/)[0] || "";
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function textoDegustacao(etapa: EtapaDegustacao, nome: string, link: string): string {
  const oi = `Oi ${primeiroNome(nome)}!`.replace(" !", "!");
  const quando =
    etapa === "D0" ? "*termina hoje*" : etapa === "D-1" ? "*termina amanhã*" : "termina em *3 dias*";
  return (
    `${oi} Sua degustação ${quando}. 🙌\n\n` +
    `Para continuar usando sem interrupção, assine por aqui:\n${link}\n\n` +
    `Se pagar antes, não perde nenhum dia: a mensalidade começa quando a degustação termina.`
  );
}

export function textoCobranca(
  etapa: EtapaCobranca,
  nome: string,
  valor: number,
  vencimentoISO: string,
  link: string,
): string {
  const oi = `Oi ${primeiroNome(nome)}!`.replace(" !", "!");
  const venc = dataBrSP(vencimentoISO);
  const limite = dataBrSP(somarDiasISO(vencimentoISO, TOLERANCIA_DIAS));
  const fatura = `\n\nFatura (Pix, boleto ou cartão):\n${link}`;
  switch (etapa) {
    case "D-3":
      return `${oi} Sua mensalidade de *R$ ${money(valor)}* vence em *${venc}*.${fatura}\n\nSe já pagou, pode ignorar esta mensagem.`;
    case "D0":
      return `${oi} Sua mensalidade de *R$ ${money(valor)}* vence *hoje* (${venc}).${fatura}\n\nSe já pagou, pode ignorar esta mensagem.`;
    case "D+1":
      return `${oi} Não identificamos o pagamento da mensalidade de *R$ ${money(valor)}* que venceu em ${venc}.\nSeu acesso continua até *${limite}*. Pagando agora, a fatura inclui multa e juros de atraso.${fatura}\n\nSe já pagou, pode ignorar: a baixa é automática.`;
    case "D+3":
      return `${oi} Hoje (${limite}) é o *último dia* de acesso: a mensalidade de *R$ ${money(valor)}* (vencida em ${venc}) ainda está em aberto (com multa e juros de atraso).${fatura}\n\nAssim que o pagamento cair, o acesso é liberado na hora.`;
  }
}

export function textoPagamentoConfirmado(nome: string, valor: number, acessoAte: Date | string): string {
  const oi = `Oi ${primeiroNome(nome)}!`.replace(" !", "!");
  return `${oi} ✅ Recebemos seu pagamento de *R$ ${money(valor)}*.\nSeu acesso está garantido até *${dataBrSP(acessoAte)}*. Obrigado!`;
}

// ---------------------------------------------------------------------------
// Envio (I/O)
// ---------------------------------------------------------------------------

let tabelaPronta = false;
async function garantirTabela(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS avisos_cobranca (
      usuario_id  INTEGER NOT NULL,
      chave       VARCHAR(160) NOT NULL,
      enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, chave)
    )
  `);
  tabelaPronta = true;
}

/** Reserva o aviso: true = ainda não foi enviado (e agora está marcado). */
async function reservarAviso(usuarioId: number, chave: string): Promise<boolean> {
  await garantirTabela();
  const rows = (await db.execute(sql`
    INSERT INTO avisos_cobranca (usuario_id, chave) VALUES (${usuarioId}, ${chave})
    ON CONFLICT DO NOTHING
    RETURNING usuario_id
  `)) as any[];
  return rows.length > 0;
}

/** Reserva de uso único (ex.: e-mail de pagamento confirmado): true = primeira vez. */
export async function reservarAvisoUnico(usuarioId: number, chave: string): Promise<boolean> {
  return reservarAviso(usuarioId, chave);
}

async function liberarAviso(usuarioId: number, chave: string): Promise<void> {
  await db.execute(sql`DELETE FROM avisos_cobranca WHERE usuario_id = ${usuarioId} AND chave = ${chave}`);
}

type Envio = (remotejid: string, texto: string) => Promise<unknown>;

async function envioPadrao(remotejid: string, texto: string): Promise<unknown> {
  const { uazapiService } = await import("./uazapi.service");
  const base = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
  const token = process.env.UAZAPI_TOKEN || "";
  if (!token) throw new Error("UAZAPI_TOKEN não configurado");
  return uazapiService.sendText(base, token, remotejid, texto);
}

function jidValido(jid: string | null | undefined): jid is string {
  return !!jid && !String(jid).includes("@g.us");
}

async function flagLigada(usuarioId: number): Promise<boolean> {
  const { flagAtiva, FLAG_LEMBRETES_COBRANCA } = await import("./feature-flags.service");
  return flagAtiva(FLAG_LEMBRETES_COBRANCA, usuarioId);
}

/** Envia uma vez só por chave. Se o envio falhar, libera a chave para tentar de novo. */
async function enviarUmaVez(usuarioId: number, remotejid: string, chave: string, texto: string, enviar: Envio): Promise<boolean> {
  if (!(await reservarAviso(usuarioId, chave))) return false;
  try {
    await enviar(remotejid, texto);
    return true;
  } catch (err: any) {
    await liberarAviso(usuarioId, chave).catch(() => {});
    console.warn(`[Lembretes] Falha ao enviar ${chave} (user ${usuarioId}):`, err?.message);
    return false;
  }
}

/** WhatsApp "recebemos seu pagamento" — uma vez por cobrança (CONFIRMED e RECEIVED chegam os dois). */
export async function avisarPagamentoConfirmado(
  user: { id: number; nome?: string | null; remotejid?: string | null; remoteJid?: string | null },
  asaasPaymentId: string,
  valor: number,
  acessoAte: Date,
  enviar: Envio = envioPadrao,
): Promise<boolean> {
  const jid = user.remotejid ?? user.remoteJid;
  if (!jidValido(jid)) return false;
  if (!(await flagLigada(user.id))) return false;
  return enviarUmaVez(user.id, jid, `pago:${asaasPaymentId}`, textoPagamentoConfirmado(user.nome || "", valor, acessoAte), enviar);
}

/** Confere no Asaas o status atual da cobrança (a fonte da verdade). */
async function statusNoAsaas(asaasPaymentId: string): Promise<{ status: string; invoiceUrl?: string } | null> {
  try {
    const { getAsaasService } = await import("./asaas.service");
    const asaas = await getAsaasService();
    const p = await asaas.getPayment(asaasPaymentId);
    return { status: p.status, invoiceUrl: p.invoiceUrl };
  } catch (err: any) {
    console.warn(`[Lembretes] Não consegui consultar ${asaasPaymentId} no Asaas:`, err?.message);
    return null;
  }
}

export type ResumoLembretes = { degustacao: number; cobrancas: number; pulados_pagos: number };

type Consulta = (asaasPaymentId: string) => Promise<{ status: string; invoiceUrl?: string } | null>;

export async function checkLembretesCobranca(
  opts: { agora?: Date; enviar?: Envio; consultarAsaas?: Consulta } = {},
): Promise<ResumoLembretes> {
  const agora = opts.agora ?? new Date();
  const enviar = opts.enviar ?? envioPadrao;
  const consultar = opts.consultarAsaas ?? statusNoAsaas;
  await garantirTabela();
  const resumo: ResumoLembretes = { degustacao: 0, cobrancas: 0, pulados_pagos: 0 };
  const base = (process.env.BASE_URL || "https://app.controledinheiro.com.br").replace(/\/+$/, "");

  // 1) Degustação terminando. Quem já pagou (cobrança confirmada ou assinatura
  // ativa) não recebe — mesmo que o status ainda diga "degustacao".
  const trials = (await db.execute(sql`
    SELECT u.id, u.nome, u.remotejid, u.data_expiracao_assinatura
    FROM usuarios u
    WHERE u.status_assinatura = 'degustacao'
      AND u.ativo = true
      AND u.data_expiracao_assinatura IS NOT NULL
      AND u.data_expiracao_assinatura > ${agora.toISOString()}::timestamptz
      AND u.data_expiracao_assinatura < ${new Date(agora.getTime() + 5 * 86_400_000).toISOString()}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM payment_transactions p
        WHERE p.usuario_id = u.id AND p.status IN ('confirmed', 'received', 'received_in_cash')
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_subscriptions s WHERE s.usuario_id = u.id AND s.status = 'active'
      )
  `)) as any[];
  for (const u of trials) {
    if (!jidValido(u.remotejid) || !(await flagLigada(u.id))) continue;
    const etapa = etapaDegustacao(diasAteSP(u.data_expiracao_assinatura, agora));
    if (!etapa) continue;
    const chave = `trial:${diaSP(u.data_expiracao_assinatura)}:${etapa}`;
    const texto = textoDegustacao(etapa, u.nome, `${base}/subscription/renew`);
    if (await enviarUmaVez(u.id, u.remotejid, chave, texto, enviar)) resumo.degustacao++;
  }

  // 2) Mensalidades em aberto (a vencer em até 3 dias, ou vencidas há até 3).
  const hoje = diaSP(agora) as string;
  const cobrancas = (await db.execute(sql`
    SELECT p.id, p.usuario_id, p.asaas_payment_id, p.asaas_invoice_url, p.amount, p.due_date, p.status,
           u.nome, u.remotejid
    FROM payment_transactions p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.status IN ('pending', 'overdue')
      AND p.asaas_payment_id IS NOT NULL
      AND p.due_date BETWEEN ${somarDiasISO(hoje, -TOLERANCIA_DIAS)}::date AND ${somarDiasISO(hoje, 3)}::date
  `)) as any[];
  for (const c of cobrancas) {
    if (!jidValido(c.remotejid) || !(await flagLigada(c.usuario_id))) continue;
    const venc = diaSP(c.due_date instanceof Date ? c.due_date.toISOString().slice(0, 10) : String(c.due_date).slice(0, 10)) as string;
    const etapa = etapaCobranca(diasAteSP(venc, agora));
    if (!etapa) continue;
    const chave = `cob:${c.asaas_payment_id}:${etapa}`;
    // Já avisado? Nem consulta o Asaas.
    const ja = (await db.execute(sql`
      SELECT 1 FROM avisos_cobranca WHERE usuario_id = ${c.usuario_id} AND chave = ${chave}
    `)) as any[];
    if (ja.length) continue;
    // Fonte da verdade: se o webhook se perdeu e o cliente já pagou, não cobra.
    const asaas = await consultar(c.asaas_payment_id);
    if (!asaas) continue; // sem confirmação do Asaas, melhor não cobrar
    if (asaasEncerrada(asaas.status)) {
      if (asaasEstaPago(asaas.status)) {
        resumo.pulados_pagos++;
        await db.execute(sql`UPDATE payment_transactions SET status = 'confirmed', updated_at = now() WHERE id = ${c.id} AND status IN ('pending', 'overdue')`);
      }
      continue;
    }
    const link = asaas.invoiceUrl || c.asaas_invoice_url;
    if (!link) continue;
    const texto = textoCobranca(etapa, c.nome, Number(c.amount), venc, link);
    if (await enviarUmaVez(c.usuario_id, c.remotejid, chave, texto, enviar)) resumo.cobrancas++;
  }

  console.log(`[Lembretes] degustação=${resumo.degustacao} cobranças=${resumo.cobrancas} já pagas (puladas)=${resumo.pulados_pagos}`);
  return resumo;
}
