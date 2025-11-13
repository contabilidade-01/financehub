# 📡 API de Checkout Externo - Documentação

Este documento descreve os novos endpoints criados para o sistema de checkout externo com tokens.

---

## 🔑 Conceitos

### Token de Checkout
O token de checkout é uma string base64 que contém o ID do usuário e seu email no formato:
```
base64(userId:email)
```

**Exemplo:**
```
userId: 123
email: user@email.com
token: MTIzOnVzZXJAZW1haWwuY29t
```

---

## 📋 Endpoints

### 1. Validar Token de Checkout

Valida um token de checkout externo e retorna dados do usuário e planos disponíveis.

**Endpoint:** `GET /api/billing/checkout/validate/{token}`

**Autenticação:** Nenhuma (público)

**Parâmetros:**
- `token` (path, required): Token de checkout em base64

**Exemplo de Request:**
```bash
GET /api/billing/checkout/validate/MTIzOnVzZXJAZW1haWwuY29t
```

**Exemplo de Response (200):**
```json
{
  "valid": true,
  "user": {
    "id": 123,
    "nome": "João Silva",
    "email": "user@email.com"
  },
  "plans": [
    {
      "id": 1,
      "name": "Plano Básico",
      "description": "Plano com recursos básicos",
      "priceMonthly": 29.90,
      "features": "[\"Feature 1\", \"Feature 2\"]"
    }
  ]
}
```

**Possíveis Erros:**
- `400`: Token inválido ou usuário já possui assinatura
- `404`: Usuário não encontrado

---

### 2. Processar Checkout (com token)

Processa o pagamento e cria assinatura. Aceita checkout autenticado ou com token externo.

**Endpoint:** `POST /api/billing/checkout`

**Autenticação:** Cookie (sessão) OU `checkoutToken` no body

**Body Parameters:**
```json
{
  "planId": 1,
  "cpfCnpj": "12345678901",
  "creditCard": {
    "holderName": "João Silva",
    "number": "4111111111111111",
    "expiryMonth": "12",
    "expiryYear": "2025",
    "ccv": "123"
  },
  "creditCardHolderInfo": {
    "name": "João Silva",
    "email": "user@email.com",
    "cpfCnpj": "12345678901",
    "postalCode": "12345678",
    "addressNumber": "100",
    "addressComplement": "Apto 10",
    "phone": "11999999999",
    "mobilePhone": "11999999999"
  },
  "checkoutToken": "MTIzOnVzZXJAZW1haWwuY29t",
  "remoteIp": "192.168.1.1"
}
```

**Nota:** Se `checkoutToken` for fornecido, não é necessário autenticação de sessão.

**Exemplo de Response (201):**
```json
{
  "success": true,
  "message": "Assinatura criada com sucesso",
  "status": "confirmed",
  "waitForWebhook": false,
  "paymentId": 456,
  "subscription": {
    "id": 789,
    "status": "active"
  },
  "payment": {
    "id": 456,
    "status": "confirmed",
    "amount": "29.90",
    "dueDate": "2025-01-15",
    "invoiceUrl": "https://..."
  }
}
```

---

### 3. Buscar Mensagem Processada (Admin)

Busca uma mensagem de boas-vindas com todas as tags substituídas.

**Endpoint:** `GET /api/admin/welcome-messages/{type}?userId={userId}`

**Autenticação:** Cookie (Super Admin)

**Parâmetros:**
- `type` (path, required): Tipo da mensagem (`welcome`, `activation`, `pre_activation`)
- `userId` (query, optional): ID do usuário para processar tags

**Exemplo sem processar tags:**
```bash
GET /api/admin/welcome-messages/welcome
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "type": "welcome",
    "title": "Bem-vindo, {nome}!",
    "message": "Clique aqui: {link_pagamento}",
    "email_content": "..."
  }
}
```

**Exemplo processando tags:**
```bash
GET /api/admin/welcome-messages/welcome?userId=123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "type": "welcome",
    "title": "Bem-vindo, João Silva!",
    "message": "Clique aqui: http://localhost:5000/checkout/plans?tokenaccess=MTIzOnVzZXJAZW1haWwuY29t",
    "email_content": "..."
  }
}
```

---

### 4. Buscar Mensagem Processada (Público)

Busca uma mensagem com todas as tags processadas para um usuário específico.

**Endpoint:** `GET /api/welcome-messages/{type}/user/{userId}`

**Autenticação:** Nenhuma (público)

**Parâmetros:**
- `type` (path, required): Tipo da mensagem
- `userId` (path, required): ID do usuário

**Exemplo:**
```bash
GET /api/welcome-messages/welcome/user/123
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "type": "welcome",
    "title": "Bem-vindo, João Silva!",
    "message": "Olá João Silva!\n\nSua conta foi criada com sucesso...\n\nClique aqui para ativar: http://localhost:5000/checkout/plans?tokenaccess=MTIzOnVzZXJAZW1haWwuY29t",
    "email_content": "..."
  }
}
```

---

## 🔄 Fluxo de Integração Completo

### 1. Sistema Externo Busca Mensagem Processada

```javascript
// Quando usuário se cadastra
const userId = 123;

// Buscar mensagem com link de pagamento já processado
const response = await fetch(
  `https://api.financehub.com/api/welcome-messages/welcome/user/${userId}`
);

const { data } = await response.json();

// Mensagem já contém o link correto
console.log(data.message);
// Output: "Clique aqui: http://localhost:5000/checkout/plans?tokenaccess=MTIzOmp..."
```

### 2. Enviar Mensagem ao Usuário

```javascript
// Enviar via WhatsApp
await enviarWhatsApp(userPhone, data.message);

// Enviar via Email
await enviarEmail(userEmail, data.title, data.email_content);
```

### 3. Usuário Acessa o Link

```
http://localhost:5000/checkout/plans?tokenaccess=MTIzOnVzZXJAZW1haWwuY29t
```

### 4. Frontend Valida Token

```javascript
// Frontend valida automaticamente
const token = new URLSearchParams(window.location.search).get('tokenaccess');

const validation = await fetch(`/api/billing/checkout/validate/${token}`);
const { valid, user, plans } = await validation.json();

if (valid) {
  // Renderiza checkout com dados do usuário
  renderCheckout(user, plans);
}
```

### 5. Usuário Completa Pagamento

```javascript
const checkoutData = {
  planId: selectedPlan.id,
  cpfCnpj: "12345678901",
  creditCard: { /* ... */ },
  creditCardHolderInfo: { /* ... */ },
  checkoutToken: token // ← Token incluído
};

const result = await fetch('/api/billing/checkout', {
  method: 'POST',
  body: JSON.stringify(checkoutData)
});
```

### 6. Sistema Processa Pagamento

- Backend valida token
- Processa pagamento via Asaas
- Ativa assinatura
- Envia mensagem de ativação

---

## 🔒 Segurança

### Validações Implementadas

1. **Token válido**: Verifica formato base64 correto
2. **Usuário existe**: Valida que userId existe no banco
3. **Email corresponde**: Verifica que email do token = email do usuário
4. **Sem assinatura ativa**: Impede pagamento duplicado
5. **Auto-invalidação**: Após pagamento, usuário tem assinatura (token não funciona mais)

### Rate Limiting

Os endpoints públicos devem ter rate limiting configurado:

```javascript
// Exemplo no routes.ts
import rateLimit from 'express-rate-limit';

const validateTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requisições por IP
});

app.get('/api/billing/checkout/validate/:token', validateTokenLimiter, ...);
```

---

## 📝 Tags Disponíveis

| Tag | Descrição | Exemplo |
|-----|-----------|---------|
| `{nome}` | Nome do usuário | João Silva |
| `{email}` | Email do usuário | user@email.com |
| `{telefone}` | Telefone do usuário | 11999999999 |
| `{link_pagamento}` | Link de checkout externo | http://localhost:5000/checkout/plans?tokenaccess=... |

---

## 🧪 Testando os Endpoints

### Teste 1: Gerar Token

```javascript
// No Node.js ou browser console
const userId = 123;
const email = "user@email.com";
const token = btoa(`${userId}:${email}`);
console.log(token); // MTIzOnVzZXJAZW1haWwuY29t
```

### Teste 2: Validar Token

```bash
curl -X GET "http://localhost:5000/api/billing/checkout/validate/MTIzOnVzZXJAZW1haWwuY29t"
```

### Teste 3: Buscar Mensagem Processada

```bash
curl -X GET "http://localhost:5000/api/welcome-messages/welcome/user/123"
```

### Teste 4: Buscar Mensagem com Query Param

```bash
curl -X GET "http://localhost:5000/api/admin/welcome-messages/welcome?userId=123" \
  -H "Cookie: connect.sid=..."
```

---

## 🚀 Deploy

### Variáveis de Ambiente Necessárias

```env
# URL do frontend (para gerar links)
FRONTEND_URL=https://app.financehub.com
BASE_URL=https://app.financehub.com

# Asaas (já existente)
ASAAS_API_KEY=...
ASAAS_ENVIRONMENT=production

# Webhook de ativação (já existente)
WEBHOOK_ATIVACAO_URL=https://...
```

---

## 📊 Monitoramento

### Logs Importantes

```javascript
// Geração de token
console.log('[CheckoutToken] Token gerado para userId:', userId);

// Validação de token
console.log('[CheckoutToken] Token validado:', { userId, email, valid: true });

// Processamento de mensagem
console.log('[WelcomeMessage] Tags processadas para userId:', userId);

// Checkout externo
console.log('[Checkout] Checkout externo iniciado com token');
```

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar logs do servidor
2. Testar token manualmente (base64 decode)
3. Verificar se usuário existe no banco
4. Validar que usuário NÃO tem assinatura ativa

---

**Documentação atualizada em:** 2025-01-13
