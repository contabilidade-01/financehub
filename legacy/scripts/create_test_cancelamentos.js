import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Configuração da conexão com o banco
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function createTestCancelamentos() {
  try {
    console.log('=== CRIANDO CANCELAMENTOS DE TESTE ===');
    
    // Buscar usuários existentes (exceto super admin)
    const users = await client`
      SELECT id, nome, email FROM usuarios 
      WHERE tipo_usuario != 'super_admin' 
      ORDER BY id 
      LIMIT 3
    `;
    
    if (users.length === 0) {
      console.log('Nenhum usuário encontrado para criar cancelamentos de teste');
      return;
    }
    
    // Cancelar alguns usuários de exemplo
    const cancelamentos = [
      {
        motivo: 'Preço muito alto para o orçamento atual',
        tipo: 'voluntario',
        observacoes: 'Cliente mencionou interesse em retornar no futuro'
      },
      {
        motivo: 'Não está usando a plataforma com frequência',
        tipo: 'voluntario', 
        observacoes: 'Baixa atividade nos últimos 3 meses'
      },
      {
        motivo: 'Problemas técnicos recorrentes',
        tipo: 'administrativo',
        observacoes: 'Cliente reportou bugs que afetaram a experiência'
      }
    ];
    
    for (let i = 0; i < Math.min(users.length, cancelamentos.length); i++) {
      const user = users[i];
      const cancelamento = cancelamentos[i];
      
      // Atualizar status do usuário
      await client`
        UPDATE usuarios 
        SET status_assinatura = 'cancelada', 
            data_cancelamento = NOW(),
            motivo_cancelamento = ${cancelamento.motivo}
        WHERE id = ${user.id}
      `;
      
      // Inserir no histórico de cancelamentos
      await client`
        INSERT INTO historico_cancelamentos 
        (usuario_id, motivo_cancelamento, tipo_cancelamento, observacoes)
        VALUES (${user.id}, ${cancelamento.motivo}, ${cancelamento.tipo}, ${cancelamento.observacoes})
      `;
      
      console.log(`✓ Cancelamento criado para: ${user.nome} (${user.email})`);
      console.log(`  Motivo: ${cancelamento.motivo}`);
      console.log(`  Tipo: ${cancelamento.tipo}`);
    }
    
    console.log(`\n✓ ${Math.min(users.length, cancelamentos.length)} cancelamentos de teste criados com sucesso`);
    
  } catch (error) {
    console.error('Erro ao criar cancelamentos de teste:', error);
  } finally {
    await client.end();
  }
}

createTestCancelamentos();