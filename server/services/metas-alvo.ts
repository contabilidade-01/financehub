/**
 * Regras puras de metas (testáveis sem banco): qual meta o cliente quis dizer,
 * valor válido, e se uma frase fala de meta (para os atalhos não a lançarem
 * como despesa/receita).
 */
import { semAcento } from "./limites-gasto";

export type MetaCandidata = { id: number; titulo: string; tipo?: string | null };

/** Sem acento, minúsculo, sem pontuação e sem plural simples no fim de cada palavra. */
export function normalizarTituloMeta(s: unknown): string {
  return semAcento(String(s ?? ""))
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => (p.length > 3 && p.endsWith("ns") ? p.slice(0, -2) + "m" : p.length > 3 && p.endsWith("s") ? p.slice(0, -1) : p))
    .join(" ");
}

// Palavras que aparecem em qualquer frase de meta e não identificam nenhuma.
const GENERICAS = new Set([
  "meta", "minha", "meu", "para", "pra", "dinheiro", "caixinha", "reserva", "sonho", "objetivo",
  "guardar", "guardei", "tirar", "tirei", "depositar", "depositei", "sacar", "saquei", "valor",
  "real", "reai", "conta", "mais", "menos", "hoje", "ontem", "fundo",
]);

function palavrasChave(s: string): string[] {
  return normalizarTituloMeta(s).split(" ").filter((p) => p.length >= 3 && !GENERICAS.has(p));
}

export type ResultadoMeta =
  | { meta: MetaCandidata }
  | { erro: string; opcoes: { id: number; titulo: string }[] };

/**
 * Escolhe a meta-alvo de um depósito/saque/ajuste/exclusão. Nunca chuta:
 * 1. meta_id válido do próprio usuário;
 * 2. título igual (sem acento/caixa/plural);
 * 3. um único título que contém o termo (ou é contido nele);
 * 4. sem título: uma única meta cujas palavras-chave aparecem na frase;
 * 5. sem título nem frase útil e só uma meta → essa.
 * Vários candidatos ou nenhum → erro com as opções, para perguntar ao cliente.
 * Limites de gasto (limite_categoria) nunca recebem depósito/saque.
 */
export function resolverMetaAlvo(
  metasDoUsuario: MetaCandidata[],
  args: { meta_id?: unknown; titulo?: unknown },
  textoUsuario = "",
): ResultadoMeta {
  const metas = metasDoUsuario.filter((m) => m.tipo !== "limite_categoria");
  const opcoes = metas.map((m) => ({ id: m.id, titulo: m.titulo }));
  if (!metas.length) return { erro: "Você ainda não tem metas. Quer criar uma?", opcoes };

  const id = Number(args.meta_id);
  if (Number.isInteger(id) && id > 0) {
    const porId = metas.find((m) => m.id === id);
    if (porId) return { meta: porId };
  }

  const termo = normalizarTituloMeta(args.titulo);
  if (termo) {
    const exatas = metas.filter((m) => normalizarTituloMeta(m.titulo) === termo);
    if (exatas.length === 1) return { meta: exatas[0] };
    const parciais = exatas.length > 1 ? exatas : metas.filter((m) => {
      const n = normalizarTituloMeta(m.titulo);
      return termo.length >= 3 && (n.includes(termo) || termo.includes(n));
    });
    if (parciais.length === 1) return { meta: parciais[0] };
    // Por palavra-chave ("viagem europa 2027" × "Europa")
    const chaves = palavrasChave(termo);
    const porChave = parciais.length ? [] : metas.filter((m) => {
      const pm = palavrasChave(m.titulo);
      return pm.length > 0 && chaves.some((c) => pm.includes(c));
    });
    if (porChave.length === 1) return { meta: porChave[0] };
    const varias = parciais.length > 1 ? parciais : porChave;
    if (varias.length > 1) {
      return { erro: `"${String(args.titulo)}" combina com mais de uma meta (${varias.map((m) => m.titulo).join(", ")}). Qual delas?`, opcoes };
    }
    return { erro: `Não encontrei a meta "${String(args.titulo)}". Suas metas: ${metas.map((m) => m.titulo).join(", ")}. Qual delas?`, opcoes };
  }

  const frase = new Set(palavrasChave(textoUsuario));
  if (frase.size) {
    const naFrase = metas.filter((m) => palavrasChave(m.titulo).some((p) => frase.has(p)));
    if (naFrase.length === 1) return { meta: naFrase[0] };
    if (naFrase.length > 1) {
      return { erro: `Mais de uma meta combina (${naFrase.map((m) => m.titulo).join(", ")}). Qual delas?`, opcoes };
    }
  }
  if (metas.length === 1) return { meta: metas[0] };
  return { erro: `Qual meta? Suas metas: ${metas.map((m) => m.titulo).join(", ")}.`, opcoes };
}

/**
 * Valor de um movimento de meta. Aceita número ou texto BR ("1.500,50",
 * "R$ 50"). Exige número finito e > 0; arredonda para centavos.
 */
export function parseValorMeta(v: unknown, opts: { permitirZero?: boolean } = {}): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    let s = v.replace(/r\$|\s/gi, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n * 100) / 100;
  if (opts.permitirZero ? c < 0 : c <= 0) return null;
  return c;
}

/**
 * A frase fala de meta/caixinha/reserva (guardar ou tirar dinheiro)?
 * Os atalhos de lançamento rápido (PJ) devem deixar essas frases para a IA.
 */
export function falaDeMeta(texto: unknown): boolean {
  const t = semAcento(String(texto ?? ""));
  if (/\b(meta|metas|sonho|sonhos|objetivo|reserva|cofrinho|poupanca)\b/.test(t)) return true;
  if (/\b(guardei|guardar|guarda|guardo|separei|separar|resgatei|resgatar|resgata|saquei|sacar|saca)\b/.test(t)) return true;
  // "na caixinha" sozinho NÃO conta: no PJ/PF é o meio "dinheiro" ("Pedágio na caixinha 100").
  return false;
}

export function moedaBR(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function reciboMeta(
  op: "deposito" | "saque" | "ajuste",
  m: { titulo: string; valor_atual: number; valor_alvo: number },
  valor: number,
): string {
  const pct = m.valor_alvo > 0 ? Math.round((m.valor_atual / m.valor_alvo) * 100) : 0;
  const acao =
    op === "deposito" ? `Guardei ${moedaBR(valor)} na meta *${m.titulo}*.`
    : op === "saque" ? `Tirei ${moedaBR(valor)} da meta *${m.titulo}*.`
    : `Saldo da meta *${m.titulo}* ajustado para ${moedaBR(valor)}.`;
  const saldo = m.valor_alvo > 0
    ? `Saldo: ${moedaBR(m.valor_atual)} de ${moedaBR(m.valor_alvo)} (${pct}%).`
    : `Saldo: ${moedaBR(m.valor_atual)}.`;
  const extra = op === "deposito" && m.valor_alvo > 0 && m.valor_atual >= m.valor_alvo ? " 🎉 Meta atingida!" : "";
  return `${acao}\n${saldo}${extra}`;
}
