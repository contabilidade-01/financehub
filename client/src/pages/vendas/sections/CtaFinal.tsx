import { Button } from "@/components/ui/button";
import type { Tipo } from "../types";

interface CtaFinalProps {
  tipo: Tipo;
  ctaLabel: string;
  onAssinar: () => void;
  onLogin: () => void;
  onTrocarTipo: () => void;
}

export default function CtaFinal({ tipo, ctaLabel, onAssinar, onLogin, onTrocarTipo }: CtaFinalProps) {
  const isPJ = tipo === "juridica";

  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
          {isPJ ? "Organize o financeiro da sua empresa hoje" : "Comece a organizar sua vida financeira hoje"}
        </h2>
        <p className="mt-3 text-muted-foreground">
          15 dias grátis. Sem cartão de crédito para começar.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={onAssinar} className="text-base">
            {ctaLabel}
          </Button>
          <Button size="lg" variant="outline" onClick={onLogin} className="text-base">
            Já tem conta? Entrar
          </Button>
        </div>

        <div className="mt-4">
          <Button variant="link" className="text-sm text-muted-foreground" onClick={onTrocarTipo}>
            {isPJ ? "Sou pessoa física — ver plano PF" : "Tenho empresa — ver plano PJ"}
          </Button>
        </div>
      </div>
    </section>
  );
}
