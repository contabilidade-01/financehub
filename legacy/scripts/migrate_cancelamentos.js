import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Configuração da conexão com o banco
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function createCancelamentosTable() {
  try {
    console.log('=== CRIANDO TABELA DE CANCELAMENTOS ===');
    
    // Adicionar campos de cancelamento na tabela usuarios
    await db.execute(`
      ALTER TABLE usuarios 
      ADD COLUMN IF NOT EXISTS data_cancelamento TIMESTAMP,
      ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT,
      ADD COLUMN IF NOT EXISTS status_assinatura VARCHAR(20) DEFAULT 'ativa'
    `);
    
    // Criar tabela de histórico de cancelamentos
    await db.execute(`
      CREATE TABLE IF NOT EXISTS historico_cancelamentos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        data_cancelamento TIMESTAMP NOT NULL DEFAULT NOW(),
        motivo_cancelamento TEXT NOT NULL,
        tipo_cancelamento VARCHAR(20) NOT NULL DEFAULT 'voluntario', -- voluntario, administrativo, falha_pagamento
        observacoes TEXT,
        reativado_em TIMESTAMP,
        data_criacao TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✓ Tabela de cancelamentos criada com sucesso');
    console.log('✓ Campos de cancelamento adicionados à tabela usuarios');
    
  } catch (error) {
    console.error('Erro ao criar tabela de cancelamentos:', error);
  } finally {
    await client.end();
  }
}

createCancelamentosTable();