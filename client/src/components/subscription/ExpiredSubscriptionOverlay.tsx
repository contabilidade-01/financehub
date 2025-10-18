import { Lock, CreditCard, AlertTriangle, LogOut, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLocalization, useTranslation } from "@/contexts/LocalizationContext";

interface ExpiredSubscriptionOverlayProps {
  expirationDate?: string;
}

export function ExpiredSubscriptionOverlay({ expirationDate }: ExpiredSubscriptionOverlayProps) {
  const { t } = useTranslation();
  const { locale } = useLocalization();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      window.location.href = '/';
    }
  };

  const formattedDate = expirationDate
    ? new Date(expirationDate).toLocaleDateString(
        locale ? locale.replace(/([a-z]{2})-([a-z]{2})/, (_, lang, region) => `${lang}-${region.toUpperCase()}`) : 'pt-BR'
      )
    : null;

  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-red-200 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900 border-4 border-red-200 dark:border-red-700">
            <div className="relative">
              <ShieldX className="h-10 w-10 text-red-600 dark:text-red-400" />
              <Lock className="h-5 w-5 text-red-700 dark:text-red-300 absolute -bottom-1 -right-1" />
            </div>
          </div>
          <CardTitle className="text-2xl text-red-600 dark:text-red-400 mb-2">
            {t("subscription.overlay.restricted_access", "Acesso Restrito")}
          </CardTitle>
          <CardDescription className="text-center text-base">
            {t("subscription.overlay.access_blocked", "Sua assinatura expirou e o acesso aos recursos foi bloqueado")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {expirationDate && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div className="text-sm text-red-600 dark:text-red-400">
                <div className="font-medium">
                  {t("subscription.overlay.expired_subscription", "Assinatura expirada")}
                </div>
                <div>
                  {t("subscription.overlay.date_label", "Data")}: {formattedDate}
                </div>
              </div>
            </div>
          )}
          
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("subscription.overlay.renew_prompt", "Para continuar usando todos os recursos do FinanceHub Premium, renove sua assinatura ou entre em contato com o suporte.")}
            </p>
            
            <div className="space-y-3">
              <Button className="w-full h-12 text-base" onClick={() => window.location.href = '/subscription/renew'}>
                <CreditCard className="h-5 w-5 mr-2" />
                {t("subscription.overlay.renew_button", "Renovar Assinatura")}
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full h-12 text-base border-gray-300 hover:border-gray-400"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5 mr-2" />
                {t("subscription.overlay.logout_button", "Sair da Conta")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
