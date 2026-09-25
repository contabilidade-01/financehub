/**
 * Classificação de categorias PF sem depender do nome exato devolvido pelo LLM.
 *
 * O prompt antigo citava "Farmácia", "Escola", "Lazer", "Outros"; as categorias
 * reais são "Saúde", "Educação", "Lazer / Entretenimento", "Outras Despesas".
 * Com match exato, tudo isso caía em "Outras Despesas". Aqui:
 *   1) nome do LLM → categoria real (sem acento, sinônimos, sobreposição de palavras);
 *   2) descrição do lançamento → categoria pelas palavras-chave (dicionário +
 *      a descrição cadastrada de cada categoria, inclusive as criadas pelo cliente).
 */

export type CategoriaPf = { id: number; nome: string; tipo: string; descricao?: string | null };

export const norm = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "no", "na", "nos", "nas", "em", "com", "para", "pra", "pro",
  "um", "uma", "uns", "umas", "por", "que", "meu", "minha", "sua", "seu", "despesa", "receita", "variavel", "fixa",
  "gasto", "gastos", "conta", "contas", "pagamento", "compra", "compras", "paguei", "gastei", "comprei", "recebi", "outras", "outros",
]);

export function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * Palavra-chave → nome (normalizado) de categoria-base. Vale só se o cliente
 * tiver uma categoria com esse nome (ou que contenha essa palavra).
 */
const DICIONARIO: Record<string, string[]> = {
  "alimentacao": ["mercado", "supermercado", "feira", "acougue", "padaria", "hortifruti", "sacolao", "atacadao", "assai", "carrefour", "pao", "leite", "mercadinho", "quitanda", "emporio"],
  "restaurante delivery": ["restaurante", "lanchonete", "ifood", "rappi", "delivery", "pizza", "pizzaria", "hamburguer", "lanche", "almoco", "janta", "jantar", "cafe", "cafeteria", "sushi", "churrascaria", "marmita", "acai", "sorvete", "bar", "boteco", "cerveja", "chopp"],
  "transporte": ["uber", "99", "taxi", "gasolina", "combustivel", "etanol", "alcool", "diesel", "posto", "abastecimento", "abasteci", "estacionamento", "pedagio", "onibus", "metro", "passagem", "mecanico", "oficina", "pneu", "lavagem", "lava", "ipva", "licenciamento", "brt", "trem", "bilhete"],
  "saude": ["farmacia", "drogaria", "remedio", "medicamento", "consulta", "medico", "exame", "dentista", "hospital", "clinica", "laboratorio", "psicologo", "fisioterapia", "otica", "oculos", "vacina", "drogasil", "pague menos", "raia"],
  "plano saude": ["plano de saude", "unimed", "amil", "bradesco saude", "sulamerica", "hapvida", "odontoprev", "plano dental"],
  "educacao": ["escola", "faculdade", "curso", "mensalidade escolar", "material escolar", "livro", "livros", "apostila", "colegio", "universidade", "ingles", "idiomas", "matricula", "creche"],
  "moradia": ["aluguel", "condominio", "iptu", "financiamento imobiliario", "reforma", "pedreiro", "material de construcao", "diarista", "faxina", "moveis"],
  "energia agua gas": ["luz", "energia", "enel", "cemig", "copel", "coelba", "celpe", "agua", "sabesp", "copasa", "cedae", "embasa", "gas", "botijao", "comgas"],
  "internet telefone": ["internet", "celular", "telefone", "vivo", "claro", "tim", "recarga", "fibra", "tv a cabo", "sky"],
  "assinaturas streaming": ["netflix", "spotify", "disney", "prime video", "amazon prime", "hbo", "globoplay", "youtube premium", "icloud", "google one", "deezer", "paramount", "chatgpt", "assinatura"],
  "lazer entretenimento": ["cinema", "show", "ingresso", "teatro", "viagem", "hotel", "pousada", "airbnb", "passeio", "parque", "jogo", "games", "steam", "playstation", "xbox", "festa", "balada", "clube"],
  "vestuario": ["roupa", "roupas", "camisa", "calca", "tenis", "sapato", "sandalia", "vestido", "renner", "riachuelo", "cea", "zara", "shein", "calcado", "bolsa"],
  "cuidados pessoais": ["cabelo", "cabeleireiro", "cabelereiro", "barbearia", "barbeiro", "manicure", "unha", "estetica", "salao", "academia", "smartfit", "perfume", "maquiagem", "depilacao", "cosmeticos"],
  "pets": ["pet", "petshop", "racao", "veterinario", "vet", "banho e tosa", "cachorro", "gato", "petz", "cobasi"],
  "dizimos ofertas": ["dizimo", "oferta", "igreja", "templo", "contribuicao religiosa"],
  "doacoes": ["doacao", "vaquinha", "ong", "caridade"],
  "impostos taxas": ["imposto", "taxa", "multa", "irpf", "darf", "tarifa", "anuidade", "cartorio", "iof"],
  "seguros": ["seguro", "porto seguro", "seguro do carro", "seguro de vida"],
  "financiamentos parcelas fixas": ["emprestimo", "consorcio", "prestacao", "financiamento", "parcela do carro"],
  "compras diversas": ["eletronico", "eletronicos", "magazine", "americanas", "mercado livre", "amazon", "shopee", "aliexpress", "presente", "utensilio", "casas bahia"],
  // Receitas
  "salario": ["salario", "pro labore", "prolabore", "holerite", "adiantamento", "13o", "decimo terceiro", "ferias"],
  "freelance renda extra": ["freela", "freelance", "bico", "renda extra", "comissao", "servico prestado"],
  "investimentos": ["rendimento", "rendimentos", "dividendo", "dividendos", "juros", "cdb", "tesouro", "poupanca", "aluguel recebido", "fii"],
  "vendas": ["venda", "vendi", "vendas", "marketplace", "olx", "enjoei"],
  "reembolso": ["reembolso", "estorno", "devolucao", "cashback", "restituicao"],
  "presentes recebidos": ["presente recebido", "ganhei", "mesada"],
};

/** Sinônimos de nomes que o LLM costuma dar → nome-base real. */
const ALIAS_NOME: Record<string, string> = {
  farmacia: "saude", remedios: "saude", medico: "saude", saude: "saude",
  escola: "educacao", estudos: "educacao", cursos: "educacao",
  lazer: "lazer entretenimento", entretenimento: "lazer entretenimento", diversao: "lazer entretenimento",
  mercado: "alimentacao", supermercado: "alimentacao", comida: "alimentacao",
  restaurante: "restaurante delivery", delivery: "restaurante delivery", ifood: "restaurante delivery",
  combustivel: "transporte", gasolina: "transporte", uber: "transporte", carro: "transporte",
  aluguel: "moradia", casa: "moradia", condominio: "moradia",
  luz: "energia agua gas", energia: "energia agua gas", agua: "energia agua gas", "contas de consumo": "energia agua gas",
  internet: "internet telefone", celular: "internet telefone", telefone: "internet telefone",
  streaming: "assinaturas streaming", assinaturas: "assinaturas streaming",
  roupas: "vestuario", vestuario: "vestuario",
  beleza: "cuidados pessoais", academia: "cuidados pessoais",
  pet: "pets", animais: "pets",
  "trabalho profissional": "compras diversas", "trabalho": "compras diversas",
  impostos: "impostos taxas", taxas: "impostos taxas",
  dizimo: "dizimos ofertas", dizimos: "dizimos ofertas",
  "renda extra": "freelance renda extra", freelance: "freelance renda extra",
  rendimentos: "investimentos",
  outros: "__outros__", outras: "__outros__", diversos: "__outros__",
};

function mesmoTipo(c: CategoriaPf, tipo?: string | null) {
  return !tipo || c.tipo === tipo;
}

function acharPorBase(cats: CategoriaPf[], base: string, tipo?: string | null): CategoriaPf | undefined {
  if (base === "__outros__") {
    return cats.find((c) => mesmoTipo(c, tipo) && /^outr/.test(norm(c.nome))) || undefined;
  }
  const alvo = base.split(" ");
  // nome da categoria contém todas as palavras da base ("Lazer / Entretenimento" ⊇ lazer, entretenimento)
  return (
    cats.find((c) => mesmoTipo(c, tipo) && norm(c.nome) === base) ||
    cats.find((c) => mesmoTipo(c, tipo) && alvo.every((w) => norm(c.nome).split(" ").includes(w))) ||
    cats.find((c) => mesmoTipo(c, tipo) && norm(c.nome).split(" ").includes(alvo[0]))
  );
}

/** Nome devolvido pelo LLM → categoria do cliente (ou undefined). */
export function casarCategoriaPorNome(nome: string | null | undefined, cats: CategoriaPf[], tipo?: string | null): CategoriaPf | undefined {
  const n = norm(nome || "");
  if (!n) return undefined;
  const exato = cats.find((c) => norm(c.nome) === n && mesmoTipo(c, tipo)) || cats.find((c) => norm(c.nome) === n);
  if (exato) return exato;
  const alias = ALIAS_NOME[n];
  if (alias) {
    const c = acharPorBase(cats, alias, tipo);
    if (c) return c;
  }
  // Sobreposição de palavras ("Lazer" → "Lazer / Entretenimento", "Restaurante" → "Restaurante / Delivery")
  const tn = tokens(n);
  if (!tn.length) return undefined;
  let melhor: CategoriaPf | undefined;
  let melhorScore = 0;
  for (const c of cats) {
    if (!mesmoTipo(c, tipo)) continue;
    const tc = tokens(c.nome);
    const inter = tn.filter((t) => tc.includes(t)).length;
    const score = inter / Math.max(tn.length, 1);
    if (inter > 0 && score > melhorScore) {
      melhor = c;
      melhorScore = score;
    }
  }
  return melhorScore >= 0.5 ? melhor : undefined;
}

function contemTermo(textoNorm: string, termo: string): boolean {
  const t = norm(termo);
  if (!t) return false;
  return (` ${textoNorm} `).includes(` ${t} `);
}

/** Descrição do lançamento ("uber pro trabalho", "drogasil") → categoria pelas palavras-chave. */
export function sugerirCategoriaPorDescricao(
  descricao: string,
  cats: CategoriaPf[],
  tipo?: string | null,
): { categoria: CategoriaPf; termo: string } | undefined {
  const d = norm(descricao);
  if (!d) return undefined;
  // 1) descrição cadastrada nas categorias do próprio cliente ("Supermercado, feira, açougue…")
  for (const c of cats) {
    if (!mesmoTipo(c, tipo) || !c.descricao || /^outr/.test(norm(c.nome))) continue;
    const termos = String(c.descricao)
      .split(/[,.;/]| e | ou /i)
      .map((x) => norm(x))
      .filter((x) => x.length >= 3 && !/^(despesa|receita) (fixa|variavel)$/.test(x));
    const termo = termos.find((x) => contemTermo(d, x));
    if (termo) return { categoria: c, termo };
  }
  // 2) dicionário de mercado brasileiro — vence o termo mais longo
  //    ("mercado livre" → Compras Diversas, não "mercado" → Alimentação)
  let melhor: { categoria: CategoriaPf; termo: string } | undefined;
  for (const [base, termos] of Object.entries(DICIONARIO)) {
    for (const termo of termos) {
      if (!contemTermo(d, termo) || (melhor && norm(termo).length <= norm(melhor.termo).length)) continue;
      const c = acharPorBase(cats, base, tipo);
      if (c) melhor = { categoria: c, termo };
    }
  }
  return melhor;
}

/** Chave de memória: palavras significativas da descrição ("Uber pro trabalho 25" → "uber trabalho"). */
export function chaveMemoria(descricao: string): string {
  return tokens(descricao).slice(0, 4).join(" ");
}

/** A chave de memória casa com a descrição por palavras inteiras (não substring solta). */
export function chaveCasa(chave: string, descricao: string): boolean {
  const k = tokens(chave);
  const d = tokens(descricao);
  if (!k.length || !d.length) return false;
  const kEmD = k.every((w) => d.includes(w));
  const dEmK = d.every((w) => k.includes(w));
  return kEmD || dEmK;
}
