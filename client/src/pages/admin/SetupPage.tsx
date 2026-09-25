import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Database, RefreshCw, Play, Shield, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "next-themes";

interface DatabaseStatus {
  connected: boolean;
  tables: {
    name: string;
    exists: boolean;
    recordCount: number;
    indexes: string[];
  }[];
  totalRecords: number;
  migrationStatus: 'pending' | 'running' | 'completed' | 'error';
  lastMigration: string | null;
  errors: string[];
}

export default function SetupPage() {
  const { theme } = useTheme();
  const [isRunningMigration, setIsRunningMigration] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: status, isLoading, error } = useQuery<DatabaseStatus>({
    queryKey: ['/api/admin/database/status'],
    refetchInterval: isRunningMigration ? 2000 : false,
  });

  const migrationMutation = useMutation({
    mutationFn: () => apiRequest('/api/admin/database/migrate', { method: 'POST' }),
    onMutate: () => {
      setIsRunningMigration(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/database/status'] });
      setIsRunningMigration(false);
    },
    onError: () => {
      setIsRunningMigration(false);
    }
  });

  const verifyMutation = useMutation({
    mutationFn: () => apiRequest('/api/admin/database/verify', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/database/status'] });
    }
  });

  // Função para resetar globais
  const handleResetGlobals = async () => {
    setResetLoading(true);
    setResetSuccess(null);
    setResetError(null);
    try {
      const res = await apiRequest('/api/admin/reset-globals', { method: 'POST' });
      if (res.success) {
        setResetSuccess(res.message || 'Globais resetados com sucesso!');
        queryClient.invalidateQueries();
      } else {
        setResetError(res.message || 'Erro ao resetar globais');
      }
    } catch (err: any) {
      setResetError(err?.message || 'Erro ao resetar globais');
    }
    setResetLoading(false);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Setup do Sistema</h1>
          <Badge variant="secondary">Super Admin</Badge>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Verificando status do banco de dados...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Setup do Sistema</h1>
          <Badge variant="secondary">Super Admin</Badge>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao verificar status do banco: {error instanceof Error ? error.message : 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Setup do Sistema</h1>
          <Badge variant="secondary">
            <Shield className="h-3 w-3 mr-1" />
            Super Admin
          </Badge>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending || isRunningMigration}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${verifyMutation.isPending ? 'animate-spin' : ''}`} />
            Verificar
          </Button>
          <Button
            onClick={() => migrationMutation.mutate()}
            disabled={migrationMutation.isPending || isRunningMigration || status?.migrationStatus === 'completed'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Play className={`h-4 w-4 mr-2 ${isRunningMigration ? 'animate-spin' : ''}`} />
            {isRunningMigration ? 'Executando...' : 'Executar Migração'}
          </Button>
          <Button
            onClick={handleResetGlobals}
            disabled={resetLoading}
            className="bg-orange-600 hover:bg-orange-700"
            title="Remove e recria as categorias e formas de pagamento globais padrão"
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${resetLoading ? 'animate-spin' : ''}`} />
            {resetLoading ? 'Resetando...' : 'Resetar Globais'}
          </Button>
        </div>
      </div>
      {resetSuccess && <Alert className="border-green-200 bg-green-50 mt-2"><AlertDescription className="text-green-800">{resetSuccess}</AlertDescription></Alert>}
      {resetError && <Alert variant="destructive" className="mt-2"><AlertDescription>{resetError}</AlertDescription></Alert>}

      {/* Status da Conexão */}
      <Card className={`border bg-card bg-card border border-border`}>
        <CardHeader>
          <CardTitle className={`text-foreground`}>
            <Database className="h-5 w-5" />
            Status da Conexão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <CheckCircle className="h-5 w-5 text-income" />
                <span className="text-income">Conectado ao banco de dados</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-expense" />
                <span className="text-expense">Falha na conexão com banco</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status das Migrações */}
      <Card className={`border bg-card bg-card border border-border`}>
        <CardHeader>
          <CardTitle className={`text-foreground`}>
            Status das Migrações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            <Badge variant={
              status?.migrationStatus === 'completed' ? 'default' :
              status?.migrationStatus === 'running' ? 'secondary' :
              status?.migrationStatus === 'error' ? 'destructive' : 'outline'
            }>
              {status?.migrationStatus === 'completed' && 'Completo'}
              {status?.migrationStatus === 'running' && 'Executando'}
              {status?.migrationStatus === 'error' && 'Erro'}
              {status?.migrationStatus === 'pending' && 'Pendente'}
            </Badge>
          </div>
          
          {status?.lastMigration && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Última migração:</span>
              <span className="text-muted-foreground">{status.lastMigration}</span>
            </div>
          )}

          {status?.errors && status.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  {status.errors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Resumo dos Dados */}
      <Card className={`border bg-card bg-card border border-border`}>
        <CardHeader>
          <CardTitle className={`text-foreground`}>
            Resumo dos Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{status?.totalRecords || 0}</div>
              <div className="text-sm text-muted-foreground">Total de Registros</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-income">
                {status?.tables?.filter(t => t.exists).length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Tabelas Criadas</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {status?.tables?.filter(t => !t.exists).length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Tabelas Faltando</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detalhes das Tabelas */}
      <Card className={`border bg-card bg-card border border-border`}>
        <CardHeader>
          <CardTitle className={`text-foreground`}>
            Integridade das Tabelas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {status?.tables?.map((table) => (
              <div key={table.name} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{table.name}</span>
                    {table.exists ? (
                      <CheckCircle className="h-4 w-4 text-income" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-expense" />
                    )}
                  </div>
                  <Badge variant={table.exists ? 'default' : 'destructive'}>
                    {table.exists ? 'OK' : 'Faltando'}
                  </Badge>
                </div>
                
                {table.exists && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Registros:</span>
                      <span className="ml-2 text-muted-foreground">{table.recordCount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="font-medium">Índices:</span>
                      <span className="ml-2 text-muted-foreground">
                        {table.indexes?.length > 0 ? table.indexes.join(', ') : 'Nenhum'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}