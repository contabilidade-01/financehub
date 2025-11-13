import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import CheckoutPage from '../billing/checkout';
import { Loader2, AlertCircle, Sparkles, Shield, Zap, CreditCard, Lock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

interface TokenValidationResponse {
  valid: boolean;
  user?: {
    id: number;
    nome: string;
    email: string;
  };
  plans?: Array<{
    id: number;
    name: string;
    description: string;
    priceMonthly: number;
    features: string;
  }>;
  error?: string;
  hasActiveSubscription?: boolean;
}

export default function ExternalCheckout() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  // Extrair token da URL
  const params = new URLSearchParams(searchString);
  const token = params.get('tokenaccess');

  // Validar token via API
  const { data, isLoading, error } = useQuery<TokenValidationResponse>({
    queryKey: ['validate-checkout-token', token],
    queryFn: async () => {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      const response = await fetch(`/api/billing/checkout/validate/${token}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Token inválido');
      }

      return response.json();
    },
    enabled: !!token,
    retry: false
  });

  // Se não houver token, renderizar 404
  if (!token) {
    return <NotFoundPage message="Link de pagamento inválido. O token de acesso não foi fornecido." />;
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        {/* Hero Header Skeleton */}
        <div className="bg-gradient-to-r from-[#FF64B3]/10 via-[#00FFAA]/10 to-[#FF64B3]/10 border-b">
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-6 w-32" />
            </div>
            <Skeleton className="h-6 w-64 mt-2" />
          </div>
        </div>

        {/* Loading Content */}
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center py-12"
          >
            <div className="relative mb-6">
              <Loader2 className="h-16 w-16 animate-spin text-[#FF64B3]" />
              <div className="absolute inset-0 h-16 w-16 animate-pulse rounded-full bg-[#FF64B3]/20 blur-xl" />
            </div>

            <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#FF64B3] to-[#00FFAA] bg-clip-text text-transparent">
              Verificando acesso...
            </h2>
            <p className="text-muted-foreground text-center max-w-md">
              Estamos validando seu token de acesso. Isso levará apenas alguns segundos.
            </p>

            {/* Progress Steps */}
            <div className="mt-8 space-y-3 w-full max-w-md">
              {['Validando token', 'Carregando planos', 'Preparando checkout'].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="h-2 w-2 rounded-full bg-[#00FFAA] animate-pulse" />
                  <span className="text-muted-foreground">{step}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Erro de validação = 404
  if (error || !data?.valid) {
    const errorMessage = data?.hasActiveSubscription
      ? 'Você já possui uma assinatura ativa. Faça login para acessar sua conta.'
      : error?.message || 'Link de pagamento inválido ou expirado.';

    return <NotFoundPage message={errorMessage} />;
  }

  // Token válido - renderizar checkout em modo externo
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-gradient-to-r from-[#FF64B3]/10 via-[#00FFAA]/10 to-[#FF64B3]/10 border-b backdrop-blur-sm"
      >
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#FF64B3] to-[#00FFAA] bg-clip-text text-transparent">
                FinanceHub
              </h1>
              <p className="text-muted-foreground mt-1">
                Gestão financeira inteligente e moderna
              </p>
            </div>
            <Badge variant="secondary" className="flex items-center gap-2 px-4 py-2 text-sm">
              <Lock className="h-4 w-4 text-[#00FFAA]" />
              Pagamento Seguro
            </Badge>
          </div>
        </div>
      </motion.div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Welcome Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Card className="mb-8 border-2 border-[#FF64B3]/20 bg-gradient-to-br from-[#FF64B3]/5 to-[#00FFAA]/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-gradient-to-br from-[#FF64B3] to-[#00FFAA] flex-shrink-0">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2">
                    Olá, <span className="bg-gradient-to-r from-[#FF64B3] to-[#00FFAA] bg-clip-text text-transparent">{data.user?.nome}</span>!
                  </h2>
                  <p className="text-muted-foreground">
                    Você está a um passo de desbloquear todos os recursos do FinanceHub.
                    Complete o pagamento abaixo para ativar sua conta e começar sua jornada financeira.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          <Card className="border-[#00FFAA]/20 hover:border-[#00FFAA]/40 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-[#00FFAA]/10 mb-3">
                  <Shield className="h-6 w-6 text-[#00FFAA]" />
                </div>
                <h3 className="font-semibold mb-1">100% Seguro</h3>
                <p className="text-sm text-muted-foreground">
                  Certificado SSL e criptografia de ponta
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#FF64B3]/20 hover:border-[#FF64B3]/40 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-[#FF64B3]/10 mb-3">
                  <Zap className="h-6 w-6 text-[#FF64B3]" />
                </div>
                <h3 className="font-semibold mb-1">Ativação Instantânea</h3>
                <p className="text-sm text-muted-foreground">
                  Sua conta é ativada automaticamente
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#00FFAA]/20 hover:border-[#00FFAA]/40 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-[#00FFAA]/10 mb-3">
                  <CreditCard className="h-6 w-6 text-[#00FFAA]" />
                </div>
                <h3 className="font-semibold mb-1">Múltiplas Formas</h3>
                <p className="text-sm text-muted-foreground">
                  Cartão de crédito aceito
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Checkout Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <CheckoutPage
            externalMode={true}
            checkoutToken={token}
            preloadedPlans={data.plans}
            userData={data.user}
          />
        </motion.div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 pt-8 border-t"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
            <div>
              <h4 className="font-semibold mb-3 bg-gradient-to-r from-[#FF64B3] to-[#00FFAA] bg-clip-text text-transparent">
                FinanceHub
              </h4>
              <p className="text-sm text-muted-foreground">
                Sua plataforma completa para gestão financeira inteligente e moderna.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Suporte</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Central de Ajuda</li>
                <li>Termos de Uso</li>
                <li>Política de Privacidade</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Segurança</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  SSL
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  PCI DSS
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <CreditCard className="h-3 w-3" />
                  Asaas
                </Badge>
              </div>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground pt-6 border-t">
            © {new Date().getFullYear()} FinanceHub. Todos os direitos reservados.
          </div>
        </motion.footer>
      </div>
    </div>
  );
}

// Componente de 404 customizado
function NotFoundPage({ message }: { message: string }) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card className="border-2 border-destructive/20 shadow-2xl">
          <CardHeader className="text-center pb-3">
            {/* Animated Error Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.2,
                type: "spring",
                stiffness: 200,
                damping: 10
              }}
              className="flex items-center justify-center mb-6"
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-destructive/20 blur-xl animate-pulse" />
                <div className="relative rounded-full bg-gradient-to-br from-destructive/10 to-destructive/5 p-6">
                  <AlertCircle className="h-16 w-16 text-destructive" />
                </div>
              </div>
            </motion.div>

            <CardTitle className="text-3xl font-bold mb-2">
              Acesso Negado
            </CardTitle>
            <CardDescription className="text-base leading-relaxed px-4">
              {message}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 pt-2">
            <Button
              onClick={() => setLocation('/')}
              className="w-full h-12 text-base bg-gradient-to-r from-[#FF64B3] to-[#00FFAA] hover:opacity-90 transition-opacity"
              size="lg"
            >
              <span className="flex items-center gap-2">
                Ir para Login
                <ArrowRight className="h-5 w-5" />
              </span>
            </Button>

            <Button
              onClick={() => setLocation('/register')}
              variant="outline"
              className="w-full h-12 text-base border-2 hover:border-[#FF64B3] hover:text-[#FF64B3] transition-colors"
              size="lg"
            >
              Criar Nova Conta
            </Button>

            <div className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Precisa de ajuda? Entre em contato com o suporte.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Additional Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-6"
        >
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-[#00FFAA] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Segurança em primeiro lugar:</strong> Links de pagamento são únicos e intransferíveis. Se você recebeu este link de alguém, certifique-se de que é legítimo.
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
