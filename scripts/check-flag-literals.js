"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * CI: falha se existir flagAtiva("literal") com string crua.
 * npm run flags:check-literals
 */
const fs_1 = require("fs");
const path_1 = require("path");
// Rodado sempre via npm a partir da raiz do repo; process.cwd() evita
// import.meta, que o tsconfig (module: commonjs) do projeto nao aceita.
const root = process.cwd();
function walk(dir, out = []) {
    for (const name of (0, fs_1.readdirSync)(dir)) {
        if (name === "node_modules" || name === "dist" || name === ".git")
            continue;
        const p = (0, path_1.join)(dir, name);
        if ((0, fs_1.statSync)(p).isDirectory())
            walk(p, out);
        else if (/\.(ts|tsx)$/.test(name))
            out.push(p);
    }
    return out;
}
const re = /flagAtiva\s*\(\s*(["'])([^"']+)\1/g;
const hits = [];
for (const p of walk((0, path_1.join)(root, "server")).concat(walk((0, path_1.join)(root, "client")))) {
    // scripts/ de teste podem citar o padrão — ignora scripts
    if (p.includes(`${(0, path_1.join)("scripts")}`))
        continue;
    const c = (0, fs_1.readFileSync)(p, "utf8");
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(c))) {
        hits.push(`${p.replace(root, ".")}: ${m[0]}`);
    }
}
if (hits.length) {
    console.error("Use constantes FLAG_* exportadas — literais proibidos:\n" + hits.join("\n"));
    process.exit(1);
}
console.log("flags:check-literals OK (nenhum flagAtiva(\"…\"))");
