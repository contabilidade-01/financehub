/**
 * Atalho PJ: "abastecimento do carro 124,50" sem meio → uma pergunta só.
 * Não deixa o modelo inventar cartão nem "nenhum cartão cadastrado".
 */
import { detectarMeio, textoMeioDeDetect } from "./parse-meio";

export type LancamentoSemMeio = {
  descricao: string;
  valor: number;
  tipo: "Receita" | "Despesa";
};

type Pendente = LancamentoSemMeio & {
  userId: number;
  empresaNome: string;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const pendentes = new Map<number, Pendente>();

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseValorBR(texto: string): number | null {
  const m = String(texto || "").match(
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
  );
  if (!m) return null;
  let n = m[1];
  if (n.includes(",") && n.includes(".")) n = n.replace(/\./g, "").replace(",", ".");
  else if (n.includes(",")) n = n.replace(",", ".");
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0 || v > 9_999_999) return null;
  return Math.round(v * 100) / 100;
}

function pareceConsultaOuComando(n: string): boolean {
  return /\b(quanto|saldo|resumo|extrato|apaga|exclui|delete|edita|corrige|desfaz|restaura|ola|oi\b|menu|ajuda)\b/.test(
    n,
  );
}

export function pareceLancamentoSemMeio(texto: string): LancamentoSemMeio | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length < 4) return null;
  const n = norm(raw);
  if (pareceConsultaOuComando(n)) return null;
  if (detectarMeio(raw).tipo !== "nenhum") return null;
  if (/\b(parcelad|em\s+\d+\s*x|\d+\s*x\s*(de)?)\b/.test(n)) return null;

  const valor = parseValorBR(raw);
  if (valor == null) return null;

  let desc = raw
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\b(novo|nova|gastei|paguei|recebi|lancar|lanca|registre)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (desc.length < 3) return null;

  const tipo: "Receita" | "Despesa" = /\b(recebi|receita|entrou|faturei)\b/.test(n)
    ? "Receita"
    : "Despesa";
  return { descricao: desc, valor, tipo };
}

export function registrarPendenteMeio(
  userId: number,
  empresaNome: string,
  item: LancamentoSemMeio,
): void {
  pendentes.set(userId, {
    ...item,
    userId,
    empresaNome,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function obterPendenteMeio(userId: number): Pendente | null {
  const p = pendentes.get(userId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pendentes.delete(userId);
    return null;
  }
  return p;
}

export function limparPendenteMeio(userId: number): void {
  pendentes.delete(userId);
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function mensagemPedirMeio(item: LancamentoSemMeio): string {
  const verbo = item.tipo === "Receita" ? "entrou" : "foi pago";
  return (
    `Anotei *${item.descricao}* — R$ ${money(item.valor)}.\n\n` +
    `Como ${verbo}?\n` +
    `• *Caixinha* (dinheiro)\n` +
    `• conta bancária (ex.: pix + o banco)\n` +
    `• cartão\n\n` +
    `Responda só isso que eu lanço.`
  );
}

/** Resposta curta que só informa o meio (depois da pergunta). */
export function respostaEhSoMeio(texto: string): string | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length > 80) return null;
  const det = detectarMeio(raw);
  if (det.tipo === "nenhum") return null;
  // Frase longa com descrição+valor não é "só o meio".
  if (pareceLancamentoSemMeio(raw)) return null;
  const meio = textoMeioDeDetect(det);
  return meio || null;
}
