"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
/**
 * Migration: add_contas_pagar_fields
 * Adiciona campos para contas a pagar e fluxo de caixa na tabela transacoes.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
async function runMigration() {
    console.log("Migration: add_contas_pagar_fields — iniciando...");
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS data_vencimento DATE`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS data_pagamento DATE`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT false`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS classificacao_despesa VARCHAR(20)`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_transacoes_vencimento ON transacoes(data_vencimento) WHERE status = 'Pendente'`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_transacoes_recorrente ON transacoes(carteira_id, recorrente) WHERE recorrente = true`);
    console.log("✓ Campos contas a pagar adicionados em transacoes");
    console.log("Migration: add_contas_pagar_fields — concluída.");
}
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
