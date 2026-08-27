import postgres from 'postgres';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Criar conexão direta com postgres
const sql = postgres(process.env.DATABASE_URL!);

async function createThemesTable() {
  try {
    console.log('🎨 Criando tabela de temas customizados...');

    // Criar tabela custom_themes
    await sql`
      CREATE TABLE IF NOT EXISTS custom_themes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        name VARCHAR(100) NOT NULL,
        light_config JSONB NOT NULL,
        dark_config JSONB NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log('✅ Tabela custom_themes criada');

    // Criar índices
    await sql`CREATE INDEX IF NOT EXISTS idx_custom_themes_user_id ON custom_themes(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_custom_themes_is_default ON custom_themes(is_default)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_custom_themes_created_at ON custom_themes(created_at)`;

    console.log('✅ Índices criados');

    // Criar trigger para updated_at
    await sql`
      CREATE OR REPLACE FUNCTION update_custom_themes_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;

    await sql`
      DROP TRIGGER IF EXISTS update_custom_themes_updated_at_trigger ON custom_themes
    `;

    await sql`
      CREATE TRIGGER update_custom_themes_updated_at_trigger
          BEFORE UPDATE ON custom_themes
          FOR EACH ROW
          EXECUTE FUNCTION update_custom_themes_updated_at()
    `;

    console.log('✅ Trigger de updated_at criado');

    // Verificar se já existe tema padrão
    const existingDefault = await sql`SELECT id FROM custom_themes WHERE is_default = true`;

    if (existingDefault.length === 0) {
      // Inserir tema padrão
      await sql`
        INSERT INTO custom_themes (
          name, 
          light_config, 
          dark_config, 
          is_default
        ) VALUES (
          'Padrão Magen',
          ${JSON.stringify({
            background: "0 0% 98%",
            foreground: "240 10% 3.9%", 
            primary: "255 100% 70%",
            primaryForeground: "0 0% 98%",
            secondary: "157 100% 50%",
            secondaryForeground: "0 0% 9%",
            muted: "240 4.8% 95.9%",
            mutedForeground: "240 3.8% 46.1%",
            accent: "240 4.8% 95.9%",
            accentForeground: "240 5.9% 10%",
            border: "240 5.9% 90%",
            card: "0 0% 100%",
            cardForeground: "240 10% 3.9%",
            destructive: "0 84.2% 60.2%",
            destructiveForeground: "0 0% 98%"
          })},
          ${JSON.stringify({
            background: "240 10% 3.9%",
            foreground: "0 0% 98%",
            primary: "255 100% 70%",
            primaryForeground: "0 0% 98%",
            secondary: "157 100% 50%",
            secondaryForeground: "0 0% 9%",
            muted: "240 3.7% 15.9%",
            mutedForeground: "240 5% 64.9%",
            accent: "240 3.7% 15.9%",
            accentForeground: "0 0% 98%",
            border: "240 3.7% 15.9%",
            card: "240 10% 3.9%",
            cardForeground: "0 0% 98%",
            destructive: "0 62.8% 30.6%",
            destructiveForeground: "0 0% 98%"
          })},
          true
        )
      `;

      console.log('✅ Tema padrão inserido');
    } else {
      console.log('ℹ️ Tema padrão já existe');
    }

    console.log('🎨 ✅ Migração de temas concluída com sucesso!');
    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Erro ao criar tabela de temas:', error);
    await sql.end();
    process.exit(1);
  }
}

createThemesTable();