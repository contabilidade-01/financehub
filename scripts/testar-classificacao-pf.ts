/**
 * Fase 1 (IA) — categoria PF: nome do LLM, palavras-chave e chave de memória.
 * Usa o plano de contas base real. npm run test:classificacao-pf
 */
import { PLANO_CONTAS_BASE } from "../server/data/plano-contas-base";
import {
  casarCategoriaPorNome,
  sugerirCategoriaPorDescricao,
  chaveMemoria,
  chaveCasa,
  type CategoriaPf,
} from "../server/services/categorizar-pf";

const cats: CategoriaPf[] = PLANO_CONTAS_BASE.map((c, i) => ({ id: i + 1, nome: c.nome, tipo: c.tipo, descricao: c.descricao }));
let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

// Nomes que o LLM devolve (prompt antigo) → categoria real
const nomes: [string, string, string | undefined][] = [
  ["Farmácia", "Despesa", "Saúde"],
  ["farmacia", "Despesa", "Saúde"],
  ["Escola", "Despesa", "Educação"],
  ["Lazer", "Despesa", "Lazer / Entretenimento"],
  ["Outros", "Despesa", "Outras Despesas"],
  ["Outros", "Receita", "Outras Receitas"],
  ["Alimentacao", "Despesa", "Alimentação"],
  ["Restaurante", "Despesa", "Restaurante / Delivery"],
  ["Mercado", "Despesa", "Alimentação"],
  ["Combustível", "Despesa", "Transporte"],
  ["Contas de consumo", "Despesa", "Energia / Água / Gás"],
  ["Internet", "Despesa", "Internet / Telefone"],
  ["Streaming", "Despesa", "Assinaturas / Streaming"],
  ["Salário", "Receita", "Salário"],
  ["Renda extra", "Receita", "Freelance / Renda Extra"],
  ["Categoria Inexistente", "Despesa", undefined],
];
for (const [n, tipo, esp] of nomes) eq(`nome "${n}" (${tipo})`, casarCategoriaPorNome(n, cats, tipo)?.nome, esp);

// Descrições do dia a dia → categoria pela palavra-chave
const descricoes: [string, string, string | undefined][] = [
  ["uber pro trabalho", "Despesa", "Transporte"],
  ["gasolina posto shell", "Despesa", "Transporte"],
  ["drogasil", "Despesa", "Saúde"],
  ["remédio da minha mãe", "Despesa", "Saúde"],
  ["ifood sexta", "Despesa", "Restaurante / Delivery"],
  ["supermercado", "Despesa", "Alimentação"],
  ["feira de domingo", "Despesa", "Alimentação"],
  ["padaria", "Despesa", "Alimentação"],
  ["aluguel", "Despesa", "Moradia"],
  ["condomínio", "Despesa", "Moradia"],
  ["conta de luz", "Despesa", "Energia / Água / Gás"],
  ["sabesp", "Despesa", "Energia / Água / Gás"],
  ["netflix", "Despesa", "Assinaturas / Streaming"],
  ["mensalidade da faculdade", "Despesa", "Educação"],
  ["ração do cachorro", "Despesa", "Pets"],
  ["barbearia", "Despesa", "Cuidados Pessoais"],
  ["academia smartfit", "Despesa", "Cuidados Pessoais"],
  ["cinema com a família", "Despesa", "Lazer / Entretenimento"],
  ["tênis novo", "Despesa", "Vestuário"],
  ["dízimo", "Despesa", "Dízimos e Ofertas"],
  ["ipva", "Despesa", "Impostos / Taxas"],
  ["seguro do carro", "Despesa", "Seguros"],
  ["salário", "Receita", "Salário"],
  ["freela de design", "Receita", "Freelance / Renda Extra"],
  ["estorno cartão", "Receita", "Reembolso"],
  ["rendimento cdb", "Receita", "Investimentos"],
  ["vendi bicicleta", "Receita", "Vendas"],
  ["mercado livre fone", "Despesa", "Compras Diversas"],
  ["mercado do bairro", "Despesa", "Alimentação"],
  ["coisa aleatória", "Despesa", undefined],
];
for (const [d, tipo, esp] of descricoes) eq(`descrição "${d}" (${tipo})`, sugerirCategoriaPorDescricao(d, cats, tipo)?.categoria.nome, esp);

// Categoria criada pelo cliente, com descrição própria
const comCustom = [...cats, { id: 999, nome: "Filhos", tipo: "Despesa", descricao: "Fralda, brinquedo, babá" }];
eq("categoria do cliente pela descrição", sugerirCategoriaPorDescricao("fralda pampers", comCustom, "Despesa")?.categoria.nome, "Filhos");

// Categorias globais (cadastro pela web): sem "Restaurante / Delivery" etc. → mais próxima
const GLOBAIS = ["Alimentação", "Doações", "Dízimos e Ofertas", "Educação", "Freelance", "Impostos", "Investimentos", "Lazer",
  "Moradia", "Outros", "Presentes", "Reembolso", "Salário", "Saúde", "Serviços", "Transporte", "Vestuário"]
  .map((nome, i) => ({ id: 500 + i, nome, tipo: ["Freelance", "Investimentos", "Presentes", "Reembolso", "Salário"].includes(nome) ? "Receita" : "Despesa" }));
GLOBAIS.push({ id: 600, nome: "Outros", tipo: "Receita" });
const globais: [string, string, string | undefined][] = [
  ["Compra no débito - iFood", "Despesa", "Alimentação"],
  ["netflix", "Despesa", "Lazer"],
  ["unimed", "Despesa", "Saúde"],
  ["conta de luz", "Despesa", "Moradia"],
  ["uber", "Despesa", "Transporte"],
  ["freela site", "Receita", "Freelance"],
  ["ração do cachorro", "Despesa", "Outros"],
];
for (const [d, tipo, esp] of globais) eq(`globais: "${d}"`, sugerirCategoriaPorDescricao(d, GLOBAIS, tipo)?.categoria.nome, esp);
eq("globais: LLM 'Restaurante' → Alimentação", casarCategoriaPorNome("Restaurante", GLOBAIS, "Despesa")?.nome, "Alimentação");
eq("globais: LLM 'Farmácia' → Saúde", casarCategoriaPorNome("Farmácia", GLOBAIS, "Despesa")?.nome, "Saúde");

// Memória por palavras inteiras
eq("chave de memória", chaveMemoria("Uber pro trabalho 25,00"), "uber trabalho");
eq("chave casa descrição maior", chaveCasa("uber", "uber pro aeroporto"), true);
eq("chave não casa substring", chaveCasa("uber", "uberlandia viagem"), false);
eq("chave não casa outra palavra", chaveCasa("mercado", "mercado livre compra"), true);
eq("descrição curta casa chave maior", chaveCasa("padaria sao jose", "padaria"), true);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
