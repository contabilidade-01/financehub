/**
 * Fase 0 (segurança) — validações puras, sem banco.
 * npm run test:seguranca
 */
import path from "path";
import { resolverArquivoSeguro } from "../server/utils/safe-path";
import { autenticarWebhookUazapi } from "../server/utils/uazapi-webhook-auth";

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const check = (cond: boolean, n: string) => {
  if (cond) ok(n);
  else {
    falhas++;
    console.error("FAIL", n);
  }
};

// ---- Path traversal nos downloads ----
const base = path.join(process.cwd(), "public", "charts");
check(resolverArquivoSeguro(base, "grafico-123.svg") === path.join(base, "grafico-123.svg"), "nome válido resolve dentro do diretório");
for (const ruim of ["../../.env", "..%2F.env", "../.env", "/etc/passwd", "a/b.png", "..", ".env", "", "x\\..\\y"]) {
  check(resolverArquivoSeguro(base, ruim) === null, `bloqueia ${JSON.stringify(ruim)}`);
}
check(resolverArquivoSeguro(base, 123 as any) === null, "bloqueia não-string");

// ---- Token de checkout assinado ----
(async () => {
  process.env.SESSION_SECRET = "x".repeat(40);
  const { generateCheckoutToken, decodeCheckoutToken } = await import("../server/utils/checkout-token.utils");
  const t = generateCheckoutToken(42, "a@b.com", "anual");
  const d = decodeCheckoutToken(t);
  check(!!d && d.userId === 42 && d.email === "a@b.com" && d.ciclo === "anual", "token assinado decodifica");
  const [b64] = t.split(".");
  const forjado = Buffer.from("1:admin@x.com").toString("base64url");
  check(decodeCheckoutToken(`${forjado}.${t.split(".")[1]}`) === null, "assinatura de outro payload é rejeitada");
  check(decodeCheckoutToken(`${b64}.AAAA`) === null, "assinatura inválida é rejeitada");
  process.env.CHECKOUT_LEGACY_ATE = "2000-01-01";
  check(decodeCheckoutToken(forjado) === null, "token legado sem assinatura rejeitado após o prazo");
  process.env.CHECKOUT_LEGACY_ATE = "2999-01-01";
  check(decodeCheckoutToken(forjado)?.userId === 1, "token legado aceito dentro do prazo");

  // ---- Autenticação do webhook UazAPI ----
  const req = (body: any, query: any = {}, headers: Record<string, string> = {}) => ({
    body,
    query,
    header: (n: string) => headers[n.toLowerCase()],
  }) as any;
  process.env.UAZAPI_TOKEN = "tok-principal";
  delete process.env.UAZAPI_WEBHOOK_TOKENS;
  delete process.env.UAZAPI_WEBHOOK_SECRET;
  check(autenticarWebhookUazapi(req({ token: "tok-principal" })) === "tok-principal", "webhook aceita token da instância");
  check(autenticarWebhookUazapi(req({ token: "outro" })) === null, "webhook rejeita token desconhecido");
  check(autenticarWebhookUazapi(req({})) === null, "webhook rejeita sem token");
  process.env.UAZAPI_WEBHOOK_TOKENS = "tok-2, tok-3";
  check(autenticarWebhookUazapi(req({ token: "tok-3" })) === "tok-3", "webhook aceita token extra da lista");
  process.env.UAZAPI_WEBHOOK_SECRET = "s3cr3t";
  check(autenticarWebhookUazapi(req({ token: "tok-principal" })) === null, "com segredo definido, exige o segredo");
  check(autenticarWebhookUazapi(req({ token: "tok-principal" }, { secret: "s3cr3t" })) === "tok-principal", "segredo via query");
  check(autenticarWebhookUazapi(req({ token: "tok-principal" }, {}, { "x-webhook-secret": "s3cr3t" })) === "tok-principal", "segredo via header");
  delete process.env.UAZAPI_TOKEN;
  delete process.env.UAZAPI_WEBHOOK_TOKENS;
  delete process.env.UAZAPI_WEBHOOK_SECRET;
  check(autenticarWebhookUazapi(req({ token: "qualquer" })) === null, "sem token configurado, rejeita tudo");

  // ---- Tokens de API só com hash ----
  const { hashApiToken, mascararApiToken, exibicaoApiToken } = await import("../server/utils/api-token-hash");
  const tk = "fin_" + "a".repeat(60) + "beef";
  check(hashApiToken(tk).startsWith("sha256:") && hashApiToken(tk) === hashApiToken(tk), "hash de token determinístico");
  check(!hashApiToken(tk).includes(tk), "hash não contém o token");
  check(mascararApiToken(tk) === "fin_aaaaaa...beef", "máscara do token");
  check(exibicaoApiToken({ token: hashApiToken(tk) }) === "...", "nunca exibe o hash");

  // ---- Conta desligada pelo admin x assinatura vencida ----
  const { contaBloqueadaPeloAdmin } = await import("../server/utils/usuario-ativo");
  const futuro = new Date(Date.now() + 86400000);
  const passado = new Date(Date.now() - 86400000);
  check(contaBloqueadaPeloAdmin({ ativo: false, data_expiracao_assinatura: futuro }) === true, "desligado pelo admin bloqueia");
  check(contaBloqueadaPeloAdmin({ ativo: false, data_expiracao_assinatura: passado }) === false, "vencido entra para pagar");
  check(contaBloqueadaPeloAdmin({ ativo: false, status_assinatura: "degustacao_expirada" }) === false, "degustação expirada entra para pagar");
  check(contaBloqueadaPeloAdmin({ ativo: true }) === false, "ativo entra");

  // ---- Bloqueio de login por conta ----
  const { loginBloqueado, registrarFalhaLogin, registrarSucessoLogin } = await import("../server/utils/login-lockout");
  const t0 = Date.now();
  for (let i = 0; i < 9; i++) registrarFalhaLogin("X@y.com", t0);
  check(loginBloqueado("x@y.com", t0) === 0, "9 erros ainda não bloqueia");
  registrarFalhaLogin("x@y.com", t0);
  check(loginBloqueado("x@y.com", t0) === 15, "10º erro bloqueia 15 min (e-mail sem diferenciar maiúsculas)");
  check(loginBloqueado("x@y.com", t0 + 16 * 60000) === 0, "bloqueio expira");
  registrarFalhaLogin("z@y.com", t0); registrarSucessoLogin("z@y.com");
  check(loginBloqueado("z@y.com", t0) === 0, "sucesso zera contagem");

  if (falhas) {
    console.error(`\n${falhas} falha(s)`);
    process.exit(1);
  }
  console.log("\nTodos os testes de segurança passaram.");
})();
