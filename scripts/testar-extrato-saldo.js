"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Teste: saldo acumulado do extrato PJ bate com saldoConta.
 * Sem DATABASE_URL válida → SKIP (exit 0), para não quebrar CI.
 */
const _db_test_helpers_1 = require("./_db-test-helpers");
const db_1 = require("../server/db");
const drizzle_orm_1 = require("drizzle-orm");
const conta_bancaria_service_1 = require("../server/services/conta-bancaria.service");
async function main() {
    if (!(await (0, _db_test_helpers_1.pingDbOrSkip)(db_1.db, "testar-extrato-saldo"))) {
        process.exit(0);
    }
    const contas = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, empresa_id, nome, banco, saldo_inicial
    FROM contas_bancarias
    WHERE empresa_id IS NOT NULL AND ativo = true
    ORDER BY id
    LIMIT 5
  `);
    if (!contas.length) {
        console.log("Nenhuma conta PJ — skip ok");
        process.exit(0);
    }
    let falhas = 0;
    for (const c of contas) {
        const ate = new Date().toISOString().slice(0, 10);
        const de = `${ate.slice(0, 8)}01`;
        const extrato = await (0, conta_bancaria_service_1.montarExtratoContaPj)(c.empresa_id, c.id, de, ate);
        const saldoFinalEsperado = await (0, conta_bancaria_service_1.saldoConta)(c.id, ate);
        const ultima = extrato.lancamentos[extrato.lancamentos.length - 1];
        const saldoLinha = ultima ? Number(ultima.saldo) : extrato.saldo_inicial;
        const diffLinha = Math.abs(saldoLinha - extrato.saldo_final);
        const diffConta = Math.abs(extrato.saldo_final - saldoFinalEsperado);
        const somaVariacao = Math.round((extrato.entradas - extrato.saidas) * 100) / 100;
        const movPeriodo = Math.round((extrato.saldo_final - extrato.saldo_inicial) * 100) / 100;
        const ok = diffLinha < 0.02 &&
            diffConta < 0.02 &&
            Math.abs(somaVariacao - movPeriodo) < 0.02;
        console.log(`${ok ? "OK" : "FAIL"} conta=${c.id} (${c.nome || c.banco}) ` +
            `ini=${extrato.saldo_inicial} fim=${extrato.saldo_final} ` +
            `saldoConta=${saldoFinalEsperado} mov=${movPeriodo} entradas-saidas=${somaVariacao}`);
        if (!ok)
            falhas++;
    }
    if (falhas) {
        console.error(`${falhas} falha(s)`);
        process.exit(1);
    }
    console.log("extrato saldo: ok");
    process.exit(0);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
