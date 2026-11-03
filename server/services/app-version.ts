import fs from "fs";
import path from "path";

/**
 * Carimbo de versão da build (hash do commit + data do build + ambiente).
 * Fonte: build-info.json, gravado no `docker build` por scripts/gravar-build-info.cjs.
 * Variáveis de ambiente (APP_GIT_COMMIT / GIT_COMMIT / SOURCE_COMMIT) têm prioridade
 * quando trazem um hash de verdade.
 */
type BuildInfo = { commit?: string; built_at?: string };

let buildInfoCache: BuildInfo | null = null;
function lerBuildInfo(): BuildInfo {
  if (buildInfoCache) return buildInfoCache;
  try {
    buildInfoCache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "build-info.json"), "utf8"));
  } catch {
    buildInfoCache = {};
  }
  return buildInfoCache!;
}

function valido(v: string | undefined): v is string {
  return !!v && v.trim() !== "" && v.trim() !== "unknown";
}

export function getAppVersion() {
  const info = lerBuildInfo();
  const commit =
    [process.env.APP_GIT_COMMIT, process.env.GIT_COMMIT, process.env.SOURCE_COMMIT, info.commit].find(valido) ||
    "unknown";
  const short = commit !== "unknown" && commit.length > 7 ? commit.slice(0, 7) : commit;
  const envLabel =
    process.env.APP_ENV ||
    process.env.EASYPANEL_ENV ||
    (process.env.SIMULADOR_WHATSAPP === "true" ? "homologacao" : null) ||
    process.env.NODE_ENV ||
    "unknown";
  return {
    commit,
    commit_short: short,
    built_at: info.built_at || null,
    env: envLabel,
    node_env: process.env.NODE_ENV || "unknown",
    simulador_whatsapp: process.env.SIMULADOR_WHATSAPP === "true",
  };
}
