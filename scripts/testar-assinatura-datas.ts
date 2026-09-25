/**
 * Datas da assinatura e regras dos lembretes de cobrança (sem banco).
 */
import {
  fimDoPeriodoPago,
  novaExpiracao,
  vencimentoPrimeiraCobranca,
  somarMesesISO,
  proximoVencimento,
} from "../server/services/assinatura-datas";
import {
  etapaDegustacao,
  etapaCobranca,
  asaasEstaPago,
  asaasEncerrada,
  textoCobranca,
  textoDegustacao,
  textoPagamentoConfirmado,
} from "../server/services/lembretes-cobranca";
import { diaSP, dataBrSP } from "../shared/datas-sp";

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}: obtido ${JSON.stringify(obtido)} esperado ${JSON.stringify(esperado)}`); }
}
const sp = (d: Date) => `${diaSP(d)} ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

console.log("Período pago (vencimento + ciclo + 3 dias, fim do dia SP)");
igual("mensal 25/09 → 28/10 23:59:59", sp(fimDoPeriodoPago("2026-09-25", 1)), "2026-10-28 23:59:59");
igual("trimestral", diaSP(fimDoPeriodoPago("2026-09-25", 3)), "2026-12-28");
igual("anual", diaSP(fimDoPeriodoPago("2026-09-25", 12)), "2027-09-28");
igual("31/01 + 1 mês = 28/02", somarMesesISO("2026-01-31", 1), "2026-02-28");
igual("31/01 + 1 mês (bissexto) = 29/02", somarMesesISO("2028-01-31", 1), "2028-02-29");
igual("dez → jan vira o ano", somarMesesISO("2026-12-15", 1), "2027-01-15");
igual("próximo vencimento do Asaas", proximoVencimento("2026-09-25", 1), "2026-10-25");

console.log("Confirmação do pagamento");
const venc = "2026-10-25";
const antes = novaExpiracao(null, venc, 1, new Date("2026-10-22T15:00:00Z"));
const noDia = novaExpiracao(null, venc, 1, new Date("2026-10-25T15:00:00Z"));
const atrasado = novaExpiracao(null, venc, 1, new Date("2026-10-27T15:00:00Z"));
igual("pago 3 dias antes não perde dias", diaSP(antes), "2026-11-28");
igual("pago no dia", diaSP(noDia), "2026-11-28");
igual("pago atrasado fica ancorado no vencimento", diaSP(atrasado), "2026-11-28");
const confirmed = novaExpiracao(new Date("2026-10-28T12:00:00Z"), venc, 1, new Date("2026-10-25T15:00:00Z"));
const received = novaExpiracao(confirmed, venc, 1, new Date("2026-11-24T15:00:00Z"));
igual("CONFIRMED + RECEIVED (cartão) = mesmo resultado", received.toISOString(), confirmed.toISOString());
igual("nunca reduz acesso maior já concedido", novaExpiracao("2027-01-10T12:00:00Z", venc, 1).toISOString(), "2027-01-10T12:00:00.000Z");
igual("sem vencimento: usa hoje", diaSP(novaExpiracao(null, null, 1, new Date("2026-09-25T15:00:00Z"))), "2026-10-28");

console.log("1ª cobrança");
igual("Rafael: degustação termina hoje → vence hoje",
  vencimentoPrimeiraCobranca("2026-09-25", { status_assinatura: "degustacao", data_expiracao_assinatura: "2026-09-25T20:00:00Z" }), "2026-09-25");
igual("degustação com 5 dias → vence no fim dela",
  vencimentoPrimeiraCobranca("2026-09-25", { status_assinatura: "degustacao", data_expiracao_assinatura: "2026-09-30T12:00:00Z" }), "2026-09-30");
igual("degustação expirada → hoje",
  vencimentoPrimeiraCobranca("2026-09-25", { status_assinatura: "degustacao_expirada", data_expiracao_assinatura: "2026-09-20T12:00:00Z" }), "2026-09-25");
igual("data absurda → hoje",
  vencimentoPrimeiraCobranca("2026-09-25", { status_assinatura: "degustacao", data_expiracao_assinatura: "2027-09-30T12:00:00Z" }), "2026-09-25");

console.log("Etapas dos lembretes");
igual("degustação", [4, 3, 2, 1, 0, -1].map(etapaDegustacao), [null, "D-3", null, "D-1", "D0", null]);
igual("cobrança", [4, 3, 1, 0, -1, -2, -3, -4].map(etapaCobranca), [null, "D-3", null, "D0", "D+1", null, "D+3", null]);
igual("pago no Asaas nunca é cobrado", ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].map(asaasEstaPago), [true, true, true]);
igual("pendente/vencida é cobrada", ["PENDING", "OVERDUE"].map(asaasEncerrada), [false, false]);
igual("estornada não é cobrada", asaasEncerrada("REFUNDED"), true);

console.log("Textos");
{
  const t = textoCobranca("D+1", "Rafael Souza", 79.9, "2026-10-25", "https://asaas/x");
  igual("D+1 cita vencimento, limite e link", /25\/10\/2026/.test(t) && /28\/10\/2026/.test(t) && /https:\/\/asaas\/x/.test(t) && /Oi Rafael!/.test(t), true);
  const t3 = textoCobranca("D+3", "Rafael", 79.9, "2026-10-25", "https://asaas/x");
  igual("D+3 = último dia", /último dia/.test(t3) && /28\/10\/2026/.test(t3), true);
  igual("degustação D0", /termina hoje/.test(textoDegustacao("D0", "Ana", "https://app/subscription/renew")), true);
  const ok = textoPagamentoConfirmado("Rafael", 79.9, fimDoPeriodoPago("2026-09-25", 1));
  igual("confirmação com acesso até 28/10", /R\$ 79,90/.test(ok) && ok.includes(dataBrSP("2026-10-28") as string), true);
}

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nOK");
