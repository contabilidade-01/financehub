/**
 * Auditoria código × banco de feature flags.
 * npm run flags:auditar
 *
 * Sem DATABASE_URL: só lista chaves do código (FLAGS_NO_CODIGO + scan).
 * Com banco: aponta soNoCodigo / soNoBanco.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import {
  FLAGS_NO_CODIGO,
  auditarDivergenciasFlags,
} from "../server/services/feature-flags-logic";

// Rodado sempre via npm a partir da raiz do repo; process.cwd() evita
// import.meta, que o tsconfig (module: commonjs) do projeto nao aceita.
const root = process.cwd();

function walkTs(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Extrai chaves de `export const FLAG_X = "chave"` e literais proibidos em flagAtiva("…"). */
export function escanearCodigoFlags(arquivos: { path: string; content: string }[]): {
  constantes: string[];
  literaisProibidos: { path: string; snippet: string }[];
} {
  const constantes = new Set<string>(FLAGS_NO_CODIGO);
  const literaisProibidos: { path: string; snippet: string }[] = [];
  const reConst = /export\s+const\s+FLAG_[A-Z0-9_]+\s*=\s*["']([a-z0-9_]+)["']/g;
  const reLiteral = /flagAtiva\s*\(\s*(["'])([^"']+)\1/g;

  for (const f of arquivos) {
    let m: RegExpExecArray | null;
    const c = f.content;
    reConst.lastIndex = 0;
    while ((m = reConst.exec(c))) constantes.add(m[1]);
    reLiteral.lastIndex = 0;
    while ((m = reLiteral.exec(c))) {
      literaisProibidos.push({ path: f.path, snippet: m[0] });
    }
  }
  return { constantes: [...constantes].sort(), literaisProibidos };
}

async function main() {
  const files = walkTs(join(root, "server")).concat(walkTs(join(root, "client", "src")));
  const scanned = files.map((p) => ({
    path: p.replace(root + "\\", "").replace(root + "/", ""),
    content: readFileSync(p, "utf8"),
  }));
  const { constantes, literaisProibidos } = escanearCodigoFlags(scanned);

  console.log("Chaves no código (constantes FLAG_* + FLAGS_NO_CODIGO):");
  for (const k of constantes) console.log("  -", k);

  if (literaisProibidos.length) {
    console.error("\nLiterais em flagAtiva(\"…\") — use constante exportada:");
    for (const L of literaisProibidos) console.error(`  ${L.path}: ${L.snippet}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.log("\nSem DATABASE_URL — auditoria contra o banco omitida.");
    console.log("OK (scan de código).");
    return;
  }

  const { listarChavesNoBanco } = await import("../server/services/feature-flags.service");
  const banco = await listarChavesNoBanco();
  console.log("\nChaves no banco:");
  for (const k of banco) console.log("  -", k);

  const div = auditarDivergenciasFlags(constantes, banco);
  let falhas = 0;
  if (div.soNoCodigo.length) {
    falhas++;
    console.error("\nNo código, SEM linha no banco (flagAtiva = false para todos — perigoso):");
    for (const k of div.soNoCodigo) console.error("  -", k);
  }
  if (div.soNoBanco.length) {
    falhas++;
    console.error("\nNo banco, SEM uso no código (pronta para aposentar a linha):");
    for (const k of div.soNoBanco) console.error("  -", k);
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
