import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

async function insertDefaultSettings() {
  const sql = postgres(process.env.DATABASE_URL || '');

  try {
    console.log('Inserindo configurações padrão...\n');

    await sql`
      INSERT INTO system_settings (setting_key, setting_value, setting_metadata) VALUES
        ('system_name', 'FinanceHub', '{"type": "text", "label": "Nome do Sistema", "description": "Nome exibido em todo o sistema"}'),
        ('system_name_short', 'financehub', '{"type": "text", "label": "Nome Curto", "description": "Versão curta usada em emails e URLs (lowercase)"}'),
        ('system_tagline', 'Gestão financeira inteligente e moderna', '{"type": "text", "label": "Slogan/Tagline", "description": "Frase descritiva do sistema"}'),
        ('support_email', 'suporte@financehub.com', '{"type": "email", "label": "Email de Suporte", "description": "Email de contato do suporte"}'),
        ('system_url', 'https://financehub.com', '{"type": "url", "label": "URL do Sistema", "description": "URL principal do sistema"}'),
        ('system_description', 'FinanceHub - Gerencie suas finanças pessoais com uma interface moderna e futurista. Acompanhe receitas, despesas e tenha controle total do seu dinheiro.', '{"type": "textarea", "label": "Descrição do Sistema", "description": "Descrição para SEO e meta tags"}')
      ON CONFLICT (setting_key) DO NOTHING
    `;

    console.log('✅ Configurações inseridas com sucesso!\n');

    // Verificar
    const settings = await sql`SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key`;
    console.log('📊 Configurações atuais:\n');
    settings.forEach((s) => {
      console.log(`  ✓ ${s.setting_key}: ${s.setting_value}`);
    });
    console.log(`\nTotal: ${settings.length} configurações\n`);

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await sql.end();
  }
}

insertDefaultSettings();
