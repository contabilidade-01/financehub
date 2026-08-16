import postgres from 'postgres';

async function migrateWelcomeMessages() {
  const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
  
  try {
    console.log('🔧 Criando tabela de mensagens de boas vindas...');
    
    // Criar tabela para mensagens de boas vindas
    await client`
      CREATE TABLE IF NOT EXISTS welcome_messages (
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
    
    console.log('✅ Tabela welcome_messages criada com sucesso!');
    
    // Inserir mensagens padrão
    console.log('📝 Inserindo mensagens padrão...');
    
    // Mensagem para usuário recém-cadastrado
    await client`
      INSERT INTO welcome_messages (
        type, 
        title, 
        message, 
        email_content,
        send_email_welcome,
        show_dashboard_message
      ) VALUES (
        'new_user',
        'Bem-vindo ao FinanceHub!',
        'Olá {nome}! Seja bem-vindo ao FinanceHub. Estamos felizes em tê-lo conosco. Aqui você encontrará todas as ferramentas necessárias para gerenciar suas finanças de forma eficiente e organizada.',
        'Olá {nome}, seja bem-vindo ao FinanceHub! Sua conta foi criada com sucesso. Acesse nossa plataforma para começar a gerenciar suas finanças de forma inteligente.',
        true,
        true
      ) ON CONFLICT (type) DO NOTHING
    `;
    
    // Mensagem para usuário não ativo
    await client`
      INSERT INTO welcome_messages (
        type, 
        title, 
        message, 
        email_content,
        payment_link,
        send_email_activation,
        show_dashboard_message
      ) VALUES (
        'inactive_user',
        'Ative sua conta para começar!',
        'Olá {nome}! Sua conta foi criada com sucesso, mas ainda não está ativa. Para acessar todos os recursos do FinanceHub, você precisa ativar sua assinatura. Clique no botão abaixo para efetuar o pagamento e começar a usar nossa plataforma.',
        'Olá {nome}, sua conta no FinanceHub foi criada com sucesso! Para começar a usar todos os recursos, você precisa ativar sua assinatura. Acesse o link abaixo para efetuar o pagamento: {link_pagamento}',
        'https://financehub.com.br/pagamento',
        true,
        true
      ) ON CONFLICT (type) DO NOTHING
    `;
    
    console.log('✅ Mensagens padrão inseridas com sucesso!');
    console.log('🎉 Migração de mensagens de boas vindas concluída!');
    
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
  migrateWelcomeMessages()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { migrateWelcomeMessages };