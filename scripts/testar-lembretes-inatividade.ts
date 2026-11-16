/**
 * Bateria dos lembretes por inatividade (regras puras, sem banco).
 *   npx tsx scripts/testar-lembretes-inatividade.ts
 */
import {
  datasDasEtapas,
  datasOriginais,
  etapaParaHoje,
  foiAntecipada,
  dentroDoHorarioInatividade,
  textoInatividade,
  interpretarResposta,
  diaDaSemana,
  somarDiasISO,
  ETAPAS_INATIVIDADE,
} from "../server/services/lembretes-inatividade";

let falhas = 0;
function ok(nome: string, obtido: unknown, esperado: unknown) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!passou) falhas++;
  console.log(`${passou ? "✅" : "❌"} ${nome}${passou ? "" : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// --- Datas (2026-11-16 é segunda) ---
ok("2026-11-16 é segunda", diaDaSemana("2026-11-16"), 1);
ok("anotou segunda: datas", datasDasEtapas("2026-11-16"), {
  1: "2026-11-18", 2: "2026-11-20", 3: "2026-11-23", 4: "2026-11-30", 5: "2027-01-01",
});
// Quinta: D+2 cai no sábado → sexta.
ok("anotou quinta: D+2 sábado antecipa para sexta", datasDasEtapas("2026-11-19")[1], "2026-11-20");
ok("…e marca como antecipada", foiAntecipada("2026-11-19", 1, "2026-11-20"), true);
ok("…segunda etapa normal", datasDasEtapas("2026-11-19")[2], "2026-11-23");
ok("…etapa 3 na segunda a partir de D+6", datasDasEtapas("2026-11-19")[3], "2026-11-30");
ok("…etapa 4 D+14", datasDasEtapas("2026-11-19")[4], "2026-12-03");
// Dia 1 no sábado (2026-08-01) → sexta 31/07.
ok("dia 1 no sábado → sexta", datasDasEtapas("2026-07-01")[5], "2026-07-31");
ok("…original era o dia 1", datasOriginais("2026-07-01")[5], "2026-08-01");

// Nenhuma etapa cai no sábado, para qualquer dia de última anotação em um ano.
let algumSabado = false;
let ordemQuebrada = false;
let etapa3NaoSegunda = false;
for (let i = 0; i < 366; i++) {
  const ultima = somarDiasISO("2026-01-01", i);
  const d = datasDasEtapas(ultima);
  for (const e of ETAPAS_INATIVIDADE) if (diaDaSemana(d[e]) === 6) algumSabado = true;
  for (let e = 2; e <= 5; e++) if (d[e as 2] <= d[(e - 1) as 1]) ordemQuebrada = true;
  if (diaDaSemana(d[3]) !== 1) etapa3NaoSegunda = true;
}
ok("nenhuma etapa no sábado (1 ano)", algumSabado, false);
ok("etapas sempre em ordem e em dias diferentes", ordemQuebrada, false);
ok("etapa 3 sempre segunda", etapa3NaoSegunda, false);

// --- Qual etapa sai hoje ---
const U = "2026-11-16";
ok("D+1: nada", etapaParaHoje(U, "2026-11-17"), null);
ok("D+2: etapa 1", etapaParaHoje(U, "2026-11-18"), 1);
ok("D+3 sem ter enviado: etapa 1 (tolerância)", etapaParaHoje(U, "2026-11-19"), 1);
ok("D+3 já enviada: nada", etapaParaHoje(U, "2026-11-19", [1]), null);
ok("D+4: etapa 2", etapaParaHoje(U, "2026-11-20", [1]), 2);
ok("sábado: nunca", etapaParaHoje(U, "2026-11-21", [1]), null);
ok("domingo pega a etapa 2 atrasada (deploy/sexta ocupada)", etapaParaHoje(U, "2026-11-22", [1]), 2);
ok("segunda: etapa 3", etapaParaHoje(U, "2026-11-23", [1, 2]), 3);
ok("D+14: etapa 4", etapaParaHoje(U, "2026-11-30", [1, 2, 3]), 4);
ok("dia 1: etapa 5", etapaParaHoje(U, "2027-01-01", [1, 2, 3, 4]), 5);
ok("dia 1 sem ter passado pela etapa 4: nada (sem envio em massa)", etapaParaHoje(U, "2027-01-01", [1, 2, 3]), null);
ok("depois da 5: silêncio", etapaParaHoje(U, "2027-01-04", [1, 2, 3, 4, 5]), null);
ok("muito tempo depois: silêncio", etapaParaHoje(U, "2027-03-01"), null);
ok("anotou hoje: nada", etapaParaHoje(U, U), null);
ok("não volta para etapa anterior", etapaParaHoje(U, "2026-11-19", [2]), null);
ok("quinta→sexta antecipada sai na sexta", etapaParaHoje("2026-11-19", "2026-11-20"), 1);

// Primeira execução (flag recém-ligada): quem está parado há tempo não recebe atrasados.
ok("parado há 13 dias, etapa 3 venceu há uma semana: nada hoje", etapaParaHoje("2026-11-03", "2026-11-16"), null);
ok("parado há 9 dias, etapa 3 venceu hoje: só ela", etapaParaHoje("2026-11-07", "2026-11-16"), 3);
// Numa terça comum (sem dia 1 por perto), ninguém parado há mais de 16 dias recebe nada.
let antigoRecebe = false;
for (let i = 17; i <= 60; i++) {
  if (etapaParaHoje(somarDiasISO("2026-11-17", -i), "2026-11-17")) antigoRecebe = true;
}
ok("1ª execução: parado há 17+ dias não recebe atrasados", antigoRecebe, false);

// --- Horário ---
ok("12h29 não", dentroDoHorarioInatividade(12, 29), false);
ok("12h30 sim", dentroDoHorarioInatividade(12, 30), true);
ok("19h59 sim", dentroDoHorarioInatividade(19, 59), true);
ok("20h não", dentroDoHorarioInatividade(20, 0), false);
ok("9h não", dentroDoHorarioInatividade(9, 0), false);

// --- Textos ---
const t1 = textoInatividade({ etapa: 1, nome: "MARIA silva", ultimaAnotacao: "2026-11-16" });
ok("texto 1 com primeiro nome", /Maria/.test(t1) && !/silva/i.test(t1), true);
const t1pj = textoInatividade({ etapa: 1, nome: "João", pj: true, ultimaAnotacao: "2026-11-16" });
ok("texto 1 PJ fala de venda", /venda/.test(t1pj), true);
const t4 = textoInatividade({ etapa: 4, nome: "Ana", ultimaAnotacao: "2026-11-16" });
ok("texto 4 tem a pergunta", t4.includes("Responda *SIM* ou *PAUSAR*"), true);
ok("texto 5 antecipado fala de amanhã", textoInatividade({ etapa: 5, nome: "Ana", ultimaAnotacao: "x", antecipada: true }).startsWith("Amanhã"), true);
ok("sem nome não quebra", textoInatividade({ etapa: 2, nome: "", ultimaAnotacao: "2026-11-16" }).includes("undefined"), false);
const variacoes = new Set([0, 1, 2, 3, 4, 5].map((i) => textoInatividade({ etapa: 1, nome: "Ana", ultimaAnotacao: somarDiasISO(U, i) })));
ok("textos variam entre ciclos", variacoes.size, 2);

// --- Respostas ---
ok("PAUSAR", interpretarResposta("PAUSAR"), "pausar");
ok("pausar lembretes", interpretarResposta("Pausar os lembretes!"), "pausar");
ok("ativar lembretes", interpretarResposta("ATIVAR LEMBRETES"), "ativar");
ok("Sim", interpretarResposta("Sim!"), "sim");
ok("lançamento não é capturado", interpretarResposta("almoço 32 pix"), null);
ok("frase com pausa não é capturada", interpretarResposta("vou pausar a academia, quanto gastei?"), null);
ok("sim no meio de frase não é capturado", interpretarResposta("sim, gastei 50 no mercado"), null);

console.log(falhas ? `\n❌ ${falhas} falha(s)` : "\n✅ Tudo certo");
process.exit(falhas ? 1 : 0);
