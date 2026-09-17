"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
/**
 * Migration: add_cartao_fields
 * Adiciona campos de controle de cartão de crédito em formas_pagamento.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
async function runMigration() {
    console.log("Migration: add_cartao_fields — iniciando...");
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS limite NUMERIC(12,2)`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS dia_fechamento INTEGER`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS bandeira VARCHAR(50)`);
    await db_1.db.execute((0, drizzle_orm_1.sql) `ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS ultimos_digitos VARCHAR(4)`);
    console.log("✓ Campos de cartão adicionados em formas_pagamento");
    console.log("Migration: add_cartao_fields — concluída.");
}
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
