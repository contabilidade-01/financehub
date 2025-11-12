/**
 * Job Scheduler
 *
 * Configuração de jobs agendados usando node-cron
 * Para usar, instalar: npm install node-cron @types/node-cron
 */

// import cron from 'node-cron';
import { syncSubscriptionsJob } from './sync-subscriptions.job';
import { retryFailedPaymentsJob } from './retry-failed-payments.job';

export function initializeScheduler() {
  console.log('[Scheduler] Initializing background jobs...');

  // Descomentar quando node-cron estiver instalado:

  // // Sincronização diária às 3h AM
  // cron.schedule('0 3 * * *', async () => {
  //   console.log('[Scheduler] Running daily sync job');
  //   try {
  //     await syncSubscriptionsJob();
  //   } catch (error) {
  //     console.error('[Scheduler] Sync job failed:', error);
  //   }
  // });

  // // Retry de pagamentos a cada 6 horas
  // cron.schedule('0 */6 * * *', async () => {
  //   console.log('[Scheduler] Running retry payments job');
  //   try {
  //     await retryFailedPaymentsJob();
  //   } catch (error) {
  //     console.error('[Scheduler] Retry job failed:', error);
  //   }
  // });

  console.log('[Scheduler] Jobs scheduled successfully');
  console.log('  - Sync subscriptions: Daily at 3:00 AM');
  console.log('  - Retry failed payments: Every 6 hours');
}

// Manual execution helpers (para testes)
export async function runSyncNow() {
  console.log('[Scheduler] Manual execution: sync subscriptions');
  return await syncSubscriptionsJob();
}

export async function runRetryNow() {
  console.log('[Scheduler] Manual execution: retry payments');
  return await retryFailedPaymentsJob();
}
