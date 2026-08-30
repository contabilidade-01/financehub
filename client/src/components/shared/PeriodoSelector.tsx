import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Periodo } from "@/lib/period";

export interface PeriodoSelectorProps {
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  /** Quais atalhos exibir, na ordem. */
  opcoes?: Periodo[];
  className?: string;
}

const ROTULOS: Record<Periodo, string> = {
  all: "Tudo",
  current_month: "Mês atual",
  next_month: "Próximo mês",
  last_month: "Mês anterior",
  current_quarter: "Trimestre",
  current_year: "Ano",
  next_3m: "3 meses",
  next_6m: "6 meses",
  next_12m: "12 meses",
  custom: "Personalizado",
};

const PADRAO: Periodo[] = ["current_month", "last_month", "next_month", "current_year", "all", "custom"];

export default function PeriodoSelector({
  periodo,
  onPeriodoChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  opcoes = PADRAO,
  className = "",
}: PeriodoSelectorProps) {
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={periodo === p ? "default" : "outline"}
            onClick={() => onPeriodoChange(p)}
            className={periodo === p ? "bg-primary/20" : ""}
          >
            {ROTULOS[p]}
          </Button>
        ))}
      </div>
      {periodo === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
