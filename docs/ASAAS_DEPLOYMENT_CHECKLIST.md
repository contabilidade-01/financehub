# Asaas Integration - Deployment Checklist

## Pre-Deployment Setup

### 1. Install Required Dependencies

```bash
npm install node-cron @types/node-cron
```

### 2. Environment Variables

Add the following to your `.env` file:

```env
# Asaas Configuration
ASAAS_API_KEY=your_api_key_here
ASAAS_ENVIRONMENT=sandbox  # Change to 'production' when going live
ASAAS_WEBHOOK_SECRET=your_webhook_secret_here

# WAHA (WhatsApp Integration) - Optional
WAHA_API_URL=http://localhost:3000
WAHA_SESSION=default
WAHA_API_KEY=your_waha_key_here
```

### 3. Database Migration

Run the database migration to create the new tables:

```bash
npm run db:push
# or
npm run db:migrate
```

This will create the following tables:
- `subscription_plans`
- `asaas_customers`
- `user_subscriptions`
- `payment_transactions`
- `asaas_webhooks`

And add the `subscription_active` field to the `usuarios` table.

### 4. Create Initial Subscription Plan

After deployment, create your first subscription plan via admin panel or API:

```bash
curl -X POST http://localhost:5000/api/admin/subscription-plans \
  -H "Content-Type: application/json" \
  -d '{
    "planCode": "premium-monthly",
    "name": "Plano Premium Mensal",
    "priceMonthly": "29.90",
    "features": "[\"Transações ilimitadas\", \"Relatórios avançados\", \"Suporte prioritário\"]",
    "isActive": true
  }'
```

## Asaas Configuration

### 1. Create Asaas Account

1. Go to [Asaas Sandbox](https://sandbox.asaas.com) or [Asaas Production](https://www.asaas.com)
2. Create an account
3. Generate API key: Settings → Integrations → API Key

### 2. Configure Webhook

1. In Asaas Dashboard, go to Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/webhooks/asaas`
3. Select events to receive:
   - `PAYMENT_CREATED`
   - `PAYMENT_CONFIRMED`
   - `PAYMENT_RECEIVED`
   - `PAYMENT_OVERDUE`
   - `PAYMENT_REFUNDED`
   - `PAYMENT_UPDATED`
   - `SUBSCRIPTION_CREATED`
   - `SUBSCRIPTION_UPDATED`
4. Generate webhook secret and add to `.env` as `ASAAS_WEBHOOK_SECRET`

### 3. Test Webhook Locally (Development)

Use ngrok or similar to expose your local server:

```bash
ngrok http 5000
```

Then configure the ngrok URL in Asaas webhook settings.

## Application Setup

### 1. Enable Background Jobs

Uncomment the cron jobs in `server/jobs/scheduler.ts`:

```typescript
// Remove the comment marks from lines 17-35
cron.schedule('0 3 * * *', async () => {
  console.log('[Scheduler] Running daily sync job');
  try {
    await syncSubscriptionsJob();
  } catch (error) {
    console.error('[Scheduler] Sync job failed:', error);
  }
});

cron.schedule('0 */6 * * *', async () => {
  console.log('[Scheduler] Running retry payments job');
  try {
    await retryFailedPaymentsJob();
  } catch (error) {
    console.error('[Scheduler] Retry job failed:', error);
  }
});
```

### 2. Initialize Scheduler in Server

In `server/index.ts`, add the scheduler initialization:

```typescript
import { initializeScheduler } from './jobs/scheduler';

// After app initialization
initializeScheduler();
```

### 3. Add Subscription Middleware

The middleware `checkActiveSubscription` is already implemented. Make sure it's applied to protected routes in `server/routes.ts`.

## Testing

### 1. Test Card Numbers (Sandbox Only)

Use these test cards in sandbox environment:

**Approved Payment:**
- Card: `5162 3060 2717 6633`
- CVV: Any 3 digits
- Expiry: Any future date

**Declined Payment:**
- Card: `4000 0000 0000 0010`

### 2. Test Flow

1. **User Registration**
   - Create a new user account
   - Verify user can't access protected routes

2. **Subscription Creation**
   - Navigate to `/billing/checkout`
   - Select a plan
   - Fill personal info (CPF, address)
   - Enter credit card details
   - Submit and verify:
     - Payment created in Asaas
     - Subscription activated
     - User granted access
     - Email/WhatsApp notification sent

3. **Payment Success**
   - Verify webhook received: `PAYMENT_CONFIRMED`
   - Check user can access all features
   - Verify invoice appears in `/billing/invoices`

4. **Update Card**
   - Go to `/billing/settings`
   - Update credit card
   - Verify card updated in Asaas

5. **Cancel Subscription**
   - Go to `/billing/settings`
   - Cancel subscription with reason
   - Verify:
     - Subscription canceled in Asaas
     - User loses access after period ends
     - Cancellation recorded

6. **Payment Failure**
   - Manually mark a payment as overdue in Asaas
   - Verify webhook processed
   - Check retry count incremented
   - Verify notification sent
   - After 3rd retry, verify user blocked

7. **Admin Dashboard**
   - Login as super admin
   - Navigate to `/admin/billing`
   - Verify metrics displayed correctly
   - Test plan CRUD operations
   - Check webhook logs

### 3. Manual Job Execution (Testing)

You can manually trigger jobs for testing:

```typescript
// In server console or via API endpoint
import { runSyncNow, runRetryNow } from './server/jobs/scheduler';

// Run sync
await runSyncNow();

// Run retry
await runRetryNow();
```

## Production Checklist

### Before Going Live

- [ ] Change `ASAAS_ENVIRONMENT` to `production`
- [ ] Update API key to production key
- [ ] Configure production webhook URL
- [ ] Test webhook with production account
- [ ] Verify SSL certificate on webhook endpoint
- [ ] Set up monitoring for webhook failures
- [ ] Configure email SMTP for production
- [ ] Test WhatsApp integration (if using)
- [ ] Set up error logging (Sentry, etc.)
- [ ] Configure backup for database
- [ ] Document subscription cancellation policy
- [ ] Prepare customer support procedures
- [ ] Review PCI compliance requirements
- [ ] Test credit card validation
- [ ] Verify all translations are correct
- [ ] Create terms of service and privacy policy
- [ ] Set up revenue tracking/analytics

### Monitoring

Monitor these metrics:
- Webhook processing success rate
- Payment confirmation rate
- Subscription churn rate
- Failed payment retry success
- Daily sync job execution
- API response times

### Logs to Monitor

- `[AsaasService]` - API communication
- `[SubscriptionService]` - Business logic
- `[WebhookController]` - Webhook processing
- `[Scheduler]` - Background jobs
- `[NotificationService]` - Email/WhatsApp sending

## Troubleshooting

### Webhook Not Received

1. Check webhook URL is publicly accessible
2. Verify SSL certificate is valid
3. Check webhook secret matches
4. Review Asaas webhook logs

### Payment Not Confirming

1. Check Asaas dashboard for payment status
2. Verify webhook processing in `asaas_webhooks` table
3. Check for errors in server logs
4. Manually sync: `syncSubscriptionsJob()`

### User Can't Access After Payment

1. Verify `subscription_active` field in users table
2. Check `user_subscriptions` status
3. Run sync job manually
4. Check middleware logs

### Background Jobs Not Running

1. Verify node-cron is installed
2. Check scheduler initialization in server startup
3. Review cron expression syntax
4. Check server timezone settings

## Support

### Asaas Support
- Documentation: https://docs.asaas.com
- Support: suporte@asaas.com
- Sandbox: https://sandbox.asaas.com
- Production: https://www.asaas.com

### Internal Documentation
- Complete integration guide: `/ASAAS_INTEGRATION.md`
- API reference: See integration doc sections 4-7
- Database schema: See integration doc section 2

## Post-Deployment

### Day 1
- [ ] Monitor webhook processing
- [ ] Check first payments
- [ ] Verify notifications sent
- [ ] Monitor error logs

### Week 1
- [ ] Review payment success rate
- [ ] Check subscription activation rate
- [ ] Monitor customer support tickets
- [ ] Review sync job execution

### Month 1
- [ ] Calculate churn rate
- [ ] Review MRR growth
- [ ] Analyze payment failure reasons
- [ ] Optimize retry logic if needed
- [ ] Review customer feedback
