/**
 * Parser de meio de pagamento PJ — puro, sem banco.
 * npm run test:meio
 */
import { detectarMeio, textoMeioDeDetect } from "../server/services/parse-meio";
import { casaNomeMeio, classificarMatchesMeioPorNome } from "../server/services/meio-pagamento-pj";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

function expectTipo(frase: string, tipo: string, extra?: string) {
  const d = detectarMeio(frase);
  if (d.tipo !== tipo) {
    fail(`"${frase}"`, `esperado ${tipo}, obtido ${d.tipo}`);
    return;
  }
  if (extra && d.tipo === "conta_necessaria" && d.termo !== extra) {
    fail(`"${frase}" termo`, `esperado ${extra}, obtido ${d.termo}`);
    return;
  }
  if (extra && d.tipo === "nome") {
    const t = d.termo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!t.includes(extra) && d.termo !== extra) {
      fail(`"${frase}" nome`, `esperado conter ${extra}, obtido ${d.termo}`);
      return;
    }
  }
  ok(`${tipo}: ${frase.slice(0, 48)}${frase.length > 48 ? "…" : ""}`);
}

function expectPista(frase: string, pista: "conta" | "cartao") {
  const d = detectarMeio(frase);
  if (d.tipo !== "nome" || d.pista !== pista) {
    fail(`pista "${frase}"`, `esperado nome+${pista}, obtido ${JSON.stringify(d)}`);
    return;
  }
  ok(`pista ${pista}: ${frase.slice(0, 40)}`);
}

// Conversas reais do print
expectTipo("Compra de mercadorias no valor de 142,41 em dinheiro", "dinheiro");
expectTipo("Em dinheiro", "dinheiro");
expectTipo("Pix", "conta_necessaria", "pix");
expectTipo("Via caixa", "dinheiro");

// Sinônimos + Whisper
expectTipo("dinheiro vivo", "dinheiro");
expectTipo("em espécie", "dinheiro");
expectTipo("no pix", "conta_necessaria", "pix");
expectTipo("Pics", "conta_necessaria", "pix");
expectTipo("pixs", "conta_necessaria", "pix");
expectTipo("boleto", "conta_necessaria", "boleto");
expectTipo("TED", "conta_necessaria", "ted");
expectTipo("débito", "conta_necessaria", "debito");

// Banco ≠ cartão
expectPista("Compra de mercadoria R$ 31,30 no Banco Santander", "conta");
expectPista("no Banco Santander", "conta");
expectPista("Compra de 50 no cartão Santander", "cartao");
expectPista("Cartão Inter", "cartao");
expectPista("Cartão de crédito do Inter", "cartao");
expectPista("cartão Banco Inter", "cartao"); // NÃO pode virar conta por causa de "banco"
expectPista("Cartão de Crédito Banco Inter", "cartao");
expectTipo("Conta bancária", "conta_generica");
expectTipo("conta corrente", "conta_generica");

// Nome (banco / cartão)
expectTipo("pelo Itaú", "nome", "itau");
expectTipo("Caixa Econômica", "nome", "caixa");
expectTipo("cartão Caixa", "nome", "caixa");
expectTipo("conta Caixa", "nome", "caixa");

// Sem meio / cartão genérico
expectTipo("Compra de mercadorias no valor de 142,41", "nenhum");
expectTipo("", "nenhum");
expectTipo("Compra no cartão de crédito: vinte reais", "cartao_generico");
expectTipo("no cartão", "cartao_generico");
expectTipo("no crédito", "cartao_generico");
expectTipo("compra de 20 no Nubank", "nome", "nubank");

// textoMeioDeDetect
{
  const t = textoMeioDeDetect(detectarMeio("142,41 em dinheiro"));
  if (t !== "dinheiro") fail("textoMeioDeDetect dinheiro", t);
  else ok("textoMeioDeDetect → dinheiro");
  const tc = textoMeioDeDetect(detectarMeio("no cartão de crédito"));
  if (tc !== "cartao") fail("textoMeioDeDetect cartao", tc);
  else ok("textoMeioDeDetect → cartao");
  const tb = textoMeioDeDetect(detectarMeio("no Banco Santander"));
  if (!/^banco\s+santander$/.test(tb)) fail("textoMeioDeDetect banco", tb);
  else ok("textoMeioDeDetect → banco santander");
}

// Substring: "via caixa" NÃO engole "Caixa Econômica"
{
  if (casaNomeMeio("via caixa", "Caixa Econômica")) fail("via caixa vs Caixa Econômica", "casou indevido");
  else ok("via caixa não casa com Caixa Econômica");
  if (!casaNomeMeio("itau", "Itaú Corrente")) fail("itau vs Itaú Corrente", "não casou");
  else ok("itau casa com Itaú Corrente (palavra)");
  if (!casaNomeMeio("inter", "Banco Inter")) fail("inter vs Banco Inter", "não casou");
  else ok("inter casa com Banco Inter");
  if (!casaNomeMeio("banco inter", "Inter")) fail("banco inter vs Inter", "não casou");
  else ok("banco inter casa com Inter (núcleo)");
  if (!casaNomeMeio("cartao inter", "Banco Inter")) fail("cartao inter vs Banco Inter", "não casou");
  else ok("cartao inter casa com Banco Inter");
  if (!casaNomeMeio("caixa economica", "Caixa Econômica")) fail("nome completo Caixa", "não casou");
  else ok("Caixa Econômica casa pelo nome completo");
}

// Ambiguidade marca: conta E cartão → perguntar (qualquer banco)
{
  const inter = classificarMatchesMeioPorNome(
    "Inter",
    [{ id: 1, nome: "Banco Inter" }],
    [{ id: 10, nome: "Conta Inter", banco: "Inter" }],
  );
  if (inter.tipo !== "ambiguidade_conta_cartao") {
    fail("Inter conta+cartão", `esperado ambiguidade, obtido ${inter.tipo}`);
  } else ok("Inter conta+cartão → ambiguidade");

  const itau = classificarMatchesMeioPorNome(
    "Itaú",
    [{ id: 2, nome: "Itaú" }],
    [{ id: 11, banco: "Itaú", nome: "Corrente Itaú" }],
  );
  if (itau.tipo !== "ambiguidade_conta_cartao") {
    fail("Itaú conta+cartão", `esperado ambiguidade, obtido ${itau.tipo}`);
  } else ok("Itaú conta+cartão → ambiguidade");

  const soCartao = classificarMatchesMeioPorNome(
    "Nubank",
    [{ id: 3, nome: "Nubank" }],
    [{ id: 12, nome: "Bradesco", banco: "Bradesco" }],
  );
  if (soCartao.tipo !== "cartao" || soCartao.id !== 3) {
    fail("só Nubank cartão", JSON.stringify(soCartao));
  } else ok("só cartão Nubank → cartão");

  const soConta = classificarMatchesMeioPorNome(
    "Santander",
    [{ id: 4, nome: "Magalu" }],
    [{ id: 13, nome: "Santander PJ", banco: "Santander" }],
  );
  if (soConta.tipo !== "conta" || soConta.id !== 13) {
    fail("só Santander conta", JSON.stringify(soConta));
  } else ok("só conta Santander → conta");

  const variosCc = classificarMatchesMeioPorNome(
    "Inter",
    [
      { id: 1, nome: "Banco Inter" },
      { id: 2, nome: "Inter Black" },
    ],
    [],
  );
  if (variosCc.tipo !== "varios_cartoes" || variosCc.cartoes.length !== 2) {
    fail("vários cartões Inter", JSON.stringify(variosCc));
  } else ok("vários cartões mesma marca → perguntar qual");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nParse meio: OK");
