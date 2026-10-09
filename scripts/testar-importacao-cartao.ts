/**
 * Importação de fatura de cartão + cadastro automático de conta/cartão (lógica pura, sem banco).
 * npm run test:importacao-cartao
 */
import { lerArquivoExtrato } from "../server/services/importacao/parsers";
import {
  nomeBanco, nomeContaAuto, nomeCartaoAuto, ultimos4, diasProvisorios, ehPagamentoFatura, deveInverterSinal,
} from "../server/services/importacao/cadastro-automatico";
import { competenciaDaCompra } from "../server/services/fatura-core";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

const OFX_CARTAO = (sinalCompra: "neg" | "pos") => `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CURDEF>BRL
<CCACCTFROM><ACCTID>5502 **** **** 1234</CCACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260925
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>${sinalCompra === "neg" ? "-120.50" : "120.50"}<FITID>A1<NAME>MERCADO CENTRAL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910<TRNAMT>${sinalCompra === "neg" ? "-35.00" : "35.00"}<FITID>A2<NAME>UBER TRIP</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260912<TRNAMT>${sinalCompra === "neg" ? "500.00" : "-500.00"}<FITID>A3<NAME>PAGAMENTO RECEBIDO</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

// OFX de cartão é reconhecido, e o TRNTYPE normaliza o sinal (compra = saída) nos dois estilos de banco.
for (const estilo of ["neg", "pos"] as const) {
  const a = lerArquivoExtrato(Buffer.from(OFX_CARTAO(estilo)), "fatura.ofx");
  eq(`ofx cartão (${estilo}): detectado`, a.ofx?.conta.ehCartao, true);
  eq(`ofx cartão (${estilo}): final do cartão`, ultimos4(a.ofx?.conta.conta), "1234");
  eq(`ofx cartão (${estilo}): sinais`, a.ofx?.movimentos.map((m) => m.valor), [-120.5, -35, 500]);
  eq(`ofx cartão (${estilo}): período`, [a.ofx?.periodoDe, a.ofx?.periodoAte], ["2026-09-01", "2026-09-25"]);
}

// Extrato de conta NÃO é cartão e não tem o sinal mexido.
const extrato = lerArquivoExtrato(Buffer.from(`<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0260<BRANCHID>0001<ACCTID>98765-4</BANKACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>-10.00<FITID>X<NAME>PIX</STMTTRN></BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1><FI><ORG>NU PAGAMENTOS</FI></OFX>`), "extrato.ofx");
eq("extrato: não é cartão", !!extrato.ofx?.conta.ehCartao, false);
eq("extrato: ORG lido", extrato.ofx?.conta.org, "NU PAGAMENTOS");

// Nomes automáticos
eq("banco por COMPE com zeros", nomeBanco("0260"), "Nubank");
eq("banco por COMPE sem zeros", nomeBanco("77"), "Inter");
eq("banco desconhecido usa ORG", nomeBanco("999", "  Banco  X "), "Banco X");
eq("banco sem nada", nomeBanco(null, null), "");
eq("conta auto", nomeContaAuto({ bancoId: "341", conta: "12345-6" }), { banco: "Itaú", nome: "Itaú ····3456" });
eq("conta auto sem banco", nomeContaAuto({ conta: "1234567" }).nome, "Conta importada ····4567");
eq("cartão auto", nomeCartaoAuto({ bancoId: "260", conta: "5502 **** **** 1234" }), { banco: "Nubank", ultimos_digitos: "1234", nome: "CC Nubank ····1234" });
eq("cartão auto sem dados", nomeCartaoAuto({}).nome, "CC Cartão");
eq("últimos4 curto", ultimos4("12"), "");

// Dias provisórios: fechamento = dia do fim do período; vencimento 7 dias depois, sempre 1–28.
eq("provisório 25", diasProvisorios("2026-09-25"), { fechamento: 25, vencimento: 4 });
eq("provisório 10", diasProvisorios("2026-09-10"), { fechamento: 10, vencimento: 17 });
eq("provisório dia 31 → 1", diasProvisorios("2026-08-31"), { fechamento: 1, vencimento: 8 });
eq("provisório sem período", diasProvisorios(null), { fechamento: 1, vencimento: 8 });
// A fatura calculada com dias provisórios tem fechamento/vencimento coerentes (venc depois do fechamento).
const comp = competenciaDaCompra("2026-09-05", 25, 4);
eq("competência com dias provisórios", comp.competencia, "2026-09");
eq("vencimento no mês seguinte", comp.dataVenc, "2026-10-04");

// Pagamento da fatura / estorno
eq("pagamento recebido", ehPagamentoFatura("PAGAMENTO RECEBIDO - OBRIGADO"), true);
eq("pgto fatura", ehPagamentoFatura("Pgto Fatura Anterior"), true);
eq("compra normal", ehPagamentoFatura("MERCADO CENTRAL"), false);

// Sinal de CSV de fatura (compras positivas → inverter)
eq("compras positivas: inverte", deveInverterSinal([10, 20, 30, -50]), true);
eq("compras negativas: mantém", deveInverterSinal([-10, -20, 5]), false);
eq("vazio: mantém", deveInverterSinal([]), false);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
