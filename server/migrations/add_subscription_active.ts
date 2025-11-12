import postgres from "postgres";
import * as dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config();

async function addSubscriptionActiveColumn() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Adicionando coluna subscription_active à tabela usuarios...");

    // Adiciona a coluna se ela não existir
    await sql`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS subscription_active boolean NOT NULL DEFAULT false
    `;

    console.log("✓ Coluna subscription_active adicionada com sucesso!");

    // Atualiza usuários existentes baseado no status_assinatura
    await sql`
      UPDATE usuarios
      SET subscription_active = true
      WHERE status_assinatura = 'ativa'
        AND (data_expiracao_assinatura IS NULL OR data_expiracao_assinatura > NOW())
    `;

    console.log("✓ Usuários existentes atualizados com base no status de assinatura!");

  } catch (error) {
    console.error("Erro ao executar migração:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addSubscriptionActiveColumn();
