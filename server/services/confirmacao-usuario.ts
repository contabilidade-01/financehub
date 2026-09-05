/**
 * Interpreta respostas curtas de confirmação/recusa em PT-BR (WhatsApp).
 * Usado quando o agente oferece criar conta / editar / lançar e o usuário
 * responde "pode", "ok", "sim", "não", etc.
 */
export type Confirmacao = "sim" | "nao" | "ambiguo";

function normalizar(texto: string): string {
  return (texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Respostas quase só "sim" / "não" (sem frase longa). */
const SO_SIM = /^(s|ss|sim+|siim+|ok+|okay|blz|beleza|pode|pode sim|claro|fechou|isso|isso ai|uhum|aha+|aham|yes|yep|yeah|positivo|confirmo|confirma|manda|vai|cria|crie|quero|quero sim)$/i;
const SO_NAO = /^(n|nn|nao+|no|nope|nops|negativo|deixa|cancela|esquece)$/i;

const RE_SIM = /\b(sim|pode|pode criar|pode sim|ok|okay|blz|beleza|certo|fechou|isso|claro|com certeza|afirmativo|confirma|confirmo|manda|manda ver|vai la|cria|crie|criar|faz|faca|quero|uhum|aha|aham|positivo|yes|yep|yeah)\b/i;
const RE_NAO = /\b(nao|negativo|deixa|deixa pra la|deixa para la|agora nao|melhor nao|cancela|cancelar|esquece|nops|nope|nunca|dispenso|obrigado nao|nao precisa|nao quero|nao pode|nao cria)\b/i;

export function interpretarConfirmacao(texto: string): Confirmacao {
  const t = normalizar(texto);
  if (!t) return "ambiguo";

  if (SO_SIM.test(t)) return "sim";
  if (SO_NAO.test(t)) return "nao";

  // Recusa explícita mesmo com outras palavras: "não pode", "não quero criar"
  if (/\bnao\s+(pode|quero|precisa|vai|cria|crie|criar|manda)\b/.test(t)) return "nao";
  if (/^(nao|deixa|cancela)\b/.test(t) && t.length <= 50) return "nao";

  const temNao = RE_NAO.test(t);
  const temSim = RE_SIM.test(t);

  if (temNao && !temSim) return "nao";
  if (temSim && !temNao) return "sim";
  if (temSim && temNao) {
    // "não, deixa" vs "ah não sei, pode criar"
    if (/^(nao|deixa|cancela)\b/.test(t)) return "nao";
    return "ambiguo";
  }
  return "ambiguo";
}

/** Sugere nome de conta a partir da descrição / mensagem (ex.: "gasto com alimentação" → Alimentação). */
export function sugerirNomeConta(
  descricao: string,
  userMessage?: string,
  contaInformada?: string | null,
): string {
  if (contaInformada) {
    const limpa = String(contaInformada)
      .replace(/^\d+(\.\d+)*\s*[—\-–]?\s*/u, "")
      .trim();
    if (limpa && !/^outras?\b/i.test(limpa)) {
      return titleCase(limpa);
    }
  }

  let s = (descricao || "").trim();
  s = s.replace(/^(despesa|receita|gasto|compra|pagamento)\s+(com|de|em|para|do|da|dos|das)\s+/i, "");
  s = s.replace(/^(despesa|receita|gasto|compra|pagamento)\s+/i, "");

  if (s.length < 3 && userMessage) {
    const m = userMessage.match(
      /(?:gasto|despesa|compra|pagamento)?\s*(?:com|de|em|para)\s+([a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\s]{2,40})/i,
    );
    if (m?.[1]) s = m[1];
  }

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "Nova conta";
  // No máximo 4 palavras para não virar frase inteira.
  const palavras = s.split(" ").slice(0, 4);
  return titleCase(palavras.join(" "));
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
