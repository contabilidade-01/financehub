import type { Express } from "express";
import { Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, listIngestionEvents, jaConsentiuLgpd, registrarConsentimentoLgpd, listarConsentimentosLgpd, LGPD_VERSAO_ATUAL } from "./storage";
import { auth } from "./middleware/auth.middleware";
import { apiKeyAuth } from "./middleware/apiKey.middleware";
import { combinedAuth } from "./middleware/combinedAuth.middleware";
import { authLimiter, forgotPasswordLimiter, resetPasswordLimiter } from "./middleware/security.middleware";
import * as passwordResetController from "./controllers/password-reset.controller";
import {
  checkImpersonation,
  requireSuperAdmin,
} from "./middleware/adminAuth.middleware";
import { localizationMiddleware } from "./middleware/localization.middleware";
import { setupSwagger } from "./swagger";
import { initializeWebSocketServer } from "./websocket";
import { WahaWebhookController } from "./controllers/waha-webhook.controller";
import { WahaSessionWebhooksController } from "./controllers/waha-session-webhooks.controller";
import * as localizationController from "./controllers/localization.controller";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import postgres from 'postgres';

// Garante que o diretório public/ existe
const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Configuração do multer para upload do logo
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Em produção, os logos vão para dist/public, em desenvolvimento para public/
      const isProduction = process.env.NODE_ENV === 'production';
      const publicPath = isProduction ? 'dist/public' : 'public';
      const destination = path.resolve(process.cwd(), publicPath);
      
      // Garantir que o diretório existe
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true, mode: 0o755 });
      }
      
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      // Salva como logo-light ou logo-dark conforme o campo
      if (file.fieldname === 'logo_light') {
        cb(null, file.mimetype === 'image/svg+xml' ? 'logo-light.svg' : 'logo-light.png');
      } else if (file.fieldname === 'logo_dark') {
        cb(null, file.mimetype === 'image/svg+xml' ? 'logo-dark.svg' : 'logo-dark.png');
      } else {
        cb(null, file.originalname);
      }
    }
  }),
  limits: { fileSize: 1024 * 1024 }, // 1MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/svg+xml') {
      cb(null, true);
    } else {
      cb(new Error('Apenas PNG ou SVG são permitidos'));
    }
  }
});

// Controllers
import * as userController from "./controllers/user.controller";
import * as transactionController from "./controllers/transaction.controller";
import * as categoryController from "./controllers/category.controller";
import * as walletController from "./controllers/wallet.controller";
import * as apiTokenController from "./controllers/apiToken.controller";
import * as apiGuideController from "./controllers/apiGuide.controller";
import * as reminderController from "./controllers/reminder.controller";
import * as adminController from "./controllers/admin.controller";
import * as chartController from "./controllers/chart-svg.controller";
import * as chartBarController from "./controllers/chart.controller";
import * as reportController from "./controllers/report-image.controller";
import * as paymentMethodController from "./controllers/payment-method.controller";
import * as paymentSettingsController from "./controllers/payment-settings.controller";
import { AnalyticsController } from "./controllers/analytics.controller";
import { SubscriptionController } from "./controllers/subscription.controller";
import * as databaseController from "./controllers/database.controller";
import * as setupController from "./controllers/setup.controller";
import * as welcomeMessagesController from "./controllers/welcome-messages.controller";
import * as wahaConfigController from "./controllers/waha-config.controller";
import * as notificationController from "./controllers/notification.controller";
import themesRouter from "./routes/themes";
import * as systemSettingsController from "./controllers/system-settings.controller";
import { MaintenanceController } from "./controllers/maintenance.controller";
// Asaas Payment Integration
import * as subscriptionPlanController from "./controllers/subscription-plan.controller";
import * as billingController from "./controllers/billing.controller";
import * as asaasWebhookController from "./controllers/asaas-webhook.controller";
import { checkActiveSubscription, requireNoSubscription } from "./middleware/checkSubscription.middleware";

export async function registerRoutes(app: Express): Promise<Server> {
  // Configurar documentação Swagger
  setupSwagger(app);
  
  // Aplicar middleware de localização em todas as rotas
  app.use(localizationMiddleware);

  // Chart Image Generation (DEVE VIR PRIMEIRO para evitar interceptação)
  app.get("/api/charts/bar", combinedAuth, chartController.generateBarChartSVG);
  app.get("/api/charts/pizza", combinedAuth, chartController.generatePieChartSVG);
  app.get(
    "/api/charts/bar2",
    combinedAuth,
    chartBarController.generateBarChartImage,
  );
  app.get(
    "/api/charts/report",
    combinedAuth,
    reportController.generateWeeklyReportImage,
  );
  app.get("/api/charts/download/:filename", chartController.downloadChartFile);

  // PDF Reports (DEVE VIR PRIMEIRO para evitar interceptação)
  const pdfController = await import("./controllers/pdf-simple.controller");
  app.get(
    "/api/reports/pdf",
    (req, res, next) => {
      console.log("=== ROTA PDF INTERCEPTADA ===");
      next();
    },
    combinedAuth,
    pdfController.generateSimpleReportPDF,
  );
  app.get("/api/reports/download/:filename", async (req, res) => {
    const { downloadReportPDF } = await import("./controllers/pdf.controller");
    downloadReportPDF(req, res);
  });

  // Note: Using middleware already imported at the top from adminAuth.middleware.ts

  // Auth routes
  app.post("/api/auth/register", authLimiter, userController.register);
  app.post("/api/auth/login", authLimiter, userController.login);
  app.post("/api/auth/logout", userController.logout);
  app.post("/api/auth/forgot-password", forgotPasswordLimiter, passwordResetController.forgotPassword);
  app.get("/api/auth/reset-token", resetPasswordLimiter, passwordResetController.checkResetToken);
  app.post("/api/auth/reset-password", resetPasswordLimiter, passwordResetController.resetPassword);
  
  // Endpoint para verificação de sessão (usado pelo WebSocket)
  app.get("/api/auth/verify", auth, (req: Request, res: Response) => {
    try {
      if (req.user) {
        res.json({ 
          success: true, 
          user: req.user,
          message: 'Sessão válida' 
        });
      } else {
        res.status(401).json({ 
          success: false, 
          error: 'Usuário não autenticado' 
        });
      }
    } catch (error) {
      console.error('Erro na verificação de sessão:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor' 
      });
    }
  });
  
  app.get(
    "/api/auth/me",
    combinedAuth,
    checkImpersonation,
    userController.getCurrentUser,
  );

  // User routes
  app.get("/api/users/profile", combinedAuth, checkImpersonation, userController.getProfile);
  app.put("/api/users/profile", auth, checkImpersonation, userController.updateProfile);
  app.put("/api/users/password", auth, checkImpersonation, userController.updatePassword);

  // Wallet routes
  app.get(
    "/api/wallet/current",
    combinedAuth,
    checkImpersonation,
    walletController.getCurrentWallet,
  );
  app.put("/api/wallet/current", combinedAuth, checkImpersonation, walletController.updateWallet);

  // Transaction routes
  app.get(
    "/api/transactions",
    combinedAuth,
    checkImpersonation,
    transactionController.getTransactions,
  );
  app.get(
    "/api/transactions/recent",
    combinedAuth,
    checkImpersonation,
    transactionController.getRecentTransactions,
  );
  app.post(
    "/api/transactions",
    combinedAuth,
    checkImpersonation,
    transactionController.createTransaction,
  );
  app.get(
    "/api/transactions/:id",
    combinedAuth,
    checkImpersonation,
    transactionController.getTransaction,
  );
  app.put(
    "/api/transactions/:id",
    combinedAuth,
    checkImpersonation,
    transactionController.updateTransaction,
  );
  app.patch(
    "/api/transactions/:id",
    combinedAuth,
    checkImpersonation,
    transactionController.updateTransaction,
  ); // Adicionar suporte a PATCH
  app.delete(
    "/api/transactions/:id",
    combinedAuth,
    checkImpersonation,
    transactionController.deleteTransaction,
  );

  // Category routes
  app.get("/api/categories", combinedAuth, checkImpersonation, categoryController.getCategories);
  app.post("/api/categories", combinedAuth, checkImpersonation, categoryController.createCategory);
  app.get("/api/categories/:id", combinedAuth, checkImpersonation, categoryController.getCategory);
  app.put(
    "/api/categories/:id",
    combinedAuth,
    checkImpersonation,
    categoryController.updateCategory,
  );
  app.delete(
    "/api/categories/:id",
    combinedAuth,
    checkImpersonation,
    categoryController.deleteCategory,
  );

  // Payment Method routes
  app.get("/api/payment-methods", combinedAuth, checkImpersonation, paymentMethodController.getPaymentMethods);
  app.get("/api/payment-methods/global", paymentMethodController.getGlobalPaymentMethods);
  app.get("/api/payment-methods/totals", combinedAuth, checkImpersonation, paymentMethodController.getPaymentMethodTotals);
  app.post("/api/payment-methods", combinedAuth, checkImpersonation, paymentMethodController.createPaymentMethod);
  app.put(
    "/api/payment-methods/:id",
    combinedAuth,
    checkImpersonation,
    paymentMethodController.updatePaymentMethod,
  );
  app.delete(
    "/api/payment-methods/:id",
    combinedAuth,
    checkImpersonation,
    paymentMethodController.deletePaymentMethod,
  );

  // Rota duplicada removida - agora está no topo

  // Dashboard summary
  app.get(
    "/api/dashboard/summary",
    combinedAuth,
    checkImpersonation,
    transactionController.getDashboardSummary,
  );

  // API Tokens routes
  app.get("/api/tokens", auth, checkImpersonation, apiTokenController.getApiTokens);
  app.post("/api/tokens", auth, checkImpersonation, apiTokenController.createApiToken);
  app.get("/api/tokens/:id", auth, checkImpersonation, apiTokenController.getApiToken);
  app.put("/api/tokens/:id", auth, checkImpersonation, apiTokenController.updateApiToken);
  app.delete("/api/tokens/:id", auth, checkImpersonation, apiTokenController.deleteApiToken);
  app.post("/api/tokens/:id/rotate", auth, checkImpersonation, apiTokenController.rotateApiToken);

  // API Guide (documentação pública de uso da API)
  app.get("/api/api-guide", apiGuideController.getApiGuide);

  // Reminder routes
  app.get("/api/reminders", combinedAuth, checkImpersonation, reminderController.getReminders);
  app.post("/api/reminders", combinedAuth, checkImpersonation, reminderController.createReminder);
  app.get(
    "/api/reminders/calendar",
    combinedAuth,
    checkImpersonation,
    reminderController.getRemindersByDateRange,
  );
  app.get("/api/reminders/:id", combinedAuth, checkImpersonation, reminderController.getReminder);
  app.put(
    "/api/reminders/:id",
    combinedAuth,
    checkImpersonation,
    reminderController.updateReminder,
  );
  app.patch(
    "/api/reminders/:id",
    combinedAuth,
    checkImpersonation,
    reminderController.updateReminder,
  );
  app.delete(
    "/api/reminders/:id",
    combinedAuth,
    checkImpersonation,
    reminderController.deleteReminder,
  );

  // Subscription routes (legacy - manter para compatibilidade)
  app.post(
    "/api/subscription/cancel",
    combinedAuth,
    checkImpersonation,
    SubscriptionController.cancelSubscription,
  );
  app.get(
    "/api/subscription/status",
    combinedAuth,
    checkImpersonation,
    SubscriptionController.getSubscriptionStatus,
  );

  // ============================================
  // ASAAS PAYMENT INTEGRATION ROUTES
  // ============================================

  // Subscription Plans (Public - listar planos ativos)
  app.get("/api/subscription-plans", subscriptionPlanController.getActivePlans);
  app.get("/api/subscription-plans/:id", subscriptionPlanController.getPlanById);

  // Subscription Plans (Admin - CRUD completo)
  app.get(
    "/api/admin/subscription-plans",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    subscriptionPlanController.getAllPlans
  );
  app.post(
    "/api/admin/subscription-plans",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    subscriptionPlanController.createPlan
  );
  app.put(
    "/api/admin/subscription-plans/:id",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    subscriptionPlanController.updatePlan
  );
  app.delete(
    "/api/admin/subscription-plans/:id",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    subscriptionPlanController.deletePlan
  );

  // Admin Billing Dashboard Routes
  app.get(
    "/api/admin/billing/metrics",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    billingController.getBillingMetrics
  );
  app.get(
    "/api/admin/subscriptions",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    billingController.getAllSubscriptions
  );

  // Admin Payment Search & Management Routes
  app.get(
    "/api/admin/payments/search",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    billingController.searchPayments
  );
  app.get(
    "/api/admin/payments/:id",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    billingController.getPaymentDetails
  );
  app.post(
    "/api/admin/payments/:id/retry",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    billingController.retryPayment
  );

  // Billing & Checkout (User routes)

  // Rota pública para obter ambiente do Asaas (sandbox ou production)
  app.get("/api/billing/environment", billingController.getAsaasEnvironment);

  // Rota pública para validar token de checkout externo
  app.get("/api/billing/checkout/validate/:token", billingController.validateExternalCheckoutToken);

  // Checkout com suporte tanto para usuários autenticados quanto para checkout externo (com token)
  app.post(
    "/api/billing/checkout",
    (req, res, next) => {
      // Se houver checkoutToken no body, permitir acesso sem autenticação
      if (req.body.checkoutToken) {
        return next();
      }
      // Caso contrário, exigir autenticação normal
      combinedAuth(req, res, next);
    },
    (req, res, next) => {
      // Pular middleware de impersonation check se for checkout externo
      if (req.body.checkoutToken) {
        return next();
      }
      checkImpersonation(req, res, next);
    },
    (req, res, next) => {
      // Pular middleware de subscription check se for checkout externo
      if (req.body.checkoutToken) {
        return next();
      }
      requireNoSubscription(req, res, next);
    },
    billingController.checkout
  );
  app.get(
    "/api/billing/subscription",
    combinedAuth,
    checkImpersonation,
    billingController.getCurrentSubscription
  );
  app.get(
    "/api/billing/invoices",
    combinedAuth,
    checkImpersonation,
    billingController.getInvoices
  );
  app.get(
    "/api/billing/invoice/:id",
    combinedAuth,
    checkImpersonation,
    billingController.getInvoiceById
  );
  app.get(
    "/api/billing/payment-history",
    combinedAuth,
    checkImpersonation,
    billingController.getPaymentHistory
  );
  app.post(
    "/api/billing/cancel",
    combinedAuth,
    checkImpersonation,
    billingController.cancelSubscription
  );
  app.put(
    "/api/billing/update-card",
    combinedAuth,
    checkImpersonation,
    billingController.updateCreditCard
  );

  // Asaas Webhooks (Public - sem auth, mas validado internamente)
  app.post("/api/webhooks/asaas", asaasWebhookController.handleAsaasWebhook);

  // Asaas Webhooks Admin (Gerenciar webhooks recebidos)
  app.get(
    "/api/admin/webhooks",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    asaasWebhookController.listWebhooks
  );
  app.post(
    "/api/admin/webhooks/:id/retry",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    asaasWebhookController.retryWebhook
  );

  // ============================================

  // Notification routes - require super admin access
  app.post(
    "/api/notifications/send",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    notificationController.sendNotification,
  );
  app.post(
    "/api/notifications/broadcast",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    notificationController.broadcastNotificationToSuperAdmins,
  );
  app.post(
    "/api/notifications/test",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    notificationController.sendTestNotification,
  );

  // WAHA Webhook routes - sem autenticação para receber eventos externos
  app.post("/api/waha/webhook/:hash", WahaWebhookController.receiveWahaEvent); // Com hash de segurança
  app.post("/api/waha/webhook", WahaWebhookController.receiveWahaEvent); // Fallback sem hash
  app.get(
    "/api/waha/webhook/stats",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    WahaWebhookController.getWebhookStats,
  );

  // WAHA Session Webhooks routes - gerenciamento de webhooks por sessão
  app.get(
    "/api/admin/waha-sessions/:sessionName/webhook",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    WahaSessionWebhooksController.getSessionWebhook,
  );
  app.post(
    "/api/admin/waha-sessions/:sessionName/webhook/regenerate",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    WahaSessionWebhooksController.regenerateSessionWebhook,
  );
  app.patch(
    "/api/admin/waha-sessions/:sessionName/webhook/toggle",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    WahaSessionWebhooksController.toggleSessionWebhook,
  );
  app.get(
    "/api/admin/waha-session-webhooks",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    WahaSessionWebhooksController.listSessionWebhooks,
  );

  // Admin routes - require super admin access
  app.get(
    "/api/admin/stats",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.getAdminStats,
  );
  app.get(
    "/api/admin/recent-users",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.RecentUsersController.getRecentUsers,
  );
  app.get(
    "/api/admin/analytics",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    AnalyticsController.getAnalyticsData,
  );
  app.get(
    "/api/admin/users",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.getAdminUsers,
  );
  app.post(
    "/api/admin/users",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.createUser,
  );
  app.put(
    "/api/admin/users/:id",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.updateUser,
  );
  app.delete(
    "/api/admin/users/:id",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.deleteUser,
  );
  // Assinaturas — ciclo (mensal/trimestral/anual) + vencimento
  app.get("/api/admin/assinaturas", combinedAuth, checkImpersonation, requireSuperAdmin, adminController.getAssinaturas);
  app.post("/api/admin/assinaturas/:id/definir", combinedAuth, checkImpersonation, requireSuperAdmin, adminController.definirAssinatura);
  app.post("/api/admin/assinaturas/:id/renovar", combinedAuth, checkImpersonation, requireSuperAdmin, adminController.renovarAssinatura);
  app.post("/api/admin/assinaturas/:id/gerar-link", combinedAuth, checkImpersonation, requireSuperAdmin, adminController.gerarLinkCobranca);
  // Exportação CSV de relatórios administrativos
  app.get("/api/admin/export/users-csv", combinedAuth, checkImpersonation, requireSuperAdmin, adminController.exportUsersCsv);
  app.get("/api/admin/export/transactions-csv", combinedAuth, checkImpersonation, requireSuperAdmin, adminController.exportTransactionsCsv);
  app.post(
    "/api/admin/impersonate",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.impersonateUser,
  );
  app.post(
    "/api/admin/stop-impersonation",
    combinedAuth,
    checkImpersonation,
    adminController.stopImpersonation,
  );
  app.get(
    "/api/admin/impersonation-status",
    combinedAuth,
    checkImpersonation,
    adminController.getImpersonationStatus,
  );
  app.patch(
    "/api/admin/users/:id/status",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.updateUserStatus,
  );
  app.post(
    "/api/admin/users/:id/reset",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.resetUserData,
  );
  app.post(
    "/api/admin/reset-globals",
    combinedAuth,
    requireSuperAdmin,
    adminController.resetGlobals,
  );
  app.get(
    "/api/admin/audit-log",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    adminController.getAuditLog,
  );

  // Database management routes (super admin only)
  app.get(
    "/api/admin/database/tables",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    databaseController.getAllTables,
  );
  
  app.get(
    "/api/admin/database/ddl",
    combinedAuth,
    checkImpersonation,
    requireSuperAdmin,
    databaseController.generateDatabaseDDL,
  );

  // Setup routes (public access when SETUP=true)
  app.get("/api/setup/status", setupController.getSetupStatus);
  app.post("/api/setup/test-connection", setupController.testDatabaseConnection);
  app.post("/api/setup/save-db-url", setupController.saveDbUrl);
  app.post("/api/setup/create-admin", setupController.createAdmin);
  app.post("/api/setup/run", setupController.runSetup);
  app.post("/api/setup/finish", setupController.finishSetup);

  // Endpoint para upload dos logos (apenas superadmin)
  app.post('/api/admin/logo', combinedAuth, requireSuperAdmin, upload.fields([
    { name: 'logo_light', maxCount: 1 },
    { name: 'logo_dark', maxCount: 1 }
  ]), async (req, res) => {
    if (!req.files || (Object.keys(req.files).length === 0)) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    // Apenas upload, não salva nada no banco
    res.json({ success: true });
  });

  // Endpoint público para servir o logo customizado conforme o tema
  app.get('/api/logo', (req, res) => {
    const theme = req.query.theme === 'dark' ? 'dark' : 'light';
    
    // Em produção, os logos estão em dist/public, em desenvolvimento em public/
    const isProduction = process.env.NODE_ENV === 'production';
    const publicPath = isProduction ? 'dist/public' : 'public';
    
    // Tenta servir SVG primeiro, depois PNG
    const svgPath = path.resolve(process.cwd(), `${publicPath}/logo-${theme}.svg`);
    const pngPath = path.resolve(process.cwd(), `${publicPath}/logo-${theme}.png`);
    
    if (fs.existsSync(svgPath)) {
      res.sendFile(svgPath);
    } else if (fs.existsSync(pngPath)) {
      res.sendFile(pngPath);
    } else {
      res.status(404).json({ error: 'Logo não encontrado' });
    }
  });

  // Endpoint para deletar o logo customizado (apenas superadmin)
  app.delete('/api/admin/logo', combinedAuth, requireSuperAdmin, async (req, res) => {
    const theme = req.query.theme === 'dark' ? 'dark' : 'light';
    const exts = ['png', 'svg'];
    let removed = false;
    
    // Em produção, os logos estão em dist/public, em desenvolvimento em public/
    const isProduction = process.env.NODE_ENV === 'production';
    const publicPath = isProduction ? 'dist/public' : 'public';
    
    for (const ext of exts) {
      const filePath = path.resolve(process.cwd(), `${publicPath}/logo-${theme}.${ext}`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          removed = true;
        } catch (err) {
          console.error('Erro ao remover arquivo do logo:', err);
        }
      }
    }
    // Não remove nada do banco
    res.json({ success: true, removed });
  });

  // Welcome Messages endpoints (apenas superadmin)
  // LGPD — consentimento
  app.get("/api/lgpd/status", combinedAuth, async (req: any, res) => {
    try {
      const aceito = await jaConsentiuLgpd(req.user.id, LGPD_VERSAO_ATUAL);
      res.json({ aceito, versao: LGPD_VERSAO_ATUAL });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });
  app.post("/api/lgpd/aceitar", combinedAuth, async (req: any, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.ip || "").slice(0, 60);
      const ua = req.headers["user-agent"]?.toString();
      await registrarConsentimentoLgpd(req.user.id, LGPD_VERSAO_ATUAL, ip, ua);
      res.json({ ok: true, versao: LGPD_VERSAO_ATUAL });
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });
  app.get("/api/admin/lgpd/consentimentos", combinedAuth, requireSuperAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 200;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      res.json(await listarConsentimentosLgpd({ limit, offset }));
    } catch (e: any) { res.status(500).json({ error: e?.message }); }
  });

  // Log de ingestão por IA (diagnóstico de falhas: sem_credito × transitorio × bug)
  app.get("/api/admin/ingestion-events", combinedAuth, requireSuperAdmin, async (req, res) => {
    try {
      const resultado = req.query.resultado as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      const eventos = await listIngestionEvents({ resultado, limit, offset });
      res.json(eventos);
    } catch (e: any) {
      res.status(500).json({ error: "Erro ao listar eventos de ingestão", detail: e?.message });
    }
  });

  app.get("/api/admin/welcome-messages", combinedAuth, requireSuperAdmin, welcomeMessagesController.getWelcomeMessages);
  app.get("/api/admin/welcome-messages/:type", combinedAuth, requireSuperAdmin, welcomeMessagesController.getWelcomeMessageByType);
  app.put("/api/admin/welcome-messages/:type", combinedAuth, requireSuperAdmin, welcomeMessagesController.updateWelcomeMessage);
  app.post("/api/admin/welcome-messages", combinedAuth, requireSuperAdmin, welcomeMessagesController.createWelcomeMessage);

  // Endpoint para buscar mensagem processada para um usuário específico (com tags substituídas)
  app.get("/api/welcome-messages/:type/user/:userId", welcomeMessagesController.getProcessedWelcomeMessage);

  // Maintenance Routes (Super Admin only)
  app.get("/api/maintenance/categories", combinedAuth, requireSuperAdmin, MaintenanceController.getAllCategories);
  app.put("/api/maintenance/categories/:id", combinedAuth, requireSuperAdmin, MaintenanceController.updateCategoryColor);
  app.post("/api/maintenance/fix-category-colors", combinedAuth, requireSuperAdmin, MaintenanceController.fixCategoryColors);

  /**
   * @swagger
   * /api/system/settings:
   *   get:
   *     summary: Buscar todas as configurações do sistema
   *     description: Retorna todas as configurações personalizáveis do sistema (nome, slogan, email, etc). Rota pública.
   *     tags: [System Settings]
   *     responses:
   *       200:
   *         description: Configurações recuperadas com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     system_name:
   *                       type: object
   *                       properties:
   *                         value:
   *                           type: string
   *                         metadata:
   *                           type: object
   *       500:
   *         description: Erro ao buscar configurações
   */
  app.get("/api/system/settings", systemSettingsController.getSystemSettings);

  /**
   * @swagger
   * /api/admin/system/settings:
   *   put:
   *     summary: Atualizar configurações do sistema
   *     description: Permite que o Super Admin atualize configurações globais do sistema
   *     tags: [System Settings]
   *     security:
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               system_name:
   *                 type: string
   *                 example: "Meu Sistema Financeiro"
   *               system_name_short:
   *                 type: string
   *                 example: "meusistema"
   *               system_tagline:
   *                 type: string
   *                 example: "Gestão financeira simplificada"
   *               support_email:
   *                 type: string
   *                 format: email
   *                 example: "suporte@meusistema.com"
   *               system_url:
   *                 type: string
   *                 format: uri
   *                 example: "https://meusistema.com"
   *     responses:
   *       200:
   *         description: Configurações atualizadas com sucesso
   *       400:
   *         description: Dados inválidos
   *       401:
   *         description: Não autenticado
   *       403:
   *         description: Apenas Super Admin pode atualizar
   *       500:
   *         description: Erro ao atualizar configurações
   */
  app.put("/api/admin/system/settings", combinedAuth, requireSuperAdmin, systemSettingsController.updateSystemSettings);

  /**
   * @swagger
   * /api/admin/system/settings/{key}:
   *   get:
   *     summary: Buscar uma configuração específica
   *     description: Retorna uma configuração do sistema por chave
   *     tags: [System Settings]
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *         description: Chave da configuração
   *     responses:
   *       200:
   *         description: Configuração encontrada
   *       404:
   *         description: Configuração não encontrada
   *       500:
   *         description: Erro ao buscar configuração
   */
  app.get("/api/admin/system/settings/:key", combinedAuth, requireSuperAdmin, systemSettingsController.getSystemSetting);

  // Payment Settings endpoints (apenas superadmin)
  app.get("/api/admin/payment-settings", combinedAuth, requireSuperAdmin, paymentSettingsController.getPaymentSettings);
  app.put("/api/admin/payment-settings", combinedAuth, requireSuperAdmin, paymentSettingsController.updatePaymentSettings);
  app.post("/api/admin/payment-settings/test", combinedAuth, requireSuperAdmin, paymentSettingsController.testPaymentConnection);
  app.get("/api/admin/payment-settings/reveal", combinedAuth, requireSuperAdmin, paymentSettingsController.revealPaymentSettings);
  app.post("/api/admin/payment-settings/test-webhook", combinedAuth, requireSuperAdmin, paymentSettingsController.testWebhook);

  // WAHA Config endpoints (apenas superadmin)
  app.get("/api/admin/waha-config", combinedAuth, requireSuperAdmin, wahaConfigController.getWahaConfig);
  app.put("/api/admin/waha-config", combinedAuth, requireSuperAdmin, wahaConfigController.updateWahaConfig);
  app.post("/api/admin/waha-config/test", combinedAuth, requireSuperAdmin, wahaConfigController.testWahaConnection);
  app.get("/api/admin/waha-sessions", combinedAuth, requireSuperAdmin, wahaConfigController.getWahaSessions);
  
  // WAHA Session management endpoints (apenas superadmin)
  app.post("/api/admin/waha-sessions", combinedAuth, requireSuperAdmin, wahaConfigController.createWahaSession);
  app.put("/api/admin/waha-sessions/:sessionName", combinedAuth, requireSuperAdmin, wahaConfigController.updateWahaSession);
  app.post("/api/admin/waha-sessions/:sessionName/start", combinedAuth, requireSuperAdmin, wahaConfigController.startWahaSession);
  app.post("/api/admin/waha-sessions/:sessionName/stop", combinedAuth, requireSuperAdmin, wahaConfigController.stopWahaSession);
  app.delete("/api/admin/waha-sessions/:sessionName", combinedAuth, requireSuperAdmin, wahaConfigController.deleteWahaSession);
  
  // WAHA Session authentication endpoints (QR Code e pareamento por código)
  app.get("/api/admin/waha-sessions/:sessionName/qr", combinedAuth, requireSuperAdmin, wahaConfigController.getSessionQRCode);
  app.post("/api/admin/waha-sessions/:sessionName/pairing-code", combinedAuth, requireSuperAdmin, wahaConfigController.sendPairingCode);
  app.post("/api/admin/waha-sessions/:sessionName/confirm-code", combinedAuth, requireSuperAdmin, wahaConfigController.confirmPairingCode);
  
  // Debug endpoint para testar todos os endpoints WAHA possíveis
  app.get("/api/admin/waha-debug", combinedAuth, requireSuperAdmin, wahaConfigController.debugWahaEndpoints);
  
  // Teste específico de endpoints de QR Code
  app.get("/api/admin/waha-test-qr", combinedAuth, requireSuperAdmin, wahaConfigController.testQRCodeEndpoints);

  // Theme routes - rotas públicas para temas ativos, demais exigem super admin
  // Primeiro registrar as rotas públicas específicas
  app.get("/api/themes/active/light", async (req, res) => {
    const { default: themesRouter } = await import("./routes/themes");
    // Pegar o handler específico da rota
    const router = themesRouter;
    // Como é complexo extrair handlers específicos, vamos duplicar a lógica aqui
    try {
      const result = await (await import("./db")).db.execute(
        (await import("drizzle-orm")).sql`
          SELECT 
            id, 
            name, 
            light_config as lightConfig,
            dark_config as darkConfig,
            is_default as isDefault,
            is_active_light as isActiveLight,
            is_active_dark as isActiveDark,
            created_at as createdAt,
            updated_at as updatedAt
          FROM custom_themes 
          WHERE is_active_light = true
          LIMIT 1
        `
      );

      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum tema ativo para light mode'
        });
      }

      res.json({
        success: true,
        data: result[0]
      });
    } catch (error) {
      console.error('Erro ao buscar tema ativo para light mode:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  app.get("/api/themes/active/dark", async (req, res) => {
    try {
      const result = await (await import("./db")).db.execute(
        (await import("drizzle-orm")).sql`
          SELECT 
            id, 
            name, 
            light_config as lightConfig,
            dark_config as darkConfig,
            is_default as isDefault,
            is_active_light as isActiveLight,
            is_active_dark as isActiveDark,
            created_at as createdAt,
            updated_at as updatedAt
          FROM custom_themes 
          WHERE is_active_dark = true
          LIMIT 1
        `
      );

      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum tema ativo para dark mode'
        });
      }

      res.json({
        success: true,
        data: result[0]
      });
    } catch (error) {
      console.error('Erro ao buscar tema ativo para dark mode:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  app.get("/api/themes/active/current", async (req, res) => {
    try {
      const result = await (await import("./db")).db.execute(
        (await import("drizzle-orm")).sql`
          SELECT 
            id, 
            name, 
            light_config as lightConfig,
            dark_config as darkConfig,
            is_default as isDefault,
            created_at as createdAt,
            updated_at as updatedAt
          FROM custom_themes 
          WHERE is_default = true
          LIMIT 1
        `
      );

      if (result.length === 0) {
        // Retornar tema padrão hardcoded
        const defaultTheme = {
          name: 'Padrão Magen',
          lightConfig: {
            background: '0 0% 98%',
            foreground: '240 10% 3.9%',
            primary: '255 100% 70%',
            primaryForeground: '0 0% 98%',
            secondary: '157 100% 50%',
            secondaryForeground: '0 0% 9%',
            muted: '240 4.8% 95.9%',
            mutedForeground: '240 3.8% 46.1%',
            accent: '240 4.8% 95.9%',
            accentForeground: '240 5.9% 10%',
            border: '240 5.9% 90%',
            card: '0 0% 100%',
            cardForeground: '240 10% 3.9%',
            destructive: '0 84.2% 60.2%',
            destructiveForeground: '0 0% 98%',
          },
          darkConfig: {
            background: '240 10% 3.9%',
            foreground: '0 0% 98%',
            primary: '255 100% 70%',
            primaryForeground: '0 0% 98%',
            secondary: '157 100% 50%',
            secondaryForeground: '0 0% 9%',
            muted: '240 3.7% 15.9%',
            mutedForeground: '240 5% 64.9%',
            accent: '240 3.7% 15.9%',
            accentForeground: '0 0% 98%',
            border: '240 3.7% 15.9%',
            card: '240 10% 3.9%',
            cardForeground: '0 0% 98%',
            destructive: '0 62.8% 30.6%',
            destructiveForeground: '0 0% 98%',
          },
          isDefault: true
        };

        return res.json({
          success: true,
          data: defaultTheme
        });
      }

      res.json({
        success: true,
        data: result[0]
      });
    } catch (error) {
      console.error('Erro ao buscar tema ativo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  // Demais rotas de temas exigem autenticação de super admin
  app.use("/api/themes", combinedAuth, requireSuperAdmin, themesRouter);

  // Changelog endpoint - public access for version info  
  app.get("/api/changelog", (req: Request, res: Response) => {
    try {
      import('fs').then((fs) => {
        const changelogData = JSON.parse(fs.readFileSync('CHANGELOG.json', 'utf8'));
        res.json(changelogData);
      }).catch((error) => {
        console.error('Error reading changelog:', error);
        res.status(500).json({ error: "Failed to read changelog" });
      });
    } catch (error) {
      console.error('Error reading changelog:', error);
      res.status(500).json({ error: "Failed to read changelog" });
    }
  });

  // ==========================================
  // ROTAS DE LOCALIZAÇÃO
  // ==========================================
  
  // Rotas públicas de localização
  app.get('/api/localization/default', localizationController.getDefaultLocale);
  app.get('/api/localization/strings/:localeCode', localizationController.getLocalizationStrings);

  // Rotas de administração de localização (apenas super admin)
  app.get('/api/admin/localization', auth, requireSuperAdmin, localizationController.getLocales);
  app.post('/api/admin/localization', auth, requireSuperAdmin, localizationController.createLocale);
  app.put('/api/admin/localization/:id', auth, requireSuperAdmin, localizationController.updateLocale);
  app.delete('/api/admin/localization/:id', auth, requireSuperAdmin, localizationController.deleteLocale);
  app.get('/api/admin/localization/active', auth, requireSuperAdmin, localizationController.getActiveLocales);

  // Importação de strings via JSON (apenas super admin)
  app.post('/api/admin/localization/:localeCode/import', auth, requireSuperAdmin, localizationController.importStringsFromJson);
  
  // Ativar/desativar idioma
  app.put('/api/admin/localization/:localeCode/toggle', auth, requireSuperAdmin, localizationController.toggleLanguageStatus);
  
  // Definir idioma como padrão
  app.put('/api/admin/localization/:localeCode/set-default', auth, requireSuperAdmin, localizationController.setDefaultLanguage);

  // ==========================================
  // METAS FINANCEIRAS + CONTAS A PAGAR
  // ==========================================

  // Metas (caixinhas, sonhos, reservas, limites)
  app.get("/api/metas", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { getMetasByUsuarioId } = await import("./storage");
      const metas = await getMetasByUsuarioId(req.user!.id);
      res.json(metas);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/metas", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { createMeta } = await import("./storage");
      const meta = await createMeta(req.user!.id, req.body);
      res.status(201).json(meta);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  // Garante que a meta existe E pertence ao usuário logado (evita IDOR).
  const metaDoUsuario = async (metaId: number, userId: number) => {
    if (!Number.isFinite(metaId)) return null;
    const { getMetaById } = await import("./storage");
    const meta = await getMetaById(metaId);
    return meta && meta.usuario_id === userId ? meta : null;
  };

  // Editar meta (faltava — por isso "edição de meta" quebrava).
  app.put("/api/metas/:id", combinedAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await metaDoUsuario(id, req.user!.id))) return res.status(404).json({ error: "Meta não encontrada" });
      const { updateMeta } = await import("./storage");
      // Não deixa trocar o dono nem reativar via update.
      const { usuario_id, ...patch } = req.body || {};
      const meta = await updateMeta(id, patch);
      res.json(meta);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.post("/api/metas/:id/depositar", combinedAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await metaDoUsuario(id, req.user!.id))) return res.status(404).json({ error: "Meta não encontrada" });
      const valor = Number(req.body?.valor);
      if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: "Valor de depósito inválido" });
      const { depositarMeta } = await import("./storage");
      const result = await depositarMeta(id, valor);
      res.json(result);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  app.delete("/api/metas/:id", combinedAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await metaDoUsuario(id, req.user!.id))) return res.status(404).json({ error: "Meta não encontrada" });
      const { deleteMeta } = await import("./storage");
      await deleteMeta(id);
      res.status(204).send();
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  // Contas a pagar (lista transações pendentes com data_vencimento)
  app.get("/api/contas-pagar", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { getContasAPagar } = await import("./storage");
      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) return res.status(404).json({ error: "Carteira não encontrada" });
      const status = (req.query.status as string) || undefined;
      const contas = await getContasAPagar(wallet.id, status as any);
      res.json(contas);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Valores gastos no cartão em nome de terceiros, ainda a receber.
  app.get("/api/reembolsos", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { getReembolsosAReceber } = await import("./storage");
      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) return res.status(404).json({ error: "Carteira não encontrada" });
      res.json(await getReembolsosAReceber(wallet.id));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/reembolsos/:id/receber", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { marcarReembolsoRecebido } = await import("./storage");
      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) return res.status(404).json({ error: "Carteira não encontrada" });
      const result = await marcarReembolsoRecebido(parseInt(req.params.id), wallet.id);
      if (!result) return res.status(404).json({ error: "Reembolso não encontrado" });
      res.json(result);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  // Marcar transação como paga
  app.put("/api/transactions/:id/pagar", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { marcarComoPaga } = await import("./storage");
      const result = await marcarComoPaga(parseInt(req.params.id));
      if (!result) return res.status(404).json({ error: "Transação não encontrada" });
      res.json(result);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  // Marcar como recorrente
  app.put("/api/transactions/:id/recorrente", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { marcarRecorrente } = await import("./storage");
      const result = await marcarRecorrente(parseInt(req.params.id), req.body.recorrente ?? true);
      if (!result) return res.status(404).json({ error: "Transação não encontrada" });
      res.json(result);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
  });

  // Fluxo de caixa resumo
  app.get("/api/fluxo-caixa/resumo", combinedAuth, async (req: Request, res: Response) => {
    try {
      const { getFluxoCaixaResumo } = await import("./storage");
      const wallet = await storage.getWalletByUserId(req.user!.id);
      if (!wallet) return res.status(404).json({ error: "Carteira não encontrada" });
      const mes = req.query.mes ? parseInt(req.query.mes as string) : undefined;
      const ano = req.query.ano ? parseInt(req.query.ano as string) : undefined;
      const resumo = await getFluxoCaixaResumo(wallet.id, mes, ano);
      res.json(resumo);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Fluxo de caixa projetado (PF) — matriz categorias × meses
  const fluxoProjetadoCtrl = await import("./controllers/fluxo-projetado.controller");
  app.get("/api/fluxo-caixa/projetado", combinedAuth, fluxoProjetadoCtrl.getFluxoProjetadoPessoal);

  // ==========================================
  // PJ — ROTAS EMPRESAS / PLANO DE CONTAS / TRANSAÇÕES
  // Convivem ao lado das rotas PF sem alterá-las.
  // Auth: combinedAuth (cookie ou apikey) — mesmo padrão do PF.
  // N8N usa POST /api/empresas/:id/transacoes com a mesma apikey do usuário.
  // ==========================================

  const empresaCtrl = await import("./controllers/empresa.controller");
  const empresaContaCtrl = await import("./controllers/empresaConta.controller");
  const empresaTransacaoCtrl = await import("./controllers/empresaTransacao.controller");

  // CRUD de empresas
  app.get("/api/empresas", combinedAuth, empresaCtrl.listEmpresas);
  app.post("/api/empresas", combinedAuth, empresaCtrl.createEmpresa);
  app.get("/api/empresas/:id", combinedAuth, empresaCtrl.getEmpresa);
  app.put("/api/empresas/:id", combinedAuth, empresaCtrl.updateEmpresa);
  app.delete("/api/empresas/:id", combinedAuth, empresaCtrl.deleteEmpresa);

  // Plano de contas PJ
  app.get("/api/empresas/:id/contas", combinedAuth, empresaContaCtrl.listEmpresasContas);
  app.post("/api/empresas/:id/contas", combinedAuth, empresaContaCtrl.createEmpresaConta);
  app.put("/api/empresas/:id/contas/:contaId", combinedAuth, empresaContaCtrl.updateEmpresaConta);
  app.delete("/api/empresas/:id/contas/:contaId", combinedAuth, empresaContaCtrl.deleteEmpresaConta);

  // Transações PJ (endpoint principal para o N8N)
  app.post("/api/empresas/:id/transacoes", combinedAuth, empresaTransacaoCtrl.createEmpresaTransacao);
  app.get("/api/empresas/:id/transacoes", combinedAuth, empresaTransacaoCtrl.listEmpresaTransacoes);
  app.get("/api/empresas/:id/transacoes/:transacaoId", combinedAuth, empresaTransacaoCtrl.getEmpresaTransacao);
  app.put("/api/empresas/:id/transacoes/:transacaoId", combinedAuth, empresaTransacaoCtrl.updateEmpresaTransacao);
  app.delete("/api/empresas/:id/transacoes/:transacaoId", combinedAuth, empresaTransacaoCtrl.deleteEmpresaTransacao);

  // Dashboard e relatórios PJ
  app.get("/api/empresas/:id/dashboard/resumo", combinedAuth, empresaTransacaoCtrl.getEmpresaResumo);
  app.get("/api/empresas/:id/relatorios/dre", combinedAuth, empresaTransacaoCtrl.getEmpresaDRE);
  app.get("/api/empresas/:id/relatorios/fluxo-caixa", combinedAuth, empresaTransacaoCtrl.getEmpresaFluxoCaixa);
  // Fluxo projetado PJ — matriz plano de contas da empresa × meses
  app.get("/api/empresas/:id/relatorios/fluxo-projetado", combinedAuth, fluxoProjetadoCtrl.getFluxoProjetadoEmpresa);
  // Fatura de cartão PJ (competência × caixa)
  const empresaFaturaCtrl = await import("./controllers/empresaFatura.controller");
  const uploadFatura = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
  app.get("/api/empresas/:id/cartoes", combinedAuth, empresaFaturaCtrl.listarCartoes);
  app.post("/api/empresas/:id/cartoes", combinedAuth, empresaFaturaCtrl.criarCartao);
  app.delete("/api/empresas/:id/cartoes/:cartaoId", combinedAuth, empresaFaturaCtrl.excluirCartao);
  app.post("/api/empresas/:id/cartoes/:cartaoId/compras", combinedAuth, empresaFaturaCtrl.registrarCompra);
  app.get("/api/empresas/:id/cartoes/:cartaoId/faturas", combinedAuth, empresaFaturaCtrl.listarFaturas);
  app.get("/api/empresas/:id/faturas/:faturaId", combinedAuth, empresaFaturaCtrl.detalheFatura);
  app.post("/api/empresas/:id/faturas/:faturaId/fechar", combinedAuth, empresaFaturaCtrl.fecharFatura);
  app.post("/api/empresas/:id/faturas/:faturaId/pagar", combinedAuth, empresaFaturaCtrl.pagarFatura);
  app.post("/api/empresas/:id/faturas/:faturaId/conciliar", combinedAuth, uploadFatura.single("arquivo"), empresaFaturaCtrl.conciliarFatura);

  // Lixeira PJ (soft-delete/undo)
  const { restaurarUltimaExcluidaPJ, listarLixeiraPJ } = await import("./storage");
  app.get("/api/empresas/:id/lixeira", combinedAuth, async (req: Request, res: Response) => {
    const emp = await (await import("./storage")).storage.getEmpresaById(parseInt(req.params.id));
    if (!emp || emp.usuario_id !== req.user!.id) return res.status(404).json({ error: "Empresa não encontrada" });
    const items = await listarLixeiraPJ(emp.id);
    res.json(items);
  });
  app.post("/api/empresas/:id/lixeira/restaurar", combinedAuth, async (req: Request, res: Response) => {
    const emp = await (await import("./storage")).storage.getEmpresaById(parseInt(req.params.id));
    if (!emp || emp.usuario_id !== req.user!.id) return res.status(404).json({ error: "Empresa não encontrada" });
    const result = await restaurarUltimaExcluidaPJ(emp.id);
    res.json(result);
  });

  // Conciliação bancária (contas bancárias + import OFX + matching + IA sugere)
  const { ConciliacaoController } = await import("./controllers/conciliacao.controller");
  const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
  app.get("/api/empresas/:id/contas-bancarias", combinedAuth, ConciliacaoController.listarContas);
  app.post("/api/empresas/:id/contas-bancarias", combinedAuth, ConciliacaoController.criarConta);
  app.put("/api/empresas/:id/contas-bancarias/:contaId", combinedAuth, ConciliacaoController.atualizarConta);
  app.delete("/api/empresas/:id/contas-bancarias/:contaId", combinedAuth, ConciliacaoController.removerConta);
  app.post("/api/empresas/:id/conciliacao/importar", combinedAuth, uploadMemoria.single("arquivo"), ConciliacaoController.importar);
  app.get("/api/empresas/:id/conciliacao/movimentos", combinedAuth, ConciliacaoController.listarMovimentos);
  app.post("/api/empresas/:id/conciliacao/movimentos/:mid/lancar", combinedAuth, ConciliacaoController.lancar);
  app.post("/api/empresas/:id/conciliacao/movimentos/:mid/conciliar", combinedAuth, ConciliacaoController.conciliar);
  app.post("/api/empresas/:id/conciliacao/movimentos/:mid/ignorar", combinedAuth, ConciliacaoController.ignorar);
  app.post("/api/empresas/:id/conciliacao/aceitar-sugestoes", combinedAuth, ConciliacaoController.aceitarSugestoes);
  app.get("/api/empresas/:id/conciliacao/bater-saldo", combinedAuth, ConciliacaoController.baterSaldo);

  // Importação de lançamentos PF (planilha -> contas a pagar; cria formas/cartões e vincula)
  const { ImportLancamentosController } = await import("./controllers/import-lancamentos.controller");
  app.post("/api/importacao/lancamentos/preview", combinedAuth, uploadMemoria.single("arquivo"), ImportLancamentosController.preview);
  app.post("/api/importacao/lancamentos", combinedAuth, uploadMemoria.single("arquivo"), ImportLancamentosController.importar);

  const { ImportLancamentosPjController, ReembolsosPjController } = await import("./controllers/import-lancamentos-pj.controller");
  app.post("/api/empresas/:id/importacao/lancamentos/preview", combinedAuth, uploadMemoria.single("arquivo"), ImportLancamentosPjController.preview);
  app.post("/api/empresas/:id/importacao/lancamentos", combinedAuth, uploadMemoria.single("arquivo"), ImportLancamentosPjController.importar);
  app.get("/api/empresas/:id/reembolsos-pessoais", combinedAuth, ReembolsosPjController.listar);
  app.put("/api/empresas/:id/reembolsos-pessoais/:transacaoId/pagar", combinedAuth, ReembolsosPjController.pagar);

  // ==========================================
  // WEBHOOK UAZAPI — Pipeline IA internalizado (substitui N8N)
  // Recebe mensagens do WhatsApp via UazAPI, processa com IA, insere transação, responde.
  // Sem auth Express — validado por token no body do UazAPI.
  // ==========================================
  const uazapiWebhookCtrl = await import("./controllers/uazapi-webhook.controller");
  app.post("/api/webhook/uazapi", uazapiWebhookCtrl.handleUazapiWebhook);

  const httpServer = createServer(app);

  // Inicializar WebSocket server para notificações em tempo real
  initializeWebSocketServer(httpServer);

  return httpServer;
}
