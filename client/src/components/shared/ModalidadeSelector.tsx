import { cn } from "@/lib/utils";
import {
  DESCRICAO_MODALIDADE,
  MODALIDADES,
  ROTULO_MODALIDADE,
  type Modalidade,
} from "@shared/modalidade";

interface ModalidadeSelectorProps {
  value: Modalidade | undefined;
  onChange: (m: Modalidade) => void;
  className?: string;
}

/** Escolha da modalidade do cadastro: PF, PJ MEI ou PJ ME. */
export function ModalidadeSelector({ value, onChange, className }: ModalidadeSelectorProps) {
  return (
    <div role="radiogroup" className={cn("grid grid-cols-1 gap-2 sm:grid-cols-3", className)}>
      {MODALIDADES.map((m) => {
        const ativo = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(m)}
            className={cn(
              "rounded-md border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo ? "border-primary bg-primary/10" : "border-input hover:bg-muted/50",
            )}
          >
            <span className="block font-medium">{ROTULO_MODALIDADE[m]}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{DESCRICAO_MODALIDADE[m]}</span>
          </button>
        );
      })}
    </div>
  );
}
