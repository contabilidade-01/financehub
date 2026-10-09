/**
 * Regras do plano de contas PJ (puras, sem banco): grupo gerencial de uma
 * conta, grupo sintético onde uma conta nova deve morar e próximo código livre.
 * Usadas pelo storage (criação), importação, ERP e IA — um lugar só.
 */
import { codigoPai, type GrupoGerencial } from "../data/plano-contas-pj-modelos";
import { GRUPOS_GERENCIAIS, grupoEfetivo, classificacaoDoGrupo, compararCodigos } from "../../shared/plano-contas-grupos";

export { GRUPOS_GERENCIAIS, classificacaoDoGrupo, compararCodigos };

export interface ContaPlano {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  classificacao?: string | null;
  grupo_gerencial?: string | null;
  is_cmv?: boolean | null;
  sintetica?: boolean | null;
  parent_id?: number | null;
  ativo?: boolean | null;
}

/** Grupo gerencial efetivo: o informado ou o derivado de tipo × classificação. */
export function grupoDaConta(c: Pick<ContaPlano, "tipo" | "classificacao" | "grupo_gerencial">): GrupoGerencial {
  return grupoEfetivo(c);
}

/**
 * Grupo sintético para uma conta nova sem pai informado: o grupo sintético do
 * mesmo grupo gerencial (menor código). Sem grupo sintético → null (plano antigo).
 */
export function resolverPai(contas: ContaPlano[], nova: { tipo: string; classificacao?: string | null; grupo_gerencial?: string | null }): ContaPlano | null {
  const grupo = grupoDaConta(nova);
  const sinteticas = contas
    .filter((c) => c.sintetica && c.ativo !== false)
    .sort((a, b) => compararCodigos(a.codigo, b.codigo));
  return sinteticas.find((c) => grupoDaConta(c) === grupo) ?? null;
}

/** Próximo código filho de `codigoPai` ("4" → "4.16"; "4.01" → "4.01.01"). */
export function proximoCodigoFilho(contas: Pick<ContaPlano, "codigo">[], codigoPaiAlvo: string): string {
  const usados = new Set(contas.map((c) => c.codigo));
  let maior = 0;
  for (const c of contas) {
    if (codigoPai(c.codigo) !== codigoPaiAlvo) continue;
    const n = parseInt(c.codigo.slice(codigoPaiAlvo.length + 1), 10);
    if (Number.isFinite(n)) maior = Math.max(maior, n);
  }
  for (let n = maior + 1; n < maior + 1000; n++) {
    const cod = `${codigoPaiAlvo}.${String(n).padStart(2, "0")}`;
    if (!usados.has(cod)) return cod;
  }
  return `${codigoPaiAlvo}.${Date.now() % 100000}`;
}

/** Plano antigo (sem grupos sintéticos): 1=Receita, 2=FIXA, 3=VARIAVEL, 4=OUTRA. */
export function prefixoLegado(tipo: string, classificacao?: string | null): string {
  if (tipo === "Receita") return "1";
  return ({ FIXA: "2", VARIAVEL: "3" } as Record<string, string>)[String(classificacao || "OUTRA").toUpperCase()] || "4";
}

/** Normaliza para comparar nomes de conta ("Aluguel e Condomínio" ≈ "aluguel e condominio"). */
export function chaveNome(nome: string): string {
  return String(nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
