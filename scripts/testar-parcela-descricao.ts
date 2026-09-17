/**
 * Parser de parcela no texto do lançamento (sem banco).
 */
import { basesParcelasIguais, parseParcelaNaDescricao, rotuloParcela } from "../shared/parcela-descricao";
import { competenciaMaisMeses } from "../server/services/fatura-core";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => { falhas++; console.error("FAIL", n, "—", d); };

{
  const p = parseParcelaNaDescricao("UAZAPI (4/7) — Parcela 4/7 · Nescon · reembolso pendente");
  if (p.num !== 4 || p.total !== 7) fail("uazapi nums", JSON.stringify(p));
  else ok("lê 4/7 do texto UAZAPI");
  const q = parseParcelaNaDescricao("UAZAPI (5/7) — Parcela 5/7 · Nescon · reembolso pendente");
  if (!basesParcelasIguais(p.base, q.base)) fail("base uazapi", `${p.base} vs ${q.base}`);
  else ok("parcelas UAZAPI 4/7 e 5/7 são a mesma compra");
}

{
  const p = parseParcelaNaDescricao("Assinatura Lovable (Escritório) 09/2026 — Nescon · reembolso pendente");
  if (p.num != null || p.total != null) fail("nao e parcela", JSON.stringify(p));
  else ok("09/2026 no texto não vira parcela");
}

{
  const p = parseParcelaNaDescricao("Compra Notebook Ester (21/21) — Parcela 21/21 · Nescon");
  if (p.num !== 21 || p.total !== 21) fail("21/21", JSON.stringify(p));
  else ok("lê parcela 21/21");
}

{
  if (rotuloParcela({ descricao: "x", parcela_num: 2, parcela_total: 12 }) !== "2/12") {
    fail("rotulo campo", "esperado 2/12");
  } else ok("rótulo usa campos da tabela quando existem");
}

{
  if (competenciaMaisMeses("2026-09", -3) !== "2026-06") fail("comp negativa", competenciaMaisMeses("2026-09", -3));
  else ok("competência recua meses (parcela anterior)");
  if (competenciaMaisMeses("2026-01", -1) !== "2025-12") fail("virada de ano", competenciaMaisMeses("2026-01", -1));
  else ok("competência recua virando o ano");
  if (competenciaMaisMeses("2026-09", 3) !== "2026-12") fail("comp positiva", competenciaMaisMeses("2026-09", 3));
  else ok("competência avança meses");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nParcela na descrição: OK");
process.exitCode = falhas ? 1 : 0;
