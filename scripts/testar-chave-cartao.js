"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit: chaveNomeCartao — "Nubank" e "CC Nubank" são o mesmo cartão.
 * npm run test:chave-cartao  (ou: npx tsx scripts/testar-chave-cartao.ts)
 */
const fatura_pj_service_1 = require("../server/services/fatura-pj.service");
function assert(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
const casos = [
    ["Nubank", "CC Nubank"],
    ["nubank", "CC nubank"],
    ["CC Inter PJ", "Inter PJ"],
    ["  CC  Magalu ", "Magalu"],
];
for (const [a, b] of casos) {
    assert((0, fatura_pj_service_1.chaveNomeCartao)(a) === (0, fatura_pj_service_1.chaveNomeCartao)(b), `esperava iguais: "${a}" vs "${b}"`);
}
assert((0, fatura_pj_service_1.chaveNomeCartao)("Nubank") !== (0, fatura_pj_service_1.chaveNomeCartao)("Inter"), "Nubank ≠ Inter");
assert((0, fatura_pj_service_1.chaveNomeCartao)("CC Nubank") !== (0, fatura_pj_service_1.chaveNomeCartao)("CC C6"), "Nubank ≠ C6");
console.log("OK chaveNomeCartao —", casos.length, "pares + distinções");
