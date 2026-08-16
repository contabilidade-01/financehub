// Migration script para adicionar suporte ao sistema administrativo
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

async function addAdminSystemFields() {
  console.log("Adicionando campos do sistema administrativo...");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida nas variáveis de ambiente");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    // Verificar se a coluna tipo_usuario já existe
    const tipoUsuarioExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'usuarios'
        AND column_name = 'tipo_usuario'
      );
    `);

    if (!tipoUsuarioExists[0].exists) {
      console.log("Adicionando coluna 'tipo_usuario' à tabela usuarios...");
      await db.execute(sql`
        ALTER TABLE usuarios 
        ADD COLUMN tipo_usuario VARCHAR(50) NOT NULL DEFAULT 'normal';
      `);
      console.log("Coluna 'tipo_usuario' adicionada com sucesso!");
    } else {
      console.log("Coluna 'tipo_usuario' já existe.");
    }

    // Verificar se a coluna ativo já existe
    const ativoExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'usuarios'
        AND column_name = 'ativo'
      );
    `);

    if (!ativoExists[0].exists) {
      console.log("Adicionando coluna 'ativo' à tabela usuarios...");
      await db.execute(sql`
        ALTER TABLE usuarios 
        ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT true;
      `);
      console.log("Coluna 'ativo' adicionada com sucesso!");
    } else {
      console.log("Coluna 'ativo' já existe.");
    }

    // Verificar se a tabela user_sessions_admin já existe
    const sessionTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_sessions_admin'
      );
    `);

    if (!sessionTableExists[0].exists) {
      console.log("Criando tabela 'user_sessions_admin'...");
      await db.execute(sql`
        CREATE TABLE user_sessions_admin (
          id SERIAL PRIMARY KEY,
          super_admin_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          target_user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          data_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          data_fim TIMESTAMP WITH TIME ZONE,
          ativo BOOLEAN NOT NULL DEFAULT true
        );
      `);
      console.log("Tabela 'user_sessions_admin' criada com sucesso!");
    } else {
      console.log("Tabela 'user_sessions_admin' já existe.");
    }

    console.log("Migração do sistema administrativo concluída com sucesso!");
  } catch (error) {
    console.error("Erro na migração do sistema administrativo:", error);
    throw error;
  } finally {
    await client.end();
  }
}

// Executar a migração
addAdminSystemFields()
  .then(() => {
    console.log("Migração concluída!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro na migração:", error);
    process.exit(1);
  });