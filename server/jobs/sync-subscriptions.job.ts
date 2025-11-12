/**
 * Job: Sincronização Diária de Assinaturas com Asaas
 *
 * Roda diariamente às 3h AM
 * Sincroniza status de todas as assinaturas ativas com o Asaas
 */

import { storage } from '../storage';
import { getSubscriptionService } from '../services/subscription.service';

export async function syncSubscriptionsJob() {
  console.log('[SyncJob] Starting subscription sync...');

  try {
    const subscriptionService = getSubscriptionService(storage);

    // Buscar todas assinaturas ativas
    const activeSubscriptions = await storage.getAllActiveSubscriptions();

    console.log(`[SyncJob] Found ${activeSubscriptions.length} active subscriptions`);

    let successCount = 0;
    let errorCount = 0;

    // Sincronizar cada assinatura
    for (const subscription of activeSubscriptions) {
      try {
        await subscriptionService.syncSubscriptionStatus(subscription.usuarioId);
        successCount++;
      } catch (error) {
        console.error(`[SyncJob] Error syncing subscription ${subscription.id}:`, error);
        errorCount++;
      }
    }

    console.log(`[SyncJob] Sync completed. Success: ${successCount}, Errors: ${errorCount}`);

    return { success: successCount, errors: errorCount };
  } catch (error) {
    console.error('[SyncJob] Fatal error:', error);
    throw error;
  }
}

// Se executado diretamente (para testes)
if (require.main === module) {
  syncSubscriptionsJob()
    .then(() => {
      console.log('Job completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Job failed:', error);
      process.exit(1);
    });
}
