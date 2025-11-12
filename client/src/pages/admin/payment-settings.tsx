import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Save, TestTube2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PaymentSettings {
  id?: number;
  provider: string;
  environment: 'sandbox' | 'production';
  apiKey: string;
  apiKeyLength?: number;
  webhookSecret: string;
  enabled: boolean;
  configured: boolean;
}

export default function PaymentSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<PaymentSettings>({
    provider: 'asaas',
    environment: 'sandbox',
    apiKey: '',
    webhookSecret: '',
    enabled: true,
    configured: false
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading } = useQuery<PaymentSettings>({
    queryKey: ['payment-settings'],
    queryFn: async () => {
      const response = await fetch('/api/admin/payment-settings', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setFormData(data);
      return data;
    }
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (data: Partial<PaymentSettings>) => {
      const response = await fetch('/api/admin/payment-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update settings');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Configurações salvas com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/admin/payment-settings/test', {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Conexão bem-sucedida!',
          description: result.message
        });
      } else {
        toast({
          title: 'Falha na conexão',
          description: result.message || 'Verifique suas credenciais',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao testar conexão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    updateSettings.mutate({
      environment: formData.environment,
      apiKey: formData.apiKey,
      webhookSecret: formData.webhookSecret,
      enabled: formData.enabled
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configurações de Pagamento</h1>
        <p className="text-muted-foreground mt-2">
          Configure a integração com o gateway de pagamento Asaas
        </p>
      </div>

      {/* Status Card */}
      {settings?.configured && (
        <Alert className="mb-6">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Gateway de pagamento configurado e {settings.enabled ? 'ativo' : 'inativo'}
          </AlertDescription>
        </Alert>
      )}

      {!settings?.configured && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Gateway de pagamento não configurado. Configure abaixo para ativar pagamentos.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Asaas - Gateway de Pagamento</CardTitle>
          <CardDescription>
            Configure suas credenciais da API do Asaas para processar pagamentos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Environment */}
          <div>
            <Label htmlFor="environment">Ambiente</Label>
            <Select
              value={formData.environment}
              onValueChange={(value: 'sandbox' | 'production') =>
                setFormData({ ...formData, environment: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Use Sandbox para testes e Produção para pagamentos reais
            </p>
          </div>

          {/* API Key */}
          <div>
            <Label htmlFor="apiKey">Chave API (API Key)</Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="$aact_..."
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? 'Ocultar' : 'Mostrar'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Obtenha sua chave API em:{' '}
              <a
                href={
                  formData.environment === 'production'
                    ? 'https://www.asaas.com/myAccount/api'
                    : 'https://sandbox.asaas.com/myAccount/api'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Asaas {formData.environment === 'sandbox' ? 'Sandbox' : 'Produção'}
              </a>
            </p>
          </div>

          {/* Webhook Secret */}
          <div>
            <Label htmlFor="webhookSecret">Webhook Secret (Opcional)</Label>
            <Input
              id="webhookSecret"
              type="password"
              value={formData.webhookSecret}
              onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
              placeholder="Deixe em branco para gerar automaticamente"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Secret para validar webhooks recebidos do Asaas
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending || !formData.apiKey}
              className="flex-1"
            >
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Configurações
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !formData.apiKey}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <TestTube2 className="mr-2 h-4 w-4" />
                  Testar Conexão
                </>
              )}
            </Button>
          </div>

          {/* Info */}
          <Alert>
            <AlertDescription className="text-sm">
              <strong>Dica:</strong> Após salvar, teste a conexão para verificar se as credenciais estão corretas.
              As configurações são carregadas automaticamente pelo sistema.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
