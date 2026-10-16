/**
 * Carteira Nescon no Cora — regras puras (sem rede nem banco). npm run test:cora-carteira
 */
import { boletoDaCarteira, filtroValido, normalizarClientesPortal } from "../server/services/cora/carteira-nescon";
import { resumoDaListagem } from "../server/services/cora/cora.client";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// Resposta do portal (GET /api/interno/clientes-carteira)
const clientes = normalizarClientesPortal({
  gerado_em: "2026-10-16T12:00:00Z",
  clientes: [
    { cnpj: "11.222.333/0001-81", nome: "Mercado Bom Preço", email: "FIN@BOMPRECO.COM.BR", telefone: "(11) 98888-7777", carteira: "nescon", inativo: false },
    { cnpj: "52998224725", nome: "João Pessoal", email: null, telefone: null, carteira: "jean", inativo: false },
    { cnpj: "123", nome: "Documento ruim", carteira: "nescon" },
    { cnpj: "44555666000199", nome: "Carteira desconhecida", carteira: "outra" },
    { cnpj: "77888999000100", nome: "Arquivada", carteira: "NESCON", inativo: true },
    { cnpj: "52998224725", nome: "João Pessoal (repetido)", carteira: "jean" },
  ],
});
eq("descarta inválidos e repetidos", clientes.map((c) => c.documento), ["11222333000181", "52998224725", "77888999000100"]);
eq("normaliza contato", clientes[0], {
  documento: "11222333000181", nome: "Mercado Bom Preço", email: "fin@bompreco.com.br", telefone: "11988887777", carteira: "nescon", inativo: false,
});
eq("repetido fica com o último", clientes[1].nome, "João Pessoal (repetido)");
eq("carteira em maiúscula", clientes[2].carteira, "nescon");
eq("aceita lista crua", normalizarClientesPortal([{ cnpj: "11222333000181", carteira: "jean" }]).length, 1);
let erro = "";
try { normalizarClientesPortal({ erro: "x" }); } catch (e: any) { erro = e.message; }
eq("resposta sem lista falha", erro !== "", true);

// Filtro: só cliente Nescon entra; na dúvida, fica de fora
const mapa = new Map(clientes.map((c) => [c.documento, c.carteira]));
eq("cliente nescon entra", boletoDaCarteira("11.222.333/0001-81", mapa), true);
eq("cliente pessoal do Jean fica de fora", boletoDaCarteira("52998224725", mapa), false);
eq("pagador fora do portal fica de fora", boletoDaCarteira("99888777000166", mapa), false);
eq("boleto sem documento fica de fora", boletoDaCarteira(null, mapa), false);
eq("nescon arquivado ainda entra (boleto antigo pago)", boletoDaCarteira("77888999000100", mapa), true);

// Integra com o resumo do boleto Cora (documento do pagador)
const resumo = resumoDaListagem({ id: "inv_1", status: "OPEN", due_date: "2026-10-20", total_amount: 45000, customer: { name: "Mercado", document: { identity: "11222333000181" } } });
eq("documento do boleto casa com a carteira", boletoDaCarteira(resumo?.cliente.documento, mapa), true);

eq("filtro padrão", filtroValido(undefined), "todos");
eq("filtro nescon", filtroValido("carteira_nescon"), "carteira_nescon");
eq("filtro desconhecido vira todos", filtroValido("x"), "todos");

if (falhas) {
  console.error(`\n${falhas}/${total} verificação(ões) falharam.`);
  process.exit(1);
}
console.log(`OK — carteira Nescon: ${total} verificações.`);
