"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
exports.setupVite = setupVite;
exports.serveStatic = serveStatic;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const vite_1 = require("vite");
const vite_config_1 = __importDefault(require("../vite.config"));
const nanoid_1 = require("nanoid");
const viteLogger = (0, vite_1.createLogger)();
function log(message, source = "express") {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
    console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app, server) {
    const serverOptions = {
        middlewareMode: true,
        hmr: { server },
        allowedHosts: ["ec992ccb623b.ngrok-free.app"],
    };
    const vite = await (0, vite_1.createServer)(Object.assign(Object.assign({}, vite_config_1.default), { configFile: false, customLogger: Object.assign(Object.assign({}, viteLogger), { error: (msg, options) => {
                viteLogger.error(msg, options);
                process.exit(1);
            } }), server: serverOptions, appType: "custom" }));
    app.use(vite.middlewares);
    // Middleware para servir o index.html apenas para rotas que não são API ou arquivos estáticos
    app.use("*", async (req, res, next) => {
        const url = req.originalUrl;
        // Não servir HTML para rotas da API
        if (url.startsWith('/api/')) {
            return next();
        }
        // Não servir HTML para arquivos estáticos (js, css, etc.)
        if (url.includes('.') && !url.endsWith('/')) {
            return next();
        }
        try {
            const clientTemplate = path_1.default.resolve(import.meta.dirname, "..", "client", "index.html");
            // always reload the index.html file from disk incase it changes
            let template = await fs_1.default.promises.readFile(clientTemplate, "utf-8");
            template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${(0, nanoid_1.nanoid)()}"`);
            const page = await vite.transformIndexHtml(url, template);
            res.status(200).set({ "Content-Type": "text/html" }).end(page);
        }
        catch (e) {
            vite.ssrFixStacktrace(e);
            next(e);
        }
    });
}
function serveStatic(app) {
    const distPath = path_1.default.resolve(import.meta.dirname, "public");
    if (!fs_1.default.existsSync(distPath)) {
        throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
    }
    app.use(express_1.default.static(distPath));
    // fall through to index.html if the file doesn't exist
    app.use("*", (_req, res) => {
        res.sendFile(path_1.default.resolve(distPath, "index.html"));
    });
}
