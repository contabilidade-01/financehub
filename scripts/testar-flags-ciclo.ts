/**
 * Ciclo de vida das flags — funções puras.
 * npm run test:flags-ciclo
 */
import {
  calcularDiasLiberada,
  prontaParaAposentar,
  auditarDivergenciasFlags,
  DIAS_PARA_APOSENTAR,
} from "../server/services/feature-flags-logic";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

// dias nulo enquanto não liberada
if (calcularDiasLiberada(null) !== null) fail("null", "deveria ser null");
else ok("sem data → dias null");

{
  const agora = new Date("2026-09-05T12:00:00Z");
  const d0 = calcularDiasLiberada("2026-09-05T10:00:00Z", agora);
  if (d0 !== 0) fail("0 dias", `obtido ${d0}`);
  else ok("liberada hoje → 0 dias");

  const d30 = calcularDiasLiberada("2026-08-06T12:00:00Z", agora);
  if (d30 !== 30) fail("30 dias", `obtido ${d30}`);
  else ok("há 30 dias → 30");

  if (prontaParaAposentar(null)) fail("pronta null", "false");
  else ok("null não está pronta");

  if (prontaParaAposentar(29)) fail("29", "ainda não");
  else ok("29 dias → ainda não aposentar");

  if (!prontaParaAposentar(30)) fail("30", "deveria");
  else ok(`>= ${DIAS_PARA_APOSENTAR} → pronta`);

  if (!prontaParaAposentar(45)) fail("45", "deveria");
  else ok("45 dias → pronta");
}

// Desligar limpa data → dias null (simulado)
if (calcularDiasLiberada(null) !== null) fail("desligada", "null");
else ok("desligar (sem data) → sem contagem");

{
  const div = auditarDivergenciasFlags(
    ["agente_meio_pagamento", "nova_feature"],
    ["agente_meio_pagamento", "velha_morta"],
  );
  if (div.soNoCodigo.join() !== "nova_feature") fail("soNoCodigo", JSON.stringify(div));
  else ok("auditoria: chave só no código");
  if (div.soNoBanco.join() !== "velha_morta") fail("soNoBanco", JSON.stringify(div));
  else ok("auditoria: chave só no banco");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nFlags ciclo: OK");
