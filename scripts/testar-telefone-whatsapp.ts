/**
 * Casamento do número do WhatsApp com o telefone do cadastro — lógica pura.
 * npm run test:telefone-whatsapp
 */
import { variantesTelefone } from "../server/services/telefone-whatsapp";

let falhas = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  const okk = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (okk) console.log("ok  ", nome);
  else {
    falhas++;
    console.error("FAIL", nome, "obtido:", obtido, "esperado:", esperado);
  }
};
const contem = (nome: string, lista: string[], valor: string) => eq(nome, lista.includes(valor), true);

const comNove = variantesTelefone("5511970651429@s.whatsapp.net");
contem("chatid com 9 casa cadastro sem 55", comNove, "11970651429");
contem("chatid com 9 casa cadastro com 55", comNove, "5511970651429");
contem("chatid com 9 casa cadastro sem o 9", comNove, "1170651429");

const semNove = variantesTelefone("555193219036@s.whatsapp.net");
contem("chatid sem 9 casa cadastro sem 9", semNove, "5193219036");
contem("chatid sem 9 casa cadastro com o 9 (admin)", semNove, "51993219036");
contem("chatid sem 9 casa cadastro com 55 e 9", semNove, "5551993219036");

eq("fixo (3º dígito 2-5) não ganha 9", variantesTelefone("551132654321").sort(), ["1132654321", "551132654321"].sort());
eq("telefone já sem 55", variantesTelefone("11970651429").includes("11970651429"), true);
eq("lixo devolve vazio", variantesTelefone("123@s.whatsapp.net"), []);
eq("vazio devolve vazio", variantesTelefone(""), []);

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntelefone-whatsapp OK");
