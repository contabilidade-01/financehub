/**
 * Fase 2 — leitura de extratos reais (formatos de bancos brasileiros).
 * Sem banco de dados. npm run test:importacao-parsers
 */
import * as XLSX from "xlsx";
import {
  lerArquivoExtrato,
  aplicarMapeamento,
  valorDeCelula,
  dataDeCelula,
  chavesDedup,
  detectarDelimitador,
} from "../server/services/importacao/parsers";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};
const movs = (buf: Buffer, nome: string) => {
  const a = lerArquivoExtrato(buf, nome);
  if (a.ofx) return a.ofx.movimentos;
  return aplicarMapeamento(a.tabela!.linhas, a.tabela!.mapeamento);
};

// ---------------- células ----------------
const valores: [unknown, number | null][] = [
  ["1.234,56", 1234.56], ["-1.234,56", -1234.56], ["1.234,56 D", -1234.56], ["1.234,56 C", 1234.56],
  ["(1.234,56)", -1234.56], ["R$ 10,00", 10], ["-12.50", -12.5], ["1,234.56", 1234.56], ["1.500", 1500],
  ["1500", 1500], ["0,01", 0.01], ["100,00-", -100], [-45.3, -45.3], ["abc", null], ["", null], ["12/09/2026", null],
];
for (const [v, e] of valores) eq(`valor ${JSON.stringify(v)}`, valorDeCelula(v), e);
const datas: [unknown, string | null][] = [
  ["05/09/2026", "2026-09-05"], ["5/9/26", "2026-09-05"], ["2026-09-05", "2026-09-05"], ["05-09-2026", "2026-09-05"],
  ["05.09.2026", "2026-09-05"], ["05 set 2026", "2026-09-05"], ["31/02/2026", null], ["texto", null],
  ["2026-09-05T10:00:00", "2026-09-05"],
];
for (const [v, e] of datas) eq(`data ${JSON.stringify(v)}`, dataDeCelula(v), e);

// ---------------- CSV Nubank (vírgula, valor US, sinal) ----------------
{
  const csv = `Data,Valor,Identificador,Descrição
01/09/2026,-45.90,6f1a,Compra no débito - Padaria Pão Quente
01/09/2026,1500.00,7a2b,Transferência recebida pelo Pix - JOAO DA SILVA
02/09/2026,-120.00,8c3d,"Pagamento de boleto efetuado - CONDOMINIO, BLOCO A"`;
  const m = movs(Buffer.from(csv, "utf8"), "nubank.csv");
  eq("nubank: 3 linhas", m.length, 3);
  eq("nubank: valores", m.map((x) => x.valor), [-45.9, 1500, -120]);
  eq("nubank: descrição com vírgula entre aspas", m[2]?.descricao, "Pagamento de boleto efetuado - CONDOMINIO, BLOCO A");
  eq("nubank: documento", m[0]?.documento, "6f1a");
}

// ---------------- CSV Banco do Brasil (; e coluna C/D, Windows-1252) ----------------
{
  const csv = `"Data";"Lançamento";"Detalhes";"N° documento";"Valor";"Tipo Lançamento"
"01/09/2026";"Saldo Anterior";"";"";"1.000,00";""
"02/09/2026";"Pix - Enviado";"02/09 10:15 Maria Souza";"123";"250,00";"Saída"
"03/09/2026";"Pix - Recebido";"03/09 09:00 Cliente XPTO";"124";"1.980,50";"Entrada"
"03/09/2026";"Saldo do dia";"";"";"2.730,50";""`;
  const buf = Buffer.from(new TextEncoder().encode("")); // placeholder p/ tipos
  const latin1 = Buffer.from(csv, "latin1");
  eq("bb: delimitador ;", detectarDelimitador(csv), ";");
  const a = lerArquivoExtrato(latin1, "extrato-bb.csv");
  eq("bb: cabeçalho com acento (latin1)", a.tabela?.cabecalho[1], "Lançamento");
  const m = aplicarMapeamento(a.tabela!.linhas, a.tabela!.mapeamento);
  eq("bb: ignora saldo anterior / do dia", m.length, 2);
  eq("bb: sinal pela coluna de tipo", m.map((x) => x.valor), [-250, 1980.5]);
  void buf;
}

// ---------------- CSV Inter (preâmbulo, valor e saldo) ----------------
{
  const csv = `Extrato Conta Corrente
Conta ;123456-7
Período ;01/09/2026 a 05/09/2026

Data Lançamento;Histórico;Descrição;Valor;Saldo
02/09/2026;Pix enviado ;Fornecedor ABC Ltda;-1.234,56;8.765,44
03/09/2026;Pix recebido;Cliente Maria;2.000,00;10.765,44
03/09/2026;Pix recebido;Cliente Maria;2.000,00;12.765,44`;
  const a = lerArquivoExtrato(Buffer.from(csv, "utf8"), "inter.csv");
  const m = aplicarMapeamento(a.tabela!.linhas, a.tabela!.mapeamento);
  eq("inter: pula preâmbulo e acha cabeçalho", a.tabela?.cabecalho[0], "Data Lançamento");
  eq("inter: valor não é o saldo", m.map((x) => x.valor), [-1234.56, 2000, 2000]);
  eq("inter: saldo lido à parte", m[0]?.saldo, 8765.44);
  const chaves = chavesDedup(m);
  eq("inter: dois Pix idênticos no mesmo dia não se fundem", chaves[1] !== chaves[2], true);
  eq("dedup determinístico entre importações", chavesDedup(m), chaves);
}

// ---------------- Débito e crédito em colunas separadas (Itaú/Bradesco) ----------------
{
  const csv = `Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)
04/09/2026;TAR PACOTE SERVICOS;;;49,90;5.000,00
05/09/2026;TED RECEBIDA ACME;998;3.500,00;;8.500,00`;
  const m = movs(Buffer.from(csv, "utf8"), "itau.csv");
  eq("débito/crédito separados", m.map((x) => x.valor), [-49.9, 3500]);
}

// ---------------- XLSX com datas reais ----------------
{
  const ws = XLSX.utils.aoa_to_sheet([
    ["Data", "Descrição", "Valor", "Saldo"],
    [new Date(2026, 8, 10), "Aluguel escritório", -2500, 10000],
    [new Date(2026, 8, 11), "Venda cartão", 1234.5, 11234.5],
    ["", "Total", -1265.5, ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Extrato");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const a = lerArquivoExtrato(buf, "extrato.xlsx");
  const m = aplicarMapeamento(a.tabela!.linhas, a.tabela!.mapeamento);
  eq("xlsx: formato", a.formato, "xlsx");
  eq("xlsx: datas", m.map((x) => x.data), ["2026-09-10", "2026-09-11"]);
  eq("xlsx: valores (sem linha de total)", m.map((x) => x.valor), [-2500, 1234.5]);
}

// ---------------- OFX 1.x SGML (Windows-1252, sem fechamento de tags) ----------------
{
  const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<BRANCHID>1234<ACCTID>56789-0<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902120000[-3:BRT]<TRNAMT>-1234.56<FITID>2026090201<CHECKNUM>000123<MEMO>PAGTO FORNECEDOR ÇÃO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260903<TRNAMT>2000,00<FITID>2026090302<NAME>PIX RECEBIDO<MEMO>CLIENTE ALFA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>10765.44<DTASOF>20260930</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const a = lerArquivoExtrato(Buffer.from(ofx, "latin1"), "itau.ofx");
  eq("ofx: conta do arquivo", a.ofx?.conta, { bancoId: "0341", agencia: "1234", conta: "56789-0", tipoConta: "CHECKING" });
  eq("ofx: valores (ponto e vírgula)", a.ofx?.movimentos.map((x) => x.valor), [-1234.56, 2000]);
  eq("ofx: acento em 1252", a.ofx?.movimentos[0].descricao, "PAGTO FORNECEDOR ÇÃO");
  eq("ofx: NAME + MEMO", a.ofx?.movimentos[1].descricao, "PIX RECEBIDO CLIENTE ALFA");
  eq("ofx: documento", a.ofx?.movimentos[0].documento, "000123");
  eq("ofx: saldo e data do saldo", [a.ofx?.saldoFinal, a.ofx?.dataSaldo], [10765.44, "2026-09-30"]);
  eq("ofx: período", [a.ofx?.periodoDe, a.ofx?.periodoAte], ["2026-09-01", "2026-09-30"]);
  eq("ofx: chave pelo FITID", chavesDedup(a.ofx!.movimentos)[0], "fitid:2026090201");
}

// ---------------- OFX 2.x XML (UTF-8) ----------------
{
  const ofx = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>260</BANKID><ACCTID>1234567</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260905000000</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>abc-1</FITID><MEMO>Assinatura – Serviço</MEMO></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>500.00</BALAMT><DTASOF>20260905</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const a = lerArquivoExtrato(Buffer.from(ofx, "utf8"), "nubank.ofx");
  eq("ofx xml: banco/conta", [a.ofx?.conta.bancoId, a.ofx?.conta.conta], ["260", "1234567"]);
  eq("ofx xml: utf-8", a.ofx?.movimentos[0].descricao, "Assinatura – Serviço");
  eq("ofx xml: valor", a.ofx?.movimentos[0].valor, -89.9);
}

// ---------------- Sem cabeçalho reconhecível: mapeamento pelo conteúdo ----------------
{
  const csv = `10/09/2026;COMPRA MERCADO;-150,30;850,00
11/09/2026;SALARIO;5.000,00;5.850,00`;
  const a = lerArquivoExtrato(Buffer.from(csv, "utf8"), "sem-cabecalho.csv");
  const m = aplicarMapeamento(a.tabela!.linhas, a.tabela!.mapeamento);
  eq("sem cabeçalho: completo", a.tabela?.completo, true);
  eq("sem cabeçalho: valor x saldo", m.map((x) => x.valor), [-150.3, 5000]);
}

// ---------------- Código da conta criada na tela de importação (PJ) ----------------
(async () => {
  const { proximoCodigoConta } = await import("../server/services/importacao/importacao.service");
  const plano = [
    { codigo: "1.01", tipo: "Receita" }, { codigo: "1.02", tipo: "Receita" },
    { codigo: "3.01", tipo: "Despesa" }, { codigo: "3.02", tipo: "Despesa" }, { codigo: "3.03", tipo: "Despesa" },
    { codigo: "4.01", tipo: "Despesa" },
  ];
  eq("código: receita no grupo 1", proximoCodigoConta(plano, "Receita"), "1.03");
  eq("código: despesa no grupo mais usado", proximoCodigoConta(plano, "Despesa"), "3.04");
  eq("código: filha de 3.03", proximoCodigoConta(plano, "Despesa", "3.03"), "3.03.01");
  eq("código: plano vazio", proximoCodigoConta([], "Despesa"), "3.01");
  console.log(`\n${total - falhas}/${total} cenários OK`);
  if (falhas) process.exit(1);
})();
