#!/usr/bin/env node
/**
 * Roda no `docker build` (ver Dockerfile) e grava build-info.json com:
 *   - commit: hash do commit que está sendo construído
 *   - built_at: data/hora (UTC) do build
 *
 * O EasyPanel não passa o hash como build-arg e a pasta .git fica fora da
 * imagem (.dockerignore). Então, se GIT_COMMIT não vier, consulta o último
 * commit da branch na API pública do GitHub (repositório público, sem token).
 * Qualquer falha (rede, rate limit) cai em "unknown" — o build nunca quebra.
 */
const fs = require("fs");
const path = require("path");

const REPO = process.env.GIT_REPO || "contabilidade-01/financehub";
const BRANCH = process.env.GIT_BRANCH || "financehub";

async function obterCommit() {
  const doArg = (process.env.GIT_COMMIT || "").trim();
  if (doArg && doArg !== "unknown") return doArg;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "financehub-build" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (typeof j.sha === "string" && /^[0-9a-f]{40}$/.test(j.sha)) return j.sha;
    throw new Error("resposta sem sha");
  } catch (e) {
    console.warn(`[build-info] não consegui obter o commit: ${e && e.message ? e.message : e}`);
    return "unknown";
  }
}

(async () => {
  const info = { commit: await obterCommit(), built_at: new Date().toISOString() };
  fs.writeFileSync(path.join(process.cwd(), "build-info.json"), JSON.stringify(info, null, 2));
  console.log(`[build-info] commit=${info.commit.slice(0, 7)} built_at=${info.built_at}`);
})();
