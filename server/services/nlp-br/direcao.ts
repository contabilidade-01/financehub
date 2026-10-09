/**
 * Entrada (Receita) ou saída (Despesa) a partir do texto do cliente.
 * Retorna null quando não há sinal claro — o agente deve PERGUNTAR, nunca chutar.
 *
 *  "paguei o João 200"        → Despesa
 *  "o João me pagou 200"      → Receita
 *  "pagaram 200 do serviço"   → Receita
 *  "caiu um pix de 150"       → Receita
 *  "fiz um pix pro João"      → Despesa
 *  "estorno do cartão 80"     → Receita
 */

const semAcento = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Direcao = "Receita" | "Despesa";

const RECEITA: RegExp[] = [
  /\b(me|nos)\s+(pagou|pagaram|pagam|transferiu|transferiram|mandou|mandaram|enviou|enviaram|depositou|depositaram|devolveu|devolveram|deu|deram)\b/,
  /\b(pagou|pagaram|transferiu|transferiram|depositou|mandou|enviou)\s+(pra mim|para mim|pra gente|para nos)\b/,
  /^\s*(ele|ela|eles|elas|o cliente|a cliente|cliente)?\s*(pagaram|pagou)\b(?!.*\b(eu|meu|minha)\b)/,
  /\b(recebi|recebemos|receber|recebido|recebimento|receita|entrou|entrada|caiu|cairam|faturei|faturamos|faturamento)\b/,
  /\b(vendi|vendemos|venda|vendas)\b/,
  /\b(salario|pro-labore|prolabore|pro labore|comissao recebida|dividendos?|rendimentos?|juros recebidos|cashback|reembolso|estorno|estornaram|devolucao|restituicao)\b/,
  /\bpix\s+(de|do|da|dos|das)\s+(?!(luz|agua|aluguel|internet|conta|cartao|boleto|fatura))/,
  /\bganhei\b|\bachei\b/,
];

const DESPESA: RegExp[] = [
  /\b(paguei|pagamos|pago|gastei|gastamos|gasto|comprei|compramos|compra|comprar)\b/,
  /\b(transferi|mandei|enviei|depositei|fiz um pix|fiz pix|pix\s+(pra|para|pro|ao|a))\b/,
  /\b(conta de|boleto|fatura|mensalidade|aluguel|parcela|assinatura|taxa|tarifa|imposto|multa|juros)\b/,
  /\b(saida|saiu|debito|debitou|despesa|custo|custou)\b/,
  /\b(abasteci|almocei|jantei|lanchei|tomei|pedi)\b/,
];

/**
 * Gasto de terceiro que volta para o usuário ("A Receber" no PF):
 *  "despesa a ser reembolsada pela Nescon", "a empresa vai me reembolsar",
 *  "coloca como a receber", "reembolsável".
 * Não confunde com RECEBER o reembolso ("recebi o reembolso" → Receita comum).
 */
const REEMBOLSAVEL: RegExp[] = [
  /\b(a ser|sera|serao|vai ser|vao ser|deve ser|devem ser|para ser|pra ser)\s+(reembolsad[oa]s?|ressarcid[oa]s?)\b/,
  /\breembolsave(l|is)\b/,
  /\b(vai|vao|ira|irao|vai me|vao me|ira me|irao me|me)\s+(reembolsar|reembolsa|ressarcir|ressarce)\b/,
  /\b(reembolso|ressarcimento)\s+(pendente|a receber)\b/,
  /\b(como|para|pra|pro|em|no|na)\s+(o\s+|a\s+)?a receber\b/,
  /\b(conta|nome)\s+d[aeo]\s+terceir/,
];

export function detectarReembolsavel(texto: string): boolean {
  const t = semAcento(texto);
  if (!t.trim()) return false;
  if (/\b(recebi|recebemos|caiu|entrou)\b[^.]*\b(reembolso|ressarcimento)\b/.test(t)) return false;
  return REEMBOLSAVEL.some((re) => re.test(t));
}

/** Pontuação simples: sinais fortes de recebimento vencem verbos genéricos. */
export function detectarDirecao(texto: string): Direcao | null {
  let t = semAcento(texto);
  if (!t.trim()) return null;
  // "despesa a ser reembolsada", "coloca a receber": o reembolso é do gasto,
  // não uma entrada — tira essas palavras antes de pontuar.
  const reembolsavel = detectarReembolsavel(t);
  if (reembolsavel) {
    t = t.replace(/\b(a receber|receber|reembols\w*|ressarc\w*)\b/g, " ");
  }
  let r = 0;
  let d = 0;
  RECEITA.forEach((re, i) => { if (re.test(t)) r += i < 3 ? 3 : 2; });
  DESPESA.forEach((re, i) => { if (re.test(t)) d += i < 2 ? 2 : 1; });
  // "paguei" + "me pagou" na mesma frase: quem pagou a quem decide pelos pronomes
  if (/\b(me|nos)\s+(pagou|pagaram)\b/.test(t)) r += 2;
  // Só o sinal de reembolso de terceiro ("coloca a receber") já é um gasto.
  if (reembolsavel && r === 0) return "Despesa";
  if (r === d) return null;
  return r > d ? "Receita" : "Despesa";
}
