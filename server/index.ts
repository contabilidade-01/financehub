// Carregar variáveis de ambiente ANTES de qualquer importação
import { readFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join, resolve } from 'path';

try {
  const envPath = join(process.cwd(), '.env');
  const envContent = readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n');
  
  for (const line of envLines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=');
        process.env[key] = value;
      }
    }
  }
  console.log('✅ Variáveis de ambiente carregadas com sucesso');
  console.log('🔍 SETUP env value:', process.env.SETUP);
} catch (error) {
  console.warn('⚠️ Arquivo .env não encontrado ou não pode ser lido');
}

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateAndInitializeDatabase, waitForDatabase } from "./startup";
import { setupRedirect } from "./middleware/setup.middleware";
import { securityHeaders } from "./middleware/security.middleware";
import { runAutoMigrations } from "./migrations/auto-migrate";

// Configurar timezone global da aplicação para São Paulo
process.env.TZ = 'America/Sao_Paulo';

// Configurar pastas de upload com permissões corretas
function setupUploadDirectories() {
  console.log('📁 Configurando pastas de upload...');
  
  // Em produção, usar dist/public, em desenvolvimento usar public/
  const isProduction = process.env.NODE_ENV === 'production';
  const publicPath = isProduction ? 'dist/public' : 'public';
  
  const publicDir = resolve(process.cwd(), publicPath);
  const chartsDir = resolve(publicDir, 'charts');
  const reportsDir = resolve(publicDir, 'reports');
  
  console.log(`📍 Modo: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
  console.log(`📂 Diretório público: ${publicDir}`);
  
  // Criar diretórios se não existirem
  [publicDir, chartsDir, reportsDir].forEach(dir => {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o755 });
        console.log(`✅ Pasta criada: ${dir}`);
      } else {
        // Garantir permissões corretas mesmo se a pasta já existe
        chmodSync(dir, 0o755);
        console.log(`✅ Permissões ajustadas: ${dir}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao configurar pasta ${dir}:`, error);
    }
  });
  
  console.log('✅ Pastas de upload configuradas!');
}

// Configurar pastas no startup
setupUploadDirectories();

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

// Necessário para cookie 'secure' funcionar atrás de proxy/HTTPS (EasyPanel).
if (isProduction) {
  app.set('trust proxy', 1);
}

// Cabeçalhos de segurança (helmet)
app.use(securityHeaders);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Segredo de sessão vem do ambiente. Em produção é obrigatório; se faltar,
// aborta o boot em vez de subir com um segredo previsível e conhecido.
const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  console.error('❌ SESSION_SECRET ausente ou muito curto em produção. Defina 64+ caracteres aleatórios no .env.');
  process.exit(1);
}
const resolvedSessionSecret = sessionSecret || 'dev-only-insecure-secret-change-me';

// Store de sessão: PostgreSQL (connect-pg-simple) quando há DATABASE_URL —
// persiste entre restarts/deploys e permite mais de uma instância.
// Fallback para MemoryStore só quando o banco ainda não está configurado.
let sessionStore: session.Store;
if (process.env.DATABASE_URL) {
  const PgSession = connectPgSimple(session);
  sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60,
  });
  console.log('🔐 Store de sessão: PostgreSQL (connect-pg-simple)');
} else {
  const MemoryStoreSession = MemoryStore(session);
  sessionStore = new MemoryStoreSession({ checkPeriod: 86400000 });
  console.warn('⚠️ Store de sessão: MemoryStore (sem DATABASE_URL).');
}

app.use(session({
  secret: resolvedSessionSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    secure: isProduction, // cookie só por HTTPS em produção
    httpOnly: true,
    sameSite: 'lax',
  }
}));

// Middleware para desabilitar cache em endpoints da API
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Aguardar banco e inicializar antes de registrar rotas
    console.log('🚀 Inicializando aplicação...');
    await waitForDatabase();
    await validateAndInitializeDatabase();
    // Garante que o schema tenha as colunas/tabelas que o código espera
    // (evita erros como 'column data_vencimento does not exist' em produção).
    await runAutoMigrations();
    console.log('✅ Aplicação inicializada com sucesso!');
  } catch (error) {
    console.error('❌ Falha na inicialização do banco:', error);
    console.log('⚠️ Continuando sem inicialização automática...');
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Middleware de redirecionamento para setup (após o Vite)
  app.use(setupRedirect);

  // Porta dinâmica baseada no ambiente
  // Desenvolvimento: 5001 (para não conflitar com outros serviços)
  // Produção: 5000 (porta padrão)
  const isDevelopment = process.env.NODE_ENV === 'development';
  const port = isDevelopment ? 5001 : 5000;

  log(`🚀 Ambiente: ${isDevelopment ? 'DESENVOLVIMENTO' : 'PRODUÇÃO'}`);
  log(`🔌 Servidor rodando na porta ${port}`);

  server.listen(port);

  // Inicializar alertas proativos (WhatsApp) — roda a cada 1h
  import("./jobs/proactive-alerts.job").then(({ initializeAlerts }) => {
    initializeAlerts();
  }).catch(err => {
    console.error("[Alerts] Falha ao carregar módulo de alertas:", err.message);
  });
})();
