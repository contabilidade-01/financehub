import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

async function checkSettings() {
  const sql = postgres(process.env.DATABASE_URL || '');

  try {
    const settings = await sql`SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key`;
    console.log('\n📊 Configurações do Sistema:\n');
    settings.forEach((s) => {
      console.log(`  ✓ ${s.setting_key}: ${s.setting_value}`);
    });
    console.log(`\nTotal: ${settings.length} configurações\n`);
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await sql.end();
  }
}

checkSettings();
