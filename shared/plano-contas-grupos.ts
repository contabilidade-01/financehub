/** Grupos gerenciais do plano de contas PJ (usados na DRE, indicadores e telas). */
export const GRUPOS_GERENCIAIS = [
  "receita",
  "deducao",
  "custo_variavel",
  "despesa_fixa",
  "financeiro",
  "investimento",
  "nao_operacional",
  "outras",
] as const;

export type GrupoGerencialId = (typeof GRUPOS_GERENCIAIS)[number];

export const ROTULO_GRUPO: Record<GrupoGerencialId, string> = {
  receita: "Receita operacional",
  deducao: "Dedução da receita",
  custo_variavel: "Custo variável",
  despesa_fixa: "Despesa fixa",
  financeiro: "Resultado financeiro",
  investimento: "Investimento",
  nao_operacional: "Não operacional",
  outras: "Outras",
};

export const DESCRICAO_GRUPO: Record<GrupoGerencialId, string> = {
  receita: "Vendas e serviços: formam a receita bruta.",
  deducao: "Impostos sobre venda, devoluções e taxas de cartão: saem da receita bruta.",
  custo_variavel: "Crescem com as vendas (CMV, CSP, comissões, fretes). Entram na margem de contribuição.",
  despesa_fixa: "Existem mesmo sem vender. Base do ponto de equilíbrio.",
  financeiro: "Juros, tarifas e rendimentos.",
  investimento: "Compra de bens duráveis.",
  nao_operacional: "Empréstimos, aportes e distribuição de lucros.",
  outras: "Despesas sem grupo definido.",
};

export type ModeloPlanoId = "servicos" | "comercio";

export const ROTULO_MODELO_PLANO: Record<ModeloPlanoId, string> = {
  servicos: "Base Serviços",
  comercio: "Base Comércio",
};

/** Grupo efetivo: o informado ou o derivado de tipo × classificação. */
export function grupoEfetivo(c: { tipo: string; classificacao?: string | null; grupo_gerencial?: string | null }): GrupoGerencialId {
  const g = String(c.grupo_gerencial || "");
  if ((GRUPOS_GERENCIAIS as readonly string[]).includes(g)) return g as GrupoGerencialId;
  if (c.tipo === "Receita") return "receita";
  const cl = String(c.classificacao || "").toUpperCase();
  if (cl === "VARIAVEL") return "custo_variavel";
  if (cl === "FIXA") return "despesa_fixa";
  return "outras";
}

/** Classificação coerente com o grupo (para contas novas). */
export function classificacaoDoGrupo(grupo: GrupoGerencialId): "FIXA" | "VARIAVEL" | "OUTRA" {
  if (grupo === "despesa_fixa") return "FIXA";
  if (grupo === "custo_variavel" || grupo === "deducao") return "VARIAVEL";
  return "OUTRA";
}

/** Ordena "1", "1.02", "1.10", "2" numericamente por segmento. */
export function compararCodigos(a: string, b: string): number {
  const pa = String(a).split(".").map((x) => parseInt(x, 10));
  const pb = String(b).split(".").map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return (Number.isFinite(x) ? x : 0) - (Number.isFinite(y) ? y : 0);
  }
  return 0;
}
