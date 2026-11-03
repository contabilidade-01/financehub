/**
 * Lembretes, limites de gasto e metas — regras puras (sem banco).
 * Cobre: alvo do limite, faixas 80/100, janela diária, data do lembrete em SP,
 * escolha da meta (sem chute), valor da meta e frases de meta fora dos atalhos PJ.
 */
import {
  resolverAlvoLimite, faixaLimite, agoraSP, dentroDaJanelaDiaria, somarDias,
  interpretarDataLembrete, textoAlertaLimite, textoContasAVencer,
} from "../server/services/limites-gasto";
import { resolverMetaAlvo, parseValorMeta, falaDeMeta, reciboMeta } from "../server/services/metas-alvo";
import { pareceLancamentoSemMeio, pareceLancamentoCompletoPj } from "../server/services/atalho-meio-pj";

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}: ${JSON.stringify({ obtido, esperado })}`); }
}
const id = (r: any) => ("meta" in r ? r.meta.id : "erro");

console.log("Limite: qual categoria");
const cats = [{ id: 1, nome: "Alimentação" }, { id: 2, nome: "Transporte" }, { id: 3, nome: "Alimentação fora" }];
igual("vazio = total", resolverAlvoLimite("", cats).id, null);
igual("geral = total", resolverAlvoLimite("geral", cats).id, null);
igual("sem acento, exato", resolverAlvoLimite("alimentacao", cats).id, 1);
igual("parcial única", resolverAlvoLimite("transp", cats).id, 2);
igual("inexistente = erro", !!resolverAlvoLimite("Lazer", cats).erro, true);

console.log("Faixas e janela");
igual("79% nada", faixaLimite(79.9), null);
igual("80%", faixaLimite(80), 80);
igual("130% = 100", faixaLimite(130), 100);
igual("NaN nada", faixaLimite(NaN), null);
igual("8h fora", dentroDaJanelaDiaria(8), false);
igual("9h dentro", dentroDaJanelaDiaria(9), true);
igual("20h fora", dentroDaJanelaDiaria(20), false);
igual("SP: 02:30Z = dia anterior 23h", agoraSP(new Date("2026-11-04T02:30:00Z")), { dia: "2026-11-03", hora: 23, mes: "2026-11" });
igual("somarDias virada de mês", somarDias("2026-11-30", 1), "2026-12-01");

console.log("Data do lembrete (SP)");
const agora = new Date("2026-11-03T15:00:00Z"); // 12h SP
const r1: any = interpretarDataLembrete("2026-11-03 15:00", agora);
igual("hoje 15h SP = 18h UTC", r1.ok && r1.data.toISOString(), "2026-11-03T18:00:00.000Z");
const r2: any = interpretarDataLembrete("2026-11-05", agora);
igual("só data = 9h SP", r2.ok && r2.data.toISOString(), "2026-11-05T12:00:00.000Z");
igual("passado = erro", interpretarDataLembrete("2026-11-03 08:00", agora).ok, false);
igual("lixo = erro", interpretarDataLembrete("amanhã", agora).ok, false);
igual("com fuso respeita", (interpretarDataLembrete("2026-11-04T10:00:00Z", agora) as any).data.toISOString(), "2026-11-04T10:00:00.000Z");

console.log("Textos");
igual("alerta 100%", textoAlertaLimite({ nome: "Alimentação", gasto: 900, limite: 800, faixa: 100 }).includes("113%"), true);
igual("contas hoje/amanhã", textoContasAVencer([{ descricao: "Luz", valor: 120.5, vencimento: "2026-11-03" }, { descricao: "Água", valor: 80, vencimento: "2026-11-04" }], "2026-11-03"),
  "📅 *Contas a vencer*\n\n• Luz: R$ 120,50 (vence *hoje*)\n• Água: R$ 80,00 (vence amanhã)\n\nJá pagou? Me avise por aqui que eu dou baixa.");

console.log("Meta: qual meta (nunca chuta)");
const metas = [
  { id: 10, titulo: "Viagem Europa", tipo: "sonho" },
  { id: 11, titulo: "Viagem", tipo: "caixinha" },
  { id: 12, titulo: "Reserva de Emergência", tipo: "reserva" },
  { id: 13, titulo: "Alimentação", tipo: "limite_categoria" },
];
igual("exato 'Viagem' não cai em 'Viagem Europa'", id(resolverMetaAlvo(metas, { titulo: "Viagem" })), 11);
igual("'viagens' (plural) = Viagem", id(resolverMetaAlvo(metas, { titulo: "viagens" })), 11);
igual("sem acento acha Emergência", id(resolverMetaAlvo(metas, { titulo: "reserva de emergencia" })), 12);
igual("'europa' = Viagem Europa", id(resolverMetaAlvo(metas, { titulo: "europa" })), 10);
igual("id válido vence título", id(resolverMetaAlvo(metas, { meta_id: 12, titulo: "Viagem" })), 12);
igual("id de outro usuário ignorado → título", id(resolverMetaAlvo(metas, { meta_id: 999, titulo: "Viagem" })), 11);
igual("inexistente = pergunta", id(resolverMetaAlvo(metas, { titulo: "Carro" })), "erro");
igual("limite nunca é alvo", id(resolverMetaAlvo(metas, { titulo: "Alimentação" })), "erro");
igual("uma meta + título errado = pergunta", id(resolverMetaAlvo([{ id: 1, titulo: "Viagem" }], { titulo: "Caixinha do carro" })), "erro");
igual("uma meta + sem título = essa", id(resolverMetaAlvo([{ id: 1, titulo: "Viagem" }], {}, "guardei 50")), 1);
const casaMoto = [{ id: 1, titulo: "Meta casa própria" }, { id: 2, titulo: "Moto" }];
igual("contexto ignora 'meta': moto", id(resolverMetaAlvo(casaMoto, {}, "saquei 50 da meta da moto")), 2);
const viagemCarro = [{ id: 1, titulo: "Dinheiro para viagem" }, { id: 2, titulo: "Carro novo" }];
igual("contexto ignora 'para/dinheiro': carro", id(resolverMetaAlvo(viagemCarro, {}, "tirei 200 da caixinha do carro para pagar")), 2);
igual("contexto ambíguo = pergunta", id(resolverMetaAlvo(metas, {}, "guardei 100 na viagem")), "erro");

console.log("Meta: valor");
igual("número", parseValorMeta(50), 50);
igual("texto '50'", parseValorMeta("50"), 50);
igual("BR '1.500,50'", parseValorMeta("1.500,50"), 1500.5);
igual("'R$ 50,00'", parseValorMeta("R$ 50,00"), 50);
igual("'1.500' milhar", parseValorMeta("1.500"), 1500);
igual("negativo = inválido", parseValorMeta(-50), null);
igual("zero = inválido", parseValorMeta(0), null);
igual("zero ok no ajuste", parseValorMeta(0, { permitirZero: true }), 0);
igual("vazio = inválido", parseValorMeta(undefined), null);
igual("NaN = inválido", parseValorMeta(NaN), null);
igual("lixo = inválido", parseValorMeta("abc"), null);
igual("centavos", parseValorMeta(10.005), 10.01);

console.log("Meta: recibo");
igual("depósito", reciboMeta("deposito", { titulo: "Viagem", valor_atual: 600, valor_alvo: 1000 }, 100),
  "Guardei R$ 100,00 na meta *Viagem*.\nSaldo: R$ 600,00 de R$ 1.000,00 (60%).");

console.log("Frases de meta saem dos atalhos PJ");
const HOJE = "2026-11-03";
for (const f of [
  "guardei 100 na caixinha",
  "depositei 300 na meta viagem",
  "resgatei 500 da reserva de emergência",
  "usei 80 da meta carro",
  "separei 50 pra viagem",
  "adiciona 100 na meta viagem",
  "deposito 300 na meta viagem",
  "guardei 100 em dinheiro na meta viagem",
]) {
  igual(`falaDeMeta: ${f}`, falaDeMeta(f), true);
  igual(`sem atalho: ${f}`, [pareceLancamentoSemMeio(f, HOJE), pareceLancamentoCompletoPj(f, HOJE)], [null, null]);
}
igual("'Pedágio na caixinha 100' continua despesa", falaDeMeta("Despesa Pedágio na caixinha 100 reais"), false);
igual("atalho PJ intacto", pareceLancamentoCompletoPj("Despesa Pedágio na caixinha 100 reais", HOJE) != null, true);

if (falhas) { console.log(`\n❌ ${falhas} falha(s)`); process.exit(1); }
console.log("\n✅ Lembretes, limites e metas OK");
