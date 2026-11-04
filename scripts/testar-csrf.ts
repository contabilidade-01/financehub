/**
 * CSRF por verificação de origem — lógica pura, sem servidor.
 * npm run test:csrf
 */
import { avaliarOrigem, origemWebSocketPermitida } from "../server/middleware/csrf-origem.middleware";

let falhas = 0;
const check = (cond: boolean, n: string) => {
  if (cond) console.log("ok  ", n);
  else {
    falhas++;
    console.error("FAIL", n);
  }
};

const env = { BASE_URL: "https://app.tudocontado.com.br", LEGACY_APP_HOSTS: "app.controledinheiro.com.br" } as any;
const base = { method: "POST", path: "/api/transactions", host: "app.tudocontado.com.br", cookie: "connect.sid=s%3Aabc; outro=1" };
const ok = (r: any) => avaliarOrigem({ ...base, ...r }, env).ok;

check(ok({ origin: "https://app.tudocontado.com.br" }), "POST da própria página passa");
check(ok({ origin: "https://app.controledinheiro.com.br" }), "POST do domínio antigo passa");
check(ok({ secFetchSite: "same-origin", origin: "null" }), "same-origin (Sec-Fetch-Site) passa mesmo com Origin null");
check(!ok({ origin: "https://evil.example" }), "POST de outro site é bloqueado");
check(!ok({ origin: "https://evil.example", secFetchSite: "cross-site" }), "cross-site com Origin estranho é bloqueado");
check(!ok({ origin: "https://app.tudocontado.com.br.evil.example" }), "host parecido é bloqueado");
check(!ok({ referer: "https://evil.example/pagina" }), "sem Origin, Referer de outro site é bloqueado");
check(ok({ referer: "https://app.tudocontado.com.br/transacoes" }), "sem Origin, Referer do app passa");
check(!ok({ origin: "null", secFetchSite: "cross-site" }), "Origin null vindo de outro site é bloqueado");
check(ok({ origin: "null" }), "navegador antigo (sem Sec-Fetch-Site) com Origin null passa (fica o SameSite=Lax)");
check(ok({}), "sem Origin nem Referer (cliente fora do navegador) passa");
check(ok({ origin: "https://evil.example", cookie: "" }), "sem cookie de sessão não há o que proteger");
check(ok({ origin: "https://evil.example", authorization: "Bearer tok_123" }), "integração por token passa");
check(ok({ origin: "https://evil.example", method: "GET" }), "GET não é bloqueado");
check(ok({ origin: "https://evil.example", path: "/login" }), "fora de /api não é bloqueado");
check(ok({ origin: "https://evil.example", path: "/api/webhook/uazapi", cookie: "" }), "webhook sem cookie passa");
check(ok({ origin: "http://localhost:5001", host: "localhost:5001" }), "dev local (mesmo host) passa");
check(avaliarOrigem({ ...base, origin: "https://parceiro.example" }, { ...env, CSRF_ORIGENS_EXTRAS: "parceiro.example" }).ok, "CSRF_ORIGENS_EXTRAS libera host extra");

check(origemWebSocketPermitida("https://app.tudocontado.com.br", "app.tudocontado.com.br", env), "WebSocket do app passa");
check(!origemWebSocketPermitida("https://evil.example", "app.tudocontado.com.br", env), "WebSocket aberto por outro site é recusado");
check(origemWebSocketPermitida(undefined, "app.tudocontado.com.br", env), "WebSocket sem Origin (fora do navegador) passa");
check(origemWebSocketPermitida("https://evil.example", "x", { ...env, CSRF_ORIGEM: "off" }), "CSRF_ORIGEM=off desliga");

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTodos os testes de CSRF passaram.");
