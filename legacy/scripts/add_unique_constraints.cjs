const postgres = require('postgres');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL não configurado!');
  process.exit(1);
}

const client = postgres(dbUrl, { prepare: false });

async function addConstraints() {
  try {
    // Categorias
    await client`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_nome_global_categoria'
        ) THEN
          ALTER TABLE categorias ADD CONSTRAINT unique_nome_global_categoria UNIQUE (nome, global);
        END IF;
      END$$;
    `;
    // Formas de pagamento
    await client`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_nome_global_forma'
        ) THEN
          ALTER TABLE formas_pagamento ADD CONSTRAINT unique_nome_global_forma UNIQUE (nome, global);
        END IF;
      END$$;
    `;
    console.log('✅ Constraints únicas criadas com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao criar constraints:', err);
  } finally {
    await client.end();
  }
}

addConstraints(); 