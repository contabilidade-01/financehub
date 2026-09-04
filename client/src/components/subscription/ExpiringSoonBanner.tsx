import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useLocation } from "wouter";

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function ExpiringSoonBanner() {
  const { showExpiringSoonBanner, daysRemaining, expirationDate, isTrial } = useSubscriptionStatus();
  const [location] = useLocation();

  if (!showExpiringSoonBanner) return null;
  if (location.startsWith("/subscription/renew") || location.startsWith("/billing/checkout")) {
    return null;
  }

  const dataFmt = formatDate(expirationDate);
  const n = daysRemaining ?? 0;
  const quando =
    n <= 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
  const titulo = isTrial
    ? `Sua degustação termina ${quando}`
    : `Sua assinatura vence ${quando}`;

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-sm">
            <p className="font-medium">{titulo}</p>
            {dataFmt && (
              <p className="text-xs opacity-80">
                Acesso até {dataFmt}. Renove para não perder o acesso.
              </p>
            )}
          </AlertDescription>
        </div>
        <Button size="sm" className="shrink-0" asChild>
          <a href="/subscription/renew">Renovar agora</a>
        </Button>
      </div>
    </Alert>
  );
}
