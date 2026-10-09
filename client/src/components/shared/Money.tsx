import { cn, formatCurrency } from "@/lib/utils";

type Tone = "auto" | "income" | "expense" | "neutral";

interface MoneyProps {
  value: number | string | null | undefined;
  /**
   * auto: verde se positivo, vermelho se negativo;
   * income/expense: força a cor (ex.: coluna de receitas/despesas);
   * neutral: sem cor.
   */
  tone?: Tone;
  /** Mostra sinal explícito (+/−). */
  signed?: boolean;
  className?: string;
}

/** Valor monetário em BRL com dígitos tabulares e cor de receita/despesa. */
export function Money({ value, tone = "neutral", signed = false, className }: MoneyProps) {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  const num = Number.isFinite(n) ? (n as number) : 0;

  const color =
    tone === "income"
      ? "text-income"
      : tone === "expense"
        ? "text-expense"
        : tone === "auto"
          ? num < 0
            ? "text-expense"
            : num > 0
              ? "text-income"
              : ""
          : "";

  const text = signed
    ? `${num < 0 ? "−" : num > 0 ? "+" : ""}${formatCurrency(Math.abs(num))}`
    : formatCurrency(num);

  return <span className={cn("tabular-nums whitespace-nowrap", color, className)}>{text}</span>;
}

export default Money;
