/**
 * Formas de pagamento da empresa (PIX, boleto, débito…).
 * Isoladas do PF — cartões ficam em empresas_cartoes.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

const PADRAO = [
  { nome: "PIX", tipo: "pix" },
  { nome: "Boleto", tipo: "boleto" },
  { nome: "Débito", tipo: "debito" },
  { nome: "Transferência", tipo: "transferencia" },
  { nome: "Dinheiro", tipo: "dinheiro" },
];

export async function listarFormas(empresaId: number): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT * FROM empresas_formas_pagamento
    WHERE empresa_id = ${empresaId}
    ORDER BY ativo DESC, nome
  `);
  return r as any[];
}

/** Garante as formas padrão na primeira visita (idempotente). */
export async function garantirFormasPadrao(empresaId: number): Promise<any[]> {
  const atuais = await listarFormas(empresaId);
  if (atuais.length > 0) return atuais;

  for (const f of PADRAO) {
    await db.execute(sql`
      INSERT INTO empresas_formas_pagamento (empresa_id, nome, tipo, ativo)
      VALUES (${empresaId}, ${f.nome}, ${f.tipo}, true)
      ON CONFLICT (empresa_id, nome) DO NOTHING
    `);
  }
  return listarFormas(empresaId);
}

export async function criarForma(empresaId: number, b: { nome: string; tipo?: string }): Promise<any> {
  const nome = String(b.nome || "").trim();
  if (!nome) throw new Error("Nome é obrigatório");
  const tipo = b.tipo || "outro";
  try {
    const r = await db.execute(sql`
      INSERT INTO empresas_formas_pagamento (empresa_id, nome, tipo, ativo)
      VALUES (${empresaId}, ${nome}, ${tipo}, true)
      RETURNING *
    `);
    return (r as any[])[0];
  } catch (err: any) {
    if (err?.code === "23505") throw Object.assign(new Error("Já existe uma forma com esse nome."), { status: 409 });
    throw err;
  }
}

export async function atualizarForma(empresaId: number, formaId: number, b: any): Promise<any | null> {
  const atual = await getFormaById(empresaId, formaId);
  if (!atual) return null;
  const nome = b.nome != null ? String(b.nome).trim() : atual.nome;
  const tipo = b.tipo != null ? b.tipo : atual.tipo;
  const ativo = b.ativo != null ? !!b.ativo : atual.ativo;
  const r = await db.execute(sql`
    UPDATE empresas_formas_pagamento
    SET nome = ${nome}, tipo = ${tipo}, ativo = ${ativo}
    WHERE id = ${formaId} AND empresa_id = ${empresaId}
    RETURNING *
  `);
  return (r as any[])[0] || null;
}

export async function excluirForma(empresaId: number, formaId: number): Promise<boolean> {
  // Soft: desativa se estiver em uso; hard delete se livre.
  const usado = await db.execute(sql`
    SELECT 1 FROM empresas_transacoes
    WHERE empresa_forma_pagamento_id = ${formaId} LIMIT 1
  `);
  if ((usado as any[]).length > 0) {
    await db.execute(sql`
      UPDATE empresas_formas_pagamento SET ativo = false
      WHERE id = ${formaId} AND empresa_id = ${empresaId}
    `);
    return true;
  }
  const r = await db.execute(sql`
    DELETE FROM empresas_formas_pagamento
    WHERE id = ${formaId} AND empresa_id = ${empresaId}
    RETURNING id
  `);
  return (r as any[]).length > 0;
}

export async function getFormaById(empresaId: number, formaId: number): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT * FROM empresas_formas_pagamento
    WHERE id = ${formaId} AND empresa_id = ${empresaId} LIMIT 1
  `);
  return (r as any[])[0] || null;
}
