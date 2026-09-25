/** Cliente da API de importação de extratos (/api/importacoes). */

export type Escopo = "pf" | "pj";
export type StatusLinha = "pendente" | "conciliar" | "duplicada" | "ignorar" | "importada" | "transferencia";

export interface Mapeamento {
  data: number;
  descricao: number;
  valor: number;
  debito: number;
  credito: number;
  saldo: number;
  documento: number;
  natureza: number;
}

export interface Candidato {
  id: number;
  descricao: string;
  valor: string;
  data_transacao: string;
  status: string;
}

export interface Linha {
  id: number;
  ordem: number;
  data: string;
  descricao: string;
  valor: string;
  documento: string | null;
  status: StatusLinha;
  categoria_id: number | null;
  sugestao_categoria_id: number | null;
  sugestao_origem: string | null;
  transacao_existente_id: number | null;
  candidatos: Candidato[] | null;
  transacao_criada_id: number | null;
  observacao: string | null;
  /** Transferência para/de outra conta própria (não é receita nem despesa). */
  transferencia_conta_id: number | null;
  /** Transferência já registrada pelo extrato da outra conta (este é o outro lado). */
  transferencia_id: number | null;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: "Receita" | "Despesa";
  codigo?: string;
  parent_id?: number | null;
}

export interface GrupoPlano {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  classificacao?: string | null;
  grupo_gerencial?: string | null;
}

export interface ContaBancaria {
  id: number;
  nome: string | null;
  banco: string;
  agencia: string | null;
  numero: string | null;
  tipo: string;
}

export interface Sessao {
  id: number;
  escopo: Escopo;
  empresa_id: number | null;
  conta_bancaria_id: number | null;
  arquivo_nome: string;
  formato: "ofx" | "csv" | "xlsx";
  cabecalho: string[] | null;
  mapeamento: Mapeamento | null;
  conta_arquivo: { bancoId: string | null; agencia: string | null; conta: string | null } | null;
  saldo_final_informado: string | null;
  data_saldo: string | null;
  periodo_de: string | null;
  periodo_ate: string | null;
  status: "rascunho" | "concluida" | "cancelada";
  sugestao_status: "processando" | "concluida" | "erro" | null;
  sugestao_progresso: number | null;
  resultado: { criados: number; conciliados: number; ignorados: number; duplicados: number } | null;
  atualizado_em: string;
  amostra_bruta: string[][] | null;
}

export interface Resumo {
  total: number;
  pendentes: number;
  sem_categoria: number;
  conciliar: number;
  transferencias: number;
  duplicadas: number;
  ignoradas: number;
  importadas: number;
  entradas: number;
  saidas: number;
}

export interface Detalhe {
  sessao: Sessao;
  linhas: Linha[];
  resumo: Resumo;
  categorias: Categoria[];
  grupos: GrupoPlano[];
  contas_bancarias: ContaBancaria[];
}

export interface Rascunho {
  id: number;
  arquivo_nome: string;
  formato: string;
  atualizado_em: string;
  conta_nome: string | null;
  total_linhas: number;
  sem_categoria: number;
}

export class ErroApi extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(url: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method || "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.form ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroApi((data as any)?.error || (data as any)?.message || `Erro ${res.status}`, res.status);
  return data as T;
}

export const brl = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBr = (iso?: string | null) => {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Nome do banco pelo código COMPE do OFX (para pré-preencher a nova conta). */
export const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "0001": "Banco do Brasil", "1": "Banco do Brasil",
  "033": "Santander", "0033": "Santander", "104": "Caixa Econômica", "0104": "Caixa Econômica",
  "237": "Bradesco", "0237": "Bradesco", "341": "Itaú", "0341": "Itaú", "260": "Nubank", "0260": "Nubank",
  "077": "Inter", "0077": "Inter", "336": "C6 Bank", "0336": "C6 Bank", "290": "PagBank", "380": "PicPay",
  "212": "Banco Original", "756": "Sicoob", "748": "Sicredi", "422": "Safra", "623": "Pan", "208": "BTG Pactual",
  "323": "Mercado Pago", "403": "Cora", "197": "Stone",
};

export const ROTULO_ORIGEM: Record<string, string> = {
  memoria: "Aprendido",
  historico: "Histórico",
  regra: "Sugestão",
  ia: "IA",
};
