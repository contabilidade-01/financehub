/**
 * Modelos de plano de contas PJ: Base Serviços e Base Comércio.
 *
 * Árvore de dois níveis: grupos sintéticos ("1", "2"...) só somam; lançamento
 * vai sempre numa conta analítica ("1.01"). Cada conta já nasce com o grupo
 * gerencial que alimenta DRE, markup, margem de contribuição e ponto de
 * equilíbrio, sem o usuário precisar configurar nada.
 */

export type GrupoGerencial =
  | "receita"
  | "deducao"
  | "custo_variavel"
  | "despesa_fixa"
  | "financeiro"
  | "investimento"
  | "nao_operacional"
  | "outras";

export type ModeloPlano = "servicos" | "comercio";

export interface ContaModelo {
  codigo: string;
  nome: string;
  tipo: "Receita" | "Despesa";
  classificacao: "FIXA" | "VARIAVEL" | "OUTRA";
  grupo: GrupoGerencial;
  is_cmv?: boolean;
  sintetica?: boolean;
  descricao?: string;
}

export const ROTULO_MODELO: Record<ModeloPlano, string> = {
  servicos: "Base Serviços",
  comercio: "Base Comércio",
};

/** segmento da empresa → modelo. "misto" usa Comércio (tem CMV e linha de serviços). */
export function modeloDoSegmento(segmento?: string | null): ModeloPlano {
  return String(segmento || "").toLowerCase().startsWith("serv") ? "servicos" : "comercio";
}

const G = (codigo: string, nome: string, tipo: ContaModelo["tipo"], classificacao: ContaModelo["classificacao"], grupo: GrupoGerencial, descricao?: string): ContaModelo =>
  ({ codigo, nome, tipo, classificacao, grupo, sintetica: true, descricao });

const C = (codigo: string, nome: string, tipo: ContaModelo["tipo"], classificacao: ContaModelo["classificacao"], grupo: GrupoGerencial, extra: Partial<ContaModelo> = {}): ContaModelo =>
  ({ codigo, nome, tipo, classificacao, grupo, ...extra });

/** Grupos 4 a 7 são iguais nos dois modelos. */
const COMUNS: ContaModelo[] = [
  G("4", "Despesas fixas", "Despesa", "FIXA", "despesa_fixa", "Gastos que existem mesmo sem vender."),
  C("4.01", "Salários e encargos", "Despesa", "FIXA", "despesa_fixa", { descricao: "Salários, INSS, FGTS, férias e 13º." }),
  C("4.02", "Benefícios (VT, VR, plano de saúde)", "Despesa", "FIXA", "despesa_fixa"),
  C("4.03", "Pró-labore", "Despesa", "FIXA", "despesa_fixa", { descricao: "Remuneração mensal dos sócios que trabalham na empresa." }),
  C("4.04", "Aluguel e condomínio", "Despesa", "FIXA", "despesa_fixa"),
  C("4.05", "Energia, água e gás", "Despesa", "FIXA", "despesa_fixa"),
  C("4.06", "Internet e telefone", "Despesa", "FIXA", "despesa_fixa"),
  C("4.07", "Contabilidade", "Despesa", "FIXA", "despesa_fixa"),
  C("4.08", "Sistemas e softwares", "Despesa", "FIXA", "despesa_fixa"),
  C("4.09", "Marketing e publicidade", "Despesa", "FIXA", "despesa_fixa", { descricao: "Anúncios, agência, redes sociais." }),
  C("4.10", "Manutenção e limpeza", "Despesa", "FIXA", "despesa_fixa"),
  C("4.11", "Material de escritório e consumo", "Despesa", "FIXA", "despesa_fixa"),
  C("4.12", "Veículos e combustível", "Despesa", "FIXA", "despesa_fixa"),
  C("4.13", "Seguros", "Despesa", "FIXA", "despesa_fixa"),
  C("4.14", "Taxas, alvarás e impostos fixos", "Despesa", "FIXA", "despesa_fixa", { descricao: "IPTU, alvará, licenciamento, taxas municipais." }),
  C("4.15", "Outras despesas administrativas", "Despesa", "FIXA", "despesa_fixa"),

  G("5", "Resultado financeiro", "Despesa", "OUTRA", "financeiro", "Juros, tarifas e rendimentos: não fazem parte da operação."),
  C("5.01", "Rendimentos de aplicações", "Receita", "OUTRA", "financeiro"),
  C("5.02", "Juros e multas recebidos", "Receita", "OUTRA", "financeiro", { descricao: "Acréscimos pagos por clientes em atraso." }),
  C("5.03", "Descontos obtidos", "Receita", "OUTRA", "financeiro", { descricao: "Desconto conseguido ao pagar fornecedor." }),
  C("5.04", "Tarifas bancárias", "Despesa", "OUTRA", "financeiro"),
  C("5.05", "Juros e multas pagos", "Despesa", "OUTRA", "financeiro", { descricao: "Atraso em contas e boletos." }),
  C("5.06", "Descontos concedidos", "Despesa", "OUTRA", "financeiro", { descricao: "Desconto dado ao cliente no recebimento." }),
  C("5.07", "IOF e encargos de empréstimos", "Despesa", "OUTRA", "financeiro"),

  G("6", "Investimentos", "Despesa", "OUTRA", "investimento", "Compra de bens duráveis da empresa."),
  C("6.01", "Máquinas e equipamentos", "Despesa", "OUTRA", "investimento"),
  C("6.02", "Móveis e utensílios", "Despesa", "OUTRA", "investimento"),
  C("6.03", "Computadores e tecnologia", "Despesa", "OUTRA", "investimento"),
  C("6.04", "Reformas e instalações", "Despesa", "OUTRA", "investimento"),

  G("7", "Não operacionais e sócios", "Despesa", "OUTRA", "nao_operacional", "Movimentos que não são da operação: empréstimos, aportes e lucros."),
  C("7.01", "Distribuição de lucros", "Despesa", "OUTRA", "nao_operacional"),
  C("7.02", "Pagamento de empréstimos", "Despesa", "OUTRA", "nao_operacional"),
  C("7.03", "Outras despesas não operacionais", "Despesa", "OUTRA", "nao_operacional"),
  C("7.04", "Empréstimos recebidos", "Receita", "OUTRA", "nao_operacional"),
  C("7.05", "Aporte de capital dos sócios", "Receita", "OUTRA", "nao_operacional"),
  C("7.06", "Outras receitas não operacionais", "Receita", "OUTRA", "nao_operacional", { descricao: "Venda de bens usados, indenizações." }),
];

export const MODELO_COMERCIO: ContaModelo[] = [
  G("1", "Receitas operacionais", "Receita", "OUTRA", "receita"),
  C("1.01", "Venda de mercadorias", "Receita", "OUTRA", "receita", { descricao: "Vendas no balcão, loja e atacado." }),
  C("1.02", "Vendas online e marketplace", "Receita", "OUTRA", "receita"),
  C("1.03", "Prestação de serviços", "Receita", "OUTRA", "receita", { descricao: "Instalação, entrega, assistência." }),
  C("1.04", "Outras receitas operacionais", "Receita", "OUTRA", "receita"),

  G("2", "Deduções da receita", "Despesa", "VARIAVEL", "deducao", "Sai da receita bruta antes de qualquer custo."),
  C("2.01", "Impostos sobre vendas (Simples/ICMS)", "Despesa", "VARIAVEL", "deducao", { descricao: "DAS do Simples Nacional, ICMS, PIS/COFINS sobre faturamento." }),
  C("2.02", "Devoluções e cancelamentos", "Despesa", "VARIAVEL", "deducao"),
  C("2.03", "Taxas de cartão e meios de pagamento", "Despesa", "VARIAVEL", "deducao"),
  C("2.04", "Taxas de marketplace", "Despesa", "VARIAVEL", "deducao"),

  G("3", "Custos variáveis", "Despesa", "VARIAVEL", "custo_variavel", "Crescem junto com as vendas."),
  C("3.01", "Compras de mercadorias para revenda (CMV)", "Despesa", "VARIAVEL", "custo_variavel", { is_cmv: true, descricao: "Custo da mercadoria vendida." }),
  C("3.02", "Fretes sobre compras", "Despesa", "VARIAVEL", "custo_variavel", { is_cmv: true }),
  C("3.03", "Fretes e entregas sobre vendas", "Despesa", "VARIAVEL", "custo_variavel"),
  C("3.04", "Embalagens", "Despesa", "VARIAVEL", "custo_variavel"),
  C("3.05", "Comissões sobre vendas", "Despesa", "VARIAVEL", "custo_variavel"),

  ...COMUNS,
];

export const MODELO_SERVICOS: ContaModelo[] = [
  G("1", "Receitas operacionais", "Receita", "OUTRA", "receita"),
  C("1.01", "Prestação de serviços", "Receita", "OUTRA", "receita", { descricao: "Serviços avulsos e projetos." }),
  C("1.02", "Contratos recorrentes e mensalidades", "Receita", "OUTRA", "receita"),
  C("1.03", "Venda de produtos", "Receita", "OUTRA", "receita"),
  C("1.04", "Outras receitas operacionais", "Receita", "OUTRA", "receita"),

  G("2", "Deduções da receita", "Despesa", "VARIAVEL", "deducao", "Sai da receita bruta antes de qualquer custo."),
  C("2.01", "Impostos sobre serviços (Simples/ISS)", "Despesa", "VARIAVEL", "deducao", { descricao: "DAS do Simples Nacional, ISS, PIS/COFINS sobre faturamento." }),
  C("2.02", "Cancelamentos e estornos", "Despesa", "VARIAVEL", "deducao"),
  C("2.03", "Taxas de cartão e meios de pagamento", "Despesa", "VARIAVEL", "deducao"),

  G("3", "Custos dos serviços prestados", "Despesa", "VARIAVEL", "custo_variavel", "O que se gasta para entregar cada serviço."),
  C("3.01", "Mão de obra terceirizada e freelancers", "Despesa", "VARIAVEL", "custo_variavel", { is_cmv: true, descricao: "Custo do serviço prestado (CSP)." }),
  C("3.02", "Materiais aplicados nos serviços", "Despesa", "VARIAVEL", "custo_variavel", { is_cmv: true }),
  C("3.03", "Deslocamentos e viagens para clientes", "Despesa", "VARIAVEL", "custo_variavel"),
  C("3.04", "Comissões sobre vendas", "Despesa", "VARIAVEL", "custo_variavel"),
  C("3.05", "Licenças e softwares por cliente", "Despesa", "VARIAVEL", "custo_variavel"),

  ...COMUNS,
];

export function contasDoModelo(modelo: ModeloPlano): ContaModelo[] {
  return modelo === "servicos" ? MODELO_SERVICOS : MODELO_COMERCIO;
}

/** "4.01" → "4"; "4" → null. */
export function codigoPai(codigo: string): string | null {
  const i = codigo.lastIndexOf(".");
  return i > 0 ? codigo.slice(0, i) : null;
}
