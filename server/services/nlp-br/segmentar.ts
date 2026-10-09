/**
 * Mensagens com vários lançamentos ("frete 50 e comissão 30, mercado 120")
 * e reconciliação dos argumentos do LLM com o texto real do cliente.
 */
import { extrairCandidatosValor, extrairValorBR } from "./valor";
import { extrairDataBR, hojeSP, somarDias } from "./data";
import { detectarDirecao, type Direcao } from "./direcao";

export type Trecho = { texto: string; valor: number | null };

/** Divide por quebra de linha, ";", ", " e " e " — só quando cada parte tem o próprio valor numérico. */
export function segmentarLancamentos(texto: string): Trecho[] {
  const bruto = String(texto || "").trim();
  if (!bruto) return [];
  const partes = bruto
    .split(/\n+|;\s*|,\s+(?=\D)|\s+e\s+(?=[a-zà-ú])|\s+\+\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const comValor = partes.map((p) => ({ texto: p, valor: extrairValorBR(p), numerico: extrairCandidatosValor(p).some((c) => c.motivo !== "extenso") }));
  // Precisa de 2+ partes, todas com valor numérico próprio; senão é um lançamento só.
  if (comValor.length >= 2 && comValor.every((p) => p.valor != null && p.numerico)) {
    return comValor.map(({ texto, valor }) => ({ texto, valor }));
  }
  return [{ texto: bruto, valor: extrairValorBR(bruto) }];
}

/** Trecho da mensagem que corresponde a um lançamento (pelo valor), para classificar item a item. */
export function trechoDoLancamento(texto: string, valor?: number | null, descricao?: string | null): string {
  const trechos = segmentarLancamentos(texto);
  if (trechos.length <= 1) return String(texto || "");
  const v = Number(valor);
  const porValor = trechos.filter((t) => t.valor != null && Math.abs((t.valor as number) - v) < 0.005);
  if (porValor.length === 1) return porValor[0].texto;
  const d = String(descricao || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const porDesc = trechos.find((t) => d.some((w) => t.texto.toLowerCase().includes(w)));
  return porDesc ? porDesc.texto : String(descricao || texto || "");
}

export type Reconciliado = {
  valor: number | null;
  data: string;
  tipo: Direcao | null;
  ajustes: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Corrige os argumentos do LLM com o que o cliente escreveu:
 *  - valor: se a mensagem tem UM valor claro e o LLM divergiu (ex.: 1.5 × 1500), vale o texto;
 *  - data: data explícita no texto vence; sem data → hoje (SP); datas absurdas → hoje;
 *  - tipo: sinal claro de entrada/saída no texto vence um tipo divergente/ausente.
 * `origemMidia`: texto de OCR/transcrição — só completa campos ausentes.
 */
export function reconciliarLancamento(
  args: { valor?: unknown; data?: unknown; tipo?: unknown },
  mensagem: string,
  opts: { hoje?: string; origemMidia?: boolean; multiplos?: boolean } = {},
): Reconciliado {
  const hoje = opts.hoje || hojeSP();
  const ajustes: string[] = [];
  const trechos = segmentarLancamentos(mensagem);
  const multiplos = opts.multiplos ?? trechos.length > 1;

  // ---- valor ----
  let valor = Number(String(args.valor ?? "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) valor = NaN;
  const valorTexto = multiplos ? null : extrairValorBR(mensagem);
  if (valorTexto != null) {
    if (Number.isNaN(valor)) {
      valor = valorTexto;
      ajustes.push(`valor ausente → ${valorTexto} (texto)`);
    } else if (!opts.origemMidia && Math.abs(valor - valorTexto) >= 0.01) {
      ajustes.push(`valor ${valor} → ${valorTexto} (texto)`);
      valor = valorTexto;
    }
  }

  // ---- data ----
  const dataLlm = typeof args.data === "string" && ISO.test(args.data) ? args.data : null;
  const dataTexto = extrairDataBR(mensagem, hoje)?.data || null;
  let data = hoje;
  if (dataTexto && !opts.origemMidia) {
    data = dataTexto;
    if (dataLlm && dataLlm !== dataTexto) ajustes.push(`data ${dataLlm} → ${dataTexto} (texto)`);
  } else if (dataLlm) {
    const longe = dataLlm < somarDias(hoje, -400) || dataLlm > somarDias(hoje, 400);
    if (longe) ajustes.push(`data ${dataLlm} fora do intervalo → hoje`);
    else data = dataLlm;
  } else if (dataTexto) {
    data = dataTexto;
  }

  // ---- tipo ----
  const tipoLlm = /receita|entrada|income|recebimento/i.test(String(args.tipo || ""))
    ? "Receita"
    : /despesa|saida|saída|expense|gasto|pagamento/i.test(String(args.tipo || ""))
      ? "Despesa"
      : null;
  const tipoTexto = opts.origemMidia ? null : detectarDirecao(multiplos ? trechoDoLancamento(mensagem, valor) : mensagem);
  let tipo: Direcao | null = tipoLlm;
  if (tipoTexto && tipoTexto !== tipoLlm) {
    ajustes.push(`tipo ${tipoLlm ?? "?"} → ${tipoTexto} (texto)`);
    tipo = tipoTexto;
  }

  return { valor: Number.isNaN(valor) ? null : Math.round(valor * 100) / 100, data, tipo, ajustes };
}
