/**
 * Projeção de caixa — núcleo puro (sem banco). npm run test:projecao
 */
import { projetar, ocorrenciasMensalidade } from "../server/services/erp/projecao.service";
import { periodoAnterior } from "../server/services/erp/analise.service";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

const hoje = "2026-09-25";
const r = projetar(1000, [
  { data: "2026-09-20", descricao: "boleto atrasado", tipo: "Despesa", valor: 300, origem: "pagar", atrasado: true },
  { data: "2026-09-27", descricao: "venda", tipo: "Receita", valor: 500, origem: "receber" },
  { data: "2026-09-28", descricao: "aluguel", tipo: "Despesa", valor: 2500, origem: "pagar" },
  { data: "2026-10-05", descricao: "fora do horizonte", tipo: "Despesa", valor: 9999, origem: "pagar" },
], { hoje, fim: "2026-09-30", agrupar: "dia" });
eq("atrasado cai hoje", r.periodos[0].saidas, 300);
eq("um período por dia", r.periodos.length, 6);
eq("saldo final", r.saldo_final, -1300);
eq("primeiro negativo", r.primeiro_negativo, { data: "2026-09-28", saldo: -1300 });
eq("fora do horizonte ignorado", r.saidas, 2800);
eq("menor saldo", r.menor_saldo, { data: "2026-09-28", saldo: -1300 });

const inad = projetar(0, [{ data: hoje, descricao: "x", tipo: "Receita", valor: 1000, origem: "receber" }], { hoje, fim: hoje, agrupar: "dia", inadimplenciaPct: 10 });
eq("inadimplência reduz entradas", inad.entradas, 900);

const sem = projetar(500, [], { hoje: "2026-09-28", fim: "2026-10-12", agrupar: "semana" });
eq("semanas começam na segunda", sem.periodos.map((p) => p.inicio), ["2026-09-28", "2026-10-05", "2026-10-12"]);
const meioSemana = projetar(0, [], { hoje: "2026-09-25", fim: "2026-10-05", agrupar: "semana" });
eq("primeira semana começa hoje", meioSemana.periodos.map((p) => [p.inicio, p.fim]), [["2026-09-25", "2026-09-27"], ["2026-09-28", "2026-10-04"], ["2026-10-05", "2026-10-05"]]);
eq("sem movimento: saldo constante e sem negativo", [sem.saldo_final, sem.primeiro_negativo], [500, null]);
const mes = projetar(0, [], { hoje, fim: "2026-11-02", agrupar: "mes" });
eq("agrupar por mês", mes.periodos.map((p) => p.rotulo), ["set/26", "out/26", "nov/26"]);
eq("saldo inicial negativo já é alerta", projetar(-10, [], { hoje, fim: hoje, agrupar: "dia" }).primeiro_negativo, { data: hoje, saldo: -10 });

// Mensalidades futuras
eq("mensalidade: próximas não geradas", ocorrenciasMensalidade({ dia_vencimento: 10, ultima_competencia_gerada: "2026-09" }, hoje, "2026-12-31"), ["2026-10-10", "2026-11-10", "2026-12-10"]);
eq("mensalidade: dia 31 em mês curto", ocorrenciasMensalidade({ dia_vencimento: 31, ultima_competencia_gerada: "2026-10" }, hoje, "2026-12-31"), ["2026-11-30", "2026-12-31"]);
eq("mensalidade: respeita data_fim", ocorrenciasMensalidade({ dia_vencimento: 5, data_fim: "2026-11-30", ultima_competencia_gerada: null }, hoje, "2027-03-01"), ["2026-10-05", "2026-11-05"]);
eq("mensalidade: não gera vencimento passado", ocorrenciasMensalidade({ dia_vencimento: 1, ultima_competencia_gerada: null }, hoje, "2026-10-15"), ["2026-10-01"]);

// Período anterior do dashboard
eq("período anterior: mês cheio", periodoAnterior("2026-09-01", "2026-09-30"), { de: "2026-08-01", ate: "2026-08-31" });
eq("período anterior: trimestre", periodoAnterior("2026-01-01", "2026-03-31"), { de: "2025-10-01", ate: "2025-12-31" });
eq("período anterior: fevereiro", periodoAnterior("2026-03-01", "2026-03-31"), { de: "2026-02-01", ate: "2026-02-28" });
eq("período anterior: 7 dias", periodoAnterior("2026-09-08", "2026-09-14"), { de: "2026-09-01", ate: "2026-09-07" });

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
