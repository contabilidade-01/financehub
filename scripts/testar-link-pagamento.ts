/**
 * Bateria do link de pagamento no WhatsApp (regras puras, sem banco).
 *   npx tsx scripts/testar-link-pagamento.ts
 */
process.env.SESSION_SECRET ||= "teste-link-pagamento";
import {
  destinoWhatsApp,
  textoLinkPagamento,
  textoLinkPagamentoCadastro,
  linkCheckoutApp,
} from "../server/services/link-pagamento-whatsapp";

let falhas = 0;
function ok(nome: string, cond: boolean) {
  if (!cond) falhas++;
  console.log(`${cond ? "✅" : "❌"} ${nome}`);
}

ok("usa o chat vinculado", destinoWhatsApp({ remotejid: "5511999990000@s.whatsapp.net", telefone: "11 98888-0000" }) === "5511999990000@s.whatsapp.net");
ok("grupo não serve: cai no telefone", destinoWhatsApp({ remotejid: "123@g.us", telefone: "(11) 98888-0000" }) === "11988880000");
ok("sem chat: telefone só dígitos", destinoWhatsApp({ telefone: "+55 (11) 98888-0000" }) === "5511988880000");
ok("telefone curto: sem destino", destinoWhatsApp({ telefone: "1234" }) === null);
ok("nada: sem destino", destinoWhatsApp({}) === null);

const t = textoLinkPagamento("Rafael Souza", "https://asaas.com/i/abc", "2026-11-25");
ok("texto: primeiro nome", t.startsWith("Oi Rafael!"));
ok("texto: link", t.includes("https://asaas.com/i/abc"));
ok("texto: vencimento BR", t.includes("25/11/2026"));
ok("texto sem nome", textoLinkPagamento("", "x").startsWith("Oi!"));
ok("texto sem vencimento", !textoLinkPagamento("Ana", "x").includes("Vencimento"));
ok("cadastro: degustação", textoLinkPagamentoCadastro("Ana", "x").includes("degustação"));

const l = linkCheckoutApp(7, "a@b.com", "mensal");
ok("checkout: rota com token", /\/checkout\/plans\?tokenaccess=[\w-]+\.[\w-]+$/.test(l));

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
