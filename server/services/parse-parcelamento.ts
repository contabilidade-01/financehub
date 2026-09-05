/**
 * Interpreta frases de compra parcelada em PT-BR.
 * Usado pelo agente como rede de segurança quando o modelo erra args
 * ou o usuário manda tudo numa frase só.
 *
 * Exemplos cobertos:
 * - "3x100", "3x de 100", "3 x R$ 100,00" → parcela
 * - "compra parcelada de 300 em 3x" → total
 * - "parcelada no valor de 300 em 3x" → total
 * - "300 reais em 3 vezes" → total
 * - "em 5x no Itaú" (só qtd; valor vem à parte)
 */

export type ParcelamentoParsed = {
  parcelas: number | null;
  valorParcela: number | null;
  valorTotal: number | null;
  /** Como o valor único foi interpretado quando só há um número + Nx. */
  modo: "parcela" | "total" | null;
  cartaoHint: string | null;
};

function parseMoneyBR(raw: string): number | null {
  const t = String(raw || "")
    .trim()
    .replace(/R\$\s?/i, "")
    .replace(/\s/g, "");
  if (!t) return null;
  let n: number;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t)) {
    n = Number(t.replace(/\./g, "").replace(",", "."));
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    n = Number(t);
  } else {
    n = Number(t.replace(",", "."));
  }
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CARTAO_COM_PALAVRA =
  /(?:no\s+)?(?:cart[aã]o|cc)\s+(?:do\s+|da\s+|de\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9.\s]{0,30}?)(?=\s*$|[,.!?]|\s+em\s+\d|\s+\d+\s*[x×])/i;
// Evitar \\b após acentos (JS trata "ú" como não-word → cortava "Itaú" em "Ita").
const CARTAO_NO_NOME =
  /\b(?:no|na)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.]*(?:\s+(?:Luiza|PJ|Business|Empresarial|Visa|Master))?)(?=\s|$|[,.!?]|em\s+\d|\d+\s*[x×])/i;

/**
 * Detecta se o texto fala em parcelamento (mesmo sem extrair números).
 */
export function textoSugereParcelamento(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  return /parcelad|parcelamento|\d+\s*[x×]\s*|em\s+\d+\s*[x×]|em\s+\d+\s*vezes|dividid[oa]\s+em/i.test(t);
}

function extrairCartaoHint(raw: string): string | null {
  const m1 = raw.match(CARTAO_COM_PALAVRA);
  if (m1?.[1]) {
    const nome = m1[1].trim().replace(/\s+/g, " ");
    if (nome && !/^(parcelad|valor|reais|vezes|compra)/i.test(nome)) return nome;
  }
  const m2 = raw.match(CARTAO_NO_NOME);
  if (m2?.[1]) {
    const nome = m2[1].trim();
    if (!/^(cart[aã]o|cc|valor|parcel|compra|vezes|reais|credito|cr[eé]dito)/i.test(nome)) {
      return nome;
    }
  }
  return null;
}

/**
 * Extrai parcelas / valores / dica de cartão de uma frase livre.
 */
export function parseParcelamentoDoTexto(texto: string): ParcelamentoParsed {
  const raw = String(texto || "").trim();
  const out: ParcelamentoParsed = {
    parcelas: null,
    valorParcela: null,
    valorTotal: null,
    modo: null,
    cartaoHint: null,
  };
  if (!raw) return out;

  out.cartaoHint = extrairCartaoHint(raw);

  // "Nx de V" / "Nx V" → valor da parcela
  const mParcela =
    raw.match(/(\d{1,2})\s*[x×]\s*(?:de\s+)?(?:R\$\s*)?([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)/i) ||
    raw.match(/(\d{1,2})\s*[x×]\s*(?:de\s+)?([\d.]+,\d{2}|\d+)/i);
  if (mParcela) {
    const n = Number(mParcela[1]);
    const v = parseMoneyBR(mParcela[2]);
    if (n >= 2 && n <= 60 && v) {
      out.parcelas = n;
      out.valorParcela = v;
      out.modo = "parcela";
      out.valorTotal = Math.round(v * n * 100) / 100;
      return out;
    }
  }

  // "valor de 300 em 3x" / "parcelada de 300 em 3x" / "300 em 3x" / "300 em 3 vezes"
  const mTotal =
    raw.match(
      /(?:valor\s+de|parcelad[oa]s?(?:\s+no\s+valor\s+de)?|compra\s+parcelada(?:\s+de)?|total\s+de)\s*(?:R\$\s*)?([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)\s*(?:reais)?\s*(?:em|dividid[oa]\s+em)\s*(\d{1,2})\s*(?:[x×]|vezes)?/i,
    ) ||
    raw.match(
      /(?:R\$\s*)?([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)\s*(?:reais)?\s+(?:em|dividid[oa]\s+em)\s+(\d{1,2})\s*(?:[x×]|vezes)/i,
    );
  if (mTotal) {
    const v = parseMoneyBR(mTotal[1]);
    const n = Number(mTotal[2]);
    if (v && n >= 2 && n <= 60) {
      out.parcelas = n;
      out.valorTotal = v;
      out.modo = "total";
      out.valorParcela = Math.round((v / n) * 100) / 100;
      return out;
    }
  }

  // Só "em 5x" / "em 5 vezes" / "parcelada em 5x"
  const mSoQtd = raw.match(/(?:em|parcelad[oa]s?\s+em|dividid[oa]\s+em)\s+(\d{1,2})\s*(?:[x×]|vezes)/i);
  if (mSoQtd) {
    const n = Number(mSoQtd[1]);
    if (n >= 2 && n <= 60) out.parcelas = n;
  }

  return out;
}

/**
 * Mescla args da tool com o que veio no texto do usuário.
 * Prioridade: args explícitos da tool > parse do texto.
 */
export function resolverValoresParcelamento(opts: {
  args: Record<string, any>;
  userMessage?: string;
}): {
  parcelas: number;
  valorTotal: number;
  valorParcela: number;
  fonte: string;
  incompleto?: string;
} {
  const parsed = parseParcelamentoDoTexto(opts.userMessage || "");
  const args = opts.args || {};

  let parcelas = Math.min(60, Math.max(0, Number(args.parcelas) || 0));
  if (parcelas < 2 && parsed.parcelas) parcelas = parsed.parcelas;

  let valorParcela = Number(args.valor_parcela) || 0;
  let valorTotal =
    args.valor_total != null && Number(args.valor_total) > 0 ? Number(args.valor_total) : 0;

  // Args: só "valor" sem valor_total → no parcelamento, costuma ser a parcela
  // (exceto se o texto deixou claro que é total).
  if (!valorParcela && !valorTotal && Number(args.valor) > 0) {
    if (parsed.modo === "total") {
      valorTotal = Number(args.valor);
    } else {
      valorParcela = Number(args.valor);
    }
  }

  if (!valorParcela && parsed.valorParcela) valorParcela = parsed.valorParcela;
  if (!valorTotal && parsed.valorTotal && parsed.modo === "total") valorTotal = parsed.valorTotal;

  if (parcelas < 2) {
    return {
      parcelas: 0,
      valorTotal: 0,
      valorParcela: 0,
      fonte: "incompleto",
      incompleto: "Quantas parcelas? (ex.: 3x, 5 vezes)",
    };
  }

  if (valorTotal > 0 && !valorParcela) {
    valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
  }
  if (valorParcela > 0 && !valorTotal) {
    valorTotal = Math.round(valorParcela * parcelas * 100) / 100;
  }

  if (!(valorTotal > 0) || !(valorParcela > 0)) {
    return {
      parcelas,
      valorTotal: 0,
      valorParcela: 0,
      fonte: "incompleto",
      incompleto:
        "Faltou o valor. Digite tipo '3x de 100' (parcela) ou '300 em 3x' (total).",
    };
  }

  // Se vieram os dois e não batem (~1 centavo), preferir valor_total informado.
  const produto = Math.round(valorParcela * parcelas * 100) / 100;
  if (args.valor_total != null && Math.abs(produto - valorTotal) > 0.05) {
    valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
  }

  return {
    parcelas,
    valorTotal,
    valorParcela,
    fonte: args.valor_parcela || args.valor_total || args.parcelas ? "args+texto" : "texto",
  };
}
