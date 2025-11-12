import postgres from "postgres";
import * as dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config();

async function addBillingIndexes() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida no arquivo .env");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log("Adicionando índices para otimização do sistema de pagamento...\n");

    // ============================================
    // ÍNDICES PARA subscription_plans
    // ============================================
    console.log("Criando índices para subscription_plans...");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
      ON subscription_plans(active)
      WHERE active = true
    `;
    console.log("  ✓ idx_subscription_plans_active");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_code
      ON subscription_plans(plan_code)
    `;
    console.log("  ✓ idx_subscription_plans_plan_code");

    // ============================================
    // ÍNDICES PARA asaas_customers
    // ============================================
    console.log("\nCriando índices para asaas_customers...");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_asaas_customers_usuario_id
      ON asaas_customers(usuario_id)
    `;
    console.log("  ✓ idx_asaas_customers_usuario_id");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_asaas_customers_asaas_customer_id
      ON asaas_customers(asaas_customer_id)
    `;
    console.log("  ✓ idx_asaas_customers_asaas_customer_id");

    // ============================================
    // ÍNDICES PARA user_subscriptions
    // ============================================
    console.log("\nCriando índices para user_subscriptions...");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_usuario_id
      ON user_subscriptions(usuario_id)
    `;
    console.log("  ✓ idx_user_subscriptions_usuario_id");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id
      ON user_subscriptions(plan_id)
    `;
    console.log("  ✓ idx_user_subscriptions_plan_id");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
      ON user_subscriptions(status)
    `;
    console.log("  ✓ idx_user_subscriptions_status");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_asaas_subscription_id
      ON user_subscriptions(asaas_subscription_id)
    `;
    console.log("  ✓ idx_user_subscriptions_asaas_subscription_id");

    // Índice composto para buscar assinaturas ativas de um usuário (query comum)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_usuario_status
      ON user_subscriptions(usuario_id, status)
    `;
    console.log("  ✓ idx_user_subscriptions_usuario_status");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period_end
      ON user_subscriptions(current_period_end)
    `;
    console.log("  ✓ idx_user_subscriptions_period_end");

    // ============================================
    // ÍNDICES PARA payment_transactions
    // ============================================
    console.log("\nCriando índices para payment_transactions...");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_usuario_id
      ON payment_transactions(usuario_id)
    `;
    console.log("  ✓ idx_payment_transactions_usuario_id");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription_id
      ON payment_transactions(subscription_id)
    `;
    console.log("  ✓ idx_payment_transactions_subscription_id");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_asaas_payment_id
      ON payment_transactions(asaas_payment_id)
    `;
    console.log("  ✓ idx_payment_transactions_asaas_payment_id");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
      ON payment_transactions(status)
    `;
    console.log("  ✓ idx_payment_transactions_status");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_due_date
      ON payment_transactions(due_date)
    `;
    console.log("  ✓ idx_payment_transactions_due_date");

    // Índice para buscar pagamentos vencidos (query do job de retry)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_overdue
      ON payment_transactions(status, retry_count)
      WHERE status = 'overdue' AND retry_count < 3
    `;
    console.log("  ✓ idx_payment_transactions_overdue");

    // Índice composto para consultas de histórico de pagamento por usuário
    await sql`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_usuario_created
      ON payment_transactions(usuario_id, created_at DESC)
    `;
    console.log("  ✓ idx_payment_transactions_usuario_created");

    // ============================================
    // ÍNDICES PARA asaas_webhooks
    // ============================================
    console.log("\nCriando índices para asaas_webhooks...");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_event_type
      ON asaas_webhooks(event_type)
    `;
    console.log("  ✓ idx_asaas_webhooks_event_type");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_asaas_event_id
      ON asaas_webhooks(asaas_event_id)
    `;
    console.log("  ✓ idx_asaas_webhooks_asaas_event_id");

    // Índice para buscar webhooks não processados (query do job de processamento)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_unprocessed
      ON asaas_webhooks(created_at)
      WHERE processed = false
    `;
    console.log("  ✓ idx_asaas_webhooks_unprocessed");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_processed
      ON asaas_webhooks(processed)
    `;
    console.log("  ✓ idx_asaas_webhooks_processed");

    // ============================================
    // ÍNDICE PARA usuarios.subscription_active
    // ============================================
    console.log("\nCriando índice para usuarios.subscription_active...");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_usuarios_subscription_active
      ON usuarios(subscription_active)
      WHERE subscription_active = true
    `;
    console.log("  ✓ idx_usuarios_subscription_active");

    console.log("\n✅ Todos os índices foram criados com sucesso!");
    console.log("\n📊 Benefícios dos índices criados:");
    console.log("   • Consultas de assinatura ativa por usuário (extremamente rápidas)");
    console.log("   • Busca de pagamentos vencidos para retry (otimizada)");
    console.log("   • Processamento de webhooks não processados (eficiente)");
    console.log("   • Histórico de pagamentos por usuário (paginação rápida)");
    console.log("   • Lookup de IDs do Asaas (cache hit instantâneo)");

  } catch (error) {
    console.error("\n❌ Erro ao executar migração:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addBillingIndexes();
