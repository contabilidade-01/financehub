import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CreditCard, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { useAuth } from "@/hooks/use-auth";

export default function SubscriptionExpired() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { config: systemConfig } = useSystemConfig();
  const { isAuthenticated } = useAuth();

  const irPagar = () => {
    if (isAuthenticated) {
      navigate("/subscription/renew");
      return;
    }
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-md">
        <Card className="glass-card neon-border border-red-500/20">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <CardTitle className="text-red-400">{t('subscription.expired.title', 'Assinatura Expirada')}</CardTitle>
            <CardDescription className="text-gray-300">
              {t('subscription.expired.description', `Sua assinatura do ${systemConfig.system_name} expirou. Pague no Asaas para voltar a usar.`)}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-400 text-center">
              {t(
                'subscription.expired.how_to_renew_desc',
                isAuthenticated
                  ? 'Clique abaixo para informar CPF/CNPJ e pagar na página segura do Asaas.'
                  : 'Entre na sua conta e pague no Asaas (cartão, Pix ou boleto). O acesso volta sozinho depois da confirmação.'
              )}
            </p>

            <div className="space-y-3">
              <Button onClick={irPagar} className="w-full">
                <CreditCard className="h-4 w-4 mr-2" />
                {isAuthenticated
                  ? t('subscription.expired.pay_button', 'Pagar no Asaas')
                  : t('subscription.expired.login_to_pay', 'Entrar para pagar')}
              </Button>

              <Button 
                onClick={() => navigate("/")}
                className="w-full"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('subscription.expired.back_to_login', 'Voltar ao Login')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
