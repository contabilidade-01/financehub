/**
 * Migration: create_empresas_tables
 *
 * Cria as tabelas do módulo PJ (Pessoa Jurídica):
 *   - Adiciona coluna tipo_pessoa em usuarios (default 'fisica' — backward compatible)
 *   - empresas
 *   - empresas_contas (plano de contas Yampa-like)
 *   - empresas_transacoes
 *
 * NENHUMA tabela PF existente é alterada além da coluna tipo_pessoa em usuarios
 * (que usa DEFAULT 'fisica' para não quebrar registros existentes).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigration() {
  console.log("Migration: create_empresas_tables — iniciando...");

  // 1. Adicionar coluna tipo_pessoa em usuarios (idempotente via IF NOT EXISTS)
  await db.execute(sql`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS tipo_pessoa VARCHAR(20) NOT NULL DEFAULT 'fisica'
  `);
  console.log("✓ Coluna tipo_pessoa adicionada em usuarios (default 'fisica')");

  // 2. Criar tabela empresas
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS empresas (
      id              SERIAL PRIMARY KEY,
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      razao_social    VARCHAR(255) NOT NULL,
      nome_fantasia   VARCHAR(255),
      cnpj            VARCHAR(20) UNIQUE,
      regime_tributario VARCHAR(50),
      segmento        VARCHAR(50),
      ativo           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at      TIMESTAMPTZ
    )
  `);
  console.log("✓ Tabela empresas criada");

  // 3. Criar tabela empresas_contas (plano de contas PJ)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS empresas_contas (
      id              SERIAL PRIMARY KEY,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      codigo          VARCHAR(20) NOT NULL,
      nome            VARCHAR(255) NOT NULL,
      tipo            VARCHAR(10) NOT NULL,
      classificacao   VARCHAR(30) NOT NULL,
      parent_id       INTEGER REFERENCES empresas_contas(id),
      icone           VARCHAR(100),
      cor             VARCHAR(50),
      descricao       TEXT,
      ativo           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      UNIQUE(empresa_id, codigo)
    )
  `);
  console.log("✓ Tabela empresas_contas criada");

  // 4. Criar tabela empresas_transacoes
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS empresas_transacoes (
      id                   SERIAL PRIMARY KEY,
      empresa_id           INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      carteira_id          INTEGER REFERENCES carteiras(id),
      categoria_id         INTEGER NOT NULL REFERENCES empresas_contas(id),
      forma_pagamento_id   INTEGER REFERENCES formas_pagamento(id),
      descricao            VARCHAR(255) NOT NULL,
      valor                NUMERIC(12,2) NOT NULL,
      tipo                 VARCHAR(10) NOT NULL,
      data_transacao       DATE NOT NULL,
      data_registro        TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      status               VARCHAR(20) NOT NULL DEFAULT 'Efetivada',
      metodo_pagamento     VARCHAR(100),
      origem               VARCHAR(20) NOT NULL DEFAULT 'manual'
    )
  `);
  console.log("✓ Tabela empresas_transacoes criada");

  // 5. Índices para performance
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_empresas_usuario_id ON empresas(usuario_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_empresas_contas_empresa_id ON empresas_contas(empresa_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_empresas_transacoes_empresa_id ON empresas_transacoes(empresa_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_empresas_transacoes_data ON empresas_transacoes(empresa_id, data_transacao)
  `);
  console.log("✓ Índices criados");

  console.log("Migration: create_empresas_tables — concluída com sucesso.");
}

// Executar se chamado diretamente
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro na migration:", err);
      process.exit(1);
    });
}
