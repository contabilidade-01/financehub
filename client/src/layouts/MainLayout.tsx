import { ReactNode } from "react";
import Sidebar from "@/components/shared/Sidebar";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { User } from "@shared/schema";
import AdminStickyHeader from "@/components/admin/AdminStickyHeader";
import { GuidedTourModal } from "@/components/shared/GuidedTourModal";
import { ExpiringSoonBanner } from "@/components/subscription/ExpiringSoonBanner";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, user } = useAuth();

  const { data: userData } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    enabled: !!user && isAuthenticated,
  });

  // Verificar se é admin ou se há impersonificação ativa
  const isDirectAdmin = userData?.tipo_usuario === 'super_admin';
  const isImpersonating = userData && 'isImpersonating' in userData && userData.isImpersonating;
  const shouldShowAdminHeader = isDirectAdmin || isImpersonating;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Cabeçalho Administrativo Sticky - para super admins ou durante impersonificação */}
      {shouldShowAdminHeader && <AdminStickyHeader userData={userData as any} />}
      
      <Sidebar />
      
      <motion.main
        className={`flex-1 lg:ml-64 p-4 md:p-6 ${shouldShowAdminHeader ? 'pt-6 lg:pt-24' : 'pt-4 lg:pt-6'}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-7xl mx-auto">
          <ExpiringSoonBanner />
          {children}
        </div>
      </motion.main>
      <GuidedTourModal />
    </div>
  );
}
