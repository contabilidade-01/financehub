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
import { criarCartao, listarCartoes } from "./fatura-pj.service";

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
}

export interface ErroLinha { linha: number; motivo: string; conteudo: string; }
export interface ParseResultPj { linhas: LinhaImportPj[]; erros: ErroLinha[]; }

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

export function parseLancamentosPj(buffer: Buffer): ParseResultPj {
  const rows = readRows(buffer);
  const linhas: LinhaImportPj[] = [];
  const erros: ErroLinha[] = [];
  if (rows.length === 0) return { linhas, erros };

  const header = rows[0].map((c) => norm(String(c)));
  const col = (aliases: string[]) => header.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
  const idx = {
    data: col(["vencimento", "data"]),
    descricao: col(["descricao", "descrição"]),
    categoria: col(["categoria"]),
    forma: col(["forma_pagamento", "forma"]),
    valor: col(["valor"]),
  };
  const hasHeader = idx.data >= 0 && idx.valor >= 0;
  const start = hasHeader ? 1 : 0;
  const c = hasHeader ? idx : { data: 0, descricao: 1, categoria: 2, forma: 3, valor: 4 };

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((x) => x === "" || x == null)) continue;
    const linhaNum = i + 1;
    const descRaw = String(r[c.descricao] ?? "");
    if (/^detalhar$/i.test(descRaw.trim()) || /^reservar$/i.test(descRaw.trim())) continue;
    if (/^status$/i.test(String(r[c.data] ?? "").trim())) continue;

    const venc = parseDataBR(r[c.data]) || parseMesExtenso(r[c.data]);
    const val = parseValorBR(r[c.valor]);
    const descricao = parseDescricao(r[c.descricao]);
    if (!venc) { erros.push({ linha: linhaNum, motivo: "data inválida", conteudo: String(r[c.data] ?? "") }); continue; }
    if (!val) { erros.push({ linha: linhaNum, motivo: "valor ilegível", conteudo: String(r[c.valor] ?? "") }); continue; }
    if (!descricao) { erros.push({ linha: linhaNum, motivo: "descrição vazia", conteudo: "" }); continue; }

    const forma = parseFormaPj(r[c.forma]);
    const cat = String(r[c.categoria] ?? "").trim();
    linhas.push({
      linha: linhaNum,
      vencimento: venc,
      descricao,
      categoria: !cat || cat === "—" ? "" : cat,
      forma: forma.nome,
      formaEhCartao: forma.cartao,
      formaDiaVencimento: forma.dia,
      valor: val.valor,
      tipo: val.negativo ? "Despesa" : "Receita",
      reembolsoPessoal: ehGrupoReembolso(descricao),
      itensAgrupados: contarItens(descRaw),
    });
  }
  return { linhas, erros };
}

export interface PreviewPj {
  total: number;
  contasAPagar: number;
  reembolsosPessoais: number;
  totalReembolsos: number;
  duplicadas: number;
  categoriasNovas: string[];
  formasNovas: { nome: string; cartao: boolean; diaVencimento: number | null }[];
  erros: ErroLinha[];
  amostra: { vencimento: string; descricao: string; categoria: string; forma: string; valor: number; reembolsoPessoal: boolean }[];
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
  const contas = await storage.getEmpresasContasByEmpresaId(empresaId);
  const catExist = new Set(contas.map((c) => norm(c.codigo) + "|" + norm(c.nome)));
  const categoriasNovas = new Set<string>();
  const formasNovas = new Map<string, { nome: string; cartao: boolean; diaVencimento: number | null }>();
  const cartoes = await listarCartoes(empresaId);
  const cartaoNorm = new Set(cartoes.map((c) => norm(c.nome)));

  const existentes = await chavesExistentes(empresaId);
  let duplicadas = 0, contasAPagar = 0, reembolsosPessoais = 0, totalReembolsos = 0;

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
    } else if (l.forma && !l.formaEhCartao) {
      formasNovas.set(norm(l.forma), { nome: l.forma, cartao: false, diaVencimento: null });
    }
    if (existentes.has(chave(l.vencimento, l.descricao, l.valor))) duplicadas++;
    else if (l.reembolsoPessoal) { reembolsosPessoais++; totalReembolsos += l.valor; }
    else contasAPagar++;
  }

  const porForma = new Map<string, LinhaImportPj[]>();
  for (const l of linhas) {
    const k = l.reembolsoPessoal ? "reemb" : (l.forma || "—");
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
    reembolsosPessoais,
    totalReembolsos: Math.round(totalReembolsos * 100) / 100,
    duplicadas,
    categoriasNovas: [...categoriasNovas],
    formasNovas: [...formasNovas.values()],
    erros,
    amostra: amostra.map((l) => ({
      vencimento: l.vencimento, descricao: l.descricao, categoria: l.categoria || "Diversos",
      forma: l.forma || "—", valor: l.valor, reembolsoPessoal: l.reembolsoPessoal,
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
  const hit = lista.find((c) => norm(c.nome) === norm(nome));
  if (hit) return hit;
  const venc = diaVenc && diaVenc >= 1 && diaVenc <= 31 ? diaVenc : 10;
  const fech = Math.max(1, venc - 7);
  return criarCartao(empresaId, { nome, dia_fechamento: fech, dia_vencimento: venc });
}

export interface CommitPj {
  contasCriadas: number;
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
    } as any);
    existentes.add(k);
    if (l.reembolsoPessoal) reembolsosCriados++;
    else contasCriadas++;
  }

  return { contasCriadas, reembolsosCriados, duplicadasPuladas, categoriasCriadas, cartoesCriados, erros };
}
