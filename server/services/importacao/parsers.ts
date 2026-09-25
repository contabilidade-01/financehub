/**
 * Leitura de extratos bancários (OFX, CSV, XLSX) — só leitura e normalização,
 * sem banco de dados. Tudo aqui é puro e testado em scripts/testar-importacao-parsers.ts.
 *
 * Problemas que isto resolve em relação ao parser antigo:
 *  - CSV com ";" (padrão dos bancos brasileiros) e aspas;
 *  - codificação (UTF-8 x Windows-1252) pelo cabeçalho do OFX ou pelo conteúdo;
 *  - "1.234,56", "-1.234,56", "1.234,56 D", "(1.234,56)";
 *  - coluna de SALDO nunca é confundida com a de VALOR;
 *  - colunas separadas de Débito / Crédito, ou coluna de tipo C/D;
 *  - identificação da conta no OFX (BANKID / BRANCHID / ACCTID);
 *  - lançamentos idênticos no mesmo dia não são fundidos (ordem entra na chave).
 */
import { createHash } from "crypto";
import * as XLSX from "xlsx";

export type Formato = "ofx" | "csv" | "xlsx";

export interface MovimentoBruto {
  data: string; // AAAA-MM-DD
  descricao: string;
  valor: number; // positivo = entrada, negativo = saída
  documento?: string | null;
  fitid?: string | null;
  tipoTransacao?: string | null;
  saldo?: number | null;
}

export interface ContaDoArquivo {
  bancoId: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: string | null;
}

export interface Mapeamento {
  data: number;
  descricao: number;
  valor: number;
  debito: number;
  credito: number;
  saldo: number;
  documento: number;
  natureza: number; // coluna C/D
}

export interface ArquivoLido {
  formato: Formato;
  ofx?: {
    conta: ContaDoArquivo;
    movimentos: MovimentoBruto[];
    saldoFinal: number | null;
    dataSaldo: string | null;
    periodoDe: string | null;
    periodoAte: string | null;
  };
  tabela?: {
    cabecalho: string[];
    linhas: string[][];
    mapeamento: Mapeamento;
    completo: boolean; // tem data, descrição e valor (ou débito/crédito)
  };
}

// ----------------------------------------------------------------------------
// Texto e números
// ----------------------------------------------------------------------------

const semAcento = (s: string) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Decodifica bytes em texto: BOM → UTF-8 válido → Windows-1252. */
export function decodificarTexto(buf: Buffer, charsetDeclarado?: string | null): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString("utf8");
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString("utf16le");
  const cs = semAcento(charsetDeclarado || "");
  if (/1252|8859|latin|ansi|usascii/.test(cs)) return new TextDecoder("windows-1252").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/**
 * Valor monetário de célula de extrato: "1.234,56", "-1.234,56", "1,234.56",
 * "1.234,56 D", "(1.234,56)", "R$ 10,00", "10.5". null se não for número.
 */
export function valorDeCelula(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? Math.round(bruto * 100) / 100 : null;
  let s = String(bruto ?? "").trim();
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (/\s*[dD]$/.test(s) || /^\s*[dD]\s/.test(s)) { negativo = true; s = s.replace(/[dD]/g, ""); }
  else s = s.replace(/[cC]$/, "");
  if (/-\s*$/.test(s)) { negativo = true; s = s.replace(/-\s*$/, ""); }
  s = s.replace(/r\$|brl|\s/gi, "");
  if (s.startsWith("-")) { negativo = !negativo; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const temPonto = s.includes(".");
  const temVirgula = s.includes(",");
  if (temPonto && temVirgula) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (temVirgula) {
    const p = s.split(",");
    s = p.length === 2 ? `${p[0]}.${p[1]}` : p.join("");
  } else if (temPonto) {
    const p = s.split(".");
    // "1.500" (milhar) x "1.5"/"12.90" (decimal); vários pontos = milhar
    if (p.length > 2 || (p.length === 2 && p[1].length === 3)) s = p.join("");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n * 100) / 100;
  return negativo ? -v : v;
}

const MESES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function isoValida(a: number, m: number, d: number): string | null {
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** Data de célula de extrato: dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd, dd-mm-aaaa, dd.mm.aaaa, "05 set 2026", Date. */
export function dataDeCelula(bruto: unknown): string | null {
  if (bruto instanceof Date && !isNaN(bruto.getTime())) {
    return isoValida(bruto.getFullYear(), bruto.getMonth() + 1, bruto.getDate());
  }
  const s = String(bruto ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s|$|T)/);
  if (m) {
    let a = +m[3];
    if (m[3].length === 2) a += 2000;
    return isoValida(a, +m[2], +m[1]);
  }
  m = semAcento(s).match(/^(\d{1,2})[\s\/-]+([a-z]{3})[a-z]*[\s\/-]+(\d{2,4})/);
  if (m && MESES_ABREV[m[2]]) {
    let a = +m[3];
    if (m[3].length === 2) a += 2000;
    return isoValida(a, MESES_ABREV[m[2]], +m[1]);
  }
  return null;
}

// ----------------------------------------------------------------------------
// OFX
// ----------------------------------------------------------------------------

function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

function dataOfx(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/[^0-9]/g, "");
  if (d.length < 8) return null;
  return isoValida(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6, 8));
}

/** Charset declarado no cabeçalho SGML (CHARSET:1252 / ENCODING:UTF-8) ou no XML. */
export function charsetDoOfx(buf: Buffer): string | null {
  const cab = buf.slice(0, 600).toString("latin1");
  const enc = cab.match(/ENCODING:\s*([A-Z0-9-]+)/i)?.[1] || cab.match(/encoding="([^"]+)"/i)?.[1];
  const cs = cab.match(/CHARSET:\s*([A-Z0-9-]+)/i)?.[1];
  if (enc && /utf-?8/i.test(enc)) return "utf-8";
  if (cs && !/none/i.test(cs)) return cs;
  return enc || null;
}

export function lerOfx(texto: string): NonNullable<ArquivoLido["ofx"]> {
  const blocos =
    texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ||
    texto.split(/<STMTTRN>/i).slice(1).map((b) => `<STMTTRN>${b.split(/<\/BANKTRANLIST>/i)[0]}`);
  const movimentos: MovimentoBruto[] = [];
  for (const bloco of blocos) {
    const data = dataOfx(tag(bloco, "DTPOSTED"));
    const valor = valorDeCelula(tag(bloco, "TRNAMT"));
    if (!data || valor == null || valor === 0) continue;
    const nome = tag(bloco, "NAME") || "";
    const memo = tag(bloco, "MEMO") || "";
    // Descrição: junta NAME e MEMO quando trazem informação diferente.
    const descricao =
      (nome && memo && !semAcento(nome).includes(semAcento(memo)) && !semAcento(memo).includes(semAcento(nome))
        ? `${nome} ${memo}`
        : nome.length >= memo.length ? nome : memo) || "Movimento";
    movimentos.push({
      data,
      valor,
      descricao: descricao.replace(/\s+/g, " ").trim().slice(0, 255),
      fitid: tag(bloco, "FITID"),
      documento: tag(bloco, "CHECKNUM") || tag(bloco, "REFNUM"),
      tipoTransacao: tag(bloco, "TRNTYPE"),
    });
  }
  const bal = texto.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|$)/i)?.[0] || "";
  const acct = texto.match(/<(?:BANKACCTFROM|CCACCTFROM)>[\s\S]*?(?:<\/(?:BANKACCTFROM|CCACCTFROM)>|<\/?BANKTRANLIST>)/i)?.[0] || texto;
  return {
    conta: {
      bancoId: tag(acct, "BANKID"),
      agencia: tag(acct, "BRANCHID"),
      conta: tag(acct, "ACCTID"),
      tipoConta: tag(acct, "ACCTTYPE"),
    },
    movimentos,
    saldoFinal: bal ? valorDeCelula(tag(bal, "BALAMT")) : null,
    dataSaldo: bal ? dataOfx(tag(bal, "DTASOF")) : null,
    periodoDe: dataOfx(tag(texto, "DTSTART")),
    periodoAte: dataOfx(tag(texto, "DTEND")),
  };
}

// ----------------------------------------------------------------------------
// CSV / XLSX → tabela
// ----------------------------------------------------------------------------

/** Delimitador mais consistente nas primeiras linhas (";" "," tab "|"). */
export function detectarDelimitador(texto: string): string {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let melhor = ";";
  let melhorPontos = -1;
  for (const d of [";", "\t", ",", "|"]) {
    const contagens = linhas.map((l) => dividirCsv(l, d).length);
    const comMais = contagens.filter((c) => c >= 2);
    if (!comMais.length) continue;
    // moda das contagens: linhas de dados têm o mesmo nº de colunas
    const freq = new Map<number, number>();
    for (const c of comMais) freq.set(c, (freq.get(c) || 0) + 1);
    const [cols, vezes] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const pontos = vezes * 10 + cols;
    if (pontos > melhorPontos) { melhor = d; melhorPontos = pontos; }
  }
  return melhor;
}

function dividirCsv(linha: string, d: string): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === d) { out.push(atual); atual = ""; }
    else atual += c;
  }
  out.push(atual);
  return out.map((x) => x.trim());
}

/** CSV → linhas (respeita aspas, inclusive quebras de linha dentro delas). */
export function lerCsv(texto: string): string[][] {
  const d = detectarDelimitador(texto);
  const linhas: string[][] = [];
  let buffer = "";
  for (const bruta of texto.split(/\r?\n/)) {
    buffer = buffer ? `${buffer}\n${bruta}` : bruta;
    if ((buffer.match(/"/g) || []).length % 2 === 1) continue; // aspas abertas: junta a próxima linha
    if (buffer.trim()) linhas.push(dividirCsv(buffer, d));
    buffer = "";
  }
  return linhas;
}

/** XLSX/XLS → linhas de texto (datas em ISO, números com ponto decimal). */
export function lerPlanilha(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  return rows.map((r) =>
    (Array.isArray(r) ? r : []).map((c) => {
      if (c instanceof Date) return dataDeCelula(c) || "";
      if (typeof c === "number") return Number.isInteger(c) ? String(c) : c.toFixed(2);
      return String(c ?? "").trim();
    }),
  );
}

// ----------------------------------------------------------------------------
// Cabeçalho e mapeamento de colunas
// ----------------------------------------------------------------------------

const ALIASES: Record<keyof Mapeamento, string[]> = {
  data: ["data", "dt", "data lancamento", "data do lancamento", "data movimento", "data mov", "data operacao", "date", "data transacao", "dia"],
  descricao: ["descricao", "historico", "lancamento", "detalhes", "detalhe", "memo", "estabelecimento", "titulo", "descricao do lancamento", "complemento", "description", "movimentacao", "identificacao"],
  valor: ["valor", "valor r$", "valor (r$)", "montante", "quantia", "amount", "valor lancamento", "valor do lancamento"],
  debito: ["debito", "debitos", "saida", "saidas", "valor debito", "debito r$", "debito (r$)"],
  credito: ["credito", "creditos", "entrada", "entradas", "valor credito", "credito r$", "credito (r$)"],
  saldo: ["saldo", "saldo r$", "saldo (r$)", "saldo do dia", "saldo final", "balance"],
  documento: ["documento", "doc", "n documento", "no documento", "numero documento", "nr doc", "id", "fitid", "identificador"],
  natureza: ["tipo", "d/c", "c/d", "natureza", "dc", "cd", "operacao"],
};

function casaAlias(celula: string, aliases: string[]): boolean {
  const c = semAcento(celula).replace(/[^a-z0-9/() $]/g, " ").replace(/\s+/g, " ").trim();
  return aliases.some((a) => c === a || c.startsWith(`${a} `));
}

export function mapeamentoVazio(): Mapeamento {
  return { data: -1, descricao: -1, valor: -1, debito: -1, credito: -1, saldo: -1, documento: -1, natureza: -1 };
}

export function mapeamentoCompleto(m: Mapeamento): boolean {
  return m.data >= 0 && m.descricao >= 0 && (m.valor >= 0 || m.debito >= 0 || m.credito >= 0);
}

/** Linha do cabeçalho: primeira (entre as 30 primeiras) com data + (valor|débito|crédito). */
export function encontrarCabecalho(linhas: string[][]): number {
  for (let i = 0; i < Math.min(30, linhas.length); i++) {
    const l = linhas[i] || [];
    const temData = l.some((c) => casaAlias(c, ALIASES.data));
    const temValor = l.some((c) => casaAlias(c, ALIASES.valor) || casaAlias(c, ALIASES.debito) || casaAlias(c, ALIASES.credito));
    if (temData && temValor) return i;
  }
  return -1;
}

/**
 * Mapeamento automático: primeiro pelos nomes das colunas; o que faltar,
 * pelo conteúdo (coluna com datas, coluna de texto mais longo, coluna numérica
 * que não seja saldo).
 */
export function detectarMapeamento(cabecalho: string[], dados: string[][]): Mapeamento {
  const m = mapeamentoVazio();
  const usadas = new Set<number>();
  const ordem: (keyof Mapeamento)[] = ["saldo", "debito", "credito", "data", "valor", "documento", "natureza", "descricao"];
  for (const campo of ordem) {
    const idx = cabecalho.findIndex((c, i) => !usadas.has(i) && casaAlias(c, ALIASES[campo]));
    if (idx >= 0) { m[campo] = idx; usadas.add(idx); }
  }
  const amostra = dados.slice(0, 50);
  const ncol = Math.max(cabecalho.length, ...amostra.map((l) => l.length), 0);
  const taxa = (col: number, f: (s: string) => boolean) => {
    const vals = amostra.map((l) => l[col] ?? "").filter((v) => String(v).trim() !== "");
    return vals.length ? vals.filter(f).length / vals.length : 0;
  };
  if (m.data < 0) {
    for (let c = 0; c < ncol; c++) if (!usadas.has(c) && taxa(c, (v) => !!dataDeCelula(v)) > 0.8) { m.data = c; usadas.add(c); break; }
  }
  if (m.valor < 0 && m.debito < 0 && m.credito < 0) {
    // colunas numéricas livres; se houver duas, a última costuma ser o saldo
    const numericas: number[] = [];
    for (let c = 0; c < ncol; c++) if (!usadas.has(c) && taxa(c, (v) => valorDeCelula(v) != null) > 0.8) numericas.push(c);
    if (numericas.length) { m.valor = numericas[0]; usadas.add(numericas[0]); }
    if (numericas.length >= 2 && m.saldo < 0) { m.saldo = numericas[numericas.length - 1]; usadas.add(m.saldo); }
  }
  if (m.descricao < 0) {
    let melhor = -1;
    let maior = 0;
    for (let c = 0; c < ncol; c++) {
      if (usadas.has(c)) continue;
      const media = amostra.reduce((s, l) => s + String(l[c] ?? "").length, 0) / Math.max(1, amostra.length);
      if (taxa(c, (v) => valorDeCelula(v) == null && !dataDeCelula(v)) > 0.6 && media > maior) { maior = media; melhor = c; }
    }
    if (melhor >= 0) m.descricao = melhor;
  }
  return m;
}

/** Aplica o mapeamento às linhas de dados. Linhas sem data ou sem valor são descartadas (totais, rodapés). */
export function aplicarMapeamento(linhas: string[][], m: Mapeamento): MovimentoBruto[] {
  const out: MovimentoBruto[] = [];
  for (const l of linhas) {
    const data = m.data >= 0 ? dataDeCelula(l[m.data]) : null;
    if (!data) continue;
    let valor: number | null = null;
    if (m.valor >= 0) {
      valor = valorDeCelula(l[m.valor]);
      if (valor != null && m.natureza >= 0) {
        const nat = semAcento(l[m.natureza] || "");
        if (/^(d|debito|saida|-)/.test(nat)) valor = -Math.abs(valor);
        else if (/^(c|credito|entrada|\+)/.test(nat)) valor = Math.abs(valor);
      }
    } else {
      const deb = m.debito >= 0 ? valorDeCelula(l[m.debito]) : null;
      const cred = m.credito >= 0 ? valorDeCelula(l[m.credito]) : null;
      if (deb || cred) valor = Math.abs(cred || 0) - Math.abs(deb || 0);
    }
    if (valor == null || valor === 0) continue;
    const descricao = (m.descricao >= 0 ? String(l[m.descricao] || "") : "").replace(/\s+/g, " ").trim() || "Lançamento";
    if (/^(saldo|total|saldo anterior|saldo do dia|saldo final)\b/i.test(semAcento(descricao))) continue;
    out.push({
      data,
      valor: Math.round(valor * 100) / 100,
      descricao: descricao.slice(0, 255),
      documento: m.documento >= 0 ? String(l[m.documento] || "").trim() || null : null,
      saldo: m.saldo >= 0 ? valorDeCelula(l[m.saldo]) : null,
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Entrada única
// ----------------------------------------------------------------------------

export function ehOfx(buffer: Buffer, nome: string): boolean {
  const amostra = buffer.slice(0, 1024).toString("latin1");
  return /\.(ofx|qfx)$/i.test(nome) || /<OFX>|OFXHEADER|<STMTTRN>/i.test(amostra);
}

export function lerArquivoExtrato(buffer: Buffer, nome: string): ArquivoLido {
  if (ehOfx(buffer, nome)) {
    return { formato: "ofx", ofx: lerOfx(decodificarTexto(buffer, charsetDoOfx(buffer))) };
  }
  const ehPlanilha = /\.(xlsx|xls|xlsm|ods)$/i.test(nome) || (buffer[0] === 0x50 && buffer[1] === 0x4b) || (buffer[0] === 0xd0 && buffer[1] === 0xcf);
  const bruto = ehPlanilha ? lerPlanilha(buffer) : lerCsv(decodificarTexto(buffer));
  const linhas = bruto.filter((l) => l.some((c) => String(c).trim() !== ""));
  const idxCab = encontrarCabecalho(linhas);
  const cabecalho = idxCab >= 0 ? linhas[idxCab] : [];
  const dados = idxCab >= 0 ? linhas.slice(idxCab + 1) : linhas;
  const mapeamento = detectarMapeamento(cabecalho, dados);
  return {
    formato: ehPlanilha ? "xlsx" : "csv",
    tabela: { cabecalho, linhas: dados, mapeamento, completo: mapeamentoCompleto(mapeamento) },
  };
}

// ----------------------------------------------------------------------------
// Deduplicação
// ----------------------------------------------------------------------------

const normDesc = (s: string) => semAcento(s).replace(/[^a-z0-9]/g, "");

/**
 * Chave estável de cada movimento: FITID do banco quando existe; senão hash de
 * data|valor|descrição|ordem — a ordem entre idênticos do mesmo arquivo evita
 * fundir dois Pix iguais no mesmo dia (o parser antigo fundia).
 */
export function chavesDedup(movimentos: MovimentoBruto[]): string[] {
  const vistos = new Map<string, number>();
  return movimentos.map((m) => {
    if (m.fitid && m.fitid.trim()) return `fitid:${m.fitid.trim()}`.slice(0, 120);
    const base = `${m.data}|${m.valor.toFixed(2)}|${normDesc(m.descricao)}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return `h:${createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 40)}`;
  });
}
