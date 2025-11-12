import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

async function addPaymentSettingsTranslation() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Adicionando tradução payment_settings...\n");

    const translations = [
      { locale: 'pt-br', key: 'navigation.payment_settings', value: 'Config. Pagamento' },
      { locale: 'en-us', key: 'navigation.payment_settings', value: 'Payment Settings' },
      { locale: 'es-es', key: 'navigation.payment_settings', value: 'Config. de Pago' },
    ];

    for (const trans of translations) {
      const existing = await sql`
        SELECT id FROM localization_strings
        WHERE string_key = ${trans.key} AND locale_code = ${trans.locale}
      `;

      if (existing.length === 0) {
        await sql`
          INSERT INTO localization_strings (string_key, locale_code, string_value, created_at)
          VALUES (${trans.key}, ${trans.locale}, ${trans.value}, NOW())
        `;
        console.log(`✓ ${trans.locale}: ${trans.key} = "${trans.value}"`);
      } else {
        console.log(`⊘ ${trans.locale}: ${trans.key} já existe`);
      }
    }

    console.log("\n✅ Traduções adicionadas!");

  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addPaymentSettingsTranslation();
