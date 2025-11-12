import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

async function fixPaymentSettingsKey() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Limpando e reimportando chave API do Asaas...\n");

    // Deletar configuração existente
    await sql`DELETE FROM payment_settings WHERE provider = 'asaas'`;
    console.log("✓ Configuração antiga removida");

    // Pegar a chave do .env e remover aspas se houver
    let apiKey = process.env.ASAAS_API_KEY || '';

    // Remover aspas duplas do início e fim se existirem
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) {
      apiKey = apiKey.slice(1, -1);
    }

    console.log(`\n📋 Nova chave:`);
    console.log(`  Length: ${apiKey.length}`);
    console.log(`  Prefix: ${apiKey.substring(0, 20)}...`);
    console.log(`  Suffix: ...${apiKey.substring(apiKey.length - 20)}`);

    if (!apiKey || apiKey.length < 50) {
      console.error("\n❌ Chave API inválida ou muito curta");
      console.error("Por favor, configure manualmente via interface admin em /admin/payment-settings");
      process.exit(0);
    }

    // Inserir nova configuração com a chave correta
    await sql`
      INSERT INTO payment_settings (provider, environment, api_key, enabled, created_at)
      VALUES (
        'asaas',
        ${process.env.ASAAS_ENVIRONMENT || 'sandbox'},
        ${apiKey},
        true,
        NOW()
      )
    `;

    console.log("\n✅ Nova configuração salva com sucesso!");
    console.log("\n💡 Dica: Você pode atualizar esta configuração via /admin/payment-settings");

  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixPaymentSettingsKey();
