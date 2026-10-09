/**
 * Texto da conferência de fatura montado pelo servidor (sem banco, sem LLM).
 * O modelo pode só repassar — e a resposta não depende de ele somar certo.
 */

type Lanc = { id: number; descricao?: string; valor: number; data?: string; competencia?: string };
type Item = {
  informado: { descricao?: string; valor: number };
  status: string;
  lancamentos: Lanc[];
};
export type ResultadoConferencia = {
  cartao: string;
  competencia?: string;
  periodo_de?: string;
  periodo_ate?: string;
  total_lancado: number;
  total_informado: number;
  diferenca: number;
  itens: Item[];
  nao_informados: Lanc[];
};

const brl = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dataBR = (iso?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}` : "";
};

const compBR = (c?: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(c || ""));
  return m ? `${m[2]}/${m[1]}` : "";
};

/** Fechamento anterior + 1 dia = primeiro dia de compras da fatura. */
const diaSeguinte = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10);
};

const rotuloItem = (i: Item) =>
  i.informado.descricao?.trim() ? `${i.informado.descricao.trim()} ${brl(i.informado.valor)}` : brl(i.informado.valor);

const rotuloLanc = (l: Lanc) =>
  `#${l.id} ${l.descricao || ""} ${brl(l.valor)}${l.data ? ` (${dataBR(l.data)})` : ""}`.replace(/\s+/g, " ").trim();

export function resumoConferenciaFatura(r: ResultadoConferencia): string {
  const por = (st: string) => r.itens.filter((i) => i.status === st);
  const ok = por("confere");
  const faltando = por("nao_encontrado");
  const outra = por("outra_competencia");
  const divergentes = [...por("valor_divergente"), ...por("descricao_divergente"), ...por("duplicado")];

  const linhas: string[] = [];
  const fatura = compBR(r.competencia);
  linhas.push(`🧾 Conferência *${r.cartao}*${fatura ? ` · fatura ${fatura}` : ""}`);
  if (r.periodo_de && r.periodo_ate) {
    linhas.push(`Compras de ${dataBR(diaSeguinte(r.periodo_de))} a ${dataBR(r.periodo_ate)}.`);
  }
  linhas.push(`✅ ${ok.length} de ${r.itens.length} conferem.`);

  if (faltando.length) {
    const soma = faltando.reduce((s, i) => s + (Number(i.informado.valor) || 0), 0);
    linhas.push("", `❌ *Faltando no sistema* (${faltando.length}, ${brl(soma)}):`);
    for (const i of faltando) linhas.push(`• ${rotuloItem(i)}`);
  } else {
    linhas.push("", "Nenhum valor da sua lista está faltando.");
  }

  if (outra.length) {
    linhas.push("", "📅 *Lançados em outra fatura:*");
    for (const i of outra) {
      const l = i.lancamentos[0];
      const onde = l?.competencia ? ` → fatura ${compBR(l.competencia)}` : l?.data ? ` → ${dataBR(l.data)}` : "";
      linhas.push(`• ${rotuloItem(i)}${l ? ` (#${l.id}${onde})` : ""}`);
    }
  }

  if (divergentes.length) {
    linhas.push("", "⚠️ *Com diferença:*");
    for (const i of divergentes) {
      const l = i.lancamentos[0];
      linhas.push(`• ${rotuloItem(i)}${l ? ` ≠ ${rotuloLanc(l)}` : ""}`);
    }
  }

  if (r.nao_informados.length) {
    linhas.push("", `➕ *No sistema e fora da sua lista* (${r.nao_informados.length}):`);
    for (const l of r.nao_informados.slice(0, 15)) linhas.push(`• ${rotuloLanc(l)}`);
    if (r.nao_informados.length > 15) linhas.push(`• … e mais ${r.nao_informados.length - 15}`);
  }

  linhas.push(
    "",
    `Total da sua lista: ${brl(r.total_informado)} · lançado na fatura: ${brl(r.total_lancado)}`,
    "_Só conferi, não lancei nada._",
  );
  return linhas.join("\n");
}
