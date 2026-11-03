/**
 * Importação de contas a pagar/receber por planilha — leitura e mapeamento (sem banco).
 * npm run test:importacao-titulos
 */
import * as XLSX from "xlsx";
import { aplicarMapeamentoTitulos, camposTitulo, lerTabelaTitulos, sugerirMapeamentoTitulos } from "../server/services/erp/importar-titulos.service";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// Modelo do sistema (contas a receber)
{
  const csv = `vencimento;descricao;cliente;valor;conta_receita;competencia;data_recebimento;documento;centro_custo
10/11/2026;Honorários 11/2026;Padaria Pão Quente;850,00;Prestação de serviços;01/11/2026;;NF 1234;
20/11/2026;Venda;Mercado Central;2.350,00;Venda de mercadorias;20/11/2026;20/11/2026;;Loja
;Total;;3.200,00;;;;;`;
  const t = lerTabelaTitulos(Buffer.from(csv, "utf8"), "modelo.csv", "Receita");
  eq("modelo: cabeçalho na linha 0", t.linha_cabecalho, 0);
  const m = sugerirMapeamentoTitulos(t.cabecalho, t.linhas, "Receita");
  eq("modelo: mapeamento", m, { valor: 3, data_vencimento: 0, data_pagamento: 6, data_competencia: 5, contato: 2, categoria: 4, centro_custo: 8, documento: 7, descricao: 1 });
  const r = aplicarMapeamentoTitulos(t.linhas, m, 2);
  eq("modelo: 2 títulos, rodapé fora", [r.itens.length, r.erros.length], [2, 0]);
  eq("modelo: documento na descrição", r.itens[0].descricao, "Honorários 11/2026 (NF 1234)");
  eq("modelo: valores", r.itens.map((i) => i.valor), [850, 2350]);
  eq("modelo: pagamento", r.itens.map((i) => i.data_pagamento), [null, "2026-11-20"]);
  eq("modelo: competência", r.itens[0].data_competencia, "2026-11-01");
}

// Planilha "de mercado": nomes diferentes, capa, valor negativo e Excel
{
  const wb = XLSX.utils.book_new();
  const aoa = [
    ["Controle de pagamentos - Nov/2026"],
    [],
    ["Fornecedor", "Referente a", "Data de Vencimento", "Valor Total", "Pago em", "Conta"],
    ["Imobiliária Centro", "Aluguel loja", "05/11/2026", -1800, "", "Aluguel"],
    ["Companhia de Energia", "Energia 10/2026", "10/11/2026", "432,10", "10/11/2026", "Energia elétrica"],
    ["", "", "", "", "", ""],
    ["TOTAL", "", "", 2232.1, "", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Pagar");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const t = lerTabelaTitulos(buf, "controle.xlsx", "Despesa");
  eq("mercado: achou o cabeçalho", t.cabecalho, ["Fornecedor", "Referente a", "Data de Vencimento", "Valor Total", "Pago em", "Conta"]);
  const m = sugerirMapeamentoTitulos(t.cabecalho, t.linhas, "Despesa");
  eq("mercado: mapeamento", [m.contato, m.descricao, m.data_vencimento, m.valor, m.data_pagamento, m.categoria], [0, 1, 2, 3, 4, 5]);
  const r = aplicarMapeamentoTitulos(t.linhas, m, t.linha_cabecalho + 2);
  eq("mercado: 2 títulos (TOTAL fora)", r.itens.length, 2);
  eq("mercado: sinal não importa", r.itens[0].valor, 1800);
  eq("mercado: contato", r.itens.map((i) => i.contato), ["Imobiliária Centro", "Companhia de Energia"]);
}

// Sem cabeçalho conhecido: mapeamento pelo conteúdo e erros explicados
{
  const csv = `Fulano;Serviço X;15/11/2026;100,00
Beltrano;Serviço Y;data ruim;200,00
Ciclano;Serviço Z;17/11/2026;abc`;
  const t = lerTabelaTitulos(Buffer.from(csv, "utf8"), "x.csv", "Receita");
  eq("sem cabeçalho: colunas genéricas", t.cabecalho, ["Coluna 1", "Coluna 2", "Coluna 3", "Coluna 4"]);
  const m = sugerirMapeamentoTitulos(t.cabecalho, t.linhas, "Receita");
  eq("sem cabeçalho: data e valor pelo conteúdo", [m.data_vencimento, m.valor], [2, 3]);
  const r = aplicarMapeamentoTitulos(t.linhas, { ...m, descricao: 1, contato: 0 }, 1);
  eq("sem cabeçalho: 1 ok, 2 erros", [r.itens.length, r.erros.map((e) => e.motivo)], [1, ["Data de vencimento inválida", "Valor ilegível ou zero"]]);
}

// Rótulos mudam entre receber e pagar
eq("campos: cliente x fornecedor", [camposTitulo("Receita")[3].rotulo, camposTitulo("Despesa")[3].rotulo], ["Cliente", "Fornecedor"]);
eq("campos: obrigatórios", camposTitulo("Despesa").filter((c) => c.obrigatorio).map((c) => c.chave), ["descricao", "valor", "data_vencimento"]);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
