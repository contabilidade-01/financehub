#!/usr/bin/env node

import postgres from 'postgres';

// Conectar ao banco usando a URL do ambiente
const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

async function updateDefaultCategories() {
  try {
    console.log('🔄 Iniciando atualização das categorias padrão globais...');

    // Primeiro, remover todas as categorias globais existentes
    await sql`DELETE FROM categorias WHERE global = TRUE;`;
    console.log('✅ Categorias globais antigas removidas.');

    // Inserir as novas categorias globais padrão
    await sql`
      INSERT INTO categorias (nome, descricao, cor, icone, tipo, global) 
      VALUES 
        -- Despesas (13 categorias)
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
        
        -- Receitas (4 categorias)
        ('Investimentos', 'Receita de investimentos', '#27AE60', 'trending-up', 'Receita', TRUE),
        ('Salário', 'Receita de salário', '#38B000', 'briefcase', 'Receita', TRUE),
        ('Freelance', 'Receita de trabalho freelancer', '#8338EC', 'code', 'Receita', TRUE),
        ('Outros', 'Outras receitas', '#FF9F1C', 'plus', 'Receita', TRUE);
    `;

    console.log('✅ Novas categorias globais padrão inseridas com sucesso!');
    
    // Verificar quantas categorias foram criadas
    const despesas = await sql`SELECT COUNT(*) as count FROM categorias WHERE global = TRUE AND tipo = 'Despesa';`;
    const receitas = await sql`SELECT COUNT(*) as count FROM categorias WHERE global = TRUE AND tipo = 'Receita';`;
    
    console.log(`📊 Resultado da migração:`);
    console.log(`   - Categorias de Despesa: ${despesas[0].count}`);
    console.log(`   - Categorias de Receita: ${receitas[0].count}`);
    console.log(`   - Total de categorias globais: ${Number(despesas[0].count) + Number(receitas[0].count)}`);

  } catch (error) {
    console.error('❌ Erro ao atualizar categorias padrão:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Executar a migração
updateDefaultCategories();