/**
 * Regras puras (sem banco) do cadastro automático de conta e cartão na importação.
 *
 * A importação cria sozinha a conta bancária / o cartão que o arquivo descreve e os
 * marca como "cadastro pendente": o cliente completa depois (saldo inicial, dias de
 * fechamento e vencimento, limite). Enquanto isso, os dias do cartão são provisórios.
 */

/** Nome do banco pelo código COMPE (BANKID do OFX). */
export const BANCOS_COMPE: Record<string, string> = {
  "1": "Banco do Brasil", "33": "Santander", "104": "Caixa Econômica", "237": "Bradesco", "341": "Itaú",
  "260": "Nubank", "77": "Inter", "336": "C6 Bank", "290": "PagBank", "380": "PicPay", "212": "Banco Original",
  "756": "Sicoob", "748": "Sicredi", "422": "Safra", "623": "Pan", "208": "BTG Pactual", "323": "Mercado Pago",
  "403": "Cora", "197": "Stone", "655": "Neon", "70": "BRB", "633": "Rendimento", "121": "Agibank",
};

const soDigitos = (s?: string | null) => String(s ?? "").replace(/\D/g, "");

/** Últimos 4 dígitos de um número de conta/cartão ("" quando não há dígitos suficientes). */
export function ultimos4(numero?: string | null): string {
  const d = soDigitos(numero);
  return d.length >= 4 ? d.slice(-4) : "";
}

/** Nome do banco: código COMPE conhecido → ORG do arquivo → "". */
export function nomeBanco(bancoId?: string | null, org?: string | null): string {
  const cod = soDigitos(bancoId).replace(/^0+/, "");
  if (cod && BANCOS_COMPE[cod]) return BANCOS_COMPE[cod];
  const o = String(org ?? "").replace(/\s+/g, " ").trim();
  return o.length >= 2 && o.length <= 60 ? o : "";
}

export function nomeContaAuto(p: { bancoId?: string | null; org?: string | null; conta?: string | null }): { nome: string; banco: string } {
  const banco = nomeBanco(p.bancoId, p.org);
  const f = ultimos4(p.conta);
  const base = banco || "Conta importada";
  return { banco: banco || "Conta importada", nome: f ? `${base} ····${f}` : base };
}

export function nomeCartaoAuto(p: { bancoId?: string | null; org?: string | null; conta?: string | null }): { nome: string; banco: string; ultimos_digitos: string } {
  const banco = nomeBanco(p.bancoId, p.org);
  const f = ultimos4(p.conta);
  return {
    banco,
    ultimos_digitos: f,
    nome: `CC ${banco || "Cartão"}${f ? ` ····${f}` : ""}`.trim(),
  };
}

/**
 * Dias PROVISÓRIOS de um cartão criado sem os dados do cliente: fechamento = dia do fim do
 * período da fatura (o OFX de cartão costuma terminar no fechamento), vencimento 7 dias depois.
 * O cartão fica marcado como pendente; ao salvar os dias reais as faturas são recalculadas.
 */
export function diasProvisorios(periodoAte?: string | null): { fechamento: number; vencimento: number } {
  const dia = Number(String(periodoAte ?? "").slice(8, 10));
  const fechamento = dia >= 1 && dia <= 28 ? dia : 1;
  const vencimento = ((fechamento + 7 - 1) % 28) + 1;
  return { fechamento, vencimento };
}

/** Linha de fatura que é o PAGAMENTO da fatura (sai da conta, não é compra nem estorno). */
export function ehPagamentoFatura(descricao: string): boolean {
  const t = String(descricao ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /pagamento (recebido|de fatura|efetuado|fatura)|pgto\.? (fatura|recebido)|pag(to)?\.? fatura|fatura (paga|anterior)|credito de pagamento|obrigado pelo pagamento|saldo anterior/.test(t);
}

/**
 * CSV/planilha de fatura: a maioria dos bancos lista compra como valor POSITIVO. O sistema usa
 * negativo = saída; quando positivos são maioria, inverte (e o cliente pode desfazer na tela).
 */
export function deveInverterSinal(valores: number[]): boolean {
  let pos = 0, neg = 0;
  for (const v of valores) { if (v > 0) pos++; else if (v < 0) neg++; }
  return pos > neg;
}
