import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CreditCard, Calendar, User, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/contexts/LocalizationContext";

export default function CancelSubscription() {
  const [cancellationReason, setCancellationReason] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (data: { motivo: string }) => {
      return apiRequest("/api/subscription/cancel", {
        method: "POST",
        data: data,
      });
    },
    onSuccess: () => {
      toast({
        title: t("subscription.cancel.toast.success.title", "Solicitação enviada"),
        description: t("subscription.cancel.toast.success.description", "Sua solicitação de cancelamento foi processada com sucesso."),
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      // Redirecionar para dashboard após cancelamento
      window.location.href = "/";
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Erro"),
        description: error.message || t("subscription.cancel.toast.error.description", "Erro ao processar cancelamento"),
        variant: "destructive",
      });
    },
  });

  const handleCancelSubscription = () => {
    if (!cancellationReason.trim()) {
      toast({
        title: t("subscription.cancel.toast.missing_reason.title", "Motivo obrigatório"),
        description: t("subscription.cancel.toast.missing_reason.description", "Por favor, informe o motivo do cancelamento."),
        variant: "destructive",
      });
      return;
    }

    cancelSubscriptionMutation.mutate({
      motivo: cancellationReason.trim()
    });
  };

  const reasonOptions = [
    { id: "price_high", label: t("subscription.cancel.reasons.price_high", "Preço muito alto") },
    { id: "not_using", label: t("subscription.cancel.reasons.not_using", "Não uso mais o serviço") },
    { id: "found_alternative", label: t("subscription.cancel.reasons.found_alternative", "Encontrei alternativa melhor") },
    { id: "technical_issues", label: t("subscription.cancel.reasons.technical_issues", "Problemas técnicos") },
    { id: "bad_support", label: t("subscription.cancel.reasons.bad_support", "Atendimento insatisfatório") },
    { id: "missing_features", label: t("subscription.cancel.reasons.missing_features", "Recursos insuficientes") },
    { id: "other", label: t("subscription.cancel.reasons.other", "Outro") },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            {t("subscription.cancel.title", "Cancelar Assinatura")}
          </h1>
          <p className="text-gray-400">
            {t("subscription.cancel.subtitle", "Lamentamos que você queira cancelar sua assinatura")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informações da Assinatura */}
          <Card className="glass-card neon-border">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t("subscription.cancel.current_plan.title", "Sua Assinatura Atual")}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {t("subscription.cancel.current_plan.description", "Detalhes do seu plano atual")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  {t("subscription.cancel.current_plan.status_label", "Status")}:
                </span>
                <Badge variant="default">
                  {t("subscription.cancel.current_plan.status_value", "Ativa")}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  {t("subscription.cancel.current_plan.plan_label", "Plano")}:
                </span>
                <span className="text-white font-medium">
                  {t("subscription.cancel.current_plan.plan_value", "FinanceHub Premium")}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  {t("subscription.cancel.current_plan.renewal_label", "Renovação")}:
                </span>
                <span className="text-white">
                  {t("subscription.cancel.current_plan.renewal_value", "Mensal")}
                </span>
              </div>
              
              <Separator className="bg-gray-700" />
              
              <div className="space-y-2">
                <h4 className="text-white font-medium">
                  {t("subscription.cancel.current_plan.losses_title", "O que você perderá:")}
                </h4>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• {t("subscription.cancel.current_plan.losses.reports", "Acesso a relatórios avançados")}</li>
                  <li>• {t("subscription.cancel.current_plan.losses.api", "API para integração")}</li>
                  <li>• {t("subscription.cancel.current_plan.losses.reminders", "Lembretes e notificações")}</li>
                  <li>• {t("subscription.cancel.current_plan.losses.support", "Suporte prioritário")}</li>
                  <li>• {t("subscription.cancel.current_plan.losses.backup", "Backup automático dos dados")}</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Formulário de Cancelamento */}
          <Card className="glass-card neon-border">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t("subscription.cancel.form.title", "Motivo do Cancelamento")}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {t("subscription.cancel.form.description", "Ajude-nos a melhorar nosso serviço")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <label className="text-white font-medium">
                  {t("subscription.cancel.form.reasons_label", "Principais motivos (opcional):")}
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {reasonOptions.map((reason) => (
                    <button
                      key={reason.id}
                      onClick={() => setCancellationReason(reason.label)}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                        cancellationReason === reason.label
                          ? "border-purple-500 bg-purple-500/20 text-white"
                          : "border-gray-600 bg-gray-800/50 text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      {reason.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="reason" className="text-white font-medium">
                  {t("subscription.cancel.form.details_label", "Detalhes adicionais:")}
                </label>
                <Textarea
                  id="reason"
                  placeholder={t("subscription.cancel.form.details_placeholder", "Conte-nos mais sobre o motivo do cancelamento...")}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 min-h-[100px]"
                />
              </div>

              {!isConfirming ? (
                <Button
                  onClick={() => setIsConfirming(true)}
                  variant="destructive"
                  className="w-full"
                  disabled={!cancellationReason.trim()}
                >
                  {t("subscription.cancel.form.request_button", "Solicitar Cancelamento")}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-400 mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">
                        {t("subscription.cancel.confirmation.title", "Confirmação Necessária")}
                      </span>
                    </div>
                    <p className="text-red-300 text-sm">
                      {t("subscription.cancel.confirmation.message", "Esta ação cancelará sua assinatura imediatamente. Você perderá acesso a todos os recursos premium.")}
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setIsConfirming(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      {t("common.back", "Voltar")}
                    </Button>
                    <Button
                      onClick={handleCancelSubscription}
                      variant="destructive"
                      className="flex-1"
                      disabled={cancelSubscriptionMutation.isPending}
                    >
                      {cancelSubscriptionMutation.isPending
                        ? t("subscription.cancel.confirmation.processing", "Processando...")
                        : t("subscription.cancel.confirmation.confirm_button", "Confirmar Cancelamento")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alternativas */}
        <Card className="glass-card border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5" />
              {t("subscription.cancel.alternatives.title", "Antes de cancelar...")}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {t("subscription.cancel.alternatives.description", "Considere estas alternativas")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <Calendar className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                <h4 className="text-white font-medium mb-1">
                  {t("subscription.cancel.alternatives.pause.title", "Pausar Assinatura")}
                </h4>
                <p className="text-gray-300 text-sm">
                  {t("subscription.cancel.alternatives.pause.description", "Pause por até 3 meses sem perder seus dados")}
                </p>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <CreditCard className="h-6 w-6 text-green-400 mx-auto mb-2" />
                <h4 className="text-white font-medium mb-1">
                  {t("subscription.cancel.alternatives.change_plan.title", "Alterar Plano")}
                </h4>
                <p className="text-gray-300 text-sm">
                  {t("subscription.cancel.alternatives.change_plan.description", "Mude para um plano mais adequado")}
                </p>
              </div>
              
              <div className="text-center p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <MessageSquare className="h-6 w-6 text-purple-400 mx-auto mb-2" />
                <h4 className="text-white font-medium mb-1">
                  {t("subscription.cancel.alternatives.contact.title", "Falar Conosco")}
                </h4>
                <p className="text-gray-300 text-sm">
                  {t("subscription.cancel.alternatives.contact.description", "Nossa equipe pode ajudar com suas dúvidas")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
