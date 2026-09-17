"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarFormas = listarFormas;
exports.desativarFormasSoltasPj = desativarFormasSoltasPj;
exports.desativarFormasBoleto = desativarFormasBoleto;
exports.garantirFormasPadrao = garantirFormasPadrao;
exports.criarForma = criarForma;
exports.atualizarForma = atualizarForma;
exports.excluirForma = excluirForma;
exports.getFormaById = getFormaById;
/**
 * Formas de pagamento PJ — legado desativado.
 * Meio válido = Conta bancária | Cartão (empresas_cartoes) | Caixinha.
 * PIX/boleto/débito/TED/dinheiro soltos NÃO são meio e não se criam mais.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
async function listarFormas(empresaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM empresas_formas_pagamento
    WHERE empresa_id = ${empresaId}
    ORDER BY ativo DESC, nome
  `);
    return r;
}
/** Soft-desativa TODAS as formas soltas da empresa (não apaga — histórico). */
async function desativarFormasSoltasPj(empresaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE empresas_formas_pagamento
    SET ativo = false
    WHERE empresa_id = ${empresaId}
      AND ativo = true
    RETURNING id
  `);
    return r.length;
}
/** Soft-desativa Boleto legado. */
async function desativarFormasBoleto(empresaId) {
    await db_1.db.execute((0, drizzle_orm_1.sql) `
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
async function garantirFormasPadrao(empresaId) {
    return listarFormas(empresaId);
}
const MSG_MEIO = "Forma solta não é mais meio de pagamento. Use Conta bancária, Caixinha (dinheiro) ou Cartão de crédito.";
/** Bloqueia criação de forma solta. */
async function criarForma(_empresaId, _b) {
    throw Object.assign(new Error(MSG_MEIO), { status: 400 });
}
async function atualizarForma(empresaId, formaId, b) {
    const atual = await getFormaById(empresaId, formaId);
    if (!atual)
        return null;
    // Só permite desativar / renomear legado — não reativar como meio.
    const nome = b.nome != null ? String(b.nome).trim() : atual.nome;
    const tipo = b.tipo != null ? b.tipo : atual.tipo;
    const ativo = false; // nunca reativa
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE empresas_formas_pagamento
    SET nome = ${nome}, tipo = ${tipo}, ativo = ${ativo}
    WHERE id = ${formaId} AND empresa_id = ${empresaId}
    RETURNING *
  `);
    return r[0] || null;
}
async function excluirForma(empresaId, formaId) {
    const usado = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT 1 FROM empresas_transacoes
    WHERE empresa_forma_pagamento_id = ${formaId} LIMIT 1
  `);
    if (usado.length > 0) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE empresas_formas_pagamento SET ativo = false
      WHERE id = ${formaId} AND empresa_id = ${empresaId}
    `);
        return true;
    }
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    DELETE FROM empresas_formas_pagamento
    WHERE id = ${formaId} AND empresa_id = ${empresaId}
    RETURNING id
  `);
    return r.length > 0;
}
async function getFormaById(empresaId, formaId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT * FROM empresas_formas_pagamento
    WHERE id = ${formaId} AND empresa_id = ${empresaId} LIMIT 1
  `);
    return r[0] || null;
}
