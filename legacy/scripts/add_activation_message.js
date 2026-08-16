import postgres from 'postgres';

async function addActivationMessage() {
  const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
  
  try {
    console.log('🔧 Adicionando mensagem de ativação...');
    
    // Verificar se a tabela existe
    const tableExists = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'welcome_messages'
      );
    `;
    
    if (!tableExists[0].exists) {
      console.log('📦 Criando tabela welcome_messages...');
      
      await client`
        CREATE TABLE welcome_messages (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50) NOT NULL UNIQUE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          email_content TEXT,
          payment_link TEXT,
          send_email_welcome BOOLEAN DEFAULT true,
          send_email_activation BOOLEAN DEFAULT true,
          show_dashboard_message BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      
      console.log('✅ Tabela criada com sucesso!');
    }
    
    // Inserir mensagem de ativação
    console.log('📝 Inserindo mensagem de ativação...');
    
    const result = await client`
      INSERT INTO welcome_messages (
        type, 
        title, 
        message, 
        email_content,
        send_email_activation,
        show_dashboard_message
      ) VALUES (
        'activated',
        'Sua conta foi ativada!',
        'Olá {nome}! Temos uma ótima notícia: sua conta no FinanceHub foi ativada com sucesso! Agora você tem acesso completo a todos os recursos da plataforma. Aproveite para organizar suas finanças e alcançar seus objetivos financeiros.',
        'Olá {nome}!\n\nSua conta no FinanceHub foi ativada com sucesso!\n\nAgora você tem acesso completo a todos os nossos recursos:\n• Controle total de receitas e despesas\n• Relatórios detalhados\n• Metas financeiras\n• E muito mais!\n\nAcesse agora mesmo e comece a transformar sua vida financeira: https://app.financehub.com.br\n\nQualquer dúvida, estamos à disposição.\n\nEquipe FinanceHub',
        true,
        true
      ) ON CONFLICT (type) DO UPDATE SET
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        email_content = EXCLUDED.email_content,
        send_email_activation = EXCLUDED.send_email_activation,
        show_dashboard_message = EXCLUDED.show_dashboard_message,
        updated_at = NOW()
    `;
    
    if (result.count > 0) {
      console.log('✅ Mensagem de ativação adicionada/atualizada com sucesso!');
    }
    
    // Listar todas as mensagens
    console.log('\n📋 Mensagens disponíveis:');
    const messages = await client`
      SELECT type, title FROM welcome_messages ORDER BY type
    `;
    
    messages.forEach(msg => {
      console.log(`  - ${msg.type}: ${msg.title}`);
    });
    
    console.log('\n🎉 Processo concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao adicionar mensagem de ativação:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Detecta se está rodando diretamente via CLI (ESM)
const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (isDirect) {
  addActivationMessage()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { addActivationMessage };