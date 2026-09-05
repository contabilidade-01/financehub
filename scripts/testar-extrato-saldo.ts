/**
 * Teste: saldo acumulado do extrato PJ bate com saldoConta.
 * Sem DATABASE_URL válida → SKIP (exit 0), para não quebrar CI.
 */
import { pingDbOrSkip } from "./_db-test-helpers";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import {
  montarExtratoContaPj,
  saldoConta,
} from "../server/services/conta-bancaria.service";

async function main() {
  if (!(await pingDbOrSkip(db, "testar-extrato-saldo"))) {
    process.exit(0);
  }

  const contas = await db.execute(sql`
    SELECT id, empresa_id, nome, banco, saldo_inicial
    FROM contas_bancarias
    WHERE empresa_id IS NOT NULL AND ativo = true
    ORDER BY id
    LIMIT 5
  `);
  if (!(contas as any[]).length) {
    console.log("Nenhuma conta PJ — skip ok");
    process.exit(0);
  }

  let falhas = 0;
  for (const c of contas as any[]) {
    const ate = new Date().toISOString().slice(0, 10);
    const de = `${ate.slice(0, 8)}01`;
    const extrato = await montarExtratoContaPj(c.empresa_id, c.id, de, ate);
    const saldoFinalEsperado = await saldoConta(c.id, ate);
    const ultima = extrato.lancamentos[extrato.lancamentos.length - 1];
    const saldoLinha = ultima ? Number(ultima.saldo) : extrato.saldo_inicial;

    const diffLinha = Math.abs(saldoLinha - extrato.saldo_final);
    const diffConta = Math.abs(extrato.saldo_final - saldoFinalEsperado);
    const somaVariacao = Math.round(
      (extrato.entradas - extrato.saidas) * 100,
    ) / 100;
    const movPeriodo = Math.round(
      (extrato.saldo_final - extrato.saldo_inicial) * 100,
    ) / 100;

    const ok =
      diffLinha < 0.02 &&
      diffConta < 0.02 &&
      Math.abs(somaVariacao - movPeriodo) < 0.02;

    console.log(
      `${ok ? "OK" : "FAIL"} conta=${c.id} (${c.nome || c.banco}) ` +
        `ini=${extrato.saldo_inicial} fim=${extrato.saldo_final} ` +
        `saldoConta=${saldoFinalEsperado} mov=${movPeriodo} entradas-saidas=${somaVariacao}`,
    );
    if (!ok) falhas++;
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
