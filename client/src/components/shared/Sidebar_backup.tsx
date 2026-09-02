import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggleSimple } from "@/components/theme-toggle-simple";
import { 
  LayoutDashboard, 
  Wallet, 
  ArrowLeftRight, 
  PieChart, 
  Tag, 
  Settings, 
  LogOut, 
  Menu, 
  User as UserIcon,
  CalendarClock,
  Shield,
  Users,
  CreditCard
} from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import { VersionDisplay } from "@/components/shared/VersionDisplay";

export default function Sidebar() {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  
  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [location, isMobile]);
  
  // Open sidebar when switching from mobile to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsSidebarOpen(true);
    }
  }, [isMobile]);
  
  const { data: userData } = useQuery<User>({
    queryKey: ["/api/users/profile"],
    enabled: !!user,
  });
  
  // A função de logout agora é implementada diretamente no botão
  
  const menuItems = [
    {
      label: "PRINCIPAL",
      items: [
        { 
          icon: <LayoutDashboard className="mr-3 h-5 w-5" />, 
          text: "Dashboard", 
          path: "/" 
        },
        { 
          icon: <Wallet className="mr-3 h-5 w-5" />, 
          text: "Carteira", 
          path: "/wallet" 
        },
        { 
          icon: <ArrowLeftRight className="mr-3 h-5 w-5" />, 
          text: "Transações", 
          path: "/transactions" 
        },
        { 
          icon: <CreditCard className="mr-3 h-5 w-5" />, 
          text: "Formas de Pagamento", 
          path: "/payment-methods" 
        },
        { 
          icon: <PieChart className="mr-3 h-5 w-5" />, 
          text: "Relatórios", 
          path: "/reports" 
        },
      ]
    },
    {
      label: "GERENCIAMENTO",
      items: [
        { 
          icon: <Tag className="mr-3 h-5 w-5" />, 
          text: "Categorias", 
          path: "/categories" 
        },
        { 
          icon: <CalendarClock className="mr-3 h-5 w-5" />, 
          text: "Lembretes", 
          path: "/reminders" 
        },
        { 
          icon: <Settings className="mr-3 h-5 w-5" />, 
          text: "Configurações", 
          path: "/settings" 
        },
      ]
    }
  ];

  // Verificar se deve mostrar opções administrativas
  const isDirectAdmin = userData?.tipo_usuario === 'super_admin';
  const isImpersonating = userData && 'isImpersonating' in userData && userData.isImpersonating;
  const shouldShowAdminItems = isDirectAdmin || isImpersonating;

  // Adicionar seção de administração para super admins ou durante impersonificação
  const adminItems = shouldShowAdminItems ? [
    {
      label: "ADMINISTRAÇÃO",
      items: [
        { 
          icon: <Shield className="mr-3 h-5 w-5" />, 
          text: "Painel Admin", 
          path: "/admin/dashboard" 
        },
        { 
          icon: <Users className="mr-3 h-5 w-5" />, 
          text: "Usuários", 
          path: "/admin/users" 
        },
      ]
    }
  ] : [];

  const allMenuItems = [...menuItems, ...adminItems];
  
  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };
  
  return (
    <>
      {/* Mobile: Header compacto quando menu fechado */}
      <aside className={`glass ${isSidebarOpen ? 'hidden' : 'block'} lg:hidden w-full z-10`}>
        <div className="p-5 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon mr-3">
                <LayoutDashboard className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-space font-bold text-white tracking-wide">
                Khesef
              </h1>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile: Overlay lateral quando menu aberto */}
      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50" 
            onClick={() => setIsSidebarOpen(false)}
          />
          
          {/* Sidebar overlay */}
          <aside className="glass w-80 z-10 relative flex flex-col h-full">
            {/* Header com botão fechar */}
            <div className="p-5 pb-0 flex-shrink-0">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon mr-3">
                    <LayoutDashboard className="h-5 w-5 text-white" />
                  </div>
                  <h1 className="text-2xl font-space font-bold text-white tracking-wide">
                    Khesef
                  </h1>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </div>
            </div>
            
            {/* Conteúdo do menu overlay */}
            <div className="flex-1 overflow-y-auto p-5 pt-0">
              {allMenuItems.map((group, groupIndex) => (
                <div key={groupIndex} className="mb-8">
                  <div className="mb-5">
                    <span className="text-xs font-label text-gray-400">{group.label}</span>
                  </div>
                  <nav>
                    <ul className="space-y-3">
                      {group.items.map((item, itemIndex) => (
                        <motion.li key={itemIndex} whileHover={{ x: 5 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            variant="ghost"
                            className={`w-full justify-start ${
                              isActive(item.path)
                                ? "text-white bg-primary/10 menu-item-active"
                                : "text-gray-400 hover:text-white"
                            }`}
                            onClick={() => {
                              navigate(item.path);
                              setIsSidebarOpen(false);
                            }}
                          >
                            {item.icon}
                            <span>{item.text}</span>
                          </Button>
                        </motion.li>
                      ))}
                    </ul>
                  </nav>
                </div>
              ))}
              
              <div className="glass-card neon-border p-4 rounded-xl">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{userData?.nome || "Usuário"}</p>
                    <p className="text-xs text-gray-400 truncate">{userData?.email || "usuario@exemplo.com"}</p>
                  </div>
                  <ThemeToggleSimple />
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-3 bg-dark hover:bg-primary/20 text-gray-300 hover:text-white"
                  onClick={async () => {
                    if (confirm('Deseja realmente sair do sistema?')) {
                      try {
                        const response = await fetch('/api/auth/logout', {
                          method: 'POST',
                          credentials: 'include',
                          headers: {
                            'Content-Type': 'application/json'
                          }
                        });
                        
                        if (response.ok) {
                          window.location.href = '/';
                        }
                      } catch (error) {
                        console.error('Erro ao fazer logout:', error);
                      }
                    }
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> 
                  Sair
                </Button>
              </div>
              
              <div className="mt-4 text-center">
                <VersionDisplay />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop: Sidebar normal */}
      <aside className={`glass hidden lg:block w-64 z-10 lg:fixed ${shouldShowAdminItems ? 'lg:top-24' : 'lg:min-h-screen'}`}
             style={shouldShowAdminItems ? { 
               top: '96px', 
               height: 'calc(100vh - 96px)',
               display: 'flex',
               flexDirection: 'column'
             } : { minHeight: '100vh' }}>
        
        {/* Header fixo do Khesef */}
        <div className="p-5 pb-0 flex-shrink-0">
          <div className="flex items-center justify-start mb-8">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon mr-3">
                <LayoutDashboard className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-space font-bold text-white tracking-wide">
                Khesef
              </h1>
            </div>
          </div>
        </div>
        
        {/* Conteúdo do menu com scroll */}
        <div className="flex-1 overflow-y-auto p-5 pt-0">
          {allMenuItems.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-8">
              <div className="mb-5">
                <span className="text-xs font-label text-gray-400">{group.label}</span>
              </div>
              <nav>
                <ul className="space-y-3">
                  {group.items.map((item, itemIndex) => (
                    <motion.li key={itemIndex} whileHover={{ x: 5 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="ghost"
                        className={`w-full justify-start ${
                          isActive(item.path)
                            ? "text-white bg-primary/10 menu-item-active"
                            : "text-gray-400 hover:text-white"
                        }`}
                        onClick={() => navigate(item.path)}
                      >
                        {item.icon}
                        <span>{item.text}</span>
                      </Button>
                    </motion.li>
                  ))}
                </ul>
              </nav>
            </div>
          ))}
          
          <div className="glass-card neon-border p-4 rounded-xl">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{userData?.nome || "Usuário"}</p>
                <p className="text-xs text-gray-400 truncate">{userData?.email || "usuario@exemplo.com"}</p>
              </div>
              <ThemeToggleSimple />
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-3 bg-dark hover:bg-primary/20 text-gray-300 hover:text-white"
              onClick={async () => {
                if (confirm('Deseja realmente sair do sistema?')) {
                  try {
                    const response = await fetch('/api/auth/logout', {
                      method: 'POST',
                      credentials: 'include',
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    if (response.ok) {
                      window.location.href = '/';
                    }
                  } catch (error) {
                    console.error('Erro ao fazer logout:', error);
                  }
                }
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> 
              Sair
            </Button>
          </div>
          
          <div className="mt-4 text-center">
            <VersionDisplay />
          </div>
        </div>
      </aside>
    </>
  );
}
