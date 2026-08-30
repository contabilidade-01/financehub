export type Periodo =
  | "all"
  | "current_month"
  | "next_month"
  | "last_month"
  | "current_quarter"
  | "current_year"
  | "next_3m"
  | "next_6m"
  | "next_12m"
  | "custom";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function limitesDoMes(offsetMeses: number): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses + 1, 0);
  return { de: iso(inicio), ate: iso(fim) };
}

/** Do 1º dia do mês corrente até o último dia do mês corrente + n. */
function janelaAFrente(meses: number): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + meses + 1, 0);
  return { de: iso(inicio), ate: iso(fim) };
}

export function rangeDoPeriodo(
  periodo: Periodo,
  customFrom?: string,
  customTo?: string,
): { de?: string; ate?: string } {
  const hoje = new Date();
  switch (periodo) {
    case "current_month":
      return limitesDoMes(0);
    case "next_month":
      return limitesDoMes(1);
    case "last_month":
      return limitesDoMes(-1);
    case "current_quarter": {
      const q = Math.floor(hoje.getMonth() / 3);
      return {
        de: iso(new Date(hoje.getFullYear(), q * 3, 1)),
        ate: iso(new Date(hoje.getFullYear(), q * 3 + 3, 0)),
      };
    }
    case "current_year":
      return {
        de: iso(new Date(hoje.getFullYear(), 0, 1)),
        ate: iso(new Date(hoje.getFullYear(), 11, 31)),
      };
    case "next_3m":
      return janelaAFrente(2);
    case "next_6m":
      return janelaAFrente(5);
    case "next_12m":
      return janelaAFrente(11);
    case "custom":
      return { de: customFrom || undefined, ate: customTo || undefined };
    default:
      return {};
  }
}

const fmtBR = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export function rotuloPeriodo(periodo: Periodo, de?: string, ate?: string): string {
  if (periodo === "all") return "todo o período";
  if (periodo === "custom") return de && ate ? `${fmtBR(de)} – ${fmtBR(ate)}` : "período personalizado";

  const mesAno = (offset: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  };
  switch (periodo) {
    case "next_month":
      return mesAno(1);
    case "last_month":
      return mesAno(-1);
    case "current_quarter":
      return `${Math.floor(new Date().getMonth() / 3) + 1}º trimestre de ${new Date().getFullYear()}`;
    case "current_year":
      return String(new Date().getFullYear());
    case "next_3m":
      return "próximos 3 meses";
    case "next_6m":
      return "próximos 6 meses";
    case "next_12m":
      return "próximos 12 meses";
    default:
      return mesAno(0);
  }
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
