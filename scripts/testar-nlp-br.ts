/**
 * Fase 1 (IA) — frases reais do WhatsApp: valor, data, direção, vários lançamentos.
 * Sem LLM e sem banco. npm run test:nlp-br
 */
import {
  extrairDataBR,
  extrairValorBR,
  detectarDirecao,
  numeroBR,
  reconciliarLancamento,
  segmentarLancamentos,
  trechoDoLancamento,
  hojeSP,
} from "../server/services/nlp-br";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// ---------------- números ----------------
const numeros: [string, number][] = [
  ["1.500", 1500], ["1.500,00", 1500], ["1500", 1500], ["1500,5", 1500.5], ["12,90", 12.9], ["12.90", 12.9],
  ["1.234.567,89", 1234567.89], ["1,500.00", 1500], ["0,99", 0.99], ["1.5", 1.5], ["10.000", 10000],
];
for (const [t, v] of numeros) eq(`numeroBR ${t}`, numeroBR(t), v);

// ---------------- valor em frases ----------------
const valores: [string, number | null][] = [
  ["mercado 150", 150],
  ["gastei 1.500 no aluguel", 1500],
  ["aluguel 1.500,00", 1500],
  ["paguei R$ 89,90 de internet", 89.9],
  ["uber 23,5", 23.5],
  ["recebi 2k do cliente", 2000],
  ["entrou 1,5k de freela", 1500],
  ["vendi 3 mil em produtos", 3000],
  ["salário 4.200", 4200],
  ["dia 5 paguei o aluguel 1500", 1500],
  ["aluguel 1500 dia 5", 1500],
  ["2 pizzas 80", 80],
  ["comprei 3 cervejas por 27", 27],
  ["abasteci 40 litros 250", 250],
  ["farmácia 45 reais", 45],
  ["gastei mil e duzentos reais no conserto", 1200],
  ["almoço cinquenta reais", 50],
  ["padaria 12", 12],
  ["05/09 mercado 230,40", 230.4],
  ["comprei tênis 300 em 3x", 300],
  ["pix de 150 do João", 150],
  ["luz 187,33", 187.33],
  ["oi tudo bem?", null],
  ["quanto gastei esse mês?", null],
  ["conta de água 98,7", 98.7],
  ["14h almoço 35", 35],
];
for (const [t, v] of valores) eq(`valor "${t}"`, extrairValorBR(t), v);

// ---------------- datas (hoje fixo: sexta 25/09/2026) ----------------
const HOJE = "2026-09-25";
const datas: [string, string | null][] = [
  ["mercado 150", null],
  ["ontem gastei 50 no uber", "2026-09-24"],
  ["anteontem farmácia 30", "2026-09-23"],
  ["hoje almoço 35", "2026-09-25"],
  ["amanhã vence o boleto 200", "2026-09-26"],
  ["dia 5 paguei o aluguel", "2026-09-05"],
  ["no dia 30 comprei um presente", "2026-08-30"],
  ["dia 27 vence o cartão", "2026-09-27"],
  ["05/09 mercado 230", "2026-09-05"],
  ["5/9/26 mercado", "2026-09-05"],
  ["12/08/2026 dentista 300", "2026-08-12"],
  ["20/12 presente 100", "2025-12-20"],
  ["sexta passada jantar 120", "2026-09-18"],
  ["sexta jantar 120", "2026-09-25"],
  ["na segunda paguei a escola", "2026-09-21"],
  ["quinta gasolina 200", "2026-09-24"],
  ["quinta passada gasolina 200", "2026-09-24"],
  ["quinta retrasada gasolina 200", "2026-09-17"],
  ["sábado mercado 300", "2026-09-19"],
  ["5 de setembro academia 99", "2026-09-05"],
  ["semana passada cinema 60", "2026-09-18"],
  ["2026-09-01 aluguel", "2026-09-01"],
];
for (const [t, d] of datas) eq(`data "${t}"`, extrairDataBR(t, HOJE)?.data ?? null, d);
eq("hojeSP formato", /^\d{4}-\d{2}-\d{2}$/.test(hojeSP()), true);
// 23h30 em SP (02:30 UTC do dia seguinte) ainda é o mesmo dia
eq("hojeSP 23h30 BRT", hojeSP(new Date("2026-09-26T02:30:00Z")), "2026-09-25");

// ---------------- direção ----------------
const direcoes: [string, "Receita" | "Despesa" | null][] = [
  ["mercado 150", null],
  ["paguei o João 200", "Despesa"],
  ["o João me pagou 200", "Receita"],
  ["pagaram 500 do serviço", "Receita"],
  ["cliente pagou 300", "Receita"],
  ["caiu um pix de 150", "Receita"],
  ["recebi 2k", "Receita"],
  ["fiz um pix pro João de 50", "Despesa"],
  ["pix para a diarista 150", "Despesa"],
  ["pix do Pedro 80", "Receita"],
  ["estorno do cartão 80", "Receita"],
  ["reembolso da empresa 120", "Receita"],
  ["salário 4200", "Receita"],
  ["vendi um bolo por 60", "Receita"],
  ["gastei 50 no uber", "Despesa"],
  ["comprei um tênis 300", "Despesa"],
  ["conta de luz 187", "Despesa"],
  ["boleto do condomínio 650", "Despesa"],
  ["abasteci 200", "Despesa"],
  ["entrada 1000 consultoria", "Receita"],
  ["saída 300 fornecedor", "Despesa"],
  ["transferi 500 pra poupança", "Despesa"],
  ["me transferiram 300", "Receita"],
  ["cashback 12", "Receita"],
];
for (const [t, d] of direcoes) eq(`direção "${t}"`, detectarDirecao(t), d);

// ---------------- vários lançamentos ----------------
eq("segmentar 2", segmentarLancamentos("frete 50 e comissão 30").map((s) => s.valor), [50, 30]);
eq("segmentar lista", segmentarLancamentos("mercado 120, farmácia 45; uber 23,50").map((s) => s.valor), [120, 45, 23.5]);
eq("segmentar linhas", segmentarLancamentos("almoço 35\njanta 60").map((s) => s.valor), [35, 60]);
eq("não segmenta decimal", segmentarLancamentos("mercado 1.500,00").length, 1);
eq("não segmenta 'arroz e feijão 30'", segmentarLancamentos("arroz e feijão 30").length, 1);
eq("não segmenta 'mil e duzentos reais'", segmentarLancamentos("conserto mil e duzentos reais").length, 1);
eq("trecho por valor", trechoDoLancamento("frete 50 e comissão 30", 30), "comissão 30");

// ---------------- reconciliação LLM × texto ----------------
{
  const r = reconciliarLancamento({ valor: 1.5, tipo: "Despesa" }, "aluguel 1.500", { hoje: HOJE });
  eq("reconcilia 1.500 lido como 1.5", r.valor, 1500);
}
{
  const r = reconciliarLancamento({ valor: 5, data: "2026-09-05", tipo: "Despesa" }, "dia 5 paguei o aluguel 1500", { hoje: HOJE });
  eq("reconcilia primeiro número (dia 5)", [r.valor, r.data], [1500, "2026-09-05"]);
}
{
  const r = reconciliarLancamento({ valor: 50, data: "2026-09-26", tipo: "Despesa" }, "uber 50", { hoje: HOJE });
  eq("sem data no texto e LLM próximo: mantém", r.data, "2026-09-26");
}
{
  const r = reconciliarLancamento({ valor: 50, data: "2023-01-01", tipo: "Despesa" }, "uber 50", { hoje: HOJE });
  eq("data alucinada → hoje", r.data, HOJE);
}
{
  const r = reconciliarLancamento({ valor: 50, tipo: "Despesa" }, "ontem uber 50", { hoje: HOJE });
  eq("ontem vence o LLM", r.data, "2026-09-24");
}
{
  const r = reconciliarLancamento({ valor: 200, tipo: "Despesa" }, "o João me pagou 200", { hoje: HOJE });
  eq("tipo corrigido para Receita", r.tipo, "Receita");
}
{
  const r = reconciliarLancamento({ valor: 30, tipo: "Despesa" }, "frete 50 e comissão 30", { hoje: HOJE });
  eq("múltiplos: não troca o valor", r.valor, 30);
}
{
  const r = reconciliarLancamento({ valor: 120, data: "2026-09-10", tipo: "Despesa" }, "sim", { hoje: HOJE });
  eq("confirmação 'sim' mantém args", [r.valor, r.data, r.tipo], [120, "2026-09-10", "Despesa"]);
}
{
  const r = reconciliarLancamento({ valor: 0, tipo: "" }, "mercado 150", { hoje: HOJE });
  eq("valor 0 e tipo vazio", [r.valor, r.tipo], [150, null]);
}
{
  const r = reconciliarLancamento({ valor: 45.9, tipo: "Despesa" }, "Comprei item por 12.00\nTotal: 45.90", { hoje: HOJE, origemMidia: true });
  eq("mídia: não sobrescreve valor do LLM", r.valor, 45.9);
}

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
