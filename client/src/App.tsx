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
import { useEffect, lazy, Suspense } from "react";

interface SetupStatus {
  setupMode: boolean;
  message?: string;
}

// Componentes de layout/infra — eager (fazem parte do primeiro paint).
import LgpdConsent from "@/components/LgpdConsent";
import MainLayout from "@/layouts/MainLayout";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import AdminStickyHeader from "@/components/admin/AdminStickyHeader";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { useTranslation } from "@/contexts/LocalizationContext";

// Páginas de entrada — eager (primeira tela / fallback), sem custo de code-split.
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

// Demais páginas — lazy (code-splitting por rota): cada tela baixa só quando
// acessada, reduzindo muito o bundle inicial (ganho de performance no mobile).
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Transactions = lazy(() => import("@/pages/transactions"));
const Categories = lazy(() => import("@/pages/categories"));
const Settings = lazy(() => import("@/pages/settings"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const Register = lazy(() => import("@/pages/register"));
const Wallet = lazy(() => import("@/pages/wallet"));
const Reports = lazy(() => import("@/pages/reports"));
const Reminders = lazy(() => import("@/pages/reminders"));
const PaymentMethods = lazy(() => import("@/pages/payment-methods"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminLgpd = lazy(() => import("@/pages/admin/lgpd"));
const DatabasePage = lazy(() => import("@/pages/admin/database"));
const CancelSubscription = lazy(() => import("@/pages/subscription/cancel"));
const RenewSubscription = lazy(() => import("@/pages/subscription/renew"));
const SubscriptionExpired = lazy(() => import("@/pages/subscription-expired"));
const SetupWizard = lazy(() => import("@/pages/setup"));
const CustomizePage = lazy(() => import("@/pages/admin/customize"));
const LanguageSettings = lazy(() => import("@/pages/admin/LanguageSettings"));
const MaintenancePage = lazy(() => import("@/pages/admin/maintenance"));
const CheckoutPage = lazy(() => import("@/pages/billing/checkout"));
const BillingSuccessPage = lazy(() => import("@/pages/billing/success"));
const InvoicesPage = lazy(() => import("@/pages/billing/invoices"));
const BillingSettingsPage = lazy(() => import("@/pages/billing/settings"));
const AdminBillingDashboard = lazy(() => import("@/pages/admin/billing-dashboard"));
const AdminAssinaturas = lazy(() => import("@/pages/admin/assinaturas"));
const FeatureFlagsPage = lazy(() => import("@/pages/admin/feature-flags"));
const SimularWhatsappPage = lazy(() => import("@/pages/admin/simular-whatsapp"));
const OrquestradorPage = lazy(() => import("@/pages/admin/orquestrador"));
const PaymentSettingsPage = lazy(() => import("@/pages/admin/payment-settings"));
const AdminPaymentsPage = lazy(() => import("@/pages/admin/payments"));
const ExternalCheckout = lazy(() => import("@/pages/checkout/ExternalCheckout"));
const PjRouter = lazy(() => import("@/pages/pj/PjRouter"));
const MetasPage = lazy(() => import("@/pages/metas"));
const ContasPagarPage = lazy(() => import("@/pages/contas-pagar"));
const ContasCartoesPage = lazy(() => import("@/pages/contas-cartoes"));
const CartoesCreditoPage = lazy(() => import("@/pages/cartoes-credito"));
const MensalidadesPage = lazy(() => import("@/pages/mensalidades"));
const ImportarLancamentos = lazy(() => import("@/pages/importar"));
const FluxoProjetadoPF = lazy(() => import("@/pages/fluxo-projetado"));
const ReembolsosPage = lazy(() => import("@/pages/reembolsos"));
const VendasPF = lazy(() => import("@/pages/vendas/pf"));
const VendasPJ = lazy(() => import("@/pages/vendas/pj"));

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
    location.startsWith("/assinar") ||
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
    <Suspense fallback={<LoadingScreen />}>
    <AnimatePresence mode="wait">
      <Switch key={location}>
        {/* Checkout externo precisa existir logado ou deslogado (link do Asaas) */}
        <Route path="/checkout/plans" component={ExternalCheckout} />
        {/* Páginas de vendas (marketing) — funcionam logado ou deslogado */}
        <Route path="/assinar/pf" component={VendasPF} />
        <Route path="/assinar/pj" component={VendasPJ} />
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
            <Route path="/cartoes">
              <MainLayout>
                <CartoesCreditoPage />
              </MainLayout>
            </Route>
            <Route path="/mensalidades">
              <MainLayout>
                <MensalidadesPage />
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
            <Route path="/admin/feature-flags">
              <MainLayout>
                <FeatureFlagsPage />
              </MainLayout>
            </Route>
            <Route path="/admin/simular-whatsapp">
              <MainLayout>
                <SimularWhatsappPage />
              </MainLayout>
            </Route>
            <Route path="/admin/orquestrador">
              <MainLayout>
                <OrquestradorPage />
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
    </Suspense>
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
