import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Save, TestTube2, Copy, Webhook, ExternalLink } from 'lucide-react';
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
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [realApiKey, setRealApiKey] = useState<string>('');
  const [realWebhookSecret, setRealWebhookSecret] = useState<string>('');

  // Get webhook URL
  const webhookUrl = `${window.location.origin}/api/webhooks/asaas`;

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência`
    });
  };

  // Buscar valores reais ao clicar em "Mostrar"
  const handleShowApiKey = async () => {
    if (!showApiKey && !realApiKey) {
      try {
        const response = await fetch('/api/admin/payment-settings/reveal', {
          credentials: 'include'
        });
        const data = await response.json();
        setRealApiKey(data.apiKey);
        setRealWebhookSecret(data.webhookSecret);
        setFormData({
          ...formData,
          apiKey: data.apiKey,
          webhookSecret: data.webhookSecret
        });
      } catch (error) {
        console.error('Error fetching real values:', error);
        toast({
          title: 'Erro ao buscar valores',
          description: 'Não foi possível carregar os valores reais',
          variant: 'destructive'
        });
      }
    }
    setShowApiKey(!showApiKey);
  };

  const handleShowWebhookSecret = async () => {
    if (!showWebhookSecret && !realWebhookSecret) {
      try {
        const response = await fetch('/api/admin/payment-settings/reveal', {
          credentials: 'include'
        });
        const data = await response.json();
        setRealApiKey(data.apiKey);
        setRealWebhookSecret(data.webhookSecret);
        setFormData({
          ...formData,
          apiKey: data.apiKey,
          webhookSecret: data.webhookSecret
        });
      } catch (error) {
        console.error('Error fetching real values:', error);
        toast({
          title: 'Erro ao buscar valores',
          description: 'Não foi possível carregar os valores reais',
          variant: 'destructive'
        });
      }
    }
    setShowWebhookSecret(!showWebhookSecret);
  };

  // Testar webhook
  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      const response = await fetch('/api/admin/payment-settings/test-webhook', {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Webhook configurado!',
          description: result.message
        });
      } else {
        toast({
          title: 'Erro na configuração',
          description: result.message || 'Verifique as configurações',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao testar webhook',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setTestingWebhook(false);
    }
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
                onClick={handleShowApiKey}
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

          {/* Webhook Configuration Section */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Webhook className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Configuração de Webhook</h3>
            </div>

            {/* Webhook URL */}
            <div className="mb-4">
              <Label htmlFor="webhookUrl">URL do Webhook</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookUrl"
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-sm bg-muted"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyToClipboard(webhookUrl, 'URL do webhook')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Use esta URL para configurar o webhook no painel do Asaas
              </p>
            </div>

            {/* Webhook Token/Secret */}
            <div className="mb-4">
              <Label htmlFor="webhookSecret">Token de Acesso do Webhook</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookSecret"
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={formData.webhookSecret}
                  onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
                  placeholder="Token para validar webhooks"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleShowWebhookSecret}
                >
                  {showWebhookSecret ? 'Ocultar' : 'Mostrar'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Token de segurança para validar requisições de webhook do Asaas
              </p>
            </div>

            {/* Test Webhook Button */}
            <div className="mb-4">
              <Button
                variant="outline"
                onClick={handleTestWebhook}
                disabled={testingWebhook || !formData.webhookSecret}
                className="w-full"
              >
                {testingWebhook ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testando webhook...
                  </>
                ) : (
                  <>
                    <TestTube2 className="mr-2 h-4 w-4" />
                    Testar Configuração do Webhook
                  </>
                )}
              </Button>
            </div>

            {/* Webhook Instructions */}
            <Alert>
              <AlertDescription className="text-sm space-y-2">
                <p className="font-semibold">Como configurar o webhook no Asaas:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Acesse o painel do Asaas e vá em Configurações → Webhooks</li>
                  <li>Clique em "Adicionar novo webhook"</li>
                  <li>Cole a URL do webhook acima no campo "URL de callback"</li>
                  <li>No campo "Token de acesso", insira o mesmo token configurado acima</li>
                  <li>Selecione os eventos que deseja receber (recomendado: todos os eventos de pagamento)</li>
                  <li>Salve a configuração</li>
                </ol>
                <div className="mt-3 pt-3 border-t">
                  <a
                    href={
                      formData.environment === 'production'
                        ? 'https://www.asaas.com/config/webhook'
                        : 'https://sandbox.asaas.com/config/webhook'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Abrir configuração de webhooks no Asaas
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </AlertDescription>
            </Alert>
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
