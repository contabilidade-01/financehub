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
import { AnalyticsController } from "./controllers/analytics.controller";
import { SubscriptionController } from "./controllers/subscription.controller";
import * as databaseController from "./controllers/database.controller";
import * as setupController from "./controllers/setup.controller";
import * as welcomeMessagesController from "./controllers/welcome-messages.controller";
import * as wahaConfigController from "./controllers/waha-config.controller";
import * as notificationController from "./controllers/notification.controller";
import themesRouter from "./routes/themes";

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

  // Subscription routes
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

  // Theme routes - require super admin access
  app.use("/api/themes", combinedAuth, themesRouter);

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

  const httpServer = createServer(app);
  
  // Inicializar WebSocket server para notificações em tempo real
  initializeWebSocketServer(httpServer);
  
  return httpServer;
}
