import { useState } from 'react';
import { useSubscription, useCancelSubscription } from '@/hooks/use-subscription';
import { useUpdateCard } from '@/hooks/use-billing';
import { CreditCardForm } from '@/components/billing/CreditCardForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CreditCard as CreditCardIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function BillingSettingsPage() {
  const { data, isLoading } = useSubscription();
  const updateCard = useUpdateCard();
  const cancelSub = useCancelSubscription();
  const { toast } = useToast();

  const [showUpdateCard, setShowUpdateCard] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCardValid, setIsCardValid] = useState(false);
  const [creditCard, setCreditCard] = useState({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: ''
  });

  const handleUpdateCard = async () => {
    try {
      await updateCard.mutateAsync({
        creditCard: {
          holderName: creditCard.holderName,
          number: creditCard.number.replace(/\s/g, ''),
          expiryMonth: creditCard.expiryMonth,
          expiryYear: creditCard.expiryYear,
          ccv: creditCard.ccv
        },
        creditCardHolderInfo: {
          name: creditCard.holderName,
          email: data?.subscription?.plan?.name || '',
          cpfCnpj: '00000000000',
          postalCode: '00000000',
          addressNumber: '0',
          phone: '00000000000'
        }
      });

      toast({ title: 'Cartão atualizado com sucesso!' });
      setShowUpdateCard(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar cartão',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleCancelSubscription = async () => {
    if (!cancelReason.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Por favor, informe o motivo do cancelamento',
        variant: 'destructive'
      });
      return;
    }

    try {
      await cancelSub.mutateAsync(cancelReason);
      toast({ title: 'Assinatura cancelada' });
      setShowCancelDialog(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao cancelar',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data?.hasSubscription) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Sem Assinatura Ativa</CardTitle>
            <CardDescription>Você não possui uma assinatura ativa</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/billing/checkout">Assinar Agora</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <h1 className="text-3xl font-bold">Configurações de Pagamento</h1>

      <Card>
        <CardHeader>
          <CardTitle>Assinatura Atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Plano</p>
            <p className="text-lg font-semibold">{data.subscription?.plan?.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Próxima cobrança</p>
            <p className="text-lg">
              {new Date(data.subscription?.currentPeriodEnd || '').toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Valor</p>
            <p className="text-lg font-semibold">
              R$ {parseFloat(data.subscription?.plan?.priceMonthly || '0').toFixed(2)}/mês
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forma de Pagamento</CardTitle>
          <CardDescription>Atualize seu cartão de crédito</CardDescription>
        </CardHeader>
        <CardContent>
          {!showUpdateCard ? (
            <Button onClick={() => setShowUpdateCard(true)}>
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Atualizar Cartão
            </Button>
          ) : (
            <div className="space-y-4">
              <CreditCardForm
                onCardChange={setCreditCard}
                onValidChange={setIsCardValid}
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleUpdateCard}
                  disabled={!isCardValid || updateCard.isPending}
                >
                  {updateCard.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
                <Button variant="outline" onClick={() => setShowUpdateCard(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Cancelar Assinatura</CardTitle>
          <CardDescription>Esta ação não pode ser desfeita</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive">Cancelar Assinatura</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tem certeza?</DialogTitle>
                <DialogDescription>
                  Você perderá acesso a todos os recursos premium
                </DialogDescription>
              </DialogHeader>
              <div>
                <Textarea
                  placeholder="Por favor, nos diga o motivo do cancelamento"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                  Manter Assinatura
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancelSubscription}
                  disabled={cancelSub.isPending}
                >
                  {cancelSub.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar Cancelamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
