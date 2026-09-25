/**
 * Datas no calendário de São Paulo ("termina hoje/amanhã"). npm run test:datas-sp
 */
import { diaSP, diasAteSP, dataBrSP } from "../shared/datas-sp";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// "Agora" = 25/09/2026 às 09:00 em São Paulo (12:00 UTC).
const agora = new Date("2026-09-25T12:00:00Z");

// O caso do print: degustação acaba hoje, mais tarde → "hoje", não "amanhã".
eq("vence hoje às 14h", diasAteSP("2026-09-25T17:00:00Z", agora), 0);
eq("vence hoje às 23h SP (02h UTC do dia 26)", diasAteSP("2026-09-26T02:00:00Z", agora), 0);
eq("vence amanhã 00:30 SP (03:30 UTC)", diasAteSP("2026-09-26T03:30:00Z", agora), 1);
eq("venceu ontem", diasAteSP("2026-09-24T15:00:00Z", agora), -1);
eq("vence daqui a 15 dias", diasAteSP("2026-10-10T12:00:00Z", agora), 15);
eq("já venceu hoje de manhã: ainda é o dia de hoje", diasAteSP("2026-09-25T10:00:00Z", agora), 0);

// Noite em SP quando o UTC já virou o dia.
const noite = new Date("2026-09-26T01:00:00Z"); // 25/09 22:00 em SP
eq("22h SP: hoje ainda é 25", diaSP(noite), "2026-09-25");
eq("22h SP: vence 01h UTC do dia 26 → hoje", diasAteSP("2026-09-26T01:30:00Z", noite), 0);

// Datas puras (colunas DATE) não mudam de dia.
eq("data pura é o próprio dia", diaSP("2026-09-26"), "2026-09-26");
eq("data pura amanhã", diasAteSP("2026-09-26", agora), 1);
eq("data pura hoje", diasAteSP("2026-09-25", agora), 0);

// Exibição
eq("exibe o dia de SP, não o de UTC", dataBrSP("2026-09-26T02:00:00Z"), "25/09/2026");
eq("exibe data pura sem deslocar", dataBrSP("2026-09-26"), "26/09/2026");
eq("vazio", [dataBrSP(null), diasAteSP(undefined), diasAteSP("")], [null, null, null]);
eq("inválido", [dataBrSP("abc"), diasAteSP("abc", agora)], [null, null]);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
