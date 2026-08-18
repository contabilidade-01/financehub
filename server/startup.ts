import { db, initializeDatabase } from "./db";
import { users, wallets } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import postgres from "postgres";

export async function validateAndInitializeDatabase() {
  console.log('🔍 Verificando estado do banco de dados...');
  
  try {
    // 1. Verificar se as tabelas existem
    await checkTablesExist();
    
    // 2. Executar migrations se necessário
    await runMigrationsIfNeeded();
    
    // 3. Verificar e criar usuário admin
    await ensureAdminUserExists();
    
    // Mostrar mensagem de sucesso com domínio do banco
    const dbUrl = process.env.DATABASE_URL || '';
    let dbHost = '';
    try {
      // Extrair host do DATABASE_URL
      const match = dbUrl.match(/postgres(?:ql)?:\/\/(?:[^:@]+(?::[^@]*)?@)?([^:/?#]+)(?::\d+)?/);
      dbHost = match ? match[1] : '';
    } catch {}
    if (dbHost) {
      console.log(`✅ Banco de dados inicializado com sucesso!\n🌐 Acesso ao banco: ${dbHost}`);
    } else {
      console.log('✅ Banco de dados inicializado com sucesso!');
    }
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco:', error);
    throw error;
  }
}

async function checkTablesExist() {
  try {
    // Verificar se db está inicializado
    if (!db) {
      console.log('⚠️ Banco não inicializado, pulando verificação de tabelas');
      return;
    }
    
    // Tentar uma query simples para verificar se a tabela users existe
    await db.select({ count: sql`count(*)` }).from(users);
    console.log('📋 Tabelas do banco de dados encontradas');
  } catch (error) {
    console.log('⚠️ Tabelas não encontradas, pulando verificação...');
  }
}

async function runMigrationsIfNeeded() {
  try {
    // Verificar se db está inicializado
    if (!db) {
      console.log('⚠️ Banco não inicializado, pulando migrations');
      return;
    }
    
    // Verificar se migrations precisam ser executadas
    const result = await db.select({ count: sql`count(*)` }).from(users).limit(1);
    console.log('📊 Schema do banco está atualizado');
  } catch (error) {
    console.log('🔄 Executando migrations do banco de dados...');
    
    try {
      // Executar o comando de migration usando drizzle-kit
      const { execSync } = await import('child_process');
      execSync('npx drizzle-kit push --config=drizzle.config.ts', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ Migrations executadas com sucesso');
    } catch (migrationError) {
      console.error('❌ Erro ao executar migrations:', migrationError);
      console.log('⚠️ Continuando sem migrations...');
    }
  }
}

async function ensureAdminUserExists() {
  console.log('👤 Verificando usuário admin...');
  const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
  try {
    // Verificar se admin já existe
    const existingAdmin = await client`
      SELECT id FROM usuarios WHERE email = 'teste@teste.com' LIMIT 1
    `;
    let adminId;
    if (existingAdmin.length > 0) {
      console.log('👤 Usuário admin já existe: teste@teste.com');
      adminId = existingAdmin[0].id;
    } else {
    console.log('👤 Criando usuário admin padrão...');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const result = await client`
      INSERT INTO usuarios (email, senha, nome, telefone, ativo, tipo_usuario, status_assinatura, data_expiracao_assinatura)
      VALUES ('teste@teste.com', ${hashedPassword}, 'Administrador', '(00) 00000-0000', true, 'super_admin', 'ativa', ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)})
      RETURNING id
    `;
      adminId = result[0].id;
    await client`
      INSERT INTO carteiras (nome, usuario_id, descricao)
      VALUES ('Carteira Principal', ${adminId}, 'Carteira principal do administrador')
    `;
    console.log('✅ Usuário admin criado com sucesso!');
    console.log('📧 Email: teste@teste.com');
    console.log('🔑 Senha: admin123');
    }
    // Verificar se existem categorias globais
    const globalCategories = await client`SELECT id FROM categorias WHERE global = true LIMIT 1`;
    if (globalCategories.length === 0) {
      console.log('📂 Nenhuma categoria global encontrada. Criando categorias globais padrão...');
      const defaultCategories = [
        { nome: 'Alimentação', tipo: 'Despesa', cor: '#FF6B6B', icone: '🍽️', descricao: 'Gastos com alimentação e refeições' },
        { nome: 'Transporte', tipo: 'Despesa', cor: '#4ECDC4', icone: '🚗', descricao: 'Gastos com transporte e locomoção' },
        { nome: 'Moradia', tipo: 'Despesa', cor: '#45B7D1', icone: '🏠', descricao: 'Gastos com moradia e aluguel' },
        { nome: 'Saúde', tipo: 'Despesa', cor: '#96CEB4', icone: '🏥', descricao: 'Gastos com saúde e medicamentos' },
        { nome: 'Educação', tipo: 'Despesa', cor: '#FFEAA7', icone: '📚', descricao: 'Gastos com educação e cursos' },
        { nome: 'Lazer', tipo: 'Despesa', cor: '#DDA0DD', icone: '🎮', descricao: 'Gastos com lazer e entretenimento' },
        { nome: 'Vestuário', tipo: 'Despesa', cor: '#F8BBD9', icone: '👕', descricao: 'Gastos com roupas e acessórios' },
        { nome: 'Serviços', tipo: 'Despesa', cor: '#FFB74D', icone: '🔧', descricao: 'Gastos com serviços diversos' },
        { nome: 'Impostos', tipo: 'Despesa', cor: '#A1887F', icone: '💰', descricao: 'Pagamento de impostos e taxas' },
        { nome: 'Dízimos e Ofertas', tipo: 'Despesa', cor: '#7E57C2', icone: '⛪', descricao: 'Dízimos, ofertas e contribuições religiosas' },
        { nome: 'Doações', tipo: 'Despesa', cor: '#EC407A', icone: '🤝', descricao: 'Doações para instituições, ONGs e causas sociais' },
        { nome: 'Outros', tipo: 'Despesa', cor: '#90A4AE', icone: '📦', descricao: 'Outros gastos diversos' },
        { nome: 'Salário', tipo: 'Receita', cor: '#4CAF50', icone: '💼', descricao: 'Receita de salário e trabalho' },
        { nome: 'Freelance', tipo: 'Receita', cor: '#8BC34A', icone: '💻', descricao: 'Receita de trabalhos freelancer' },
        { nome: 'Investimentos', tipo: 'Receita', cor: '#FFC107', icone: '📈', descricao: 'Receita de investimentos' },
        { nome: 'Presentes', tipo: 'Receita', cor: '#E91E63', icone: '🎁', descricao: 'Receita de presentes e doações recebidas' },
        { nome: 'Reembolso', tipo: 'Receita', cor: '#9C27B0', icone: '💸', descricao: 'Reembolsos e devoluções' },
        { nome: 'Outros', tipo: 'Receita', cor: '#607D8B', icone: '📦', descricao: 'Outras receitas diversas' }
      ];
      for (const category of defaultCategories) {
        await client`
          INSERT INTO categorias (nome, tipo, cor, icone, descricao, global, usuario_id)
          VALUES (${category.nome}, ${category.tipo}, ${category.cor}, ${category.icone}, ${category.descricao}, true, NULL)
          ON CONFLICT (nome, global) DO NOTHING
        `;
      }
      console.log('✅ Categorias globais padrão criadas!');
    } else {
      console.log('📂 Categorias globais já estão populadas.');
    }
    // Verificar se existem formas de pagamento globais
    const globalPaymentMethods = await client`SELECT id FROM formas_pagamento WHERE global = true LIMIT 1`;
    if (globalPaymentMethods.length === 0) {
      console.log('💳 Nenhuma forma de pagamento global encontrada. Criando formas de pagamento globais padrão...');
      const defaultPaymentMethods = [
        { nome: 'PIX', descricao: 'Pagamento via PIX', icone: '📱', cor: '#32CD32' },
        { nome: 'Cartão de Crédito', descricao: 'Pagamento com cartão de crédito', icone: '💳', cor: '#FF6B35' },
        { nome: 'Dinheiro', descricao: 'Pagamento em dinheiro', icone: '💵', cor: '#4CAF50' },
        { nome: 'Cartão de Débito', descricao: 'Pagamento com cartão de débito', icone: '🏦', cor: '#2196F3' },
        { nome: 'Transferência', descricao: 'Transferência bancária', icone: '🏛️', cor: '#9C27B0' },
        { nome: 'Boleto', descricao: 'Pagamento via boleto', icone: '📄', cor: '#FF9800' }
      ];
      for (const method of defaultPaymentMethods) {
        await client`
          INSERT INTO formas_pagamento (nome, descricao, icone, cor, global, ativo, usuario_id)
          VALUES (${method.nome}, ${method.descricao}, ${method.icone}, ${method.cor}, true, true, NULL)
          ON CONFLICT (nome, global) DO NOTHING
        `;
      }
      console.log('✅ Formas de pagamento globais padrão criadas!');
    } else {
      console.log('💳 Formas de pagamento globais já estão populadas.');
    }
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin ou categorias globais:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Função para aguardar conexão com banco
export async function waitForDatabase(maxAttempts = 15, delayMs = 1000) {
  console.log('⏳ Aguardando conexão com banco de dados...');
  
  // Se não há DATABASE_URL, não tentar conectar
  if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL não configurado, pulando verificação de banco');
    return;
  }
  
  // Se db não está inicializado, tentar inicializar
  if (!db) {
    try {
      console.log('🔄 Inicializando conexão com banco...');
      initializeDatabase(process.env.DATABASE_URL);
    } catch (error) {
      console.log('⚠️ Não foi possível inicializar banco, continuando...');
      return;
    }
  }
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }
      await db.select({ now: sql`NOW()` });
      console.log('✅ Conexão com banco estabelecida');
      return;
    } catch (error) {
      if (attempt <= 5) {
        console.log(`🔄 Tentativa ${attempt}/${maxAttempts} - Aguardando banco ficar disponível...`);
      }
      
      if (attempt === maxAttempts) {
        console.error('❌ Não foi possível conectar ao banco após todas as tentativas');
        console.error('⚠️ Error details:', error);
        console.log('⚠️ Continuando sem conexão com banco...');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}