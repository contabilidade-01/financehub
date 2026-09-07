/**
 * Testes puros do resumo semanal (período + mensagem).
 * npm run test:resumo-semanal
 */
import {
  periodoSemanaAnterior,
  deveEnviarResumoSemanal,
  montarMensagemResumoSemanal,
} from "../server/services/resumo-semanal.service";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

// Segunda 08/09/2025 09:00 → semana anterior seg 01/09 a dom 07/09
{
  const sp = new Date(2025, 8, 8, 9, 0, 0); // mês 0-based: setembro
  if (!deveEnviarResumoSemanal(sp)) fail("janela", "segunda 9h deveria enviar");
  else ok("segunda 9h → envia");

  const { de, ate } = periodoSemanaAnterior(sp);
  if (de !== "2025-09-01" || ate !== "2025-09-07") {
    fail("periodo", `esperado 2025-09-01..07, obtido ${de}..${ate}`);
  } else ok("periodo semana anterior");
}

{
  const ter = new Date(2025, 8, 9, 9, 0, 0);
  if (deveEnviarResumoSemanal(ter)) fail("terça", "não deveria");
  else ok("terça → não envia");
}

{
  const msg = montarMensagemResumoSemanal({
    receita: 7526.5,
    despesa: 3904.25,
    saldo: 3622.25,
    qtd: 13,
    de: "2025-08-31",
    ate: "2025-09-06",
    escopo: "pj",
    empresa_nome: "Nescon",
  });
  if (!msg.includes("empresa: Nescon")) fail("msg pj", "falta nome empresa");
  else if (!msg.includes("7526.50")) fail("msg receita", msg);
  else if (!msg.includes("✅")) fail("msg saldo+", "deveria ser positivo");
  else ok("mensagem PJ com saldo positivo");
}

{
  const msg = montarMensagemResumoSemanal({
    receita: 0,
    despesa: 2112.55,
    saldo: -2112.55,
    qtd: 1,
    de: "2025-08-31",
    ate: "2025-09-06",
    escopo: "pf",
  });
  if (msg.includes("(empresa")) fail("msg pf", "não deveria marcar empresa");
  else if (!msg.includes("🔴")) fail("msg vermelho", msg);
  else ok("mensagem PF saldo negativo (bug antigo)");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nResumo semanal: OK");
