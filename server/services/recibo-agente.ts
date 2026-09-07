/**
 * Recibo do agente WhatsApp — montado pelo servidor após gravação real.
 * O modelo NÃO deve inventar "Despesa registrada!" sem tool de escrita.
 */

/** Tools que gravam / apagam / alteram estado (recibo só com estas). */
export const TOOLS_ESCRITA = new Set([
  "insere_transacao",
  "lancar_empresa",
  "parcelar_compra",
  "parcelar_compra_empresa",
  "cria_lembrete",
  "criar_conta_a_pagar",
  "pagar_transacao",
  "pagar_transacao_empresa",
  "atualiza_transacao",
  "atualiza_transacao_empresa",
  "deleta_transacao",
  "deleta_transacao_empresa",
  "excluir_todas",
  "excluir_transacao_por_filtro",
  "restaurar_transacao",
  "restaurar_transacao_empresa",
  "mover_lancamentos",
  "mover_lancamentos_empresa",
  "cadastrar_cartao",
  "cadastrar_cartao_empresa",
  "criar_conta_bancaria_empresa",
  "criar_conta_empresa",
  "criar_conta_e_mover_empresa",
  "criar_meta",
  "depositarMeta",
  "depositar_meta",
  "ajustarSaldoMeta",
  "deleteMeta",
  "deletar_meta",
  "excluir_meta",
]);

/** Texto que afirma que algo foi gravado/pago/excluído. */
export function afirmaEscrita(texto: string): boolean {
  const t = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return false;
  return (
    /\b(registrad[oa]|lancei|registrei|gravei|paguei|exclui|deletei|removi|cadastrei|criei a conta|conta criada|fatura paga|baixad[oa])\b/.test(
      t,
    ) ||
    /despesa registrada|receita registrada|lancamento registrado|compra registrada/.test(t)
  );
}

function moneyBR(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataBR(iso: any): string {
  const s = String(iso || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s || "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export type EscritaRodada = {
  tool: string;
  raw: string;
  parsed: any;
};

function parseSafe(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Extrai escritas bem-sucedidas (com id ou ids) do resultado da tool. */
export function extrairEscritaOk(tool: string, raw: string): EscritaRodada | null {
  if (!TOOLS_ESCRITA.has(tool)) return null;
  const parsed = parseSafe(raw);
  if (!parsed || parsed.error || parsed.precisa_meio || parsed.precisa) return null;
  if (
    (tool === "lancar_empresa" || tool === "insere_transacao") &&
    parsed.id == null
  ) {
    return null;
  }
  if (
    (tool === "parcelar_compra" || tool === "parcelar_compra_empresa") &&
    !(Array.isArray(parsed.ids) && parsed.ids.length)
  ) {
    return null;
  }
  const temId =
    parsed.id != null ||
    (Array.isArray(parsed.ids) && parsed.ids.length > 0) ||
    parsed.success === true;
  if (!temId && !parsed.msg && !parsed.mensagem) return null;
  return { tool, raw, parsed };
}

function linhaOrcamento(o: any): string {
  if (!o || typeof o !== "object") return "";
  const pct = Number(o.percentual);
  if (!Number.isFinite(pct)) return "";
  const nome = o.categoria || "orçamento";
  if (o.status === "estourado" || pct >= 100) {
    return `\n⚠️ Orçamento *${nome}* estourado (${pct.toFixed(0)}% de R$ ${moneyBR(o.limite)}).`;
  }
  if (o.status === "atencao" || pct >= 80) {
    return `\n⚠️ Orçamento *${nome}* em ${pct.toFixed(0)}% (R$ ${moneyBR(o.gasto)} / R$ ${moneyBR(o.limite)}).`;
  }
  return `\n📊 Orçamento *${nome}*: ${pct.toFixed(0)}% usado.`;
}

export function montarReciboDeEscrita(e: EscritaRodada): string {
  const p = e.parsed || {};
  const tool = e.tool;

  if (tool === "lancar_empresa" || tool === "insere_transacao") {
    const tipo = String(p.tipo || "Despesa");
    const emoji = tipo === "Receita" ? "🟢" : "🔴";
    const label = tipo === "Receita" ? "Receita" : "Despesa";
    const forma = p.pago_com || p.forma_pagamento || p.meio || "—";
    const cat = p.conta || p.categoria || "—";
    const desc = p.descricao || p.msg || "Lançamento";
    let txt =
      `${emoji} ${label} registrada!\n` +
      `*${desc}*\n` +
      `💰 R$ ${moneyBR(p.valor)}\n` +
      `🗓 ${dataBR(p.data || p.data_transacao)}\n` +
      `📊 ${cat}\n` +
      `📍 Forma: ${forma}`;
    if (p.empresa) txt += `\n🏢 ${p.empresa}`;
    txt += `\n🔍 Código: #${p.id}`;
    if (p.aviso_meio) txt += `\n_${p.aviso_meio}_`;
    txt += linhaOrcamento(p.orcamento);
    if (p.pendente_criar_conta?.nome_sugerido) {
      txt += `\n\nClassifiquei em Outras. Quer criar a conta *${p.pendente_criar_conta.nome_sugerido}* e mover este lançamento?`;
    }
    return txt;
  }

  if (tool === "parcelar_compra" || tool === "parcelar_compra_empresa") {
    const ids = (p.ids || []).join(", #");
    let txt =
      `🔴 Compra parcelada registrada!\n` +
      `*${p.descricao || "Compra parcelada"}*\n` +
      `💰 ${p.parcelas}× de R$ ${moneyBR(p.valor_parcela)} (total R$ ${moneyBR(p.total || p.valor_total)})\n` +
      `📍 Cartão: ${p.cartao || p.forma_pagamento || "—"}`;
    if (p.empresa) txt += `\n🏢 ${p.empresa}`;
    txt += `\n🔍 Códigos: #${ids}`;
    if (p.dica) txt += `\n_${String(p.dica).slice(0, 280)}_`;
    txt += linhaOrcamento(p.orcamento);
    return txt;
  }

  if (tool === "criar_conta_bancaria_empresa") {
    return (
      `✅ Conta bancária *${p.nome || p.banco}* cadastrada.\n` +
      (p.mensagem ? `${p.mensagem}\n` : "") +
      `🔍 Código: #${p.id}`
    );
  }

  if (tool === "cadastrar_cartao" || tool === "cadastrar_cartao_empresa") {
    return (
      `✅ Cartão *${p.cartao || p.nome}* ${p.atualizado ? "atualizado" : "cadastrado"}.\n` +
      `Fecha dia ${p.dia_fechamento} · vence dia ${p.dia_vencimento}\n` +
      `🔍 Código: #${p.id}`
    );
  }

  if (p.msg || p.mensagem) {
    const idPart = p.id != null ? `\n🔍 Código: #${p.id}` : "";
    return `✅ ${p.msg || p.mensagem}${idPart}`;
  }

  if (p.id != null) {
    return `✅ Operação concluída.\n🔍 Código: #${p.id}`;
  }
  return `✅ Operação concluída.`;
}

/** Mensagem de bloqueio: pede só o que parece faltar na mensagem do usuário. */
export function mensagemTravaFalsoRecibo(userMessage?: string): string {
  const n = String(userMessage || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const temValor =
    /\b(r\$\s*)?\d{1,7}([.,]\d{2})?\b/.test(n) || /\breais?\b/.test(n);
  const temDesc =
    /\b(compra|mercadoria|servico|pagamento|aluguel|gasolina|uber|lanche|salario)\b/.test(n) ||
    (n.split(/\s+/).filter(Boolean).length >= 3 && temValor);
  const temMeio =
    /\b(pix|pics|dinheiro|cartao|credito|boleto|ted|debito|caixa|banco|conta|nubank|itau|santander)\b/.test(n);

  const faltam: string[] = [];
  if (!temValor) faltam.push("o valor");
  if (!temDesc) faltam.push("a descrição");
  if (!temMeio) faltam.push("como pagou (conta, Caixinha/dinheiro ou cartão)");

  if (faltam.length === 0) {
    return (
      "Ainda não registrei nada neste turno. " +
      "Confirme o meio de pagamento (conta bancária, Caixinha ou cartão) para eu lançar de verdade."
    );
  }
  if (faltam.length === 1) {
    return `Ainda não registrei nada. Me diga ${faltam[0]} para eu lançar.`;
  }
  return `Ainda não registrei nada. Me diga ${faltam.slice(0, -1).join(", ")} e ${faltam[faltam.length - 1]}.`;
}

/**
 * Decide a resposta final ao usuário.
 * - Houve escrita OK → recibo do servidor (não o texto livre do modelo).
 * - Texto afirma escrita sem tool → bloqueia falso positivo.
 */
export function finalizarRespostaAgente(opts: {
  content: string;
  escritas: EscritaRodada[];
  userMessage?: string;
}): string {
  const validas = opts.escritas.filter((e) => {
    const p = e.parsed;
    if (!p) return false;
    if (p.error || p.precisa_meio || p.precisa) return false;
    if (e.tool === "lancar_empresa" || e.tool === "insere_transacao") return p.id != null;
    if (e.tool === "parcelar_compra" || e.tool === "parcelar_compra_empresa") {
      return Array.isArray(p.ids) && p.ids.length > 0;
    }
    return p.success === true || p.id != null || !!p.msg || !!p.mensagem;
  });

  if (validas.length > 0) {
    return validas.map(montarReciboDeEscrita).join("\n\n");
  }

  const content = String(opts.content || "").trim() || "Pronto!";
  if (afirmaEscrita(content)) {
    return mensagemTravaFalsoRecibo(opts.userMessage);
  }
  return content;
}
