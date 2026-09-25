/**
 * Indicadores gerenciais e mapa do dinheiro — regras puras (sem banco).
 * npm run test:indicadores
 */
import { calcularIndicadores, grupoDreDaConta, somasVazias } from "../shared/indicadores-financeiros";
import { montarMapa } from "../server/services/erp/analise.service";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// Loja: vende 100 mil, paga 6 mil de Simples, 40 mil de mercadoria, 4 mil de
// comissão; 30 mil de fixas; 1 mil de tarifas; investe 5 mil; distribui 10 mil.
const loja = calcularIndicadores({
  ...somasVazias(),
  receita: 100_000, deducao: 6_000, cmv: 40_000, variavel: 4_000, fixa: 30_000,
  financeiro_despesa: 1_000, investimento: 5_000, nao_operacional_saida: 10_000,
});
eq("receita líquida", loja.receita_liquida, 94_000);
eq("lucro bruto", loja.lucro_bruto, 54_000);
eq("margem bruta % (sobre a líquida)", loja.margem_bruta_pct, 57.45);
eq("markup %", loja.markup_pct, 150);
eq("markup multiplicador", loja.markup_multiplicador, 2.5);
eq("margem de contribuição", loja.margem_contribuicao, 50_000);
eq("MC %", loja.margem_contribuicao_pct, 50);
eq("lucro operacional", loja.lucro_operacional, 20_000);
eq("ponto de equilíbrio", loja.ponto_equilibrio, 60_000);
eq("PE atingido %", loja.ponto_equilibrio_atingido_pct, 166.67);
eq("margem de segurança %", loja.margem_seguranca_pct, 40);
eq("resultado financeiro", loja.resultado_financeiro, -1_000);
eq("lucro líquido", loja.lucro_liquido, 19_000);
eq("margem líquida %", loja.margem_liquida_pct, 19);
eq("investimento e lucros não são despesa", loja.geracao_caixa, 4_000);

// Casos de borda
const vazio = calcularIndicadores(somasVazias());
eq("sem movimento: tudo zero e sem divisão por zero", [vazio.lucro_liquido, vazio.margem_contribuicao_pct, vazio.ponto_equilibrio, vazio.markup_pct], [0, null, null, null]);
const semCmv = calcularIndicadores({ receita: 10_000, fixa: 2_000 });
eq("sem CMV: markup nulo", [semCmv.markup_pct, semCmv.markup_multiplicador], [null, null]);
eq("sem CMV: PE = fixas (MC 100%)", semCmv.ponto_equilibrio, 2_000);
const prejuizo = calcularIndicadores({ receita: 1_000, cmv: 1_200, fixa: 500 });
eq("MC negativa: sem ponto de equilíbrio", prejuizo.ponto_equilibrio, null);
eq("MC negativa: lucro", prejuizo.lucro_liquido, -700);
const semFixa = calcularIndicadores({ receita: 1_000, cmv: 400 });
eq("sem fixas: PE zero", semFixa.ponto_equilibrio, 0);
eq("sem fixas: PE atingido nulo (não há o que cobrir)", semFixa.ponto_equilibrio_atingido_pct, null);

// Conta → linha da DRE
eq("receita operacional", grupoDreDaConta({ tipo: "Receita", grupo_gerencial: "receita" }), "receita");
eq("rendimento é financeiro", grupoDreDaConta({ tipo: "Receita", grupo_gerencial: "financeiro" }), "financeiro_receita");
eq("tarifa é financeiro", grupoDreDaConta({ tipo: "Despesa", grupo_gerencial: "financeiro" }), "financeiro_despesa");
eq("CMV marcado", grupoDreDaConta({ tipo: "Despesa", grupo_gerencial: "custo_variavel", is_cmv: true }), "cmv");
eq("comissão é variável", grupoDreDaConta({ tipo: "Despesa", grupo_gerencial: "custo_variavel" }), "variavel");
eq("Simples é dedução", grupoDreDaConta({ tipo: "Despesa", grupo_gerencial: "deducao" }), "deducao");
eq("empréstimo recebido", grupoDreDaConta({ tipo: "Receita", grupo_gerencial: "nao_operacional" }), "nao_operacional_entrada");
eq("plano antigo: FIXA sem grupo", grupoDreDaConta({ tipo: "Despesa", classificacao: "FIXA" }), "fixa");
eq("plano antigo: VARIAVEL sem grupo", grupoDreDaConta({ tipo: "Despesa", classificacao: "VARIAVEL" }), "variavel");

// Mapa do dinheiro
const mapa = montarMapa([
  { conta_id: 1, nome: "Vendas", grupo: "receita", total: 900 },
  { conta_id: 2, nome: "Serviços", grupo: "receita", total: 100 },
  { conta_id: 3, nome: "Aluguel", grupo: "fixa", total: 300 },
  { conta_id: 4, nome: "Luz", grupo: "fixa", total: 50 },
  { conta_id: 5, nome: "Mercadoria", grupo: "cmv", total: 400 },
]);
const soma = (f: (l: { source: number; target: number }) => boolean) => mapa.links.filter(f).reduce((s, l) => s + l.value, 0);
const caixa = mapa.nodes.findIndex((n) => n.coluna === 1);
eq("mapa: entradas", mapa.entradas, 1000);
eq("mapa: saldo vira sobra", mapa.nodes.some((n) => n.grupo === "sobra"), true);
eq("mapa: tudo que entra no caixa sai do caixa", soma((l) => l.target === caixa), soma((l) => l.source === caixa));
eq("mapa: grupo soma suas contas", mapa.links.find((l) => mapa.nodes[l.target].name === "Despesas fixas")?.value, 350);
const deficit = montarMapa([
  { conta_id: 1, nome: "Vendas", grupo: "receita", total: 100 },
  { conta_id: 3, nome: "Aluguel", grupo: "fixa", total: 300 },
]);
eq("mapa: déficit entra como falta", deficit.links.find((l) => deficit.nodes[l.source].grupo === "falta")?.value, 200);
const muitas = montarMapa(Array.from({ length: 10 }, (_, i) => ({ conta_id: i, nome: `R${i}`, grupo: "receita" as const, total: 10 + i })), { maxEntradas: 4 });
eq("mapa: entradas pequenas viram Outras", muitas.nodes.filter((n) => n.coluna === 0).length, 5);
eq("mapa: vazio", montarMapa([]).nodes.length, 0);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
