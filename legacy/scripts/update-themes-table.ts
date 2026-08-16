import postgres from "postgres";
import { config } from "dotenv";

config({ path: '.env' });

async function updateThemesTable() {
  const client = postgres(process.env.DATABASE_URL!);
  
  try {
    console.log('🔄 Atualizando tabela custom_themes...');
    
    // Adicionar novas colunas se não existirem
    await client`
      ALTER TABLE custom_themes 
      ADD COLUMN IF NOT EXISTS is_active_light BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_active_dark BOOLEAN DEFAULT false
    `;
    
    // Criar índices para as novas colunas
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_is_active_light ON custom_themes(is_active_light)`;
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_is_active_dark ON custom_themes(is_active_dark)`;
    
    console.log('✅ Tabela custom_themes atualizada com sucesso!');
    
    // Verificar se já existe algum tema ativo
    const activeLightThemes = await client`SELECT COUNT(*) FROM custom_themes WHERE is_active_light = true`;
    const activeDarkThemes = await client`SELECT COUNT(*) FROM custom_themes WHERE is_active_dark = true`;
    
    console.log(`Temas ativos para light mode: ${activeLightThemes[0].count}`);
    console.log(`Temas ativos para dark mode: ${activeDarkThemes[0].count}`);
    
    // Se não houver nenhum tema ativo, ativar o primeiro tema (ou padrão) para ambos os modos
    if (activeLightThemes[0].count === '0' && activeDarkThemes[0].count === '0') {
      const firstTheme = await client`SELECT id FROM custom_themes ORDER BY is_default DESC, created_at ASC LIMIT 1`;
      
      if (firstTheme.length > 0) {
        await client`UPDATE custom_themes SET is_active_light = true, is_active_dark = true WHERE id = ${firstTheme[0].id}`;
        console.log(`✅ Tema ${firstTheme[0].id} ativado para ambos os modos como padrão`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao atualizar tabela:', error);
  } finally {
    await client.end();
  }
}

updateThemesTable();