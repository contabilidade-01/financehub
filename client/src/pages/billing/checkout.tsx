import { useState } from 'react';
import { useLocation } from 'wouter';
import { usePlans } from '@/hooks/use-plans';
import { useCheckout } from '@/hooks/use-billing';
import { PlanCard } from '@/components/billing/PlanCard';
import { CreditCardForm } from '@/components/billing/CreditCardForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: plans, isLoading: isLoadingPlans } = usePlans();
  const checkout = useCheckout();

  const [step, setStep] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [isCardValid, setIsCardValid] = useState(false);

  const [personalInfo, setPersonalInfo] = useState({
    name: '',
    email: '',
    cpfCnpj: '',
    phone: '',
    postalCode: '',
    addressNumber: '',
    addressComplement: ''
  });

  const [creditCard, setCreditCard] = useState({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: ''
  });

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

  const canGoToStep2 = selectedPlanId !== null;
  const canGoToStep3 = personalInfo.name && personalInfo.email && validateCPF(personalInfo.cpfCnpj) && personalInfo.phone && personalInfo.postalCode && personalInfo.addressNumber;
  const canSubmit = isCardValid;

  const handleSubmit = async () => {
    if (!selectedPlanId) return;

    try {
      const result = await checkout.mutateAsync({
        planId: selectedPlanId,
        cpfCnpj: personalInfo.cpfCnpj.replace(/\D/g, ''),
        creditCard: {
          holderName: creditCard.holderName,
          number: creditCard.number.replace(/\s/g, ''),
          expiryMonth: creditCard.expiryMonth,
          expiryYear: creditCard.expiryYear,
          ccv: creditCard.ccv
        },
        creditCardHolderInfo: {
          name: personalInfo.name,
          email: personalInfo.email,
          cpfCnpj: personalInfo.cpfCnpj.replace(/\D/g, ''),
          postalCode: personalInfo.postalCode.replace(/\D/g, ''),
          addressNumber: personalInfo.addressNumber,
          addressComplement: personalInfo.addressComplement,
          phone: personalInfo.phone.replace(/\D/g, ''),
          mobilePhone: personalInfo.phone.replace(/\D/g, '')
        }
      });

      // Buscar informações do plano selecionado
      const selectedPlan = plans?.find(p => p.id === selectedPlanId);

      // Redirecionar para página de sucesso com dados da transação
      setLocation('/billing/success', {
        state: {
          subscription: result.subscription,
          payment: result.payment,
          plan: selectedPlan ? {
            name: selectedPlan.name,
            priceMonthly: selectedPlan.priceMonthly
          } : undefined
        }
      });
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

  return (
    <div className="container max-w-6xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Assinar FinanceHub</h1>
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

      {/* Step 1: Select Plan */}
      {step === 1 && (
        <div>
          <h2 className="text-2xl font-semibold mb-6">Escolha seu plano</h2>
          <div className="grid md:grid-cols-3 gap-6 mb-6">
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

      {/* Step 3: Payment */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
            <CardDescription>Insira os dados do seu cartão de crédito</CardDescription>
          </CardHeader>
          <CardContent>
            <CreditCardForm
              onCardChange={setCreditCard}
              onValidChange={setIsCardValid}
            />
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
                  Processando...
                </>
              ) : (
                <>
                  Finalizar Assinatura
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
