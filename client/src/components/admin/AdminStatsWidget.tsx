import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, Activity, Database } from "lucide-react";
import { useTranslation } from "@/contexts/LocalizationContext";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalWallets: number;
  systemHealth: string;
}

export default function AdminStatsWidget() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const getSystemHealthLabel = () => {
    const status = stats?.systemHealth?.toLowerCase();
    switch (status) {
      case "ok":
      case "healthy":
        return t('admin.dashboard.system_health.ok', 'Operação normal');
      case "degraded":
        return t('admin.dashboard.system_health.degraded', 'Operação degradada');
      case "critical":
        return t('admin.dashboard.system_health.critical', 'Status crítico');
      default:
        return stats?.systemHealth || t('admin.dashboard.system_health.unknown', 'Indeterminado');
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card neon-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('admin.dashboard.stats.title', 'Estatísticas Administrativas')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            {t('admin.dashboard.stats.loading', 'Carregando estatísticas...')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card neon-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t('admin.dashboard.stats.title', 'Estatísticas Administrativas')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <div className="text-sm text-gray-400">
              {t('admin.dashboard.stats.total_users', 'Total de Usuários')}
            </div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Activity className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.activeUsers || 0}</div>
            <div className="text-sm text-gray-400">
              {t('admin.dashboard.stats.active_users', 'Usuários Ativos')}
            </div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Database className="h-8 w-8 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.totalTransactions || 0}</div>
            <div className="text-sm text-gray-400">
              {t('admin.dashboard.stats.total_transactions', 'Total de Transações')}
            </div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Shield className="h-8 w-8 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-green-500">
              {stats?.systemHealth || 'OK'}
            </div>
            <div className="text-sm text-gray-400">
              {t('admin.dashboard.stats.system_status', 'Status do Sistema')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{getSystemHealthLabel()}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
