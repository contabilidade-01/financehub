import { drizzle } from 'drizzle-orm/neon-serverless';
import { neon } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as schema from './shared/schema.js';

// Verificar se DATABASE_URL está definido
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não está definido. Configure a variável de ambiente.");
  process.exit(1);
}

// Configurar o cliente de banco de dados
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

// Função para criar as tabelas
async function createTables() {
  console.log("Criando tabelas...");
  
  try {
    // Criar tabela de usuários
    await sql`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        remoteJid VARCHAR(255),
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        senha VARCHAR(255) NOT NULL,
        foto_perfil TEXT,
        ultimo_acesso TIMESTAMP,
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Tabela de usuários criada com sucesso.");

    // Criar tabela de carteiras
    await sql`
      CREATE TABLE IF NOT EXISTS carteiras (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        saldo_atual DECIMAL(15, 2) DEFAULT 0,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Tabela de carteiras criada com sucesso.");

    // Criar tabela de categorias
    await sql`
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        cor VARCHAR(7) DEFAULT '#7C3AED',
        icone VARCHAR(50) DEFAULT 'tag',
        tipo VARCHAR(20) NOT NULL,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        global BOOLEAN DEFAULT FALSE
      );
    `;
    console.log("Tabela de categorias criada com sucesso.");

    // Criar tabela de transações
    await sql`
      CREATE TABLE IF NOT EXISTS transacoes (
        id SERIAL PRIMARY KEY,
        descricao VARCHAR(255) NOT NULL,
        valor DECIMAL(15, 2) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        carteira_id INTEGER NOT NULL REFERENCES carteiras(id) ON DELETE CASCADE,
        data_transacao TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'Efetivada',
        notas TEXT,
        tags VARCHAR(255)[],
        data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Tabela de transações criada com sucesso.");

    // Adicionar categorias padrão globais
    await sql`
      INSERT INTO categorias (nome, descricao, cor, icone, tipo, global) 
      VALUES 
        ('Alimentação', 'Gastos com alimentação', '#FF6B6B', 'utensils', 'Despesa', TRUE),
        ('Moradia', 'Gastos com moradia', '#FF9F1C', 'home', 'Despesa', TRUE),
        ('Doações', 'Gastos com doações', '#E74C3C', 'heart', 'Despesa', TRUE),
        ('Educação', 'Gastos com educação', '#3A86FF', 'book', 'Despesa', TRUE),
        ('Imposto', 'Gastos com impostos', '#E67E22', 'receipt', 'Despesa', TRUE),
        ('Investimento', 'Gastos com investimentos', '#9B59B6', 'trending-up', 'Despesa', TRUE),
        ('Lazer', 'Gastos com lazer', '#8338EC', 'gamepad-2', 'Despesa', TRUE),
        ('Pets', 'Gastos com animais de estimação', '#F39C12', 'dog', 'Despesa', TRUE),
        ('Saude', 'Gastos com saúde', '#2EC4B6', 'stethoscope', 'Despesa', TRUE),
        ('Transporte', 'Gastos com transporte', '#4ECDC4', 'car', 'Despesa', TRUE),
        ('Vestuário', 'Gastos com roupas e acessórios', '#16A085', 'shirt', 'Despesa', TRUE),
        ('Viagem', 'Gastos com viagens', '#34495E', 'plane', 'Despesa', TRUE),
        ('Outros', 'Outras despesas', '#95A5A6', 'more-horizontal', 'Despesa', TRUE),
        ('Investimentos', 'Receita de investimentos', '#27AE60', 'trending-up', 'Receita', TRUE),
        ('Salário', 'Receita de salário', '#38B000', 'briefcase', 'Receita', TRUE),
        ('Freelance', 'Receita de trabalho freelancer', '#8338EC', 'code', 'Receita', TRUE),
        ('Outros', 'Outras receitas', '#FF9F1C', 'plus', 'Receita', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `;
    console.log("Categorias padrão criadas com sucesso.");

    console.log("Todas as tabelas criadas com sucesso!");
  } catch (error) {
    console.error("Erro ao criar tabelas:", error);
    process.exit(1);
  }
}

// Executar a migração
createTables()
  .then(() => {
    console.log("Migração concluída com sucesso!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro ao executar migração:", error);
    process.exit(1);
  });