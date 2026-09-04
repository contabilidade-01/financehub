/**
 * Escolhe a conta do plano PJ para um lançamento (WhatsApp/IA).
 * Sempre classifica entrada ou saída. "Outras" só quando não achar conta melhor.
 */

export type ContaPjRef = { id: number; codigo: string; nome: string; tipo: string };

function normalizar(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REGRAS_RECEITA: { re: RegExp; codigo: string }[] = [
  { re: /\b(venda|vendas|mercadoria vendid|faturamento)\b/, codigo: "1.01" },
  { re: /\b(servico|servicos|consultoria|honorario)\b/, codigo: "1.02" },
  { re: /\b(rendimento|aplicacao|juros receb)\b/, codigo: "1.04" },
];

const REGRAS_DESPESA: { re: RegExp; codigo: string }[] = [
  { re: /\b(compra|compras).{0,20}mercador|\bcmv\b|\bfornecedor\b|\bestoque\b/, codigo: "3.01" },
  { re: /\bmateria.?prima\b|\binsumo/, codigo: "3.02" },
  { re: /\bcomissao/, codigo: "3.03" },
  { re: /\bfrete\b|\blogistica\b/, codigo: "3.04" },
  { re: /\bmarketing\b|\banuncio|\btrafego\b/, codigo: "3.05" },
  { re: /\bjuros\b|\btarifa banc|\biof\b|\btaxa banc/, codigo: "3.06" },
  { re: /\bfolha\b|\bsalario|\bfuncionario/, codigo: "2.01" },
  { re: /\baluguel\b/, codigo: "2.02" },
  { re: /\benergia\b|\bluz\b|\bagua\b|\binternet\b/, codigo: "2.03" },
  { re: /\bcontabil|\bcontador\b/, codigo: "2.04" },
  { re: /\bimposto|\bdas\b|\bipva\b|\blicenciamento\b|\bdocumento do carro/, codigo: "2.05" },
  { re: /\bpro.?labore\b|\bretirada\b/, codigo: "2.06" },
];

function porCodigo(contas: ContaPjRef[], tipo: string, codigo: string): ContaPjRef | undefined {
  return contas.find((c) => c.tipo === tipo && c.codigo === codigo);
}

function outrasDoTipo(contas: ContaPjRef[], tipo: string): ContaPjRef | undefined {
  const doTipo = contas.filter((c) => c.tipo === tipo);
  return doTipo.find((c) => /outr/i.test(c.nome)) || doTipo[0];
}

const PALAVRAS_FRACAS = new Set([
  "outras", "outra", "outros", "despesas", "despesa", "receitas", "receita",
  "operacionais", "operacional", "conta", "contas", "custo", "custos",
  "demais", "diversos", "diversas", "para", "com", "sem",
]);

/** Só vale se a conta do plano tiver a chave no nome. */
const SINONIMOS: Record<string, string[]> = {
  combustivel: ["abastecimento", "abastec", "gasolina", "etanol", "diesel", "alcool"],
  veiculo: ["carro", "frota", "alinhamento", "balanceamento"],
  veiculos: ["carro", "frota", "alinhamento", "balanceamento"],
  carro: ["veiculo", "alinhamento", "balanceamento", "oficina"],
  oficina: ["alinhamento", "balanceamento", "mecanica"],
  manutencao: ["alinhamento", "balanceamento", "oficina", "conserto"],
};

function tokensFortes(nome: string): string[] {
  return normalizar(nome)
    .replace(/\(.*?\)/g, " ")
    .split(" ")
    .filter((t) => t.length >= 4 && !PALAVRAS_FRACAS.has(t));
}

/**
 * Casa a descrição com contas que o cliente já criou no plano.
 * Sem conta parecida → undefined (quem chama cai em Outras).
 */
function casarComPlanoVivo(contas: ContaPjRef[], tipo: string, texto: string): ContaPjRef | undefined {
  if (!texto) return undefined;
  const candidatas = contas.filter((c) => c.tipo === tipo && !/outr/i.test(c.nome));
  let melhor: { conta: ContaPjRef; peso: number } | undefined;

  for (const c of candidatas) {
    const nome = normalizar(c.nome).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
    let peso = 0;
    if (nome.length >= 4 && texto.includes(nome)) peso = Math.max(peso, nome.length + 10);

    for (const tok of tokensFortes(c.nome)) {
      if (texto.includes(tok)) peso = Math.max(peso, tok.length);
      for (const sin of SINONIMOS[tok] || []) {
        if (texto.includes(sin)) peso = Math.max(peso, sin.length);
      }
    }

    if (peso > 0 && (!melhor || peso > melhor.peso)) {
      melhor = { conta: c, peso };
    }
  }

  return melhor?.conta;
}

/** Casa nome/código informado pelo modelo, sem aceitar "Outras" cedo demais. */
function casarNomeOuCodigo(contas: ContaPjRef[], tipo: string, alvo: string): ContaPjRef | undefined {
  const n = normalizar(alvo);
  if (!n) return undefined;
  const doTipo = contas.filter((c) => c.tipo === tipo);

  const exato = doTipo.find((c) => normalizar(c.codigo) === n || normalizar(c.nome) === n);
  if (exato) return exato;

  const parcial = doTipo.find((c) => {
    const nome = normalizar(c.nome).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
    if (nome.length < 4) return false;
    return nome.includes(n) || (n.length >= 5 && n.includes(nome));
  });
  if (parcial && !/outr/i.test(parcial.nome)) return parcial;
  if (parcial && /outr/i.test(parcial.nome) && n.includes("outr")) return parcial;
  return undefined;
}

export function resolverContaPj(opts: {
  contas: ContaPjRef[];
  tipo: "Receita" | "Despesa";
  contaInformada?: string;
  descricao?: string;
  segmento?: string | null;
}): { conta: ContaPjRef | undefined; usouOutras: boolean } {
  const { contas, tipo, contaInformada, descricao, segmento } = opts;
  const texto = normalizar(`${contaInformada || ""} ${descricao || ""}`);

  const peloNome = casarNomeOuCodigo(contas, tipo, contaInformada || "");
  if (peloNome && !/outr/i.test(peloNome.nome)) {
    return { conta: peloNome, usouOutras: false };
  }

  const regras = tipo === "Receita" ? REGRAS_RECEITA : REGRAS_DESPESA;
  for (const r of regras) {
    if (r.re.test(texto)) {
      const c = porCodigo(contas, tipo, r.codigo);
      if (c) return { conta: c, usouOutras: false };
    }
  }

  const peloPlano = casarComPlanoVivo(contas, tipo, texto);
  if (peloPlano) return { conta: peloPlano, usouOutras: false };

  // "Entrada" / "recebi" sem detalhe: comércio → vendas; serviços → serviços.
  if (tipo === "Receita" && /\b(entrada|recebi|recebimento|caiu na conta)\b/.test(texto)) {
    const seg = normalizar(segmento || "");
    if (seg.includes("comercio")) {
      const c = porCodigo(contas, tipo, "1.01");
      if (c) return { conta: c, usouOutras: false };
    }
    if (seg.includes("servico")) {
      const c = porCodigo(contas, tipo, "1.02");
      if (c) return { conta: c, usouOutras: false };
    }
  }

  if (peloNome) return { conta: peloNome, usouOutras: /outr/i.test(peloNome.nome) };

  const fallback = outrasDoTipo(contas, tipo);
  return { conta: fallback, usouOutras: true };
}
