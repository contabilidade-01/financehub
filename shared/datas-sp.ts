/**
 * Datas no calendário de São Paulo, iguais no servidor e no navegador
 * (independem do fuso da máquina). Usadas para "termina hoje / amanhã" e para
 * exibir datas de vencimento.
 */
const FUSO = "America/Sao_Paulo";

const formatoISO = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const formatoBR = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

function comoData(v: Date | string | number): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "AAAA-MM-DD" do dia em São Paulo. Uma data pura ("2026-09-26", coluna DATE)
 * já é o dia do calendário: não passa por fuso (lida como UTC, viraria o dia 25).
 */
export function diaSP(v: Date | string | number): string | null {
  if (typeof v === "string" && SO_DATA.test(v)) return v;
  const d = comoData(v);
  return d ? formatoISO.format(d) : null;
}

/**
 * Dias de calendário (São Paulo) de hoje até a data: 0 = hoje, 1 = amanhã,
 * negativo = já passou. Não arredonda horas: vencer hoje às 23h é "hoje".
 */
export function diasAteSP(v: Date | string | number | null | undefined, agora: Date = new Date()): number | null {
  if (v === null || v === undefined || v === "") return null;
  const alvo = diaSP(v);
  const hoje = diaSP(agora);
  if (!alvo || !hoje) return null;
  const utc = (s: string) => {
    const [a, m, d] = s.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(alvo) - utc(hoje)) / 86_400_000);
}

/** "25/09/2026" no fuso de São Paulo. */
export function dataBrSP(v: Date | string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && SO_DATA.test(v)) return v.split("-").reverse().join("/");
  const d = comoData(v);
  return d ? formatoBR.format(d) : null;
}
