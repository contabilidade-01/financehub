/**
 * Detecta meio de pagamento em frases PT-BR (PJ).
 * Espelha o padrão de parse-parcelamento.ts: puro, sem I/O.
 *
 * Exemplos:
 * - "142,41 em dinheiro" → dinheiro
 * - "Pix" / "Pics" (Whisper) → conta_necessaria
 * - "no Banco Santander" → nome + pista conta
 * - "no cartão Santander" → nome + pista cartao
 * - "Conta bancária" → conta_generica
 * - "no cartão" (sem nome) → cartao_generico
 */

export type MeioDetectado =
  | { tipo: "dinheiro" }
  | { tipo: "conta_necessaria"; termo: string }
  | { tipo: "cartao_generico" }
  | { tipo: "conta_generica" } // "conta bancária" / "no banco" sem nome
  | { tipo: "nome"; termo: string; pista?: "conta" | "cartao" }
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
  if (d.tipo === "conta_generica") return "conta";
  if (d.tipo === "nome") {
    if (d.pista === "conta") return `banco ${d.termo}`;
    if (d.pista === "cartao") return `cartao ${d.termo}`;
    return d.termo;
  }
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

const MARCAS =
  "nubank|inter|c6|itau|bradesco|santander|bb|banco\\s+do\\s+brasil|magalu|magazine|hipercard|amex|american\\s+express|visa|mastercard|elo|neon|will|digio|porto|sicoob|sicredi|original|pan|safra";

function temMarca(n: string): boolean {
  return new RegExp(`\\b(${MARCAS})\\b`).test(n);
}

function extrairMarca(n: string): string | null {
  const m =
    n.match(new RegExp(`\\b(${MARCAS})\\b`)) ||
    n.match(/\bbanco\s+do\s+brasil\b/) ||
    n.match(/\bamerican\s+express\b/);
  return m ? m[0] : null;
}

/** Pista explícita de conta bancária no texto. */
export function pistaContaNoTexto(n: string): boolean {
  return (
    /\bbanco\b/.test(n) ||
    /\bconta\s*(corrente|poupanca|bancaria)?\b/.test(n) ||
    /\bc\/c\b/.test(n) ||
    /\bpoupanca\b/.test(n)
  );
}

/** Pista explícita de cartão no texto. */
export function pistaCartaoNoTexto(n: string): boolean {
  return /\bcartao\b/.test(n) || /\bcredito\b/.test(n) || /^cc\s+/.test(n) || /\bcc\s+/.test(n);
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
    return { tipo: "nome", termo: stripPrepMeio(raw) || raw, pista: "conta" };
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
  const isolado = stripPrepMeio(raw);
  if (/^(caixa|caixinha)$/.test(isolado)) {
    return { tipo: "dinheiro" };
  }

  // Pix / Pics (Whisper) / débito / TED / boleto.
  const mConta = n.match(/\b(pix|pics|pixs|piks|pix\.|debito|ted|doc|boleto|transferencia|transferencias)\b/);
  if (mConta) {
    const t = mConta[1].replace(/\.$/, "");
    const termo = /^(pics|pixs|piks)$/.test(t) ? "pix" : t;
    return { tipo: "conta_necessaria", termo };
  }

  // Resposta genérica: "conta bancária", "no banco", "na conta" (sem marca).
  if (
    /^(conta(\s+bancaria)?|banco|conta\s+corrente|poupanca|c\/c|no\s+banco|na\s+conta)$/.test(isolado) ||
    /^(conta(\s+bancaria)?|conta\s+corrente)$/.test(n)
  ) {
    if (!temMarca(n)) return { tipo: "conta_generica" };
  }

  // "banco Santander" / "no Banco X" → nome + pista conta (antes de tratar como cartão).
  const mBanco = n.match(/\bbanco\s+([a-z0-9][a-z0-9.\s]{1,40}?)(?=\s*$|[,.!?]|em\s+\d|\d+\s*[x×]|reais|r\$)/);
  if (mBanco) {
    const termo = mBanco[1].trim().replace(/\s+/g, " ");
    if (termo && !/^(do|da|de)$/.test(termo)) {
      return { tipo: "nome", termo, pista: "conta" };
    }
  }
  // "conta corrente Itaú" / "conta Santander"
  const mContaNome = n.match(/\bconta\s+(?:corrente\s+|poupanca\s+|bancaria\s+)?([a-z0-9][a-z0-9.\s]{1,30}?)(?=\s*$|[,.!?])/);
  if (mContaNome && temMarca(n)) {
    const marca = extrairMarca(n);
    if (marca) return { tipo: "nome", termo: marca, pista: "conta" };
  }

  // "cartão Santander" / "CC Magalu" → nome + pista cartão.
  if (pistaCartaoNoTexto(n) && temMarca(n)) {
    const marca = extrairMarca(n);
    if (marca) return { tipo: "nome", termo: marca, pista: "cartao" };
  }

  // "cartão" / "cartão de crédito" SEM nome → perguntar qual.
  if (pistaCartaoNoTexto(n) && !temMarca(n)) {
    // Evita "conta" genérica confundida — só cartão.
    if (/\bcartao\b/.test(n) || /\bno\s+credito\b/.test(n) || /^cc\b/.test(isolado)) {
      return { tipo: "cartao_generico" };
    }
  }

  // Marca sozinha ou em frase de compra ("compra de 20 no Nubank") — sem pista.
  if (temMarca(n)) {
    const marca = extrairMarca(n);
    if (marca) {
      const pista: "conta" | "cartao" | undefined = pistaContaNoTexto(n)
        ? "conta"
        : pistaCartaoNoTexto(n)
          ? "cartao"
          : undefined;
      return { tipo: "nome", termo: marca, pista };
    }
  }

  // Nome curto (resposta solta: "Itaú") — não frase longa de compra.
  if (isolado && isolado.length >= 2) {
    const palavras = isolado.split(/\s+/).filter(Boolean);
    const pareceFraseCompra =
      palavras.length > 5 ||
      /\b(compra|mercadoria|valor|reais|despesa|receita|lancamento|gastei|paguei|recebi)\b/.test(
        isolado,
      );
    if (!pareceFraseCompra) {
      const pista: "conta" | "cartao" | undefined = pistaContaNoTexto(n)
        ? "conta"
        : pistaCartaoNoTexto(n)
          ? "cartao"
          : undefined;
      return { tipo: "nome", termo: isolado, pista };
    }
  }

  return { tipo: "nenhum" };
}
