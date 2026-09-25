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
  pareceLancamentoCompletoPj,
} from "../server/services/atalho-meio-pj";
import { detectarCodigoConta, detectarCorrecaoValor } from "../server/services/correcao-rapida-pj";

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

console.log("Frase completa (descrição + valor + meio) → lança direto");
igual(
  "Despesa Pedágio na caixinha 100 reais",
  pareceLancamentoCompletoPj("Despesa Pedágio na caixinha 100 reais", HOJE),
  { descricao: "Pedágio", valor: 100, tipo: "Despesa", meio: "dinheiro" },
);
igual(
  "venda no pix com data",
  pareceLancamentoCompletoPj("Venda de mercadorias no dia 22/09/2026 R$ 350,00 no pix", HOJE),
  { descricao: "Venda de mercadorias", valor: 350, tipo: "Receita", meio: "pix", data: "2026-09-22" },
);
{
  const r = pareceLancamentoCompletoPj("Combustível 180 no banco Itaú", HOJE);
  igual("banco com acento sai da descrição", r && { d: r.descricao, v: r.valor }, { d: "Combustível", v: 180 });
}
igual("parcelado fica com o agente", pareceLancamentoCompletoPj("Notebook 3000 em 10x no cartão Inter", HOJE), null);
igual("fatura fica com o agente", pareceLancamentoCompletoPj("paguei a fatura do Inter 500 no pix", HOJE), null);
igual("cartão sem nome fica com o agente", pareceLancamentoCompletoPj("almoço 45 no cartão", HOJE), null);
igual("sem valor não lança", pareceLancamentoCompletoPj("Pedágio na caixinha", HOJE), null);

console.log("Código de conta nunca vira lançamento");
igual("Código 3.07 → conta", detectarCodigoConta("Código 3.07"), "3.07");
igual("conta 3.07", detectarCodigoConta("conta 3.07"), "3.07");
igual("classifica em 3.07", detectarCodigoConta("classifica em 3.07"), "3.07");
igual("lança na 3.07.01", detectarCodigoConta("lança na 3.07.01"), "3.07.01");
igual("'Código 3.07' não é lançamento de R$ 3,07", pareceLancamentoSemMeio("Código 3.07", HOJE), null);
igual("'conta 3.07' não é lançamento", pareceLancamentoSemMeio("conta 3.07", HOJE), null);
igual("conta de luz 150 continua lançamento", pareceLancamentoSemMeio("conta de luz 150", HOJE)?.valor, 150);
igual("venda 1.500.000 continua lançamento", pareceLancamentoSemMeio("venda do imóvel 1.500.000", HOJE)?.valor, 1500000);

console.log("Correção de valor");
igual("Corrige o valor 100,00", detectarCorrecaoValor("Corrige o valor 100,00"), { valor: 100 });
igual("corrigir valor para 1.500", detectarCorrecaoValor("corrigir valor para 1.500"), { valor: 1500 });
igual("muda o valor do #204 pra 100", detectarCorrecaoValor("muda o valor do #204 pra 100"), { valor: 100, id: 204 });
igual("altera o valor do lançamento 204 para 99,90", detectarCorrecaoValor("altera o valor do lançamento 204 para 99,90"), { valor: 99.9, id: 204 });
igual("'Corrige o valor' sem número → null", detectarCorrecaoValor("corrige o valor"), null);
igual("'Corrige o valor 100' não vira lançamento", pareceLancamentoSemMeio("Corrige o valor 100,00", HOJE), null);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nOK");
