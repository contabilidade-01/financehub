"use strict";
/**
 * Migration: create_ingestion_events
 * Log consolidado de ingestão por IA (WhatsApp). Um evento por mensagem
 * processada, com o RESULTADO real (sucesso × sem_credito × transitorio × bug),
 * para diagnóstico e para o painel admin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
async function runMigration() {
    console.log("Migration: create_ingestion_events — iniciando...");
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    CREATE TABLE IF NOT EXISTS ingestion_events (
      id            SERIAL PRIMARY KEY,
      usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      remote_jid    VARCHAR(255),
      canal         VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
      tipo_mensagem VARCHAR(40),
      mensagem_raw  TEXT,
      resultado     VARCHAR(40) NOT NULL,
      etapa         VARCHAR(40),
      detalhe       TEXT,
      provider      VARCHAR(40),
      data_criacao  TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    CREATE INDEX IF NOT EXISTS idx_ingestion_events_resultado ON ingestion_events(resultado)
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    CREATE INDEX IF NOT EXISTS idx_ingestion_events_data ON ingestion_events(data_criacao)
  `);
    console.log("✓ Tabela ingestion_events criada");
    console.log("Migration: create_ingestion_events — concluída.");
}
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((err) => { console.error("Erro:", err); process.exit(1); });
}
