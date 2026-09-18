/**
 * Mensalidades — recorrências mensais (assinaturas / contas fixas).
 * Cada mês, o job gera:
 *  - tipo_meio 'boleto' → uma conta a pagar (status Pendente, com data_vencimento);
 *  - tipo_meio 'cartao' → um lançamento na fatura do cartão (Efetivada, sem caixa).
 * empresa_id NULL = PF (usa carteira_id); empresa_id preenchido = PJ.
 * Idempotente por mês via coluna ultima_competencia_gerada ('YYYY-MM').
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

export type TipoMeioMensalidade = "boleto" | "cartao";

export type MensalidadeInput = {
  usuario_id: number;
  empresa_id: number | null; // null = PF
  carteira_id: number | null; // obrigatório no PF
  descricao: string;
  valor: number;
  dia_vencimento: number;
  tipo_meio: TipoMeioMensalidade;
  categoria_id: number | null;
  conta_bancaria_id: number | null;
  forma_pagamento_id: number | null; // cartão PF
  cartao_id: number | null; // cartão PJ
  data_inicio?: string | null;
  data_fim?: string | null;
  origem?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function compAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function ultimoDiaMes(ano: number, mes0: number): number {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

/** Data de vencimento (YYYY-MM-DD) de uma competência, com o dia limitado ao mês. */
function dataVencimentoDaComp(comp: string, dia: number): string {
  const [ano, mes1] = comp.split("-").map(Number);
  const mes0 = (mes1 || 1) - 1;
  const d = Math.min(Math.max(1, Math.floor(dia) || 1), ultimoDiaMes(ano, mes0));
  return `${ano}-${pad2(mes0 + 1)}-${pad2(d)}`;
}

/** Categoria/conta de Despesa padrão quando a mensalidade não define uma (campo é NOT NULL). */
async function categoriaPadrao(m: any): Promise<number | null> {
  if (m.empresa_id != null) {
    const r = await db.execute(sql`
      SELECT id FROM empresas_contas
      WHERE empresa_id = ${Number(m.empresa_id)} AND tipo = 'Despesa'
      ORDER BY id LIMIT 1
    `);
    const row = (r as any[])[0];
    return row ? Number(row.id) : null;
  }
  const r = await db.execute(sql`
    SELECT id FROM categorias
    WHERE (usuario_id = ${Number(m.usuario_id)} OR global = true) AND tipo = 'Despesa'
    ORDER BY (lower(nome) LIKE 'outros%') DESC, usuario_id NULLS LAST, id
    LIMIT 1
  `);
  const row = (r as any[])[0];
  return row ? Number(row.id) : null;
}

export async function carteiraDoUsuario(usuarioId: number): Promise<number | null> {
  const r = await db.execute(sql`SELECT id FROM carteiras WHERE usuario_id = ${usuarioId} ORDER BY id LIMIT 1`);
  const row = (r as any[])[0];
  return row ? Number(row.id) : null;
}

export async function listarMensalidades(
  usuarioId: number,
  empresaId: number | null,
): Promise<any[]> {
  const rows =
    empresaId == null
      ? await db.execute(sql`
          SELECT * FROM mensalidades
          WHERE usuario_id = ${usuarioId} AND empresa_id IS NULL
          ORDER BY ativo DESC, dia_vencimento ASC, id DESC
        `)
      : await db.execute(sql`
          SELECT * FROM mensalidades
          WHERE usuario_id = ${usuarioId} AND empresa_id = ${empresaId}
          ORDER BY ativo DESC, dia_vencimento ASC, id DESC
        `);
  return rows as any[];
}

export async function criarMensalidade(input: MensalidadeInput): Promise<any> {
  const r = await db.execute(sql`
    INSERT INTO mensalidades
      (usuario_id, empresa_id, carteira_id, descricao, valor, dia_vencimento, tipo_meio,
       categoria_id, conta_bancaria_id, forma_pagamento_id, cartao_id, data_inicio, data_fim, origem)
    VALUES
      (${input.usuario_id}, ${input.empresa_id}, ${input.carteira_id}, ${input.descricao},
       ${input.valor}, ${input.dia_vencimento}, ${input.tipo_meio}, ${input.categoria_id},
       ${input.conta_bancaria_id}, ${input.forma_pagamento_id}, ${input.cartao_id},
       ${input.data_inicio ?? null}, ${input.data_fim ?? null}, ${input.origem || "app"})
    RETURNING *
  `);
  return (r as any[])[0];
}

export async function atualizarMensalidade(
  id: number,
  usuarioId: number,
  patch: Partial<MensalidadeInput> & { ativo?: boolean },
): Promise<any | null> {
  const sets: any[] = [];
  const push = (frag: any) => sets.push(frag);
  if (patch.descricao !== undefined) push(sql`descricao = ${patch.descricao}`);
  if (patch.valor !== undefined) push(sql`valor = ${patch.valor}`);
  if (patch.dia_vencimento !== undefined) push(sql`dia_vencimento = ${patch.dia_vencimento}`);
  if (patch.tipo_meio !== undefined) push(sql`tipo_meio = ${patch.tipo_meio}`);
  if (patch.categoria_id !== undefined) push(sql`categoria_id = ${patch.categoria_id}`);
  if (patch.conta_bancaria_id !== undefined) push(sql`conta_bancaria_id = ${patch.conta_bancaria_id}`);
  if (patch.forma_pagamento_id !== undefined) push(sql`forma_pagamento_id = ${patch.forma_pagamento_id}`);
  if (patch.cartao_id !== undefined) push(sql`cartao_id = ${patch.cartao_id}`);
  if (patch.data_fim !== undefined) push(sql`data_fim = ${patch.data_fim}`);
  if (patch.ativo !== undefined) push(sql`ativo = ${patch.ativo}`);
  if (!sets.length) {
    const r = await db.execute(sql`SELECT * FROM mensalidades WHERE id = ${id} AND usuario_id = ${usuarioId}`);
    return (r as any[])[0] || null;
  }
  const r = await db.execute(sql`
    UPDATE mensalidades SET ${sql.join(sets, sql`, `)}
    WHERE id = ${id} AND usuario_id = ${usuarioId}
    RETURNING *
  `);
  return (r as any[])[0] || null;
}

export async function excluirMensalidade(id: number, usuarioId: number): Promise<boolean> {
  const r = await db.execute(sql`
    DELETE FROM mensalidades WHERE id = ${id} AND usuario_id = ${usuarioId} RETURNING id
  `);
  return (r as any[]).length > 0;
}

/** Gera o lançamento de UMA mensalidade para uma competência e marca como gerada. */
export async function gerarMensalidade(m: any, comp: string): Promise<number | null> {
  const dueDate = dataVencimentoDaComp(comp, Number(m.dia_vencimento) || 1);
  const valor = Number(m.valor) || 0;
  const ehPj = m.empresa_id != null;

  // categoria_id é NOT NULL nas tabelas de transação — resolve um padrão se faltar.
  const categoriaId = m.categoria_id != null ? Number(m.categoria_id) : await categoriaPadrao(m);
  if (!categoriaId) {
    throw new Error("Sem categoria/plano de contas de Despesa para lançar a mensalidade.");
  }
  m = { ...m, categoria_id: categoriaId };

  let transacaoId: number | null = null;

  if (!ehPj) {
    // ----- PF -----
    const carteiraId = Number(m.carteira_id);
    if (!carteiraId) return null;
    if (m.tipo_meio === "cartao") {
      const { aplicarMeioPagamentoPf } = await import("./meio-pagamento-pf");
      const meio = await aplicarMeioPagamentoPf({
        userId: m.usuario_id,
        walletId: carteiraId,
        tipo: "Despesa",
        dataISO: dueDate,
        forma_pagamento_id: m.forma_pagamento_id ?? null,
        statusAtual: "Efetivada",
      });
      const criada = await storage.createTransaction({
        carteira_id: carteiraId,
        categoria_id: m.categoria_id,
        descricao: m.descricao,
        valor,
        tipo: "Despesa",
        data_transacao: dueDate,
        status: meio.status || "Efetivada",
        recorrente: true,
        classificacao_despesa: "fixa",
        forma_pagamento_id: meio.forma_pagamento_id,
        conta_bancaria_id: meio.conta_bancaria_id,
        fatura_id: meio.fatura_id,
        competencia: meio.competencia,
        movimenta_caixa: meio.movimenta_caixa,
      } as any);
      transacaoId = criada.id;
    } else {
      // boleto = conta a pagar (Pendente, com vencimento)
      const criada = await storage.createTransaction({
        carteira_id: carteiraId,
        categoria_id: m.categoria_id,
        descricao: m.descricao,
        valor,
        tipo: "Despesa",
        data_transacao: dueDate,
        data_vencimento: dueDate,
        status: "Pendente",
        recorrente: true,
        classificacao_despesa: "fixa",
        conta_bancaria_id: m.conta_bancaria_id ?? null,
      } as any);
      transacaoId = criada.id;
    }
  } else {
    // ----- PJ -----
    const empresaId = Number(m.empresa_id);
    if (m.tipo_meio === "cartao") {
      const { aplicarMeioPagamentoPj } = await import("./meio-pagamento-pj");
      const meio = await aplicarMeioPagamentoPj({
        userId: m.usuario_id,
        empresaId,
        tipo: "Despesa",
        dataISO: dueDate,
        cartao_id: m.cartao_id ?? null,
        conta_bancaria_id: null,
        exigirMeio: true,
        statusAtual: "Efetivada",
      });
      const criada = await storage.createEmpresaTransacao({
        empresa_id: empresaId,
        categoria_id: m.categoria_id,
        descricao: m.descricao,
        valor,
        tipo: "Despesa",
        data_transacao: dueDate,
        status: "Efetivada",
        origem: "mensalidade",
        cartao_id: meio.cartao_id,
        conta_bancaria_id: meio.conta_bancaria_id,
        fatura_id: meio.fatura_id,
        competencia: meio.competencia,
        movimenta_caixa: meio.movimenta_caixa,
        empresa_forma_pagamento_id: null,
        metodo_pagamento: meio.metodo_pagamento,
      } as any);
      transacaoId = criada.id;
    } else {
      // boleto PJ = conta a pagar (Pendente)
      const criada = await storage.createEmpresaTransacao({
        empresa_id: empresaId,
        categoria_id: m.categoria_id,
        descricao: m.descricao,
        valor,
        tipo: "Despesa",
        data_transacao: dueDate,
        data_vencimento: dueDate,
        status: "Pendente",
        origem: "mensalidade",
        conta_bancaria_id: m.conta_bancaria_id ?? null,
        movimenta_caixa: false,
        empresa_forma_pagamento_id: null,
      } as any);
      transacaoId = criada.id;
    }
  }

  await db.execute(sql`UPDATE mensalidades SET ultima_competencia_gerada = ${comp} WHERE id = ${m.id}`);
  return transacaoId;
}

/**
 * Gera todas as mensalidades ativas ainda não geradas para o mês atual.
 * Chamado pelo job (diário) e opcionalmente logo após criar uma mensalidade.
 */
export async function gerarMensalidadesPendentes(): Promise<{ geradas: number; erros: number }> {
  const comp = compAtual();
  const hojeISO = new Date().toISOString().slice(0, 10);
  const fimComp = dataVencimentoDaComp(comp, 31); // último dia do mês
  const rows = await db.execute(sql`
    SELECT * FROM mensalidades
    WHERE ativo = true
      AND (data_inicio IS NULL OR data_inicio <= ${fimComp})
      AND (data_fim IS NULL OR data_fim >= ${hojeISO})
      AND (ultima_competencia_gerada IS NULL OR ultima_competencia_gerada < ${comp})
  `);
  let geradas = 0;
  let erros = 0;
  for (const m of rows as any[]) {
    try {
      await gerarMensalidade(m, comp);
      geradas++;
    } catch (e: any) {
      erros++;
      console.error(`[Mensalidades] Falha ao gerar #${m.id} (${m.descricao}):`, e?.message || e);
    }
  }
  if (geradas || erros) {
    console.log(`[Mensalidades] Competência ${comp}: ${geradas} geradas, ${erros} erros.`);
  }
  return { geradas, erros };
}

/** Gera a competência atual de UMA mensalidade recém-criada, se ainda não gerada. */
export async function gerarMensalidadeSeDevido(id: number): Promise<number | null> {
  const comp = compAtual();
  const r = await db.execute(sql`
    SELECT * FROM mensalidades
    WHERE id = ${id} AND ativo = true
      AND (ultima_competencia_gerada IS NULL OR ultima_competencia_gerada < ${comp})
  `);
  const m = (r as any[])[0];
  if (!m) return null;
  try {
    return await gerarMensalidade(m, comp);
  } catch (e: any) {
    console.error(`[Mensalidades] Falha ao gerar imediata #${id}:`, e?.message || e);
    return null;
  }
}
