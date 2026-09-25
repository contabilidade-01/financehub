import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCog, LogOut, Shield, AlertTriangle } from "lucide-react";
import { User } from "@shared/schema";

interface ImpersonationInfo {
  isImpersonating: boolean;
  originalAdmin?: User;
  currentUser?: User;
}

export default function ImpersonationBanner() {
  const { toast } = useToast();
  const [isStoppingImpersonation, setIsStoppingImpersonation] = useState(false);

  // Verificar se há uma sessão de personificação ativa
  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  const handleStopImpersonation = async () => {
    try {
      setIsStoppingImpersonation(true);
      
      const response = await fetch("/api/admin/stop-impersonation", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        // Recarregar a página para aplicar as mudanças
        window.location.href = "/admin/dashboard";
      } else {
        const error = await response.json();
        toast({ title: "Erro", description: error.message || "Não foi possível encerrar a personificação", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao encerrar personificação", variant: "destructive" });
    } finally {
      setIsStoppingImpersonation(false);
    }
  };

  // Só mostrar o banner se estivermos no contexto de administração
  // Verificamos se há dados de personificação no usuário atual
  const shouldShowBanner = currentUser && 
    (window.location.pathname.includes('/admin') || 
     document.cookie.includes('impersonating=true'));

  if (!shouldShowBanner) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-purple-500"
    >
      <div className="container mx-auto px-4 py-3">
        <Alert className="border-purple-400 bg-purple-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-400" />
                <UserCog className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <AlertDescription className="text-white font-medium">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="border-purple-400 text-purple-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Modo Administração
                    </Badge>
                    Você está no painel administrativo
                    {currentUser?.tipo_usuario !== "super_admin" && (
                      <span className="text-purple-200">
                        • Personificando: <strong>{currentUser?.nome}</strong> ({currentUser?.email})
                      </span>
                    )}
                  </span>
                </AlertDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentUser?.tipo_usuario !== "super_admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStopImpersonation}
                  disabled={isStoppingImpersonation}
                  className="border-purple-400 text-purple-200 hover:bg-purple-800"
                >
                  {isStoppingImpersonation ? (
                    "Encerrando..."
                  ) : (
                    <>
                      <LogOut className="h-4 w-4 mr-1" />
                      Encerrar Personificação
                    </>
                  )}
                </Button>
              )}
              <Badge variant="outline" className="border-purple-400 text-purple-200">
                Super Admin Ativo
              </Badge>
            </div>
          </div>
        </Alert>
      </div>
    </motion.div>
  );
}