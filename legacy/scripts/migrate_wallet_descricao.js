import postgres from 'postgres';
import { sql } from 'drizzle-orm';

// Configuração da conexão com o banco de dados
const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Variável de ambiente DATABASE_URL não definida');
  process.exit(1);
}

const client = postgres(DATABASE_URL);

async function addDescricaoToWalletsTable() {
  try {
    console.log('Adicionando coluna "descricao" à tabela "carteiras"...');
    
    // Verificar se a coluna já existe
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'carteiras' 
      AND column_name = 'descricao'
    `;
    
    const result = await client.unsafe(checkColumnQuery);
    
    if (result.length === 0) {
      // Adicionar a coluna se ela não existir
      await client.unsafe(`
        ALTER TABLE carteiras 
        ADD COLUMN descricao TEXT;
      `);
      console.log('Coluna "descricao" adicionada com sucesso à tabela "carteiras".');
    } else {
      console.log('A coluna "descricao" já existe na tabela "carteiras".');
    }
    
  } catch (error) {
    console.error('Erro ao adicionar coluna "descricao" à tabela "carteiras":', error);
  } finally {
    await client.end();
    process.exit(0);
  }
}

// Executar a migração
addDescricaoToWalletsTable();