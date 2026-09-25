/**
 * Atalho PJ: "abastecimento do carro 124,50" sem meio → uma pergunta só.
 * Não deixa o modelo inventar cartão nem "nenhum cartão cadastrado".
 */
import { detectarMeio, textoMeioDeDetect } from "./parse-meio";
import { detectarDirecao, extrairValorBR } from "./nlp-br";

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
  // Fase 1: "1.500" = 1500, "1,5k", "dia 5 ... 1500" → valor monetário, não o 1º número.
  return extrairValorBR(texto);
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

  // "entrada", "recebi", "venda"… = RECEITA (antes só entrava como despesa).
  // Sem sinal claro ("abastecimento 124,50") segue como despesa, o caso comum.
  const tipo: "Receita" | "Despesa" =
    detectarDirecao(raw) ??
    (/\b(recebi|receita|entrada|entrei|entrou|recebimento|venda|vendi|vendeu|faturei|faturamento|deposito|caiu)\b/.test(n)
      ? "Receita"
      : "Despesa");

  // Limpa a descrição: tira valores e verbos/comandos, para o nome do lançamento
  // não virar "Registra a entrada de", "Adiciona", "Anota…".
  let desc = raw
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\b(registr\w*|anot\w*|lanc\w*|lan[çc]a\w*|adicion\w*|coloc\w*|p[oõ]e|p[oõ]em|novo|nova|gastei|paguei|recebi|comprei|registre)\b/gi, " ")
    .replace(/\b(entrada|sa[íi]da|despesa|receita)\s+(de|com|do|da|no|na)\b/gi, " ")
    .replace(/\b(entrada|sa[íi]da|despesa|receita)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  desc = desc.replace(/^(a|o|de|da|do|com|para|no|na|em|uns|umas|um|uma)\s+/i, "").trim();

  if (desc.length < 3) {
    // Sem descrição útil: para receita, usa um rótulo genérico e segue;
    // para despesa, devolve null (deixa o fluxo pedir a descrição).
    if (tipo === "Receita") return { descricao: "Recebimento", valor, tipo };
    return null;
  }
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
  // Resposta que carrega um VALOR próprio (ex.: "128,36 gasolina na caixinha") é um
  // lançamento novo — não a resposta "só o meio" da pergunta pendente. Não pode
  // reaproveitar a descrição/valor do pendente anterior.
  if (parseValorBR(raw) != null) return null;
  const meio = textoMeioDeDetect(det);
  return meio || null;
}
