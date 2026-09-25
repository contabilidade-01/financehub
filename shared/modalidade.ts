/**
 * Modalidade do cliente: PF, PJ MEI ou PJ ME.
 *
 * Armazenamento (retrocompatível):
 *  - usuarios.tipo_pessoa: 'fisica' | 'juridica' (inalterado)
 *  - usuarios.porte_pj:    'mei' | 'me' | NULL
 *
 * Todo PJ que já existia (porte_pj NULL) é tratado como PJ MEI, sem migração
 * de dados. O ERP PJ (contas a receber, centros de custo, DRE completo, etc.)
 * só é liberado para PJ ME.
 */

export type TipoPessoa = "fisica" | "juridica";
export type PortePj = "mei" | "me";
export type Modalidade = "pf" | "pj_mei" | "pj_me";

export const MODALIDADES: Modalidade[] = ["pf", "pj_mei", "pj_me"];

export const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  pf: "Pessoa Física",
  pj_mei: "PJ MEI",
  pj_me: "PJ ME",
};

export const ROTULO_CURTO_MODALIDADE: Record<Modalidade, string> = {
  pf: "PF",
  pj_mei: "PJ MEI",
  pj_me: "PJ ME",
};

export const DESCRICAO_MODALIDADE: Record<Modalidade, string> = {
  pf: "Minhas finanças pessoais",
  pj_mei: "Microempreendedor Individual",
  pj_me: "Microempresa — gestão completa (ERP)",
};

type UsuarioModalidade = { tipo_pessoa?: string | null; porte_pj?: string | null } | null | undefined;

export function normalizarPorte(porte?: string | null): PortePj {
  return String(porte || "").toLowerCase() === "me" ? "me" : "mei";
}

export function modalidadeDe(user: UsuarioModalidade): Modalidade {
  if (!user || user.tipo_pessoa !== "juridica") return "pf";
  return normalizarPorte(user.porte_pj) === "me" ? "pj_me" : "pj_mei";
}

export function camposDaModalidade(m: Modalidade): { tipo_pessoa: TipoPessoa; porte_pj: PortePj | null } {
  if (m === "pj_me") return { tipo_pessoa: "juridica", porte_pj: "me" };
  if (m === "pj_mei") return { tipo_pessoa: "juridica", porte_pj: "mei" };
  return { tipo_pessoa: "fisica", porte_pj: null };
}

export function rotuloModalidade(user: UsuarioModalidade, curto = false): string {
  const m = modalidadeDe(user);
  return curto ? ROTULO_CURTO_MODALIDADE[m] : ROTULO_MODALIDADE[m];
}

export function ehPj(user: UsuarioModalidade): boolean {
  return modalidadeDe(user) !== "pf";
}

/** ERP PJ completo: somente PJ ME. */
export function temErpPj(user: UsuarioModalidade): boolean {
  return modalidadeDe(user) === "pj_me";
}

/** Converte parâmetros de URL (?tipo=juridica&porte=me, ?tipo=me, ?modalidade=pj_me). */
export function modalidadeDeParametros(params: { tipo?: string | null; porte?: string | null; modalidade?: string | null }): Modalidade {
  const mod = String(params.modalidade || "").toLowerCase();
  if ((MODALIDADES as string[]).includes(mod)) return mod as Modalidade;
  const tipo = String(params.tipo || "").toLowerCase();
  const porte = String(params.porte || "").toLowerCase();
  if (tipo === "me" || tipo === "pj_me" || porte === "me") return "pj_me";
  if (tipo === "juridica" || tipo === "pj" || tipo === "mei" || tipo === "pj_mei" || porte === "mei") return "pj_mei";
  return "pf";
}

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Resposta do WhatsApp ("1", "2", "3", "mei", "microempresa"...) → modalidade. */
export function detectarModalidadeTexto(texto: string): Modalidade | null {
  const t = semAcento(texto).replace(/[*_.!]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t === "3" || t === "me" || /\b(pj me|microempresa|micro empresa|ltda|simples nacional|empresa de pequeno porte|epp)\b/.test(t)) return "pj_me";
  if (t === "2" || /\b(mei|pj mei|microempreendedor|pj|empresa|empresarial|juridica|negocio|cnpj|comercio)\b/.test(t)) return "pj_mei";
  if (t === "1" || /\b(pf|pessoal|pessoa fisica|fisica|particular|eu mesmo|minhas financas)\b/.test(t)) return "pf";
  return null;
}
