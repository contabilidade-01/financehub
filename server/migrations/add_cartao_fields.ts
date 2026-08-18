/**
 * Migration: add_cartao_fields
 * Adiciona campos de controle de cartão de crédito em formas_pagamento.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigration() {
  console.log("Migration: add_cartao_fields — iniciando...");

  await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS limite NUMERIC(12,2)`);
  await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS dia_fechamento INTEGER`);
  await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER`);
  await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS bandeira VARCHAR(50)`);
  await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS ultimos_digitos VARCHAR(4)`);

  console.log("✓ Campos de cartão adicionados em formas_pagamento");
  console.log("Migration: add_cartao_fields — concluída.");
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
