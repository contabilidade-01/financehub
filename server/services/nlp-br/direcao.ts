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

/** Pontuação simples: sinais fortes de recebimento vencem verbos genéricos. */
export function detectarDirecao(texto: string): Direcao | null {
  const t = semAcento(texto);
  if (!t.trim()) return null;
  let r = 0;
  let d = 0;
  RECEITA.forEach((re, i) => { if (re.test(t)) r += i < 3 ? 3 : 2; });
  DESPESA.forEach((re, i) => { if (re.test(t)) d += i < 2 ? 2 : 1; });
  // "paguei" + "me pagou" na mesma frase: quem pagou a quem decide pelos pronomes
  if (/\b(me|nos)\s+(pagou|pagaram)\b/.test(t)) r += 2;
  if (r === d) return null;
  return r > d ? "Receita" : "Despesa";
}
