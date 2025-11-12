import postgres from "postgres";
import * as dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config();

async function addBillingTranslations() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Adicionando traduções de billing...\n");

    // Traduções para adicionar
    const translations = [
      // Português Brasileiro
      { locale: 'pt-br', key: 'navigation.sections.billing', value: 'ASSINATURA' },
      { locale: 'pt-br', key: 'navigation.billing_settings', value: 'Minha Assinatura' },
      { locale: 'pt-br', key: 'navigation.invoices', value: 'Faturas' },
      { locale: 'pt-br', key: 'navigation.billing', value: 'Pagamentos' },

      // Inglês
      { locale: 'en-us', key: 'navigation.sections.billing', value: 'BILLING' },
      { locale: 'en-us', key: 'navigation.billing_settings', value: 'My Subscription' },
      { locale: 'en-us', key: 'navigation.invoices', value: 'Invoices' },
      { locale: 'en-us', key: 'navigation.billing', value: 'Billing' },

      // Espanhol
      { locale: 'es-es', key: 'navigation.sections.billing', value: 'SUSCRIPCIÓN' },
      { locale: 'es-es', key: 'navigation.billing_settings', value: 'Mi Suscripción' },
      { locale: 'es-es', key: 'navigation.invoices', value: 'Facturas' },
      { locale: 'es-es', key: 'navigation.billing', value: 'Pagos' },
    ];

    let added = 0;
    let skipped = 0;

    for (const trans of translations) {
      try {
        // Verificar se já existe
        const existing = await sql`
          SELECT id FROM localization_strings
          WHERE string_key = ${trans.key}
            AND locale_code = ${trans.locale}
        `;

        if (existing.length > 0) {
          console.log(`  ⊘ Já existe: ${trans.locale} - ${trans.key}`);
          skipped++;
        } else {
          // Inserir nova tradução
          await sql`
            INSERT INTO localization_strings (string_key, locale_code, string_value, created_at)
            VALUES (${trans.key}, ${trans.locale}, ${trans.value}, NOW())
          `;
          console.log(`  ✓ Adicionado: ${trans.locale} - ${trans.key} = "${trans.value}"`);
          added++;
        }
      } catch (err) {
        console.error(`  ✗ Erro ao adicionar ${trans.locale} - ${trans.key}:`, err);
      }
    }

    console.log(`\n✅ Finalizado!`);
    console.log(`   ${added} traduções adicionadas`);
    console.log(`   ${skipped} traduções já existiam`);

  } catch (error) {
    console.error("\n❌ Erro ao executar migração:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addBillingTranslations();
