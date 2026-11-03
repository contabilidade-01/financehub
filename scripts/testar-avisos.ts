/**
 * Bateria dos avisos aos clientes (regras puras, sem banco).
 *   npx tsx scripts/testar-avisos.ts
 */
import { montarTexto, textoParaHtml, textoSemMarcacao, validarEntrada, primeiroNome, MODELOS } from "../server/services/avisos.service";

let falhas = 0;
function ok(nome: string, obtido: unknown, esperado: unknown) {
  const passou = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!passou) falhas++;
  console.log(`${passou ? "✅" : "❌"} ${nome}${passou ? "" : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const L = "https://app.tudocontado.com.br";
ok("variáveis", montarTexto("Oi {primeiro_nome} ({nome}) {link_app}", { nome: "Maria da Silva" }, L), `Oi Maria (Maria da Silva) ${L}`);
ok("sem nome vira 'cliente'", montarTexto("Oi {primeiro_nome}!", { nome: "" }, L), "Oi cliente!");
ok("variável desconhecida fica", montarTexto("{outra}", { nome: "Ana" }, L), "{outra}");
ok("primeiro nome", primeiroNome("  João  Paulo "), "João");
ok("html escapa tags", textoParaHtml("<script>x</script>"), "&lt;script&gt;x&lt;/script&gt;");
ok("html negrito e quebra", textoParaHtml("*oi*\nok"), "<strong>oi</strong><br>ok");
ok("html link", textoParaHtml(`veja ${L}`), `veja <a href="${L}">${L}</a>`);
ok("sem marcação", textoSemMarcacao("*novo* endereço"), "novo endereço");

const base = { titulo: "Aviso", mensagem: "Mensagem de teste ok", canais: ["whatsapp"], publico: { tipo: "todos" } };
ok("entrada válida", validarEntrada(base), null);
ok("título curto", typeof validarEntrada({ ...base, titulo: "a" }), "string");
ok("canal inválido", typeof validarEntrada({ ...base, canais: ["sms"] }), "string");
ok("sem canal", typeof validarEntrada({ ...base, canais: [] }), "string");
ok("público inválido", typeof validarEntrada({ ...base, publico: { tipo: "x" } }), "string");
ok("selecionados sem ids", typeof validarEntrada({ ...base, publico: { tipo: "selecionados", usuarios: [] } }), "string");
ok("selecionados com ids", validarEntrada({ ...base, publico: { tipo: "selecionados", usuarios: [5, 59] } }), null);
ok("modelo de domínio cita login e link", /e-mail e senha/.test(MODELOS[0].mensagem) && /\{link_app\}/.test(MODELOS[0].mensagem), true);

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nOK — avisos");
