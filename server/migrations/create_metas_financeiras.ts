/**
 * Migration: create_metas_financeiras
 * Cria tabela para metas, caixinhas, sonhos e orçamentos por categoria.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigration() {
  console.log("Migration: create_metas_financeiras — iniciando...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS metas_financeiras (
      id                SERIAL PRIMARY KEY,
      usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      titulo            VARCHAR(255) NOT NULL,
      tipo              VARCHAR(30) NOT NULL,
      valor_alvo        NUMERIC(12,2) NOT NULL,
      valor_atual       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
      prazo             DATE,
      categoria_id      INTEGER REFERENCES categorias(id),
      recorrencia       VARCHAR(20),
      valor_recorrencia NUMERIC(12,2),
      ativo             BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_metas_usuario_id ON metas_financeiras(usuario_id)
  `);

  console.log("✓ Tabela metas_financeiras criada");
  console.log("Migration: create_metas_financeiras — concluída.");
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
