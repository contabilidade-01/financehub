/**
 * Valores monetários em português do Brasil, como o cliente escreve no WhatsApp.
 *
 *  "1.500"        → 1500      (ponto + 3 dígitos = milhar)
 *  "1.500,00"     → 1500
 *  "1,5k" / "2k"  → 1500 / 2000
 *  "2 mil"        → 2000      "1,2 mil" → 1200
 *  "mil e duzentos reais" → 1200
 *  "R$ 80" / "80 reais" / "80 conto"
 *
 * Escolhe o número que é DINHEIRO, não o primeiro: ignora "dia 5", "05/09",
 * "3x", "em 10 vezes", "2 pizzas", "40 litros", "10%", "14h".
 */

const semAcento = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const LIMITE = 99_999_999;

/** Converte um número escrito em formato BR/US para Number. */
export function numeroBR(bruto: string): number | null {
  let n = String(bruto || "").trim().replace(/\s/g, "");
  if (!n || !/^\d[\d.,]*$/.test(n)) return null;
  const temPonto = n.includes(".");
  const temVirgula = n.includes(",");
  if (temPonto && temVirgula) {
    // O último separador é o decimal: "1.500,00" (BR) ou "1,500.00" (US)
    if (n.lastIndexOf(",") > n.lastIndexOf(".")) n = n.replace(/\./g, "").replace(",", ".");
    else n = n.replace(/,/g, "");
  } else if (temVirgula) {
    const partes = n.split(",");
    // "1,5" / "12,90" = decimal BR; "1,500,000" (vários grupos) = milhar US
    n = partes.length === 2 ? `${partes[0]}.${partes[1]}` : partes.join("");
  } else if (temPonto) {
    const partes = n.split(".");
    // "1.500" / "12.000.000" = milhar; "1.5" / "12.90" = decimal
    const ehMilhar = partes.length > 2 || (partes.length === 2 && partes[1].length === 3);
    n = ehMilhar ? partes.join("") : n;
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// ---------------- números por extenso ----------------
const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

/** "mil e duzentos" → 1200; "dois mil e quinhentos" → 2500; "cento e cinquenta" → 150. */
export function numeroPorExtenso(texto: string): number | null {
  const palavras = semAcento(texto).replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  let total = 0;
  let atual = 0;
  let achou = false;
  for (const p of palavras) {
    if (p === "e") continue;
    if (p in UNIDADES) {
      atual += UNIDADES[p];
      achou = true;
    } else if (p === "mil") {
      total += (atual || 1) * 1000;
      atual = 0;
      achou = true;
    } else if (p === "milhao" || p === "milhoes") {
      total += (atual || 1) * 1_000_000;
      atual = 0;
      achou = true;
    } else if (achou) {
      break;
    }
  }
  return achou ? total + atual : null;
}

// ---------------- extração com contexto ----------------
export type CandidatoValor = {
  valor: number;
  inicio: number;
  fim: number;
  pontos: number;
  motivo: string;
};

const RE_NUM = /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,3})?)(\s*(?:k\b|mil\b|milh[oõ]es\b|milh[aã]o\b))?/gi;
const RE_EXTENSO =
  /\b((?:(?:um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzent[oa]s|trezent[oa]s|quatrocent[oa]s|quinhent[oa]s|seiscent[oa]s|setecent[oa]s|oitocent[oa]s|novecent[oa]s|mil)(?:\s+e\s+|\s+)?)+)\s*(reais|real|conto|contos|pila|pilas)\b/gi;

const UNIDADES_NAO_MONETARIAS =
  /^\s*(x\b|vezes|parcela|parcelas|prestac|%|por ?cento|h\b|hs\b|hora|horas|min\b|minuto|km\b|kg\b|g\b|l\b|lt\b|litro|litros|m2|m²|metro|metros|dia\b(?!\s*\d)|dias|mes\b|meses|ano\b|anos|unidade|unidades|un\b|und\b|pe[cç]a|pe[cç]as|caixa|caixas|pacote|pacotes|garrafa|garrafas|pizza|pizzas|lanche|lanches|cerveja|cervejas|refri|pessoa|pessoas|kit|kits|sacos?|latas?|itens|item|x-|°)/i;

function contexto(texto: string, inicio: number, fim: number) {
  const antes = semAcento(texto.slice(Math.max(0, inicio - 14), inicio));
  const depois = semAcento(texto.slice(fim, fim + 14));
  return { antes, depois };
}

export function extrairCandidatosValor(texto: string): CandidatoValor[] {
  const bruto = String(texto || "");
  const out: CandidatoValor[] = [];
  let m: RegExpExecArray | null;

  RE_NUM.lastIndex = 0;
  while ((m = RE_NUM.exec(bruto))) {
    const inicio = m.index;
    const fim = m.index + m[0].length;
    const prefixoRs = !!m[1];
    const sufixo = semAcento(m[3] || "").trim();
    let v = numeroBR(m[2]);
    if (v == null) continue;
    if (sufixo === "k" || sufixo === "mil") v *= 1000;
    else if (sufixo.startsWith("milh")) v *= 1_000_000;

    const { antes, depois } = contexto(bruto, inicio, fim);
    // Datas: "05/09", "5/9/26", "2026-09-05"
    if (/^\s*[\/\-]\s*\d/.test(bruto.slice(fim, fim + 3)) || /\d\s*[\/\-]\s*$/.test(bruto.slice(Math.max(0, inicio - 3), inicio))) continue;
    // Colado em letra ("x3", "3x" tratado abaixo), código ("#123"), hora ("14:30")
    if (/[#:]$/.test(bruto.slice(Math.max(0, inicio - 1), inicio)) || /^:\d/.test(bruto.slice(fim, fim + 2))) continue;
    if (/[a-z]$/i.test(bruto.slice(Math.max(0, inicio - 1), inicio)) && !prefixoRs) continue;

    let pontos = 0;
    const motivos: string[] = [];
    if (prefixoRs) { pontos += 5; motivos.push("R$"); }
    if (/^\s*(reais|real|conto|contos|pila|pilas|brl)\b/.test(depois)) { pontos += 5; motivos.push("reais"); }
    if (/,\d{2}$/.test(m[2]) || /\.\d{2}$/.test(m[2])) { pontos += 2; motivos.push("centavos"); }
    if (sufixo) { pontos += 2; motivos.push(sufixo); }
    if (!prefixoRs && /\b(dia|dias)\s*$/.test(antes)) {
      pontos -= 8; motivos.push("dia");
    }
    if (/\b(por|de|valor|custou|custa|deu|foi|total|paguei|gastei|recebi|pagou|pagaram|vendi|a)\s*$/.test(antes)) {
      pontos += 1; motivos.push("verbo");
    }
    if (!prefixoRs && UNIDADES_NAO_MONETARIAS.test(bruto.slice(fim, fim + 12))) {
      pontos -= 6; motivos.push("unidade");
    }
    if (/^\s*$/.test(bruto.slice(fim).replace(/[.!?)\]]/g, ""))) { pontos += 1; motivos.push("fim"); }
    if (v <= 0 || v > LIMITE) continue;
    out.push({ valor: Math.round(v * 100) / 100, inicio, fim, pontos, motivo: motivos.join(",") || "numero" });
  }

  RE_EXTENSO.lastIndex = 0;
  while ((m = RE_EXTENSO.exec(bruto))) {
    const v = numeroPorExtenso(m[1]);
    if (v == null || v <= 0 || v > LIMITE) continue;
    out.push({ valor: v, inicio: m.index, fim: m.index + m[0].length, pontos: 5, motivo: "extenso" });
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Valor monetário mais provável do texto (ou null).
 * Empate → o ÚLTIMO número (no WhatsApp o valor costuma vir no fim: "mercado 150").
 */
export function extrairValorBR(texto: string): number | null {
  const cands = extrairCandidatosValor(texto).filter((c) => c.pontos > -5);
  if (!cands.length) return null;
  let melhor = cands[0];
  for (const c of cands) if (c.pontos >= melhor.pontos) melhor = c;
  return melhor.valor;
}

/** Todos os valores monetários plausíveis (para mensagens com vários lançamentos). */
export function extrairValoresBR(texto: string): number[] {
  return extrairCandidatosValor(texto)
    .filter((c) => c.pontos > -5)
    .map((c) => c.valor);
}
