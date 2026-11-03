/**
 * Importação de lançamentos PJ (fluxo de caixa da empresa).
 * Arquivo próprio — NÃO altera o parser PF.
 *
 * Modelo: Data | Descrição | Categoria | Forma | Valor | Status
 * - Linhas normais viram contas a pagar da empresa (status Pendente).
 * - Grupos "Reembolsos a Pagar — Pessoal" (mês por extenso + N itens) viram
 *   reembolso_pessoal: a empresa deve à pessoa; visualização separada.
 */
import * as XLSX from "xlsx";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { criarCartao, listarCartoes, chaveNomeCartao } from "./fatura-pj.service";
import { detectarDelimitador } from "./importacao/parsers";

const FORMAS_GENERICAS =
  /^(boleto|d[ée]bito|cart[aã]o([_\s-]?de)?[_\s-]?d[ée]bito|cart[aã]o([_\s-]?de)?[_\s-]?cr[ée]dito|cartao_credito|cartao_debito|cart[aã]o|pix|dinheiro|transfer[êe]ncia|ted|doc|esp[ée]cie|—|-)?$/i;

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const norm = (s: string) =>
  (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface LinhaImportPj {
  linha: number;
  vencimento: string;
  descricao: string;
  categoria: string;
  forma: string;
  formaEhCartao: boolean;
  formaDiaVencimento: number | null;
  valor: number;
  tipo: "Despesa" | "Receita";
  reembolsoPessoal: boolean;
  itensAgrupados: number | null;
  /** Cliente (a receber) ou fornecedor (a pagar), quando a planilha traz. */
  contato: string;
}

export interface ErroLinha { linha: number; motivo: string; conteudo: string; }
/** Campos que a pessoa pode ligar a uma coluna da planilha. */
export const CAMPOS_IMPORT_PJ = ["data", "valor", "entrada", "saida", "descricao", "contato", "categoria", "forma"] as const;
export type CampoImportPj = (typeof CAMPOS_IMPORT_PJ)[number];
/** Índice da coluna de cada campo (-1 = não usar). */
export type MapaColunasPj = Record<CampoImportPj, number>;
/** auto: pelo sinal do valor (ou colunas Entrada/Saída). Despesa/Receita: tudo de um tipo. */
export type TipoImportPj = "auto" | "Despesa" | "Receita";
export interface OpcoesImportPj { mapa?: Partial<MapaColunasPj> | null; tipo?: TipoImportPj | null; }

export interface ParseResultPj {
  linhas: LinhaImportPj[];
  erros: ErroLinha[];
  /** Nomes das colunas (linha de cabeçalho) e algumas linhas cruas, para a tela de mapeamento. */
  colunas: string[];
  amostraBruta: string[][];
  mapa: MapaColunasPj;
  tipo: TipoImportPj;
}

const ALIASES_PJ: Record<CampoImportPj, string[]> = {
  data: ["vencimento", "data de vencimento", "data de recebimento", "data de pagamento", "data prevista", "previsao", "data"],
  valor: ["valor", "valor total", "valor (r$)", "montante", "quantia", "total"],
  entrada: ["entrada", "entradas", "credito", "receita", "recebimento", "a receber"],
  saida: ["saida", "saidas", "debito", "despesa", "pagamento", "a pagar"],
  descricao: ["descricao", "historico", "detalhe", "observacao", "referente", "lancamento", "item"],
  contato: ["cliente", "fornecedor", "favorecido", "sacado", "pagador", "beneficiario", "contato", "nome", "razao social"],
  categoria: ["categoria", "conta", "plano de contas", "classificacao", "natureza"],
  forma: ["forma_pagamento", "forma de pagamento", "forma", "meio", "meio de pagamento"],
};

/** Adivinha a coluna de cada campo pelo cabeçalho (nome exato primeiro, depois "contém"). */
export function detectarMapaPj(cabecalho: string[]): MapaColunasPj {
  const h = cabecalho.map((c) => norm(String(c ?? "")).replace(/\s+/g, " "));
  const usados = new Set<number>();
  const mapa = {} as MapaColunasPj;
  // Ordem importa: "data de recebimento" é data, não entrada; "valor" antes de entrada/saída.
  const ordem: CampoImportPj[] = ["data", "valor", "descricao", "contato", "categoria", "forma", "entrada", "saida"];
  for (const campo of ordem) {
    const al = ALIASES_PJ[campo];
    let i = h.findIndex((x, k) => !usados.has(k) && al.includes(x));
    if (i < 0) i = h.findIndex((x, k) => !usados.has(k) && x !== "" && al.some((a) => a.length >= 4 && x.includes(a)));
    mapa[campo] = i;
    if (i >= 0) usados.add(i);
  }
  // Com coluna de valor única, entrada/saída sobram (evita pegar "Receita" como categoria, por ex.).
  if (mapa.valor >= 0) { mapa.entrada = -1; mapa.saida = -1; }
  return mapa;
}

/** Linha do cabeçalho: a primeira (até a 15ª) com 2+ células e algum nome conhecido. */
function acharCabecalho(rows: any[][]): number {
  const todos = Object.values(ALIASES_PJ).flat();
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cel = (rows[i] || []).map((c) => norm(String(c ?? ""))).filter(Boolean);
    if (cel.length >= 2 && cel.some((c) => todos.some((a) => c === a || (a.length >= 4 && c.includes(a))))) return i;
  }
  return 0;
}

function parseDataBR(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

function parseMesExtenso(v: any): string | null {
  const s = norm(String(v ?? ""));
  const m = s.match(/^(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})$/);
  if (!m) return null;
  const mes = MESES[m[1]];
  const ano = parseInt(m[2], 10);
  const last = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function parseValorBR(v: any): { valor: number; negativo: boolean } | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return { valor: Math.abs(v), negativo: v < 0 };
  let s = String(v).trim();
  const negativo = /[−\-]/.test(s.replace(/r\$/i, ""));
  s = s.replace(/[^\d.,-]/g, "").replace(/-/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return { valor: Math.abs(n), negativo };
}

function parseDescricao(v: any): string {
  const partes = String(v ?? "")
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p && p !== "—" && !/^detalhar$/i.test(p) && !/^reservar$/i.test(p));
  if (!partes.length) return "";
  const base = partes[0];
  const extras = partes.slice(1).filter((p) => !/^\d+\s*itens/i.test(p));
  return extras.length ? `${base} — ${extras.join(" · ")}` : base;
}

function ehGrupoReembolso(desc: string): boolean {
  const t = norm(desc);
  return /reembolsos?\s+a\s+pagar/.test(t) || (/reembolso/.test(t) && /pessoal/.test(t));
}

function contarItens(desc: string): number | null {
  const m = String(desc).match(/(\d+)\s*itens/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseFormaPj(v: any): { nome: string; dia: number | null; cartao: boolean } {
  let s = String(v ?? "").trim();
  if (!s || s === "—" || s === "-") return { nome: "", dia: null, cartao: false };
  s = s.replace(/\bCC\s+CC\b/i, "CC");
  let dia: number | null = null;
  const mv = s.match(/·?\s*(?:Venc\.?|VENCIMENTO)\s*(\d{1,2})/i);
  if (mv) {
    dia = parseInt(mv[1], 10);
    s = s.replace(/·?\s*(?:Venc\.?|VENCIMENTO)\s*\d{1,2}/i, "").trim();
  }
  s = s.replace(/·\s*$/, "").trim();
  const cartao = !FORMAS_GENERICAS.test(s) && (/^CC\b/i.test(s) || /\bCard\b/i.test(s) || (dia != null));
  return { nome: s, dia: dia && dia >= 1 && dia <= 31 ? dia : null, cartao };
}

function parseDelimited(text: string): string[][] {
  // ";" é o padrão dos CSVs brasileiros (Excel pt-BR); detecta ; , tab |.
  const delim = detectarDelimitador(text);
  const linhas: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\r") { /* ignora */ }
    else if (ch === "\n") { row.push(field); linhas.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); linhas.push(row); }
  return linhas;
}

function readRows(buffer: Buffer): any[][] {
  const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer.length > 7 && buffer[0] === 0xd0 && buffer[1] === 0xcf;
  if (isZip || isOle) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as any[][];
  }
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseDelimited(text);
}

export function parseLancamentosPj(buffer: Buffer, opcoes: OpcoesImportPj = {}): ParseResultPj {
  const rows = readRows(buffer);
  const linhas: LinhaImportPj[] = [];
  const erros: ErroLinha[] = [];
  const tipoFixo: TipoImportPj = opcoes.tipo === "Despesa" || opcoes.tipo === "Receita" ? opcoes.tipo : "auto";
  const vazio = { colunas: [], amostraBruta: [], mapa: detectarMapaPj([]), tipo: tipoFixo };
  if (rows.length === 0) return { linhas, erros, ...vazio };

  const ini = acharCabecalho(rows);
  const cabecalho = (rows[ini] || []).map((c) => String(c ?? "").trim());
  const detectado = detectarMapaPj(cabecalho);
  const hasHeader = detectado.data >= 0 && (detectado.valor >= 0 || detectado.entrada >= 0 || detectado.saida >= 0);
  const largura = Math.max(0, ...rows.slice(ini, ini + 50).map((r) => (r || []).length));
  // Mapa escolhido pela pessoa vence; sem ele, o detectado (ou a ordem do modelo antigo).
  let c: MapaColunasPj;
  if (opcoes.mapa) {
    c = { ...detectado };
    for (const k of CAMPOS_IMPORT_PJ) {
      const v = opcoes.mapa[k];
      if (v !== undefined) c[k] = Number.isInteger(v) && v >= 0 && v < Math.max(largura, 1) ? v : -1;
    }
  } else c = hasHeader ? detectado : { data: 0, descricao: 1, categoria: 2, forma: 3, valor: 4, entrada: -1, saida: -1, contato: -1 };
  const start = opcoes.mapa || hasHeader ? ini + 1 : 0;
  const colunas = hasHeader || opcoes.mapa
    ? Array.from({ length: largura }, (_, i) => cabecalho[i] || `Coluna ${i + 1}`)
    : Array.from({ length: largura }, (_, i) => `Coluna ${i + 1}`);
  const cel = (r: any[], i: number) => (i >= 0 ? r[i] : "");
  const amostraBruta = rows.slice(start, start + 5).map((r) => Array.from({ length: largura }, (_, i) => String(r?.[i] ?? "")));

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((x) => x === "" || x == null)) continue;
    const linhaNum = i + 1;
    const descRaw = String(cel(r, c.descricao) ?? "");
    if (/^detalhar$/i.test(descRaw.trim()) || /^reservar$/i.test(descRaw.trim())) continue;
    if (/^status$/i.test(String(cel(r, c.data) ?? "").trim())) continue;
    // Linha de total no rodapé de planilhas exportadas.
    if (/^(sub)?total\b/i.test(String(cel(r, c.data) ?? "").trim()) || /^(sub)?total\b/i.test(descRaw.trim())) continue;

    const venc = parseDataBR(cel(r, c.data)) || parseMesExtenso(cel(r, c.data));
    // Valor: coluna única (sinal decide) ou colunas Entrada/Saída separadas.
    let val = c.valor >= 0 ? parseValorBR(cel(r, c.valor)) : null;
    if (!val || val.valor === 0) {
      const ent = c.entrada >= 0 ? parseValorBR(cel(r, c.entrada)) : null;
      const sai = c.saida >= 0 ? parseValorBR(cel(r, c.saida)) : null;
      if (ent && ent.valor > 0) val = { valor: ent.valor, negativo: false };
      else if (sai && sai.valor > 0) val = { valor: sai.valor, negativo: true };
    }
    const contato = String(cel(r, c.contato) ?? "").trim().slice(0, 200);
    const descricao = parseDescricao(cel(r, c.descricao)) || contato;
    if (!venc) { erros.push({ linha: linhaNum, motivo: "data inválida", conteudo: String(cel(r, c.data) ?? "") }); continue; }
    if (!val || !(val.valor > 0)) { erros.push({ linha: linhaNum, motivo: "valor ilegível", conteudo: String(cel(r, c.valor >= 0 ? c.valor : c.entrada >= 0 ? c.entrada : c.saida) ?? "") }); continue; }
    if (!descricao) { erros.push({ linha: linhaNum, motivo: "descrição vazia", conteudo: "" }); continue; }

    const forma = parseFormaPj(cel(r, c.forma));
    const cat = String(cel(r, c.categoria) ?? "").trim();
    const tipo = tipoFixo !== "auto" ? tipoFixo : val.negativo ? "Despesa" : "Receita";
    linhas.push({
      linha: linhaNum,
      vencimento: venc,
      descricao,
      categoria: !cat || cat === "—" ? "" : cat,
      forma: forma.nome,
      formaEhCartao: forma.cartao,
      formaDiaVencimento: forma.dia,
      valor: val.valor,
      tipo,
      reembolsoPessoal: tipoFixo !== "Receita" && ehGrupoReembolso(descricao),
      itensAgrupados: contarItens(descRaw),
      contato: contato === "—" ? "" : contato,
    });
  }
  return { linhas, erros, colunas, amostraBruta, mapa: c, tipo: tipoFixo };
}

export interface PreviewPj {
  total: number;
  contasAPagar: number;
  contasAReceber: number;
  totalAPagar: number;
  totalAReceber: number;
  contatosNovos: string[];
  colunas: string[];
  amostraBruta: string[][];
  mapa: MapaColunasPj;
  tipo: TipoImportPj;
  reembolsosPessoais: number;
  totalReembolsos: number;
  duplicadas: number;
  categoriasNovas: string[];
  formasNovas: { nome: string; cartao: boolean; diaVencimento: number | null }[];
  erros: ErroLinha[];
  amostra: { vencimento: string; descricao: string; categoria: string; forma: string; valor: number; reembolsoPessoal: boolean; tipo: "Despesa" | "Receita"; contato: string }[];
}

/** Clientes/fornecedores da empresa por nome normalizado. */
async function contatosPorNome(empresaId: number): Promise<Map<string, { id: number; tipo: string }>> {
  const rows = (await db.execute(sql`
    SELECT id, nome, tipo FROM empresas_contatos WHERE empresa_id = ${empresaId} ORDER BY ativo DESC, id
  `)) as any[];
  const m = new Map<string, { id: number; tipo: string }>();
  for (const r of rows) if (!m.has(norm(r.nome))) m.set(norm(r.nome), { id: Number(r.id), tipo: String(r.tipo) });
  return m;
}

function chave(venc: string, desc: string, valor: number) {
  return `${venc}|${norm(desc)}|${valor.toFixed(2)}`;
}

async function chavesExistentes(empresaId: number): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT data_transacao::text AS d, descricao, valor::numeric AS v
    FROM empresas_transacoes WHERE empresa_id = ${empresaId}
  `);
  const s = new Set<string>();
  for (const r of rows as any[]) s.add(chave(String(r.d).slice(0, 10), r.descricao, Number(r.v)));
  return s;
}

function inferClassificacao(nome: string): "FIXA" | "VARIAVEL" | "OUTRA" {
  const t = norm(nome);
  if (/salario|aluguel|pro-?labore|inss|fgts|seguro|internet|telefone/.test(t)) return "FIXA";
  if (/marketing/.test(t)) return "VARIAVEL";
  return "OUTRA";
}

export async function montarPreviewPj(empresaId: number, parsed: ParseResultPj): Promise<PreviewPj> {
  const { linhas, erros } = parsed;
  const contatos = await contatosPorNome(empresaId);
  const contatosNovos = new Map<string, string>();
  const contas = await storage.getEmpresasContasByEmpresaId(empresaId);
  const catExist = new Set(contas.map((c) => norm(c.codigo) + "|" + norm(c.nome)));
  const categoriasNovas = new Set<string>();
  const formasNovas = new Map<string, { nome: string; cartao: boolean; diaVencimento: number | null }>();
  const cartoes = await listarCartoes(empresaId);
  const cartaoNorm = new Set(cartoes.map((c) => norm(c.nome)));

  const existentes = await chavesExistentes(empresaId);
  let duplicadas = 0, contasAPagar = 0, contasAReceber = 0, reembolsosPessoais = 0, totalReembolsos = 0, totalAPagar = 0, totalAReceber = 0;

  for (const l of linhas) {
    const nomeCat = l.categoria || (l.reembolsoPessoal ? "Diversos" : "Outros");
    const cm = nomeCat.match(/^(\d+(?:\.\d+)?)\s*-\s*(.+)$/);
    const codigo = cm ? cm[1] : "";
    const nome = cm ? cm[2] : nomeCat;
    if (![...catExist].some((k) => k.startsWith(norm(codigo) + "|") || k.endsWith("|" + norm(nome)) || k.endsWith("|" + norm(nomeCat)))) {
      categoriasNovas.add(nomeCat);
    }
    if (l.forma && l.formaEhCartao && !cartaoNorm.has(norm(l.forma))) {
      formasNovas.set(norm(l.forma), { nome: l.forma, cartao: true, diaVencimento: l.formaDiaVencimento });
    }
    // Forma não-cartão (PIX/boleto/nome de banco) NÃO vira cadastro — no commit vai para conta/Caixinha.
    if (l.contato && !contatos.has(norm(l.contato))) contatosNovos.set(norm(l.contato), l.contato);
    if (existentes.has(chave(l.vencimento, l.descricao, l.valor))) duplicadas++;
    else if (l.reembolsoPessoal) { reembolsosPessoais++; totalReembolsos += l.valor; }
    else if (l.tipo === "Receita") { contasAReceber++; totalAReceber += l.valor; }
    else { contasAPagar++; totalAPagar += l.valor; }
  }

  const porForma = new Map<string, LinhaImportPj[]>();
  for (const l of linhas) {
    const k = l.reembolsoPessoal ? "reemb" : `${l.tipo}|${l.forma || "—"}`;
    if (!porForma.has(k)) porForma.set(k, []);
    porForma.get(k)!.push(l);
  }
  const amostra: LinhaImportPj[] = [];
  for (const fila of porForma.values()) {
    if (amostra.length >= 16) break;
    amostra.push(fila[0]);
  }

  return {
    total: linhas.length,
    contasAPagar,
    contasAReceber,
    totalAPagar: Math.round(totalAPagar * 100) / 100,
    totalAReceber: Math.round(totalAReceber * 100) / 100,
    contatosNovos: [...contatosNovos.values()],
    colunas: parsed.colunas,
    amostraBruta: parsed.amostraBruta,
    mapa: parsed.mapa,
    tipo: parsed.tipo,
    reembolsosPessoais,
    totalReembolsos: Math.round(totalReembolsos * 100) / 100,
    duplicadas,
    categoriasNovas: [...categoriasNovas],
    formasNovas: [...formasNovas.values()],
    erros,
    amostra: amostra.map((l) => ({
      vencimento: l.vencimento, descricao: l.descricao, categoria: l.categoria || "Diversos",
      forma: l.forma || "—", valor: l.valor, reembolsoPessoal: l.reembolsoPessoal, tipo: l.tipo, contato: l.contato,
    })),
  };
}

async function resolveConta(empresaId: number, nomeCategoria: string, tipo: "Despesa" | "Receita") {
  const contas = await storage.getEmpresasContasByEmpresaId(empresaId);
  const raw = nomeCategoria || (tipo === "Despesa" ? "Diversos" : "Outras Receitas");
  const cm = raw.match(/^(\d+(?:\.\d+)?)\s*-\s*(.+)$/);
  const codigo = cm ? cm[1] : "";
  const nome = (cm ? cm[2] : raw).trim();
  const hit =
    (codigo && contas.find((c) => c.codigo === codigo)) ||
    contas.find((c) => norm(c.nome) === norm(nome) || norm(c.nome) === norm(raw) || norm(`${c.codigo} - ${c.nome}`) === norm(raw));
  if (hit) return hit;
  let novoCodigo = codigo;
  if (!novoCodigo) {
    const usados = new Set(contas.map((c) => c.codigo));
    let n = 1;
    while (usados.has(`9.${String(n).padStart(2, "0")}`)) n++;
    novoCodigo = `9.${String(n).padStart(2, "0")}`;
  }
  return storage.createEmpresaConta({
    empresa_id: empresaId,
    codigo: novoCodigo,
    nome: nome || raw,
    tipo,
    classificacao: tipo === "Receita" ? "OUTRA" : inferClassificacao(raw),
  } as any);
}

async function resolveCartao(empresaId: number, nome: string, diaVenc: number | null) {
  const lista = await listarCartoes(empresaId);
  const chave = chaveNomeCartao(nome);
  const hit = lista.find((c) => chaveNomeCartao(c.nome) === chave);
  if (hit) return hit;
  const venc = diaVenc && diaVenc >= 1 && diaVenc <= 31 ? diaVenc : 10;
  const fech = Math.max(1, venc - 7);
  return criarCartao(empresaId, { nome, dia_fechamento: fech, dia_vencimento: venc });
}

export interface CommitPj {
  contasCriadas: number;
  contasAPagarCriadas: number;
  contasAReceberCriadas: number;
  contatosCriados: number;
  reembolsosCriados: number;
  duplicadasPuladas: number;
  categoriasCriadas: number;
  cartoesCriados: number;
  erros: ErroLinha[];
}

export async function commitImportPj(empresaId: number, parsed: ParseResultPj): Promise<CommitPj> {
  const { linhas, erros } = parsed;
  const existentes = await chavesExistentes(empresaId);
  const contaCache = new Map<string, number>();
  let categoriasCriadas = 0, cartoesCriados = 0, contasCriadas = 0, reembolsosCriados = 0, duplicadasPuladas = 0;
  let contasAPagarCriadas = 0, contasAReceberCriadas = 0, contatosCriados = 0;
  const contatos = await contatosPorNome(empresaId);
  const contatoId = async (nome: string, tipo: "Despesa" | "Receita"): Promise<number | null> => {
    if (!nome) return null;
    const k = norm(nome);
    const hit = contatos.get(k);
    if (hit) return hit.id;
    const r = (await db.execute(sql`
      INSERT INTO empresas_contatos (empresa_id, tipo, nome)
      VALUES (${empresaId}, ${tipo === "Receita" ? "cliente" : "fornecedor"}, ${nome.slice(0, 200)})
      RETURNING id
    `)) as any[];
    const id = Number(r[0].id);
    contatos.set(k, { id, tipo: tipo === "Receita" ? "cliente" : "fornecedor" });
    contatosCriados++;
    return id;
  };

  const distintas = new Map<string, LinhaImportPj>();
  for (const l of linhas) if (l.forma && l.formaEhCartao && !distintas.has(norm(l.forma))) distintas.set(norm(l.forma), l);
  const cartaoByNorm = new Map<string, number>();
  for (const [key, l] of distintas) {
    const antes = (await listarCartoes(empresaId)).length;
    const c = await resolveCartao(empresaId, l.forma, l.formaDiaVencimento);
    cartaoByNorm.set(key, c.id);
    if ((await listarCartoes(empresaId)).length > antes) cartoesCriados++;
  }

  for (const l of linhas) {
    const k = chave(l.vencimento, l.descricao, l.valor);
    if (existentes.has(k)) { duplicadasPuladas++; continue; }
    const catKey = `${l.tipo}|${norm(l.categoria || "")}`;
    if (!contaCache.has(catKey)) {
      const antes = (await storage.getEmpresasContasByEmpresaId(empresaId)).length;
      const conta = await resolveConta(empresaId, l.categoria, l.tipo);
      contaCache.set(catKey, conta.id);
      if ((await storage.getEmpresasContasByEmpresaId(empresaId)).length > antes) categoriasCriadas++;
    }
    const cartaoId = l.formaEhCartao ? cartaoByNorm.get(norm(l.forma)) : undefined;
    let meioPatch: any = {
      movimenta_caixa: true,
      cartao_id: null,
      fatura_id: null,
      competencia: null,
      conta_bancaria_id: null,
      metodo_pagamento: l.forma || null,
    };
    if (cartaoId) {
      try {
        // Resolve fatura pelo cartão da empresa (competência do vencimento).
        const cartoes = await listarCartoes(empresaId);
        const cartao = cartoes.find((c) => c.id === cartaoId);
        if (cartao) {
          const { resolverFaturaDoCartao } = await import("./fatura-pj.service");
          const { fatura, competencia, metodo } = await resolverFaturaDoCartao(
            empresaId,
            cartao,
            l.vencimento,
          );
          meioPatch = {
            movimenta_caixa: false,
            cartao_id: cartao.id,
            fatura_id: fatura.id,
            competencia,
            conta_bancaria_id: null,
            metodo_pagamento: metodo || l.forma || cartao.nome,
          };
        }
      } catch {
        meioPatch = {
          movimenta_caixa: false,
          cartao_id: cartaoId,
          fatura_id: null,
          competencia: null,
          conta_bancaria_id: null,
          metodo_pagamento: l.forma || null,
        };
      }
    } else {
      // Conta a pagar: entra em Vencimentos (movimenta_caixa + Pendente).
      try {
        const { contaPadraoPj } = await import("./meio-pagamento-pj");
        const contaId = await contaPadraoPj(empresaId);
        if (contaId) meioPatch.conta_bancaria_id = contaId;
      } catch { /* segue sem conta */ }
    }

    await storage.createEmpresaTransacao({
      empresa_id: empresaId,
      categoria_id: contaCache.get(catKey)!,
      descricao: l.descricao.slice(0, 255),
      valor: l.valor,
      tipo: l.tipo,
      data_transacao: l.vencimento,
      data_vencimento: l.vencimento,
      status: "Pendente",
      origem: "importacao",
      reembolso_pessoal: l.reembolsoPessoal,
      itens_agrupados: l.itensAgrupados,
      ...meioPatch,
      ...(l.contato ? { contato_id: await contatoId(l.contato, l.tipo) } : {}),
    } as any);
    existentes.add(k);
    if (l.reembolsoPessoal) reembolsosCriados++;
    else {
      contasCriadas++;
      if (l.tipo === "Receita") contasAReceberCriadas++;
      else contasAPagarCriadas++;
    }
  }

  return { contasCriadas, contasAPagarCriadas, contasAReceberCriadas, contatosCriados, reembolsosCriados, duplicadasPuladas, categoriasCriadas, cartoesCriados, erros };
}
