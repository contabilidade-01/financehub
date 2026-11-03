/**
 * Regras puras de limites de gasto e lembretes (testáveis sem banco).
 * O I/O fica em server/jobs/proactive-alerts.job.ts e storage.ts.
 */

export function semAcento(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PALAVRAS_TOTAL = /^(geral|total|tudo|todas?|todas as categorias|despesas?|gastos?|do mes|mensal|global)$/;

/**
 * Alvo de um limite a partir do nome dito pelo cliente.
 * - vazio / "geral" / "total" → limite do total (id null)
 * - nome igual (sem acento/caixa) → essa categoria/conta
 * - um único nome que contém o termo (ou é contido) → essa
 * - nenhum ou vários → erro (nunca grava um limite "solto")
 */
export function resolverAlvoLimite(
  nome: unknown,
  opcoes: { id: number; nome: string }[],
): { id: number | null; nome: string; erro?: undefined } | { erro: string; id?: undefined; nome?: undefined } {
  const termo = semAcento(String(nome ?? ""));
  if (!termo || PALAVRAS_TOTAL.test(termo)) return { id: null, nome: "Despesas do mês (todas as categorias)" };
  const exata = opcoes.filter((o) => semAcento(o.nome) === termo);
  if (exata.length >= 1) return { id: exata[0].id, nome: exata[0].nome };
  const parcial = opcoes.filter((o) => {
    const n = semAcento(o.nome);
    return n.length >= 3 && termo.length >= 3 && (n.includes(termo) || termo.includes(n));
  });
  if (parcial.length === 1) return { id: parcial[0].id, nome: parcial[0].nome };
  if (parcial.length > 1) {
    return { erro: `"${String(nome)}" combina com mais de uma categoria (${parcial.map((p) => p.nome).join(", ")}). Qual delas?` };
  }
  return { erro: `Não encontrei a categoria "${String(nome)}". Escolha uma das categorias de despesa existentes ou diga "geral" para o total do mês.` };
}

/** Faixa do alerta de limite: avisa ao passar de 80% e de 100% (uma vez cada por mês). */
export function faixaLimite(pct: number): 80 | 100 | null {
  if (!Number.isFinite(pct)) return null;
  if (pct >= 100) return 100;
  if (pct >= 80) return 80;
  return null;
}

/** Dia (YYYY-MM-DD) e hora (0-23) em São Paulo. */
export function agoraSP(agora: Date = new Date()): { dia: string; hora: number; mes: string } {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora),
  );
  return { dia, hora, mes: dia.slice(0, 7) };
}

/** Janela dos alertas diários ao cliente (horário comercial, SP). */
export const JANELA_DIARIA = { inicio: 9, fim: 20 };
export function dentroDaJanelaDiaria(hora: number): boolean {
  return hora >= JANELA_DIARIA.inicio && hora < JANELA_DIARIA.fim;
}

/** Soma dias a um YYYY-MM-DD (calendário, sem fuso). */
export function somarDias(diaISO: string, n: number): string {
  const d = new Date(`${diaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Data/hora de um lembrete vinda da IA. Sem fuso explícito vale o horário de
 * São Paulo (-03:00); só a data → 09:00 de SP. Rejeita data inválida e data já
 * passada (com 5 min de folga), para não gravar lembrete que nunca vai tocar.
 */
export function interpretarDataLembrete(
  entrada: unknown,
  agora: Date = new Date(),
): { ok: true; data: Date } | { ok: false; erro: string } {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return { ok: false, erro: "Informe a data (e a hora, se quiser) do lembrete." };
  let iso = bruto.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += "T09:00:00-03:00";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) iso += ":00-03:00";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(iso)) iso += "-03:00";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return { ok: false, erro: `Não entendi a data "${bruto}". Informe dia e hora (ex.: 20/11 às 15h).` };
  if (data.getTime() < agora.getTime() - 5 * 60_000) {
    return { ok: false, erro: "Essa data/hora já passou. Para quando é o lembrete?" };
  }
  return { ok: true, data };
}

export function moneyBR(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function textoAlertaLimite(o: { nome: string; gasto: number; limite: number; faixa: 80 | 100; empresa?: boolean }): string {
  const pct = o.limite > 0 ? Math.round((o.gasto / o.limite) * 100) : 0;
  const cab = o.faixa === 100 ? "🚨 *Limite estourado*" : "⚠️ *Atenção ao limite*";
  return (
    `${cab}\n\n*${o.nome}*${o.empresa ? " (empresa)" : ""}\n` +
    `💸 Gasto no mês: R$ ${moneyBR(o.gasto)} de R$ ${moneyBR(o.limite)}\n📊 ${pct}% do limite\n\n` +
    (o.faixa === 100 ? "Você passou do limite que definiu para este mês." : "Você já usou 80% do limite deste mês.")
  );
}

export function textoLembrete(titulo: string, descricao?: string | null): string {
  const d = String(descricao || "").trim();
  return `🔔 *Lembrete*\n\n*${String(titulo || "Lembrete").trim()}*${d ? `\n${d}` : ""}`;
}

export function textoContasAVencer(
  itens: { descricao: string; valor: number; vencimento: string; empresa?: string | null }[],
  hoje: string,
): string {
  const linhas = itens.map((i) => {
    const quando = i.vencimento === hoje ? "*hoje*" : "amanhã";
    return `• ${i.descricao}: R$ ${moneyBR(i.valor)} (vence ${quando})${i.empresa ? ` · ${i.empresa}` : ""}`;
  });
  return `📅 *Contas a vencer*\n\n${linhas.join("\n")}\n\nJá pagou? Me avise por aqui que eu dou baixa.`;
}
