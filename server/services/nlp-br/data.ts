/**
 * Datas relativas em português, sempre no fuso America/Sao_Paulo.
 *
 *  hoje, ontem, anteontem, amanhã, depois de amanhã
 *  "dia 5", "no dia 12", "05/09", "5/9/26", "05/09/2026", "2026-09-05"
 *  "segunda", "sexta passada", "sábado retrasado", "semana passada" (7 dias atrás)
 *  "5 de setembro", "12 de jan"
 */

const TZ = "America/Sao_Paulo";

const semAcento = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Data de hoje (YYYY-MM-DD) em São Paulo — nunca use toISOString() para "hoje". */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Dia da semana (0=domingo) de hoje em São Paulo. */
export function diaSemanaSP(agora: Date = new Date()): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(agora);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
}

function isoParaUTC(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function utcParaIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const d = isoParaUTC(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return utcParaIso(d);
}

function dataValida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return utcParaIso(dt);
}

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

const DIAS_SEMANA: [RegExp, number][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(-feira| feira)?\b/, 1],
  [/\bterca(-feira| feira)?\b/, 2],
  [/\bquarta(-feira| feira)?\b/, 3],
  [/\bquinta(-feira| feira)?\b/, 4],
  [/\bsexta(-feira| feira)?\b/, 5],
  [/\bsabado\b/, 6],
];

export type DataExtraida = { data: string; trecho: string };

/**
 * Extrai a data de um lançamento. `hoje` permite testes determinísticos.
 * Retorna null quando o texto não fala de data (o chamador usa hojeSP()).
 */
export function extrairDataBR(texto: string, hoje: string = hojeSP()): DataExtraida | null {
  const t = semAcento(texto);
  const [anoHoje, mesHoje] = hoje.split("-").map(Number);

  if (/\bdepois de amanha\b/.test(t)) return { data: somarDias(hoje, 2), trecho: "depois de amanhã" };
  if (/\banteontem\b|\bantes de ontem\b/.test(t)) return { data: somarDias(hoje, -2), trecho: "anteontem" };
  if (/\bontem\b/.test(t)) return { data: somarDias(hoje, -1), trecho: "ontem" };
  if (/\bamanha\b/.test(t)) return { data: somarDias(hoje, 1), trecho: "amanhã" };
  if (/\bhoje\b|\bagora( ha pouco)?\b/.test(t)) return { data: hoje, trecho: "hoje" };

  // ISO
  let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const d = dataValida(+m[1], +m[2], +m[3]);
    if (d) return { data: d, trecho: m[0] };
  }
  // dd/mm[/aa[aa]]
  m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (m) {
    let ano = m[3] ? +m[3] : anoHoje;
    if (m[3] && m[3].length === 2) ano += 2000;
    let d = dataValida(ano, +m[2], +m[1]);
    // Sem ano e caindo no futuro distante (ex.: "20/12" dito em janeiro) → ano anterior
    if (d && !m[3] && d > somarDias(hoje, 31)) d = dataValida(ano - 1, +m[2], +m[1]);
    if (d) return { data: d, trecho: m[0] };
  }
  // "5 de setembro", "12 de jan"
  m = t.match(/\b(\d{1,2})\s+de\s+([a-z]{3,9})\b(?:\s+de\s+(\d{4}))?/);
  if (m && MESES[m[2]] != null) {
    const ano = m[3] ? +m[3] : anoHoje;
    let d = dataValida(ano, MESES[m[2]], +m[1]);
    if (d && !m[3] && d > somarDias(hoje, 31)) d = dataValida(ano - 1, MESES[m[2]], +m[1]);
    if (d) return { data: d, trecho: m[0] };
  }
  // "dia 5", "no dia 12"
  m = t.match(/\bdia\s+(\d{1,2})\b/);
  if (m) {
    let d = dataValida(anoHoje, mesHoje, +m[1]);
    // "dia 28" dito no dia 3 → mês passado (lançamento de algo que já aconteceu)
    if (d && d > somarDias(hoje, 3)) {
      const mesAnt = mesHoje === 1 ? 12 : mesHoje - 1;
      const anoAnt = mesHoje === 1 ? anoHoje - 1 : anoHoje;
      d = dataValida(anoAnt, mesAnt, +m[1]) || d;
    }
    if (d) return { data: d, trecho: m[0] };
  }
  // Dia da semana: "sexta" = a mais recente (hoje inclusive); "sexta passada" = da semana anterior
  const dowHoje = new Date(isoParaUTC(hoje)).getUTCDay();
  for (const [re, dow] of DIAS_SEMANA) {
    const mm = t.match(re);
    if (!mm) continue;
    let delta = (dowHoje - dow + 7) % 7;
    const resto = t.slice((mm.index || 0) + mm[0].length, (mm.index || 0) + mm[0].length + 14);
    if (/^\s*(passad[ao]|retrasad[ao]|anterior)/.test(resto)) {
      if (delta === 0) delta = 7;
      if (/^\s*retrasad/.test(resto)) delta += 7;
    }
    return { data: somarDias(hoje, -delta), trecho: mm[0] };
  }
  if (/\bsemana passada\b/.test(t)) return { data: somarDias(hoje, -7), trecho: "semana passada" };
  return null;
}

/** Contexto de data para o prompt do agente (ISO + dia da semana + referências). */
export function contextoDataParaPrompt(agora: Date = new Date()): string {
  const hoje = hojeSP(agora);
  const nomes = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const dow = diaSemanaSP(agora);
  return [
    `HOJE = ${hoje} (${nomes[dow]}), fuso America/Sao_Paulo.`,
    `ONTEM = ${somarDias(hoje, -1)}. ANTEONTEM = ${somarDias(hoje, -2)}.`,
    `Datas SEMPRE em YYYY-MM-DD. Sem data na mensagem → use HOJE.`,
  ].join("\n");
}
