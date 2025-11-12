/**
 * Job: Retry de Pagamentos Falhados
 *
 * Roda a cada 6 horas
 * Verifica pagamentos vencidos e atualiza status
 * O Asaas faz retry automaticamente, apenas sincronizamos
 */

import { storage } from '../storage';
import { getAsaasService } from '../services/asaas.service';

export async function retryFailedPaymentsJob() {
  console.log('[RetryJob] Starting failed payments check...');

  try {
    const asaasService = getAsaasService();

    // Buscar pagamentos vencidos com retry < 3
    const overduePayments = await storage.getOverduePayments();

    console.log(`[RetryJob] Found ${overduePayments.length} overdue payments`);

    let updatedCount = 0;

    for (const payment of overduePayments) {
      try {
        // Buscar status atual no Asaas
        if (payment.asaasPaymentId) {
          const asaasPayment = await asaasService.getPayment(payment.asaasPaymentId);

          // Atualizar se mudou
          if (asaasPayment.status !== payment.status.toUpperCase()) {
            await storage.updatePaymentTransaction(payment.id, {
              status: asaasPayment.status.toLowerCase(),
              metadata: JSON.stringify(asaasPayment)
            });

            updatedCount++;
            console.log(`[RetryJob] Updated payment ${payment.id} to ${asaasPayment.status}`);
          }
        }
      } catch (error) {
        console.error(`[RetryJob] Error checking payment ${payment.id}:`, error);
      }
    }

    console.log(`[RetryJob] Checked ${overduePayments.length} payments, updated ${updatedCount}`);

    return { checked: overduePayments.length, updated: updatedCount };
  } catch (error) {
    console.error('[RetryJob] Fatal error:', error);
    throw error;
  }
}

if (require.main === module) {
  retryFailedPaymentsJob()
    .then(() => {
      console.log('Job completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Job failed:', error);
      process.exit(1);
    });
}
