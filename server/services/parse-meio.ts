/**
 * Detecta meio de pagamento em frases PT-BR (PJ).
 * Espelha o padrão de parse-parcelamento.ts: puro, sem I/O.
 *
 * Exemplos:
 * - "Compra de mercadorias no valor de 142,41 em dinheiro" → dinheiro
 * - "Via caixa" / "Em dinheiro" → dinheiro
 * - "Pix" / "no pix" / "boleto" → conta_necessaria
 * - "pelo Itaú" → nome
 * - "Caixa Econômica" / "cartão Caixa" → nome (não é dinheiro)
 * - "no cartão de crédito" / "no cartão" (sem nome) → cartao_generico
 */

export type MeioDetectado =
  | { tipo: "dinheiro" }
  | { tipo: "conta_necessaria"; termo: string }
  | { tipo: "cartao_generico" } // "cartão" / "crédito" sem nome do cartão
  | { tipo: "nome"; termo: string }
  | { tipo: "nenhum" };

export function normMeio(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Remove preposições/artigos no começo (respostas curtas: "em dinheiro", "via caixa"). */
export function stripPrepMeio(s: string): string {
  return normMeio(s).replace(/^(em|no|na|de|do|da|dos|das|via|com|pelo|pela|por)\s+/, "").trim();
}

/** Converte detecção em texto para resolverMeioPorNomePj / forma_pagamento. */
export function textoMeioDeDetect(d: MeioDetectado): string {
  if (d.tipo === "dinheiro") return "dinheiro";
  if (d.tipo === "conta_necessaria") return d.termo;
  if (d.tipo === "cartao_generico") return "cartao";
  if (d.tipo === "nome") return d.termo;
  return "";
}

/** Caixa como banco/cartão — não é dinheiro em espécie. */
function ehCaixaBanco(n: string): boolean {
  return (
    /\bcaixa\s+economica\b/.test(n) ||
    /\bconta\s+(da\s+)?caixa\b/.test(n) ||
    /\bcartao\s+(da\s+|do\s+)?caixa\b/.test(n) ||
    /\bcc\s+caixa\b/.test(n) ||
    /\bcaixa\s+(pj|empresarial|business)\b/.test(n)
  );
}

/** Nome próprio de cartão/banco na frase (não só "cartão de crédito"). */
function temNomeCartaoEspecifico(n: string): boolean {
  return /\b(nubank|inter|c6|itau|bradesco|santander|bb|banco\s+do\s+brasil|magalu|magazine|hipercard|amex|american\s+express|visa|mastercard|elo|neon|will|digio|porto|sicoob|sicredi|original|pan|safra)\b/.test(
    n,
  );
}

/**
 * Detecta o meio na frase inteira (não só resposta isolada).
 */
export function detectarMeio(texto: string): MeioDetectado {
  const raw = String(texto || "").trim();
  if (!raw) return { tipo: "nenhum" };
  const n = normMeio(raw);

  // "Caixa Econômica" / "cartão Caixa" → nome (falso positivo de dinheiro).
  if (ehCaixaBanco(n)) {
    return { tipo: "nome", termo: stripPrepMeio(raw) || raw };
  }

  // Dinheiro / espécie / caixinha / cash — em qualquer posição da frase.
  if (
    /\b(dinheiro(\s+vivo)?|especies?|em\s+especie|caixinha|cash|a\s+vista\s+em\s+dinheiro)\b/.test(n)
  ) {
    return { tipo: "dinheiro" };
  }
  // "via caixa", "em caixa", "no caixa" — espécie, não banco.
  if (/\b(via|em|no|na)\s+caixa\b/.test(n)) {
    return { tipo: "dinheiro" };
  }
  // Resposta curta: só "caixa" (depois de tirar prep).
  const isolado = stripPrepMeio(raw);
  if (/^(caixa|caixinha)$/.test(isolado)) {
    return { tipo: "dinheiro" };
  }

  // Pix / débito / TED / boleto / transferência → precisa conta bancária.
  const mConta = n.match(/\b(pix|debito|ted|doc|boleto|transferencia|transferencias)\b/);
  if (mConta) {
    return { tipo: "conta_necessaria", termo: mConta[1] };
  }

  // "cartão" / "cartão de crédito" / "no crédito" SEM nome → perguntar qual.
  if (
    /\b(cartao(\s+de)?\s+credito|cartao\s+credito|no\s+credito|no\s+cartao|cartao)\b/.test(n) &&
    !temNomeCartaoEspecifico(n)
  ) {
    return { tipo: "cartao_generico" };
  }

  // Nome de banco/cartão na frase (mesmo em "compra de 20 no Nubank").
  if (temNomeCartaoEspecifico(n)) {
    const m =
      n.match(
        /\b(nubank|inter|c6|itau|bradesco|santander|magalu|magazine|hipercard|amex|neon|will|digio|porto|sicoob|sicredi|original|pan|safra)\b/,
      ) ||
      n.match(/\bbanco\s+do\s+brasil\b/) ||
      n.match(/\bamerican\s+express\b/);
    if (m) return { tipo: "nome", termo: m[0] };
  }

  // Nome curto (resposta solta: "Itaú", "pelo Nubank") — não frase longa de compra.
  if (isolado && isolado.length >= 2) {
    const palavras = isolado.split(/\s+/).filter(Boolean);
    const pareceFraseCompra =
      palavras.length > 5 ||
      /\b(compra|mercadoria|valor|reais|despesa|receita|lancamento|gastei|paguei|recebi)\b/.test(
        isolado,
      );
    if (!pareceFraseCompra) {
      return { tipo: "nome", termo: isolado };
    }
  }

  return { tipo: "nenhum" };
}
