import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationClient = postgres(process.env.DATABASE_URL, { ssl: "require" });

async function createTokensTable() {
  console.log('Iniciando migração da tabela de API Tokens...');
  
  try {
    // SQL para criar a tabela api_tokens se não existir
    await migrationClient`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        nome VARCHAR(100) NOT NULL,
        descricao TEXT,
        data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        data_expiracao TIMESTAMP WITH TIME ZONE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE
      );
    `;
    
    console.log('✅ Tabela de API Tokens criada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao criar tabela de API Tokens:', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
}

createTokensTable().catch(console.error);