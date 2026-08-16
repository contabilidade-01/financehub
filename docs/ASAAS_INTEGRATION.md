# 🔌 Integração Asaas - Documentação

## 📋 Visão Geral

Este documento descreve a integração completa do sistema de pagamentos recorrentes via Asaas para o FinanceHub.

**Características implementadas:**
- ✅ Assinatura mensal recorrente
- ✅ Pagamento via cartão de crédito
- ✅ Webhooks automáticos do Asaas
- ✅ Retry de pagamentos (até 3 tentativas)
- ✅ Bloqueio automático após falhas
- ✅ Notificações por email/WhatsApp
- ✅ Dashboard admin completo
- ✅ Gestão de planos (CRUD)

---

## 🔧 Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis ao arquivo `.env`:

```bash
# ============================================
# ASAAS PAYMENT GATEWAY
# ============================================

# Ambiente: 'sandbox' para testes, 'production' para produção
ASAAS_ENVIRONMENT=sandbox

# API Key do Asaas (obter em: https://sandbox.asaas.com/config/api)
ASAAS_API_KEY=seu_api_key_aqui

# ID da carteira Asaas (opcional)
ASAAS_WALLET_ID=sua_carteira_id

# Secret para validação de webhooks (gerar um hash único)
# Exemplo: openssl rand -hex 32
ASAAS_WEBHOOK_SECRET=seu_secret_unico_aqui

# URL do webhook (configurar no painel Asaas)
ASAAS_WEBHOOK_URL=https://seu-dominio.com.br/api/webhooks/asaas

# ============================================
# EMAIL SERVICE (Opcional - para notificações)
# ============================================

EMAIL_FROM=noreply@financehub.com.br

# Opção 1: SMTP
EMAIL_SERVICE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_app

# Opção 2: SendGrid (futuro)
# SENDGRID_API_KEY=

# ============================================
# WHATSAPP (Já configurado via WAHA)
# ============================================

WAHA_ENABLED=true
```

### 2. Criar Conta no Asaas

**Ambiente de Testes (Sandbox):**
1. Acesse: https://sandbox.asaas.com/signup
2. Crie uma conta de testes
3. Obtenha a API Key em: https://sandbox.asaas.com/config/api
4. Configure o webhook em: https://sandbox.asaas.com/config/webhook

**Ambiente de Produção:**
1. Acesse: https://www.asaas.com/signup
2. Complete o cadastro e verificação
3. Obtenha a API Key de produção
4. Configure o webhook de produção

### 3. Configurar Webhook no Asaas

No painel do Asaas:

1. Acesse: **Configurações → Webhooks**
2. Adicione a URL: `https://seu-dominio.com.br/api/webhooks/asaas`
3. Selecione os eventos:
   - ✅ PAYMENT_CREATED
   - ✅ PAYMENT_CONFIRMED
   - ✅ PAYMENT_RECEIVED
   - ✅ PAYMENT_OVERDUE
   - ✅ PAYMENT_REFUNDED
   - ✅ PAYMENT_RECEIVED_IN_CASH_UNDONE
4. Copie o Access Token e adicione em `ASAAS_WEBHOOK_SECRET`

---

## 📊 Estrutura do Banco de Dados

### Novas Tabelas

**1. `subscription_plans`** - Planos de assinatura disponíveis
```sql
- id: serial PRIMARY KEY
- plan_code: varchar(50) UNIQUE (ex: 'basic', 'pro')
- name: varchar(100) (ex: 'Plano Básico')
- description: text
- price_monthly: decimal(10,2)
- features: text (JSON string)
- max_transactions: integer (0 = ilimitado)
- max_wallets: integer
- max_categories: integer
- active: boolean
- created_at, updated_at: timestamp
```

**2. `asaas_customers`** - Cache de clientes no Asaas
```sql
- id: serial PRIMARY KEY
- usuario_id: integer UNIQUE FK -> usuarios.id
- asaas_customer_id: varchar(100) UNIQUE
- cpf_cnpj: varchar(18)
- created_at, updated_at: timestamp
```

**3. `user_subscriptions`** - Assinaturas dos usuários
```sql
- id: serial PRIMARY KEY
- usuario_id: integer FK -> usuarios.id
- plan_id: integer FK -> subscription_plans.id
- asaas_subscription_id: varchar(100) UNIQUE
- status: varchar(50) ('active', 'past_due', 'canceled', 'expired')
- current_period_start, current_period_end: timestamp
- canceled_at, ended_at: timestamp
- cancellation_reason: text
- created_at, updated_at: timestamp
```

**4. `payment_transactions`** - Histórico de cobranças
```sql
- id: serial PRIMARY KEY
- usuario_id: integer FK -> usuarios.id
- subscription_id: integer FK -> user_subscriptions.id
- asaas_payment_id: varchar(100) UNIQUE
- asaas_invoice_url: text
- amount: decimal(10,2)
- currency: varchar(3) DEFAULT 'BRL'
- status: varchar(50) ('pending', 'confirmed', 'overdue', 'refunded')
- payment_method: varchar(50) ('credit_card', 'boleto', 'pix')
- due_date: date
- confirmed_date: timestamp
- description: text
- retry_count: integer DEFAULT 0
- metadata: text (JSON)
- created_at, updated_at: timestamp
```

**5. `asaas_webhooks`** - Log de eventos recebidos
```sql
- id: serial PRIMARY KEY
- event_type: varchar(100)
- asaas_event_id: varchar(100) UNIQUE
- payload: text (JSON completo)
- processed: boolean DEFAULT false
- processed_at: timestamp
- error_message: text
- created_at: timestamp
```

### Modificações em Tabelas Existentes

**`usuarios`:**
- Adicionado: `subscription_active: boolean DEFAULT false` (denormalização para performance)

---

## 🔀 Fluxos Implementados

### Fluxo 1: Criar Assinatura (Checkout)

```
1. Usuário acessa /billing/checkout
2. Seleciona plano
3. Preenche dados do cartão de crédito
4. Frontend envia POST /api/billing/checkout
   {
     planId: 1,
     cpfCnpj: "12345678900",
     creditCard: { ... },
     creditCardHolderInfo: { ... }
   }
5. Backend (BillingController.checkout):
   - Valida dados
   - Chama SubscriptionService.createSubscription()
6. SubscriptionService:
   - Cria/busca customer no Asaas
   - Cria subscription no Asaas
   - Salva no banco (user_subscriptions)
   - Busca primeiro payment gerado
   - Salva payment_transaction
   - Se aprovado → ativa usuário
   - Envia notificação
7. Resposta ao frontend com status
```

### Fluxo 2: Webhook - Pagamento Confirmado

```
1. Asaas envia POST /api/webhooks/asaas
   {
     event: "PAYMENT_CONFIRMED",
     payment: { id: "pay_xxx", ... }
   }
2. AsaasWebhookController.handleAsaasWebhook():
   - Verifica assinatura do webhook
   - Salva em asaas_webhooks (log)
   - Processa evento
3. processWebhookEvent():
   - Atualiza payment_transaction → status='confirmed'
   - Chama SubscriptionService.activateUserSubscription()
   - Atualiza user.subscription_active = true
   - Envia notificação de confirmação
4. Retorna 200 OK para Asaas
```

### Fluxo 3: Webhook - Pagamento Vencido (Retry)

```
1. Asaas envia POST /api/webhooks/asaas
   {
     event: "PAYMENT_OVERDUE",
     payment: { id: "pay_xxx", ... }
   }
2. processWebhookEvent():
   - Incrementa retry_count
   - Atualiza payment_transaction → status='overdue'
   - Chama SubscriptionService.handlePaymentFailure(paymentId, retryCount)
3. handlePaymentFailure():
   - Se retry_count < 3:
     - Envia notificação de falha (tentativa N/3)
   - Se retry_count >= 3:
     - Desativa assinatura (deactivateUserSubscription)
     - subscription.status = 'past_due'
     - user.subscription_active = false
     - Envia notificação de bloqueio
4. Usuário recebe email/WhatsApp para atualizar cartão
```

### Fluxo 4: Cancelamento por Usuário

```
1. Usuário acessa /billing/settings
2. Clica em "Cancelar Assinatura"
3. Preenche motivo
4. Frontend envia POST /api/billing/cancel { reason: "..." }
5. BillingController.cancelSubscription():
   - Chama SubscriptionService.cancelSubscription(userId, reason)
6. SubscriptionService.cancelSubscription():
   - Cancela no Asaas (DELETE subscription)
   - Atualiza user_subscriptions → status='canceled'
   - Atualiza user → subscription_active=false
   - Registra em historico_cancelamentos
   - Envia notificação de cancelamento
7. Usuário perde acesso (middleware bloqueia endpoints)
```

---

## 🛣️ API Endpoints

### Públicos

**Listar Planos:**
```http
GET /api/subscription-plans
Response: [ { id, name, description, priceMonthly, features, ... } ]
```

**Detalhes do Plano:**
```http
GET /api/subscription-plans/:id
Response: { id, name, description, priceMonthly, features, ... }
```

### Usuário Autenticado

**Checkout (Criar Assinatura):**
```http
POST /api/billing/checkout
Authorization: Bearer token | Cookie
Body: {
  planId: number,
  cpfCnpj: string,
  creditCard: {
    holderName, number, expiryMonth, expiryYear, ccv
  },
  creditCardHolderInfo: {
    name, email, cpfCnpj, postalCode, addressNumber, phone
  }
}
Response: { success, message, subscription, payment }
```

**Ver Assinatura Atual:**
```http
GET /api/billing/subscription
Response: { hasSubscription, subscription: { id, status, plan, ... } }
```

**Listar Faturas:**
```http
GET /api/billing/invoices?limit=50
Response: { total, payments: [ { id, amount, status, dueDate, invoiceUrl, ... } ] }
```

**Detalhes de Fatura:**
```http
GET /api/billing/invoice/:id
Response: { id, amount, status, invoiceUrl, metadata, ... }
```

**Histórico de Pagamentos:**
```http
GET /api/billing/payment-history
Response: { summary: { total, confirmed, pending, overdue, totalPaid }, payments: [...] }
```

**Cancelar Assinatura:**
```http
POST /api/billing/cancel
Body: { reason: string }
Response: { success: true, message: "Assinatura cancelada" }
```

**Atualizar Cartão:**
```http
PUT /api/billing/update-card
Body: { creditCard: {...}, creditCardHolderInfo: {...} }
Response: { success: true, message: "Cartão atualizado" }
```

### Admin (Super Admin Only)

**Listar Todos os Planos:**
```http
GET /api/admin/subscription-plans
Response: [ { id, planCode, name, active, ... } ]
```

**Criar Plano:**
```http
POST /api/admin/subscription-plans
Body: { planCode, name, description, priceMonthly, features, maxTransactions, ... }
Response: { id, planCode, name, ... }
```

**Atualizar Plano:**
```http
PUT /api/admin/subscription-plans/:id
Body: { name, priceMonthly, active, ... }
Response: { id, planCode, name, ... }
```

**Deletar Plano (Soft Delete):**
```http
DELETE /api/admin/subscription-plans/:id
Response: { message: "Plano desativado" }
```

**Listar Webhooks:**
```http
GET /api/admin/webhooks?limit=100&unprocessed=true
Response: { total, webhooks: [ { id, eventType, processed, ... } ] }
```

**Reprocessar Webhook:**
```http
POST /api/admin/webhooks/:id/retry
Response: { message: "Webhook reprocessado" }
```

### Webhook (Público - validado internamente)

**Receber Evento do Asaas:**
```http
POST /api/webhooks/asaas
Headers: { 'asaas-access-token': 'SECRET' }
Body: { event: 'PAYMENT_CONFIRMED', payment: {...} }
Response: { message: "Webhook processado" }
```

---

## 🔒 Segurança

### Validação de Webhooks

```typescript
// No AsaasService
verifyWebhook(requestToken: string): boolean {
  return requestToken === process.env.ASAAS_WEBHOOK_SECRET;
}
```

**IMPORTANTE:** Configure um secret forte e único em `ASAAS_WEBHOOK_SECRET`

### Tokenização de Cartões

**NUNCA armazenamos dados de cartão no banco!**
- O frontend envia dados do cartão diretamente para o Asaas
- Apenas tokens e IDs do Asaas são armazenados
- Compliance PCI-DSS

### Middleware de Verificação

```typescript
// Bloqueia endpoints se assinatura inativa
checkActiveSubscription(req, res, next)

// Requer assinatura obrigatoriamente
requireActiveSubscription(req, res, next)

// Impede múltiplas assinaturas
requireNoSubscription(req, res, next)
```

---

## 🧪 Testes

### Cartões de Teste (Sandbox Asaas)

**Aprovado:**
```
Número: 5162306219378829
CVV: qualquer
Validade: qualquer data futura
```

**Recusado:**
```
Número: 5184019740373151
CVV: qualquer
Validade: qualquer data futura
```

### Testar Webhook Localmente

1. Instalar ngrok: `npm install -g ngrok`
2. Expor servidor local: `ngrok http 5000`
3. Copiar URL: `https://abc123.ngrok.io`
4. Configurar no Asaas: `https://abc123.ngrok.io/api/webhooks/asaas`
5. Fazer teste de pagamento

---

## 📈 Próximos Passos

**Backend Completo:** ✅
- [x] Schema do banco
- [x] Services (Asaas, Subscription, Notification)
- [x] Controllers (Plans, Billing, Webhooks)
- [x] Routes & Middleware
- [x] Storage methods

**Pendente (Frontend):**
- [ ] Página de checkout
- [ ] Componente de cartão de crédito
- [ ] Dashboard de faturas
- [ ] Admin billing panel
- [ ] Traduções i18n

**Pendente (Jobs):**
- [ ] Job de sincronização diária
- [ ] Job de retry de pagamentos
- [ ] Job de lembrete de vencimento

---

## 🆘 Suporte

**Documentação Asaas:**
- API Reference: https://docs.asaas.com/reference
- Webhooks: https://docs.asaas.com/docs/webhooks
- Sandbox: https://sandbox.asaas.com

**Contato:**
- Email: support@asaas.com
- Chat: Disponível no painel

---

## ✅ Checklist de Deploy

Antes de ir para produção:

- [ ] Criar conta Asaas produção
- [ ] Obter API Key de produção
- [ ] Configurar webhook de produção
- [ ] Atualizar `ASAAS_ENVIRONMENT=production`
- [ ] Testar fluxo completo em staging
- [ ] Configurar email service
- [ ] Criar plano inicial no admin
- [ ] Testar webhooks com pagamento real
- [ ] Monitorar logs de webhooks
- [ ] Configurar alertas de falha

---

**Última atualização:** 2025-11-11
**Versão:** 1.0.0
