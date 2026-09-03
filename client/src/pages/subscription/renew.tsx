import { useState } from "react";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { apiRequest } from "@/lib/queryClient";

export default function RenewSubscription() {
  const { t } = useTranslation();
  const { config: systemConfig } = useSystemConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gerarEAbrirAsaas = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/renew-link", {
        method: "POST",
        data: {},
      });
      if (!result?.url) {
        throw new Error("O Asaas não retornou o link de pagamento.");
      }
      window.location.href = result.url;
    } catch (err: any) {
      setError(err?.error || err?.message || "Não foi possível gerar a cobrança.");
      setLoading(false);
    }
  };

  return (
    <div className="container py-10 max-w-lg">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {t("subscription.renew.title", "Renovar Assinatura")}
          </CardTitle>
          <CardDescription>
            {t(
              "subscription.renew.description",
              `Vamos enviar seus dados ao Asaas. Você só completa o que faltar (CPF, cartão ou Pix) na página segura deles. ${systemConfig.system_name}`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button className="w-full h-12 text-base" onClick={gerarEAbrirAsaas} disabled={loading}>
            {loading ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <CreditCard className="h-5 w-5 mr-2" />
            )}
            {loading
              ? t("subscription.renew.generating", "Gerando cobrança…")
              : t("subscription.renew.pay_button", "Pagar no Asaas")}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            {t(
              "subscription.renew.hint",
              "O acesso volta sozinho quando o Asaas confirmar o pagamento."
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
