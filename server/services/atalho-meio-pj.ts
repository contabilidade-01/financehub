/**
 * Atalho PJ: "abastecimento do carro 124,50" sem meio → uma pergunta só.
 * Não deixa o modelo inventar cartão nem "nenhum cartão cadastrado".
 */
import { detectarMeio, textoMeioDeDetect } from "./parse-meio";
import { detectarDirecao, extrairValorBR, extrairDataBR, hojeSP } from "./nlp-br";
import { criarPendencias } from "./ia-pendencias";

export type LancamentoSemMeio = {
  descricao: string;
  /** null = o cliente ainda não disse o valor (a próxima pergunta é "qual o valor?"). */
  valor: number | null;
  tipo: "Receita" | "Despesa";
  /** Data informada na mensagem (AAAA-MM-DD). Ausente = hoje. */
  data?: string;
  /** Meio já informado enquanto faltava o valor. */
  meio?: string;
  /** Código da conta do plano informado antes de lançar ("Código 3.07"). */
  conta?: string;
};

type Pendente = LancamentoSemMeio & {
  userId: number;
  empresaNome: string;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
// Persistido no banco (sobrevive a restart/deploy e funciona com várias réplicas).
const pendentes = criarPendencias<Pendente>("meio_pj");

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
  return (
    /\b(quanto|saldo|resumo|extrato|apaga|exclui|delete|edita|corrige|corrigir|corrija|desfaz|restaura|ola|oi\b|menu|ajuda)\b/.test(n) ||
    // "Código 3.07" / "conta 3.07" = conta do plano, não um lançamento de R$ 3,07.
    /\b(codigo|cod|categoria|classifica\w*)\b/.test(n) ||
    /\b\d{1,2}\.\d{2}\.\d{1,3}\b/.test(n) ||
    /^\s*(?:(?:na|no|em|a|o)\s+)?conta\s+\d{1,2}\.\d{1,3}\s*$/.test(n)
  );
}

const RE_RECEITA =
  /\b(recebi|receita|entrada|entrei|entrou|recebimento|venda|vendas|vendi|vendeu|faturei|faturamento|deposito|caiu)\b/;

function tipoDoTexto(raw: string, n: string): "Receita" | "Despesa" {
  // "entrada", "recebi", "venda"… = RECEITA. Sem sinal claro ("abastecimento
  // 124,50") segue como despesa, o caso comum.
  return detectarDirecao(raw) ?? (RE_RECEITA.test(n) ? "Receita" : "Despesa");
}

/** Remove a data da frase ("no dia 22/09/2026", "ontem", "5 de setembro"). */
function tirarData(raw: string, trecho: string | null): string {
  let t = raw;
  if (trecho) {
    // O trecho vem sem acento/minúsculo; a posição é a mesma no texto original
    // (acentos pré-compostos têm um caractere nos dois).
    const alvo = norm(t);
    const i = alvo.indexOf(trecho);
    if (i >= 0 && alvo.length === t.length) t = `${t.slice(0, i)} ${t.slice(i + trecho.length)}`;
  }
  // Datas que sobraram (duas datas na frase, ou texto com acento decomposto).
  return t
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, " ")
    .replace(/\b(?:(?:n?o|d?o|em)\s+)?dia\s*(?=\s|$|[,.;])/gi, " ")
    .replace(/\b(?:n?o|d?o|em|de|na)\s+(?=[,.;]|$)/gi, " ");
}

/** Remove valor, moeda e as palavras que só acompanham o valor. */
function tirarValor(t: string): string {
  return t
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?\s*(?:mil\b|k\b)?/gi, " ")
    .replace(/r\$/gi, " ")
    .replace(/\b(?:reais|real|conto|contos|pila)\b/gi, " ")
    .replace(/\b(?:(?:n?o|d?o|pelo|por|com|de)\s+)?(?:valor|total|preco|preço)\b(?:\s+(?:de|total|foi|e|é|era))*/gi, " ");
}

function limparDescricao(t: string): string {
  let desc = t
    .replace(/\b(registr\w*|anot\w*|lanc\w*|lan[çc]a\w*|adicion\w*|coloc\w*|p[oõ]e|p[oõ]em|novo|nova|gastei|paguei|recebi|comprei|registre)\b/gi, " ")
    .replace(/\b(entrada|sa[íi]da|despesa|receita)\s+(de|com|do|da|no|na)\b/gi, " ")
    .replace(/\b(entrada|sa[íi]da|despesa|receita)\b/gi, " ")
    .replace(/[,;:]+|\s[-–—]+\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Preposições soltas no começo e no fim ("de", "no", "em"…).
  const solta = "(?:a|o|e|de|da|do|com|para|pra|no|na|em|uns|umas|um|uma|dia)";
  for (let i = 0; i < 3; i++) {
    desc = desc
      .replace(new RegExp(`^${solta}\\s+`, "i"), "")
      .replace(new RegExp(`\\s+${solta}$`, "i"), "")
      .replace(/[.!]+$/, "")
      .trim();
  }
  return desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : desc;
}

/** Descrição, data e valor de uma frase de lançamento (sem decidir se é atalho). */
function destrinchar(raw: string, hoje: string) {
  const dataExt = extrairDataBR(raw, hoje);
  const semData = tirarData(raw, dataExt?.trecho ?? null);
  // O valor sai do texto SEM a data: "dia 22/09/2026 no valor de 672" nunca vira 22.
  const valor = parseValorBR(semData);
  const descricao = limparDescricao(tirarValor(semData));
  const data = dataExt && dataExt.data !== hoje ? dataExt.data : undefined;
  return { valor, descricao, data };
}

export function pareceLancamentoSemMeio(texto: string, hoje: string = hojeSP()): LancamentoSemMeio | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length < 4) return null;
  const n = norm(raw);
  if (pareceConsultaOuComando(n)) return null;
  if (detectarMeio(raw).tipo !== "nenhum") return null;
  if (/\b(parcelad|em\s+\d+\s*x|\d+\s*x\s*(de)?)\b/.test(n)) return null;

  const { valor, descricao, data } = destrinchar(raw, hoje);
  if (valor == null) return null;
  const tipo = tipoDoTexto(raw, n);

  if (descricao.length < 3) {
    // Sem descrição útil: para receita, usa um rótulo genérico e segue;
    // para despesa, devolve null (deixa o fluxo pedir a descrição).
    if (tipo === "Receita") return { descricao: "Recebimento", valor, tipo, ...(data ? { data } : {}) };
    return null;
  }
  return { descricao, valor, tipo, ...(data ? { data } : {}) };
}

/** Regex que casa o termo sem ligar para acento ("itau" casa "Itaú"). */
function termoSemAcento(termo: string): string {
  const cls: Record<string, string> = { a: "[aáàâã]", e: "[eéê]", i: "[ií]", o: "[oóôõ]", u: "[uúü]", c: "[cç]" };
  return termo
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .split("")
    .map((ch) => cls[ch] || ch)
    .join("")
    .replace(/\s+/g, "\\s+");
}

const PREP_MEIO = "(?:\\b(?:n[ao]|em|via|pel[ao]|com|d[ao]|de|pra|para)\\s+)?";
// Fim de palavra que funciona com acento no fim ("Itaú"): \b falha depois de "ú".
const FIM = "(?=[\\s,.;:!]|$)";

/** Tira da frase o trecho do meio ("na caixinha", "no pix", "no banco Itaú", "cartão Inter"). */
export function tirarMeio(texto: string, det: ReturnType<typeof detectarMeio>): string {
  let t = texto;
  if (det.tipo === "nome") {
    const termo = termoSemAcento(det.termo.replace(/^(banco|conta|cartao)\s+/, ""));
    t = t.replace(
      new RegExp(`${PREP_MEIO}(?:(?:banco|conta(?:\\s+banc[aá]ria)?|cart[aã]o(?:\\s+de\\s+cr[eé]dito)?)\\s+)?${termo}${FIM}`, "gi"),
      " ",
    );
  }
  return t.replace(
    new RegExp(
      `${PREP_MEIO}\\b(?:caixinha|caixa|dinheiro(?:\\s+vivo)?|esp[eé]cie|cash|pix|pics|d[eé]bito|ted|doc|boleto|transfer[eê]ncia)${FIM}`,
      "gi",
    ),
    " ",
  );
}

export type LancamentoCompleto = LancamentoSemMeio & { valor: number; meio: string };

/**
 * Frase com tudo — descrição, valor e meio ("Despesa Pedágio na caixinha 100 reais").
 * Lança direto, sem o modelo pedir "Confirma?" nem inventar "não há contas".
 * Fica de fora o que o agente trata melhor: parcelado, fatura de cartão,
 * transferência entre contas, "cartão"/"conta" sem nome.
 */
export function pareceLancamentoCompletoPj(texto: string, hoje: string = hojeSP()): LancamentoCompleto | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length < 6 || raw.length > 160) return null;
  const n = norm(raw);
  if (pareceConsultaOuComando(n) || /\?/.test(raw)) return null;
  if (/\b(parcelad|em\s+\d+\s*x|\d+\s*x\s*(de)?)\b/.test(n)) return null;
  if (/\b(fatura|transferi|transfere|transferir|saque|saquei|estorno|estorna|reembols)\b/.test(n)) return null;
  const det = detectarMeio(raw);
  if (det.tipo === "nenhum" || det.tipo === "cartao_generico" || det.tipo === "conta_generica") return null;
  const meio = textoMeioDeDetect(det);
  if (!meio) return null;

  const dataExt = extrairDataBR(raw, hoje);
  const semData = tirarData(raw, dataExt?.trecho ?? null);
  const valor = parseValorBR(semData);
  if (valor == null) return null;
  const descricao = limparDescricao(tirarValor(tirarMeio(semData, det)));
  const tipo = tipoDoTexto(raw, n);
  const data = dataExt && dataExt.data !== hoje ? dataExt.data : undefined;
  if (descricao.length < 3) {
    if (tipo !== "Receita") return null;
    return { descricao: "Recebimento", valor, tipo, meio, ...(data ? { data } : {}) };
  }
  return { descricao, valor, tipo, meio, ...(data ? { data } : {}) };
}

// Palavras que deixam claro que é um lançamento (e não conversa) quando falta o valor.
const RE_FATO =
  /\b(venda|vendi|vendeu|compra|comprei|paguei|pagamento|recebi|recebimento|gastei|gasto|despesa|receita|faturei|faturamento)\b/;
const RE_PERGUNTA =
  /\?|\b(qual|quais|quanto|quantos|quantas|ver|veja|mostra\w*|lista\w*|relatorio|como|onde|quando|porque|por que|cade|consulta\w*)\b/;

/**
 * "Venda de mercadorias no dia 23/09/2026" (sem valor) → lançamento a completar.
 * Conservador: exige verbo/substantivo de lançamento, frase curta e nada de pergunta.
 */
export function pareceLancamentoSemValor(texto: string, hoje: string = hojeSP()): LancamentoSemMeio | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length < 6 || raw.length > 120) return null;
  const n = norm(raw);
  if (!RE_FATO.test(n) || RE_PERGUNTA.test(n) || pareceConsultaOuComando(n)) return null;
  if (detectarMeio(raw).tipo !== "nenhum") return null;
  if (/\b(parcelad|em\s+\d+\s*x)\b/.test(n)) return null;
  const { valor, descricao, data } = destrinchar(raw, hoje);
  if (valor != null || descricao.length < 3) return null;
  return { descricao, valor: null, tipo: tipoDoTexto(raw, n), ...(data ? { data } : {}) };
}

/**
 * Resposta que só traz o valor ("Valor de 870,00 Reais", "870", "o valor é 1.200")
 * — completa ou corrige o lançamento pendente, nunca vira um lançamento novo.
 */
export function respostaEhSoValor(texto: string): number | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length > 60) return null;
  if (detectarMeio(raw).tipo !== "nenhum") return null;
  const valor = parseValorBR(raw);
  if (valor == null) return null;
  const resto = norm(tirarValor(raw))
    .replace(/\b(o|a|e|é|eh|era|foi|sao|na|verdade|corrig\w*|correto|certo|desculp\w*|ops|opa|errei|errado|nao|sim|ficou|fica|pode|ser|por|favor|pfv|pf)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return resto === "" ? valor : null;
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

function resumoItem(item: LancamentoSemMeio): string {
  const data = item.data ? ` em ${item.data.split("-").reverse().join("/")}` : "";
  const valor = item.valor != null ? ` — R$ ${money(item.valor)}` : "";
  return `*${item.descricao}*${data}${valor}`;
}

export function mensagemPedirValor(item: LancamentoSemMeio): string {
  return `Anotei ${resumoItem(item)}.\n\nQual o valor? (ex.: 870,00)`;
}

export function mensagemPedirMeio(item: LancamentoSemMeio, corrigido = false): string {
  const verbo = item.tipo === "Receita" ? "entrou" : "foi pago";
  return (
    `${corrigido ? "Corrigi:" : "Anotei"} ${resumoItem(item)}.\n\n` +
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
