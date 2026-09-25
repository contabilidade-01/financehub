import { ReactNode, useState, type CSSProperties } from "react";
import Sidebar from "@/components/shared/Sidebar";
import { BottomNav } from "@/components/shared/BottomNav";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { User } from "@shared/schema";
import AdminStickyHeader from "@/components/admin/AdminStickyHeader";
import { GuidedTourModal } from "@/components/shared/GuidedTourModal";
import { ExpiringSoonBanner } from "@/components/subscription/ExpiringSoonBanner";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: userData } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    enabled: !!user && isAuthenticated,
  });

  // Verificar se é admin ou se há impersonificação ativa
  const isDirectAdmin = userData?.tipo_usuario === 'super_admin';
  const isImpersonating = userData && 'isImpersonating' in userData && userData.isImpersonating;
  const shouldShowAdminHeader = !!(isDirectAdmin || isImpersonating);

  return (
    <div
      className={cn("min-h-screen bg-background", shouldShowAdminHeader && "pt-[var(--admin-header-h)]")}
      style={{ "--admin-header-h": "76px" } as CSSProperties}
    >
      {/* Cabeçalho Administrativo fixo - para super admins ou durante impersonificação */}
      {shouldShowAdminHeader && <AdminStickyHeader userData={userData as any} />}

      <Sidebar mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} />

      {/* pb no mobile reserva espaço para a barra inferior + área segura */}
      <main className="min-w-0 px-4 pt-4 pb-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:pt-6 lg:ml-64 lg:px-8 lg:pb-8">
        <div className="mx-auto w-full max-w-7xl">
          <ExpiringSoonBanner />
          {children}
        </div>
      </main>
      <BottomNav onOpenMenu={() => setMobileMenuOpen(true)} menuOpen={mobileMenuOpen} />
      <GuidedTourModal />
    </div>
  );
}
