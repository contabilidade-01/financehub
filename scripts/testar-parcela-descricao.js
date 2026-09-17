"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Parser de parcela no texto do lançamento + regra de dia/competência (sem banco).
 */
const parcela_descricao_1 = require("../shared/parcela-descricao");
const fatura_core_1 = require("../server/services/fatura-core");
let falhas = 0;
const ok = (n) => console.log("ok  ", n);
const fail = (n, d) => { falhas++; console.error("FAIL", n, "—", d); };
{
    const p = (0, parcela_descricao_1.parseParcelaNaDescricao)("UAZAPI (4/7) — Parcela 4/7 · Nescon · reembolso pendente");
    if (p.num !== 4 || p.total !== 7)
        fail("uazapi nums", JSON.stringify(p));
    else
        ok("lê 4/7 do texto UAZAPI");
    const q = (0, parcela_descricao_1.parseParcelaNaDescricao)("UAZAPI (5/7) — Parcela 5/7 · Nescon · reembolso pendente");
    if (!(0, parcela_descricao_1.basesParcelasIguais)(p.base, q.base))
        fail("base uazapi", `${p.base} vs ${q.base}`);
    else
        ok("parcelas UAZAPI 4/7 e 5/7 são a mesma compra");
}
{
    const p = (0, parcela_descricao_1.parseParcelaNaDescricao)("Assinatura Lovable (Escritório) 09/2026 — Nescon · reembolso pendente");
    if (p.num != null || p.total != null)
        fail("nao e parcela", JSON.stringify(p));
    else
        ok("09/2026 no texto não vira parcela");
}
{
    const p = (0, parcela_descricao_1.parseParcelaNaDescricao)("Compra Notebook Ester (21/21) — Parcela 21/21 · Nescon");
    if (p.num !== 21 || p.total !== 21)
        fail("21/21", JSON.stringify(p));
    else
        ok("lê parcela 21/21");
}
{
    if ((0, parcela_descricao_1.rotuloParcela)({ descricao: "x", parcela_num: 2, parcela_total: 12 }) !== "2/12") {
        fail("rotulo campo", "esperado 2/12");
    }
    else
        ok("rótulo usa campos da tabela quando existem");
}
{
    if ((0, fatura_core_1.competenciaMaisMeses)("2026-09", -3) !== "2026-06")
        fail("comp negativa", (0, fatura_core_1.competenciaMaisMeses)("2026-09", -3));
    else
        ok("competência recua meses (parcela anterior)");
    if ((0, fatura_core_1.competenciaMaisMeses)("2026-01", -1) !== "2025-12")
        fail("virada de ano", (0, fatura_core_1.competenciaMaisMeses)("2026-01", -1));
    else
        ok("competência recua virando o ano");
    if ((0, fatura_core_1.competenciaMaisMeses)("2026-09", 3) !== "2026-12")
        fail("comp positiva", (0, fatura_core_1.competenciaMaisMeses)("2026-09", 3));
    else
        ok("competência avança meses");
}
{
    if ((0, fatura_core_1.comDiaNoMes)("2026-09-28", 5) !== "2026-09-05")
        fail("comDiaNoMes set", (0, fatura_core_1.comDiaNoMes)("2026-09-28", 5));
    else
        ok("troca só o dia, mantém mês");
    if ((0, fatura_core_1.comDiaNoMes)("2026-02-10", 31) !== "2026-02-28")
        fail("fev 31", (0, fatura_core_1.comDiaNoMes)("2026-02-10", 31));
    else
        ok("dia 31 em fevereiro vira último dia do mês");
    // Fecha dia 10: compra dia 28 cai na fatura seguinte; dia 5 fica na do mês.
    const afrente = (0, fatura_core_1.competenciaDaCompra)("2026-09-28", 10, 17).competencia;
    const certa = (0, fatura_core_1.competenciaDaCompra)("2026-09-05", 10, 17).competencia;
    if (afrente !== "2026-10")
        fail("28 depois do fechamento", afrente);
    else
        ok("dia 28 com fecha 10 → competência outubro");
    if (certa !== "2026-09")
        fail("5 antes do fechamento", certa);
    else
        ok("dia 5 com fecha 10 → competência setembro");
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nParcela na descrição: OK");
process.exitCode = falhas ? 1 : 0;
