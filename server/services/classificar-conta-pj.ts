/**
 * Escolhe a conta do plano PJ para um lançamento (WhatsApp/IA).
 *
 * Regra central (aprendida na marra): a conta que o MODELO informa só é aceita
 * quando as palavras do USUÁRIO sustentam a escolha. Sem sustentação, vale o que
 * a descrição diz — e, na dúvida, "Outras" (honesto) em vez de um palpite que
 * suja o DRE. Foi o que fazia "Abastecimento de carro" virar CMV e "Despesa de
 * cartório" virar Impostos: o modelo chutava o código e o código ganhava de tudo.
 */

export type ContaPjRef = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  is_cmv?: boolean;
  classificacao?: string | null;
};

function normalizar(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Regras de palavra-chave: `re` testa o que o USUÁRIO escreveu; `alvos` acham a
 * conta pelo NOME, em ordem de preferência. Casar por nome (e não por código)
 * faz a mesma regra funcionar no plano antigo e nos modelos Base Serviços /
 * Base Comércio, que numeram as contas de outro jeito.
 */
type Regra = { re: RegExp; alvos: RegExp[] };

const REGRAS_RECEITA: Regra[] = [
  // Cobrir as formas verbais é essencial: o usuário escreve "vendi", não "venda".
  { re: /\b(venda|vendas|vendi|vendeu|vendemos|vender|mercadoria vendid|faturamento|faturei|faturou)\b/, alvos: [/\bvenda de mercadoria/, /\bvendas?\b/] },
  { re: /\b(servico|servicos|consultoria|honorario|prestei|atendimento)\b/, alvos: [/\bservico/] },
  { re: /\b(rendimento|aplicacao|juros receb)\b/, alvos: [/\brendimento/, /\bfinanceir/] },
];

const REGRAS_DESPESA: Regra[] = [
  { re: /\b(compra|compras).{0,20}mercador|\bcmv\b|\bfornecedor\b|\bestoque\b/, alvos: [/\bcmv\b/, /\bmercadoria/] },
  { re: /\bmateria.?prima\b|\binsumo/, alvos: [/\bmateria.?prima|\binsumo/, /\bmateriais aplicados/] },
  { re: /\bcomissao/, alvos: [/\bcomiss/] },
  { re: /\bfrete\b|\blogistica\b|\bentrega\b/, alvos: [/\bfretes? e entregas|\bfretes? sobre venda/, /\bfrete/] },
  { re: /\bmarketing\b|\banuncio|\btrafego\b|\bpublicidade\b/, alvos: [/\bmarketing|\banuncio|\bpublicidade/] },
  { re: /\bmaquininha\b|\btaxa d[oae]s? cart|\btaxas? de cartao/, alvos: [/\btaxas? de cartao|\bmeios de pagamento/, /\bfinanceir/] },
  { re: /\btarifa banc|\btaxa banc|\btarifa/, alvos: [/\btarifa/, /\bfinanceir/] },
  { re: /\biof\b|\bemprestimo/, alvos: [/\biof\b|\bencargos de emprestimo/, /\bfinanceir/] },
  { re: /\bjuros\b|\bmulta por atraso/, alvos: [/\bjuros e multas pag/, /\bjuros/, /\bfinanceir/] },
  { re: /\bfolha\b|\bsalario|\bfuncionario/, alvos: [/\bfolha|\bsalario/] },
  { re: /\baluguel\b|\bcondominio\b/, alvos: [/\baluguel/] },
  { re: /\benergia\b|\bluz\b|\bagua\b/, alvos: [/\benergia|\bagua/] },
  { re: /\binternet\b|\btelefone\b|\bcelular\b/, alvos: [/\binternet|\btelefon/, /\benergia/] },
  { re: /\bcontabil|\bcontador\b/, alvos: [/\bcontab/] },
  { re: /\bdas\b|\bsimples nacional\b|\biss\b|\bicms\b/, alvos: [/\bsimples|\bimpostos sobre/, /\bimposto/] },
  { re: /\bipva\b|\biptu\b|\balvara\b|\blicenciamento\b|\bdocumento do carro/, alvos: [/\balvara|\bimpostos fixos/, /\bimposto/] },
  { re: /\bimposto/, alvos: [/\bimposto/] },
  { re: /\bpro.?labore\b|\bretirada\b/, alvos: [/\bpro.?labore|\bretirada/] },
  { re: /\bsistema\b|\bsoftware\b|\baplicativo\b/, alvos: [/\bsistemas/, /\bsoftware/] },
  { re: /\bseguro\b/, alvos: [/\bseguro/] },
  { re: /\babastec|\bcombustivel|\bgasolina|\betanol|\bdiesel/, alvos: [/\bcombustivel/, /\bveiculo/] },
];

// CMV distorce Margem Bruta/Markup, então exige prova explícita de mercadoria.
const SINAIS_CMV = /\b(mercadoria|mercadorias|estoque|fornecedor|revenda|cmv|materia.?prima|insumo)/;

// Gastos que o modelo costuma confundir com "compra de mercadoria" — nunca são CMV.
const NAO_E_CMV = /\b(abastec|combustivel|gasolina|etanol|diesel|pedagio|estacionamento|oficina|mecanic|pneu|revisao|manutencao|cartorio|despachante|multa|seguro|uber|taxi|almoco|refeicao)/;

/** Primeira conta do tipo cujo nome casa com um dos alvos (na ordem dos alvos). */
function porAlvos(contas: ContaPjRef[], tipo: string, alvos: RegExp[]): ContaPjRef | undefined {
  const doTipo = contas.filter((c) => c.tipo === tipo);
  for (const alvo of alvos) {
    const c = doTipo.find((x) => alvo.test(normalizar(x.nome)));
    if (c) return c;
  }
  return undefined;
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

function ehContaCmv(c: ContaPjRef): boolean {
  // Só despesa: "Venda de mercadorias" é receita e não pode cair na trava do CMV.
  if (c.tipo !== "Despesa") return false;
  return c.is_cmv === true || /\bcmv\b|mercadoria/i.test(c.nome);
}

/** Quanto o texto do usuário "puxa" para esta conta (0 = nada a ver). */
function pesoDaConta(c: ContaPjRef, texto: string): number {
  if (!texto) return 0;
  const nome = normalizar(c.nome).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  let peso = 0;
  if (nome.length >= 4 && texto.includes(nome)) peso = Math.max(peso, nome.length + 10);

  for (const tok of tokensFortes(c.nome)) {
    if (texto.includes(tok)) peso = Math.max(peso, tok.length);
    for (const sin of SINONIMOS[tok] || []) {
      if (texto.includes(sin)) peso = Math.max(peso, sin.length);
    }
  }
  return peso;
}

/** Regras cujos alvos apontam para esta conta (pelo nome). */
function regrasDaConta(tipo: string, conta: ContaPjRef): Regra[] {
  const nome = normalizar(conta.nome);
  const regras = tipo === "Receita" ? REGRAS_RECEITA : REGRAS_DESPESA;
  return regras.filter((r) => r.alvos.some((a) => a.test(nome)));
}

/** Uma conta de CMV só passa com sinal explícito de mercadoria e sem anti-sinal. */
function cmvPermitido(conta: ContaPjRef, textoUsuario: string): boolean {
  if (!ehContaCmv(conta)) return true;
  if (NAO_E_CMV.test(textoUsuario)) return false;
  return SINAIS_CMV.test(textoUsuario);
}

/**
 * A conta informada pelo modelo tem respaldo no que o usuário escreveu?
 * Aceita respaldo pela regra de palavra-chave da conta ("conta de luz" → Energia)
 * ou pelo próprio nome/sinônimos da conta ("paguei o aluguel" → Aluguel).
 */
function corroborada(conta: ContaPjRef, tipo: string, textoUsuario: string): boolean {
  if (!textoUsuario) return false;
  if (regrasDaConta(tipo, conta).some((r) => r.re.test(textoUsuario))) return true;
  return pesoDaConta(conta, textoUsuario) > 0;
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
    if (!cmvPermitido(c, texto)) continue;
    const peso = pesoDaConta(c, texto);
    if (peso > 0 && (!melhor || peso > melhor.peso)) melhor = { conta: c, peso };
  }

  return melhor?.conta;
}

/** Candidata derivada SÓ das palavras do usuário (sem contaminar com o palpite do modelo). */
function candidataPelaDescricao(contas: ContaPjRef[], tipo: string, texto: string): ContaPjRef | undefined {
  if (!texto) return undefined;
  const regras = tipo === "Receita" ? REGRAS_RECEITA : REGRAS_DESPESA;
  for (const r of regras) {
    if (!r.re.test(texto)) continue;
    const c = porAlvos(contas, tipo, r.alvos);
    if (c && cmvPermitido(c, texto)) return c;
  }
  return casarComPlanoVivo(contas, tipo, texto);
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

export type ResultadoConta = {
  conta: ContaPjRef | undefined;
  usouOutras: boolean;
  /** Como a conta foi escolhida — vai para o log e ajuda a depurar classificação. */
  motivo: "informada" | "descricao" | "descricao_sobre_informada" | "segmento" | "outras";
  /** true quando o palpite do modelo foi descartado por falta de respaldo na descrição. */
  ignorouInformada?: boolean;
};

export function resolverContaPj(opts: {
  contas: ContaPjRef[];
  tipo: "Receita" | "Despesa";
  contaInformada?: string;
  descricao?: string;
  segmento?: string | null;
}): ResultadoConta {
  const { contas, tipo, contaInformada, descricao, segmento } = opts;
  // Só as palavras do usuário: o palpite do modelo não entra aqui, senão ele
  // "prova" a si mesmo (informar a conta 'Impostos' fazia a regra de imposto casar).
  const texto = normalizar(descricao || "");

  const informada = casarNomeOuCodigo(contas, tipo, contaInformada || "");
  const informadaEspecifica = informada && !/outr/i.test(informada.nome) ? informada : undefined;
  const pelaDescricao = candidataPelaDescricao(contas, tipo, texto);

  // 1) Palpite do modelo, mas só se a descrição do usuário sustentar.
  if (
    informadaEspecifica
    && corroborada(informadaEspecifica, tipo, texto)
    && cmvPermitido(informadaEspecifica, texto)
  ) {
    return { conta: informadaEspecifica, usouOutras: false, motivo: "informada" };
  }

  // 2) O que as palavras do usuário dizem.
  if (pelaDescricao) {
    return {
      conta: pelaDescricao,
      usouOutras: false,
      motivo: informadaEspecifica ? "descricao_sobre_informada" : "descricao",
      ignorouInformada: !!informadaEspecifica,
    };
  }

  // 3) "Entrada" / "recebi" sem detalhe: comércio → vendas; serviços → serviços.
  if (tipo === "Receita" && /\b(entrada|recebi|recebimento|caiu na conta)\b/.test(texto)) {
    const seg = normalizar(segmento || "");
    const alvos = seg.includes("comercio") ? [/\bvenda de mercadoria/, /\bvendas?\b/] : seg.includes("servico") ? [/\bservico/] : null;
    if (alvos) {
      const c = porAlvos(contas, tipo, alvos);
      if (c) return { conta: c, usouOutras: false, motivo: "segmento" };
    }
  }

  // 4) Sem respaldo nenhum: Outras (honesto) — e quem chama avisa o usuário.
  const fallback = outrasDoTipo(contas, tipo);
  return {
    conta: fallback,
    usouOutras: true,
    motivo: "outras",
    ignorouInformada: !!informadaEspecifica,
  };
}
