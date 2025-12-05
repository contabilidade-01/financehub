import type { Express } from "express";
import { Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { auth } from "./middleware/auth.middleware";
import { apiKeyAuth } from "./middleware/apiKey.middleware";
import { combinedAuth } from "./middleware/combinedAuth.middleware";
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
  app.post("/api/auth/register", userController.register);
  app.post("/api/auth/login", userController.login);
  app.post("/api/auth/logout", userController.logout);
  
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
          name: 'Padrão FinanceHub',
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

  const httpServer = createServer(app);
  
  // Inicializar WebSocket server para notificações em tempo real
  initializeWebSocketServer(httpServer);
  
  return httpServer;
}
