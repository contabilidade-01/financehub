/**
 * Fase 0 — recibo só existe se houve gravação.
 * npm run test:recibo
 */
import {
  afirmaEscrita,
  extrairEscritaOk,
  finalizarRespostaAgente,
  montarReciboDeEscrita,
  mensagemTravaFalsoRecibo,
  extrairConsulta,
} from "../server/services/recibo-agente";
import { resumoConferenciaFatura } from "../server/services/conferencia-fatura-texto";

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
  if (!out.includes("Nescon") && false) { /* empresa opcional no fixture */ }
}

// Orçamento no recibo
{
  const raw = JSON.stringify({
    success: true,
    id: 50,
    descricao: "Teste",
    valor: 10,
    tipo: "Despesa",
    data: "2026-09-05",
    conta: "3.01",
    pago_com: "Caixinha",
    empresa: "Nescon",
    orcamento: { categoria: "CMV", limite: 100, gasto: 90, percentual: 90, status: "atencao" },
  });
  const e = extrairEscritaOk("lancar_empresa", raw)!;
  const recibo = montarReciboDeEscrita(e);
  if (!recibo.includes("Orçamento") || !recibo.includes("Nescon")) fail("orcamento/empresa no recibo", recibo);
  else ok("recibo com orçamento e empresa");
}

// Trava pede só o que falta
{
  const m = mensagemTravaFalsoRecibo("Compra de mercadoria 31,30");
  if (/descri/i.test(m) && /valor/i.test(m)) fail("trava pediu valor+desc já dados", m);
  else if (!/meio|pagou|conta|Caixinha|cart/i.test(m)) fail("trava deveria pedir meio", m);
  else ok("trava pede só o meio");
}

// Foto + "via caixinha": meio já dado → pede só a confirmação, não o meio.
{
  const m = mensagemTravaFalsoRecibo(
    "Cupom fiscal Auto Posto Lider, Etanol Comum, Total R$ 133,66, via caixinha",
  );
  if (/meio de pagamento|como pagou/i.test(m)) fail("trava pediu meio já dado (caixinha)", m);
  else if (!/Caixinha/.test(m) || !/SIM/.test(m)) fail("trava deveria pedir confirmação na Caixinha", m);
  else ok("trava com caixinha pede só confirmação");
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

// Parcelada reembolsável: descrição real + aviso de A Receber
{
  const raw = JSON.stringify({
    success: true, parcelas: 15, descricao: "Loft Fiança de Aluguel (reembolso Nescon)",
    valor_parcela: 116.6, total: 1749, forma_pagamento: "Azul Itau Gold",
    ids: [606, 607], a_receber: true,
  });
  const e = extrairEscritaOk("parcelar_compra", raw);
  const txt = e ? montarReciboDeEscrita(e) : "";
  if (!/Loft Fiança/.test(txt) || !/A Receber/.test(txt)) fail("recibo parcelada a receber", txt);
  else ok("recibo parcelada a receber");
}
// Edição em massa conta como escrita e usa a mensagem do servidor
{
  const raw = JSON.stringify({ success: true, a_receber: true, ids: [606, 607], mensagem: "2 lançamento(s) (#606 a #607, R$ 233,20) agora estão em A Receber." });
  const out = finalizarRespostaAgente({ content: "", escritas: [extrairEscritaOk("marcar_a_receber", raw)!] });
  if (!/A Receber/.test(out)) fail("recibo marcar_a_receber", out);
  else ok("recibo marcar_a_receber");
}

// Conferência de fatura (só valores): não cai na trava de recibo e lista o que falta
{
  const r = {
    cartao: "CC Mercado Pago", competencia: "2026-10", periodo_de: "2026-09-05", periodo_ate: "2026-10-05",
    total_lancado: 150.04, total_informado: 162.66, diferenca: -12.62,
    itens: [
      { informado: { descricao: "", valor: 12.62 }, status: "nao_encontrado", lancamentos: [] },
      { informado: { descricao: "", valor: 137.42 }, status: "confere", lancamentos: [{ id: 700, descricao: "Mercado", valor: 137.42, data: "2026-09-20" }] },
      { informado: { descricao: "", valor: 12.62 }, status: "outra_competencia", lancamentos: [{ id: 701, descricao: "Uber", valor: 12.62, data: "2026-10-07", competencia: "2026-11" }] },
    ],
    nao_informados: [{ id: 702, descricao: "Spotify", valor: 21.9, data: "2026-09-25" }],
  };
  const txt = resumoConferenciaFatura(r);
  if (!/fatura 10\/2026/.test(txt) || !/Faltando no sistema/.test(txt) || !/R\$ 12,62/.test(txt) || !/fatura 11\/2026/.test(txt) || !/#702/.test(txt)) {
    fail("resumo conferência", txt);
  } else ok("resumo conferência lista faltando/outra fatura/fora da lista");

  const raw = JSON.stringify({ ...r, resumo_texto: txt, somente_leitura: true });
  const c = extrairConsulta("conferir_fatura_cartao", raw);
  if (!c) fail("conferência não reconhecida como consulta");
  // Modelo falou "3 lançamentos registrados nesta fatura" → não é falso recibo
  const out1 = finalizarRespostaAgente({ content: "Conferi: 2 lançamentos registrados nesta fatura, falta o de R$ 12,62.", escritas: [], consultas: [c!] });
  if (/Ainda não registrei/.test(out1)) fail("conferência caiu na trava", out1);
  else ok("conferência não cai na trava de recibo");
  // Modelo sem texto → resumo do servidor
  const out2 = finalizarRespostaAgente({ content: "", escritas: [], consultas: [c!] });
  if (out2 !== txt) fail("conferência sem texto deveria usar resumo do servidor", out2);
  else ok("conferência sem texto usa resumo do servidor");
  // Recibo inventado depois de consulta continua bloqueado
  const out3 = finalizarRespostaAgente({ content: "🔴 Despesa registrada! R$ 12,62", escritas: [], consultas: [c!] });
  if (/Despesa registrada/.test(out3)) fail("recibo falso após consulta passou", out3);
  else ok("recibo falso após consulta bloqueado");
}

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nRecibo agente: OK");
