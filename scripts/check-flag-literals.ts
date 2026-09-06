/**
 * CI: falha se existir flagAtiva("literal") com string crua.
 * npm run flags:check-literals
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const re = /flagAtiva\s*\(\s*(["'])([^"']+)\1/g;
const hits: string[] = [];

for (const p of walk(join(root, "server")).concat(walk(join(root, "client")))) {
  // scripts/ de teste podem citar o padrão — ignora scripts
  if (p.includes(`${join("scripts")}`)) continue;
  const c = readFileSync(p, "utf8");
  let m: RegExpExecArray | null;
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
