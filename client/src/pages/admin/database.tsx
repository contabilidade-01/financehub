import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, Download, RefreshCw, FileText, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "next-themes";
import { useTranslation } from "@/contexts/LocalizationContext";

interface DatabaseTable {
  name: string;
  type: string;
}

interface DatabaseInfo {
  tables: DatabaseTable[];
  total: number;
}

export default function DatabasePage() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const { data: databaseInfo, isLoading, refetch } = useQuery<DatabaseInfo>({
    queryKey: ["/api/admin/database/tables"],
    refetchInterval: false,
  });

  const handleDownloadDDL = async () => {
    try {
      setIsDownloading(true);
      
      const response = await fetch("/api/admin/database/ddl", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(t("admin.database.download.error", "Erro ao gerar DDL"));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `database_ddl_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t("admin.database.download.success_title", "DDL baixado com sucesso"),
        description: t("admin.database.download.success_description", "O arquivo SQL foi salvo no seu computador."),
      });
    } catch (error) {
      console.error("Erro ao baixar DDL:", error);
      toast({
        title: t("admin.database.download.toast_error_title", "Erro ao baixar DDL"),
        description: t("admin.database.download.toast_error_description", "Não foi possível gerar o arquivo SQL."),
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: t("admin.database.refresh.title", "Atualizando..."),
      description: t("admin.database.refresh.description", "Lista de tabelas atualizada."),
    });
  };

  // Função para resetar globais
  const handleResetGlobals = async () => {
    setResetLoading(true);
    setResetSuccess(null);
    setResetError(null);
    try {
      const res = await apiRequest('/api/admin/reset-globals', { method: 'POST' });
      if (res.success) {
        setResetSuccess(res.message || t('admin.database.reset.success_default', 'Globais resetados com sucesso!'));
        toast({
          title: t('admin.database.reset.toast_success_title', 'Reset concluído'),
          description: res.message || t('admin.database.reset.success_default', 'Globais resetados com sucesso!'),
        });
      } else {
        setResetError(res.message || t('admin.database.reset.error_default', 'Erro ao resetar globais'));
        toast({
          title: t('admin.database.reset.toast_error_title', 'Erro ao resetar globais'),
          description: res.message || t('admin.database.reset.error_default', 'Erro ao resetar globais'),
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      setResetError(err?.message || t('admin.database.reset.error_default', 'Erro ao resetar globais'));
      toast({
        title: t('admin.database.reset.toast_error_title', 'Erro ao resetar globais'),
        description: err?.message || t('admin.database.reset.error_default', 'Erro ao resetar globais'),
        variant: 'destructive',
      });
    }
    setResetLoading(false);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8" />
            {t("admin.database.title", "Gerenciamento do Banco de Dados")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("admin.database.subtitle", "Visualize e gerencie a estrutura do banco de dados")}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t("common.refresh", "Atualizar")}
          </Button>
          
          <Button
            onClick={handleDownloadDDL}
            disabled={isDownloading}
          >
            <Download className={`h-4 w-4 mr-2 ${isDownloading ? 'animate-spin' : ''}`} />
            {isDownloading
              ? t("admin.database.download.generating", "Gerando...")
              : t("admin.database.download.button", "Baixar DDL")}
          </Button>
          {user?.tipo_usuario === 'superadmin' && (
            <Button
              onClick={handleResetGlobals}
              disabled={resetLoading}
              className="bg-orange-600 hover:bg-orange-700"
              title={t("admin.database.reset.tooltip", "Remove e recria as categorias e formas de pagamento globais padrão")}
            >
              <RotateCcw className={`h-4 w-4 mr-2 ${resetLoading ? 'animate-spin' : ''}`} />
              {resetLoading
                ? t("admin.database.reset.loading", "Resetando...")
                : t("admin.database.reset.button", "Resetar Globais")}
            </Button>
          )}
        </div>
      </div>
      {resetSuccess && <div className="mt-2 text-green-700">{resetSuccess}</div>}
      {resetError && <div className="mt-2 text-red-700">{resetError}</div>}

      <div className="grid gap-6">
        {/* Estatísticas */}
        <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
          <CardHeader>
            <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'} flex items-center gap-2`}>
              <FileText className="h-5 w-5" />
              {t("admin.database.stats.title", "Estatísticas do Banco")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {databaseInfo?.total || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("admin.database.stats.total_tables", "Total de Tabelas")}
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {databaseInfo?.tables?.filter(t => t.type === 'BASE TABLE').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("admin.database.stats.base_tables", "Tabelas Base")}
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {databaseInfo?.tables?.filter(t => t.type === 'VIEW').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("admin.database.stats.views", "Views")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Tabelas */}
        <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
          <CardHeader>
            <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'} flex items-center gap-2`}>
              <Database className="h-5 w-5" />
              {t("admin.database.table_list.title", "Tabelas do Banco de Dados")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                {t("admin.database.table_list.loading", "Carregando tabelas...")}
              </div>
            ) : databaseInfo?.tables && databaseInfo.tables.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.database.table_list.columns.name", "Nome da Tabela")}</TableHead>
                    <TableHead>{t("admin.database.table_list.columns.type", "Tipo")}</TableHead>
                    <TableHead>{t("admin.database.table_list.columns.status", "Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databaseInfo.tables.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-mono text-sm">
                        {table.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={table.type === 'BASE TABLE' ? 'default' : 'secondary'}>
                          {table.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          {t("admin.database.table_list.status.active", "Ativa")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.database.table_list.empty", "Nenhuma tabela encontrada")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações do DDL */}
        <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
          <CardHeader>
            <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              {t("admin.database.download.section_title", "Download do DDL")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("admin.database.download.description", "O DDL (Data Definition Language) contém todos os comandos SQL necessários para recriar a estrutura completa do banco de dados, incluindo:")}
              </p>
              
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>{t("admin.database.download.list.tables", "Criação de todas as tabelas")}</li>
                <li>{t("admin.database.download.list.columns", "Definição de colunas e tipos de dados")}</li>
                <li>{t("admin.database.download.list.constraints", "Constraints (Primary Keys, Foreign Keys, Unique)")}</li>
                <li>{t("admin.database.download.list.indexes", "Índices")}</li>
                <li>{t("admin.database.download.list.comments", "Comentários sobre a estrutura")}</li>
              </ul>
              
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">{t("admin.database.download.notice.title", "⚠️ Importante:")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.database.download.notice.description", "Este arquivo contém apenas a estrutura do banco. Para migrar dados, use a funcionalidade de migration disponível no sistema.")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 
