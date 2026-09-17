"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Escolha do destino ao mover lançamentos (PF/PJ) — funções puras reais.
 */
const mover_meio_service_1 = require("../server/services/mover-meio.service");
let falhas = 0;
const ok = (n) => console.log("ok  ", n);
const fail = (n, d) => { falhas++; console.error("FAIL", n, "—", d); };
const cartoes = [
    { id: 1, nome: "CC Nubank PF" },
    { id: 2, nome: "CC C6 Carbon (PF)" },
    { id: 3, nome: "CC Inter Platinum" },
    { id: 4, nome: "CC Magalu Card" },
];
const contas = [
    { id: 10, nome: "Itaú Corrente", banco: "Itaú" },
    { id: 11, nome: "Caixa", banco: "Caixa Econômica" },
];
// O caso do diálogo: o usuário escreve o nome completo do cartão.
{
    const c = (0, mover_meio_service_1.acharPorNome)(cartoes, "CC Nubank PF");
    if ((c === null || c === void 0 ? void 0 : c.id) !== 1)
        fail("nome exato do cartão", String(c === null || c === void 0 ? void 0 : c.nome));
    else
        ok("acha o cartão pelo nome exato");
}
// "Nubank" sozinho: entre CARTÕES, só existe um que contém — pode resolver.
{
    const c = (0, mover_meio_service_1.acharPorNome)(cartoes, "Nubank");
    if ((c === null || c === void 0 ? void 0 : c.id) !== 1)
        fail("apelido do cartão", String(c === null || c === void 0 ? void 0 : c.nome));
    else
        ok("acha o cartão pelo apelido quando não há ambiguidade");
}
// Acento e caixa não podem atrapalhar.
{
    const c = (0, mover_meio_service_1.acharPorNome)(contas, "itau corrente");
    if ((c === null || c === void 0 ? void 0 : c.id) !== 10)
        fail("conta sem acento", String(c === null || c === void 0 ? void 0 : c.nome));
    else
        ok("acha a conta ignorando acento e caixa");
    const b = (0, mover_meio_service_1.acharPorNome)(contas, "Caixa Econômica");
    if ((b === null || b === void 0 ? void 0 : b.id) !== 11)
        fail("conta pelo banco", String(b === null || b === void 0 ? void 0 : b.nome));
    else
        ok("acha a conta pelo nome do banco");
}
// Nome que não existe não pode casar com nada — senão move para o lugar errado.
{
    const c = (0, mover_meio_service_1.acharPorNome)(cartoes, "Bradesco");
    if (c)
        fail("destino inexistente casou", String(c.nome));
    else
        ok("destino inexistente não casa com nenhum cartão");
    const vazio = (0, mover_meio_service_1.acharPorNome)(cartoes, "   ");
    if (vazio)
        fail("destino vazio casou", String(vazio.nome));
    else
        ok("destino vazio não casa com nada");
}
// Entre dois candidatos, vence o nome mais específico.
{
    const lista = [{ id: 1, nome: "CC Inter" }, { id: 2, nome: "CC Inter Platinum" }];
    const c = (0, mover_meio_service_1.acharPorNome)(lista, "CC Inter Platinum");
    if ((c === null || c === void 0 ? void 0 : c.id) !== 2)
        fail("mais específico", String(c === null || c === void 0 ? void 0 : c.nome));
    else
        ok("entre parecidos, vence o nome mais específico");
}
// Códigos: aceita lista, número solto, texto numérico; descarta lixo e repetido.
{
    const a = (0, mover_meio_service_1.idsLimpos)([352, 353, 353, "354", 0, -1, "abc", null]);
    if (a.join(",") !== "352,353,354")
        fail("limpeza de códigos", JSON.stringify(a));
    else
        ok("códigos: remove repetido, zero, negativo e texto");
    const b = (0, mover_meio_service_1.idsLimpos)(361);
    if (b.join(",") !== "361")
        fail("código solto", JSON.stringify(b));
    else
        ok("aceita um código solto fora de lista");
    if ((0, mover_meio_service_1.idsLimpos)([]).length !== 0)
        fail("lista vazia", "deveria ficar vazia");
    else
        ok("lista vazia continua vazia");
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nMover meio de pagamento: OK");
process.exitCode = falhas ? 1 : 0;
