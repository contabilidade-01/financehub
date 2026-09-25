/**
 * Importação de extratos bancários (PF e PJ) como sessão persistente.
 *
 * Fluxo (padrão de ERP, ex.: Conta Azul):
 *  1. criarSessao: lê o arquivo, guarda tudo em rascunho (nada vai para os
 *     lançamentos ainda) e tenta achar a conta bancária pelo OFX.
 *  2. definirConta: vincula a uma conta existente ou cria a conta na hora.
 *     Marca duplicadas (já importadas) e propõe conciliação com lançamentos
 *     já existentes (mesmo valor/sentido, ±3 dias).
 *  3. Classificação linha a linha (autosave), regras em massa, sugestões por
 *     memória/regras e IA em lote.
 *  4. confirmar: UMA transação no banco cria/concilia tudo, sempre com a conta
 *     bancária. Qualquer erro desfaz tudo.
 */
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { createHash } from "crypto";
import axios from "axios";
import { storage, aprenderMemoriaCategoria, resolveMemoriaCategoria, aprenderMemoriaContaPJ, resolveMemoriaContaPJ } from "../../storage";
import { withRetry } from "../../utils/ai-errors";
import { resolverContaPj } from "../classificar-conta-pj";
import { sugerirCategoriaPorDescricao, chaveMemoria, type CategoriaPf } from "../categorizar-pf";
import {
  lerArquivoExtrato,
  aplicarMapeamento,
  chavesDedup,
  mapeamentoCompleto,
  type Mapeamento,
  type MovimentoBruto,
} from "./parsers";

export type Escopo = "pf" | "pj";

export class ErroImportacao extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ----------------------------------------------------------------------------
// Acesso e leitura
// ----------------------------------------------------------------------------

export async function obterSessao(id: number, usuarioId: number): Promise<any> {
  const r = (await db.execute(sql`SELECT * FROM importacoes WHERE id = ${id} AND usuario_id = ${usuarioId} LIMIT 1`)) as any[];
  if (!r[0]) throw new ErroImportacao("Importação não encontrada", 404);
  return r[0];
}

function exigirRascunho(s: any) {
  if (s.status !== "rascunho") throw new ErroImportacao("Esta importação já foi concluída ou cancelada.", 409);
}

export async function listarSessoes(usuarioId: number, filtros: { status?: string; escopo?: string; empresaId?: number | null }) {
  const status = filtros.status || "rascunho";
  return (await db.execute(sql`
    SELECT i.id, i.escopo, i.empresa_id, i.conta_bancaria_id, i.arquivo_nome, i.formato, i.status,
           i.criado_em, i.atualizado_em, i.concluido_em, i.resultado,
           COALESCE(cb.nome, cb.banco) AS conta_nome,
           (SELECT count(*)::int FROM importacao_linhas l WHERE l.importacao_id = i.id) AS total_linhas,
           (SELECT count(*)::int FROM importacao_linhas l WHERE l.importacao_id = i.id
              AND l.status = 'pendente' AND l.categoria_id IS NULL) AS sem_categoria
    FROM importacoes i
    LEFT JOIN contas_bancarias cb ON cb.id = i.conta_bancaria_id
    WHERE i.usuario_id = ${usuarioId}
      AND i.status = ${status}
      AND (${filtros.escopo || ""} = '' OR i.escopo = ${filtros.escopo || ""})
      AND (${filtros.empresaId ?? null}::int IS NULL OR i.empresa_id = ${filtros.empresaId ?? null})
    ORDER BY i.atualizado_em DESC
    LIMIT 50
  `)) as any[];
}

export async function linhasDaSessao(id: number): Promise<any[]> {
  return (await db.execute(sql`
    SELECT id, ordem, data, descricao, valor, documento, chave, status, categoria_id, sugestao_categoria_id,
           sugestao_origem, transacao_existente_id, candidatos, transacao_criada_id, centro_custo_id,
           contato_id, observacao
    FROM importacao_linhas WHERE importacao_id = ${id} ORDER BY data, ordem
  `)) as any[];
}

export function resumoLinhas(linhas: any[]) {
  const r = { total: linhas.length, pendentes: 0, sem_categoria: 0, conciliar: 0, duplicadas: 0, ignoradas: 0, importadas: 0, entradas: 0, saidas: 0 };
  for (const l of linhas) {
    const v = Number(l.valor);
    if (l.status === "pendente") { r.pendentes++; if (!l.categoria_id) r.sem_categoria++; }
    else if (l.status === "conciliar") r.conciliar++;
    else if (l.status === "duplicada") r.duplicadas++;
    else if (l.status === "ignorar") r.ignoradas++;
    else if (l.status === "importada") r.importadas++;
    if (l.status === "pendente" || l.status === "conciliar") {
      if (v >= 0) r.entradas += v; else r.saidas += -v;
    }
  }
  r.entradas = Math.round(r.entradas * 100) / 100;
  r.saidas = Math.round(r.saidas * 100) / 100;
  return r;
}

/** Categorias (PF) ou plano de contas (PJ) do escopo da sessão. */
export async function categoriasDoEscopo(s: any): Promise<{ id: number; nome: string; tipo: string; codigo?: string; descricao?: string | null }[]> {
  if (s.escopo === "pj") {
    const contas = (await storage.getEmpresasContasByEmpresaId(s.empresa_id)) as any[];
    return contas.filter((c) => c.ativo !== false).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, codigo: c.codigo, descricao: c.descricao }));
  }
  const cats = (await storage.getCategoriesByUserId(s.usuario_id)) as any[];
  return cats.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, descricao: c.descricao }));
}

export async function contasBancariasDoEscopo(s: { escopo: Escopo; usuario_id: number; empresa_id?: number | null }): Promise<any[]> {
  if (s.escopo === "pj") {
    return (await db.execute(sql`SELECT * FROM contas_bancarias WHERE empresa_id = ${s.empresa_id} AND ativo = true ORDER BY nome, banco`)) as any[];
  }
  return (await db.execute(sql`
    SELECT * FROM contas_bancarias WHERE usuario_id = ${s.usuario_id} AND empresa_id IS NULL AND ativo = true ORDER BY nome, banco
  `)) as any[];
}

export async function detalharSessao(id: number, usuarioId: number) {
  const sessao = await obterSessao(id, usuarioId);
  const linhas = await linhasDaSessao(id);
  const { linhas_brutas, ...semBrutas } = sessao;
  return {
    sessao: { ...semBrutas, amostra_bruta: Array.isArray(linhas_brutas) ? linhas_brutas.slice(0, 8) : null },
    linhas,
    resumo: resumoLinhas(linhas),
    categorias: await categoriasDoEscopo(sessao),
    contas_bancarias: await contasBancariasDoEscopo(sessao),
  };
}

// ----------------------------------------------------------------------------
// 1. Criar sessão a partir do arquivo
// ----------------------------------------------------------------------------

const soDigitos = (s?: string | null) => String(s || "").replace(/\D/g, "");

/** Conta cadastrada que corresponde ao OFX (número da conta, e agência quando houver). */
function casarContaDoArquivo(contas: any[], conta: { conta?: string | null; agencia?: string | null } | null) {
  if (!conta?.conta) return null;
  const alvo = soDigitos(conta.conta);
  if (alvo.length < 3) return null;
  const hits = contas.filter((c) => {
    const n = soDigitos(c.numero);
    return n && (n === alvo || n.replace(/^0+/, "") === alvo.replace(/^0+/, ""));
  });
  if (hits.length === 1) return hits[0];
  const ag = soDigitos(conta.agencia);
  return hits.find((c) => ag && soDigitos(c.agencia) === ag) || null;
}

async function gravarLinhas(importacaoId: number, movs: MovimentoBruto[]) {
  await db.execute(sql`DELETE FROM importacao_linhas WHERE importacao_id = ${importacaoId}`);
  const chaves = chavesDedup(movs);
  const LOTE = 200;
  for (let i = 0; i < movs.length; i += LOTE) {
    const valores = movs.slice(i, i + LOTE).map((m, j) => sql`(
      ${importacaoId}, ${i + j + 1}, ${m.data}, ${m.descricao.slice(0, 255)}, ${m.valor.toFixed(2)},
      ${m.documento ? String(m.documento).slice(0, 80) : null}, ${chaves[i + j]}
    )`);
    await db.execute(sql`
      INSERT INTO importacao_linhas (importacao_id, ordem, data, descricao, valor, documento, chave)
      VALUES ${sql.join(valores, sql`, `)}
    `);
  }
}

export async function criarSessao(p: {
  usuarioId: number;
  escopo: Escopo;
  empresaId?: number | null;
  arquivoNome: string;
  buffer: Buffer;
}) {
  if (p.escopo === "pj") {
    const emp = await storage.getEmpresaById(Number(p.empresaId));
    if (!emp || emp.usuario_id !== p.usuarioId) throw new ErroImportacao("Empresa não encontrada", 404);
  }
  const lido = lerArquivoExtrato(p.buffer, p.arquivoNome);
  const hash = createHash("sha256").update(p.buffer).digest("hex");

  // Mesmo arquivo já concluído neste escopo? avisa (não bloqueia: pode ser outra conta).
  const jaConcluido = (await db.execute(sql`
    SELECT id, concluido_em FROM importacoes
    WHERE usuario_id = ${p.usuarioId} AND hash_arquivo = ${hash} AND status = 'concluida'
      AND escopo = ${p.escopo} AND (${p.empresaId ?? null}::int IS NULL OR empresa_id = ${p.empresaId ?? null})
    ORDER BY id DESC LIMIT 1
  `)) as any[];

  let movimentos: MovimentoBruto[] = [];
  let mapeamento: Mapeamento | null = null;
  if (lido.ofx) movimentos = lido.ofx.movimentos;
  else if (lido.tabela) {
    mapeamento = lido.tabela.mapeamento;
    if (lido.tabela.completo) movimentos = aplicarMapeamento(lido.tabela.linhas, mapeamento);
  }
  if (lido.ofx && !movimentos.length) throw new ErroImportacao("Nenhum movimento encontrado no arquivo OFX.");
  if (lido.tabela && !lido.tabela.linhas.length) throw new ErroImportacao("A planilha está vazia.");
  if (lido.tabela && lido.tabela.linhas.length > 20000) throw new ErroImportacao("Arquivo muito grande (máximo de 20.000 linhas).");

  const contas = await contasBancariasDoEscopo({ escopo: p.escopo, usuario_id: p.usuarioId, empresa_id: p.empresaId });
  const contaCasada = casarContaDoArquivo(contas, lido.ofx?.conta || null);

  const ins = (await db.execute(sql`
    INSERT INTO importacoes
      (usuario_id, escopo, empresa_id, arquivo_nome, formato, hash_arquivo, cabecalho, linhas_brutas, mapeamento,
       conta_arquivo, saldo_final_informado, data_saldo, periodo_de, periodo_ate)
    VALUES
      (${p.usuarioId}, ${p.escopo}, ${p.escopo === "pj" ? p.empresaId : null}, ${p.arquivoNome.slice(0, 255)}, ${lido.formato}, ${hash},
       ${lido.tabela ? JSON.stringify(lido.tabela.cabecalho) : null}::jsonb,
       ${lido.tabela ? JSON.stringify(lido.tabela.linhas) : null}::jsonb,
       ${mapeamento ? JSON.stringify(mapeamento) : null}::jsonb,
       ${lido.ofx ? JSON.stringify(lido.ofx.conta) : null}::jsonb,
       ${lido.ofx?.saldoFinal != null ? lido.ofx.saldoFinal.toFixed(2) : null},
       ${lido.ofx?.dataSaldo ?? null}, ${lido.ofx?.periodoDe ?? null}, ${lido.ofx?.periodoAte ?? null})
    RETURNING id
  `)) as any[];
  const id = Number(ins[0].id);
  if (movimentos.length) await gravarLinhas(id, movimentos);
  if (contaCasada) await definirConta(id, p.usuarioId, { contaBancariaId: contaCasada.id });
  else if (movimentos.length) await sugerirClassificacao(id, p.usuarioId);

  return { id, ja_importado_em: jaConcluido[0]?.concluido_em ?? null, conta_reconhecida: !!contaCasada };
}

// ----------------------------------------------------------------------------
// 2. Mapeamento de colunas (CSV/XLSX)
// ----------------------------------------------------------------------------

export async function definirMapeamento(id: number, usuarioId: number, mapeamento: Mapeamento) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  if (!Array.isArray(s.linhas_brutas)) throw new ErroImportacao("Esta importação não usa mapeamento de colunas.");
  const campos: (keyof Mapeamento)[] = ["data", "descricao", "valor", "debito", "credito", "saldo", "documento", "natureza"];
  const limpo = Object.fromEntries(campos.map((k) => [k, Number.isInteger(mapeamento?.[k]) ? mapeamento[k] : -1])) as unknown as Mapeamento;
  if (!mapeamentoCompleto(limpo)) throw new ErroImportacao("Indique as colunas de data, descrição e valor (ou débito/crédito).");
  const movs = aplicarMapeamento(s.linhas_brutas, limpo);
  if (!movs.length) throw new ErroImportacao("Com esse mapeamento nenhuma linha tem data e valor válidos.");
  await db.execute(sql`UPDATE importacoes SET mapeamento = ${JSON.stringify(limpo)}::jsonb, atualizado_em = now() WHERE id = ${id}`);
  await gravarLinhas(id, movs);
  if (s.conta_bancaria_id) await verificarDuplicadasEConciliacao(id, s);
  await sugerirClassificacao(id, usuarioId);
  return { linhas: movs.length };
}

// ----------------------------------------------------------------------------
// 3. Conta bancária: vincular ou criar
// ----------------------------------------------------------------------------

export async function definirConta(
  id: number,
  usuarioId: number,
  entrada: { contaBancariaId?: number; nova?: { nome?: string; banco?: string; agencia?: string; numero?: string; tipo?: string; saldo_inicial?: number } },
) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  let contaId = Number(entrada.contaBancariaId) || null;
  if (contaId) {
    const contas = await contasBancariasDoEscopo(s);
    if (!contas.some((c) => Number(c.id) === contaId)) throw new ErroImportacao("Conta bancária não encontrada", 404);
  } else if (entrada.nova) {
    const n = entrada.nova;
    const nome = String(n.nome || n.banco || "").trim();
    if (!nome) throw new ErroImportacao("Informe o nome da conta bancária.");
    const r = (await db.execute(sql`
      INSERT INTO contas_bancarias (empresa_id, usuario_id, banco, nome, agencia, numero, tipo, saldo_inicial, ativo)
      VALUES (${s.escopo === "pj" ? s.empresa_id : null}, ${usuarioId}, ${String(n.banco || nome).slice(0, 120)}, ${nome.slice(0, 120)},
              ${n.agencia ? String(n.agencia).slice(0, 20) : null}, ${n.numero ? String(n.numero).slice(0, 30) : null},
              ${["corrente", "poupanca", "investimento", "caixa", "pagamento"].includes(String(n.tipo)) ? n.tipo : "corrente"},
              ${(Number(n.saldo_inicial) || 0).toFixed(2)}, true)
      RETURNING id
    `)) as any[];
    contaId = Number(r[0].id);
  } else {
    throw new ErroImportacao("Escolha uma conta bancária ou informe os dados da nova conta.");
  }
  await db.execute(sql`UPDATE importacoes SET conta_bancaria_id = ${contaId}, atualizado_em = now() WHERE id = ${id}`);
  const atual = { ...s, conta_bancaria_id: contaId };
  await verificarDuplicadasEConciliacao(id, atual);
  await sugerirClassificacao(id, usuarioId);
  return { conta_bancaria_id: contaId };
}

/**
 * Duplicadas: chave já gravada num lançamento desta conta (importação anterior).
 * Conciliação: lançamento existente, sem chave de extrato, mesmo valor e sentido,
 * ±3 dias, desta conta ou ainda sem conta. 1 candidato → propõe conciliar;
 * vários → lista para o cliente escolher.
 */
async function verificarDuplicadasEConciliacao(id: number, s: any) {
  const tabela = s.escopo === "pj" ? sql`empresas_transacoes` : sql`transacoes`;
  const walletId = s.escopo === "pf" ? (await storage.getWalletByUserId(s.usuario_id))?.id ?? -1 : null;
  const escopoTx = s.escopo === "pj" ? sql`t.empresa_id = ${s.empresa_id}` : sql`t.carteira_id = ${walletId}`;
  // volta linhas automáticas para pendente (troca de conta refaz a análise)
  await db.execute(sql`
    UPDATE importacao_linhas SET status = 'pendente', transacao_existente_id = NULL, candidatos = NULL
    WHERE importacao_id = ${id} AND status IN ('duplicada', 'conciliar')
  `);
  await db.execute(sql`
    UPDATE importacao_linhas l SET status = 'duplicada'
    FROM ${tabela} t
    WHERE l.importacao_id = ${id} AND ${escopoTx}
      AND t.conta_bancaria_id = ${s.conta_bancaria_id} AND t.fitid = l.chave
  `);
  const pendentes = (await db.execute(sql`
    SELECT id, data, valor FROM importacao_linhas WHERE importacao_id = ${id} AND status = 'pendente'
  `)) as any[];
  const usados = new Set<number>();
  for (const l of pendentes) {
    const v = Number(l.valor);
    const tipo = v >= 0 ? "Receita" : "Despesa";
    const cands = (await db.execute(sql`
      SELECT t.id, t.descricao, t.valor, t.data_transacao, t.status
      FROM ${tabela} t
      WHERE ${escopoTx}
        AND t.fitid IS NULL
        AND (t.conta_bancaria_id = ${s.conta_bancaria_id} OR t.conta_bancaria_id IS NULL)
        AND t.tipo = ${tipo}
        AND abs(t.valor::numeric) = ${Math.abs(v).toFixed(2)}
        AND COALESCE(t.data_vencimento, t.data_transacao) BETWEEN (${l.data}::date - 3) AND (${l.data}::date + 3)
      ORDER BY abs(COALESCE(t.data_vencimento, t.data_transacao) - ${l.data}::date), t.id
      LIMIT 5
    `)) as any[];
    const livres = cands.filter((c) => !usados.has(Number(c.id)));
    if (livres.length === 1) {
      usados.add(Number(livres[0].id));
      await db.execute(sql`
        UPDATE importacao_linhas SET status = 'conciliar', transacao_existente_id = ${livres[0].id},
          candidatos = ${JSON.stringify(livres)}::jsonb WHERE id = ${l.id}
      `);
    } else if (livres.length > 1) {
      await db.execute(sql`UPDATE importacao_linhas SET candidatos = ${JSON.stringify(livres)}::jsonb WHERE id = ${l.id}`);
    }
  }
}

// ----------------------------------------------------------------------------
// 4. Classificação
// ----------------------------------------------------------------------------

type Cat = { id: number; nome: string; tipo: string; codigo?: string; descricao?: string | null };

/** Sugestão determinística: memória do cliente → regras/palavras-chave. Não sobrescreve escolha manual. */
export async function sugerirClassificacao(id: number, usuarioId: number) {
  const s = await obterSessao(id, usuarioId);
  const cats = await categoriasDoEscopo(s);
  const linhas = (await db.execute(sql`
    SELECT id, descricao, valor FROM importacao_linhas
    WHERE importacao_id = ${id} AND status = 'pendente' AND categoria_id IS NULL
  `)) as any[];
  const segmento = s.escopo === "pj" ? ((await storage.getEmpresaById(s.empresa_id)) as any)?.segmento : null;
  let n = 0;
  for (const l of linhas) {
    const tipo = Number(l.valor) >= 0 ? "Receita" : "Despesa";
    const sug = await sugerirUma(s, cats, String(l.descricao), tipo, segmento);
    if (sug) {
      n++;
      await db.execute(sql`
        UPDATE importacao_linhas SET categoria_id = ${sug.id}, sugestao_categoria_id = ${sug.id}, sugestao_origem = ${sug.origem}
        WHERE id = ${l.id}
      `);
    }
  }
  return { sugeridas: n, total: linhas.length };
}

async function sugerirUma(s: any, cats: Cat[], descricao: string, tipo: string, segmento?: string | null): Promise<{ id: number; origem: string } | null> {
  const doTipo = (id?: number | null) => (id ? cats.find((c) => c.id === Number(id) && c.tipo === tipo) : undefined);
  if (s.escopo === "pj") {
    const mem = await resolveMemoriaContaPJ(s.usuario_id, chaveMemoria(descricao) || descricao);
    const cm = doTipo(mem?.conta_contabil_id);
    if (cm) return { id: cm.id, origem: "memoria" };
    const r = resolverContaPj({ contas: cats as any, tipo: tipo as any, descricao, segmento });
    if (r.conta && r.motivo === "descricao") return { id: r.conta.id, origem: "regra" };
    return null;
  }
  const mem = await resolveMemoriaCategoria(s.usuario_id, descricao);
  const cm = doTipo(mem?.categoria_id);
  if (cm) return { id: cm.id, origem: mem?.origem === "correcao" ? "memoria" : "historico" };
  const p = sugerirCategoriaPorDescricao(descricao, cats as CategoriaPf[], tipo);
  return p ? { id: p.categoria.id, origem: "regra" } : null;
}

/** IA em lote (um pedido para até 40 linhas), em segundo plano, com progresso na sessão. */
export async function iniciarSugestaoIa(id: number, usuarioId: number): Promise<{ iniciado: boolean; motivo?: string }> {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  if (!process.env.OPENAI_API_KEY) return { iniciado: false, motivo: "IA não configurada no servidor." };
  if (s.sugestao_status === "processando") return { iniciado: false, motivo: "Já está em andamento." };
  await db.execute(sql`UPDATE importacoes SET sugestao_status = 'processando', sugestao_progresso = 0 WHERE id = ${id}`);
  void executarSugestaoIa(s).catch(async (err) => {
    console.error("[Importação] IA falhou:", err?.message);
    await db.execute(sql`UPDATE importacoes SET sugestao_status = 'erro' WHERE id = ${id}`).catch(() => {});
  });
  return { iniciado: true };
}

async function executarSugestaoIa(s: any) {
  const cats = await categoriasDoEscopo(s);
  const linhas = (await db.execute(sql`
    SELECT id, descricao, valor FROM importacao_linhas
    WHERE importacao_id = ${s.id} AND status = 'pendente' AND categoria_id IS NULL ORDER BY ordem
  `)) as any[];
  const LOTE = 40;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const lista = cats.map((c) => `${c.id} | ${c.tipo} | ${c.codigo ? `${c.codigo} ` : ""}${c.nome}${c.descricao ? ` (${String(c.descricao).slice(0, 60)})` : ""}`).join("\n");
    const itens = lote.map((l) => `${l.id} | ${Number(l.valor) >= 0 ? "Receita" : "Despesa"} | ${l.descricao}`).join("\n");
    const prompt =
      `Você é um contador brasileiro. Classifique cada lançamento de extrato bancário em UMA categoria da lista, ` +
      `sempre do MESMO tipo (Receita/Despesa). Se não houver categoria adequada com segurança, use null.\n\n` +
      `Categorias (id | tipo | nome):\n${lista}\n\nLançamentos (id | tipo | descrição):\n${itens}\n\n` +
      `Responda só JSON: {"itens":[{"id":<id do lançamento>,"categoria_id":<id da categoria ou null>}]}`;
    const resp = await withRetry(
      () =>
        axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: process.env.AI_MODEL || "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            response_format: { type: "json_object" },
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 60000 },
        ),
      { provider: "openai-importacao" },
    );
    let itensResp: { id: number; categoria_id: number | null }[] = [];
    try {
      itensResp = JSON.parse(resp.data?.choices?.[0]?.message?.content || "{}").itens || [];
    } catch { /* lote inválido: segue */ }
    const porId = new Map(lote.map((l) => [Number(l.id), l]));
    for (const it of itensResp) {
      const l = porId.get(Number(it.id));
      const tipo = l && Number(l.valor) >= 0 ? "Receita" : "Despesa";
      const cat = cats.find((c) => c.id === Number(it.categoria_id) && c.tipo === tipo);
      if (!l || !cat) continue;
      // só preenche se o cliente ainda não escolheu (autosave pode ter mudado no meio)
      await db.execute(sql`
        UPDATE importacao_linhas SET categoria_id = ${cat.id}, sugestao_categoria_id = ${cat.id}, sugestao_origem = 'ia'
        WHERE id = ${l.id} AND categoria_id IS NULL AND status = 'pendente'
      `);
    }
    const prog = Math.round(((i + lote.length) / Math.max(1, linhas.length)) * 100);
    await db.execute(sql`UPDATE importacoes SET sugestao_progresso = ${prog} WHERE id = ${s.id}`);
  }
  await db.execute(sql`UPDATE importacoes SET sugestao_status = 'concluida', sugestao_progresso = 100 WHERE id = ${s.id}`);
}

// ----------------------------------------------------------------------------
// 5. Edição (autosave) e regras em massa
// ----------------------------------------------------------------------------

const STATUS_EDITAVEIS = new Set(["pendente", "conciliar", "ignorar", "duplicada"]);

export async function atualizarLinhas(
  id: number,
  usuarioId: number,
  alteracoes: { id: number; categoria_id?: number | null; descricao?: string; data?: string; status?: string; transacao_existente_id?: number | null; centro_custo_id?: number | null; contato_id?: number | null; observacao?: string | null }[],
) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  if (!Array.isArray(alteracoes) || alteracoes.length > 1000) throw new ErroImportacao("Lista de alterações inválida.");
  const cats = await categoriasDoEscopo(s);
  const catIds = new Set(cats.map((c) => c.id));
  let n = 0;
  for (const a of alteracoes) {
    const sets: any[] = [];
    if (a.categoria_id !== undefined) {
      if (a.categoria_id !== null && !catIds.has(Number(a.categoria_id))) throw new ErroImportacao("Categoria/conta inválida.");
      sets.push(sql`categoria_id = ${a.categoria_id}`);
    }
    if (a.descricao !== undefined) {
      const d = String(a.descricao).trim().slice(0, 255);
      if (!d) throw new ErroImportacao("Descrição não pode ficar vazia.");
      sets.push(sql`descricao = ${d}`);
    }
    if (a.data !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.data))) throw new ErroImportacao("Data inválida.");
      sets.push(sql`data = ${a.data}`);
    }
    if (a.status !== undefined) {
      if (!STATUS_EDITAVEIS.has(String(a.status))) throw new ErroImportacao("Status inválido.");
      sets.push(sql`status = ${a.status}`);
    }
    if (a.transacao_existente_id !== undefined) {
      // Só um candidato que o próprio servidor propôs para esta linha.
      if (a.transacao_existente_id !== null) {
        const ok = (await db.execute(sql`
          SELECT 1 FROM importacao_linhas
          WHERE id = ${a.id} AND importacao_id = ${id}
            AND candidatos @> ${JSON.stringify([{ id: Number(a.transacao_existente_id) }])}::jsonb
        `)) as any[];
        if (!ok[0]) throw new ErroImportacao("Lançamento para conciliar inválido.");
      }
      sets.push(sql`transacao_existente_id = ${a.transacao_existente_id}`);
    }
    if (a.centro_custo_id !== undefined || a.contato_id !== undefined) {
      if (s.escopo !== "pj") throw new ErroImportacao("Cliente/fornecedor e centro de custo são do módulo PJ.");
      const { validarVinculos } = await import("../erp/erp.service");
      const v = await validarVinculos(s.empresa_id, { centro_custo_id: a.centro_custo_id, contato_id: a.contato_id });
      if (a.centro_custo_id !== undefined) sets.push(sql`centro_custo_id = ${v.centro_custo_id}`);
      if (a.contato_id !== undefined) sets.push(sql`contato_id = ${v.contato_id}`);
    }
    if (a.observacao !== undefined) sets.push(sql`observacao = ${a.observacao ? String(a.observacao).slice(0, 255) : null}`);
    if (!sets.length) continue;
    const r = (await db.execute(sql`
      UPDATE importacao_linhas SET ${sql.join(sets, sql`, `)}, atualizado_em = now()
      WHERE id = ${a.id} AND importacao_id = ${id} AND status <> 'importada'
      RETURNING id
    `)) as any[];
    n += r.length;
  }
  await db.execute(sql`UPDATE importacoes SET atualizado_em = now() WHERE id = ${id}`);
  return { atualizadas: n, salvo_em: new Date().toISOString() };
}

/** "Tudo que contém X vai para a categoria Y" — aplica às pendentes do mesmo tipo e opcionalmente memoriza. */
export async function aplicarRegra(id: number, usuarioId: number, r: { termo: string; categoria_id: number; memorizar?: boolean; sobrescrever?: boolean }) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  const termo = String(r.termo || "").trim();
  if (termo.length < 2) throw new ErroImportacao("Informe ao menos 2 letras do texto a procurar.");
  const cat = (await categoriasDoEscopo(s)).find((c) => c.id === Number(r.categoria_id));
  if (!cat) throw new ErroImportacao("Categoria/conta inválida.");
  const sinal = cat.tipo === "Receita" ? sql`valor >= 0` : sql`valor < 0`;
  const candidatas = (await db.execute(sql`
    SELECT id, descricao, categoria_id FROM importacao_linhas
    WHERE importacao_id = ${id} AND status = 'pendente' AND ${sinal}
  `)) as any[];
  // Busca sem acento/maiúsculas ("posto shell" casa "POSTO SHELL LTDA").
  const alvo = normalizarBusca(termo);
  const ids = candidatas
    .filter((l) => normalizarBusca(l.descricao).includes(alvo) && (r.sobrescrever || !l.categoria_id))
    .map((l) => Number(l.id));
  const upd = ids.length
    ? ((await db.execute(sql`
        UPDATE importacao_linhas SET categoria_id = ${cat.id}, atualizado_em = now()
        WHERE importacao_id = ${id} AND id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
        RETURNING id
      `)) as any[])
    : [];
  if (r.memorizar) {
    if (s.escopo === "pj") await aprenderMemoriaContaPJ(usuarioId, chaveMemoria(termo) || termo, cat.id, cat.nome);
    else await aprenderMemoriaCategoria(usuarioId, termo, cat.id, cat.nome, "correcao");
  }
  await db.execute(sql`UPDATE importacoes SET atualizado_em = now() WHERE id = ${id}`);
  return { aplicadas: upd.length };
}

export function normalizarBusca(s: string) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Nova categoria (PF) ou conta do plano (PJ) criada na própria tela de importação. */
export async function criarCategoriaInline(id: number, usuarioId: number, b: { nome: string; tipo: "Receita" | "Despesa"; parent_id?: number | null; classificacao?: string }) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  const nome = String(b.nome || "").trim().slice(0, 120);
  const tipo = b.tipo === "Receita" ? "Receita" : "Despesa";
  if (nome.length < 2) throw new ErroImportacao("Informe o nome.");
  const existentes = await categoriasDoEscopo(s);
  const igual = existentes.find((c) => normalizarBusca(c.nome) === normalizarBusca(nome) && c.tipo === tipo);
  if (igual) return igual;
  if (s.escopo === "pj") {
    const contas = (await storage.getEmpresasContasByEmpresaId(s.empresa_id)) as any[];
    const pai = b.parent_id ? contas.find((c) => c.id === Number(b.parent_id)) : null;
    const codigo = proximoCodigoConta(contas, tipo, pai?.codigo);
    const classificacao = ["FIXA", "VARIAVEL", "OUTRA"].includes(String(b.classificacao)) ? String(b.classificacao) : tipo === "Receita" ? "OUTRA" : "VARIAVEL";
    const c = await storage.createEmpresaConta({
      empresa_id: s.empresa_id, codigo, nome, tipo, classificacao, parent_id: pai?.id ?? null,
    } as any);
    return { id: c.id, nome: c.nome, tipo: c.tipo, codigo: c.codigo };
  }
  const c = await storage.createCategory({ nome, tipo, usuario_id: usuarioId, global: false } as any);
  return { id: c.id, nome: c.nome, tipo: c.tipo };
}

/** Próximo código livre: filho do pai ("3.03" → "3.03.01") ou no grupo mais usado do tipo ("3.NN"). */
export function proximoCodigoConta(contas: { codigo: string; tipo: string }[], tipo: string, codigoPai?: string | null): string {
  const usados = new Set(contas.map((c) => c.codigo));
  let prefixo = codigoPai || "";
  if (!prefixo) {
    const freq = new Map<string, number>();
    for (const c of contas) if (c.tipo === tipo) { const p = c.codigo.split(".")[0]; freq.set(p, (freq.get(p) || 0) + 1); }
    prefixo = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || (tipo === "Receita" ? "1" : "3");
  }
  for (let n = 1; n < 1000; n++) {
    const cod = `${prefixo}.${String(n).padStart(2, "0")}`;
    if (!usados.has(cod)) return cod;
  }
  return `${prefixo}.${Date.now() % 100000}`;
}

// ----------------------------------------------------------------------------
// 6. Confirmar (atômico)
// ----------------------------------------------------------------------------

export async function confirmar(id: number, usuarioId: number, opts: { semCategoria?: "bloquear" | "outras" } = {}) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  if (!s.conta_bancaria_id) throw new ErroImportacao("Escolha ou crie a conta bancária antes de confirmar.");
  const linhas = await linhasDaSessao(id);
  const cats = await categoriasDoEscopo(s);
  const aCriar = linhas.filter((l) => l.status === "pendente");
  const aConciliar = linhas.filter((l) => l.status === "conciliar" && l.transacao_existente_id);
  const semCat = aCriar.filter((l) => !l.categoria_id);
  if (!aCriar.length && !aConciliar.length) throw new ErroImportacao("Não há lançamentos para importar.");

  let outras: Record<string, number | undefined> = {};
  if (semCat.length) {
    if (opts.semCategoria !== "outras") {
      throw new ErroImportacao(`${semCat.length} lançamento(s) sem categoria. Classifique ou escolha "Classificar restantes como Outras".`, 422);
    }
    for (const tipo of ["Receita", "Despesa"]) {
      const c = cats.find((x) => x.tipo === tipo && /^outr/.test(normalizarBusca(x.nome))) || cats.find((x) => x.tipo === tipo);
      outras[tipo] = c?.id;
    }
  }
  const catIds = new Set(cats.map((c) => c.id));
  const walletId = s.escopo === "pf" ? (await storage.getWalletByUserId(usuarioId))?.id : null;
  if (s.escopo === "pf" && !walletId) throw new ErroImportacao("Carteira do usuário não encontrada.");

  const resultado = await db.transaction(async (tx: any) => {
    let criados = 0;
    let conciliados = 0;
    for (const l of aCriar) {
      const valor = Number(l.valor);
      const tipo = valor >= 0 ? "Receita" : "Despesa";
      const categoriaId = l.categoria_id || outras[tipo];
      if (!categoriaId || !catIds.has(Number(categoriaId))) throw new ErroImportacao(`Categoria inválida na linha "${l.descricao}".`);
      const data = String(l.data).slice(0, 10);
      const r = s.escopo === "pj"
        ? ((await tx.execute(sql`
            INSERT INTO empresas_transacoes
              (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, data_pagamento, status, origem,
               movimenta_caixa, conta_bancaria_id, conciliado, fitid, metodo_pagamento, contato_id, centro_custo_id)
            VALUES (${s.empresa_id}, ${categoriaId}, ${l.descricao}, ${Math.abs(valor).toFixed(2)}, ${tipo}, ${data}, ${data},
                    'Efetivada', 'importacao', true, ${s.conta_bancaria_id}, true, ${l.chave}, 'Extrato bancário',
                    ${l.contato_id ?? null}, ${l.centro_custo_id ?? null})
            RETURNING id
          `)) as any[])
        : ((await tx.execute(sql`
            INSERT INTO transacoes
              (carteira_id, categoria_id, descricao, valor, tipo, data_transacao, data_pagamento, status,
               movimenta_caixa, conta_bancaria_id, fitid, metodo_pagamento)
            VALUES (${walletId}, ${categoriaId}, ${l.descricao}, ${Math.abs(valor).toFixed(2)}, ${tipo}, ${data}, ${data},
                    'Efetivada', true, ${s.conta_bancaria_id}, ${l.chave}, 'Extrato bancário')
            RETURNING id
          `)) as any[]);
      await tx.execute(sql`UPDATE importacao_linhas SET status = 'importada', transacao_criada_id = ${r[0].id} WHERE id = ${l.id}`);
      criados++;
    }
    for (const l of aConciliar) {
      const data = String(l.data).slice(0, 10);
      // Conciliar = o extrato confirma o lançamento: liga à conta, grava a chave e dá baixa se estava em aberto.
      const upd = s.escopo === "pj"
        ? ((await tx.execute(sql`
            UPDATE empresas_transacoes SET conta_bancaria_id = ${s.conta_bancaria_id}, fitid = ${l.chave}, conciliado = true,
              movimenta_caixa = true,
              status = CASE WHEN status = 'Pendente' THEN 'Efetivada' ELSE status END,
              data_pagamento = COALESCE(data_pagamento, ${data}::date)
            WHERE id = ${l.transacao_existente_id} AND empresa_id = ${s.empresa_id} AND fitid IS NULL
            RETURNING id
          `)) as any[])
        : ((await tx.execute(sql`
            UPDATE transacoes SET conta_bancaria_id = ${s.conta_bancaria_id}, fitid = ${l.chave}, movimenta_caixa = true,
              status = CASE WHEN status = 'Pendente' THEN 'Efetivada' ELSE status END,
              data_pagamento = COALESCE(data_pagamento, ${data}::date)
            WHERE id = ${l.transacao_existente_id} AND carteira_id = ${walletId} AND fitid IS NULL
            RETURNING id
          `)) as any[]);
      if (!upd.length) throw new ErroImportacao(`O lançamento a conciliar com "${l.descricao}" não está mais disponível. Revise a linha.`, 409);
      await tx.execute(sql`UPDATE importacao_linhas SET status = 'importada', transacao_criada_id = ${l.transacao_existente_id} WHERE id = ${l.id}`);
      conciliados++;
    }
    const res = { criados, conciliados, ignorados: linhas.filter((l) => l.status === "ignorar").length, duplicados: linhas.filter((l) => l.status === "duplicada").length };
    await tx.execute(sql`
      UPDATE importacoes SET status = 'concluida', concluido_em = now(), atualizado_em = now(),
        resultado = ${JSON.stringify(res)}::jsonb, linhas_brutas = NULL
      WHERE id = ${id} AND status = 'rascunho'
    `);
    return res;
  });

  // Aprendizado (fora da transação: não pode desfazer a importação).
  for (const l of aCriar) {
    if (!l.categoria_id || l.sugestao_origem === "memoria") continue;
    const cat = cats.find((c) => c.id === Number(l.categoria_id));
    if (!cat) continue;
    const corrigiu = l.sugestao_categoria_id && Number(l.sugestao_categoria_id) !== Number(l.categoria_id);
    try {
      if (s.escopo === "pj") await aprenderMemoriaContaPJ(usuarioId, chaveMemoria(l.descricao) || l.descricao, cat.id, cat.nome);
      else await aprenderMemoriaCategoria(usuarioId, l.descricao, cat.id, cat.nome, corrigiu || !l.sugestao_categoria_id ? "correcao" : "ia");
    } catch { /* best-effort */ }
  }
  return resultado;
}

export async function cancelar(id: number, usuarioId: number) {
  const s = await obterSessao(id, usuarioId);
  exigirRascunho(s);
  await db.execute(sql`UPDATE importacoes SET status = 'cancelada', atualizado_em = now(), linhas_brutas = NULL WHERE id = ${id}`);
  await db.execute(sql`DELETE FROM importacao_linhas WHERE importacao_id = ${id}`);
  return { cancelada: true };
}
