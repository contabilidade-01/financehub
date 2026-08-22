/**
 * Serviço de conciliação bancária.
 *
 * Determinístico: casamento por data+valor, dedup por FITID/hash, bater-saldo.
 * IA (só sugere): classificação de descrição bancária -> conta do plano de contas,
 * na ordem memória pessoal PJ -> memória global PJ -> modelo.
 */
import { createHash } from "crypto";
import axios from "axios";
import * as XLSX from "xlsx";
import { parseOfx } from "../utils/ofx-parser";
import { withRetry } from "../utils/ai-errors";
import {
  storage,
  resolveMemoriaContaPJ,
  resolveMemoriaGlobal,
  hashExtratoJaImportado,
  criarImportacao,
  criarExtratoMovimento,
  buscarCandidatosConciliacao,
  conciliarMovimentoComTransacao,
} from "../storage";

interface SugestaoClassificacao {
  conta_id: number | null;
  origem: string | null;
  confianca: number | null;
}

// Sugere a conta contábil para uma descrição bancária. Só sugestão.
export async function sugerirClassificacao(
  userId: number,
  descricao: string,
  planoContas: { id: number; codigo: string; nome: string; tipo: string }[],
): Promise<SugestaoClassificacao> {
  // 1) memória pessoal PJ
  const pessoal = await resolveMemoriaContaPJ(userId, descricao);
  if (pessoal?.conta_contabil_id) {
    return { conta_id: pessoal.conta_contabil_id, origem: "memoria_pessoal", confianca: 92 };
  }
  // 2) memória global PJ (consenso agregado)
  const global = await resolveMemoriaGlobal("pj", descricao);
  if (global?.categoria_nome) {
    const c = planoContas.find((p) => p.nome.toLowerCase() === global.categoria_nome.toLowerCase());
    if (c) return { conta_id: c.id, origem: "memoria_global", confianca: 75 };
  }
  // 3) modelo (IA) — opcional e resiliente
  try {
    const ia = await classificarComIA(descricao, planoContas);
    if (ia) return { conta_id: ia, origem: "ia", confianca: 60 };
  } catch { /* sem IA disponível — segue sem sugestão */ }
  return { conta_id: null, origem: null, confianca: null };
}

async function classificarComIA(
  descricao: string,
  planoContas: { id: number; codigo: string; nome: string }[],
): Promise<number | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || planoContas.length === 0) return null;
  const lista = planoContas.map((c) => `${c.codigo} — ${c.nome}`).join("\n");
  const prompt = `Você é um contador. Classifique a descrição de um lançamento bancário em UMA conta do plano de contas abaixo. Responda SOMENTE com o código da conta (ex.: "3.1.1"), nada mais.\n\nPlano de contas:\n${lista}\n\nDescrição: "${descricao}"\nCódigo:`;
  const resp = await withRetry(
    () => axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: process.env.AI_MODEL || "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0 },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 },
    ),
    { provider: "openai-classificacao" },
  );
  const texto = (resp.data?.choices?.[0]?.message?.content || "").trim();
  const codigo = (texto.match(/[\d.]+/) || [])[0];
  if (!codigo) return null;
  const conta = planoContas.find((c) => c.codigo === codigo)
    || planoContas.find((c) => c.codigo.startsWith(codigo));
  return conta ? conta.id : null;
}

// ---- Parser genérico de planilha (CSV / XLSX) --------------------------------
type MovExtrato = { fitid: string | null; data: string; valor: number; tipo: string; descricao: string; memo: string | null };

const _norm = (s: string) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const _shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 32);

function _normalizarData(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{2})$/); if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
function _parseValor(v: any): number | null {
  if (typeof v === "number") return isNaN(v) ? null : v;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/[dD]$/.test(s) && !/[cC]$/.test(s)) neg = true;
  s = s.replace(/[^0-9.,-]/g, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}
function parsePlanilha(buffer: Buffer): MovExtrato[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  const out: MovExtrato[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    let data: string | null = null, dataIdx = -1;
    for (let i = 0; i < row.length; i++) { const d = _normalizarData(row[i]); if (d) { data = d; dataIdx = i; break; } }
    if (!data) continue; // cabeçalho ou linha inválida
    let valor: number | null = null;
    for (let i = row.length - 1; i >= 0; i--) {
      if (i === dataIdx) continue;
      const cell = row[i];
      const isNumLike = typeof cell === "number" || /\d/.test(String(cell));
      if (!isNumLike) continue;
      const v = _parseValor(cell);
      if (v != null) { valor = v; break; }
    }
    if (valor == null || valor === 0) continue;
    let descricao = "Lançamento", maior = 0;
    row.forEach((c, i) => { const s = String(c ?? ""); if (i !== dataIdx && !(c instanceof Date) && !/^-?[\d.,\s]+$/.test(s.trim()) && s.trim().length > maior) { maior = s.trim().length; descricao = s.trim(); } });
    out.push({ fitid: _shortHash(`${data}|${valor.toFixed(2)}|${_norm(descricao)}`), data, valor, tipo: valor >= 0 ? "credito" : "debito", descricao: descricao.slice(0, 255), memo: null });
  }
  return out;
}

// Núcleo comum: dedup -> importação -> movimentos -> casa/sugere.
async function _processarMovimentos(
  base: { empresaId: number; contaBancariaId: number; usuarioId: number; arquivoNome: string; formato: string; hash: string },
  movimentos: MovExtrato[],
  meta: { periodoDe?: string | null; periodoAte?: string | null; saldoFinal?: number | null } = {},
): Promise<any> {
  const { empresaId, contaBancariaId, usuarioId, arquivoNome, formato, hash } = base;
  const importacao = await criarImportacao({
    empresa_id: empresaId, conta_bancaria_id: contaBancariaId, arquivo_nome: arquivoNome,
    formato, periodo_de: meta.periodoDe ?? null, periodo_ate: meta.periodoAte ?? null,
    saldo_final_informado: meta.saldoFinal != null ? meta.saldoFinal.toFixed(2) : null,
    hash_arquivo: hash,
  });

  const planoContas = (await storage.getEmpresasContasByEmpresaId(empresaId)) as any[];
  let conciliados = 0, aClassificar = 0, duplicados = 0;

  for (const mov of movimentos) {
    // Casamento determinístico
    const candidatos = await buscarCandidatosConciliacao(empresaId, mov.valor, mov.data);
    let status = "pendente", transacaoId: number | null = null;
    let sug: SugestaoClassificacao = { conta_id: null, origem: null, confianca: null };

    if (candidatos.length === 1) {
      status = "conciliado";
      transacaoId = candidatos[0].id;
    } else {
      // Sem casamento claro -> sugerir classificação (IA/memória)
      sug = await sugerirClassificacao(usuarioId, mov.descricao, planoContas);
    }

    const criado = await criarExtratoMovimento({
      importacao_id: importacao.id, conta_bancaria_id: contaBancariaId, empresa_id: empresaId,
      fitid: mov.fitid, data: mov.data, valor: mov.valor, tipo: mov.tipo,
      descricao: mov.descricao, memo: mov.memo, status,
      transacao_id: transacaoId, sugestao_conta_id: sug.conta_id,
      sugestao_origem: sug.origem, sugestao_confianca: sug.confianca,
    });

    if (!criado) { duplicados++; continue; }
    if (status === "conciliado" && transacaoId) {
      await conciliarMovimentoComTransacao(criado.id, transacaoId);
      conciliados++;
    } else {
      aClassificar++;
    }
  }

  return {
    importacao_id: importacao.id,
    total: movimentos.length,
    conciliados, a_classificar: aClassificar, duplicados,
    saldo_final_informado: meta.saldoFinal ?? null,
  };
}

// Processa um extrato OFX.
export async function processarImportacaoOfx(params: {
  empresaId: number; contaBancariaId: number; usuarioId: number; arquivoNome: string; conteudo: string;
}): Promise<any> {
  const { empresaId, contaBancariaId, usuarioId, arquivoNome, conteudo } = params;
  const hash = createHash("sha256").update(conteudo).digest("hex");
  if (await hashExtratoJaImportado(contaBancariaId, hash)) {
    return { jaImportado: true, mensagem: "Este extrato já foi importado nesta conta." };
  }
  const extrato = parseOfx(conteudo);
  if (extrato.movimentos.length === 0) return { erro: "Nenhum movimento encontrado no arquivo OFX." };
  return _processarMovimentos(
    { empresaId, contaBancariaId, usuarioId, arquivoNome, formato: "ofx", hash },
    extrato.movimentos as any,
    { periodoDe: extrato.periodoDe, periodoAte: extrato.periodoAte, saldoFinal: extrato.saldoFinal },
  );
}

// Parser genérico (OFX/CSV/XLSX) → lista de movimentos. Usado também pela
// conciliação de fatura de cartão.
export function parseArquivoExtrato(buffer: Buffer, filename: string): MovExtrato[] {
  const nome = (filename || "").toLowerCase();
  const amostra = buffer.slice(0, 512).toString("utf8");
  const ehOfx = nome.endsWith(".ofx") || /<ofx|<stmttrn/i.test(amostra);
  if (ehOfx) {
    let conteudo = buffer.toString("utf8");
    if (/�/.test(conteudo)) conteudo = buffer.toString("latin1");
    return (parseOfx(conteudo).movimentos as any) as MovExtrato[];
  }
  return parsePlanilha(buffer);
}

// Processa um extrato de planilha (CSV ou XLSX).
export async function processarImportacaoPlanilha(params: {
  empresaId: number; contaBancariaId: number; usuarioId: number; arquivoNome: string; buffer: Buffer; formato: string;
}): Promise<any> {
  const { empresaId, contaBancariaId, usuarioId, arquivoNome, buffer, formato } = params;
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (await hashExtratoJaImportado(contaBancariaId, hash)) {
    return { jaImportado: true, mensagem: "Esta planilha já foi importada nesta conta." };
  }
  let movimentos: MovExtrato[];
  try {
    movimentos = parsePlanilha(buffer);
  } catch (e: any) {
    return { erro: "Não foi possível ler a planilha. Verifique o formato (colunas de data, descrição e valor)." };
  }
  if (movimentos.length === 0) return { erro: "Nenhum lançamento reconhecido na planilha (precisa de colunas com data, descrição e valor)." };
  return _processarMovimentos(
    { empresaId, contaBancariaId, usuarioId, arquivoNome, formato, hash },
    movimentos,
  );
}
