/**
 * Proteção contra CSRF pela origem da requisição.
 *
 * A sessão é por cookie (sameSite=lax), então um site de terceiro não consegue
 * mandar o cookie num POST comum — mas subdomínios do mesmo "site", navegadores
 * antigos e o login CSRF (logar a vítima na conta do atacante) ficam de fora do
 * lax. Aqui, toda requisição que altera dados (POST/PUT/PATCH/DELETE) vinda de
 * um navegador precisa ter origem no próprio app.
 *
 * Integrações servidor-a-servidor (webhooks Asaas/UazAPI/Cora, tokens de API)
 * não mandam Origin nem Sec-Fetch-Site, então passam sem mudança.
 */

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export type ReqCsrf = {
  method: string;
  header: (nome: string) => string | undefined;
};

function hostDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosts aceitos: o do próprio pedido, o do BASE_URL e os de CSRF_ORIGENS_PERMITIDAS (vírgula). */
export function hostsPermitidos(req: ReqCsrf): Set<string> {
  const hosts = new Set<string>();
  for (const h of [req.header("x-forwarded-host"), req.header("host")]) {
    // x-forwarded-host pode vir como lista ("a, b"); o primeiro é o do cliente.
    const primeiro = h?.split(",")[0]?.trim().toLowerCase();
    if (primeiro) hosts.add(primeiro);
  }
  const base = hostDe(process.env.BASE_URL);
  if (base) hosts.add(base);
  for (const o of (process.env.CSRF_ORIGENS_PERMITIDAS || "").split(",")) {
    const h = hostDe(o.trim());
    if (h) hosts.add(h);
  }
  return hosts;
}

/** Motivo da recusa, ou null quando a requisição pode seguir. */
export function motivoCsrf(req: ReqCsrf): string | null {
  if (METODOS_SEGUROS.has(req.method.toUpperCase())) return null;
  // Token de API vai no header, não no cookie: navegador de terceiro não o envia sozinho.
  if (/^Bearer\s+/i.test(req.header("authorization") || "")) return null;

  if ((req.header("sec-fetch-site") || "").toLowerCase() === "cross-site") return "sec-fetch-site=cross-site";

  const origem = req.header("origin");
  if (origem !== undefined) {
    const host = hostDe(origem); // "null" (iframe sandbox, file://) não tem host
    if (!host || !hostsPermitidos(req).has(host)) return `origin=${host ?? "null"}`;
    return null;
  }

  // Sem Origin: usa o Referer quando houver (alguns navegadores omitem Origin).
  const ref = hostDe(req.header("referer"));
  if (ref && !hostsPermitidos(req).has(ref)) return `referer=${ref}`;
  return null;
}
