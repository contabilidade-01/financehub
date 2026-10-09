import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useLocation } from "wouter";
import { dataBrSP } from "@shared/datas-sp";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function ExpiringSoonBanner() {
  const { showExpiringSoonBanner, daysRemaining, expirationDate, isTrial } = useSubscriptionStatus();
  const [location] = useLocation();
  const { toast } = useToast();
  const [conferindo, setConferindo] = useState(false);

  // "Já paguei": confere no Asaas na hora (não espera o aviso automático).
  const conferir = async () => {
    setConferindo(true);
    try {
      const r = await apiRequest<{ ativado: boolean; acessoAte?: string; motivo?: string }>("/api/billing/conferir-pagamento", { method: "POST", data: {} });
      if (r?.ativado) {
        toast({ title: "Pagamento confirmado!", description: `Acesso liberado até ${dataBrSP(r.acessoAte) ?? "—"}.` });
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } else {
        toast({ title: "Pagamento ainda não identificado", description: "Pix e cartão costumam cair em minutos; boleto em até 2 dias úteis. A liberação é automática." });
      }
    } catch (err: any) {
      toast({ title: "Não consegui conferir agora", description: err?.error || err?.message || "Tente de novo em instantes.", variant: "destructive" });
    } finally {
      setConferindo(false);
    }
  };

  if (!showExpiringSoonBanner) return null;
  if (location.startsWith("/subscription/renew") || location.startsWith("/billing/checkout")) {
    return null;
  }

  const dataFmt = dataBrSP(expirationDate);
  const n = daysRemaining ?? 0;
  const quando =
    n <= 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
  const titulo = isTrial
    ? `Sua degustação termina ${quando}`
    : `Mensalidade em aberto: seu acesso termina ${quando}`;

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-sm">
            <p className="font-medium">{titulo}</p>
            {dataFmt && (
              <p className="text-xs opacity-80">
                {isTrial
                  ? `Acesso até ${dataFmt}. Assine para não perder o acesso.`
                  : `Acesso até ${dataFmt}. Pague a fatura para não perder o acesso — se já pagou, a baixa é automática.`}
              </p>
            )}
          </AlertDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={conferir} disabled={conferindo}>
            {conferindo ? "Conferindo…" : "Já paguei"}
          </Button>
          <Button size="sm" asChild>
            <a href="/subscription/renew">{isTrial ? "Assinar agora" : "Pagar fatura"}</a>
          </Button>
        </div>
      </div>
    </Alert>
  );
}
