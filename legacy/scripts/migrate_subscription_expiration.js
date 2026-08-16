import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function addSubscriptionExpirationField() {
  try {
    console.log('Adicionando campo data_expiracao_assinatura à tabela usuarios...');
    
    await client`
      ALTER TABLE usuarios 
      ADD COLUMN IF NOT EXISTS data_expiracao_assinatura TIMESTAMPTZ;
    `;
    
    console.log('✓ Campo data_expiracao_assinatura adicionado com sucesso!');
    
    // Update existing users with subscription expiration dates (30 days from cancellation or now)
    console.log('Atualizando usuários existentes com datas de expiração...');
    
    await client`
      UPDATE usuarios 
      SET data_expiracao_assinatura = CASE 
        WHEN data_cancelamento IS NOT NULL 
        THEN data_cancelamento + INTERVAL '30 days'
        ELSE CURRENT_TIMESTAMP + INTERVAL '30 days'
      END
      WHERE data_expiracao_assinatura IS NULL;
    `;
    
    console.log('✓ Usuários existentes atualizados com datas de expiração!');
    
  } catch (error) {
    console.error('❌ Erro ao adicionar campo:', error);
  } finally {
    await client.end();
  }
}

addSubscriptionExpirationField();