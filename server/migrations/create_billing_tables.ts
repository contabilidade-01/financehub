import postgres from "postgres";
import * as dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config();

async function createBillingTables() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Criando tabelas de billing/assinatura...");

    // 1. Criar tabela subscription_plans
    console.log("Criando tabela subscription_plans...");
    await sql`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        plan_code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price_monthly DECIMAL(10, 2) NOT NULL,
        features TEXT NOT NULL,
        max_transactions INTEGER DEFAULT 0,
        max_wallets INTEGER DEFAULT 0,
        max_categories INTEGER DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        updated_at TIMESTAMP WITH TIME ZONE
      )
    `;
    console.log("✓ Tabela subscription_plans criada!");

    // 2. Criar tabela asaas_customers
    console.log("Criando tabela asaas_customers...");
    await sql`
      CREATE TABLE IF NOT EXISTS asaas_customers (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        asaas_customer_id VARCHAR(100) NOT NULL UNIQUE,
        cpf_cnpj VARCHAR(18),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        updated_at TIMESTAMP WITH TIME ZONE
      )
    `;
    console.log("✓ Tabela asaas_customers criada!");

    // 3. Criar tabela user_subscriptions
    console.log("Criando tabela user_subscriptions...");
    await sql`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
        asaas_subscription_id VARCHAR(100) UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        current_period_start TIMESTAMP WITH TIME ZONE,
        current_period_end TIMESTAMP WITH TIME ZONE,
        canceled_at TIMESTAMP WITH TIME ZONE,
        cancellation_reason TEXT,
        ended_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        updated_at TIMESTAMP WITH TIME ZONE
      )
    `;
    console.log("✓ Tabela user_subscriptions criada!");

    // 4. Criar tabela payment_transactions
    console.log("Criando tabela payment_transactions...");
    await sql`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        subscription_id INTEGER REFERENCES user_subscriptions(id),
        asaas_payment_id VARCHAR(100) UNIQUE,
        asaas_invoice_url TEXT,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        payment_method VARCHAR(50) NOT NULL DEFAULT 'credit_card',
        due_date DATE,
        confirmed_date TIMESTAMP WITH TIME ZONE,
        description TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        updated_at TIMESTAMP WITH TIME ZONE
      )
    `;
    console.log("✓ Tabela payment_transactions criada!");

    // 5. Criar tabela asaas_webhooks
    console.log("Criando tabela asaas_webhooks...");
    await sql`
      CREATE TABLE IF NOT EXISTS asaas_webhooks (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        asaas_event_id VARCHAR(100) UNIQUE,
        payload TEXT NOT NULL,
        processed BOOLEAN NOT NULL DEFAULT false,
        processed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
      )
    `;
    console.log("✓ Tabela asaas_webhooks criada!");

    console.log("\n✓ Todas as tabelas de billing foram criadas com sucesso!");

  } catch (error) {
    console.error("Erro ao executar migração:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

createBillingTables();
