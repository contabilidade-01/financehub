import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "income" | "expense" | "warning";

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  income: "bg-income/10 text-income",
  expense: "bg-expense/10 text-expense",
  warning: "bg-warning/10 text-warning",
};

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Cor do valor (ex.: saldo negativo em vermelho). */
  valueClassName?: string;
  isLoading?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** Indicador (KPI): rótulo, valor em destaque e dica curta. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  valueClassName,
  isLoading,
  className,
  ...rest
}: StatCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 text-card-foreground", className)} data-testid={rest["data-testid"]}>
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", TONE_ICON[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <div className={cn("mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", valueClassName)}>{value}</div>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default StatCard;
