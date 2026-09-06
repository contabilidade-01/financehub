/**
 * Portão de tipos: falha se o total de erros TSC subir acima do baseline.
 * O baseline só pode BAIXAR (revisão deliberada em baseline-tsc.txt).
 *
 * Uso: npx tsx scripts/check-tsc-baseline.ts
 */
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const baselinePath = resolve(root, "baseline-tsc.txt");

if (!existsSync(baselinePath)) {
  console.error("Falta baseline-tsc.txt na raiz do repo.");
  process.exit(1);
}

const baseline = Number(String(readFileSync(baselinePath, "utf8")).trim());
if (!Number.isFinite(baseline) || baseline < 0) {
  console.error("baseline-tsc.txt inválido:", baseline);
  process.exit(1);
}

const r = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: root,
  encoding: "utf8",
  shell: true,
  maxBuffer: 20 * 1024 * 1024,
});

const out = `${r.stdout || ""}\n${r.stderr || ""}`;
const errors = (out.match(/error TS\d+/g) || []).length;

console.log(`tsc: ${errors} erro(s); baseline: ${baseline}`);

if (errors > baseline) {
  console.error(
    `\nFALHA: erros TypeScript subiram (${errors} > ${baseline}).\n` +
      `Corrija os novos erros ou, só se for deliberado e documentado, baixe o baseline.`,
  );
  process.exit(1);
}

if (errors < baseline) {
  console.log(
    `\nOK — erros baixaram (${errors} < ${baseline}). Considere atualizar baseline-tsc.txt para ${errors}.`,
  );
} else {
  console.log("\nOK — dentro do baseline.");
}
