/**
 * Indicadores gerenciais da empresa — um cálculo só, usado pela DRE, pelo
 * razão, pelo dashboard de análise e pelo fluxo de caixa (servidor e tela).
 *
 * Estrutura (DRE gerencial por margem de contribuição):
 *   Receita bruta
 *   (−) Deduções (impostos sobre venda, devoluções, taxas de cartão)
 *   (=) Receita líquida
 *   (−) CMV / CSP                          → Lucro bruto, markup
 *   (−) Demais custos variáveis
 *   (=) Margem de contribuição             → ponto de equilíbrio
 *   (−) Despesas fixas
 *   (=) Lucro operacional
 *   (±) Resultado financeiro
 *   (−) Outras despesas
 *   (=) Lucro líquido
 *   (−) Investimentos  (±) Movimentos não operacionais (empréstimos, aportes, lucros)
 *   (=) Geração de caixa
 *
 * Investimento, empréstimo e distribuição de lucros mexem no caixa, mas não são
 * despesa nem receita: ficam abaixo do lucro líquido.
 */
import { grupoEfetivo } from "./plano-contas-grupos";

export type GrupoDre =
  | "receita"
  | "deducao"
  | "cmv"
  | "variavel"
  | "fixa"
  | "financeiro_receita"
  | "financeiro_despesa"
  | "outras"
  | "investimento"
  | "nao_operacional_entrada"
  | "nao_operacional_saida";

export const GRUPOS_DRE: GrupoDre[] = [
  "receita", "deducao", "cmv", "variavel", "fixa", "financeiro_receita", "financeiro_despesa",
  "outras", "investimento", "nao_operacional_entrada", "nao_operacional_saida",
];

export const ROTULO_GRUPO_DRE: Record<GrupoDre, string> = {
  receita: "Receita bruta",
  deducao: "Deduções da receita",
  cmv: "CMV / CSP",
  variavel: "Demais custos variáveis",
  fixa: "Despesas fixas",
  financeiro_receita: "Receitas financeiras",
  financeiro_despesa: "Despesas financeiras",
  outras: "Outras despesas",
  investimento: "Investimentos",
  nao_operacional_entrada: "Entradas não operacionais",
  nao_operacional_saida: "Saídas não operacionais",
};

/** Em que linha da DRE uma conta do plano entra. */
export function grupoDreDaConta(c: { tipo: string; classificacao?: string | null; grupo_gerencial?: string | null; is_cmv?: boolean | null }): GrupoDre {
  const g = grupoEfetivo(c);
  const receita = c.tipo === "Receita";
  switch (g) {
    case "receita": return receita ? "receita" : "deducao";
    case "deducao": return receita ? "receita" : "deducao";
    case "custo_variavel": return receita ? "receita" : c.is_cmv ? "cmv" : "variavel";
    case "despesa_fixa": return receita ? "receita" : "fixa";
    case "financeiro": return receita ? "financeiro_receita" : "financeiro_despesa";
    case "investimento": return receita ? "nao_operacional_entrada" : "investimento";
    case "nao_operacional": return receita ? "nao_operacional_entrada" : "nao_operacional_saida";
    default: return receita ? "receita" : "outras";
  }
}

export type SomasDre = Record<GrupoDre, number>;

export function somasVazias(): SomasDre {
  return Object.fromEntries(GRUPOS_DRE.map((g) => [g, 0])) as SomasDre;
}

export interface Indicadores {
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  cmv: number;
  lucro_bruto: number;
  margem_bruta_pct: number | null;
  /** (Receita − CMV) ÷ CMV, em %. Nulo sem CMV. */
  markup_pct: number | null;
  /** Receita ÷ CMV ("vendo por 2,5× o custo"). Nulo sem CMV. */
  markup_multiplicador: number | null;
  custos_variaveis: number;
  margem_contribuicao: number;
  margem_contribuicao_pct: number | null;
  despesas_fixas: number;
  lucro_operacional: number;
  /** Receita bruta necessária para cobrir as fixas. Nulo sem margem positiva. */
  ponto_equilibrio: number | null;
  /** Receita ÷ ponto de equilíbrio, em %. */
  ponto_equilibrio_atingido_pct: number | null;
  /** Quanto a receita pode cair até o ponto de equilíbrio, em % da receita. */
  margem_seguranca_pct: number | null;
  resultado_financeiro: number;
  outras_despesas: number;
  lucro_liquido: number;
  margem_liquida_pct: number | null;
  investimentos: number;
  nao_operacional: number;
  geracao_caixa: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number, d: number) => (d > 0 ? r2((n / d) * 100) : null);

export function calcularIndicadores(s: Partial<SomasDre>): Indicadores {
  const v = (g: GrupoDre) => Number(s[g] || 0);
  const receita_bruta = r2(v("receita"));
  const deducoes = r2(v("deducao"));
  const receita_liquida = r2(receita_bruta - deducoes);
  const cmv = r2(v("cmv"));
  const lucro_bruto = r2(receita_liquida - cmv);
  const custos_variaveis = r2(v("variavel"));
  // Deduções também crescem com a venda: saem da margem de contribuição.
  const margem_contribuicao = r2(receita_liquida - cmv - custos_variaveis);
  const mcPct = receita_bruta > 0 ? margem_contribuicao / receita_bruta : null;
  const despesas_fixas = r2(v("fixa"));
  const lucro_operacional = r2(margem_contribuicao - despesas_fixas);
  const ponto_equilibrio = mcPct !== null && mcPct > 0 ? r2(despesas_fixas / mcPct) : null;
  const resultado_financeiro = r2(v("financeiro_receita") - v("financeiro_despesa"));
  const outras_despesas = r2(v("outras"));
  const lucro_liquido = r2(lucro_operacional + resultado_financeiro - outras_despesas);
  const investimentos = r2(v("investimento"));
  const nao_operacional = r2(v("nao_operacional_entrada") - v("nao_operacional_saida"));
  return {
    receita_bruta,
    deducoes,
    receita_liquida,
    cmv,
    lucro_bruto,
    margem_bruta_pct: pct(lucro_bruto, receita_liquida),
    markup_pct: cmv > 0 ? r2(((receita_bruta - cmv) / cmv) * 100) : null,
    markup_multiplicador: cmv > 0 ? r2(receita_bruta / cmv) : null,
    custos_variaveis,
    margem_contribuicao,
    margem_contribuicao_pct: mcPct === null ? null : r2(mcPct * 100),
    despesas_fixas,
    lucro_operacional,
    ponto_equilibrio,
    ponto_equilibrio_atingido_pct: ponto_equilibrio ? pct(receita_bruta, ponto_equilibrio) : null,
    margem_seguranca_pct: ponto_equilibrio !== null && receita_bruta > 0 ? r2(((receita_bruta - ponto_equilibrio) / receita_bruta) * 100) : null,
    resultado_financeiro,
    outras_despesas,
    lucro_liquido,
    margem_liquida_pct: pct(lucro_liquido, receita_bruta),
    investimentos,
    nao_operacional,
    geracao_caixa: r2(lucro_liquido - investimentos + nao_operacional),
  };
}

/** Linhas da DRE na ordem de exibição: grupos (com contas) e totais calculados. */
export type LinhaEstrutura =
  | { tipo: "grupo"; titulo: string; grupos: GrupoDre[]; sinal: "+" | "−" }
  | { tipo: "total"; titulo: string; chave: keyof Indicadores; destaque?: boolean };

export const ESTRUTURA_DRE: LinhaEstrutura[] = [
  { tipo: "grupo", titulo: "(+) Receita bruta", grupos: ["receita"], sinal: "+" },
  { tipo: "grupo", titulo: "(−) Deduções da receita", grupos: ["deducao"], sinal: "−" },
  { tipo: "total", titulo: "(=) Receita líquida", chave: "receita_liquida" },
  { tipo: "grupo", titulo: "(−) CMV / CSP", grupos: ["cmv"], sinal: "−" },
  { tipo: "total", titulo: "(=) Lucro bruto", chave: "lucro_bruto" },
  { tipo: "grupo", titulo: "(−) Demais custos variáveis", grupos: ["variavel"], sinal: "−" },
  { tipo: "total", titulo: "(=) Margem de contribuição", chave: "margem_contribuicao", destaque: true },
  { tipo: "grupo", titulo: "(−) Despesas fixas", grupos: ["fixa"], sinal: "−" },
  { tipo: "total", titulo: "(=) Lucro operacional", chave: "lucro_operacional" },
  { tipo: "grupo", titulo: "(+) Receitas financeiras", grupos: ["financeiro_receita"], sinal: "+" },
  { tipo: "grupo", titulo: "(−) Despesas financeiras", grupos: ["financeiro_despesa"], sinal: "−" },
  { tipo: "grupo", titulo: "(−) Outras despesas", grupos: ["outras"], sinal: "−" },
  { tipo: "total", titulo: "(=) Lucro líquido", chave: "lucro_liquido", destaque: true },
  { tipo: "grupo", titulo: "(−) Investimentos", grupos: ["investimento"], sinal: "−" },
  { tipo: "grupo", titulo: "(+) Entradas não operacionais", grupos: ["nao_operacional_entrada"], sinal: "+" },
  { tipo: "grupo", titulo: "(−) Saídas não operacionais", grupos: ["nao_operacional_saida"], sinal: "−" },
  { tipo: "total", titulo: "(=) Geração de caixa", chave: "geracao_caixa" },
];
