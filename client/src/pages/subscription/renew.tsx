import { useState } from "react";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/contexts/LocalizationContext";
import { apiRequest } from "@/lib/queryClient";

function soDigitos(v: string) {
  return v.replace(/\D/g, "");
}

export default function RenewSubscription() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");

  const gerarEAbrirAsaas = async () => {
    const doc = soDigitos(cpfCnpj);
    if (doc.length !== 11 && doc.length !== 14) {
      setError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/renew-link", {
        method: "POST",
        data: { cpfCnpj: doc },
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
              "Informe seu CPF ou CNPJ. Em seguida você paga na página segura do Asaas (cartão ou Pix)."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 text-left">
            <Label htmlFor="cpfCnpj">CPF ou CNPJ</Label>
            <Input
              id="cpfCnpj"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Somente números"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(soDigitos(e.target.value).slice(0, 14))}
              disabled={loading}
            />
          </div>
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
