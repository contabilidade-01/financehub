/**
 * Migration: create_conversa_e_memoria
 * - conversa_historico: histórico curto por usuário, para o agente ter memória
 *   entre mensagens (perguntas de validação multi-turno).
 * - memoria_usuario: mapeia comerciante/descrição → categoria (o "aprender").
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigration() {
  console.log("Migration: create_conversa_e_memoria — iniciando...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS conversa_historico (
      id           SERIAL PRIMARY KEY,
      usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      role         VARCHAR(12) NOT NULL,
      content      TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_conversa_historico_user ON conversa_historico(usuario_id, id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS memoria_usuario (
      id            SERIAL PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo          VARCHAR(30) NOT NULL DEFAULT 'merchant_categoria',
      chave         VARCHAR(160) NOT NULL,
      valor         JSONB NOT NULL,
      hits          INTEGER NOT NULL DEFAULT 1,
      created_at    TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at    TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS memoria_usuario_uq ON memoria_usuario(usuario_id, tipo, chave)
  `);

  console.log("✓ Tabelas conversa_historico e memoria_usuario criadas");
  console.log("Migration: create_conversa_e_memoria — concluída.");
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
