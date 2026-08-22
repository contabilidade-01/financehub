/**
 * Fatura de cartão PJ — competência × caixa.
 *
 * Compras no cartão entram como COMPETÊNCIA (movimenta_caixa=false) e são
 * agrupadas numa fatura por competência. Só o PAGAMENTO da fatura gera a saída
 * de CAIXA (movimenta_caixa=true), que aparece no Fluxo de Caixa.
 *
 * Usa SQL cru (padrão do repo para o PJ/conciliação). Tabelas criadas no
 * auto-migrate: empresas_cartoes, empresas_faturas + colunas em empresas_transacoes.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

const num = (v: any) => (v == null ? 0 : parseFloat(v) || 0);
const pad2 = (n: number) => String(n).padStart(2, "0");

// A qual fatura (competência) uma compra pertence, dado o dia de fechamento.
export function competenciaDaCompra(dataISO: string, diaFech: number, diaVenc: number) {
  const d = new Date(String(dataISO).slice(0, 10) + "T00:00:00");
  let ano = d.getFullYear();
  let mes = d.getMonth(); // 0-11
  if (d.getDate() > diaFech) { mes += 1; if (mes > 11) { mes = 0; ano += 1; } }
  const competencia = `${ano}-${pad2(mes + 1)}`;
  const dataFech = `${ano}-${pad2(mes + 1)}-${pad2(Math.min(diaFech, 28))}`;
  let vMes = mes, vAno = ano;
  if (diaVenc < diaFech) { vMes += 1; if (vMes > 11) { vMes = 0; vAno += 1; } }
  const dataVenc = `${vAno}-${pad2(vMes + 1)}-${pad2(Math.min(diaVenc, 28))}`;
  return { competencia, dataFech, dataVenc };
}

// Valida que o cartão pertence a uma empresa do usuário. Retorna o cartão + empresa_id.
export async function cartaoDoUsuario(cartaoId: number, userId: number): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT c.*, e.usuario_id
    FROM empresas_cartoes c
    JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = ${cartaoId} AND e.usuario_id = ${userId}
    LIMIT 1
  `);
  return (r as any[])[0] || null;
}

export async function empresaDoUsuario(empresaId: number, userId: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM empresas WHERE id = ${empresaId} AND usuario_id = ${userId} LIMIT 1`);
  return (r as any[]).length > 0;
}

export async function listarCartoes(empresaId: number): Promise<any[]> {
  const r = await db.execute(sql`SELECT * FROM empresas_cartoes WHERE empresa_id = ${empresaId} ORDER BY ativo DESC, nome`);
  return r as any[];
}

export async function criarCartao(empresaId: number, b: any): Promise<any> {
  const r = await db.execute(sql`
    INSERT INTO empresas_cartoes (empresa_id, nome, bandeira, limite, dia_fechamento, dia_vencimento, ativo)
    VALUES (${empresaId}, ${b.nome}, ${b.bandeira ?? null}, ${b.limite ?? null}, ${b.dia_fechamento}, ${b.dia_vencimento}, true)
    RETURNING *
  `);
  return (r as any[])[0];
}

export async function excluirCartao(cartaoId: number): Promise<void> {
  await db.execute(sql`DELETE FROM empresas_cartoes WHERE id = ${cartaoId}`);
}

async function getOrCreateFatura(empresaId: number, cartaoId: number, competencia: string, dataFech: string, dataVenc: string): Promise<any> {
  const existente = await db.execute(sql`SELECT * FROM empresas_faturas WHERE cartao_id = ${cartaoId} AND competencia = ${competencia} LIMIT 1`);
  if ((existente as any[])[0]) return (existente as any[])[0];
  const r = await db.execute(sql`
    INSERT INTO empresas_faturas (empresa_id, cartao_id, competencia, data_fechamento, data_vencimento, status)
    VALUES (${empresaId}, ${cartaoId}, ${competencia}, ${dataFech}, ${dataVenc}, 'aberta')
    ON CONFLICT (cartao_id, competencia) DO UPDATE SET competencia = EXCLUDED.competencia
    RETURNING *
  `);
  return (r as any[])[0];
}

// Registra uma compra no cartão (competência, não mexe no caixa).
export async function registrarCompra(empresaId: number, cartao: any, b: any): Promise<any> {
  const dataISO = String(b.data_transacao).slice(0, 10);
  const { competencia, dataFech, dataVenc } = competenciaDaCompra(dataISO, cartao.dia_fechamento, cartao.dia_vencimento);
  const fatura = await getOrCreateFatura(empresaId, cartao.id, competencia, dataFech, dataVenc);
  const valor = Number(b.valor).toFixed(2);
  const r = await db.execute(sql`
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, movimenta_caixa, cartao_id, fatura_id, competencia)
    VALUES
      (${empresaId}, ${Number(b.categoria_id)}, ${b.descricao}, ${valor}, 'Despesa', ${dataISO}, 'Efetivada', 'manual', false, ${cartao.id}, ${fatura.id}, ${competencia})
    RETURNING *
  `);
  return { compra: (r as any[])[0], fatura };
}

export async function getFaturaTotal(faturaId: number): Promise<number> {
  // Só as compras (competência); o pagamento não entra no total da fatura.
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(valor::numeric), 0) AS total
    FROM empresas_transacoes
    WHERE fatura_id = ${faturaId} AND COALESCE(movimenta_caixa, true) = false
  `);
  return num((r as any[])[0]?.total);
}

export async function listarFaturas(cartaoId: number): Promise<any[]> {
  const faturas = await db.execute(sql`SELECT * FROM empresas_faturas WHERE cartao_id = ${cartaoId} ORDER BY competencia DESC`);
  const out = [];
  for (const f of faturas as any[]) out.push({ ...f, total: await getFaturaTotal(f.id) });
  return out;
}

export async function getFaturaById(faturaId: number): Promise<any | null> {
  const r = await db.execute(sql`SELECT * FROM empresas_faturas WHERE id = ${faturaId} LIMIT 1`);
  return (r as any[])[0] || null;
}

export async function detalheFatura(faturaId: number): Promise<any> {
  const fatura = await getFaturaById(faturaId);
  if (!fatura) return null;
  const compras = await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.categoria_id, c.nome AS categoria_nome, c.codigo AS categoria_codigo
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.fatura_id = ${faturaId}
    ORDER BY t.data_transacao
  `);
  return { fatura, compras: compras as any[], total: await getFaturaTotal(faturaId) };
}

export async function fecharFatura(faturaId: number): Promise<any> {
  const r = await db.execute(sql`UPDATE empresas_faturas SET status = 'fechada' WHERE id = ${faturaId} AND status <> 'paga' RETURNING *`);
  return (r as any[])[0];
}

// Paga a fatura: cria UMA saída de caixa (movimenta_caixa=true) e marca como paga.
export async function pagarFatura(
  empresaId: number,
  fatura: any,
  cartao: any,
  opts: { conta_contabil_id: number; conta_bancaria_id?: number | null; data_pagamento?: string },
): Promise<any> {
  const total = await getFaturaTotal(fatura.id);
  if (total <= 0) throw new Error("Fatura sem valor a pagar");
  const dataPg = opts.data_pagamento && /^\d{4}-\d{2}-\d{2}/.test(opts.data_pagamento) ? opts.data_pagamento.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const descricao = `Pagamento fatura ${cartao.nome} ${fatura.competencia}`;
  // NÃO leva fatura_id (senão entraria no total da fatura). O vínculo é via
  // empresas_faturas.transacao_pagamento_id.
  const r = await db.execute(sql`
    INSERT INTO empresas_transacoes
      (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, origem, movimenta_caixa, conta_bancaria_id, cartao_id)
    VALUES
      (${empresaId}, ${opts.conta_contabil_id}, ${descricao}, ${total.toFixed(2)}, 'Despesa', ${dataPg}, 'Efetivada', 'manual', true, ${opts.conta_bancaria_id ?? null}, ${cartao.id})
    RETURNING id
  `);
  const txId = (r as any[])[0]?.id;
  const upd = await db.execute(sql`
    UPDATE empresas_faturas SET status = 'paga', transacao_pagamento_id = ${txId}, data_pagamento = NOW()
    WHERE id = ${fatura.id} RETURNING *
  `);
  return { fatura: (upd as any[])[0], transacao_id: txId, total };
}
