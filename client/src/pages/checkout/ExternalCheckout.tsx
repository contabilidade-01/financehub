import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import CheckoutPage from '../billing/checkout';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Verificando acesso...</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header simplificado para checkout externo */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">FinanceHub</h1>
          <p className="text-sm text-muted-foreground">
            Complete seu pagamento para ativar sua conta
          </p>
        </div>
      </div>

      {/* Informações do usuário */}
      <div className="container mx-auto px-4 py-4">
        <Alert className="mb-4">
          <AlertDescription>
            Olá, <strong>{data.user?.nome}</strong>!
            Complete o pagamento abaixo para ativar sua conta no FinanceHub.
          </AlertDescription>
        </Alert>
      </div>

      {/* Renderizar checkout com token */}
      <CheckoutPage
        externalMode={true}
        checkoutToken={token}
        preloadedPlans={data.plans}
        userData={data.user}
      />
    </div>
  );
}

// Componente de 404 customizado
function NotFoundPage({ message }: { message: string }) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-center">Acesso Negado</CardTitle>
          <CardDescription className="text-center">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setLocation('/')}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Ir para Login
            </button>
            <button
              onClick={() => setLocation('/register')}
              className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
            >
              Criar Nova Conta
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
