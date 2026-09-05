/**
 * Fase 0 — recibo só existe se houve gravação.
 * npm run test:recibo
 */
import {
  afirmaEscrita,
  extrairEscritaOk,
  finalizarRespostaAgente,
  montarReciboDeEscrita,
} from "../server/services/recibo-agente";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d?: string) => {
  falhas++;
  console.error("FAIL", n, d || "");
};

// Afirma escrita
if (!afirmaEscrita("🔴 Despesa registrada!\n*Compra no cartão*")) fail("afirma registrada");
else ok("afirma Despesa registrada");
if (!afirmaEscrita("Lancei na Caixinha")) fail("afirma lancei");
else ok("afirma Lancei");
if (afirmaEscrita("Em qual cartão foi?")) fail("pergunta não é escrita");
else ok("pergunta não afirma escrita");

// Sem tool de escrita → bloqueia falso recibo
{
  const out = finalizarRespostaAgente({
    content: "🔴 Despesa registrada!\n*Compra no cartão de crédito*\n💰 R$ 3,00",
    escritas: [],
  });
  if (/registrada|lancei|paguei|exclui/i.test(out) && !/Ainda não registrei/.test(out)) {
    fail("falso positivo passou", out);
  } else if (!/Ainda não registrei/.test(out)) {
    fail("deveria bloquear", out);
  } else ok("bloqueia recibo sem tool");
}

// Com tool OK → recibo do servidor com código
{
  const raw = JSON.stringify({
    success: true,
    id: 119,
    descricao: "Compra de mercadorias",
    valor: 142.41,
    tipo: "Despesa",
    data: "2026-09-05",
    conta: "3.01 — CMV",
    pago_com: "Caixinha",
  });
  const e = extrairEscritaOk("lancar_empresa", raw);
  if (!e) fail("extrairEscritaOk");
  else {
    const recibo = montarReciboDeEscrita(e);
    if (!recibo.includes("#119")) fail("recibo sem código", recibo);
    else if (!recibo.includes("Caixinha")) fail("recibo sem meio", recibo);
    else ok("recibo servidor com #id");
  }
  const out = finalizarRespostaAgente({
    content: "inventei um recibo",
    escritas: [e!],
  });
  if (!out.includes("#119") || !out.includes("Despesa registrada")) fail("finalizar com escrita", out);
  else ok("finalizar usa recibo do servidor");
}

// precisa_meio não conta como escrita
{
  const raw = JSON.stringify({
    error: "falta meio",
    precisa_meio: true,
    precisa: "cartao",
  });
  if (extrairEscritaOk("lancar_empresa", raw)) fail("precisa_meio contou como escrita");
  else ok("precisa_meio não é escrita");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nRecibo agente: OK");
