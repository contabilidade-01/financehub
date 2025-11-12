import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

async function checkPaymentSettings() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Verificando configurações de pagamento...\n");

    const settings = await sql`
      SELECT
        id,
        provider,
        environment,
        LENGTH(api_key) as api_key_length,
        SUBSTRING(api_key, 1, 20) as api_key_prefix,
        SUBSTRING(api_key, LENGTH(api_key) - 10, 10) as api_key_suffix,
        enabled
      FROM payment_settings
      WHERE provider = 'asaas'
    `;

    if (settings.length === 0) {
      console.log("❌ Nenhuma configuração encontrada no banco");
    } else {
      console.log("✅ Configuração encontrada:");
      console.log(JSON.stringify(settings[0], null, 2));

      console.log("\n📋 Detalhes:");
      console.log(`  Provider: ${settings[0].provider}`);
      console.log(`  Environment: ${settings[0].environment}`);
      console.log(`  API Key Length: ${settings[0].api_key_length}`);
      console.log(`  API Key Prefix: ${settings[0].api_key_prefix}`);
      console.log(`  API Key Suffix: ${settings[0].api_key_suffix}`);
      console.log(`  Enabled: ${settings[0].enabled}`);
    }

    console.log("\n📝 Chave do .env:");
    console.log(`  Length: ${process.env.ASAAS_API_KEY?.length || 0}`);
    console.log(`  Prefix: ${process.env.ASAAS_API_KEY?.substring(0, 20)}`);

  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

checkPaymentSettings();
