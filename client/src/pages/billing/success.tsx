import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Download, Calendar, DollarSign, RefreshCw, FileText, Clock, Home, Sparkles, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';

interface SuccessState {
  status?: 'confirmed' | 'pending'; // Status do pagamento
  subscription: {
    id: number;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  };
  payment: {
    id: number;
    status: string;
    amount?: number;
    dueDate?: string;
    invoiceUrl?: string;
  };
  plan?: {
    name: string;
    priceMonthly: string;
  };
}

export default function BillingSuccessPage() {
  const [, setLocation] = useLocation();
  const state = (window.history.state as { state?: SuccessState })?.state;
  const [countdown, setCountdown] = useState(15);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Countdown timer para redirect automático
  useEffect(() => {
    if (!state?.subscription) {
      console.warn('No subscription data found, redirecting to home');
      setTimeout(() => setLocation('/'), 2000);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsRedirecting(true);
          clearInterval(timer);
          setTimeout(() => setLocation('/'), 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state, setLocation]);

  const handleGoHome = () => {
    setIsRedirecting(true);
    setLocation('/');
  };

  if (!state?.subscription) {
    return (
      <div className="container mx-auto py-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Pagamento processado!</h2>
          <p className="text-muted-foreground mt-2">Redirecionando...</p>
        </motion.div>
      </div>
    );
  }

  const { subscription, payment, plan, status } = state;
  const isConfirmed = status === 'confirmed' || payment.status === 'confirmed';
  const isPending = status === 'pending' || payment.status === 'pending';

  // Calcular duração da assinatura (se tiver datas)
  const startDate = subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : new Date();
  const endDate = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : new Date();
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // Formatar datas
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const progressPercentage = ((15 - countdown) / 15) * 100;

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      {/* Header com animação de sucesso */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, type: "spring" }}
        className="text-center mb-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 10 }}
          className="relative inline-block mb-6"
        >
          {isConfirmed ? (
            <>
              <div className="absolute inset-0 bg-green-400 rounded-full blur-2xl opacity-30 animate-pulse"></div>
              <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-2xl">
                <CheckCircle className="h-16 w-16 text-white" strokeWidth={2.5} />
              </div>
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-yellow-400 rounded-full blur-2xl opacity-30 animate-pulse"></div>
              <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-2xl">
                <Clock className="h-16 w-16 text-white" strokeWidth={2.5} />
              </div>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {isConfirmed ? (
            <>
              <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Muito Obrigado!
              </h1>
              <p className="text-2xl text-muted-foreground mb-2">
                Seu pagamento foi confirmado com sucesso
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold">Assinatura Ativada</span>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                Pagamento em Processamento
              </h1>
              <p className="text-2xl text-muted-foreground mb-2">
                Aguardando confirmação do pagamento
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                <Clock className="h-4 w-4" />
                <span className="font-semibold">Confirmação Pendente</span>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Status Alert */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mb-6"
      >
        {isConfirmed ? (
          <>
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
              <Clock className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200 flex items-center justify-between">
                <span>
                  Você será redirecionado para a página inicial em <strong>{countdown} segundos</strong>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGoHome}
                  disabled={isRedirecting}
                  className="ml-4"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Ir Agora
                </Button>
              </AlertDescription>
            </Alert>
            <Progress value={progressPercentage} className="mt-2 h-1" />
          </>
        ) : (
          <>
            <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
              <Clock className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <div className="space-y-2">
                  <p>
                    <strong>Seu pagamento está sendo processado</strong>
                  </p>
                  <p className="text-sm">
                    Você receberá uma notificação assim que o pagamento for confirmado pela operadora.
                    Isso pode levar alguns minutos. Você pode verificar o status na página de pagamentos.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGoHome}
                      disabled={isRedirecting}
                    >
                      <Home className="mr-2 h-4 w-4" />
                      Ir para Início
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation('/billing/invoices')}
                    >
                      Ver Pagamentos
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            <Progress value={progressPercentage} className="mt-2 h-1" />
          </>
        )}
      </motion.div>

      {/* Grid de informações principais */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
      >
        {/* Valor Pago */}
        <Card className="border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Valor Pago</CardTitle>
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              R$ {parseFloat(plan?.priceMonthly || '0').toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Primeira cobrança</p>
          </CardContent>
        </Card>

        {/* Duração */}
        <Card className="border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Duração</CardTitle>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {durationDays} dias
            </div>
            <p className="text-xs text-muted-foreground mt-1">Período da assinatura</p>
          </CardContent>
        </Card>

        {/* Próxima Cobrança */}
        <Card className="border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Próxima Cobrança</CardTitle>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <RefreshCw className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {formatDate(endDate).split(' de ')[0]}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(endDate).split(' de ').slice(1).join(' de ')}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Detalhes da Assinatura */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes da Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Informações do Plano */}
            <div className="p-6 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold">{plan?.name || 'Plano Premium'}</h3>
                  <p className="text-sm text-muted-foreground mt-1">Assinatura Mensal Recorrente</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    R$ {parseFloat(plan?.priceMonthly || '0').toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">/mês</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/20">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Início da Assinatura</p>
                  <p className="font-semibold">{formatDate(startDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Válido até</p>
                  <p className="font-semibold">{formatDate(endDate)}</p>
                </div>
              </div>
            </div>

            {/* Status do Pagamento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                <div className="p-2 rounded-lg bg-background">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status do Pagamento</p>
                  <p className="font-semibold">
                    {payment.status === 'confirmed' ? '✅ Confirmado' :
                     payment.status === 'pending' ? '⏳ Pendente' : '🔄 Processando'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                <div className="p-2 rounded-lg bg-background">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ID da Transação</p>
                  <p className="font-semibold font-mono">#{payment.id}</p>
                </div>
              </div>
            </div>

            {/* Download da Fatura */}
            {payment.invoiceUrl && (
              <div className="pt-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => window.open(payment.invoiceUrl, '_blank')}
                >
                  <Download className="mr-2 h-5 w-5" />
                  Baixar Fatura / Comprovante
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Próximos Passos */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
      >
        {isConfirmed ? (
          <Card className="mb-6 border-2 border-primary/20">
            <CardHeader className="bg-primary/5">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Comece a usar agora!
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Explore o Dashboard</h4>
                    <p className="text-sm text-muted-foreground">
                      Conheça todas as ferramentas disponíveis para gerenciar suas finanças
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Configure suas Carteiras</h4>
                    <p className="text-sm text-muted-foreground">
                      Crie carteiras para organizar suas contas bancárias e investimentos
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Registre suas Transações</h4>
                    <p className="text-sm text-muted-foreground">
                      Comece a registrar suas receitas e despesas para ter controle total
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 border-2 border-yellow-500/20">
            <CardHeader className="bg-yellow-500/5">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                O que acontece agora?
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Processamento do Pagamento</h4>
                    <p className="text-sm text-muted-foreground">
                      A operadora está processando seu pagamento. Isso geralmente leva alguns minutos.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Confirmação Automática</h4>
                    <p className="text-sm text-muted-foreground">
                      Você receberá uma notificação assim que o pagamento for confirmado
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Ativação da Assinatura</h4>
                    <p className="text-sm text-muted-foreground">
                      Após a confirmação, sua assinatura será ativada automaticamente e você terá acesso completo
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Informações de Suporte */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-center p-6 rounded-lg bg-muted"
      >
        <p className="text-sm text-muted-foreground">
          Dúvidas ou precisa de ajuda? Entre em contato com nosso{' '}
          <a href="mailto:suporte@financehub.com" className="text-primary hover:underline font-semibold">
            suporte
          </a>
          {' '}ou acesse nosso{' '}
          <button
            onClick={() => setLocation('/billing/invoices')}
            className="text-primary hover:underline font-semibold"
          >
            histórico de pagamentos
          </button>
        </p>
      </motion.div>
    </div>
  );
}
