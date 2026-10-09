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
 * Vencimento da 1ª cobrança = ÚLTIMO DIA DA VIGÊNCIA atual (regra do negócio).
 *  - Degustação rodando: vence no dia em que ela termina (pagar antes não perde dias).
 *  - Vigência definida pelo admin ("ativa" manual): vence no fim dela; o acesso
 *    gravado inclui a tolerância, então a vigência é o acesso − tolerância.
 *  - Sem vigência futura (expirou, sem data): vence hoje.
 * Cobrança paga em até 3 dias depois do vencimento mantém o acesso (tolerância).
 */
export function vencimentoPrimeiraCobranca(
  hojeISO: string,
  user: { status_assinatura?: string | null; data_expiracao_assinatura?: Date | string | null },
): string {
  if (!user.data_expiracao_assinatura) return hojeISO;
  let fim = diaSP(user.data_expiracao_assinatura);
  if (!fim) return hojeISO;
  const status = String(user.status_assinatura || "");
  if (status === "ativa" || status === "vencida") fim = somarDiasISO(fim, -TOLERANCIA_DIAS);
  if (fim <= hojeISO) return hojeISO;
  // Proteção: data absurda (mais de 1 ano) não empurra a cobrança.
  return fim > somarDiasISO(hojeISO, 366) ? hojeISO : fim;
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

/** Status locais de cobrança que não contam como ciclo (cancelada/excluída no Asaas, estornada). */
const COBRANCA_FORA = new Set(["canceled", "cancelled", "deleted", "refunded"]);
const COBRANCA_PAGA = new Set(["confirmed", "received_in_cash"]);

/**
 * Vencimento do ciclo que um pagamento cobre, olhando as cobranças da mesma
 * assinatura. Cada pagamento cobre o ciclo MAIS ANTIGO ainda em aberto, não o
 * da fatura que o cliente escolheu pagar.
 *
 * Caso real: assinatura com cobranças 21/09 (em aberto) e 21/10. O cliente pagou
 * a de 21/10 e o acesso ia até 24/11 (próxima cobrança 21/11), mas a de 21/09
 * continuava devendo: o certo é próxima cobrança 21/10. Se depois ele paga a de
 * 21/09, são 2 pagamentos e o acesso vai até 24/11.
 *
 * Com N cobranças pagas (contando `pagaId`), o ciclo coberto é o da N-ésima
 * cobrança válida por vencimento. Sem cobranças locais, vale o próprio vencimento.
 */
export function vencimentoCoberto(
  cobrancas: Array<{ id?: string | number | null; status?: string | null; dueDate?: string | Date | null }>,
  vencimentoISO: string | null | undefined,
  pagaId?: string | number | null,
): string | null {
  const venc = vencimentoISO && ISO.test(String(vencimentoISO).slice(0, 10)) ? String(vencimentoISO).slice(0, 10) : null;
  const validas = cobrancas
    .map((c) => ({
      paga: COBRANCA_PAGA.has(String(c.status || "")) || (pagaId != null && c.id != null && String(c.id) === String(pagaId)),
      status: String(c.status || ""),
      venc: c.dueDate ? diaSP(c.dueDate as any) : null,
    }))
    .filter((c): c is { paga: boolean; status: string; venc: string } => !!c.venc && !COBRANCA_FORA.has(c.status))
    .sort((a, b) => a.venc.localeCompare(b.venc));
  const pagas = validas.filter((c) => c.paga).length;
  if (!pagas || !validas.length) return venc;
  return validas[pagas - 1].venc;
}
