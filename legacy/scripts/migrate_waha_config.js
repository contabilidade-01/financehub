import postgres from 'postgres';

async function migrateWahaConfig() {
  const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
  
  try {
    console.log('🔧 Criando tabela de configurações WAHA...');
    
    // Criar tabela para configurações WAHA
    await client`
      CREATE TABLE IF NOT EXISTS waha_config (
        id SERIAL PRIMARY KEY,
        waha_url TEXT NOT NULL,
        api_key TEXT,
        webhook_url TEXT,
        session_name VARCHAR(100) DEFAULT 'default',
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    console.log('✅ Tabela waha_config criada com sucesso!');
    
    // Inserir configuração padrão
    console.log('📝 Inserindo configuração padrão...');
    
    await client`
      INSERT INTO waha_config (
        waha_url, 
        api_key,
        session_name,
        enabled
      ) VALUES (
        'https://whatsapp-waha-whatsapp.ie5w7f.easypanel.host',
        'pulsofinanceiro',
        'numero-principal',
        false
      ) ON CONFLICT DO NOTHING
    `;
    
    console.log('✅ Configuração padrão inserida com sucesso!');
    console.log('🎉 Migração de configurações WAHA concluída!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Detecta se está rodando diretamente via CLI (ESM)
const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (isDirect) {
  migrateWahaConfig()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { migrateWahaConfig };