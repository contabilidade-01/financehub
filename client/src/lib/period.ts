export type Periodo = "all" | "current_month" | "next_month" | "custom";

export function limitesDoMes(offsetMeses: number): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { de: iso(inicio), ate: iso(fim) };
}

export function rangeDoPeriodo(
  periodo: Periodo,
  customFrom?: string,
  customTo?: string,
): { de?: string; ate?: string } {
  if (periodo === "current_month") return limitesDoMes(0);
  if (periodo === "next_month") return limitesDoMes(1);
  if (periodo === "custom") return { de: customFrom || undefined, ate: customTo || undefined };
  return {};
}

export function rotuloPeriodo(periodo: Periodo, de?: string, ate?: string): string {
  if (periodo === "next_month") {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  }
  if (periodo === "custom" && de && ate) {
    const fmt = (s: string) => {
      const [y, m, day] = s.split("-");
      return `${day}/${m}/${y}`;
    };
    return `${fmt(de)} – ${fmt(ate)}`;
  }
  if (periodo === "all") return "todo o período";
  return new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function dataRefTransacao(t: { data_vencimento?: string | Date | null; data_transacao: string | Date }): string {
  const v = t.data_vencimento || t.data_transacao;
  return String(v).slice(0, 10);
}

export function dentroDoPeriodo(data: string, de?: string, ate?: string): boolean {
  if (de && data < de) return false;
  if (ate && data > ate) return false;
  return true;
}
