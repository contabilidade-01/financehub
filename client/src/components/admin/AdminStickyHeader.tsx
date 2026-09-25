import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { User } from "@shared/schema";
import { Shield, Users, Activity, Database, TrendingUp, UserCog, Search, LogOut, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { NotificationsWidget } from "./NotificationsWidget";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalWallets: number;
  systemHealth: string;
}

interface AdminStickyHeaderProps {
  userData: User | undefined;
}

interface UserWithStats extends User {
  transactionCount: number;
  lastAccess: string | null;
}

interface ImpersonationStatus {
  isImpersonating: boolean;
  originalAdmin?: User;
  currentUser?: User;
}

export default function AdminStickyHeader({ userData }: AdminStickyHeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  // Fetch admin stats
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    refetchInterval: 30000
  });

  // Fetch all users for impersonation
  const { data: allUsers = [] } = useQuery<UserWithStats[]>({
    queryKey: ['/api/admin/users'],
    refetchInterval: 60000
  });

  // Usar dados de impersonação diretamente do userData que vem do /api/auth/me
  const impersonationData = userData && 'isImpersonating' in userData 
    ? {
        isImpersonating: (userData as any).isImpersonating,
        currentUser: userData,
        originalAdmin: (userData as any).originalAdmin
      }
    : { isImpersonating: false };

  const filteredUsers = allUsers.filter(user =>
    user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleImpersonate = async (userId: number) => {
    const user = allUsers.find(u => u.id === userId);
    // Apenas verificar se não está tentando impersonificar a si mesmo
    if (user?.id === userData?.id) {
      setIsModalOpen(false); // Fecha o Dialog de personificação
      setErrorModal({
        isOpen: true,
        title: 'Impersonificação não permitida',
        message: 'Não é possível personificar a si mesmo.'
      });
      toast({
        title: 'Impersonificação não permitida',
        description: 'Não é possível personificar a si mesmo.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId: userId })
      });
      if (response.ok) {
        setIsModalOpen(false);
        window.location.href = "/";
      } else {
        const error = await response.json();
        setIsModalOpen(false); // Fecha o Dialog de personificação
        setErrorModal({
          isOpen: true,
          title: 'Erro ao personificar usuário',
          message: error?.error || error?.message || "Não foi possível personificar o usuário."
        });
        toast({
          title: 'Erro ao personificar usuário',
          description: error?.error || error?.message || "Não foi possível personificar o usuário.",
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setIsModalOpen(false); // Fecha o Dialog de personificação
      setErrorModal({
        isOpen: true,
        title: 'Erro ao personificar usuário',
        message: error?.message || "Erro inesperado ao tentar personificar."
      });
      toast({
        title: 'Erro ao personificar usuário',
        description: error?.message || "Erro inesperado ao tentar personificar.",
        variant: 'destructive',
      });
    }
  };

  const handleStopImpersonation = async () => {
    try {
      const response = await fetch("/api/admin/stop-impersonation", {
        method: "POST",
        credentials: "include"
      });

      if (response.ok) {
        // Invalidar todos os caches relacionados ao admin e usuários
        await queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/admin/recent-users'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        
        // Recarregar a página para garantir estado limpo
        window.location.reload();
      }
    } catch (error) {
      console.error("Erro ao parar personificação:", error);
    }
  };

  // Mostrar header se for super admin OU se há impersonificação ativa
  const isDirectAdmin = userData?.tipo_usuario === 'super_admin';
  const isImpersonating = userData && 'isImpersonating' in userData && userData.isImpersonating;
  
  // Debug temporário
  console.log('AdminStickyHeader Debug:', {
    userData,
    isDirectAdmin,
    isImpersonating,
    hasIsImpersonatingProp: userData && 'isImpersonating' in userData,
    isImpersonatingValue: userData && 'isImpersonating' in userData ? userData.isImpersonating : null
  });
  
  if (!isDirectAdmin && !isImpersonating) {
    return null;
  }

  return (
    <motion.div 
      className="fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-700/50"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="w-full px-4 py-2">
        <Alert className="bg-slate-800/50 border-slate-600/50">
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-white">Painel Administrativo</span>
                </div>
                
                {impersonationData.isImpersonating && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-orange-500/20 rounded-md border border-orange-400/30">
                    <UserCog className="h-4 w-4 text-orange-300" />
                    <span className="text-sm text-orange-200">
                      Personificando: <strong>{impersonationData.currentUser?.nome}</strong>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopImpersonation}
                      className="ml-2 border-red-400 text-red-200 hover:bg-red-400/10 h-6 px-2 text-xs"
                    >
                      <LogOut className="h-3 w-3 mr-1" />
                      Parar
                    </Button>
                  </div>
                )}

                {stats && (
                  <div className="flex items-center gap-3 text-xs text-gray-300">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{stats.totalUsers} usuários</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      <span>{stats.totalTransactions} transações</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>{stats.totalWallets} carteiras</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {/* Widget de Notificações */}
                <NotificationsWidget />
                
                <Badge variant="outline" className="border-blue-400 text-blue-200">
                  <Shield className="h-3 w-3 mr-1" />
                  Sistema {stats?.systemHealth || "OK"}
                </Badge>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = "/admin/database"}
                  className="border-purple-400 text-purple-200 hover:bg-purple-400/10"
                >
                  <Database className="h-3 w-3 mr-1" />
                  Banco de Dados
                </Button>
                
                {!impersonationData.isImpersonating && (
                  <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogTrigger asChild>
                      <Badge 
                        variant="outline" 
                        className="border-green-400 text-green-200 cursor-pointer hover:bg-green-400/10"
                      >
                        <Search className="h-3 w-3 mr-1" />
                        Personificar Usuário
                      </Badge>
                    </DialogTrigger>
                    <DialogContent className={`bg-card border-border max-w-2xl`}>
                      <DialogHeader>
                        <DialogTitle className={`text-foreground flex items-center gap-2`}>
                          <UserCog className="h-5 w-5" />
                          Personificar Usuário
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Input
                          placeholder="Buscar por nome ou email..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="bg-card border-border text-foreground"
                        />
                        <div className="max-h-96 overflow-y-auto space-y-2">
                          {filteredUsers.map((user) => (
                            <div
                              key={user.id}
                              className={`flex items-center justify-between p-3 rounded-lg border bg-muted/50 border-border`}
                            >
                              <div>
                                <div className={`font-medium text-foreground`}>
                                  {user.nome}
                                </div>
                                <div className={`text-sm text-muted-foreground`}>
                                  {user.email}
                                </div>
                                <div className={`text-xs text-muted-foreground`}>
                                  {user.transactionCount} transações | Último acesso: {user.lastAccess || 'Nunca'}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleImpersonate(user.id)}
                                className="border-blue-500 text-blue-600 hover:bg-blue-50"
                              >
                                <UserCog className="h-3 w-3 mr-1" />
                                Personificar
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
      {/* Modal de Erro com Efeito Zoom-in Bounce (igual ao dashboard) */}
      {errorModal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center min-h-screen p-4">
          {/* Overlay com fade-in, z-[9998] */}
          <div 
            className="fixed inset-0 z-[9998] bg-black/70 animate-in fade-in-0 duration-300"
            onClick={() => setErrorModal({ ...errorModal, isOpen: false })}
          />
          {/* Modal com zoom-in bounce effect, z-[9999] */}
          <div 
            className="relative z-[9999] bg-slate-900 border-2 border-red-500/50 rounded-lg p-6 max-w-md w-full shadow-2xl"
            style={{
              animation: 'zoomInBounce 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards'
            }}
          >
            {/* Ícone de erro com efeito pulsante */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center border-2 border-red-500/30 animate-pulse">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            {/* Título centralizado */}
            <h3 className="text-xl font-bold text-white text-center mb-2">
              {errorModal.title}
            </h3>
            {/* Linha decorativa */}
            <div className="w-16 h-1 bg-red-500 rounded-full mx-auto mb-4"></div>
            {/* Mensagem de erro */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
              <p className="text-gray-200 text-center leading-relaxed">
                {errorModal.message}
              </p>
            </div>
            {/* Botão de fechar */}
            <div className="flex justify-center">
              <Button
                onClick={() => setErrorModal({ ...errorModal, isOpen: false })}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-lg"
              >
                Entendi
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}