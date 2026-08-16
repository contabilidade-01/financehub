// Migration script para criar a tabela de lembretes
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function createRemindersTable() {
  console.log("Criando tabela de lembretes...");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida nas variáveis de ambiente");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    // Verificar se a tabela já existe
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'lembretes'
      );
    `);

    if (tableExists[0].exists) {
      console.log("A tabela 'lembretes' já existe. Pulando criação.");
      return;
    }

    // Criar a tabela de lembretes
    await db.execute(sql`
      CREATE TABLE lembretes (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT,
        data_lembrete TIMESTAMP WITH TIME ZONE NOT NULL,
        data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        concluido BOOLEAN DEFAULT FALSE
      );
    `);

    console.log("Tabela de lembretes criada com sucesso!");
  } catch (error) {
    console.error("Erro ao criar tabela de lembretes:", error);
    throw error;
  } finally {
    await client.end();
  }
}

// Executar a migração
createRemindersTable()
  .then(() => {
    console.log("Migração concluída!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro na migração:", error);
    process.exit(1);
  });