import { Building2, User as UserIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Plan, Tipo } from "../types";

function formatBRL(v: string | number): string {
  const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PricingProps {
  tipo: Tipo;
  plano: Plan | undefined;
  isLoading: boolean;
  features: string[];
  isAuthenticated: boolean;
  onAssinar: () => void;
  onTrocarTipo: () => void;
}

export default function Pricing({
  tipo,
  plano,
  isLoading,
  features,
  isAuthenticated,
  onAssinar,
  onTrocarTipo,
}: PricingProps) {
  const isPJ = tipo === "juridica";

  return (
    <section className="px-4 py-14 sm:py-20" id="pricing">
      <div className="mx-auto max-w-lg">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Assine o {isPJ ? "plano PJ" : "plano PF"}</h2>
          <p className="mt-2 text-muted-foreground">15 dias grátis para testar, sem compromisso.</p>
        </div>

        <Card className="border bg-card">
          <CardHeader className="text-center">
            <div className="inline-flex items-center gap-1 self-center rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              {isPJ ? <Building2 className="h-4 w-4" aria-hidden="true" /> : <UserIcon className="h-4 w-4" aria-hidden="true" />}
              {isPJ ? "Plano Pessoa Jurídica (PJ)" : "Plano Pessoa Física (PF)"}
            </div>
            <div className="mt-4 flex items-end justify-center gap-1">
              <span className="text-2xl font-semibold">R$</span>
              <span className="text-5xl font-extrabold tracking-tight">
                {isLoading ? "—" : formatBRL(plano?.priceMonthly ?? (isPJ ? 79.9 : 39.9))}
              </span>
              <span className="text-muted-foreground mb-1">/mês</span>
            </div>
            {plano?.description && (
              <p className="text-sm text-muted-foreground mt-2">{plano.description}</p>
            )}
          </CardHeader>

          <CardContent>
            <ul className="space-y-3 mb-6">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button className="w-full" size="lg" onClick={onAssinar}>
              {isAuthenticated ? "Assinar agora" : "Começar (15 dias grátis)"}
            </Button>

            <p className="text-center text-xs text-muted-foreground mt-3">
              Pagamento seguro via Pix, boleto ou cartão. Cancele quando quiser.
            </p>

            <div className="text-center mt-4">
              <Button variant="link" className="p-0 text-sm text-muted-foreground" onClick={onTrocarTipo}>
                {isPJ ? "Sou pessoa física — ver plano PF" : "Tenho empresa — ver plano PJ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
