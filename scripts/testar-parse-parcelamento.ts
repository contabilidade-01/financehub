/**
 * Parser de parcelamento — extenso + Nx.
 * npm run test:parcelamento
 */
import {
  parseParcelamentoDoTexto,
  textoSugereParcelamento,
  resolverValoresParcelamento,
} from "../server/services/parse-parcelamento";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

function expectParcelas(frase: string, n: number) {
  const p = parseParcelamentoDoTexto(frase);
  if (p.parcelas !== n) {
    fail(`parcelas "${frase}"`, `esperado ${n}, obtido ${p.parcelas}`);
    return;
  }
  ok(`${n}×: ${frase.slice(0, 50)}`);
}

expectParcelas("em 2 vezes no cartão", 2);
expectParcelas("em duas vezes no cartão", 2);
expectParcelas("Duas parcelas, cartão Itaú", 2);
expectParcelas("compra de 300 em três vezes", 3);
expectParcelas("3x de 100", 3);
expectParcelas("12x de 200", 12);

if (!textoSugereParcelamento("combustível em duas vezes")) {
  fail("sugere duas vezes", "false");
} else ok("sugere: em duas vezes");

{
  const r = resolverValoresParcelamento({
    args: {},
    userMessage: "combustível 100 reais em duas vezes no cartão Inter",
  });
  if (r.incompleto || r.parcelas !== 2) {
    fail("resolver duas vezes", JSON.stringify(r));
  } else ok(`resolver: ${r.parcelas}× total ${r.valorTotal}`);
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nParse parcelamento: OK");
