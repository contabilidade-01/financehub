/**
 * Carteira Nescon — lógica pura (sem I/O), testada em scripts/testar-cora-carteira.ts.
 *
 * O escritório e o Jean emitem boleto pela mesma conta Cora. No portal
 * nescon-clientes cada cliente é marcado como 'nescon' (do escritório) ou 'jean'
 * (pessoal). Com o filtro ligado, a importação só cria conta a receber para boleto
 * cujo CPF/CNPJ do pagador é de um cliente 'nescon'. Na dúvida fica de fora:
 * sem documento, documento desconhecido ou carteira 'jean' → não entra.
 */

export type Carteira = "nescon" | "jean";
export type FiltroClientes = "todos" | "carteira_nescon";

export interface ClientePortal {
  documento: string; // só dígitos (CPF 11 ou CNPJ 14)
  nome: string | null;
  email: string | null;
  telefone: string | null;
  carteira: Carteira;
  inativo: boolean;
}

export function filtroValido(f: unknown): FiltroClientes {
  return f === "carteira_nescon" ? "carteira_nescon" : "todos";
}

const texto = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Normaliza a resposta de GET /api/interno/clientes-carteira do portal. Descarta
 * linha sem documento válido ou com carteira desconhecida; documento repetido
 * fica com a última ocorrência.
 */
export function normalizarClientesPortal(corpo: unknown): ClientePortal[] {
  const lista = Array.isArray(corpo) ? corpo : Array.isArray((corpo as any)?.clientes) ? (corpo as any).clientes : null;
  if (!lista) throw new Error("Resposta do portal sem a lista de clientes.");
  const porDoc = new Map<string, ClientePortal>();
  for (const c of lista) {
    const documento = String(c?.cnpj ?? c?.documento ?? "").replace(/\D/g, "");
    if (documento.length !== 11 && documento.length !== 14) continue;
    const carteira = String(c?.carteira ?? "").toLowerCase();
    if (carteira !== "nescon" && carteira !== "jean") continue;
    const tel = String(c?.telefone ?? c?.phone ?? "").replace(/\D/g, "");
    porDoc.set(documento, {
      documento,
      nome: texto(c?.nome ?? c?.name, 200),
      email: texto(c?.email ?? c?.contact_email, 200)?.toLowerCase() ?? null,
      telefone: tel.length >= 8 ? tel.slice(0, 20) : null,
      carteira,
      inativo: c?.inativo === true,
    });
  }
  return [...porDoc.values()];
}

/** O boleto deste pagador entra na gestão financeira do escritório? */
export function boletoDaCarteira(documentoPagador: string | null | undefined, carteira: ReadonlyMap<string, string>): boolean {
  const doc = String(documentoPagador ?? "").replace(/\D/g, "");
  if (!doc) return false;
  return carteira.get(doc) === "nescon";
}
