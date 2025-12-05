import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Wallet,
  PlusCircle,
  CreditCard,
  Tag,
  Menu,
  LogOut,
  User as UserIcon,
  Shield,
  Users,
  Settings,
  CalendarDays,
  Key,
  BarChart3,
  DollarSign,
  Search,
  Wrench
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { VersionDisplay } from "@/components/shared/VersionDisplay";
import { ThemeToggleSimple } from "@/components/theme-toggle-simple";
import { useTheme } from "next-themes";
import { useTranslation } from "@/contexts/LocalizationContext";

interface MenuItem {
  icon: React.ReactNode;
  text: string;
  path: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

function Sidebar() {
  const [location, navigate] = useLocation();
  const { user: userData } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [prevLogoUrl, setPrevLogoUrl] = useState<string | null>(null);
  const [hasCustomLogo, setHasCustomLogo] = useState<boolean | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!theme) return;
    const updateLogo = () => {
      const newUrl = `/api/logo?theme=${theme}`;
      
      // Precarregar nova imagem antes de trocar
      const img = new window.Image();
      img.onload = () => {
        // Só salvar URL anterior se já tivermos um logo customizado
        if (logoUrl && hasCustomLogo) {
          setPrevLogoUrl(logoUrl);
        }
        setLogoUrl(newUrl);
        setHasCustomLogo(true);
        setIsInitialLoad(false);
        // Limpar URL anterior após transição
        if (logoUrl && hasCustomLogo) {
          setTimeout(() => setPrevLogoUrl(null), 200);
        }
      };
      img.onerror = () => {
        // Logo customizado não existe
        setLogoUrl(null);
        setHasCustomLogo(false);
        setIsInitialLoad(false);
        setPrevLogoUrl(null);
      };
      img.src = newUrl;
    };
    updateLogo();
    window.addEventListener('logo-updated', updateLogo);
    return () => window.removeEventListener('logo-updated', updateLogo);
  }, [theme]);

  const shouldShowAdminItems = userData?.tipo_usuario === 'super_admin' || userData?.tipo_usuario === 'admin';
  
  // Verificar se deve aplicar offset do header admin (super admin direto OU impersonação ativa)
  const isDirectAdmin = userData?.tipo_usuario === 'super_admin';
  const isImpersonating = userData && 'isImpersonating' in userData && userData.isImpersonating;
  const shouldApplyAdminOffset = isDirectAdmin || isImpersonating;

  // Menu items do usuário
  const userMenuItems: MenuGroup[] = [
    {
      label: t('navigation.sections.main', 'PRINCIPAL'),
      items: [
        { icon: <LayoutDashboard className="mr-3 h-4 w-4" />, text: t('navigation.dashboard', 'Dashboard'), path: "/" },
        { icon: <PlusCircle className="mr-3 h-4 w-4" />, text: t('navigation.transactions', 'Transações'), path: "/transactions" },
        { icon: <BarChart3 className="mr-3 h-4 w-4" />, text: t('navigation.reports', 'Relatórios'), path: "/reports" },
      ]
    },
    {
      label: t('navigation.sections.billing', 'ASSINATURA'),
      items: [
        { icon: <DollarSign className="mr-3 h-4 w-4" />, text: t('navigation.billing_settings', 'Minha Assinatura'), path: "/billing/settings" },
        { icon: <CreditCard className="mr-3 h-4 w-4" />, text: t('navigation.invoices', 'Faturas'), path: "/billing/invoices" },
      ]
    },
    {
      label: t('navigation.sections.settings', 'CONFIGURAÇÕES'),
      items: [
        { icon: <CreditCard className="mr-3 h-4 w-4" />, text: t('navigation.payment_methods', 'Formas de Pagamento'), path: "/payment-methods" },
        { icon: <Tag className="mr-3 h-4 w-4" />, text: t('navigation.categories', 'Categorias'), path: "/categories" },
        { icon: <CalendarDays className="mr-3 h-4 w-4" />, text: t('navigation.reminders', 'Lembretes'), path: "/reminders" },
        { icon: <Settings className="mr-3 h-4 w-4" />, text: t('navigation.settings', 'Configurações'), path: "/settings" },
      ]
    }
  ];

  // Menu items do admin
  const adminMenuItems: MenuGroup[] = [
    {
      label: t('navigation.sections.admin', 'ADMINISTRAÇÃO'),
      items: [
        { icon: <Shield className="mr-3 h-4 w-4" />, text: t('navigation.admin_dashboard', 'Dashboard Admin'), path: "/admin" },
        { icon: <Users className="mr-3 h-4 w-4" />, text: t('navigation.users', 'Usuários'), path: "/admin/users" },
        { icon: <DollarSign className="mr-3 h-4 w-4" />, text: t('navigation.billing', 'Pagamentos'), path: "/admin/billing" },
        { icon: <Search className="mr-3 h-4 w-4" />, text: t('navigation.manage_payments', 'Gerenciar Pagamentos'), path: "/admin/payments" },
        { icon: <CreditCard className="mr-3 h-4 w-4" />, text: t('navigation.payment_settings', 'Config. Pagamento'), path: "/admin/payment-settings" },
        { icon: <Settings className="mr-3 h-4 w-4" />, text: t('navigation.customize', 'Personalizar'), path: "/admin/customize" },
        { icon: <Wrench className="mr-3 h-4 w-4" />, text: t('navigation.maintenance', 'Manutenção'), path: "/admin/maintenance" }

      ]
    }
  ];

  // Combinar menus baseado no tipo de usuário
  const allMenuItems = shouldShowAdminItems 
    ? [...userMenuItems, ...adminMenuItems]
    : userMenuItems;

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };
  
  const sidebarBg = theme === 'light' ? 'bg-white/90 text-gray-900' : 'glass';

  const getMenuItemClass = (active: boolean) => {
    if (!active) return theme === 'light' ? 'text-gray-700 hover:bg-primary/10 hover:text-primary' : 'text-gray-400 hover:text-white';
    return theme === 'light'
      ? 'bg-primary/20 text-gray-900 font-semibold border-l-4 border-primary'
      : 'text-white bg-primary/10 menu-item-active';
  };

  return (
    <>
      {/* Mobile: Header compacto quando menu fechado */}
      <aside className={`${sidebarBg} ${isSidebarOpen ? 'hidden' : 'block'} lg:hidden w-full z-10 ${shouldApplyAdminOffset ? 'sidebar-admin-offset' : ''}`}>
        <div className="p-5 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <div className="w-[230px] h-[60px] rounded-lg mr-3 overflow-hidden relative">
                {/* Logo anterior durante transição */}
                {prevLogoUrl && (
                  <img 
                    src={prevLogoUrl} 
                    alt="Logo" 
                    className="object-contain w-[230px] h-[60px] absolute inset-0 transition-opacity duration-200"
                    style={{ maxWidth: 230, maxHeight: 60, opacity: logoUrl ? 0 : 1 }}
                  />
                )}
                {/* Logo atual */}
                {logoUrl && (
                  <img 
                    src={logoUrl} 
                    alt="Logo" 
                    className="object-contain w-[230px] h-[60px] transition-opacity duration-200"
                    style={{ maxWidth: 230, maxHeight: 60 }}
                  />
                )}
                {/* Fallback apenas quando não há logo customizado E não está carregando */}
                {!isInitialLoad && hasCustomLogo === false && (
                  <LayoutDashboard className="h-5 w-5 text-white" />
                )}
              </div>
              {/* Texto padrão apenas quando confirmado que não há logo customizado */}
              {!isInitialLoad && hasCustomLogo === false && (
                <h1 className="text-2xl font-space font-bold text-white tracking-wide">
                  Finance<span className="text-secondary">Hub</span>
                </h1>
              )}
            </div>
            <Button 
              variant="ghost"
              size="icon"
              className={theme === 'light' ? 'text-gray-700' : 'text-white'}
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
          <motion.aside 
            className={`${sidebarBg} w-80 z-10 relative flex flex-col h-full`}
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              duration: 0.3
            }}
          >
            {/* Header com botão fechar */}
            <div className="p-5 pb-0 flex-shrink-0">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center">
                  <div className="w-[230px] h-[60px] rounded-lg mr-3 overflow-hidden relative">
                    {/* Logo anterior durante transição */}
                    {prevLogoUrl && (
                      <img 
                        src={prevLogoUrl} 
                        alt="Logo" 
                        className="object-contain w-[230px] h-[60px] absolute inset-0 transition-opacity duration-200"
                        style={{ maxWidth: 230, maxHeight: 60, opacity: logoUrl ? 0 : 1 }}
                      />
                    )}
                    {/* Logo atual */}
                    {logoUrl && (
                      <img 
                        src={logoUrl} 
                        alt="Logo" 
                        className="object-contain w-[230px] h-[60px] transition-opacity duration-200"
                        style={{ maxWidth: 230, maxHeight: 60 }}
                      />
                    )}
                    {/* Fallback apenas quando não há logo customizado E não está carregando */}
                    {!isInitialLoad && hasCustomLogo === false && (
                      <LayoutDashboard className="h-5 w-5 text-white" />
                    )}
                  </div>
                  {/* Texto padrão apenas quando confirmado que não há logo customizado */}
                  {!isInitialLoad && hasCustomLogo === false && (
                    <h1 className="text-2xl font-space font-bold text-white tracking-wide">
                      Finance<span className="text-secondary">Hub</span>
                    </h1>
                  )}
                </div>
                <Button 
                  variant="ghost"
                  size="icon"
                  className={theme === 'light' ? 'text-gray-700' : 'text-white'}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </div>
            </div>
            
            {/* Conteúdo do menu overlay */}
            <div className="flex-1 overflow-y-auto hide-scrollbar p-5 pt-0">
              {allMenuItems.map((group, groupIndex) => (
                <div key={groupIndex} className="mb-8">
                  <div className="mb-5">
                    <span className="text-xs font-orbitron text-gray-400 tracking-wider">{group.label}</span>
                  </div>
                  <nav>
                    <ul className="space-y-3">
                      {group.items.map((item, itemIndex) => (
                        <motion.li key={itemIndex} whileHover={{ x: 5 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            variant="ghost"
                            className={`w-full justify-start ${getMenuItemClass(isActive(item.path))}`}
                            onClick={() => {
                              navigate(item.path);
                              if (isSidebarOpen) setIsSidebarOpen(false);
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
              {/* Bloco usuário, logout e versão no mobile */}
              <div className="mt-8">
                <div className={`glass-card neon-border p-4 rounded-xl ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{userData?.nome || "Usuário"}</p>
                      <p className={`text-xs truncate ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>{userData?.email || "usuario@exemplo.com"}</p>
                    </div>
                    <ThemeToggleSimple />
                  </div>
                  <Button 
                    variant="outline" 
                    className={`w-full mt-3 ${theme === 'light' ? 'bg-gray-100 text-gray-900 border-gray-300 hover:bg-gray-200 hover:text-primary' : 'bg-dark hover:bg-primary/20 text-gray-300 hover:text-white'}`}
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
                    <LogOut className={`mr-2 h-4 w-4 ${theme === 'light' ? 'text-gray-500' : 'text-gray-300'}`} /> 
                    {t('navigation.logout', 'Sair')}
                  </Button>
                </div>
                <div className="pt-1 w-full text-center pb-2">
                  <VersionDisplay />
                </div>
              </div>
            </div>
          </motion.aside>
        </div>
      )}

      {/* Desktop: Sidebar normal */}
      <aside className={`${sidebarBg} hidden lg:flex lg:flex-col w-64 z-10 lg:fixed h-screen min-h-screen ${shouldApplyAdminOffset ? 'lg:top-24' : ''}`}
             style={shouldApplyAdminOffset ? { 
               top: '75px', 
               height: 'calc(100vh - 75px)'
             } : { minHeight: '100vh' }}>
        {/* Header fixo do FinanceHub */}
        <div className="p-5 pb-0 flex-shrink-0">
          <div className="flex items-center justify-start mb-8">
            <div className="flex items-center">
              <div className={`flex items-center justify-center w-[230px] h-[60px] rounded-lg shadow-neon mr-3 overflow-hidden pr-1 relative`}>
                {/* Logo anterior durante transição */}
                {prevLogoUrl && (
                  <img 
                    src={prevLogoUrl} 
                    alt="Logo" 
                    className="object-contain w-[230px] h-[60px] absolute inset-0 transition-opacity duration-200"
                    style={{ maxWidth: 230, maxHeight: 60, opacity: logoUrl ? 0 : 1 }}
                  />
                )}
                {/* Logo atual */}
                {logoUrl && (
                  <img 
                    src={logoUrl} 
                    alt="Logo" 
                    className="object-contain w-[230px] h-[60px] transition-opacity duration-200"
                    style={{ maxWidth: 230, maxHeight: 60 }}
                  />
                )}
                {/* Fallback apenas quando confirmado que não há logo customizado */}
                {!isInitialLoad && hasCustomLogo === false && (
                  <div className="flex items-center">
                    <span className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon">
                      <LayoutDashboard className="h-5 w-5 text-white" />
                    </span>
                    <h1 className="text-2xl font-space font-bold text-white tracking-wide ml-3">
                      Finance<span className="text-secondary">Hub</span>
                    </h1>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Conteúdo do menu com scroll */}
        <div className="ml-2 flex-1 overflow-y-auto hide-scrollbar p-4 pt-0">
          {allMenuItems.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-2">
              <div className="mb-2">
                <span className="text-xs font-orbitron text-gray-400 tracking-wider">{group.label}</span>
              </div>
              <nav>
                <ul className="space-y-3">
                  {group.items.map((item, itemIndex) => (
                    <motion.li key={itemIndex} whileHover={{ x: 5 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="ghost"
                        className={`w-full justify-start ${getMenuItemClass(isActive(item.path))}`}
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
        </div>
        {/* Rodapé fixo com usuário, logout e versão */}
        <div className="p-2 border-border">
          <div className={`glass-card neon-border p-4 rounded-xl ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{userData?.nome || "Usuário"}</p>
                <p className={`text-xs truncate ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>{userData?.email || "usuario@exemplo.com"}</p>
              </div>
              <ThemeToggleSimple />
            </div>
            <Button 
              variant="outline" 
              className={`w-full mt-3 ${theme === 'light' ? 'bg-gray-100 text-gray-900 border-gray-300 hover:bg-gray-200 hover:text-primary' : 'bg-dark hover:bg-primary/20 text-gray-300 hover:text-white'}`}
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
              <LogOut className={`mr-2 h-4 w-4 ${theme === 'light' ? 'text-gray-500' : 'text-gray-300'}`} /> 
              {t('navigation.logout', 'Sair')}
            </Button>
          </div>
          <div className={`pt-0 w-full text-center ${shouldApplyAdminOffset ? 'pb-16' : 'pb-2'}`}>
            <VersionDisplay />
          </div>

        </div>
      </aside>
    </>
  );
}

export default Sidebar;