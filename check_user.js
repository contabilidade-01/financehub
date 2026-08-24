import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    const client = await pool.connect();

    // Buscar carteira do usuário 5
    const walletRes = await client.query('SELECT * FROM carteiras WHERE usuario_id = 5');
    console.log('Carteiras do usuário 5:', walletRes.rows);

    if (walletRes.rows.length > 0) {
      const walletId = walletRes.rows[0].id;
      const txRes = await client.query('SELECT * FROM transacoes WHERE carteira_id = $1 ORDER BY data_transacao DESC', [walletId]);
      console.log(`Total de transações para carteira ${walletId}:`, txRes.rows.length);
      console.log('Transações:', JSON.stringify(txRes.rows, null, 2));

      // Calcular soma real
      let totalReceita = 0;
      let totalDespesa = 0;
      for (const t of txRes.rows) {
        const val = parseFloat(t.valor) || 0;
        if (t.tipo === 'Receita') totalReceita += val;
        if (t.tipo === 'Despesa') totalDespesa += val;
      }
      console.log(`Soma Real — Receitas: R$ ${totalReceita}, Despesas: R$ ${totalDespesa}, Saldo: R$ ${totalReceita - totalDespesa}`);
    }

    client.release();
  } catch (err) {
    console.error('Erro ao consultar banco:', err);
  } finally {
    await pool.end();
  }
}

run();
