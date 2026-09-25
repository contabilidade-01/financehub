/**
 * Datas da assinatura (puras, testáveis sem banco).
 *
 * Regra: cada cobrança do Asaas cobre o período [vencimento, vencimento + ciclo).
 * O acesso vai até o FIM DO DIA (São Paulo) de `vencimento + ciclo + tolerância`.
 * Ancorar no vencimento (e não no momento da confirmação) mantém o acesso
 * alinhado com as próximas cobranças do Asaas:
 *  - pagar antes do vencimento não perde dias;
 *  - pagar atrasado não empurra o ciclo;
 *  - PAYMENT_CONFIRMED + PAYMENT_RECEIVED (cartão) dão o mesmo resultado.
 */
import { diaSP } from "../../shared/datas-sp";

/** Dias de acesso depois do vencimento (boleto/Pix levam 1–2 dias para compensar). */
export const TOLERANCIA_DIAS = 3;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split("-").map(Number);
  return [a, m, d];
}

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Soma meses a uma data de calendário; dia inexistente vira o último do mês (31/01 + 1 = 28/02). */
export function somarMesesISO(dataISO: string, meses: number): string {
  const [a, m, d] = partes(dataISO);
  const totalMeses = a * 12 + (m - 1) + meses;
  const na = Math.floor(totalMeses / 12);
  const nm = (totalMeses % 12) + 1;
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate();
  return iso(na, nm, Math.min(d, ultimo));
}

export function somarDiasISO(dataISO: string, dias: number): string {
  const [a, m, d] = partes(dataISO);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Último instante do dia em São Paulo (sem horário de verão desde 2019: UTC−3). */
export function fimDoDiaSP(dataISO: string): Date {
  return new Date(`${dataISO}T23:59:59.999-03:00`);
}

/** Próximo vencimento do Asaas depois de pagar a cobrança que vence em `vencimentoISO`. */
export function proximoVencimento(vencimentoISO: string, meses: number): string {
  return somarMesesISO(vencimentoISO, meses);
}

/** Até quando o acesso vale depois de pagar a cobrança com esse vencimento. */
export function fimDoPeriodoPago(vencimentoISO: string, meses: number, tolerancia = TOLERANCIA_DIAS): Date {
  if (!ISO.test(vencimentoISO)) throw new Error(`vencimento inválido: ${vencimentoISO}`);
  return fimDoDiaSP(somarDiasISO(proximoVencimento(vencimentoISO, meses), tolerancia));
}

/**
 * Nova expiração ao confirmar um pagamento: nunca diminui o acesso já concedido
 * (ex.: renovação manual do admin ou crédito anterior).
 */
export function novaExpiracao(
  atual: Date | string | null | undefined,
  vencimentoISO: string | null | undefined,
  meses: number,
  agora: Date = new Date(),
): Date {
  const venc = vencimentoISO && ISO.test(String(vencimentoISO).slice(0, 10))
    ? String(vencimentoISO).slice(0, 10)
    : (diaSP(agora) as string);
  const nova = fimDoPeriodoPago(venc, meses);
  const atualDt = atual ? new Date(atual) : null;
  if (atualDt && !isNaN(atualDt.getTime()) && atualDt > nova) return atualDt;
  return nova;
}

/**
 * Vencimento da 1ª cobrança. Quem ainda está na degustação e paga antes do fim
 * não perde os dias restantes: a mensalidade começa quando a degustação termina.
 */
export function vencimentoPrimeiraCobranca(
  hojeISO: string,
  user: { status_assinatura?: string | null; data_expiracao_assinatura?: Date | string | null },
): string {
  if (user.status_assinatura !== "degustacao" || !user.data_expiracao_assinatura) return hojeISO;
  const fim = diaSP(user.data_expiracao_assinatura);
  if (!fim || fim <= hojeISO) return hojeISO;
  // Proteção: degustação é de 15 dias; data absurda não empurra a cobrança.
  const limite = somarDiasISO(hojeISO, 31);
  return fim > limite ? hojeISO : fim;
}

/**
 * Vencimento que define o CICLO da cobrança paga. Se o vencimento foi alterado
 * no painel do Asaas (ex.: fatura de 21/09 prorrogada para 21/10 para o cliente
 * conseguir pagar), vale o original: a fatura continua sendo a do ciclo 21/09.
 */
export function vencimentoDoCiclo(p: { originalDueDate?: string | null; dueDate?: string | null } | null | undefined): string | null {
  const o = String(p?.originalDueDate || "").slice(0, 10);
  if (ISO.test(o)) return o;
  const d = String(p?.dueDate || "").slice(0, 10);
  return ISO.test(d) ? d : null;
}

/** Fim do dia (SP) da próxima cobrança depois de pagar a cobrança com esse vencimento — sem tolerância. */
export function fimDoCicloPago(vencimentoISO: string, meses: number): Date {
  return fimDoDiaSP(proximoVencimento(vencimentoISO, meses));
}

/** Próxima cobrança a partir do acesso gravado (que inclui a tolerância). */
export function proximaCobrancaDoAcesso(acessoAte: Date | string | null | undefined, tolerancia = TOLERANCIA_DIAS): string | null {
  if (!acessoAte) return null;
  const dia = diaSP(acessoAte);
  return dia ? somarDiasISO(dia, -tolerancia) : null;
}
