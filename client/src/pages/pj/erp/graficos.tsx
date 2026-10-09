import type { ReactNode } from "react";
import { brl } from "./comum";

/** Cores por papel (tokens --viz-* validados para daltonismo, claro e escuro). */
export const COR = {
  receita: "var(--viz-1)",
  despesa: "var(--viz-2)",
  saldo: "var(--viz-1)",
  resultado: "var(--viz-3)",
  critico: "var(--viz-critico)",
  grade: "var(--viz-grade)",
  eixo: "var(--viz-eixo)",
};

/** Eixo compacto: 12.500 → "12,5 mil"; 1.200.000 → "1,2 mi". */
export function valorCurto(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${s}${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES[m - 1]}/${String(a).slice(2)}`;
};

export const EIXO = {
  tick: { fill: "var(--viz-eixo)", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

/** Tooltip padrão: título + uma linha por série (cor ao lado, texto em tinta). */
export function TooltipPadrao({ active, payload, label, titulo }: { active?: boolean; payload?: any[]; label?: any; titulo?: (l: any) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{titulo ? titulo(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.stroke || p.fill }} />
            {p.name}
          </span>
          <span className="tabular-nums text-popover-foreground">{brl(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Legenda em HTML acima do gráfico (sempre presente com 2+ séries). */
export function Legenda({ itens }: { itens: { rotulo: string; cor: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}
