/**
 * Formas de pagamento PJ — legado desativado.
 * Meio válido = Conta bancária | Cartão (empresas_cartoes) | Caixinha.
 * PIX/boleto/débito/TED/dinheiro soltos NÃO são meio e não se criam mais.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function listarFormas(empresaId: number): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT * FROM empresas_formas_pagamento
    WHERE empresa_id = ${empresaId}
    ORDER BY ativo DESC, nome
  `);
  return r as any[];
}

/** Soft-desativa TODAS as formas soltas da empresa (não apaga — histórico). */
export async function desativarFormasSoltasPj(empresaId: number): Promise<number> {
  const r = await db.execute(sql`
    UPDATE empresas_formas_pagamento
    SET ativo = false
    WHERE empresa_id = ${empresaId}
      AND ativo = true
    RETURNING id
  `);
  return (r as any[]).length;
}

/** Soft-desativa Boleto legado. */
export async function desativarFormasBoleto(empresaId: number): Promise<void> {
  await db.execute(sql`
    UPDATE empresas_formas_pagamento
    SET ativo = false
    WHERE empresa_id = ${empresaId}
      AND (tipo = 'boleto' OR lower(nome) = 'boleto')
      AND ativo = true
  `);
}

/**
 * Não semeia mais PIX/Débito/etc. Só lista (desativação é da migration).
 */
export async function garantirFormasPadrao(empresaId: number): Promise<any[]> {
  return listarFormas(empresaId);
}

const MSG_MEIO =
  "Forma solta não é mais meio de pagamento. Use Conta bancária, Caixinha (dinheiro) ou Cartão de crédito.";

/** Bloqueia criação de forma solta. */
export async function criarForma(_empresaId: number, _b: { nome: string; tipo?: string }): Promise<any> {
  throw Object.assign(new Error(MSG_MEIO), { status: 400 });
}

export async function atualizarForma(empresaId: number, formaId: number, b: any): Promise<any | null> {
  const atual = await getFormaById(empresaId, formaId);
  if (!atual) return null;
  // Só permite desativar / renomear legado — não reativar como meio.
  const nome = b.nome != null ? String(b.nome).trim() : atual.nome;
  const tipo = b.tipo != null ? b.tipo : atual.tipo;
  const ativo = false; // nunca reativa
  const r = await db.execute(sql`
    UPDATE empresas_formas_pagamento
    SET nome = ${nome}, tipo = ${tipo}, ativo = ${ativo}
    WHERE id = ${formaId} AND empresa_id = ${empresaId}
    RETURNING *
  `);
  return (r as any[])[0] || null;
}

export async function excluirForma(empresaId: number, formaId: number): Promise<boolean> {
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
