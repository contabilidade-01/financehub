import type { Request, Response, NextFunction } from "express";

/**
 * Domínio canônico do app.
 *
 * Quem abrir uma PÁGINA pelo domínio antigo (ex.: app.controledinheiro.com.br)
 * é redirecionado (301) para o mesmo caminho no domínio de PUBLIC_APP_URL/BASE_URL.
 *
 * Fica de fora, de propósito:
 *  - /api/* — webhooks do Asaas, UazAPI, WAHA e Cora e integrações por token
 *    continuam respondendo no domínio antigo (POST não sobrevive a redirect);
 *  - /ws — WebSocket;
 *  - métodos que não sejam GET/HEAD.
 *
 * Só age quando o host da requisição está em LEGACY_APP_HOSTS e o domínio
 * canônico é diferente dele: enquanto BASE_URL apontar para o domínio antigo,
 * nada muda.
 */
const HOSTS_ANTIGOS_PADRAO = "app.controledinheiro.com.br";

export function hostCanonico(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = (env.PUBLIC_APP_URL || env.BASE_URL || "").trim();
  if (!base) return null;
  try {
    return new URL(base).host.toLowerCase();
  } catch {
    return null;
  }
}

export function hostsAntigos(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.LEGACY_APP_HOSTS || HOSTS_ANTIGOS_PADRAO)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Devolve a URL de destino do redirect, ou null quando a requisição segue normal. */
export function destinoRedirect(
  req: { method: string; hostname?: string; path: string; originalUrl: string },
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const host = (req.hostname || "").toLowerCase();
  if (!host || !hostsAntigos(env).includes(host)) return null;
  const canonico = hostCanonico(env);
  if (!canonico || canonico === host) return null;
  const p = req.path || "/";
  if (p === "/api" || p.startsWith("/api/") || p === "/ws" || p.startsWith("/ws/")) return null;
  return `https://${canonico}${req.originalUrl || "/"}`;
}

export function dominioCanonico(req: Request, res: Response, next: NextFunction) {
  const destino = destinoRedirect(req);
  if (!destino) return next();
  res.redirect(301, destino);
}
