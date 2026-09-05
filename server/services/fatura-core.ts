/**
 * Núcleo puro de faturas de cartão — compartilhado PF e PJ.
 * Sem I/O: só regras de competência e helpers numéricos.
 */

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const num = (v: any) => (v == null ? 0 : parseFloat(v) || 0);

/**
 * A qual fatura (competência) uma compra pertence, dado o dia de fechamento.
 * Extraído de fatura-pj.service — função pura, sem dependência de tabelas.
 */
export function competenciaDaCompra(dataISO: string, diaFech: number, diaVenc: number) {
  const d = new Date(String(dataISO).slice(0, 10) + "T00:00:00");
  let ano = d.getFullYear();
  let mes = d.getMonth(); // 0-11
  if (d.getDate() > diaFech) {
    mes += 1;
    if (mes > 11) { mes = 0; ano += 1; }
  }
  const competencia = `${ano}-${pad2(mes + 1)}`;
  const dataFech = `${ano}-${pad2(mes + 1)}-${pad2(Math.min(diaFech, 28))}`;
  let vMes = mes, vAno = ano;
  if (diaVenc < diaFech) {
    vMes += 1;
    if (vMes > 11) { vMes = 0; vAno += 1; }
  }
  const dataVenc = `${vAno}-${pad2(vMes + 1)}-${pad2(Math.min(diaVenc, 28))}`;
  return { competencia, dataFech, dataVenc };
}

/** Avança N meses a partir de uma competência YYYY-MM. */
export function competenciaMaisMeses(competencia: string, meses: number): string {
  const [y, m] = competencia.split("-").map(Number);
  const total = (m - 1) + meses;
  const ano = y + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${pad2(mes)}`;
}

/**
 * Divide um valor em N parcelas em centavos; a última absorve o resto
 * (R$ 100 / 3 → 33,33 + 33,33 + 33,34). A soma SEMPRE fecha no total.
 *
 * Cada parcela vai para o centavo MAIS PRÓXIMO. Truncar empilhava a diferença
 * inteira na última — R$ 50 em 12x dava onze de 4,16 e uma de 4,24, que o
 * cliente lê como acréscimo. Arredondando, a última cai um pouco em vez de
 * subir, que é o que cartão e loja mostram.
 */
export function valoresParcelas(total: number, parcelas: number): number[] {
  const n = Math.floor(Number(parcelas));
  if (!Number.isFinite(total) || n < 1) return [];
  const cents = Math.round(Number(total) * 100);

  let base = Math.round(cents / n);
  // Valor minúsculo em muitas parcelas (R$ 0,10 em 12x) faria base×(n−1) passar
  // do total e a última virar NEGATIVA. Nesse canto, truncar é o certo.
  if (base * (n - 1) > cents) base = Math.floor(cents / n);

  const out: number[] = [];
  let alocado = 0;
  for (let i = 0; i < n; i++) {
    const c = i === n - 1 ? cents - alocado : base;
    alocado += c;
    out.push(c / 100);
  }
  return out;
}

/** Cartão de crédito = tem dias de fechamento e vencimento (limite é opcional). */
export function ehFormaCartaoCredito(f: {
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
}): boolean {
  return f.dia_fechamento != null && f.dia_vencimento != null;
}
