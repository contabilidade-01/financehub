/**
 * Confere se o parser PJ lê a planilha gerada. Uso:
 *   npx tsx docs/importacao/testar-parser-pj.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLancamentosPj } from "../../server/services/import-lancamentos-pj.service.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arquivo = process.argv[2] || path.join(__dirname, "lancamentos-pj-importacao.xlsx");

const { linhas, erros } = parseLancamentosPj(fs.readFileSync(arquivo));

const reemb = linhas.filter((l) => l.reembolsoPessoal);
const contas = linhas.filter((l) => !l.reembolsoPessoal);
const soma = (arr) => arr.reduce((s, l) => s + l.valor, 0);

console.log("Arquivo:", path.basename(arquivo));
console.log("Linhas lidas:", linhas.length, "| erros:", erros.length);
console.log(`Reembolsos pessoais: ${reemb.length} grupos | R$ ${soma(reemb).toFixed(2)} | itens: ${reemb.reduce((s, l) => s + (l.itensAgrupados || 0), 0)}`);
console.log(`Contas a pagar: ${contas.length} | R$ ${soma(contas).toFixed(2)}`);

const formas = new Map();
for (const l of linhas) {
  if (!l.forma) continue;
  const k = l.forma + (l.formaEhCartao ? ` [cartão · venc. ${l.formaDiaVencimento ?? "?"}]` : "");
  formas.set(k, (formas.get(k) || 0) + 1);
}
console.log("\nFormas de pagamento:");
for (const [nome, qtd] of [...formas].sort((a, b) => b[1] - a[1])) console.log(`  ${qtd.toString().padStart(3)}x  ${nome}`);

const cats = new Map();
for (const l of linhas) cats.set(l.categoria || "(vazio)", (cats.get(l.categoria || "(vazio)") || 0) + 1);
console.log("\nCategorias:");
for (const [nome, qtd] of [...cats].sort((a, b) => b[1] - a[1])) console.log(`  ${qtd.toString().padStart(3)}x  ${nome}`);

if (erros.length) {
  console.log("\nErros:");
  for (const e of erros.slice(0, 20)) console.log(" ", e);
}

console.log("\nAmostra reembolsos:");
for (const l of reemb.slice(0, 4)) console.log(" ", JSON.stringify(l));
console.log("\nAmostra contas:");
for (const l of contas.slice(0, 4)) console.log(" ", JSON.stringify(l));
