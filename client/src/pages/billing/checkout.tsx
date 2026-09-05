import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { usePlans } from '@/hooks/use-plans';
import { useAuth } from '@/hooks/use-auth';
import { useCheckout } from '@/hooks/use-billing';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PlanCard } from '@/components/billing/PlanCard';
// CARTÃO NO SITE — descomente para religar o formulário de cartão
// import { CreditCardForm } from '@/components/billing/CreditCardForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, ArrowRight, Check, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSystemConfig } from '@/contexts/SystemConfigContext';

interface CheckoutPageProps {
  externalMode?: boolean;
  checkoutToken?: string;
  preloadedPlans?: Array<{
    id: number;
    name: string;
    description: string;
    priceMonthly: number;
    features: string;
  }>;
  userData?: {
    id: number;
    nome: string;
    email: string;
  };
}

export default function CheckoutPage({
  externalMode = false,
  checkoutToken,
  preloadedPlans,
  userData
}: CheckoutPageProps = {}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { config: systemConfig } = useSystemConfig();
  // Só os planos do tipo do usuário (PF não vê preço de PJ e vice-versa).
  // O servidor usa a mesma regra ao cobrar, então o preço visto é o cobrado.
  const { user: usuarioLogado } = useAuth();
  const { data: plansFromAPI, isLoading: isLoadingPlans } = usePlans(
    (usuarioLogado as any)?.tipo_pessoa,
  );
  const checkout = useCheckout();
  const { notifications } = useWebSocket();

  // Usar preloadedPlans se em modo externo, caso contrário usar planos da API
  const plans = externalMode && preloadedPlans ? preloadedPlans : plansFromAPI;

  const [step, setStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  // CARTÃO NO SITE — descomente para religar
  // const [isCardValid, setIsCardValid] = useState(false);

  // Estados para espera de confirmação de pagamento
  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [waitingPaymentId, setWaitingPaymentId] = useState<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [personalInfo, setPersonalInfo] = useState({
    name: userData?.nome || '',
    email: userData?.email || '',
    cpfCnpj: '',
    phone: '',
    postalCode: '',
    addressNumber: '',
    addressComplement: ''
  });

  // CARTÃO NO SITE — descomente para religar
  // const [creditCard, setCreditCard] = useState({
  //   holderName: '',
  //   number: '',
  //   expiryMonth: '',
  //   expiryYear: '',
  //   ccv: ''
  // });

  // Validar CPF
  const validateCPF = (cpf: string): boolean => {
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return false;

    // Verificação simplificada
    if (/^(\d)\1+$/.test(cleaned)) return false;

    return true;
  };

  // Formatar CPF
  const formatCPF = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      .slice(0, 14);
  };

  // Formatar CEP
  const formatCEP = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
  };

  // Formatar telefone
  const formatPhone = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 15);
  };

  const handlePersonalInfoChange = (field: string, value: string) => {
    let formattedValue = value;

    if (field === 'cpfCnpj') {
      formattedValue = formatCPF(value);
    } else if (field === 'postalCode') {
      formattedValue = formatCEP(value);
    } else if (field === 'phone') {
      formattedValue = formatPhone(value);
    }

    setPersonalInfo({ ...personalInfo, [field]: formattedValue });
  };

  // Com um plano por tipo, a lista vem com um item só: seleciona sozinho para o
  // cliente não precisar "escolher" o que não tem alternativa.
  const planoUnico = (plans?.length ?? 0) === 1;
  useEffect(() => {
    if (planoUnico && selectedPlanId === null && plans?.[0]) {
      setSelectedPlanId(plans[0].id);
    }
  }, [planoUnico, plans, selectedPlanId]);

  const canGoToStep2 = selectedPlanId !== null;
  const canGoToStep3 = personalInfo.name && personalInfo.email && validateCPF(personalInfo.cpfCnpj) && personalInfo.phone && personalInfo.postalCode && personalInfo.addressNumber;
  // CARTÃO NO SITE: canSubmit era isCardValid. Sem cartão no site, basta ter chegado no passo 3.
  const canSubmit = canGoToStep3;

  // Escutar notificações WebSocket para confirmação de pagamento
  useEffect(() => {
    if (!waitingConfirmation || !waitingPaymentId || !notifications) return;

    // Procurar notificação de confirmação nas notificações recebidas
    const confirmationNotification = notifications.find(
      (notif: any) => notif.id === `payment-confirmed-${waitingPaymentId}`
    );

    if (confirmationNotification && confirmationNotification.data?.paymentId === waitingPaymentId) {
      console.log('[Checkout] Pagamento confirmado via WebSocket!', confirmationNotification);

      // Limpar timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Buscar informações do plano selecionado
      const selectedPlan = plans?.find(p => p.id === selectedPlanId);

      // Redirecionar para sucesso com status confirmado
      setWaitingConfirmation(false);
      setLocation('/billing/success', {
        state: {
          status: 'confirmed',
          subscription: confirmationNotification.data?.subscriptionId ? { id: confirmationNotification.data.subscriptionId } : null,
          payment: { status: 'confirmed', id: waitingPaymentId },
          plan: selectedPlan ? {
            name: selectedPlan.name,
            priceMonthly: selectedPlan.priceMonthly
          } : undefined
        }
      });
    }
  }, [notifications, waitingConfirmation, waitingPaymentId, plans, selectedPlanId, setLocation]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!selectedPlanId) return;

    try {
      const result = await checkout.mutateAsync({
        planId: selectedPlanId,
        cpfCnpj: personalInfo.cpfCnpj.replace(/\D/g, ''),
        ...(externalMode && checkoutToken ? { checkoutToken } : {})
      });

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      toast({
        title: 'Erro no checkout',
        description: 'O Asaas não retornou o link de pagamento.',
        variant: 'destructive'
      });

      /* CARTÃO NO SITE — descomente este fluxo (e creditCard no mutateAsync) para religar:
      const selectedPlan = plans?.find(p => p.id === selectedPlanId);
      if (result.status === 'confirmed') {
        setLocation('/billing/success', { state: { status: 'confirmed', subscription: result.subscription, payment: result.payment, plan: selectedPlan } });
      } else if (result.waitForWebhook) {
        setWaitingConfirmation(true);
        setWaitingPaymentId(result.paymentId);
        timeoutRef.current = setTimeout(() => {
          setWaitingConfirmation(false);
          setLocation('/billing/success', { state: { status: 'pending', subscription: result.subscription, payment: result.payment, plan: selectedPlan } });
        }, 30000);
      } else {
        setLocation('/billing/success', { state: { status: result.status || 'pending', subscription: result.subscription, payment: result.payment, plan: selectedPlan } });
      }
      */
    } catch (error: any) {
      toast({
        title: 'Erro no checkout',
        description: error.message || 'Não foi possível processar seu pagamento.',
        variant: 'destructive'
      });
    }
  };

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Tela de aguardando confirmação
  if (waitingConfirmation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <Clock className="h-8 w-8 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Processando Pagamento...</h2>
                <p className="text-muted-foreground">
                  Aguardando confirmação do pagamento. Isso pode levar alguns segundos.
                </p>
              </div>
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                <Clock className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <strong>Não feche esta página!</strong><br />
                  Estamos aguardando a confirmação do seu pagamento com a operadora.
                  Você será redirecionado automaticamente quando o pagamento for confirmado.
                </AlertDescription>
              </Alert>
              <div className="text-sm text-muted-foreground">
                ⏱️ Aguardando até 30 segundos pela confirmação...
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Assinar {systemConfig.system_name}</h1>
        <p className="text-muted-foreground">Complete seu cadastro e comece a usar</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-200'}`}>
            {step > 1 ? <Check className="h-5 w-5" /> : '1'}
          </div>
          <div className={`h-1 w-16 ${step >= 2 ? 'bg-primary' : 'bg-gray-200'}`} />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-200'}`}>
            {step > 2 ? <Check className="h-5 w-5" /> : '2'}
          </div>
          <div className={`h-1 w-16 ${step >= 3 ? 'bg-primary' : 'bg-gray-200'}`} />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 3 ? 'bg-primary text-white' : 'bg-gray-200'}`}>
            {step > 3 ? <Check className="h-5 w-5" /> : '3'}
          </div>
        </div>
      </div>

      {/* Step 1: plano do tipo do cliente (PF ou PJ) */}
      {step === 1 && (
        <div>
          {/* Um preço por tipo: o servidor já devolve só o plano de quem está
              assinando, então não há o que escolher — é confirmar e seguir. */}
          <h2 className="text-2xl font-semibold mb-6">
            {planoUnico ? "Seu plano" : "Escolha seu plano"}
          </h2>
          <div className={`grid gap-6 mb-6 ${planoUnico ? "max-w-md" : "md:grid-cols-3"}`}>
            {plans?.map((plan) => (
              <PlanCard
                key={plan.id}
                {...plan}
                isSelected={selectedPlanId === plan.id}
                onSelect={() => setSelectedPlanId(plan.id)}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!canGoToStep2}>
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Personal Info */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
            <CardDescription>Preencha seus dados para continuar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  value={personalInfo.name}
                  onChange={(e) => handlePersonalInfoChange('name', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={personalInfo.email}
                  onChange={(e) => handlePersonalInfoChange('email', e.target.value)}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={personalInfo.cpfCnpj}
                  onChange={(e) => handlePersonalInfoChange('cpfCnpj', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={personalInfo.phone}
                  onChange={(e) => handlePersonalInfoChange('phone', e.target.value)}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  placeholder="00000-000"
                  value={personalInfo.postalCode}
                  onChange={(e) => handlePersonalInfoChange('postalCode', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="number">Número</Label>
                <Input
                  id="number"
                  value={personalInfo.addressNumber}
                  onChange={(e) => handlePersonalInfoChange('addressNumber', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="complement">Complemento</Label>
                <Input
                  id="complement"
                  value={personalInfo.addressComplement}
                  onChange={(e) => handlePersonalInfoChange('addressComplement', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
          <div className="flex justify-between p-6">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canGoToStep3}>
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Payment — cartão no site COMENTADO (religar: CreditCardForm). */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
            <CardDescription>
              Você paga na página segura do Asaas (cartão, Pix ou boleto). Não coletamos cartão neste site.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/*
            <CreditCardForm
              onCardChange={setCreditCard}
              onValidChange={setIsCardValid}
            />
            */}
            <Alert>
              <AlertDescription>
                Ao continuar, você será levado ao Asaas para escolher a forma de pagamento. O acesso libera sozinho quando o pagamento confirmar.
              </AlertDescription>
            </Alert>
          </CardContent>
          <div className="flex justify-between p-6">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || checkout.isPending}
            >
              {checkout.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando cobrança…
                </>
              ) : (
                <>
                  Pagar no Asaas
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
