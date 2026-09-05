/**
 * Unit: chaveNomeCartao — "Nubank" e "CC Nubank" são o mesmo cartão.
 * npm run test:chave-cartao  (ou: npx tsx scripts/testar-chave-cartao.ts)
 */
import { chaveNomeCartao } from "../server/services/fatura-pj.service";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const casos: [string, string][] = [
  ["Nubank", "CC Nubank"],
  ["nubank", "CC nubank"],
  ["CC Inter PJ", "Inter PJ"],
  ["  CC  Magalu ", "Magalu"],
];

for (const [a, b] of casos) {
  assert(chaveNomeCartao(a) === chaveNomeCartao(b), `esperava iguais: "${a}" vs "${b}"`);
}

assert(chaveNomeCartao("Nubank") !== chaveNomeCartao("Inter"), "Nubank ≠ Inter");
assert(chaveNomeCartao("CC Nubank") !== chaveNomeCartao("CC C6"), "Nubank ≠ C6");

console.log("OK chaveNomeCartao —", casos.length, "pares + distinções");
