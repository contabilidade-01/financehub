/**
 * Contas a pagar/receber — regras puras (sem banco). npm run test:titulos
 */
import { diferencaDaBaixa, faixaAging, dinheiro } from "../server/services/erp/titulos.service";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// Diferença na baixa → lançamento complementar no resultado financeiro
eq("pagou com juros", diferencaDaBaixa("Despesa", 2500, 2537.5), { chave: "juros_pagos", tipo: "Despesa", valor: 37.5 });
eq("pagou com desconto", diferencaDaBaixa("Despesa", 1000, 950), { chave: "desconto_obtido", tipo: "Receita", valor: 50 });
eq("recebeu com juros", diferencaDaBaixa("Receita", 300, 309.9), { chave: "juros_recebidos", tipo: "Receita", valor: 9.9 });
eq("recebeu com desconto", diferencaDaBaixa("Receita", 300, 285), { chave: "desconto_concedido", tipo: "Despesa", valor: 15 });
eq("valor exato não gera nada", diferencaDaBaixa("Despesa", 99.9, 99.9), null);
eq("centavo de arredondamento é ignorado", diferencaDaBaixa("Receita", 333.33, 333.335), null);
eq("ponto flutuante", diferencaDaBaixa("Despesa", 0.1 + 0.2, 0.3), null);

// Aging
const hoje = "2026-09-25";
eq("a vencer (hoje)", faixaAging("2026-09-25", hoje), "a_vencer");
eq("a vencer (futuro)", faixaAging("2026-12-01", hoje), "a_vencer");
eq("1 dia", faixaAging("2026-09-24", hoje), "1_30");
eq("30 dias", faixaAging("2026-08-26", hoje), "1_30");
eq("31 dias", faixaAging("2026-08-25", hoje), "31_60");
eq("61 dias", faixaAging("2026-07-26", hoje), "61_90");
eq("mais de 90", faixaAging("2026-01-01", hoje), "90_mais");

// Valores digitados
eq("pt-BR com milhar", dinheiro("2.537,50"), 2537.5);
eq("pt-BR sem milhar", dinheiro("37,5"), 37.5);
eq("ponto decimal", dinheiro("1234.56"), 1234.56);
eq("com R$", dinheiro("R$ 1.000,00"), 1000);
eq("número", dinheiro(12.345), 12.35);
eq("vazio", Number.isNaN(dinheiro("")), true);
eq("texto", Number.isNaN(dinheiro("abc")), true);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
