"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Carregar variáveis de ambiente ANTES de qualquer importação
const fs_1 = require("fs");
const path_1 = require("path");
try {
    const envPath = (0, path_1.join)(process.cwd(), '.env');
    const envContent = (0, fs_1.readFileSync)(envPath, 'utf8');
    const envLines = envContent.split('\n');
    for (const line of envLines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=');
                // Não sobrescreve se já veio do ambiente (ex.: smoke com Postgres Docker).
                if (process.env[key] === undefined)
                    process.env[key] = value;
            }
        }
    }
    console.log('✅ Variáveis de ambiente carregadas com sucesso');
    console.log('🔍 SETUP env value:', process.env.SETUP);
}
catch (error) {
    console.warn('⚠️ Arquivo .env não encontrado ou não pode ser lido');
}
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const memorystore_1 = __importDefault(require("memorystore"));
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const routes_1 = require("./routes");
const vite_1 = require("./vite");
const startup_1 = require("./startup");
const setup_middleware_1 = require("./middleware/setup.middleware");
const security_middleware_1 = require("./middleware/security.middleware");
const auto_migrate_1 = require("./migrations/auto-migrate");
const crypto_1 = require("crypto");
// Configurar timezone global da aplicação para São Paulo
process.env.TZ = 'America/Sao_Paulo';
// Configurar pastas de upload com permissões corretas
function setupUploadDirectories() {
    console.log('📁 Configurando pastas de upload...');
    // Em produção, usar dist/public, em desenvolvimento usar public/
    const isProduction = process.env.NODE_ENV === 'production';
    const publicPath = isProduction ? 'dist/public' : 'public';
    const publicDir = (0, path_1.resolve)(process.cwd(), publicPath);
    const chartsDir = (0, path_1.resolve)(publicDir, 'charts');
    const reportsDir = (0, path_1.resolve)(publicDir, 'reports');
    console.log(`📍 Modo: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
    console.log(`📂 Diretório público: ${publicDir}`);
    // Criar diretórios se não existirem
    [publicDir, chartsDir, reportsDir].forEach(dir => {
        try {
            if (!(0, fs_1.existsSync)(dir)) {
                (0, fs_1.mkdirSync)(dir, { recursive: true, mode: 0o755 });
                console.log(`✅ Pasta criada: ${dir}`);
            }
            else {
                // Garantir permissões corretas mesmo se a pasta já existe
                (0, fs_1.chmodSync)(dir, 0o755);
                console.log(`✅ Permissões ajustadas: ${dir}`);
            }
        }
        catch (error) {
            console.error(`❌ Erro ao configurar pasta ${dir}:`, error);
        }
    });
    console.log('✅ Pastas de upload configuradas!');
}
// Configurar pastas no startup
setupUploadDirectories();
const app = (0, express_1.default)();
const isProduction = process.env.NODE_ENV === 'production';
// Necessário para cookie 'secure' funcionar atrás de proxy/HTTPS (EasyPanel).
if (isProduction) {
    app.set('trust proxy', 1);
}
// Cabeçalhos de segurança (helmet)
app.use(security_middleware_1.securityHeaders);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: false }));
// Segredo de sessão vem do ambiente. Se faltar em produção, o app NÃO aborta:
// gera um secret aleatório na hora e avisa (evita derrubar o deploy). Defina
// SESSION_SECRET nas variáveis de ambiente para manter as sessões estáveis
// entre reinícios.
const sessionSecret = process.env.SESSION_SECRET;
let resolvedSessionSecret = sessionSecret;
if (!resolvedSessionSecret || resolvedSessionSecret.length < 32) {
    if (isProduction) {
        resolvedSessionSecret = (0, crypto_1.randomBytes)(48).toString('hex');
        console.warn('⚠️ SESSION_SECRET ausente/curto — usando um segredo gerado agora. Defina SESSION_SECRET nas variáveis de ambiente para manter os logins estáveis entre reinícios.');
    }
    else {
        resolvedSessionSecret = 'dev-only-insecure-secret-change-me';
    }
}
// Store de sessão: PostgreSQL (connect-pg-simple) quando há DATABASE_URL —
// persiste entre restarts/deploys e permite mais de uma instância.
// Fallback para MemoryStore só quando o banco ainda não está configurado.
let sessionStore;
if (process.env.DATABASE_URL) {
    const PgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
    sessionStore = new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: 'user_sessions',
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
    });
    console.log('🔐 Store de sessão: PostgreSQL (connect-pg-simple)');
}
else {
    const MemoryStoreSession = (0, memorystore_1.default)(express_session_1.default);
    sessionStore = new MemoryStoreSession({ checkPeriod: 86400000 });
    console.warn('⚠️ Store de sessão: MemoryStore (sem DATABASE_URL).');
}
app.use((0, express_session_1.default)({
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
    let capturedJsonResponse = undefined;
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
            (0, vite_1.log)(logLine);
        }
    });
    next();
});
(async () => {
    try {
        // Aguardar banco e inicializar antes de registrar rotas
        console.log('🚀 Inicializando aplicação...');
        await (0, startup_1.waitForDatabase)();
        await (0, startup_1.validateAndInitializeDatabase)();
        // Garante que o schema tenha as colunas/tabelas que o código espera
        // (evita erros como 'column data_vencimento does not exist' em produção).
        await (0, auto_migrate_1.runAutoMigrations)();
        console.log('✅ Aplicação inicializada com sucesso!');
        // Cérebro coletivo: agrega a memória global (PF) sem bloquear o boot.
        Promise.resolve().then(() => __importStar(require('./storage'))).then(({ agregarMemoriaGlobalPF }) => agregarMemoriaGlobalPF().catch(() => { }));
        // LGPD: expurga quem pediu exclusão e já venceu a carência. Roda no boot e
        // 1x por dia — sem isso, o pedido do titular ficaria esperando alguém rodar
        // na mão. Não bloqueia o boot.
        // Backup do banco: 3x por dia (03h, 11h e 19h de Brasilia), 20 copias.
        // Confere o slot corrente a cada 10 min, entao um deploy no meio do dia
        // nao faz o horario ser pulado.
        Promise.resolve().then(() => __importStar(require('./services/backup.service'))).then(({ iniciarAgendadorBackups }) => {
            iniciarAgendadorBackups();
        }).catch(() => { });
        Promise.resolve().then(() => __importStar(require('./services/lgpd-dados.service'))).then(({ expurgarExclusoesVencidas }) => {
            expurgarExclusoesVencidas().catch(() => { });
            setInterval(() => { expurgarExclusoesVencidas().catch(() => { }); }, 24 * 60 * 60 * 1000);
        });
    }
    catch (error) {
        console.error('❌ Falha na inicialização do banco:', error);
        console.log('⚠️ Continuando sem inicialização automática...');
    }
    const server = await (0, routes_1.registerRoutes)(app);
    app.use((err, _req, res, _next) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
        throw err;
    });
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
        await (0, vite_1.setupVite)(app, server);
    }
    else {
        (0, vite_1.serveStatic)(app);
    }
    // Middleware de redirecionamento para setup (após o Vite)
    app.use(setup_middleware_1.setupRedirect);
    // Porta dinâmica baseada no ambiente
    // Desenvolvimento: 5001 (para não conflitar com outros serviços)
    // Produção: 5000 (porta padrão)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const port = isDevelopment ? 5001 : 5000;
    (0, vite_1.log)(`🚀 Ambiente: ${isDevelopment ? 'DESENVOLVIMENTO' : 'PRODUÇÃO'}`);
    try {
        const { getAppVersion } = await Promise.resolve().then(() => __importStar(require("./services/app-version")));
        const v = getAppVersion();
        (0, vite_1.log)(`📦 Versão: ${v.commit_short} · env=${v.env} · simulador=${v.simulador_whatsapp}`);
    }
    catch ( /* ignore */_a) { /* ignore */ }
    try {
        const { ensureFeatureFlagsBoot } = await Promise.resolve().then(() => __importStar(require("./services/feature-flags.service")));
        await ensureFeatureFlagsBoot();
    }
    catch (e) {
        console.error("[boot] feature-flags:", (e === null || e === void 0 ? void 0 : e.message) || e);
    }
    (0, vite_1.log)(`🔌 Servidor rodando na porta ${port}`);
    server.listen(port);
    // Encerramento gracioso: no redeploy o container manda SIGTERM. Sem tratar,
    // o Node é morto pelo sinal e o `npm start` acusa "signal SIGTERM". Aqui
    // fechamos o servidor e saímos com código 0 (encerramento limpo).
    let encerrando = false;
    const shutdown = (sinal) => {
        if (encerrando)
            return;
        encerrando = true;
        (0, vite_1.log)(`↩️ Recebido ${sinal} — encerrando graciosamente...`);
        server.close(() => process.exit(0));
        // Garante saída mesmo se alguma conexão travar.
        setTimeout(() => process.exit(0), 8000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    // Inicializar alertas proativos (WhatsApp) — roda a cada 1h
    Promise.resolve().then(() => __importStar(require("./jobs/proactive-alerts.job"))).then(({ initializeAlerts }) => {
        initializeAlerts();
    }).catch(err => {
        console.error("[Alerts] Falha ao carregar módulo de alertas:", err.message);
    });
})();
