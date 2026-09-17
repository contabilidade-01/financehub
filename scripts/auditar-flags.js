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
Object.defineProperty(exports, "__esModule", { value: true });
exports.escanearCodigoFlags = escanearCodigoFlags;
/**
 * Auditoria código × banco de feature flags.
 * npm run flags:auditar
 *
 * Sem DATABASE_URL: só lista chaves do código (FLAGS_NO_CODIGO + scan).
 * Com banco: aponta soNoCodigo / soNoBanco.
 */
const fs_1 = require("fs");
const path_1 = require("path");
const feature_flags_logic_1 = require("../server/services/feature-flags-logic");
// Rodado sempre via npm a partir da raiz do repo; process.cwd() evita
// import.meta, que o tsconfig (module: commonjs) do projeto nao aceita.
const root = process.cwd();
function walkTs(dir, out = []) {
    let entries;
    try {
        entries = (0, fs_1.readdirSync)(dir);
    }
    catch (_a) {
        return out;
    }
    for (const name of entries) {
        if (name === "node_modules" || name === "dist" || name === ".git")
            continue;
        const p = (0, path_1.join)(dir, name);
        const st = (0, fs_1.statSync)(p);
        if (st.isDirectory())
            walkTs(p, out);
        else if (/\.(ts|tsx)$/.test(name))
            out.push(p);
    }
    return out;
}
/** Extrai chaves de `export const FLAG_X = "chave"` e literais proibidos em flagAtiva("…"). */
function escanearCodigoFlags(arquivos) {
    const constantes = new Set(feature_flags_logic_1.FLAGS_NO_CODIGO);
    const literaisProibidos = [];
    const reConst = /export\s+const\s+FLAG_[A-Z0-9_]+\s*=\s*["']([a-z0-9_]+)["']/g;
    const reLiteral = /flagAtiva\s*\(\s*(["'])([^"']+)\1/g;
    for (const f of arquivos) {
        let m;
        const c = f.content;
        reConst.lastIndex = 0;
        while ((m = reConst.exec(c)))
            constantes.add(m[1]);
        reLiteral.lastIndex = 0;
        while ((m = reLiteral.exec(c))) {
            literaisProibidos.push({ path: f.path, snippet: m[0] });
        }
    }
    return { constantes: [...constantes].sort(), literaisProibidos };
}
async function main() {
    const files = walkTs((0, path_1.join)(root, "server")).concat(walkTs((0, path_1.join)(root, "client", "src")));
    const scanned = files.map((p) => ({
        path: p.replace(root + "\\", "").replace(root + "/", ""),
        content: (0, fs_1.readFileSync)(p, "utf8"),
    }));
    const { constantes, literaisProibidos } = escanearCodigoFlags(scanned);
    console.log("Chaves no código (constantes FLAG_* + FLAGS_NO_CODIGO):");
    for (const k of constantes)
        console.log("  -", k);
    if (literaisProibidos.length) {
        console.error("\nLiterais em flagAtiva(\"…\") — use constante exportada:");
        for (const L of literaisProibidos)
            console.error(`  ${L.path}: ${L.snippet}`);
        process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
        console.log("\nSem DATABASE_URL — auditoria contra o banco omitida.");
        console.log("OK (scan de código).");
        return;
    }
    const { listarChavesNoBanco } = await Promise.resolve().then(() => __importStar(require("../server/services/feature-flags.service")));
    const banco = await listarChavesNoBanco();
    console.log("\nChaves no banco:");
    for (const k of banco)
        console.log("  -", k);
    const div = (0, feature_flags_logic_1.auditarDivergenciasFlags)(constantes, banco);
    let falhas = 0;
    if (div.soNoCodigo.length) {
        falhas++;
        console.error("\nNo código, SEM linha no banco (flagAtiva = false para todos — perigoso):");
        for (const k of div.soNoCodigo)
            console.error("  -", k);
    }
    if (div.soNoBanco.length) {
        falhas++;
        console.error("\nNo banco, SEM uso no código (pronta para aposentar a linha):");
        for (const k of div.soNoBanco)
            console.error("  -", k);
    }
    if (falhas) {
        process.exit(1);
    }
    console.log("\nCódigo e banco concordam. OK");
    // Evita pool do Postgres manter o processo vivo.
    process.exit(0);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
