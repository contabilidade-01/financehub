/**
 * ERP PJ ME: cadastros (clientes/fornecedores, centros de custo), contas a
 * receber e DRE gerencial. As rotas exigem requireErpPj (modalidade PJ ME) e
 * a empresa do usuário logado.
 */
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { baixarTransacaoEmpresa } from "../empresa-transacao.service";
import { hojeSP, somarDias } from "../nlp-br";

export class ErroErp extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function empresaDoUsuario(empresaId: number, usuarioId: number) {
  const emp = await storage.getEmpresaById(empresaId);
  if (!emp || emp.usuario_id !== usuarioId) throw new ErroErp("Empresa não encontrada", 404);
  return emp;
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const texto = (s: unknown, max: number) => {
  const t = String(s ?? "").trim();
  return t ? t.slice(0, max) : null;
};

/** CPF (11) ou CNPJ (14) com dígitos verificadores válidos. */
export function documentoValido(doc: string): boolean {
  const d = soDigitos(doc);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

// ----------------------------------------------------------------------------
// Clientes e fornecedores
// ----------------------------------------------------------------------------

const TIPOS_CONTATO = new Set(["cliente", "fornecedor", "ambos"]);

export async function listarContatos(empresaId: number, f: { tipo?: string; q?: string; inativos?: boolean }) {
  const tipo = String(f.tipo || "");
  const q = String(f.q || "").trim();
  return (await db.execute(sql`
    SELECT c.*,
      (SELECT COALESCE(SUM(t.valor::numeric), 0) FROM empresas_transacoes t
        WHERE t.contato_id = c.id AND t.tipo = 'Receita' AND t.status = 'Pendente') AS a_receber,
      (SELECT COALESCE(SUM(t.valor::numeric), 0) FROM empresas_transacoes t
        WHERE t.contato_id = c.id AND t.tipo = 'Despesa' AND t.status = 'Pendente') AS a_pagar
    FROM empresas_contatos c
    WHERE c.empresa_id = ${empresaId}
      AND (${!!f.inativos} OR c.ativo = true)
      AND (${tipo} = '' OR c.tipo = ${tipo} OR c.tipo = 'ambos')
      AND (${q} = '' OR c.nome ILIKE ${"%" + q + "%"} OR c.documento LIKE ${"%" + soDigitos(q) + "%"})
    ORDER BY c.nome
    LIMIT 500
  `)) as any[];
}

function validarContato(b: any) {
  const nome = texto(b.nome, 200);
  if (!nome || nome.length < 2) throw new ErroErp("Informe o nome.");
  const tipo = TIPOS_CONTATO.has(String(b.tipo)) ? String(b.tipo) : "cliente";
  const documento = soDigitos(b.documento) || null;
  if (documento && !documentoValido(documento)) throw new ErroErp("CPF/CNPJ inválido.");
  const email = texto(b.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroErp("E-mail inválido.");
  return { nome, tipo, documento, email, telefone: texto(soDigitos(b.telefone) || b.telefone, 30), observacao: texto(b.observacao, 2000) };
}

export async function criarContato(empresaId: number, b: any) {
  const c = validarContato(b);
  if (c.documento) {
    const dup = (await db.execute(sql`SELECT id FROM empresas_contatos WHERE empresa_id = ${empresaId} AND documento = ${c.documento} AND ativo = true LIMIT 1`)) as any[];
    if (dup[0]) throw new ErroErp("Já existe um cadastro com esse CPF/CNPJ.", 409);
  }
  const r = (await db.execute(sql`
    INSERT INTO empresas_contatos (empresa_id, tipo, nome, documento, email, telefone, observacao)
    VALUES (${empresaId}, ${c.tipo}, ${c.nome}, ${c.documento}, ${c.email}, ${c.telefone}, ${c.observacao})
    RETURNING *
  `)) as any[];
  return r[0];
}

export async function atualizarContato(empresaId: number, id: number, b: any) {
  const c = validarContato(b);
  const r = (await db.execute(sql`
    UPDATE empresas_contatos SET tipo = ${c.tipo}, nome = ${c.nome}, documento = ${c.documento}, email = ${c.email},
      telefone = ${c.telefone}, observacao = ${c.observacao}, ativo = ${b.ativo === false ? false : true}
    WHERE id = ${id} AND empresa_id = ${empresaId}
    RETURNING *
  `)) as any[];
  if (!r[0]) throw new ErroErp("Cadastro não encontrado", 404);
  return r[0];
}

/** Com lançamentos vinculados vira inativo (histórico preservado); sem, é excluído. */
export async function removerContato(empresaId: number, id: number) {
  const usado = (await db.execute(sql`SELECT 1 FROM empresas_transacoes WHERE contato_id = ${id} LIMIT 1`)) as any[];
  const r = usado[0]
    ? ((await db.execute(sql`UPDATE empresas_contatos SET ativo = false WHERE id = ${id} AND empresa_id = ${empresaId} RETURNING id`)) as any[])
    : ((await db.execute(sql`DELETE FROM empresas_contatos WHERE id = ${id} AND empresa_id = ${empresaId} RETURNING id`)) as any[]);
  if (!r[0]) throw new ErroErp("Cadastro não encontrado", 404);
  return { removido: !usado[0], inativado: !!usado[0] };
}

// ----------------------------------------------------------------------------
// Centros de custo
// ----------------------------------------------------------------------------

export async function listarCentros(empresaId: number, inativos = false) {
  return (await db.execute(sql`
    SELECT cc.*,
      (SELECT count(*)::int FROM empresas_transacoes t WHERE t.centro_custo_id = cc.id) AS lancamentos
    FROM empresas_centros_custo cc
    WHERE cc.empresa_id = ${empresaId} AND (${inativos} OR cc.ativo = true)
    ORDER BY cc.codigo NULLS LAST, cc.nome
  `)) as any[];
}

export async function salvarCentro(empresaId: number, b: any, id?: number) {
  const nome = texto(b.nome, 120);
  if (!nome || nome.length < 2) throw new ErroErp("Informe o nome do centro de custo.");
  const codigo = texto(b.codigo, 20);
  try {
    const r = id
      ? ((await db.execute(sql`
          UPDATE empresas_centros_custo SET nome = ${nome}, codigo = ${codigo}, ativo = ${b.ativo === false ? false : true}
          WHERE id = ${id} AND empresa_id = ${empresaId} RETURNING *
        `)) as any[])
      : ((await db.execute(sql`
          INSERT INTO empresas_centros_custo (empresa_id, nome, codigo) VALUES (${empresaId}, ${nome}, ${codigo}) RETURNING *
        `)) as any[]);
    if (!r[0]) throw new ErroErp("Centro de custo não encontrado", 404);
    return r[0];
  } catch (e: any) {
    if (e?.code === "23505") throw new ErroErp("Já existe um centro de custo com esse nome.", 409);
    throw e;
  }
}

export async function removerCentro(empresaId: number, id: number) {
  const usado = (await db.execute(sql`SELECT 1 FROM empresas_transacoes WHERE centro_custo_id = ${id} LIMIT 1`)) as any[];
  const r = usado[0]
    ? ((await db.execute(sql`UPDATE empresas_centros_custo SET ativo = false WHERE id = ${id} AND empresa_id = ${empresaId} RETURNING id`)) as any[])
    : ((await db.execute(sql`DELETE FROM empresas_centros_custo WHERE id = ${id} AND empresa_id = ${empresaId} RETURNING id`)) as any[]);
  if (!r[0]) throw new ErroErp("Centro de custo não encontrado", 404);
  return { removido: !usado[0], inativado: !!usado[0] };
}

/** Garante que contato/centro/conta pertencem à empresa (nunca confiar em id vindo do cliente). */
export async function validarVinculos(empresaId: number, v: { contato_id?: unknown; centro_custo_id?: unknown; categoria_id?: unknown; conta_bancaria_id?: unknown }) {
  const checar = async (id: unknown, tabela: string, msg: string, extra = sql``) => {
    if (id === undefined || id === null || id === "") return null;
    const n = Number(id);
    if (!Number.isInteger(n)) throw new ErroErp(msg);
    const r = (await db.execute(sql`SELECT 1 FROM ${sql.raw(tabela)} WHERE id = ${n} AND empresa_id = ${empresaId} ${extra} LIMIT 1`)) as any[];
    if (!r[0]) throw new ErroErp(msg);
    return n;
  };
  return {
    contato_id: await checar(v.contato_id, "empresas_contatos", "Cliente/fornecedor inválido."),
    centro_custo_id: await checar(v.centro_custo_id, "empresas_centros_custo", "Centro de custo inválido."),
    // Lançamento só em conta analítica ativa (grupo sintético só soma).
    categoria_id: await checar(v.categoria_id, "empresas_contas", "Escolha uma conta do plano (não um grupo).", sql`AND sintetica = false AND ativo = true`),
    conta_bancaria_id: await checar(v.conta_bancaria_id, "contas_bancarias", "Conta bancária inválida."),
  };
}

/** Conta nova no plano de contas; código e grupo vêm do storage (regra única). */
export async function criarContaPlano(empresaId: number, b: any) {
  const nome = texto(b.nome, 120);
  if (!nome || nome.length < 2) throw new ErroErp("Informe o nome da conta.");
  const tipo = b.tipo === "Receita" ? "Receita" : "Despesa";
  const contas = (await storage.getEmpresasContasByEmpresaId(empresaId)) as any[];
  const igual = contas.find((c) => c.tipo === tipo && String(c.nome).toLowerCase() === nome.toLowerCase());
  if (igual) return igual;
  const classificacao = ["FIXA", "VARIAVEL", "OUTRA"].includes(String(b.classificacao)) ? String(b.classificacao) : tipo === "Receita" ? "OUTRA" : "VARIAVEL";
  try {
    return await storage.createEmpresaConta({
      empresa_id: empresaId, nome, tipo, classificacao,
      parent_id: b.parent_id ? Number(b.parent_id) : null,
      grupo_gerencial: b.grupo_gerencial || null,
    } as any);
  } catch (e: any) {
    if (e?.status === 400) throw new ErroErp(e.message);
    throw e;
  }
}

// ----------------------------------------------------------------------------
// Contas a receber
// ----------------------------------------------------------------------------

export async function listarReceber(empresaId: number, f: { status?: string; de?: string; ate?: string; contato_id?: number | null }) {
  const status = f.status === "recebido" ? "Efetivada" : f.status === "todos" ? "" : "Pendente";
  const iso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const linhas = (await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.status, t.data_transacao, t.data_vencimento, t.data_pagamento,
           t.parcela_num, t.parcela_total, t.conta_bancaria_id, t.contato_id, t.centro_custo_id, t.categoria_id,
           ec.codigo AS conta_codigo, ec.nome AS conta_nome, c.nome AS contato_nome, cc.nome AS centro_nome,
           COALESCE(cb.nome, cb.banco) AS conta_bancaria_nome
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas ec ON ec.id = t.categoria_id
    LEFT JOIN empresas_contatos c ON c.id = t.contato_id
    LEFT JOIN empresas_centros_custo cc ON cc.id = t.centro_custo_id
    LEFT JOIN contas_bancarias cb ON cb.id = t.conta_bancaria_id
    WHERE t.empresa_id = ${empresaId}
      AND t.tipo = 'Receita'
      AND COALESCE(t.reembolso_pessoal, false) = false
      AND (${status} = '' OR t.status = ${status})
      AND (${iso(f.de)}::date IS NULL OR COALESCE(t.data_vencimento, t.data_transacao) >= ${iso(f.de)}::date)
      AND (${iso(f.ate)}::date IS NULL OR COALESCE(t.data_vencimento, t.data_transacao) <= ${iso(f.ate)}::date)
      AND (${f.contato_id ?? null}::int IS NULL OR t.contato_id = ${f.contato_id ?? null})
    ORDER BY COALESCE(t.data_vencimento, t.data_transacao) ASC, t.id
    LIMIT 1000
  `)) as any[];
  const hoje = hojeSP();
  const em7 = somarDias(hoje, 7);
  const resumo = { total_aberto: 0, vencido: 0, vence_7_dias: 0, recebido_periodo: 0 };
  for (const l of linhas) {
    const v = Number(l.valor);
    const venc = String(l.data_vencimento || l.data_transacao).slice(0, 10);
    if (l.status === "Pendente") {
      resumo.total_aberto += v;
      if (venc < hoje) resumo.vencido += v;
      else if (venc <= em7) resumo.vence_7_dias += v;
    } else resumo.recebido_periodo += v;
  }
  for (const k of Object.keys(resumo) as (keyof typeof resumo)[]) resumo[k] = Math.round(resumo[k] * 100) / 100;
  return { linhas, resumo, hoje };
}

export async function criarReceber(empresaId: number, b: any) {
  const descricao = texto(b.descricao, 255);
  if (!descricao) throw new ErroErp("Informe a descrição.");
  const valorTotal = Number(String(b.valor ?? "").replace(",", "."));
  if (!(valorTotal > 0) || valorTotal > 99_999_999) throw new ErroErp("Informe um valor válido.");
  const venc = String(b.data_vencimento || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) throw new ErroErp("Informe a data de vencimento.");
  const parcelas = Math.min(60, Math.max(1, Math.trunc(Number(b.parcelas) || 1)));
  const v = await validarVinculos(empresaId, b);
  if (!v.categoria_id) throw new ErroErp("Escolha a conta de receita do plano de contas.");
  const conta = (await db.execute(sql`SELECT tipo FROM empresas_contas WHERE id = ${v.categoria_id}`)) as any[];
  if (conta[0]?.tipo !== "Receita") throw new ErroErp("A conta escolhida precisa ser de receita.");
  const competencia = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_competencia || "")) ? String(b.data_competencia) : hojeSP();

  const valores = dividirParcelas(valorTotal, parcelas);
  const grupo = parcelas > 1 ? `rec-${Date.now().toString(36)}` : null;
  return db.transaction(async (tx: any) => {
    const criados: any[] = [];
    for (let i = 0; i < parcelas; i++) {
      const valor = valores[i];
      const vencParcela = vencimentoDaParcela(venc, i);
      const r = (await tx.execute(sql`
        INSERT INTO empresas_transacoes
          (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, data_vencimento, status, origem,
           movimenta_caixa, conta_bancaria_id, contato_id, centro_custo_id, compra_grupo, parcela_num, parcela_total)
        VALUES (${empresaId}, ${v.categoria_id}, ${parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao},
                ${valor.toFixed(2)}, 'Receita', ${competencia}, ${vencParcela}, 'Pendente', 'manual',
                false, ${v.conta_bancaria_id}, ${v.contato_id}, ${v.centro_custo_id}, ${grupo},
                ${parcelas > 1 ? i + 1 : null}, ${parcelas > 1 ? parcelas : null})
        RETURNING id, descricao, valor, data_vencimento
      `)) as any[];
      criados.push(r[0]);
    }
    return { criados };
  });
}

/** Divide o total em N parcelas; o arredondamento fica na última (soma sempre bate). */
export function dividirParcelas(total: number, n: number): number[] {
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base));
}

/** Vencimento da parcela i (0 = primeira): mesmo dia nos meses seguintes, ou o último dia do mês. */
export function vencimentoDaParcela(primeiro: string, i: number): string {
  const [a, m, d] = primeiro.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + i, 1));
  const ultimoDia = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, ultimoDia));
  return dt.toISOString().slice(0, 10);
}

/** Recebimento (baixa): define a conta bancária que recebeu e marca como efetivada. */
export async function receber(empresaId: number, usuarioId: number, transacaoId: number, b: any) {
  const v = await validarVinculos(empresaId, { conta_bancaria_id: b.conta_bancaria_id });
  if (!v.conta_bancaria_id) throw new ErroErp("Escolha a conta bancária que recebeu.");
  const t = (await db.execute(sql`
    SELECT id, tipo, status FROM empresas_transacoes WHERE id = ${transacaoId} AND empresa_id = ${empresaId} LIMIT 1
  `)) as any[];
  if (!t[0]) throw new ErroErp("Lançamento não encontrado", 404);
  if (t[0].tipo !== "Receita") throw new ErroErp("Este lançamento não é uma conta a receber.");
  if (t[0].status !== "Pendente") throw new ErroErp("Este lançamento já foi recebido.", 409);
  await db.execute(sql`UPDATE empresas_transacoes SET conta_bancaria_id = ${v.conta_bancaria_id} WHERE id = ${transacaoId}`);
  const r = await baixarTransacaoEmpresa(empresaId, transacaoId, usuarioId, b.data_pagamento || hojeSP());
  if (!r.ok) throw new ErroErp(r.error || "Não foi possível dar baixa.", r.status || 400);
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Transferências entre contas (não são receita nem despesa)
// ----------------------------------------------------------------------------

export async function listarTransferencias(empresaId: number, f: { de?: string; ate?: string } = {}) {
  const iso = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  return (await db.execute(sql`
    SELECT t.*, COALESCE(o.nome, o.banco) AS origem_nome, COALESCE(d.nome, d.banco) AS destino_nome
    FROM transferencias_bancarias t
    JOIN contas_bancarias o ON o.id = t.conta_origem_id
    JOIN contas_bancarias d ON d.id = t.conta_destino_id
    WHERE t.empresa_id = ${empresaId}
      AND (${iso(f.de)}::date IS NULL OR t.data >= ${iso(f.de)}::date)
      AND (${iso(f.ate)}::date IS NULL OR t.data <= ${iso(f.ate)}::date)
    ORDER BY t.data DESC, t.id DESC
    LIMIT 500
  `)) as any[];
}

export async function criarTransferencia(empresaId: number, usuarioId: number, b: any, tx: any = db) {
  const origem = await validarVinculos(empresaId, { conta_bancaria_id: b.conta_origem_id });
  const destino = await validarVinculos(empresaId, { conta_bancaria_id: b.conta_destino_id });
  if (!origem.conta_bancaria_id || !destino.conta_bancaria_id) throw new ErroErp("Escolha as contas de origem e destino.");
  if (origem.conta_bancaria_id === destino.conta_bancaria_id) throw new ErroErp("Origem e destino precisam ser contas diferentes.");
  const valor = Number(String(b.valor ?? "").replace(",", "."));
  if (!(valor > 0) || valor > 99_999_999) throw new ErroErp("Informe um valor válido.");
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data || "")) ? String(b.data) : hojeSP();
  const r = (await tx.execute(sql`
    INSERT INTO transferencias_bancarias
      (usuario_id, empresa_id, conta_origem_id, conta_destino_id, valor, data, descricao, chave_origem, chave_destino)
    VALUES (${usuarioId}, ${empresaId}, ${origem.conta_bancaria_id}, ${destino.conta_bancaria_id}, ${valor.toFixed(2)}, ${data},
            ${texto(b.descricao, 255)}, ${b.chave_origem ?? null}, ${b.chave_destino ?? null})
    RETURNING *
  `)) as any[];
  return r[0];
}

export async function removerTransferencia(empresaId: number, id: number) {
  const r = (await db.execute(sql`DELETE FROM transferencias_bancarias WHERE id = ${id} AND empresa_id = ${empresaId} RETURNING id`)) as any[];
  if (!r[0]) throw new ErroErp("Transferência não encontrada", 404);
  return { removida: true };
}

// ----------------------------------------------------------------------------
// DRE gerencial
// ----------------------------------------------------------------------------

export type Regime = "caixa" | "competencia";

function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  while ((a < a2 || (a === a2 && m <= m2)) && out.length < 36) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return out;
}

/**
 * DRE por conta do plano × mês.
 *  - caixa: só o que se moveu (Efetivada), na data do pagamento/recebimento
 *    (compra no cartão entra na data da compra; o pagamento da fatura não conta);
 *  - competência: efetivados + em aberto, na data de competência do lançamento.
 */
export async function dreGerencial(empresaId: number, f: { de?: string; ate?: string; regime?: string; centro_custo_id?: number | null }) {
  const hoje = hojeSP();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(f.de)) ? String(f.de) : `${hoje.slice(0, 4)}-01-01`;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(f.ate)) ? String(f.ate) : hoje;
  if (de > ate) throw new ErroErp("Período inválido.");
  const regime: Regime = f.regime === "competencia" ? "competencia" : "caixa";
  const dataRef = regime === "caixa"
    ? sql`CASE WHEN t.fatura_id IS NOT NULL THEN t.data_transacao ELSE COALESCE(t.data_pagamento, t.data_transacao) END`
    : sql`t.data_transacao`;
  const filtroStatus = regime === "caixa" ? sql`t.status = 'Efetivada'` : sql`t.status IN ('Efetivada', 'Pendente')`;
  const centro = f.centro_custo_id ? Number(f.centro_custo_id) : null;

  const rows = (await db.execute(sql`
    SELECT c.id AS conta_id, c.codigo, c.nome, c.tipo, c.classificacao, c.grupo_gerencial, c.is_cmv,
           to_char(${dataRef}, 'YYYY-MM') AS mes, SUM(t.valor::numeric) AS total
    FROM empresas_transacoes t
    JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.empresa_id = ${empresaId}
      AND ${filtroStatus}
      AND ${dataRef} BETWEEN ${de}::date AND ${ate}::date
      AND NOT (COALESCE(t.reembolso_pessoal, false) = true AND t.status = 'Pendente')
      AND NOT EXISTS (SELECT 1 FROM empresas_faturas f WHERE f.transacao_pagamento_id = t.id)
      AND (${centro}::int IS NULL OR t.centro_custo_id = ${centro})
    GROUP BY c.id, c.codigo, c.nome, c.tipo, c.classificacao, c.grupo_gerencial, c.is_cmv, mes
  `)) as any[];

  const meses = mesesEntre(de, ate);
  const porConta = new Map<number, any>();
  for (const r of rows) {
    const id = Number(r.conta_id);
    if (!porConta.has(id)) {
      const grupo =
        r.tipo === "Receita" ? "receita"
        : r.is_cmv || r.classificacao === "VARIAVEL" || r.grupo_gerencial === "custo_variavel" ? "variavel"
        : r.classificacao === "FIXA" || r.grupo_gerencial === "despesa_fixa" ? "fixa"
        : "outras";
      porConta.set(id, { conta_id: id, codigo: r.codigo, nome: r.nome, tipo: r.tipo, grupo, valores: {} as Record<string, number>, total: 0 });
    }
    const c = porConta.get(id);
    const v = Math.round(Number(r.total) * 100) / 100;
    c.valores[r.mes] = (c.valores[r.mes] || 0) + v;
    c.total = Math.round((c.total + v) * 100) / 100;
  }
  const linhas = [...porConta.values()].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }));

  const soma = (grupo: string, mes?: string) =>
    Math.round(linhas.filter((l) => l.grupo === grupo).reduce((s, l) => s + (mes ? l.valores[mes] || 0 : l.total), 0) * 100) / 100;
  const calc = (mes?: string) => {
    const receita = soma("receita", mes);
    const variavel = soma("variavel", mes);
    const fixa = soma("fixa", mes);
    const outras = soma("outras", mes);
    const margem = Math.round((receita - variavel) * 100) / 100;
    const resultado = Math.round((margem - fixa - outras) * 100) / 100;
    return { receita, variavel, margem, fixa, outras, resultado, margem_pct: receita ? (margem / receita) * 100 : null, resultado_pct: receita ? (resultado / receita) * 100 : null };
  };
  const porMes: Record<string, ReturnType<typeof calc>> = {};
  for (const m of meses) porMes[m] = calc(m);
  return { periodo: { de, ate }, regime, centro_custo_id: centro, meses, linhas, totais: calc(), por_mes: porMes };
}

/** CSV (separador ";", decimal ",") para abrir direto no Excel em português. */
export function dreParaCsv(d: Awaited<ReturnType<typeof dreGerencial>>): string {
  const num = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
  const cab = ["Código", "Conta", ...d.meses, "Total"];
  const linhas: string[][] = [cab];
  const grupos: [string, string, keyof (typeof d)["totais"]][] = [
    ["(+) Receitas", "receita", "receita"],
    ["(−) Custos e despesas variáveis", "variavel", "variavel"],
    ["(−) Despesas fixas", "fixa", "fixa"],
    ["(−) Outras despesas", "outras", "outras"],
  ];
  for (const [titulo, grupo, chave] of grupos) {
    linhas.push(["", titulo, ...d.meses.map((m) => num(Number(d.por_mes[m][chave]))), num(Number(d.totais[chave]))]);
    for (const l of d.linhas.filter((x) => x.grupo === grupo)) {
      linhas.push([l.codigo, l.nome, ...d.meses.map((m) => num(l.valores[m] || 0)), num(l.total)]);
    }
    if (grupo === "variavel") {
      linhas.push(["", "(=) Margem de contribuição", ...d.meses.map((m) => num(d.por_mes[m].margem)), num(d.totais.margem)]);
    }
  }
  linhas.push(["", "(=) Resultado", ...d.meses.map((m) => num(d.por_mes[m].resultado)), num(d.totais.resultado)]);
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + linhas.map((l) => l.map((c) => esc(String(c))).join(";")).join("\r\n");
}
