/**
 * Lembretes por inatividade — cliente que parou de anotar (flag lembretes_inatividade).
 *
 * Sequência (economia comportamental; contagem a partir do dia da última anotação):
 *   1. D+2  — "manda na hora, do jeito que falar" (intenção de implementação, menos atrito)
 *   2. D+4  — "manda só o maior gasto desses dias" (volta fácil depois da falha)
 *   3. 1ª segunda-feira a partir de D+6 — "semana nova" (efeito recomeço)
 *   4. D+14 — "quer que eu continue lembrando? SIM / PAUSAR" (autonomia, evita bloqueio)
 *   5. Dia 1 do mês, a partir de D+21 — "mês novo" (recomeço), só se a 4 saiu. Depois: silêncio.
 *
 * Regras:
 * - Aviso que cair no sábado é ANTECIPADO para a sexta. Nada sai no sábado.
 * - Envio a partir das 12h30 (SP), depois da rodada diária das 9h.
 * - Máx. 1 mensagem automática por dia: não sai no dia de outro aviso (cobrança,
 *   contas, limite, resumo); tenta de novo no dia seguinte, dentro da tolerância.
 * - Só manda a etapa que venceu há até TOLERANCIA_DIAS: ao ligar a flag, quem já está
 *   parado há muito tempo não recebe atrasados (nada de envio em massa).
 * - Anotou de novo → a contagem recomeça (as chaves usam o dia da última anotação).
 * - PAUSAR desliga os lembretes de inatividade do cliente (não mexe em cobrança).
 *
 * Este arquivo é lógica pura (sem banco); o envio fica em proactive-alerts.job.ts.
 */

export type EtapaInatividade = 1 | 2 | 3 | 4 | 5;
export const ETAPAS_INATIVIDADE: readonly EtapaInatividade[] = [1, 2, 3, 4, 5];

/** Quantos dias depois do vencimento uma etapa ainda pode sair (deploy, dia ocupado). */
export const TOLERANCIA_DIAS = 2;
/** Quem não anota há mais que isso fica fora (a sequência inteira já passou). */
export const MAX_DIAS_PARADO = 60;
/** Horário a partir do qual os lembretes saem (SP). */
export const HORARIO_INATIVIDADE = { hora: 12, minuto: 30, ateHora: 20 };
/** Teto de mensagens por rodada (protege o número do WhatsApp). */
export const MAX_ENVIOS_POR_RODADA = 150;

/** Soma dias a um YYYY-MM-DD (calendário, sem fuso). */
export function somarDiasISO(diaISO: string, n: number): string {
  const d = new Date(`${diaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(diaISO: string): number {
  return new Date(`${diaISO}T12:00:00Z`).getUTCDay();
}

export const ehSabado = (diaISO: string) => diaDaSemana(diaISO) === 6;

/** Sábado vira sexta (regra do Jeandson: antecipar). */
export function anteciparSabado(diaISO: string): string {
  return ehSabado(diaISO) ? somarDiasISO(diaISO, -1) : diaISO;
}

/** Primeira segunda-feira em `diaISO` ou depois. */
function proximaSegunda(diaISO: string): string {
  const dow = diaDaSemana(diaISO);
  return somarDiasISO(diaISO, (8 - dow) % 7);
}

/** Primeiro dia 1 de mês em `diaISO` ou depois. */
function proximoDiaUm(diaISO: string): string {
  if (diaISO.endsWith("-01")) return diaISO;
  const [a, m] = diaISO.split("-").map(Number);
  const ano = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

/** Data original de cada etapa (antes de antecipar o sábado). */
export function datasOriginais(ultimaAnotacao: string): Record<EtapaInatividade, string> {
  return {
    1: somarDiasISO(ultimaAnotacao, 2),
    2: somarDiasISO(ultimaAnotacao, 4),
    3: proximaSegunda(somarDiasISO(ultimaAnotacao, 6)),
    4: somarDiasISO(ultimaAnotacao, 14),
    5: proximoDiaUm(somarDiasISO(ultimaAnotacao, 21)),
  };
}

/** Data de envio de cada etapa (sábado antecipado para sexta). */
export function datasDasEtapas(ultimaAnotacao: string): Record<EtapaInatividade, string> {
  const o = datasOriginais(ultimaAnotacao);
  return {
    1: anteciparSabado(o[1]),
    2: anteciparSabado(o[2]),
    3: anteciparSabado(o[3]),
    4: anteciparSabado(o[4]),
    5: anteciparSabado(o[5]),
  };
}

/**
 * Qual etapa sai hoje (ou null). `jaEnviadas` = etapas desta sequência (mesma
 * última anotação) que já saíram. Nunca no sábado, nunca volta para uma etapa
 * anterior à última enviada, e só etapas vencidas há até TOLERANCIA_DIAS.
 */
export function etapaParaHoje(
  ultimaAnotacao: string,
  hoje: string,
  jaEnviadas: readonly number[] = [],
): EtapaInatividade | null {
  if (ehSabado(hoje)) return null;
  if (hoje <= ultimaAnotacao) return null;
  if (somarDiasISO(ultimaAnotacao, MAX_DIAS_PARADO) < hoje) return null;
  const datas = datasDasEtapas(ultimaAnotacao);
  const ultimaEnviada = jaEnviadas.length ? Math.max(...jaEnviadas) : 0;
  const limiteAtraso = somarDiasISO(hoje, -TOLERANCIA_DIAS);
  // A mais recente vencida ganha (não manda duas no mesmo dia).
  for (const etapa of [...ETAPAS_INATIVIDADE].reverse()) {
    const d = datas[etapa];
    if (d > hoje) continue;
    if (etapa <= ultimaEnviada) return null;
    if (d < limiteAtraso) return null; // venceu há muito: não manda atrasado
    // "Mês novo" só para quem passou pela pergunta da etapa 4 (e não pausou):
    // senão, no 1º dia 1 com a flag ligada, todo mundo parado há 3–7 semanas receberia.
    if (etapa === 5 && !jaEnviadas.includes(4)) return null;
    return etapa;
  }
  return null;
}

/** true se a etapa está saindo antes da data original (sábado → sexta). */
export function foiAntecipada(ultimaAnotacao: string, etapa: EtapaInatividade, hoje: string): boolean {
  return datasOriginais(ultimaAnotacao)[etapa] > hoje;
}

/** Já passou do horário de envio (12h30 SP) e ainda dentro da janela? */
export function dentroDoHorarioInatividade(hora: number, minuto: number): boolean {
  const { hora: h, minuto: m, ateHora } = HORARIO_INATIVIDADE;
  if (hora >= ateHora) return false;
  return hora > h || (hora === h && minuto >= m);
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

/** Escolhe a variação pelo dia da última anotação (estável, mas muda de um ciclo para outro). */
export function variacao(ultimaAnotacao: string, n: number): number {
  let h = 0;
  for (const c of ultimaAnotacao) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export function textoInatividade(opts: {
  etapa: EtapaInatividade;
  nome?: string | null;
  pj?: boolean;
  ultimaAnotacao: string;
  antecipada?: boolean;
}): string {
  const nome = primeiroNome(opts.nome);
  const v = variacao(opts.ultimaAnotacao, 2);
  const pj = !!opts.pj;
  const oi = nome ? `Oi, ${nome}!` : "Oi!";
  const Voc = nome ? `${nome}, ` : "";
  const umGasto = pj ? "uma venda ou despesa" : "um gasto";
  const exemplo = pj ? "*venda 150 pix* ou *gasolina 80 débito*" : "*almoço 32 pix*";

  switch (opts.etapa) {
    case 1:
      return v === 0
        ? `${oi} 👋 Dica rápida: quando ${pj ? "vender ou pagar algo da empresa" : "pagar algo"} hoje, manda na hora, do jeito que falar: ${exemplo}. Leva 5 segundos.`
        : `${nome ? `${nome}, um` : "Um"} jeito fácil de não esquecer: assim que ${pj ? "fizer a próxima venda ou pagar a próxima conta" : "pagar a próxima conta"}, me manda aqui, tipo ${pj ? "*venda 150 pix*" : "*mercado 87 cartão*"}. Eu organizo o resto. ✍️`;
    case 2:
      return v === 0
        ? `${Voc}não precisa lembrar de tudo. Me manda só ${pj ? "a maior venda ou despesa" : "o maior gasto"} desses dias e seguimos daqui. Seu controle está te esperando 😉`
        : `${Voc}sem culpa: ninguém anota 100%. Manda só ${pj ? "a maior venda ou despesa" : "o gasto mais alto"} dos últimos dias e o controle volta a andar. 😉`;
    case 3:
      return v === 0
        ? `Semana nova, conta nova ✨ Anota ${pj ? "a primeira venda ou despesa" : "o primeiro gasto"} da semana e na segunda que vem te mando o resumo.`
        : `Começo de semana é o melhor dia para recomeçar${nome ? `, ${nome}` : ""}. Manda ${pj ? "a primeira venda ou despesa" : "o primeiro gasto"} de hoje e eu te mostro o resumo na próxima segunda. 🗓️`;
    case 4:
      return `${Voc}vi que você deu uma pausa. Quer que eu continue lembrando? Responda *SIM* ou *PAUSAR*. Para voltar, é só mandar ${umGasto}.`;
    case 5:
      return opts.antecipada
        ? `Amanhã começa um mês novo${nome ? `, ${nome}` : ""}! Quer começar ele organizado? Já pode mandar aqui ${pj ? "a venda ou despesa" : "o gasto"} de hoje. 📅`
        : `Mês novo${nome ? `, ${nome}` : ""}! Quer começar ele organizado? Manda ${pj ? "a primeira venda ou despesa" : "o primeiro gasto"} do mês aqui. 📅`;
  }
}

// ---------------------------------------------------------------------------
// Respostas do cliente (SIM / PAUSAR / ATIVAR LEMBRETES)
// ---------------------------------------------------------------------------

export type RespostaInatividade = "pausar" | "sim" | "ativar";

const normalizar = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Só a mensagem inteira conta (ex.: "PAUSAR", "pausar lembretes"), para não
 * capturar um lançamento ou uma pergunta. "sim" só vale logo depois da etapa 4
 * (quem chama decide pelo contexto).
 */
export function interpretarResposta(texto: string): RespostaInatividade | null {
  const t = normalizar(texto);
  if (!t) return null;
  if (/^(pausar|pausa|pausar (os )?lembretes?|parar (os )?lembretes?|nao quero (mais )?lembretes?)$/.test(t)) return "pausar";
  if (/^(ativar|voltar|religar|reativar) (os )?lembretes?$/.test(t)) return "ativar";
  if (/^(sim|s|sim pode|pode|pode sim|quero|sim quero|continua|continue|pode continuar)$/.test(t)) return "sim";
  return null;
}

export const TEXTO_PAUSADO =
  "Pronto, pausei os lembretes. 👍 Quando quiser anotar, é só mandar aqui. Para voltar a receber, mande *ATIVAR LEMBRETES*.";
export const TEXTO_CONTINUAR =
  "Combinado! Sigo te lembrando de vez em quando. Já pode mandar o primeiro aqui. 😉";
export const TEXTO_REATIVADO =
  "Lembretes ligados de novo! ✅ Se você ficar uns dias sem anotar, eu te dou um toque.";

/** Chaves em alertas_enviados. */
export const chaveEtapa = (ultimaAnotacao: string, etapa: EtapaInatividade) => `inativ:${ultimaAnotacao}:${etapa}`;
export const CHAVE_PAUSADO = "inativ:pausado";
export const PREFIXO_INATIVIDADE = "inativ:";
