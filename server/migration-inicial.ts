import postgres from "postgres";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

// Carregar variáveis de ambiente do arquivo .env
config({ path: '.env' });

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

export async function runInitialMigration({ dropAll = false }: { dropAll?: boolean } = {}) {
  console.log('🔧 Executando migration inicial do banco de dados...');
  
  // Criar pastas necessárias com permissões corretas
  console.log('📁 Criando pastas de upload com permissões corretas...');
  
  // Criar ambas as estruturas de pastas (dev e prod)
  const publicPaths = ['public', 'dist/public'];
  
  publicPaths.forEach(publicPath => {
    const publicDir = path.resolve(process.cwd(), publicPath);
    const chartsDir = path.resolve(publicDir, 'charts');
    const reportsDir = path.resolve(publicDir, 'reports');
    
    // Criar diretórios se não existirem
    [publicDir, chartsDir, reportsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        console.log(`✅ Pasta criada: ${dir}`);
      } else {
        // Garantir permissões corretas mesmo se a pasta já existe
        fs.chmodSync(dir, 0o755);
        console.log(`✅ Permissões ajustadas: ${dir}`);
      }
    });
  });
  
  console.log('✅ Pastas de upload configuradas com sucesso!');
  
  const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
  try {
    // Habilitar extensões necessárias
    console.log('🔧 Habilitando extensões do PostgreSQL...');
    await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    console.log('✅ Extensão pgcrypto habilitada!');

    if (dropAll) {
      console.log('⚠️  Apagando todas as tabelas do banco de dados...');
      await client`DROP TABLE IF EXISTS
        payment_transactions,
        asaas_webhooks,
        user_subscriptions,
        asaas_customers,
        subscription_plans,
        payment_settings,
        localization_strings,
        system_localization,
        welcome_messages,
        waha_session_webhooks,
        waha_config,
        user_sessions_admin,
        transacoes,
        lembretes,
        historico_cancelamentos,
        formas_pagamento,
        categorias,
        carteiras,
        api_tokens,
        usuarios,
        logos_customizados,
        custom_themes
        CASCADE`;
      console.log('✅ Todas as tabelas foram removidas!');
    }
    // Tabelas baseadas na estrutura de produção
    console.log('📋 Criando tabela: usuarios');
    await client`CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      remotejid VARCHAR(255) NOT NULL DEFAULT '',
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      telefone VARCHAR(20),
      senha VARCHAR(255) NOT NULL,
      tipo_usuario VARCHAR(50) NOT NULL DEFAULT 'normal',
      ativo BOOLEAN NOT NULL DEFAULT true,
      data_cadastro TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      ultimo_acesso TIMESTAMPTZ,
      data_cancelamento TIMESTAMPTZ,
      motivo_cancelamento TEXT,
      data_expiracao_assinatura TIMESTAMPTZ,
      status_assinatura VARCHAR(20) DEFAULT 'ativa',
      subscription_active BOOLEAN NOT NULL DEFAULT false
    )`;

    console.log('📋 Criando tabela: carteiras');
    await client`CREATE TABLE IF NOT EXISTS carteiras (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      nome VARCHAR(255) NOT NULL,
      descricao TEXT,
      saldo_atual NUMERIC(12,2) DEFAULT 0.00,
      data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )`;

    console.log('📋 Criando tabela: categorias');
    await client`CREATE TABLE IF NOT EXISTS categorias (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      tipo VARCHAR(10) NOT NULL DEFAULT 'Despesa',
      cor VARCHAR(50),
      icone VARCHAR(100),
      descricao TEXT,
      usuario_id INTEGER,
      global BOOLEAN NOT NULL DEFAULT false
    )`;

    console.log('📋 Criando tabela: formas_pagamento');
    await client`CREATE TABLE IF NOT EXISTS formas_pagamento (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      descricao TEXT,
      icone VARCHAR(100),
      cor VARCHAR(50),
      usuario_id INTEGER,
      global BOOLEAN NOT NULL DEFAULT false,
      ativo BOOLEAN NOT NULL DEFAULT true,
      data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )`;

    console.log('📋 Criando tabela: transacoes');
    await client`CREATE TABLE IF NOT EXISTS transacoes (
      id SERIAL PRIMARY KEY,
      carteira_id INTEGER NOT NULL,
      categoria_id INTEGER NOT NULL,
      forma_pagamento_id INTEGER,
      tipo VARCHAR(10) NOT NULL DEFAULT 'Despesa',
      valor NUMERIC(12,2) NOT NULL,
      data_transacao DATE NOT NULL,
      data_registro TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      descricao VARCHAR(255) NOT NULL,
      metodo_pagamento VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'Pendente'
    )`;

    console.log('📋 Criando tabela: lembretes');
    await client`CREATE TABLE IF NOT EXISTS lembretes (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      descricao TEXT,
      data_lembrete TIMESTAMPTZ NOT NULL,
      data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      concluido BOOLEAN DEFAULT false
    )`;

    console.log('📋 Criando tabela: api_tokens');
    await client`CREATE TABLE IF NOT EXISTS api_tokens (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      token VARCHAR(255) NOT NULL,
      nome VARCHAR(100) NOT NULL,
      descricao TEXT,
      data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      data_expiracao TIMESTAMPTZ,
      ativo BOOLEAN NOT NULL DEFAULT true,
      master BOOLEAN NOT NULL DEFAULT false,
      rotacionavel BOOLEAN NOT NULL DEFAULT false
    )`;

    console.log('📋 Criando tabela: historico_cancelamentos');
    await client`CREATE TABLE IF NOT EXISTS historico_cancelamentos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      data_cancelamento TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      motivo_cancelamento TEXT NOT NULL,
      tipo_cancelamento VARCHAR(20) NOT NULL DEFAULT 'voluntario',
      observacoes TEXT,
      reativado_em TIMESTAMPTZ,
      data_criacao TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )`;

    console.log('📋 Criando tabela: user_sessions_admin');
    await client`CREATE TABLE IF NOT EXISTS user_sessions_admin (
      id SERIAL PRIMARY KEY,
      super_admin_id INTEGER NOT NULL,
      target_user_id INTEGER NOT NULL,
      data_inicio TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      data_fim TIMESTAMPTZ,
      ativo BOOLEAN NOT NULL DEFAULT true
    )`;

    console.log('📋 Criando tabela: waha_config');
    await client`CREATE TABLE IF NOT EXISTS waha_config (
      id SERIAL PRIMARY KEY,
      waha_url TEXT NOT NULL,
      api_key TEXT,
      webhook_url TEXT,
      session_name VARCHAR(100) DEFAULT 'default',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      webhook_hash VARCHAR(10)
    )`;

    console.log('📋 Criando tabela: waha_session_webhooks');
    await client`CREATE TABLE IF NOT EXISTS waha_session_webhooks (
      id SERIAL PRIMARY KEY,
      session_name VARCHAR(255) NOT NULL,
      webhook_hash VARCHAR(10) NOT NULL,
      webhook_url TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )`;

    console.log('📋 Criando tabela: welcome_messages');
    await client`CREATE TABLE IF NOT EXISTS welcome_messages (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      email_content TEXT,
      payment_link TEXT,
      send_email_welcome BOOLEAN DEFAULT true,
      send_email_activation BOOLEAN DEFAULT true,
      show_dashboard_message BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )`;

    console.log('📋 Criando tabela: custom_themes');
    await client`CREATE TABLE IF NOT EXISTS custom_themes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name VARCHAR(100) NOT NULL,
      light_config JSONB NOT NULL,
      dark_config JSONB NOT NULL,
      is_default BOOLEAN DEFAULT false,
      is_active_light BOOLEAN DEFAULT false,
      is_active_dark BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    console.log('📋 Criando tabela: system_localization');
    await client`CREATE TABLE IF NOT EXISTS system_localization (
      id SERIAL PRIMARY KEY,
      locale_code VARCHAR(10) NOT NULL UNIQUE,
      locale_name VARCHAR(100) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT false,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      created_by INTEGER,
      updated_at TIMESTAMPTZ,
      updated_by INTEGER
    )`;

    console.log('📋 Criando tabela: localization_strings');
    await client`CREATE TABLE IF NOT EXISTS localization_strings (
      id SERIAL PRIMARY KEY,
      string_key VARCHAR(255) NOT NULL,
      locale_code VARCHAR(10) NOT NULL,
      string_value TEXT NOT NULL,
      string_context VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at TIMESTAMPTZ
    )`;

    console.log('📋 Criando tabela: subscription_plans');
    await client`CREATE TABLE IF NOT EXISTS subscription_plans (
      id SERIAL PRIMARY KEY,
      plan_code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      price_monthly DECIMAL(10, 2) NOT NULL,
      features TEXT NOT NULL,
      max_transactions INTEGER DEFAULT 0,
      max_wallets INTEGER DEFAULT 0,
      max_categories INTEGER DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at TIMESTAMPTZ
    )`;

    console.log('📋 Criando tabela: asaas_customers');
    await client`CREATE TABLE IF NOT EXISTS asaas_customers (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL UNIQUE,
      asaas_customer_id VARCHAR(100) NOT NULL UNIQUE,
      cpf_cnpj VARCHAR(18),
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at TIMESTAMPTZ
    )`;

    console.log('📋 Criando tabela: user_subscriptions');
    await client`CREATE TABLE IF NOT EXISTS user_subscriptions (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      asaas_subscription_id VARCHAR(100) UNIQUE,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      cancellation_reason TEXT,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at TIMESTAMPTZ
    )`;

    console.log('📋 Criando tabela: payment_transactions');
    await client`CREATE TABLE IF NOT EXISTS payment_transactions (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      subscription_id INTEGER,
      asaas_payment_id VARCHAR(100) UNIQUE,
      asaas_invoice_url TEXT,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      payment_method VARCHAR(50) NOT NULL DEFAULT 'credit_card',
      due_date DATE,
      confirmed_date TIMESTAMPTZ,
      description TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at TIMESTAMPTZ
    )`;

    console.log('📋 Criando tabela: asaas_webhooks');
    await client`CREATE TABLE IF NOT EXISTS asaas_webhooks (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      asaas_event_id VARCHAR(100) UNIQUE,
      payload TEXT NOT NULL,
      processed BOOLEAN NOT NULL DEFAULT false,
      processed_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
    )`;

    console.log('📋 Criando tabela: payment_settings');
    await client`CREATE TABLE IF NOT EXISTS payment_settings (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(50) NOT NULL DEFAULT 'asaas',
      environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
      api_key TEXT NOT NULL,
      webhook_secret TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      send_activation_email BOOLEAN NOT NULL DEFAULT true,
      send_activation_whatsapp BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
      updated_at TIMESTAMPTZ,
      CONSTRAINT payment_settings_provider_unique UNIQUE (provider)
    )`;

    console.log('📋 Criando constraints e índices...');
    
    // Constraints de chaves únicas
    await client`CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unique ON usuarios(email)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_token_unique ON api_tokens(token)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_usuario_id_master_unique ON api_tokens(usuario_id, master)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS categorias_nome_global_unique ON categorias(nome, global)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS formas_pagamento_nome_global_unique ON formas_pagamento(nome, global)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS waha_config_webhook_hash_key ON waha_config(webhook_hash)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS waha_session_webhooks_session_name_key ON waha_session_webhooks(session_name)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS waha_session_webhooks_webhook_hash_key ON waha_session_webhooks(webhook_hash)`;
    await client`CREATE UNIQUE INDEX IF NOT EXISTS welcome_messages_type_key ON welcome_messages(type)`;
    
    // Índices para custom_themes
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_user_id ON custom_themes(user_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_is_default ON custom_themes(is_default)`;
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_is_active_light ON custom_themes(is_active_light)`;
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_is_active_dark ON custom_themes(is_active_dark)`;
    await client`CREATE INDEX IF NOT EXISTS idx_custom_themes_created_at ON custom_themes(created_at)`;

    // Índices e constraints para localization_strings
    await client`CREATE UNIQUE INDEX IF NOT EXISTS localization_strings_key_locale_unique
                 ON localization_strings(string_key, locale_code)`;
    await client`CREATE INDEX IF NOT EXISTS idx_localization_strings_locale_code ON localization_strings(locale_code)`;
    await client`CREATE INDEX IF NOT EXISTS idx_localization_strings_string_key ON localization_strings(string_key)`;
    await client`CREATE INDEX IF NOT EXISTS idx_system_localization_locale_code ON system_localization(locale_code)`;
    await client`CREATE INDEX IF NOT EXISTS idx_system_localization_is_active ON system_localization(is_active)`;
    await client`CREATE INDEX IF NOT EXISTS idx_system_localization_is_default ON system_localization(is_default)`;

    // Índices para billing tables
    await client`CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_code ON subscription_plans(plan_code)`;
    await client`CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(active)`;
    await client`CREATE INDEX IF NOT EXISTS idx_asaas_customers_usuario_id ON asaas_customers(usuario_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_asaas_customers_asaas_customer_id ON asaas_customers(asaas_customer_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_usuario_id ON user_subscriptions(usuario_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_usuario_status ON user_subscriptions(usuario_id, status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_payment_transactions_usuario_id ON payment_transactions(usuario_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_payment_transactions_asaas_payment_id ON payment_transactions(asaas_payment_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_payment_transactions_overdue ON payment_transactions(status, retry_count) WHERE status = 'overdue' AND retry_count < 3`;
    await client`CREATE INDEX IF NOT EXISTS idx_payment_transactions_due_date ON payment_transactions(due_date)`;
    await client`CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at)`;
    await client`CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_event_type ON asaas_webhooks(event_type)`;
    await client`CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_processed ON asaas_webhooks(processed)`;
    await client`CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_unprocessed ON asaas_webhooks(created_at) WHERE processed = false`;

    // Foreign keys (usando DO $$ para ignorar se já existir)
    try {
      await client`ALTER TABLE carteiras ADD CONSTRAINT carteiras_usuario_id_usuarios_id_fk 
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE categorias ADD CONSTRAINT categorias_usuario_id_usuarios_id_fk 
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE formas_pagamento ADD CONSTRAINT formas_pagamento_usuario_id_usuarios_id_fk 
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE transacoes ADD CONSTRAINT transacoes_carteira_id_carteiras_id_fk 
                   FOREIGN KEY (carteira_id) REFERENCES carteiras(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE transacoes ADD CONSTRAINT transacoes_categoria_id_categorias_id_fk 
                   FOREIGN KEY (categoria_id) REFERENCES categorias(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE transacoes ADD CONSTRAINT transacoes_forma_pagamento_id_formas_pagamento_id_fk 
                   FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE lembretes ADD CONSTRAINT lembretes_usuario_id_usuarios_id_fk 
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_usuario_id_usuarios_id_fk 
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE historico_cancelamentos ADD CONSTRAINT historico_cancelamentos_usuario_id_usuarios_id_fk 
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE user_sessions_admin ADD CONSTRAINT user_sessions_admin_super_admin_id_usuarios_id_fk 
                   FOREIGN KEY (super_admin_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE user_sessions_admin ADD CONSTRAINT user_sessions_admin_target_user_id_usuarios_id_fk 
                   FOREIGN KEY (target_user_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }
    
    try {
      await client`ALTER TABLE custom_themes ADD CONSTRAINT custom_themes_user_id_usuarios_id_fk
                   FOREIGN KEY (user_id) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE system_localization ADD CONSTRAINT system_localization_created_by_usuarios_id_fk
                   FOREIGN KEY (created_by) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE system_localization ADD CONSTRAINT system_localization_updated_by_usuarios_id_fk
                   FOREIGN KEY (updated_by) REFERENCES usuarios(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE localization_strings ADD CONSTRAINT localization_strings_locale_code_fk
                   FOREIGN KEY (locale_code) REFERENCES system_localization(locale_code) ON DELETE CASCADE`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE asaas_customers ADD CONSTRAINT asaas_customers_usuario_id_fk
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_usuario_id_fk
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_plan_id_fk
                   FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_usuario_id_fk
                   FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE`;
    } catch (error) { /* Ignora se constraint já existe */ }

    try {
      await client`ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_subscription_id_fk
                   FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id)`;
    } catch (error) { /* Ignora se constraint já existe */ }

    console.log('✅ Tabelas criadas com sucesso!');
    
    console.log('📊 Inserindo dados padrão...');
    // Categorias globais de despesa
    // Categorias de despesa com cores únicas
    const expenseCategories = [
      { nome: 'Alimentação', cor: '#FF6B6B', icone: 'utensils' },
      { nome: 'Moradia', cor: '#4ECDC4', icone: 'home' },
      { nome: 'Doações', cor: '#95E1D3', icone: 'hand-holding-heart' },
      { nome: 'Educação', cor: '#FFE66D', icone: 'graduation-cap' },
      { nome: 'Imposto', cor: '#FF8B94', icone: 'file-invoice-dollar' },
      { nome: 'Investimento', cor: '#A8E6CF', icone: 'chart-line' },
      { nome: 'Lazer', cor: '#FFD3B6', icone: 'gamepad' },
      { nome: 'Pets', cor: '#FFAAA5', icone: 'paw' },
      { nome: 'Saude', cor: '#FF8C42', icone: 'heartbeat' },
      { nome: 'Transporte', cor: '#6BCB77', icone: 'car' },
      { nome: 'Vestuário', cor: '#A569BD', icone: 'tshirt' },
      { nome: 'Viagem', cor: '#4D96FF', icone: 'plane' },
      { nome: 'Outros', cor: '#B0B0B0', icone: 'minus-circle' }
    ];

    for (const categoria of expenseCategories) {
      await client`
        INSERT INTO categorias (nome, tipo, global, cor, icone)
        VALUES (${categoria.nome}, 'Despesa', true, ${categoria.cor}, ${categoria.icone})
        ON CONFLICT (nome, global) DO NOTHING
      `;
    }
    
    // Categorias globais de receita  
    const incomeCategories = ['Investimentos', 'Salário', 'Freelance', 'Outros'];
    for (const categoria of incomeCategories) {
      await client`
        INSERT INTO categorias (nome, tipo, global, cor, icone)
        VALUES (${categoria}, 'Receita', true, '#10B981', 'plus-circle')
        ON CONFLICT (nome, global) DO NOTHING
      `;
    }
    
    // Formas de pagamento globais
    const paymentMethods = [
      { nome: 'PIX', icone: 'smartphone', cor: '#10B981' },
      { nome: 'Cartão de Crédito', icone: 'credit-card', cor: '#3B82F6' },
      { nome: 'Cartão de Débito', icone: 'credit-card', cor: '#8B5CF6' },
      { nome: 'Dinheiro', icone: 'banknote', cor: '#F59E0B' },
      { nome: 'TED/DOC', icone: 'building-bank', cor: '#EF4444' },
      { nome: 'Cheque', icone: 'file-text', cor: '#6B7280' }
    ];
    for (const method of paymentMethods) {
      await client`
        INSERT INTO formas_pagamento (nome, global, cor, icone, ativo)
        VALUES (${method.nome}, true, ${method.cor}, ${method.icone}, true)
        ON CONFLICT (nome, global) DO NOTHING
      `;
    }
    console.log('✅ Dados padrão inseridos!');
    
    console.log('💌 Inserindo mensagens de boas vindas padrão...');
    
    // Mensagem para novos usuários
    await client`
      INSERT INTO welcome_messages (type, title, message, email_content, send_email_welcome, send_email_activation, show_dashboard_message)
      VALUES (
        'new_user',
        'Bem-vindo ao FinanceHub!',
        'Olá {nome}! Seja bem-vindo ao FinanceHub. Estamos felizes em tê-lo conosco. Aqui você encontrará todas as ferramentas necessárias para gerenciar suas finanças de forma eficiente e organizada.',
        'Olá {nome}, seja bem-vindo ao FinanceHub! Sua conta foi criada com sucesso. Acesse nossa plataforma para começar a gerenciar suas finanças de forma inteligente.',
        true,
        false,
        true
      )
      ON CONFLICT (type) DO NOTHING
    `;
    
    // Mensagem para usuários inativos
    await client`
      INSERT INTO welcome_messages (type, title, message, email_content, payment_link, send_email_welcome, send_email_activation, show_dashboard_message)
      VALUES (
        'inactive_user',
        'Ative sua conta para começar!',
        'Olá {nome}! Sua conta foi criada com sucesso, mas ainda não está ativa. Para acessar todos os recursos do FinanceHub, você precisa ativar sua assinatura. Clique no botão abaixo para efetuar o pagamento e começar a usar nossa plataforma.',
        'Olá {nome}, sua conta no FinanceHub foi criada com sucesso! Para começar a usar todos os recursos, você precisa ativar sua assinatura. Acesse o link abaixo para efetuar o pagamento: {link_pagamento}',
        'https://financehub.com.br/pagamento',
        false,
        true,
        true
      )
      ON CONFLICT (type) DO NOTHING
    `;
    
    // Mensagem para usuários ativados
    await client`
      INSERT INTO welcome_messages (type, title, message, email_content, send_email_welcome, send_email_activation, show_dashboard_message)
      VALUES (
        'activated',
        'Sua conta foi ativada!',
        'Olá {nome}! Temos uma ótima notícia: sua conta no FinanceHub foi ativada com sucesso! Agora você tem acesso completo a todos os recursos da plataforma.',
        'Olá {nome}!\n\nSua conta no FinanceHub foi ativada com sucesso!\n\nAgora você tem acesso completo a todos os nossos recursos.',
        false,
        true,
        true
      )
      ON CONFLICT (type) DO NOTHING
    `;
    
    console.log('✅ Mensagens de boas vindas inseridas!');

    console.log('🌐 Inserindo locales padrão...');

    // Inserir locales suportados
    await client`
      INSERT INTO system_localization (locale_code, locale_name, is_active, is_default)
      VALUES ('pt-br', 'Português (Brasil)', true, true)
      ON CONFLICT (locale_code) DO NOTHING
    `;

    await client`
      INSERT INTO system_localization (locale_code, locale_name, is_active, is_default)
      VALUES ('en-us', 'English (US)', true, false)
      ON CONFLICT (locale_code) DO NOTHING
    `;

    await client`
      INSERT INTO system_localization (locale_code, locale_name, is_active, is_default)
      VALUES ('es-es', 'Español (España)', true, false)
      ON CONFLICT (locale_code) DO NOTHING
    `;

    console.log('✅ Locales padrão inseridos!');

    // Criar trigger para updated_at da tabela custom_themes
    await client`
      CREATE OR REPLACE FUNCTION update_custom_themes_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;

    await client`
      DROP TRIGGER IF EXISTS update_custom_themes_updated_at_trigger ON custom_themes
    `;

    await client`
      CREATE TRIGGER update_custom_themes_updated_at_trigger
          BEFORE UPDATE ON custom_themes
          FOR EACH ROW
          EXECUTE FUNCTION update_custom_themes_updated_at()
    `;

    // Inserir tema padrão se não existir
    const existingDefaultTheme = await client`SELECT id FROM custom_themes WHERE is_default = true`;
    
    if (existingDefaultTheme.length === 0) {
      await client`
        INSERT INTO custom_themes (
          name, 
          light_config, 
          dark_config, 
          is_default
        ) VALUES (
          'Padrão FinanceHub',
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
    }
    
    console.log('✅ Tema padrão inserido!');
  } catch (error) {
    console.error('❌ Erro ao executar migration inicial:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Detecta se está rodando diretamente via CLI (ESM)
const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (isDirect) {
  (async () => {
    // Verificar e confirmar credenciais do banco ANTES de qualquer pergunta
    const databaseUrl = process.env.DATABASE_URL || '';
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL não está definida no arquivo .env');
      process.exit(1);
    }

    console.log('\n📋 Credenciais do banco de dados:');
    console.log(`🔗 URL: ${databaseUrl}`);
    
    // Parse da URL para mostrar detalhes
    try {
      const url = new URL(databaseUrl);
      console.log(`🏠 Host: ${url.hostname}`);
      console.log(`🔌 Porta: ${url.port || '5432'}`);
      console.log(`🗄️  Database: ${url.pathname.slice(1)}`);
      console.log(`👤 Usuário: ${url.username}`);
      console.log(`🔐 Senha: ${'*'.repeat(url.password?.length || 0)}`);
    } catch (error) {
      console.log('⚠️  Não foi possível parsear a URL do banco de dados');
    }

    const confirmCredentials = await prompt('\n✅ Confirma que estas são as credenciais corretas? (s/N) ');
    if (confirmCredentials.trim().toLowerCase() !== 's') {
      console.log('❌ Migration cancelada pelo usuário');
      process.exit(0);
    }

    const answer = await prompt('\n🗑️  Deseja zerar o banco de dados? (s/N) ');
    const dropAll = answer.trim().toLowerCase() === 's';
    
    await runInitialMigration({ dropAll });
    console.log('✅ Migration inicial executada com sucesso!');
    process.exit(0);
  })().catch((err) => {
    console.error('❌ Falha ao executar migration inicial:', err);
    process.exit(1);
  });
} 