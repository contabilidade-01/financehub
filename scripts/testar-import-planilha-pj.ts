/**
 * Parser da importação de planilha PJ (contas a pagar e a receber), sem banco.
 * Roda: npx tsx scripts/testar-import-planilha-pj.ts
 */
import { parseLancamentosPj } from "../server/services/import-lancamentos-pj.service";

let falhas = 0;
const ok = (cond: unknown, nome: string) => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ ${nome}`); }
};
const buf = (s: string) => Buffer.from(s, "utf8");

// 1. Modelo antigo de contas a pagar: comportamento igual ao de antes.
{
  const r = parseLancamentosPj(buf(`vencimento,descricao,categoria,forma_pagamento,valor
2026-11-05,"Pró-Labore (11/2026)","5.2 - Pró-Labore","PIX",-6000.00
2026-11-30,"Reembolsos a Pagar — Pessoal","Diversos","—",-1992.16
2026-11-10,"Venda balcão","1.01 - Vendas","PIX",350.00
`));
  ok(r.linhas.length === 3 && r.erros.length === 0, "modelo antigo: 3 linhas, sem erros");
  ok(r.linhas[0].tipo === "Despesa" && r.linhas[0].valor === 6000 && r.linhas[0].categoria === "5.2 - Pró-Labore", "modelo antigo: despesa pelo sinal");
  ok(r.linhas[1].reembolsoPessoal, "modelo antigo: grupo de reembolso reconhecido");
  ok(r.linhas[2].tipo === "Receita" && r.linhas[2].contato === "", "modelo antigo: valor positivo vira a receber");
}

// 2. Modelo de contas a receber (com cliente).
{
  const r = parseLancamentosPj(buf(`vencimento;cliente;descricao;categoria;forma_pagamento;valor
10/12/2026;Padaria Pão Quente;Honorários 12/2026;1.01 - Serviços;Boleto;1.250,00
15/12/2026;Maria Souza;;;PIX;R$ 300,00
`));
  ok(r.linhas.length === 2, "modelo a receber: 2 linhas");
  ok(r.linhas[0].contato === "Padaria Pão Quente" && r.linhas[0].valor === 1250 && r.linhas[0].tipo === "Receita", "modelo a receber: cliente, valor BR e tipo");
  ok(r.linhas[1].descricao === "Maria Souza", "sem descrição usa o nome do cliente");
  ok(r.linhas[0].vencimento === "2026-12-10", "data dd/mm/aaaa");
}

// 3. Planilha qualquer: título em cima, colunas Entrada/Saída, total no rodapé.
{
  const r = parseLancamentosPj(buf(`Relatório financeiro novembro;;;;
;;;;
Data de pagamento;Favorecido;Histórico;Entrada;Saída
03/11/2026;Cemig;Energia;;412,30
05/11/2026;Cliente X;Mensalidade;900,00;
Total;;;900,00;412,30
`));
  ok(r.linhas.length === 2 && r.erros.length === 0, "planilha livre: acha o cabeçalho e ignora o total");
  ok(r.linhas[0].tipo === "Despesa" && r.linhas[0].valor === 412.3 && r.linhas[0].contato === "Cemig", "planilha livre: saída vira a pagar com fornecedor");
  ok(r.linhas[1].tipo === "Receita" && r.linhas[1].valor === 900, "planilha livre: entrada vira a receber");
  ok(r.colunas[1] === "Favorecido" && r.mapa.contato === 1 && r.mapa.entrada === 3 && r.mapa.saida === 4, "planilha livre: mapa detectado");
}

// 4. Mapa escolhido pela pessoa e tipo fixo.
{
  const csv = `Col A;Col B;Col C
Aluguel;20/11/2026;1500
Internet;25/11/2026;99,90
`;
  const sem = parseLancamentosPj(buf(csv));
  ok(sem.linhas.length === 0, "sem mapa, cabeçalho desconhecido não importa nada errado");
  const r = parseLancamentosPj(buf(csv), { mapa: { descricao: 0, data: 1, valor: 2 }, tipo: "Despesa" });
  ok(r.linhas.length === 2 && r.linhas.every((l) => l.tipo === "Despesa"), "mapa manual + tudo a pagar");
  ok(r.linhas[1].valor === 99.9 && r.linhas[1].descricao === "Internet", "mapa manual: valores e descrição");
  const rec = parseLancamentosPj(buf(csv), { mapa: { descricao: 0, data: 1, valor: 2 }, tipo: "Receita" });
  ok(rec.linhas.every((l) => l.tipo === "Receita" && !l.reembolsoPessoal), "tudo a receber");
  const fora = parseLancamentosPj(buf(csv), { mapa: { descricao: 0, data: 1, valor: 99 } });
  ok(fora.linhas.length === 0 && fora.mapa.valor === -1, "coluna fora da planilha é ignorada");
}

// 5. Valor zerado vira erro, não lançamento.
{
  const r = parseLancamentosPj(buf(`data,descricao,valor
2026-11-01,Teste,0
`));
  ok(r.linhas.length === 0 && r.erros.length === 1, "valor zero é rejeitado");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTodos os cenários OK");
process.exit(falhas ? 1 : 0);
