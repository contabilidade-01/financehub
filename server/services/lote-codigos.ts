/**
 * Helpers puros para edição em massa pelo agente (sem banco).
 */

/** Teto de uma faixa "#606 a #620" — evita que um número errado vire milhares de updates. */
const MAX_FAIXA = 1000;

/**
 * Junta a lista de códigos e a faixa (codigo_inicial..codigo_final) numa lista
 * única, ordenada e sem repetição. Aceita números ou textos tipo "#606".
 */
export function expandirCodigosLote(args: {
  ids?: unknown;
  codigo_inicial?: unknown;
  codigo_final?: unknown;
}): number[] {
  const num = (v: unknown): number | null => {
    const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const out = new Set<number>();
  const lista = Array.isArray(args?.ids) ? args.ids : args?.ids != null ? [args.ids] : [];
  for (const v of lista) {
    const n = num(v);
    if (n) out.add(n);
  }
  let ini = num(args?.codigo_inicial);
  let fim = num(args?.codigo_final);
  if (ini && !fim) fim = ini;
  if (fim && !ini) ini = fim;
  if (ini && fim) {
    if (ini > fim) [ini, fim] = [fim, ini];
    if (fim - ini <= MAX_FAIXA) {
      for (let i = ini; i <= fim; i++) out.add(i);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** "10/2026", "2026-10", "out/2026"… → "2026-10". Inválido → null. */
export function normalizarCompetencia(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return fmt(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return fmt(Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[/.-](\d{2})$/.exec(s);
  if (m) return fmt(2000 + Number(m[2]), Number(m[1]));
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  m = /^([a-zç]{3})[a-zç]*\s*(?:\/|de)?\s*(\d{4})$/.exec(s);
  if (m) {
    const i = meses.indexOf(m[1]);
    if (i >= 0) return fmt(Number(m[2]), i + 1);
  }
  return null;
}

function fmt(ano: number, mes: number): string | null {
  if (!(ano >= 2000 && ano <= 2100) || !(mes >= 1 && mes <= 12)) return null;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}
