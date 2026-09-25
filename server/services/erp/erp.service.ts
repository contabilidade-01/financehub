/**
 * ERP PJ ME: cadastros (clientes/fornecedores, centros de custo), contas a
 * receber e DRE gerencial. As rotas exigem requireErpPj (modalidade PJ ME) e
 * a empresa do usuário logado.
 */
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { hojeSP } from "../nlp-br";

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
// Parcelas (usadas por contas a pagar/receber em titulos.service)
// ----------------------------------------------------------------------------

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

/** Regime da análise: caixa (quando o dinheiro se moveu) ou competência (quando aconteceu). */
export type Regime = "caixa" | "competencia";
