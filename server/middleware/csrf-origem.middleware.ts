import type { Request, Response, NextFunction } from "express";
import { hostCanonico, hostsAntigos } from "./dominio-canonico.middleware";

/**
 * Proteção CSRF por verificação de origem (OWASP: "Verifying Origin With Standard Headers").
 *
 * Toda requisição que altera dados (POST/PUT/PATCH/DELETE em /api) e chega com o
 * cookie de sessão precisa vir de uma página do próprio app: o navegador manda o
 * cabeçalho Origin (ou Referer), e ele tem de ser um dos hosts do app.
 *
 * Fica de fora, de propósito (não carregam o cookie de sessão do usuário):
 *  - webhooks (Asaas, UazAPI, WAHA, Cora) e integrações por token (Authorization: Bearer);
 *  - clientes sem navegador (sem Origin nem Referer).
 *
 * Soma-se ao cookie SameSite=Lax (que já barra o POST de outro site na maioria
 * dos navegadores). CSRF_ORIGEM=report só registra; CSRF_ORIGEM=off desliga.
 * CSRF_ORIGENS_EXTRAS=host1,host2 libera outros hosts, se algum dia precisar.
 */

export const COOKIE_SESSAO = "connect.sid";
const METODOS_QUE_ALTERAM = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function hostsPermitidos(hostDaRequisicao: string | undefined, env: NodeJS.ProcessEnv = process.env): Set<string> {
  const s = new Set<string>();
  const add = (h?: string | null) => {
    const v = (h || "").trim().toLowerCase();
    if (v) s.add(v);
  };
  add(hostDaRequisicao);
  add(hostCanonico(env));
  for (const h of hostsAntigos(env)) add(h);
  for (const h of (env.CSRF_ORIGENS_EXTRAS || "").split(",")) add(h);
  return s;
}

function hostDe(url: string | undefined): string | null | "invalido" {
  if (!url) return null;
  if (url === "null") return "invalido"; // iframe sandbox, file://, redirect entre origens
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "invalido";
  }
}

export type Avaliacao = { ok: true } | { ok: false; motivo: string };

/** Lógica pura (testável sem servidor). */
export function avaliarOrigem(
  r: {
    method: string;
    path: string;
    host?: string;
    origin?: string;
    referer?: string;
    cookie?: string;
    authorization?: string;
    secFetchSite?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Avaliacao {
  if (!METODOS_QUE_ALTERAM.has(r.method.toUpperCase())) return { ok: true };
  if (!(r.path === "/api" || r.path.startsWith("/api/"))) return { ok: true };
  // Sem cookie de sessão não há credencial do usuário para um site malicioso usar.
  const temSessao = (r.cookie || "").split(";").some((c) => c.trim().startsWith(`${COOKIE_SESSAO}=`));
  if (!temSessao) return { ok: true };
  // Integração por token: o navegador não manda esse cabeçalho sozinho.
  if (/^Bearer\s+\S+/i.test(r.authorization || "")) return { ok: true };

  // Sec-Fetch-Site é posto pelo próprio navegador (a página não consegue forjar).
  const sfs = (r.secFetchSite || "").toLowerCase();
  if (sfs === "same-origin" || sfs === "none") return { ok: true };

  const host = hostDe(r.origin) ?? hostDe(r.referer);
  if (host === null) return { ok: true }; // sem Origin/Referer: cliente fora do navegador
  if (host === "invalido") {
    // Navegador antigo (sem Sec-Fetch-Site) manda "Origin: null" no POST da própria página
    // quando a política de referrer é no-referrer. Aí vale só o SameSite=Lax do cookie.
    if (!sfs && r.origin === "null") return { ok: true };
    return { ok: false, motivo: "origem inválida" };
  }
  if (hostsPermitidos(r.host, env).has(host)) return { ok: true };
  return { ok: false, motivo: "origem não permitida" };
}

export function csrfOrigem(req: Request, res: Response, next: NextFunction) {
  const modo = (process.env.CSRF_ORIGEM || "enforce").toLowerCase();
  if (modo === "off") return next();
  const r = avaliarOrigem({
    method: req.method,
    path: req.path,
    host: req.get("host"),
    origin: req.get("origin"),
    referer: req.get("referer"),
    cookie: req.get("cookie"),
    authorization: req.get("authorization"),
    secFetchSite: req.get("sec-fetch-site"),
  });
  if (r.ok) return next();
  console.warn(`[CSRF] ${modo === "report" ? "(só registro) " : ""}requisição recusada: ${r.motivo}`);
  if (modo === "report") return next();
  return res.status(403).json({ error: "Requisição bloqueada por segurança (origem não permitida)." });
}

/** WebSocket: o navegador sempre manda Origin no upgrade; recusa conexão aberta por outro site. */
export function origemWebSocketPermitida(origin: string | undefined, host: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.CSRF_ORIGEM || "enforce").toLowerCase() === "off") return true;
  const h = hostDe(origin);
  if (h === null) return true;
  if (h === "invalido") return false;
  return hostsPermitidos(host, env).has(h);
}
