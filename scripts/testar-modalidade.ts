/**
 * Modalidades PF / PJ MEI / PJ ME — lógica pura.
 * npm run test:modalidade
 */
import {
  camposDaModalidade,
  detectarModalidadeTexto,
  modalidadeDe,
  modalidadeDeParametros,
  rotuloModalidade,
  temErpPj,
} from "../shared/modalidade";

let falhas = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  const okk = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (okk) console.log("ok  ", nome);
  else {
    falhas++;
    console.error("FAIL", nome, "obtido:", obtido, "esperado:", esperado);
  }
};

// Clientes existentes: PJ sem porte vira PJ MEI automaticamente
eq("PJ legado (porte NULL) = PJ MEI", modalidadeDe({ tipo_pessoa: "juridica", porte_pj: null }), "pj_mei");
eq("rótulo PJ legado", rotuloModalidade({ tipo_pessoa: "juridica" }), "PJ MEI");
eq("PF", modalidadeDe({ tipo_pessoa: "fisica", porte_pj: "me" }), "pf");
eq("sem usuário = PF", modalidadeDe(null), "pf");
eq("PJ ME", modalidadeDe({ tipo_pessoa: "juridica", porte_pj: "me" }), "pj_me");
eq("ERP só PJ ME", [temErpPj({ tipo_pessoa: "juridica", porte_pj: "me" }), temErpPj({ tipo_pessoa: "juridica", porte_pj: "mei" }), temErpPj({ tipo_pessoa: "juridica" }), temErpPj({ tipo_pessoa: "fisica" })], [true, false, false, false]);
eq("campos PJ ME", camposDaModalidade("pj_me"), { tipo_pessoa: "juridica", porte_pj: "me" });
eq("campos PF", camposDaModalidade("pf"), { tipo_pessoa: "fisica", porte_pj: null });

// URL da página de vendas
eq("?tipo=juridica → MEI (links antigos)", modalidadeDeParametros({ tipo: "juridica" }), "pj_mei");
eq("?tipo=juridica&porte=me → ME", modalidadeDeParametros({ tipo: "juridica", porte: "me" }), "pj_me");
eq("?modalidade=pj_me", modalidadeDeParametros({ modalidade: "pj_me" }), "pj_me");
eq("sem parâmetro → PF", modalidadeDeParametros({}), "pf");

// Respostas no WhatsApp
const casos: [string, string | null][] = [
  ["1", "pf"], ["2", "pj_mei"], ["3", "pj_me"],
  ["pessoal", "pf"], ["PF", "pf"], ["sou MEI", "pj_mei"], ["empresa", "pj_mei"],
  ["*3*", "pj_me"], ["ME", "pj_me"], ["microempresa", "pj_me"], ["tenho uma LTDA", "pj_me"],
  ["simples nacional", "pj_me"], ["pj me", "pj_me"], ["PJ", "pj_mei"],
  ["me explica melhor", null], ["oi", null],
];
for (const [txt, esp] of casos) eq(`WhatsApp "${txt}"`, detectarModalidadeTexto(txt), esp);

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nModalidades OK.");
