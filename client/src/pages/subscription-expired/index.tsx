import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, Mail, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "@/contexts/LocalizationContext";

export default function SubscriptionExpired() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

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
              {t('subscription.expired.description', 'Sua assinatura do FinanceHub expirou e o acesso foi suspenso')}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                <Clock className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <h3 className="font-medium text-red-300">{t('subscription.expired.access_suspended', 'Acesso Suspenso')}</h3>
                  <p className="text-sm text-gray-400">
                    {t('subscription.expired.access_suspended_desc', 'Sua conta foi automaticamente desativada devido ao vencimento da assinatura.')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                <Mail className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <h3 className="font-medium text-blue-300">{t('subscription.expired.how_to_renew', 'Como Renovar')}</h3>
                  <p className="text-sm text-gray-400">
                    {t('subscription.expired.how_to_renew_desc', 'Entre em contato com o administrador para renovar sua assinatura e reativar o acesso.')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => navigate("/")}
                className="w-full"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('subscription.expired.back_to_login', 'Voltar ao Login')}
              </Button>
              
              <div className="text-center">
                <p className="text-xs text-gray-500">
                  {t('subscription.expired.support', 'Para suporte, entre em contato com o administrador do sistema')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}