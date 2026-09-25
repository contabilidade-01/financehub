/**
 * Atalho PJ do WhatsApp ("Anotei … Como entrou?") com as frases reais do cliente:
 * data informada, descrição limpa, valor que não vem da data, correção só do valor
 * e pergunta do valor quando falta.
 */
import {
  pareceLancamentoSemMeio,
  pareceLancamentoSemValor,
  respostaEhSoValor,
  respostaEhSoMeio,
  mensagemPedirMeio,
  mensagemPedirValor,
} from "../server/services/atalho-meio-pj";

const HOJE = "2026-09-25";
let falhas = 0;
function ok(m: string) { console.log(`  ✓ ${m}`); }
function fail(m: string, d: unknown) { falhas++; console.log(`  ✗ ${m}: ${JSON.stringify(d)}`); }
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok(nome);
  else fail(nome, { obtido, esperado });
}

console.log("Lançamento com data + valor (sem meio)");
igual(
  "venda 22/09/2026 Valor R$ 22,00",
  pareceLancamentoSemMeio("Venda de mercadorias no dia 22/09/2026 Valor R$ 22,00", HOJE),
  { descricao: "Venda de mercadorias", valor: 22, tipo: "Receita", data: "2026-09-22" },
);
igual(
  "compra 22/09/2026 no valor de 672 reais (valor não vem da data)",
  pareceLancamentoSemMeio("Compra de mercadorias no dia 22/09/2026 no valor de 672 reais", HOJE),
  { descricao: "Compra de mercadorias", valor: 672, tipo: "Despesa", data: "2026-09-22" },
);
igual(
  "venda 23/09 valor 1.250,90",
  pareceLancamentoSemMeio("venda de mercadorias dia 23/09 valor 1.250,90", HOJE),
  { descricao: "Venda de mercadorias", valor: 1250.9, tipo: "Receita", data: "2026-09-23" },
);
igual(
  "ontem",
  pareceLancamentoSemMeio("Compra de embalagens ontem 45,00", HOJE),
  { descricao: "Compra de embalagens", valor: 45, tipo: "Despesa", data: "2026-09-24" },
);
igual(
  "sem data → sem campo data (hoje)",
  pareceLancamentoSemMeio("abastecimento do carro 124,50", HOJE),
  { descricao: "Abastecimento do carro", valor: 124.5, tipo: "Despesa" },
);
igual(
  "data de hoje explícita → sem campo data",
  pareceLancamentoSemMeio("Venda balcão 25/09/2026 R$ 80", HOJE),
  { descricao: "Venda balcão", valor: 80, tipo: "Receita" },
);
igual("com meio → não intercepta", pareceLancamentoSemMeio("Venda 22/09 R$ 50 no dinheiro", HOJE), null);

console.log("Só o valor (correção do pendente)");
igual("Valor de 870,00 Reais", respostaEhSoValor("Valor de 870,00 Reais"), 870);
igual("870", respostaEhSoValor("870"), 870);
igual("R$ 1.200,50", respostaEhSoValor("R$ 1.200,50"), 1200.5);
igual("o valor é 672", respostaEhSoValor("o valor é 672"), 672);
igual("na verdade foi 870 reais", respostaEhSoValor("na verdade foi 870 reais"), 870);
igual("128,36 gasolina → não é só valor", respostaEhSoValor("128,36 gasolina"), null);
igual("870 no pix → não é só valor", respostaEhSoValor("870 no pix"), null);
igual("'Valor de 870,00 Reais' sozinho não vira lançamento", pareceLancamentoSemMeio("Valor de 870,00 Reais", HOJE), null);

console.log("Sem valor → perguntar o valor");
igual(
  "Venda de mercadorias no dia 23/09/2026",
  pareceLancamentoSemValor("Venda de mercadorias no dia 23/09/2026", HOJE),
  { descricao: "Venda de mercadorias", valor: null, tipo: "Receita", data: "2026-09-23" },
);
igual("com valor → não é 'sem valor'", pareceLancamentoSemValor("Venda de mercadorias 22/09 R$ 30", HOJE), null);
igual("pergunta não intercepta", pareceLancamentoSemValor("qual foi a última venda?", HOJE), null);
igual("consulta não intercepta", pareceLancamentoSemValor("quanto vendi em setembro", HOJE), null);
igual("conversa não intercepta", pareceLancamentoSemValor("bom dia, tudo bem?", HOJE), null);

console.log("Mensagens");
{
  const m = mensagemPedirMeio({ descricao: "Compra de mercadorias", valor: 870, tipo: "Despesa", data: "2026-09-22" }, true);
  if (/Corrigi: \*Compra de mercadorias\* em 22\/09\/2026 — R\$ 870,00/.test(m) && /Como foi pago\?/.test(m)) ok("correção mostra data e novo valor");
  else fail("mensagem correção", m);
  const v = mensagemPedirValor({ descricao: "Venda de mercadorias", valor: null, tipo: "Receita", data: "2026-09-23" });
  if (/\*Venda de mercadorias\* em 23\/09\/2026/.test(v) && /Qual o valor\?/.test(v)) ok("pede o valor com a data");
  else fail("mensagem valor", v);
}
igual("resposta 'pix itau' ainda é só meio", typeof respostaEhSoMeio("pix itau"), "string");

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nOK");
