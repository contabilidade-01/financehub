/**
 * ERP PJ ME — regras puras (sem banco). npm run test:erp
 */
import { documentoValido, dividirParcelas, vencimentoDaParcela, dreParaCsv } from "../server/services/erp/erp.service";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// CPF/CNPJ
eq("CNPJ válido", documentoValido("11.222.333/0001-81"), true);
eq("CNPJ inválido", documentoValido("11.222.333/0001-82"), false);
eq("CNPJ repetido", documentoValido("11111111111111"), false);
eq("CPF válido", documentoValido("529.982.247-25"), true);
eq("CPF inválido", documentoValido("529.982.247-24"), false);
eq("tamanho errado", documentoValido("123"), false);

// Parcelas
eq("1000 em 3", dividirParcelas(1000, 3), [333.33, 333.33, 333.34]);
eq("soma bate", Math.round(dividirParcelas(1234.57, 7).reduce((a, b) => a + b, 0) * 100) / 100, 1234.57);
eq("1 parcela", dividirParcelas(99.9, 1), [99.9]);
eq("vencimento 31/jan → fev tem 28", [0, 1, 2].map((i) => vencimentoDaParcela("2026-01-31", i)), ["2026-01-31", "2026-02-28", "2026-03-31"]);
eq("virada de ano", vencimentoDaParcela("2026-11-15", 2), "2027-01-15");

// CSV do DRE (Excel pt-BR: ";" e vírgula decimal, com BOM)
const csv = dreParaCsv({
  periodo: { de: "2026-01-01", ate: "2026-02-28" }, regime: "caixa", centro_custo_id: null,
  meses: ["2026-01", "2026-02"],
  linhas: [
    { conta_id: 1, codigo: "1.01", nome: "Vendas; balcão", tipo: "Receita", grupo: "receita", valores: { "2026-01": 1000.5 }, total: 1000.5 },
    { conta_id: 2, codigo: "2.01", nome: "Aluguel", tipo: "Despesa", grupo: "fixa", valores: { "2026-02": 300 }, total: 300 },
  ],
  totais: { receita: 1000.5, variavel: 0, margem: 1000.5, fixa: 300, outras: 0, resultado: 700.5, margem_pct: 100, resultado_pct: 70 },
  por_mes: {
    "2026-01": { receita: 1000.5, variavel: 0, margem: 1000.5, fixa: 0, outras: 0, resultado: 1000.5, margem_pct: 100, resultado_pct: 100 },
    "2026-02": { receita: 0, variavel: 0, margem: 0, fixa: 300, outras: 0, resultado: -300, margem_pct: null, resultado_pct: null },
  },
} as any);
const linhas = csv.replace("﻿", "").split("\r\n");
eq("csv: BOM para o Excel", csv.startsWith("﻿"), true);
eq("csv: cabeçalho", linhas[0], "Código;Conta;2026-01;2026-02;Total");
eq("csv: conta com ; entre aspas", linhas[2], '1.01;"Vendas; balcão";1000,50;0,00;1000,50');
eq("csv: resultado negativo", linhas[linhas.length - 1], ";(=) Resultado;1000,50;-300,00;700,50");

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
