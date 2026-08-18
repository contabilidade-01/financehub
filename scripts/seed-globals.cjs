#!/usr/bin/env node
const { Client } = require('pg');
const fs = require('fs');

// Obter DATABASE_URL
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const env = fs.readFileSync('.env', 'utf8');
  dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL=')).split('=')[1].replace(/['"]/g, '');
}

const categorias = [
  // Despesas
  { nome: 'Alimentação', tipo: 'Despesa', cor: '#FF6B6B', icone: '🍽️', descricao: 'Gastos com alimentação e refeições', global: true },
  { nome: 'Transporte', tipo: 'Despesa', cor: '#4ECDC4', icone: '🚗', descricao: 'Gastos com transporte e locomoção', global: true },
  { nome: 'Moradia', tipo: 'Despesa', cor: '#45B7D1', icone: '🏠', descricao: 'Gastos com moradia e aluguel', global: true },
  { nome: 'Saúde', tipo: 'Despesa', cor: '#96CEB4', icone: '🏥', descricao: 'Gastos com saúde e medicamentos', global: true },
  { nome: 'Educação', tipo: 'Despesa', cor: '#FFEAA7', icone: '📚', descricao: 'Gastos com educação e cursos', global: true },
  { nome: 'Lazer', tipo: 'Despesa', cor: '#DDA0DD', icone: '🎮', descricao: 'Gastos com lazer e entretenimento', global: true },
  { nome: 'Vestuário', tipo: 'Despesa', cor: '#F8BBD9', icone: '👕', descricao: 'Gastos com roupas e acessórios', global: true },
  { nome: 'Serviços', tipo: 'Despesa', cor: '#FFB74D', icone: '🔧', descricao: 'Gastos com serviços diversos', global: true },
  { nome: 'Impostos', tipo: 'Despesa', cor: '#A1887F', icone: '💰', descricao: 'Pagamento de impostos e taxas', global: true },
  { nome: 'Dízimos e Ofertas', tipo: 'Despesa', cor: '#7E57C2', icone: '⛪', descricao: 'Dízimos, ofertas e contribuições religiosas', global: true },
  { nome: 'Doações', tipo: 'Despesa', cor: '#EC407A', icone: '🤝', descricao: 'Doações para instituições, ONGs e causas sociais', global: true },
  { nome: 'Outros', tipo: 'Despesa', cor: '#90A4AE', icone: '📦', descricao: 'Outros gastos diversos', global: true },
  // Receitas
  { nome: 'Salário', tipo: 'Receita', cor: '#4CAF50', icone: '💼', descricao: 'Receita de salário e trabalho', global: true },
  { nome: 'Freelance', tipo: 'Receita', cor: '#8BC34A', icone: '💻', descricao: 'Receita de trabalhos freelancer', global: true },
  { nome: 'Investimentos', tipo: 'Receita', cor: '#FFC107', icone: '📈', descricao: 'Receita de investimentos', global: true },
  { nome: 'Presentes', tipo: 'Receita', cor: '#E91E63', icone: '🎁', descricao: 'Receita de presentes e doações', global: true },
  { nome: 'Reembolso', tipo: 'Receita', cor: '#9C27B0', icone: '💸', descricao: 'Reembolsos e devoluções', global: true },
  { nome: 'Outros', tipo: 'Receita', cor: '#607D8B', icone: '📦', descricao: 'Outras receitas diversas', global: true },
];

const formasPagamento = [
  { nome: 'PIX', descricao: 'Pagamento via PIX', icone: '📱', cor: '#32CD32', global: true, ativo: true },
  { nome: 'Cartão de Crédito', descricao: 'Pagamento com cartão de crédito', icone: '💳', cor: '#FF6B35', global: true, ativo: true },
  { nome: 'Dinheiro', descricao: 'Pagamento em dinheiro', icone: '💵', cor: '#4CAF50', global: true, ativo: true },
  { nome: 'Cartão de Débito', descricao: 'Pagamento com cartão de débito', icone: '🏦', cor: '#2196F3', global: true, ativo: true },
  { nome: 'Transferência', descricao: 'Transferência bancária', icone: '🏛️', cor: '#9C27B0', global: true, ativo: true },
  { nome: 'Boleto', descricao: 'Pagamento via boleto', icone: '📄', cor: '#FF9800', global: true, ativo: true },
];

(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  for (const cat of categorias) {
    await client.query(
      `INSERT INTO categorias (nome, tipo, cor, icone, descricao, global) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nome, tipo, global) DO NOTHING`,
      [cat.nome, cat.tipo, cat.cor, cat.icone, cat.descricao, cat.global]
    );
  }

  for (const fp of formasPagamento) {
    await client.query(
      `INSERT INTO formas_pagamento (nome, descricao, icone, cor, global, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nome, global) DO NOTHING`,
      [fp.nome, fp.descricao, fp.icone, fp.cor, fp.global, fp.ativo]
    );
  }

  await client.end();
  console.log('✅ Categorias e formas de pagamento globais inseridas!');
})(); 

// Remover duplicatas de formas de pagamento globais (manter o de menor id)
(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Remove duplicatas de formas de pagamento globais
  const { rows } = await client.query(`
    SELECT id
    FROM formas_pagamento
    WHERE nome = 'Cartão de Crédito' AND global = true
    ORDER BY id ASC
  `);
  if (rows.length > 1) {
    // Mantém o de menor id
    const idsToDelete = rows.slice(1).map(r => r.id);
    await client.query(
      `DELETE FROM formas_pagamento WHERE id = ANY($1)`,
      [idsToDelete]
    );
    console.log(`Removidas duplicatas de 'Cartão de Crédito' (ids: ${idsToDelete.join(', ')})`);
  } else {
    console.log('Nenhuma duplicata de Cartão de Crédito encontrada.');
  }

  await client.end();
})(); 