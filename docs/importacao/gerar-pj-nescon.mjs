/**
 * Gera a planilha de importação PJ a partir do controle colado.
 * Uso: node docs/importacao/gerar-pj-nescon.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Grupos mensais de reembolso: [mês por extenso, itens, valor]
const REEMBOLSOS = [
  ["dezembro de 2027", 1, 51.0],
  ["novembro de 2027", 1, 51.0],
  ["outubro de 2027", 2, 172.06],
  ["setembro de 2027", 2, 172.06],
  ["agosto de 2027", 3, 309.48],
  ["julho de 2027", 3, 309.48],
  ["junho de 2027", 4, 410.62],
  ["maio de 2027", 5, 459.75],
  ["abril de 2027", 6, 484.75],
  ["março de 2027", 7, 513.75],
  ["fevereiro de 2027", 10, 621.97],
  ["janeiro de 2027", 13, 981.44],
  ["dezembro de 2026", 26, 1892.17],
  ["novembro de 2026", 27, 1992.16],
  ["outubro de 2026", 28, 2225.49],
  ["setembro de 2026", 31, 2350.38],
];

// No controle original o convênio vem sem categoria ("—"), o que jogaria tudo
// em "Diversos" junto com os reembolsos. Aqui recebe conta própria.
const CAT_CONVENIO = "3.6 - Convênio Médico";

// Lançamentos datados: [data, descrição, categoria, forma, valor]
const LANCAMENTOS = [
  ["16/04/2027", "NotreDame — Convênio Médico Titular (12/12)\nParcela 12/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/04/2027", "NotreDame — Convênio Médico Dependente (12/12)\nParcela 12/12", CAT_CONVENIO, "Boleto", 347.15],
  ["16/03/2027", "NotreDame — Convênio Médico Titular (11/12)\nParcela 11/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/03/2027", "NotreDame — Convênio Médico Dependente (11/12)\nParcela 11/12", CAT_CONVENIO, "Boleto", 347.15],
  ["04/03/2027", "Estagiaria (12/12)", "4.1 - Salário", "PIX", 1275.0],
  ["16/02/2027", "NotreDame — Convênio Médico Titular (10/12)\nParcela 10/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/02/2027", "NotreDame — Convênio Médico Dependente (10/12)\nParcela 10/12", CAT_CONVENIO, "Boleto", 347.15],
  ["04/02/2027", "Estagiaria (11/12)", "4.1 - Salário", "PIX", 1275.0],
  ["16/01/2027", "NotreDame — Convênio Médico Titular (9/12)\nParcela 9/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/01/2027", "NotreDame — Convênio Médico Dependente (9/12)\nParcela 9/12", CAT_CONVENIO, "Boleto", 347.15],
  ["04/01/2027", "Estagiaria (10/12)", "4.1 - Salário", "PIX", 1275.0],
  ["30/12/2026", "Reserva 13º (12/2026)", "Reserva 13º", "PIX", 1500.0],
  ["16/12/2026", "NotreDame — Convênio Médico Titular (8/12)\nParcela 8/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/12/2026", "NotreDame — Convênio Médico Dependente (8/12)\nParcela 8/12", CAT_CONVENIO, "Boleto", 347.15],
  ["04/12/2026", "Estagiaria (9/12)", "4.1 - Salário", "PIX", 1275.0],
  ["29/11/2026", "Reserva 13º (11/2026)", "Reserva 13º", "PIX", 1500.0],
  ["26/11/2026", "Tecnologias (11/2026)", "3.4 - Tecnologias", "PIX", 80.08],
  ["20/11/2026", "INSS (11/2026)", "4.4 - INSS", "PIX", 482.58],
  ["20/11/2026", "Reserva para Materiais de Limpeza (11/2026)", "9 - Materiais de Limpeza", "PIX", 60.0],
  ["20/11/2026", "Mlabs (11/2026)", "3.4 - Tecnologias", "CC INTER PJ · Venc. 25", 39.45],
  ["20/11/2026", "Mensalidade GCLICK (11/2026)", "3.4 - Tecnologias", "PIX", 150.0],
  ["20/11/2026", "Mensalidade RedFox (11/2026)", "3.3 - Telefone e Internet", "PIX", 129.9],
  ["20/11/2026", "FGTS do mes (11/2026)", "4.5 - FGTS", "PIX", 133.58],
  ["16/11/2026", "NotreDame — Convênio Médico Titular (7/12)\nParcela 7/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/11/2026", "NotreDame — Convênio Médico Dependente (7/12)\nParcela 7/12", CAT_CONVENIO, "Boleto", 347.15],
  ["15/11/2026", "Aluguel (11/2026)", "3.1 - Aluguel", "PIX", 1060.0],
  ["15/11/2026", "Mensalidade SIEG (11/2026)", "3.4 - Tecnologias", "PIX", 708.0],
  ["15/11/2026", "Seguro Comercial (11/2026)", "3.2 - Seguros", "PIX", 231.84],
  ["15/11/2026", "Marketing (11/2026)", "2.1 - Marketing", "PIX", 300.0],
  ["10/11/2026", "Mensalidade TIM PJ (11/2026)", "3.3 - Telefone e Internet", "PIX", 35.0],
  ["10/11/2026", "Domínio Sistema (11/2026)", "3.5 - Domínio Sistema", "PIX", 1041.22],
  ["05/11/2026", "Despesa com Pessoal (11/2026)", "4.1 - Salário", "PIX", 2163.02],
  ["05/11/2026", "Pró-Labore (11/2026)", "5.2 - Pró-Labore", "PIX", 6000.0],
  ["04/11/2026", "Estagiaria (8/12)", "4.1 - Salário", "PIX", 1275.0],
  ["30/10/2026", "Reserva 13º (10/2026)", "Reserva 13º", "PIX", 1500.0],
  ["26/10/2026", "Tecnologias (10/2026)", "3.4 - Tecnologias", "PIX", 80.08],
  ["20/10/2026", "Mensalidade GCLICK (10/2026)", "3.4 - Tecnologias", "PIX", 150.0],
  ["20/10/2026", "Mlabs (10/2026)", "3.4 - Tecnologias", "CC INTER PJ · Venc. 25", 39.45],
  ["20/10/2026", "INSS (10/2026)", "4.4 - INSS", "PIX", 482.58],
  ["20/10/2026", "Reserva para Materiais de Limpeza (10/2026)", "9 - Materiais de Limpeza", "PIX", 60.0],
  ["20/10/2026", "Mensalidade RedFox (10/2026)", "3.3 - Telefone e Internet", "PIX", 129.9],
  ["20/10/2026", "FGTS do mes (10/2026)", "4.5 - FGTS", "PIX", 133.58],
  ["16/10/2026", "NotreDame — Convênio Médico Titular (6/12)\nParcela 6/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/10/2026", "NotreDame — Convênio Médico Dependente (6/12)\nParcela 6/12", CAT_CONVENIO, "Boleto", 347.15],
  ["15/10/2026", "Mensalidade SIEG (10/2026)", "3.4 - Tecnologias", "PIX", 708.0],
  ["15/10/2026", "Marketing (10/2026)", "2.1 - Marketing", "PIX", 300.0],
  ["15/10/2026", "Aluguel (10/2026)", "3.1 - Aluguel", "PIX", 1060.0],
  ["15/10/2026", "Seguro Comercial (10/2026)", "3.2 - Seguros", "PIX", 231.84],
  ["10/10/2026", "Mensalidade TIM PJ (10/2026)", "3.3 - Telefone e Internet", "PIX", 35.0],
  ["10/10/2026", "Domínio Sistema (10/2026)", "3.5 - Domínio Sistema", "PIX", 1041.22],
  ["05/10/2026", "Pró-Labore (10/2026)", "5.2 - Pró-Labore", "PIX", 6000.0],
  ["05/10/2026", "Despesa com Pessoal (10/2026)", "4.1 - Salário", "PIX", 2163.02],
  ["04/10/2026", "Estagiaria (7/12)", "4.1 - Salário", "PIX", 1275.0],
  ["29/09/2026", "Reserva 13º (09/2026)", "Reserva 13º", "PIX", 1500.0],
  ["26/09/2026", "Tecnologias (09/2026)", "3.4 - Tecnologias", "PIX", 80.08],
  ["20/09/2026", "Mensalidade RedFox (09/2026)", "3.3 - Telefone e Internet", "PIX", 129.9],
  ["20/09/2026", "Reserva para Materiais de Limpeza (09/2026)", "9 - Materiais de Limpeza", "PIX", 60.0],
  ["20/09/2026", "Mensalidade GCLICK (09/2026)", "3.4 - Tecnologias", "PIX", 150.0],
  ["20/09/2026", "INSS (09/2026)", "4.4 - INSS", "PIX", 482.58],
  ["20/09/2026", "FGTS do mes (09/2026)", "4.5 - FGTS", "PIX", 133.58],
  ["16/09/2026", "NotreDame — Convênio Médico Titular (5/12)\nParcela 5/12", CAT_CONVENIO, "Boleto", 292.29],
  ["16/09/2026", "NotreDame — Convênio Médico Dependente (5/12)\nParcela 5/12", CAT_CONVENIO, "Boleto", 347.15],
  ["15/09/2026", "Marketing (09/2026)", "2.1 - Marketing", "PIX", 300.0],
  ["15/09/2026", "Seguro Comercial (09/2026)", "3.2 - Seguros", "PIX", 231.84],
  ["15/09/2026", "Mensalidade SIEG (09/2026)", "3.4 - Tecnologias", "PIX", 708.0],
  ["15/09/2026", "Aluguel (09/2026)", "3.1 - Aluguel", "PIX", 1060.0],
  ["10/09/2026", "Mensalidade TIM PJ (09/2026)", "3.3 - Telefone e Internet", "PIX", 35.0],
  ["10/09/2026", "Domínio Sistema (09/2026)", "3.5 - Domínio Sistema", "PIX", 1041.22],
  ["05/09/2026", "Pró-Labore (09/2026)", "5.2 - Pró-Labore", "PIX", 6000.0],
  ["05/09/2026", "Despesa com Pessoal (09/2026)", "4.1 - Salário", "PIX", 2163.02],
  ["04/09/2026", "Estagiaria (6/12)", "4.1 - Salário", "PIX", 1275.0],
];

const brl = (n) => `− R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const linhas = [
  ...REEMBOLSOS.map(([mes, itens, valor]) => ({
    Data: mes,
    Descrição: `Reembolsos a Pagar — Pessoal\n${itens} itens · ${itens} em aberto`,
    Categoria: "Diversos",
    Forma: "—",
    Valor: brl(valor),
    Status: "Em aberto",
  })),
  ...LANCAMENTOS.map(([data, desc, cat, forma, valor]) => ({
    Data: data,
    Descrição: desc,
    Categoria: cat,
    Forma: forma,
    Valor: brl(valor),
    Status: "Em aberto",
  })),
];

const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = [
  ["Data", "Descrição", "Categoria", "Forma", "Valor", "Status"].join(","),
  ...linhas.map((r) => [r.Data, r.Descrição, r.Categoria, r.Forma, r.Valor, r.Status].map(esc).join(",")),
].join("\n");

const outCsv = path.join(__dirname, "lancamentos-pj-importacao.csv");
const outXlsx = path.join(__dirname, "lancamentos-pj-importacao.xlsx");
fs.writeFileSync(outCsv, "\uFEFF" + csv, "utf8");

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(linhas, { cellDates: false });
const range = XLSX.utils.decode_range(ws["!ref"]);
for (let R = 1; R <= range.e.r; R++) {
  const addr = XLSX.utils.encode_cell({ r: R, c: 0 });
  if (ws[addr]) { ws[addr].t = "s"; ws[addr].z = "@"; }
}
XLSX.utils.book_append_sheet(wb, ws, "Lançamentos PJ");
XLSX.writeFile(wb, outXlsx);

const totalReemb = REEMBOLSOS.reduce((s, [, , v]) => s + v, 0);
const totalContas = LANCAMENTOS.reduce((s, r) => s + r[4], 0);
console.log(`Linhas: ${linhas.length} (${REEMBOLSOS.length} grupos de reembolso + ${LANCAMENTOS.length} contas)`);
console.log(`Total reembolsos: R$ ${totalReemb.toFixed(2)}`);
console.log(`Total contas a pagar: R$ ${totalContas.toFixed(2)}`);
console.log("CSV:", outCsv);
console.log("XLSX:", outXlsx);
