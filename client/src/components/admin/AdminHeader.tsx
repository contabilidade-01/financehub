import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Shield, Users, Activity, Database, TrendingUp } from "lucide-react";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalWallets: number;
  systemHealth: string;
}

export default function AdminHeader() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  if (isLoading) {
    return (
      <div className="border bg-card p-4 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Painel de Administração</h2>
        </div>
        <div className="text-center py-2">Carregando estatísticas do sistema...</div>
      </div>
    );
  }

  return (
    <div className="border bg-card p-4 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Painel de Administração</h2>
        <span className="text-sm text-muted-foreground">- Visão Geral do Sistema</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Users className="h-6 w-6 text-blue-400" />
          </div>
          <div className="text-lg font-semibold text-white">{stats?.totalUsers || 0}</div>
          <div className="text-xs text-muted-foreground">Usuários</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Activity className="h-6 w-6 text-income" />
          </div>
          <div className="text-lg font-semibold text-white">{stats?.activeUsers || 0}</div>
          <div className="text-xs text-muted-foreground">Ativos</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <TrendingUp className="h-6 w-6 text-yellow-400" />
          </div>
          <div className="text-lg font-semibold text-white">{stats?.totalTransactions || 0}</div>
          <div className="text-xs text-muted-foreground">Transações</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Database className="h-6 w-6 text-purple-400" />
          </div>
          <div className="text-lg font-semibold text-white">{stats?.totalWallets || 0}</div>
          <div className="text-xs text-muted-foreground">Carteiras</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-income" />
          </div>
          <div className="text-lg font-semibold text-income">{stats?.systemHealth || "OK"}</div>
          <div className="text-xs text-muted-foreground">Sistema</div>
        </div>
      </div>
    </div>
  );
}