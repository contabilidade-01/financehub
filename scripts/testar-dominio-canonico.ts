/**
 * Bateria do redirect de domínio canônico (sem banco).
 *   npx tsx scripts/testar-dominio-canonico.ts
 */
import { destinoRedirect, hostCanonico } from "../server/middleware/dominio-canonico.middleware";

const NOVO = { BASE_URL: "https://app.tudocontado.com.br" } as NodeJS.ProcessEnv;
const ANTIGO = { BASE_URL: "https://app.controledinheiro.com.br" } as NodeJS.ProcessEnv;

const req = (method: string, hostname: string, url: string) => ({
  method,
  hostname,
  path: url.split("?")[0],
  originalUrl: url,
});

let falhas = 0;
function ok(nome: string, obtido: unknown, esperado: unknown) {
  const passou = obtido === esperado;
  if (!passou) falhas++;
  console.log(`${passou ? "✅" : "❌"} ${nome}${passou ? "" : ` — obtido ${obtido}, esperado ${esperado}`}`);
}

ok("host canônico", hostCanonico(NOVO), "app.tudocontado.com.br");
ok("página antiga → novo (mantém caminho e query)",
  destinoRedirect(req("GET", "app.controledinheiro.com.br", "/p/transacoes?mes=10"), NOVO),
  "https://app.tudocontado.com.br/p/transacoes?mes=10");
ok("raiz antiga → novo", destinoRedirect(req("GET", "app.controledinheiro.com.br", "/"), NOVO), "https://app.tudocontado.com.br/");
ok("HEAD também redireciona", destinoRedirect(req("HEAD", "app.controledinheiro.com.br", "/login"), NOVO), "https://app.tudocontado.com.br/login");
ok("webhook Asaas (POST) segue no antigo", destinoRedirect(req("POST", "app.controledinheiro.com.br", "/api/webhooks/asaas"), NOVO), null);
ok("GET /api segue no antigo", destinoRedirect(req("GET", "app.controledinheiro.com.br", "/api/health"), NOVO), null);
ok("/ws segue no antigo", destinoRedirect(req("GET", "app.controledinheiro.com.br", "/ws"), NOVO), null);
ok("domínio novo não redireciona", destinoRedirect(req("GET", "app.tudocontado.com.br", "/"), NOVO), null);
ok("site de vendas novo não redireciona", destinoRedirect(req("GET", "tudocontado.com.br", "/"), NOVO), null);
ok("com BASE_URL antiga nada muda", destinoRedirect(req("GET", "app.controledinheiro.com.br", "/"), ANTIGO), null);
ok("sem BASE_URL nada muda", destinoRedirect(req("GET", "app.controledinheiro.com.br", "/"), {} as NodeJS.ProcessEnv), null);
ok("/apix não é /api",
  destinoRedirect(req("GET", "app.controledinheiro.com.br", "/apix"), NOVO), "https://app.tudocontado.com.br/apix");

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nOK — domínio canônico");
