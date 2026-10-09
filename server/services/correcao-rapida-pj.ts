/**
 * Correções rápidas no WhatsApp PJ, sem depender do modelo:
 *
 *  - "Código 3.07" / "conta 3.07" / "classifica em 3.07" → conta do plano de
 *    contas (NUNCA um lançamento de R$ 3,07).
 *  - "Corrige o valor 100,00" / "muda o valor do #204 para 100" → edita o
 *    lançamento (o citado, ou o último feito pelo WhatsApp), com confirmação.
 *
 * Edição sempre pede "SIM" antes de gravar (mesma regra do agente).
 */
import { extrairValorBR } from "./nlp-br";
import { criarPendencias } from "./ia-pendencias";

function norm(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const RE_CODIGO_CONTA = /\b(\d{1,2}(?:\.\d{1,3}){1,3})\b/;

/**
 * Mensagem que só aponta uma conta do plano ("Código 3.07", "conta 3.07",
 * "classifica em 3.07", "lança na 3.07"). Devolve o código ou null.
 */
export function detectarCodigoConta(texto: string): string | null {
  const t = norm(texto).replace(/[.!]+$/, "");
  if (!t || t.length > 50) return null;
  const m = t.match(
    /^(?:(?:e|eh|o|a|no|na)\s+)?(?:codigo|cod\.?|conta|categoria|classifica\w*|classifique|coloca|coloque|lanca|lance|poe|ponha|move|mova|muda|mude)(?:\s+(?:em|na|no|pra|para|como|a|o|da|do|de|conta|codigo))*\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,3}){1,3})$/,
  );
  return m ? m[1] : null;
}

/** "3.07" isolado depois de a gente perguntar a conta não é valor (tem ponto e 2 níveis). */
export function pareceCodigoDeConta(texto: string): boolean {
  return detectarCodigoConta(texto) != null || /^\s*\d{1,2}\.\d{2}\.\d{1,3}\s*$/.test(texto);
}

export type CorrecaoValor = { valor: number; id?: number };

/**
 * "Corrige o valor 100,00", "corrigir valor para 100", "muda o valor do #204 pra 1.500",
 * "o valor certo é 100" (só quando começa com verbo de correção).
 */
export function detectarCorrecaoValor(texto: string): CorrecaoValor | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length > 90) return null;
  const t = norm(raw);
  const m = t.match(
    /^(?:por\s+favor\s+)?(?:corrig\w*|corrij\w*|altera\w*|alterar|muda\w*|mude|troca\w*|troque|ajusta\w*|ajuste|edita\w*|edite|arruma\w*|conserta\w*)\s+(?:o\s+|a\s+)?valor\b(.*)$/,
  );
  if (!m) return null;
  let resto = m[1];
  let id: number | undefined;
  const mId = resto.match(/(?:do|da|no|na)?\s*(?:lancamento|codigo|cod\.?|transacao)?\s*#\s*(\d{1,9})\b|(?:do|da)\s+(?:lancamento|codigo|transacao)\s+(\d{1,9})\b/);
  if (mId) {
    id = Number(mId[1] || mId[2]);
    resto = resto.replace(mId[0], " ");
  }
  const valor = extrairValorBR(resto);
  if (valor == null || valor <= 0) return null;
  return id ? { valor, id } : { valor };
}

// ---------------------------------------------------------------------------
// Edição pendente de confirmação
// ---------------------------------------------------------------------------

export type EdicaoPendente = {
  userId: number;
  empresaId: number;
  id: number;
  descricao: string;
  campos: { valor?: number; conta?: string };
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const pendentes = criarPendencias<EdicaoPendente>("edicao_pj");

export function registrarEdicao(e: Omit<EdicaoPendente, "expiresAt">): void {
  pendentes.set(e.userId, { ...e, expiresAt: Date.now() + TTL_MS });
}

export function obterEdicao(userId: number): EdicaoPendente | null {
  const e = pendentes.get(userId);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    pendentes.delete(userId);
    return null;
  }
  return e;
}

export function limparEdicao(userId: number): void {
  pendentes.delete(userId);
}

function money(v: number): string {
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function mensagemConfirmarValor(l: { id: number; descricao: string; valor: number }, novo: number): string {
  return (
    `✏️ *Confirma a alteração?*\n` +
    `#${l.id} — *${l.descricao}*\n` +
    `Valor: R$ ${money(l.valor)} → *R$ ${money(novo)}*\n\n` +
    `Responda *SIM* para eu alterar.`
  );
}

export function mensagemConfirmarConta(
  l: { id: number; descricao: string; valor: number; contaAtual?: string | null },
  conta: { codigo: string; nome: string },
): string {
  return (
    `✏️ *Confirma a alteração?*\n` +
    `#${l.id} — *${l.descricao}* (R$ ${money(l.valor)})\n` +
    `Conta: ${l.contaAtual ? `${l.contaAtual} → ` : ""}*${conta.codigo} — ${conta.nome}*\n\n` +
    `Responda *SIM* para eu alterar.`
  );
}
