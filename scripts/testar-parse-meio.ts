/**
 * Parser de meio de pagamento PJ — puro, sem banco.
 * npm run test:meio
 */
import { detectarMeio, textoMeioDeDetect } from "../server/services/parse-meio";
import { casaNomeMeio } from "../server/services/meio-pagamento-pj";

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
  if (!casaNomeMeio("caixa economica", "Caixa Econômica")) fail("nome completo Caixa", "não casou");
  else ok("Caixa Econômica casa pelo nome completo");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nParse meio: OK");
