import { db } from './server/db.ts';
import { eq } from 'drizzle-orm';
import { transactions, wallets } from './shared/schema.ts';

async function run() {
  try {
    const wallet = await db.select().from(wallets).where(eq(wallets.usuario_id, 5)).limit(1);
    console.log('Carteira do usuário 5:', wallet);

    if (wallet.length > 0) {
      const txs = await db.select().from(transactions).where(eq(transactions.carteira_id, wallet[0].id));
      console.log('Total de transações:', txs.length);
      console.log('Transações:', JSON.stringify(txs, null, 2));
    }
  } catch (error) {
    console.error('Erro:', error);
  }
  process.exit(0);
}

run();
