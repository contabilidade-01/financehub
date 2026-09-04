/**
 * Importação de lançamentos PF (modelo "controle em planilha").
 *
 * Reconhece o modelo do usuário (Data | Descrição multi-linha | Categoria |
 * Forma | Valor | Status) OU o cabeçalho canônico (vencimento/descricao/
 * categoria/forma_pagamento/valor/parcela/tag). Cada linha "Em aberto" vira uma
 * CONTA A PAGAR (transação status 'Pendente' + data_vencimento).
 *
 * Reaproveita a infra existente:
 * - resolveOuCriaFormaPagamento / cadastrarOuAtualizarCartao (formas e cartões)
 * - storage.createCategory / storage.createTransaction (categorias e lançamentos)
 */
import * as XLSX from "xlsx";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage, resolveOuCriaFormaPagamento, cadastrarOuAtualizarCartao } from "../storage";

// Formas que NÃO são cartão nominal (não viram cartão no cadastro do usuário).
// "Cartão de Crédito/Débito" genéricos e slugs (cartao_credito) ficam como forma global —
// o nome REAL do cartão deve ser "CC Nubank PF", "CC Mercado Pago", etc.
const FORMAS_GENERICAS =
  /^(boleto|d[ée]bito|cart[aã]o([_\s-]?de)?[_\s-]?d[ée]bito|cart[aã]o([_\s-]?de)?[_\s-]?cr[ée]dito|cartao_credito|cartao_debito|credit[_\s-]?card|debit[_\s-]?card|cart[aã]o|pix|dinheiro|transfer[êe]ncia|ted|doc|esp[ée]cie)$/i;

function ehCartaoNominal(nome: string): boolean {
  const s = (nome || "").trim();
  if (!s || FORMAS_GENERICAS.test(s)) return false;
  // Heurística: prefixo CC, "Card", "Venc.", ou qualquer nome específico restante
  if (/^CC\b/i.test(s)) return true;
  if (/\bCard\b/i.test(s)) return true;
  if (/Venc\.?\s*\d{1,2}/i.test(s)) return true;
  // Qualquer outra coisa que não seja forma genérica vira cartão nominal
  // (Mercado Pago, Magalu, Inter Platinum, Passaí, Tenda, Nubank…)
  return true;
}

export interface LinhaImport {
  linha: number;              // nº da linha na planilha (para mensagens)
  vencimento: string;         // AAAA-MM-DD
  descricao: string;
  categoria: string;          // nome completo (com código), "" = Outros
  forma: string;              // nome da forma/cartão, "" = sem forma
  formaEhCartao: boolean;
  formaDiaVencimento: number | null; // extraído de "· Venc. NN"
  valor: number;              // positivo
  tipo: "Despesa" | "Receita";
  reembolsavel: boolean;      // compõe a fatura, mas fica fora das despesas/contas a pagar
}

export interface ErroLinha { linha: number; motivo: string; conteudo: string; }

export interface ParseResult { linhas: LinhaImport[]; erros: ErroLinha[]; }

// -------- helpers de parsing --------

const norm = (s: string) =>
  (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function parseDataBR(v: any): string | null {
  if (v == null || v === "") return null;
  // XLSX pode entregar Date ou número serial.
  if (v instanceof Date && !isNaN(v.getTime())) return toISO(v);
  if (typeof v === "number") {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // DD/MM/AAAA ou DD-MM-AAAA
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // AAAA-MM-DD (canônico)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

function toISO(d: Date): string {
  // getters UTC: evita deslocar o dia em fusos negativos (ex.: Brasil UTC-3).
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// "− R$ 1.300,00" -> { valor: 1300, negativo: true }
function parseValorBR(v: any): { valor: number; negativo: boolean } | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return { valor: Math.abs(v), negativo: v < 0 };
  let s = String(v).trim();
  const negativo = /[−\-]/.test(s.replace(/r\$/i, ""));
  s = s.replace(/[^\d.,-]/g, "");           // tira "R$", espaços, "−", etc. (mantém . , -)
  s = s.replace(/-/g, "");
  if (!s) return null;
  // pt-BR: ponto=milhar, vírgula=decimal. Se tem vírgula, ela é o decimal.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return { valor: Math.abs(n), negativo };
}

// Descrição multi-linha: 1ª linha = base; "Parcela X/Y" e rótulos ficam anexados.
function parseDescricao(v: any): string {
  const partes = String(v ?? "")
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return "";
  const base = partes[0];
  const extras = partes.slice(1).filter((p) => p !== "—");
  return extras.length ? `${base} — ${extras.join(" · ")}` : base;
}

function detectarReembolsavel(descricao: string): boolean {
  const texto = norm(descricao);
  if (/\bdespesa\s+pai\b/.test(texto)) return false;
  if (/\breembolso\s+pendente\b|\breembolsavel\b/.test(texto)) return true;
  if (/\bnescon\b/.test(texto)) return true;
  if (/\bigreja\b/.test(texto) && /\breembolso\b/.test(texto)) return true;
  return false;
}

// "CC Inter PJ · Venc. 25" -> { nome: "CC Inter PJ", dia: 25, cartao: true }
function parseForma(v: any): { nome: string; dia: number | null; cartao: boolean } {
  let s = String(v ?? "").trim();
  if (!s || s === "—") return { nome: "", dia: null, cartao: false };
  let dia: number | null = null;
  const mv = s.match(/·?\s*Venc\.?\s*(\d{1,2})/i);
  if (mv) { dia = parseInt(mv[1], 10); s = s.replace(/·?\s*Venc\.?\s*\d{1,2}/i, "").trim(); }
  s = s.replace(/·\s*$/, "").trim();
  const cartao = ehCartaoNominal(s);
  return { nome: s, dia: dia && dia >= 1 && dia <= 31 ? dia : null, cartao };
}

function parseCategoria(v: any): string {
  const s = String(v ?? "").trim();
  return !s || s === "—" ? "" : s;
}

// CSV/TSV → matriz de strings. Mantém datas como TEXTO (sem coerção de fuso do
// XLSX) e respeita aspas com vírgula/quebra-de-linha dentro do campo.
function parseDelimited(text: string): string[][] {
  const delim = (text.split("\n")[0].match(/\t/g)?.length ?? 0) >
    (text.split("\n")[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
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

// Lê o buffer: .xlsx/.xls binário via SheetJS (serial limpo à meia-noite);
// qualquer outra coisa é tratada como texto CSV/TSV (data fica string).
function readRows(buffer: Buffer): any[][] {
  const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK' (xlsx)
  const isOle = buffer.length > 7 && buffer[0] === 0xd0 && buffer[1] === 0xcf; // xls legado
  if (isZip || isOle) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as any[][];
  }
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM
  return parseDelimited(text);
}

/**
 * Lê o buffer (XLSX/CSV) e devolve linhas normalizadas + erros por linha.
 * Auto-detecta o cabeçalho canônico ou o layout cru da planilha do usuário.
 */
export function parseLancamentos(buffer: Buffer): ParseResult {
  const rows: any[][] = readRows(buffer);

  const linhas: LinhaImport[] = [];
  const erros: ErroLinha[] = [];
  if (rows.length === 0) return { linhas, erros };

  // Mapear cabeçalho -> índice de coluna (aceita nomes canônicos e do modelo cru).
  const header = rows[0].map((c) => norm(String(c)));
  const col = (aliases: string[]) => header.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
  const idx = {
    data: col(["vencimento", "data"]),
    descricao: col(["descricao", "descrição", "descricao"]),
    categoria: col(["categoria"]),
    forma: col(["forma_pagamento", "forma"]),
    valor: col(["valor"]),
  };
  // Se não achou cabeçalho reconhecível, assume ordem fixa do modelo cru.
  const hasHeader = idx.data >= 0 && idx.valor >= 0;
  const start = hasHeader ? 1 : 0;
  const c = hasHeader ? idx : { data: 0, descricao: 1, categoria: 2, forma: 3, valor: 4 };

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((x) => x === "" || x == null)) continue;
    const linhaNum = i + 1;

    const venc = parseDataBR(r[c.data]);
    const val = parseValorBR(r[c.valor]);
    const descricao = parseDescricao(r[c.descricao]);

    if (!venc) { erros.push({ linha: linhaNum, motivo: "data de vencimento inválida", conteudo: String(r[c.data] ?? "") }); continue; }
    if (!val) { erros.push({ linha: linhaNum, motivo: "valor ilegível", conteudo: String(r[c.valor] ?? "") }); continue; }
    if (!descricao) { erros.push({ linha: linhaNum, motivo: "descrição vazia", conteudo: "" }); continue; }

    const forma = parseForma(r[c.forma]);
    linhas.push({
      linha: linhaNum,
      vencimento: venc,
      descricao,
      categoria: parseCategoria(r[c.categoria]),
      forma: forma.nome,
      formaEhCartao: forma.cartao,
      formaDiaVencimento: forma.dia,
      valor: val.valor,
      tipo: val.negativo ? "Despesa" : "Receita",
      reembolsavel: val.negativo && detectarReembolsavel(descricao),
    });
  }
  return { linhas, erros };
}

// -------- preview (dry-run, não grava nada) --------

export interface PreviewResult {
  total: number;
  novasContasAPagar: number;
  novosReembolsos: number;
  totalReembolsavel: number;
  duplicadas: number;
  categoriasNovas: string[];
  formasNovas: { nome: string; cartao: boolean; diaVencimento: number | null }[];
  cartoesIncompletos: string[]; // cartões que ficarão sem limite/fechamento
  erros: ErroLinha[];
  amostra: { vencimento: string; descricao: string; categoria: string; forma: string; valor: number; reembolsavel: boolean }[];
}

export async function montarPreview(userId: number, walletId: number, parsed: ParseResult): Promise<PreviewResult> {
  const { linhas, erros } = parsed;

  const categoriasExist = new Set((await storage.getCategoriesByUserId(userId)).map((c) => norm(c.nome)));
  const formasExist = new Map<string, any>();
  for (const f of await storage.getPaymentMethodsByUserId(userId)) formasExist.set(norm(f.nome), f);

  const categoriasNovas = new Set<string>();
  const formasNovas = new Map<string, { nome: string; cartao: boolean; diaVencimento: number | null }>();
  const cartoesIncompletos = new Set<string>();

  const existentes = await chavesExistentes(walletId);
  let duplicadas = 0;
  let novasContasAPagar = 0;
  let novosReembolsos = 0;
  let totalReembolsavel = 0;

  for (const l of linhas) {
    if (l.categoria && !categoriasExist.has(norm(l.categoria))) categoriasNovas.add(l.categoria);
    if (l.forma) {
      const f = formasExist.get(norm(l.forma));
      if (!f) formasNovas.set(norm(l.forma), { nome: l.forma, cartao: l.formaEhCartao, diaVencimento: l.formaDiaVencimento });
      if (l.formaEhCartao) {
        // cartão fica "incompleto" se novo sem limite/fechamento, ou existente ainda sem esses dados
        const semDados = !f || f.limite == null || f.dia_fechamento == null;
        if (semDados) cartoesIncompletos.add(l.forma);
      }
    }
    if (existentes.has(chave(l.vencimento, l.descricao, l.valor))) {
      duplicadas++;
    } else if (l.reembolsavel) {
      novosReembolsos++;
      totalReembolsavel += l.valor;
    } else {
      novasContasAPagar++;
    }
  }

  return {
    total: linhas.length,
    novasContasAPagar,
    novosReembolsos,
    totalReembolsavel: Math.round(totalReembolsavel * 100) / 100,
    duplicadas,
    categoriasNovas: [...categoriasNovas],
    formasNovas: [...formasNovas.values()],
    cartoesIncompletos: [...cartoesIncompletos],
    erros,
    // Amostra com variedade de formas (não só as 20 primeiras, que podem ser só boleto)
    amostra: amostraDiversa(linhas, 20),
  };
}

function amostraDiversa(
  linhas: LinhaImport[],
  limite: number,
): PreviewResult["amostra"] {
  const map = (l: LinhaImport) => ({
    vencimento: l.vencimento,
    descricao: l.descricao,
    categoria: l.categoria || "Outros",
    forma: l.forma || "—",
    valor: l.valor,
    reembolsavel: l.reembolsavel,
  });
  if (linhas.length <= limite) return linhas.map(map);

  const porForma = new Map<string, LinhaImport[]>();
  for (const l of linhas) {
    const k = l.forma || "—";
    if (!porForma.has(k)) porForma.set(k, []);
    porForma.get(k)!.push(l);
  }
  const out: LinhaImport[] = [];
  const keys = [...porForma.keys()];
  // 1 de cada forma primeiro
  for (const k of keys) {
    if (out.length >= limite) break;
    out.push(porForma.get(k)!.shift()!);
  }
  // completa intercalando
  let i = 0;
  while (out.length < limite) {
    const k = keys[i % keys.length];
    const fila = porForma.get(k)!;
    if (fila.length) out.push(fila.shift()!);
    i++;
    if (keys.every((kk) => porForma.get(kk)!.length === 0)) break;
  }
  return out.map(map);
}

// -------- commit (grava) --------

export interface CommitResult {
  contasCriadas: number;
  reembolsosCriados: number;
  duplicadasPuladas: number;
  categoriasCriadas: number;
  formasCriadas: number;
  cartoesCriados: number;
  erros: ErroLinha[];
}

export async function commitImport(userId: number, walletId: number, parsed: ParseResult): Promise<CommitResult> {
  const { linhas, erros } = parsed;

  // 1) Categorias: resolve as existentes; cria as faltantes (tipo Despesa/Receita conforme a linha).
  const catByNorm = new Map<string, number>();
  for (const c of await storage.getCategoriesByUserId(userId)) catByNorm.set(norm(c.nome), c.id);
  let categoriasCriadas = 0;
  for (const l of linhas) {
    const nome = l.categoria || "Outros";
    if (!catByNorm.has(norm(nome))) {
      const nova = await storage.createCategory({ nome, tipo: l.tipo, usuario_id: userId, global: false } as any);
      catByNorm.set(norm(nome), nova.id);
      categoriasCriadas++;
    }
  }

  // 2) Formas/cartões: cria/atualiza uma vez por nome distinto e guarda o id.
  const formaByNorm = new Map<string, number>();
  let formasCriadas = 0, cartoesCriados = 0;
  const distintas = new Map<string, LinhaImport>();
  for (const l of linhas) if (l.forma && !distintas.has(norm(l.forma))) distintas.set(norm(l.forma), l);
  for (const [key, l] of distintas) {
    if (l.formaEhCartao) {
      const diaVenc = l.formaDiaVencimento ?? undefined;
      const diaFech = diaVenc != null ? Math.max(1, Number(diaVenc) - 5) : undefined;
      const r = await cadastrarOuAtualizarCartao(userId, {
        nome: l.forma,
        dia_vencimento: diaVenc,
        dia_fechamento: diaFech,
      });
      formaByNorm.set(key, r.id);
      if (!r.atualizado) cartoesCriados++;
    } else {
      const r = await resolveOuCriaFormaPagamento(userId, l.forma);
      if (r.id) { formaByNorm.set(key, r.id); if (r.criado) formasCriadas++; }
    }
  }

  // 3) Contas a pagar (transações Pendente + vencimento), com dedup.
  const existentes = await chavesExistentes(walletId);
  let contasCriadas = 0, reembolsosCriados = 0, duplicadasPuladas = 0;
  for (const l of linhas) {
    const k = chave(l.vencimento, l.descricao, l.valor);
    if (existentes.has(k)) { duplicadasPuladas++; continue; }
    const categoriaId = catByNorm.get(norm(l.categoria || "Outros"))!;
    const formaId = l.forma ? formaByNorm.get(norm(l.forma)) : undefined;
    await storage.createTransaction({
      carteira_id: walletId,
      categoria_id: categoriaId,
      forma_pagamento_id: formaId ?? null,
      tipo: l.tipo,
      valor: l.valor,
      data_transacao: l.vencimento,
      data_vencimento: l.vencimento,
      descricao: l.descricao,
      status: "Pendente",
      reembolsavel: l.reembolsavel,
    } as any);
    existentes.add(k); // evita duplicar dentro do próprio arquivo
    if (l.reembolsavel) reembolsosCriados++;
    else contasCriadas++;
  }

  return { contasCriadas, reembolsosCriados, duplicadasPuladas, categoriasCriadas, formasCriadas, cartoesCriados, erros };
}

// -------- dedup helpers --------

function chave(venc: string, descricao: string, valor: number): string {
  return `${venc}|${norm(descricao)}|${valor.toFixed(2)}`;
}

async function chavesExistentes(walletId: number): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const rows = await db.execute(sql`
      SELECT descricao, valor, data_vencimento, data_transacao
      FROM transacoes WHERE carteira_id = ${walletId}
    `);
    for (const r of rows as any[]) {
      const venc = r.data_vencimento || r.data_transacao;
      if (!venc) continue;
      const v = parseFloat(r.valor) || 0;
      set.add(chave(String(venc).slice(0, 10), String(r.descricao || ""), Math.abs(v)));
    }
  } catch { /* coluna ausente / tabela vazia — sem dedup */ }
  return set;
}
