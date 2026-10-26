/**
 * Projeção de 3 meses das mensalidades (sem banco): quais competências gerar.
 */
import { competenciasDevidas, MESES_PROJETADOS } from "../server/services/mensalidades.service";

let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}: obtido ${JSON.stringify(obtido)} esperado ${JSON.stringify(esperado)}`); }
}

const base = { dia_vencimento: 10 };
igual("projeta 3 meses", MESES_PROJETADOS, 3);
igual("nova: mês atual + 2", competenciasDevidas(base, "2026-10"), ["2026-10", "2026-11", "2026-12"]);
igual("vira o ano", competenciasDevidas(base, "2026-11"), ["2026-11", "2026-12", "2027-01"]);
igual("já gerou o mês atual (antiga): completa 2", competenciasDevidas({ ...base, ultima_competencia_gerada: "2026-10" }, "2026-10"), ["2026-11", "2026-12"]);
igual("projeção completa: nada", competenciasDevidas({ ...base, ultima_competencia_gerada: "2026-12" }, "2026-10"), []);
igual("mês novo: rola 1", competenciasDevidas({ ...base, ultima_competencia_gerada: "2026-12" }, "2026-11"), ["2027-01"]);
igual("reativada após meses: não retroage", competenciasDevidas({ ...base, ultima_competencia_gerada: "2026-03" }, "2026-10"), ["2026-10", "2026-11", "2026-12"]);
igual("data_fim corta", competenciasDevidas({ ...base, data_fim: "2026-11-15" }, "2026-10"), ["2026-10", "2026-11"]);
igual("data_fim antes do vencimento do mês", competenciasDevidas({ ...base, data_fim: "2026-11-05" }, "2026-10"), ["2026-10"]);
igual("data_inicio futura", competenciasDevidas({ ...base, data_inicio: "2026-11-20" }, "2026-10"), ["2026-11", "2026-12"]);
igual("data_inicio como Date", competenciasDevidas({ ...base, data_inicio: new Date("2026-12-01T00:00:00.000Z") }, "2026-10"), ["2026-12"]);

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nOK");
