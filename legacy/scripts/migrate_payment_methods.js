import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

async function createPaymentMethodsTable() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  console.log('=== CREATING PAYMENT METHODS TABLE ===');

  try {
    // Create payment methods table
    await client`
      CREATE TABLE IF NOT EXISTS formas_pagamento (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        icone VARCHAR(100),
        cor VARCHAR(50),
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        global BOOLEAN NOT NULL DEFAULT false,
        ativo BOOLEAN NOT NULL DEFAULT true,
        data_criacao TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
      )
    `;
    console.log('✓ Payment methods table created successfully');

    // Add forma_pagamento_id column to transactions table
    await client`
      ALTER TABLE transacoes 
      ADD COLUMN IF NOT EXISTS forma_pagamento_id INTEGER REFERENCES formas_pagamento(id)
    `;
    console.log('✓ Payment method reference added to transactions table');

    // Insert global payment methods
    const globalPaymentMethods = [
      {
        nome: 'Cartão de Crédito',
        descricao: 'Pagamentos realizados com cartão de crédito',
        icone: 'CreditCard',
        cor: '#3B82F6',
        global: true
      },
      {
        nome: 'PIX',
        descricao: 'Transferências instantâneas via PIX',
        icone: 'Smartphone',
        cor: '#10B981',
        global: true
      },
      {
        nome: 'Dinheiro',
        descricao: 'Pagamentos em espécie',
        icone: 'Banknote',
        cor: '#F59E0B',
        global: true
      }
    ];

    for (const method of globalPaymentMethods) {
      // Check if payment method already exists
      const existing = await client`
        SELECT id FROM formas_pagamento 
        WHERE nome = ${method.nome} AND global = true
      `;

      if (existing.length === 0) {
        await client`
          INSERT INTO formas_pagamento (nome, descricao, icone, cor, global)
          VALUES (${method.nome}, ${method.descricao}, ${method.icone}, ${method.cor}, ${method.global})
        `;
        console.log(`✓ Global payment method "${method.nome}" created`);
      } else {
        console.log(`• Global payment method "${method.nome}" already exists`);
      }
    }

    console.log('=== PAYMENT METHODS MIGRATION COMPLETED ===');
    await client.end();
    return true;
  } catch (error) {
    console.error('Error in payment methods migration:', error);
    await client.end();
    return false;
  }
}

// Run migration if called directly
createPaymentMethodsTable()
  .then((success) => {
    if (success) {
      console.log('Payment methods migration completed successfully');
      process.exit(0);
    } else {
      console.error('Payment methods migration failed');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });

export { createPaymentMethodsTable };