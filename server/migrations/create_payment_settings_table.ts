import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

async function createPaymentSettingsTable() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Criando tabela de configurações de pagamento...\n");

    // Criar tabela payment_settings
    await sql`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL DEFAULT 'asaas',
        environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
        api_key TEXT NOT NULL,
        webhook_secret TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        updated_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT payment_settings_provider_unique UNIQUE (provider)
      )
    `;
    console.log("✓ Tabela payment_settings criada!");

    // Verificar se já existe configuração
    const existing = await sql`
      SELECT id FROM payment_settings WHERE provider = 'asaas'
    `;

    if (existing.length === 0) {
      // Inserir configuração padrão do .env se existir
      const envApiKey = process.env.ASAAS_API_KEY || '';
      const envWebhookSecret = process.env.ASAAS_WEBHOOK_SECRET || '';
      const envEnvironment = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      if (envApiKey) {
        await sql`
          INSERT INTO payment_settings (provider, environment, api_key, webhook_secret, enabled)
          VALUES ('asaas', ${envEnvironment}, ${envApiKey}, ${envWebhookSecret}, true)
        `;
        console.log("✓ Configuração padrão do Asaas importada do .env");
      } else {
        console.log("⚠️  Nenhuma chave API no .env - configuração deve ser feita via admin");
      }
    } else {
      console.log("⊘ Configuração do Asaas já existe");
    }

    console.log("\n✅ Migração concluída com sucesso!");

  } catch (error) {
    console.error("\n❌ Erro ao executar migração:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

createPaymentSettingsTable();
