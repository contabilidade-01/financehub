import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

async function createSystemSettingsTable() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Criando tabela de configurações do sistema...\n");

    // Criar tabela system_settings
    await sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log("✓ Tabela system_settings criada!");

    // Criar índice para buscas rápidas por chave
    await sql`
      CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key)
    `;
    console.log("✓ Índice idx_system_settings_key criado!");

    // Verificar se já existem configurações
    const existing = await sql`
      SELECT COUNT(*) as count FROM system_settings
    `;

    if (existing[0].count === 0) {
      console.log("Inserindo configurações padrão...");

      // Inserir configurações padrão
      await sql`
        INSERT INTO system_settings (setting_key, setting_value, setting_metadata) VALUES
          ('system_name', 'FinanceHub', '{"type": "text", "label": "Nome do Sistema", "description": "Nome exibido em todo o sistema"}'),
          ('system_name_short', 'financehub', '{"type": "text", "label": "Nome Curto", "description": "Versão curta usada em emails e URLs (lowercase)"}'),
          ('system_tagline', 'Gestão financeira inteligente e moderna', '{"type": "text", "label": "Slogan/Tagline", "description": "Frase descritiva do sistema"}'),
          ('support_email', 'suporte@financehub.com', '{"type": "email", "label": "Email de Suporte", "description": "Email de contato do suporte"}'),
          ('system_url', 'https://financehub.com', '{"type": "url", "label": "URL do Sistema", "description": "URL principal do sistema"}'),
          ('system_description', 'FinanceHub - Gerencie suas finanças pessoais com uma interface moderna e futurista. Acompanhe receitas, despesas e tenha controle total do seu dinheiro.', '{"type": "textarea", "label": "Descrição do Sistema", "description": "Descrição para SEO e meta tags"}')
      `;
      console.log("✓ Configurações padrão inseridas!");
    } else {
      console.log("⊘ Configurações já existem");
    }

    // Criar função de trigger para updated_at
    await sql`
      CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    console.log("✓ Função de trigger criada!");

    // Criar trigger
    await sql`
      DROP TRIGGER IF EXISTS trigger_update_system_settings_updated_at ON system_settings
    `;
    await sql`
      CREATE TRIGGER trigger_update_system_settings_updated_at
        BEFORE UPDATE ON system_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_system_settings_updated_at()
    `;
    console.log("✓ Trigger criado!");

    console.log("\n✅ Migração concluída com sucesso!");
    console.log("\nConfigurações disponíveis:");
    const settings = await sql`SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key`;
    settings.forEach((s) => {
      console.log(`  - ${s.setting_key}: ${s.setting_value}`);
    });

  } catch (error) {
    console.error("\n❌ Erro ao executar migração:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

createSystemSettingsTable();
