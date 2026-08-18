/**
 * Migration: add_contas_pagar_fields
 * Adiciona campos para contas a pagar e fluxo de caixa na tabela transacoes.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigration() {
  console.log("Migration: add_contas_pagar_fields — iniciando...");

  await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS data_vencimento DATE`);
  await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS data_pagamento DATE`);
  await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS classificacao_despesa VARCHAR(20)`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_vencimento ON transacoes(data_vencimento) WHERE status = 'Pendente'`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_recorrente ON transacoes(carteira_id, recorrente) WHERE recorrente = true`);

  console.log("✓ Campos contas a pagar adicionados em transacoes");
  console.log("Migration: add_contas_pagar_fields — concluída.");
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
