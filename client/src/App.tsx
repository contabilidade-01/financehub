import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { NotificationsProvider } from "@/hooks/use-notifications";
import { AutoThemeProvider } from "@/components/AutoThemeProvider";
import { User } from "@shared/schema";
import { ExpiredSubscriptionOverlay } from "@/components/subscription/ExpiredSubscriptionOverlay";
import { LocalizationProvider } from "@/contexts/LocalizationContext";
import { SystemConfigProvider, useSystemConfig } from "@/contexts/SystemConfigContext";
import { updateAllMetadata } from "@/utils/update-metadata";
import { useEffect } from "react";

interface SetupStatus {
  setupMode: boolean;
  message?: string;
}

// Pages
import Dashboard from "@/pages/dashboard";
import Transactions from "@/pages/transactions";
import Categories from "@/pages/categories";
import Settings from "@/pages/settings";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Login from "@/pages/login";
import Register from "@/pages/register";
import NotFound from "@/pages/not-found";
import Wallet from "@/pages/wallet";
import Reports from "@/pages/reports";
import Reminders from "@/pages/reminders";
import PaymentMethods from "@/pages/payment-methods";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminLgpd from "@/pages/admin/lgpd";
import LgpdConsent from "@/components/LgpdConsent";
import DatabasePage from "@/pages/admin/database";
import CancelSubscription from "@/pages/subscription/cancel";
import RenewSubscription from "@/pages/subscription/renew";
import SubscriptionExpired from "@/pages/subscription-expired";
import SetupWizard from "@/pages/setup";
import MainLayout from "@/layouts/MainLayout";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import AdminStickyHeader from "@/components/admin/AdminStickyHeader";
import CustomizePage from "@/pages/admin/customize";
import LanguageSettings from "@/pages/admin/LanguageSettings";
import MaintenancePage from "@/pages/admin/maintenance";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { useTranslation } from "@/contexts/LocalizationContext";
import CheckoutPage from "@/pages/billing/checkout";
import BillingSuccessPage from "@/pages/billing/success";
import InvoicesPage from "@/pages/billing/invoices";
import BillingSettingsPage from "@/pages/billing/settings";
import AdminBillingDashboard from "@/pages/admin/billing-dashboard";
import AdminAssinaturas from "@/pages/admin/assinaturas";
import PaymentSettingsPage from "@/pages/admin/payment-settings";
import AdminPaymentsPage from "@/pages/admin/payments";
import ExternalCheckout from "@/pages/checkout/ExternalCheckout";
import PjRouter from "@/pages/pj/PjRouter";
import MetasPage from "@/pages/metas";
import ContasPagarPage from "@/pages/contas-pagar";
import ContasCartoesPage from "@/pages/contas-cartoes";
import ImportarLancamentos from "@/pages/importar";
import FluxoProjetadoPF from "@/pages/fluxo-projetado";
import ReembolsosPage from "@/pages/reembolsos";

function Router() {
  const [location] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isSubscriptionExpired, hasActiveAccess, expirationDate } = useSubscriptionStatus();
  const { t } = useTranslation();
  const { config } = useSystemConfig();

  // Atualizar metadados HTML quando config mudar
  useEffect(() => {
    updateAllMetadata(config);
  }, [config]);

  const { data: userData } = useQuery<User>({
    queryKey: ["/api/users/profile"],
    enabled: !!user && isAuthenticated,
  });

  // Verificar status do setup
  const { data: setupStatus, error: setupError, isLoading: setupLoading } = useQuery<SetupStatus>({
    queryKey: ["/api/setup/status"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isSetupMode = setupStatus?.setupMode === true;

  // Debug logs
  console.log('🔍 Setup Debug:', {
    setupStatus,
    setupError,
    setupLoading,
    isSetupMode,
    location
  });

  // Se houver erro na API, assumir que não está em modo setup
  if (setupError) {
    console.warn('⚠️ Erro ao verificar status do setup:', setupError);
  }

  // Show loading state while checking authentication or setup status
  if (isLoading || setupLoading) {
    return <LoadingScreen />;
  }

  // Handle unauthenticated users
  let isPublicRoute =
    location === "/" ||
    location === "/register" ||
    location === "/forgot-password" ||
    location === "/reset-password" ||
    location === "/subscription-expired" ||
    location.startsWith("/checkout/plans");

  // Adicionar /setup apenas se estiver em modo setup
  if (isSetupMode) {
    isPublicRoute = isPublicRoute || location === "/setup";
  }
  
  if (!isAuthenticated && !isPublicRoute) {
    // Don't redirect, just show login
    return (
      <Switch>
        <Route path="*" component={Login} />
      </Switch>
    );
  }

  return (
    <>
    <LgpdConsent />
    <AnimatePresence mode="wait">
      <Switch key={location}>
        {/* Checkout externo precisa existir logado ou deslogado (link do Asaas) */}
        <Route path="/checkout/plans" component={ExternalCheckout} />
        {!isAuthenticated ? (
          <>
            <Route path="/" component={Login} />
            <Route path="/register" component={Register} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/subscription-expired" component={SubscriptionExpired} />
            {isSetupMode && <Route path="/setup" component={SetupWizard} />}
          </>
        ) : (
          <>
            {/* Expired Subscription Overlay */}
            {isAuthenticated && isSubscriptionExpired && !hasActiveAccess && !location.startsWith("/subscription/renew") && !location.startsWith("/billing/checkout") && (
              <ExpiredSubscriptionOverlay 
                expirationDate={expirationDate ? expirationDate.toString() : undefined} 
              />
            )}
            
            <Route path="/">
              {(userData as any)?.tipo_pessoa === 'juridica'
                ? <Redirect to="/p/dashboard" />
                : <MainLayout><Dashboard /></MainLayout>}
            </Route>
            <Route path="/transactions">
              <MainLayout>
                <Transactions />
              </MainLayout>
            </Route>
            <Route path="/categories">
              <MainLayout>
                <Categories />
              </MainLayout>
            </Route>
            <Route path="/settings">
              <MainLayout>
                <Settings />
              </MainLayout>
            </Route>
            <Route path="/wallet">
              <MainLayout>
                <Wallet />
              </MainLayout>
            </Route>
            <Route path="/reports">
              <MainLayout>
                <Reports />
              </MainLayout>
            </Route>
            <Route path="/fluxo-projetado">
              <MainLayout>
                <FluxoProjetadoPF />
              </MainLayout>
            </Route>
            <Route path="/reminders">
              <MainLayout>
                <Reminders />
              </MainLayout>
            </Route>
            <Route path="/payment-methods">
              <MainLayout>
                <PaymentMethods />
              </MainLayout>
            </Route>
            <Route path="/metas">
              <MainLayout>
                <MetasPage />
              </MainLayout>
            </Route>
            <Route path="/contas-pagar">
              <MainLayout>
                <ContasPagarPage />
              </MainLayout>
            </Route>
            <Route path="/contas-cartoes">
              <MainLayout>
                <ContasCartoesPage />
              </MainLayout>
            </Route>
            <Route path="/reembolsos">
              <MainLayout>
                <ReembolsosPage />
              </MainLayout>
            </Route>
            <Route path="/importar">
              <MainLayout>
                <ImportarLancamentos />
              </MainLayout>
            </Route>
            <Route path="/subscription/cancel">
              <MainLayout>
                <CancelSubscription />
              </MainLayout>
            </Route>
            <Route path="/subscription/renew">
              <MainLayout>
                <RenewSubscription />
              </MainLayout>
            </Route>
            <Route path="/admin">
              <MainLayout>
                <AdminDashboard />
              </MainLayout>
            </Route>
            <Route path="/admin/dashboard">
              <MainLayout>
                <AdminDashboard />
              </MainLayout>
            </Route>
            <Route path="/admin/users">
              <MainLayout>
                <AdminUsers />
              </MainLayout>
            </Route>
            <Route path="/admin/lgpd">
              <MainLayout>
                <AdminLgpd />
              </MainLayout>
            </Route>
            <Route path="/admin/database">
              <MainLayout>
                <DatabasePage />
              </MainLayout>
            </Route>
            <Route path="/admin/customize">
              <MainLayout>
                <CustomizePage />
              </MainLayout>
            </Route>
            <Route path="/admin/language-settings">
              <MainLayout>
                <LanguageSettings />
              </MainLayout>
            </Route>
            <Route path="/admin/maintenance">
              <MainLayout>
                <MaintenancePage />
              </MainLayout>
            </Route>
            <Route path="/admin/payment-settings">
              <MainLayout>
                <PaymentSettingsPage />
              </MainLayout>
            </Route>
            <Route path="/admin/billing">
              <MainLayout>
                <AdminBillingDashboard />
              </MainLayout>
            </Route>
            <Route path="/admin/assinaturas">
              <MainLayout>
                <AdminAssinaturas />
              </MainLayout>
            </Route>
            <Route path="/admin/payments">
              <MainLayout>
                <AdminPaymentsPage />
              </MainLayout>
            </Route>
            <Route path="/billing/checkout">
              <MainLayout>
                <CheckoutPage />
              </MainLayout>
            </Route>
            <Route path="/billing/success">
              <MainLayout>
                <BillingSuccessPage />
              </MainLayout>
            </Route>
            <Route path="/billing/invoices">
              <MainLayout>
                <InvoicesPage />
              </MainLayout>
            </Route>
            <Route path="/billing/settings">
              <MainLayout>
                <BillingSettingsPage />
              </MainLayout>
            </Route>

            {/* PJ — Rotas empresariais */}
            <Route path="/p/:rest*">
              <MainLayout>
                <PjRouter />
              </MainLayout>
            </Route>
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocalizationProvider>
          <SystemConfigProvider>
            <NotificationsProvider>
              <AutoThemeProvider showLoadingIndicator={true}>
                <ImpersonationBanner />
                <Toaster />
                <Router />
              </AutoThemeProvider>
            </NotificationsProvider>
          </SystemConfigProvider>
        </LocalizationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
