/**
 * Carimbo de versão da build (hash do commit + ambiente).
 * Preenchido no Docker via ARG GIT_COMMIT → ENV APP_GIT_COMMIT.
 */
export function getAppVersion() {
  const commit =
    process.env.APP_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.SOURCE_COMMIT ||
    "unknown";
  const short = commit.length > 7 && commit !== "unknown" ? commit.slice(0, 7) : commit;
  const envLabel =
    process.env.APP_ENV ||
    process.env.EASYPANEL_ENV ||
    (process.env.SIMULADOR_WHATSAPP === "true" ? "homologacao" : null) ||
    process.env.NODE_ENV ||
    "unknown";
  return {
    commit,
    commit_short: short,
    env: envLabel,
    node_env: process.env.NODE_ENV || "unknown",
    simulador_whatsapp: process.env.SIMULADOR_WHATSAPP === "true",
  };
}
