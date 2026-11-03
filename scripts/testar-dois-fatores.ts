/**
 * 2FA (TOTP) — lógica pura, sem banco.
 * npm run test:dois-fatores
 */
import {
  assinarNavegadorConfiavel,
  navegadorConfiavelValido,
  base32Decode,
  base32Encode,
  codigoDoPasso,
  consumirCodigoRecuperacao,
  gerarCodigosRecuperacao,
  gerarSegredo,
  hashCodigoRecuperacao,
  passoAtual,
  urlOtpAuth,
  verificarCodigoTotp,
} from "../server/services/dois-fatores-logic";

let falhas = 0;
const check = (cond: boolean, n: string) => {
  if (cond) console.log("ok  ", n);
  else {
    falhas++;
    console.error("FAIL", n);
  }
};

// Vetores oficiais da RFC 6238 (SHA1, segredo "12345678901234567890"), 6 últimos dígitos.
const rfc = base32Encode(Buffer.from("12345678901234567890"));
check(base32Decode(rfc).toString() === "12345678901234567890", "base32 ida e volta");
for (const [t, esperado] of [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
] as const) {
  check(codigoDoPasso(rfc, Math.floor(t / 30)) === esperado, `RFC 6238 t=${t} → ${esperado}`);
}

const seg = gerarSegredo();
check(/^[A-Z2-7]{32}$/.test(seg) && seg !== gerarSegredo(), "segredo novo: 160 bits em base32, aleatório");

const agora = 1_762_200_000_000;
const p = passoAtual(agora);
const cod = codigoDoPasso(seg, p);
check(verificarCodigoTotp(seg, cod, { agoraMs: agora }) === p, "aceita o código do passo atual");
check(verificarCodigoTotp(seg, ` ${cod.slice(0, 3)} ${cod.slice(3)} `, { agoraMs: agora }) === p, "aceita com espaços");
check(verificarCodigoTotp(seg, codigoDoPasso(seg, p - 1), { agoraMs: agora }) === p - 1, "aceita 30s de atraso do relógio");
check(verificarCodigoTotp(seg, codigoDoPasso(seg, p + 1), { agoraMs: agora }) === p + 1, "aceita 30s de adiantamento");
check(verificarCodigoTotp(seg, codigoDoPasso(seg, p - 3), { agoraMs: agora }) === null, "recusa código de 90s atrás");
check(verificarCodigoTotp(seg, cod, { agoraMs: agora, ultimoPassoUsado: p }) === null, "recusa reuso do mesmo código");
check(verificarCodigoTotp(seg, "12345", { agoraMs: agora }) === null, "recusa 5 dígitos");
check(verificarCodigoTotp(seg, "abcdef", { agoraMs: agora }) === null, "recusa letras");
check(verificarCodigoTotp(seg, undefined, { agoraMs: agora }) === null, "recusa vazio");

const url = urlOtpAuth(seg, "a@b.com", "Tudo Contado");
check(url.startsWith("otpauth://totp/Tudo%20Contado%3Aa%40b.com?") && url.includes(`secret=${seg}`), "link otpauth");

const cods = gerarCodigosRecuperacao();
check(cods.length === 10 && new Set(cods).size === 10, "10 códigos de recuperação distintos");
check(cods.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)), "formato XXXX-XXXX sem 0/O/1/I");
const hashes = cods.map(hashCodigoRecuperacao);
const resto = consumirCodigoRecuperacao(hashes, cods[3].toLowerCase().replace("-", " "));
check(!!resto && resto.length === 9 && !resto.includes(hashes[3]), "código de recuperação vale (minúsculas/espaço) e é gasto");
check(consumirCodigoRecuperacao(resto || [], cods[3]) === null, "código de recuperação não vale duas vezes");
check(consumirCodigoRecuperacao(hashes, "ZZZZ-ZZZZ") === null, "recusa código inexistente");

// "Lembrar este navegador"
const K = "chave-teste";
const tok = assinarNavegadorConfiavel(K, 7, seg, agora);
check(navegadorConfiavelValido(K, tok, 7, seg, agora + 29 * 86400000), "navegador lembrado vale por 30 dias");
check(!navegadorConfiavelValido(K, tok, 7, seg, agora + 31 * 86400000), "expira depois de 30 dias");
check(!navegadorConfiavelValido(K, tok, 8, seg, agora), "não vale para outra conta");
check(!navegadorConfiavelValido(K, tok, 7, gerarSegredo(), agora), "reativar o 2FA (segredo novo) invalida");
check(!navegadorConfiavelValido("outra", tok, 7, seg, agora), "assinatura com outra chave recusada");
const [u, , imp, ass] = tok.split(".");
check(!navegadorConfiavelValido(K, `${u}.${agora + 9e12}.${imp}.${ass}`, 7, seg, agora), "validade adulterada recusada");

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTodos os testes de 2FA passaram.");
