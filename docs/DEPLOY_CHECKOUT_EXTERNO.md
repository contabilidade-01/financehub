# 🚀 Deploy - Checkout Externo para Produção

## ✅ **Pré-requisitos**

Nenhuma migration necessária! Todos os campos já existem no banco de dados.

---

## 📋 **Checklist de Deploy**

### **1. Variáveis de Ambiente**

Adicione no arquivo `.env` de produção:

```env
# URLs do Frontend (OBRIGATÓRIO para gerar links de checkout)
FRONTEND_URL=https://app.financehub.com
BASE_URL=https://app.financehub.com

# Webhook de Boas-Vindas (OPCIONAL - se quiser envio automático)
WEBHOOK_BOAS_VINDAS_URL=https://prod-wf.pulsofinanceiro.net.br/webhook/boasvindas

# Webhook de Ativação (já existente)
WEBHOOK_ATIVACAO_URL=https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao

# Asaas (já existente - apenas verificar)
ASAAS_API_KEY=sua_chave_aqui
ASAAS_ENVIRONMENT=production
ASAAS_WEBHOOK_SECRET=seu_secret_aqui

# Database (já existente)
DATABASE_URL=postgresql://...
```

---

### **2. Build do Frontend e Backend**

```bash
# 1. Instalar dependências (se houver novas)
npm install

# 2. Build do frontend
cd client
npm run build

# 3. Build do backend (se usar TypeScript compilado)
cd ..
npm run build

# 4. Ou simplesmente reiniciar o servidor
pm2 restart financehub
# ou
systemctl restart financehub
```

---

### **3. Configurar Mensagem de Boas-Vindas (Admin)**

1. Acesse: `https://app.financehub.com/admin/welcome-messages`
2. Edite ou crie mensagem tipo `welcome`
3. Use a tag `{link_pagamento}` na mensagem:

```
Título:
Bem-vindo ao FinanceHub, {nome}!

Mensagem:
Olá {nome}!

Sua conta foi criada com sucesso, mas ainda não está ativa.

Para acessar todos os recursos do FinanceHub, você precisa ativar sua assinatura.

👉 Clique no link abaixo para efetuar o pagamento:

{link_pagamento}

Após o pagamento, sua conta será ativada automaticamente e você poderá começar a usar nossa plataforma.

Obrigado por escolher o FinanceHub!

Equipe FinanceHub
```

4. **Salvar**

---

### **4. Testar em Produção**

#### **Teste 1: Validar Token**

```bash
# Gerar token de teste
echo -n "123:user@email.com" | base64
# Output: MTIzOnVzZXJAZW1haWwuY29t

# Testar validação
curl -X GET "https://app.financehub.com/api/billing/checkout/validate/MTIzOnVzZXJAZW1haWwuY29t"
```

**Resposta esperada:**
```json
{
  "valid": true,
  "user": {
    "id": 123,
    "nome": "Nome do Usuário",
    "email": "user@email.com"
  },
  "plans": [...]
}
```

#### **Teste 2: Buscar Mensagem Processada**

```bash
curl -X GET "https://app.financehub.com/api/welcome-messages/welcome/user/123"
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": {
    "title": "Bem-vindo ao FinanceHub, João!",
    "message": "...https://app.financehub.com/checkout/plans?tokenaccess=..."
  }
}
```

#### **Teste 3: Registrar Novo Usuário**

```bash
curl -X POST "https://app.financehub.com/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Teste Deploy",
    "email": "teste@deploy.com",
    "senha": "senha123",
    "telefone": "5511999999999"
  }'
```

**Verificar logs:**
```bash
# Se usando PM2
pm2 logs financehub | grep "UserRegister"

# Ou tail direto no log
tail -f /var/log/financehub/app.log | grep "webhook"
```

**Saída esperada:**
```
[UserRegister] Enviando webhook de boas-vindas...
[UserRegister] Webhook de boas-vindas enviado com sucesso
```

#### **Teste 4: Acessar Checkout Externo**

1. Abrir no navegador:
```
https://app.financehub.com/checkout/plans?tokenaccess=MTIzOnVzZXJAZW1haWwuY29t
```

2. Deve mostrar:
   - ✅ Tela de checkout
   - ✅ Nome e email pré-preenchidos
   - ✅ Lista de planos

3. Se token inválido:
   - ✅ Mostra página 404 customizada

---

### **5. Configurar Webhook Externo (Make.com/n8n)**

#### **Opção A: Usar Webhook Automático**

1. No Make.com/n8n, criar webhook para:
   ```
   POST https://prod-wf.pulsofinanceiro.net.br/webhook/boasvindas
   ```

2. Configurar para receber evento `usuario_registrado`

3. Extrair campo:
   ```javascript
   mensagem_boas_vindas.mensagem
   ```

4. Enviar para WhatsApp/Email

#### **Opção B: Chamar API Manualmente**

1. Quando usuário se registra, pegar `userId`

2. Fazer requisição:
   ```
   GET /api/welcome-messages/welcome/user/{{userId}}
   ```

3. Extrair `data.message`

4. Enviar para WhatsApp/Email

---

### **6. Monitoramento**

#### **Logs Importantes:**

```bash
# Ver processamento de tokens
pm2 logs | grep "CheckoutToken"

# Ver envio de webhooks
pm2 logs | grep "UserRegister"

# Ver processamento de mensagens
pm2 logs | grep "processMessageTags"

# Ver erros
pm2 logs | grep "ERROR"
```

#### **Métricas a Monitorar:**

1. ✅ Taxa de conversão (registro → pagamento)
2. ✅ Tempo médio até primeiro pagamento
3. ✅ Taxa de tokens inválidos
4. ✅ Erros em webhooks

---

## 🔒 **Segurança**

### **Validações Implementadas:**

✅ Token base64 validado
✅ UserId e email verificados no banco
✅ Usuário não pode ter assinatura ativa
✅ Token auto-invalidado após pagamento
✅ Endpoints públicos documentados

### **Rate Limiting (Opcional mas Recomendado):**

Adicionar no `server/routes.ts`:

```typescript
import rateLimit from 'express-rate-limit';

const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requisições
  message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});

// Aplicar nos endpoints públicos
app.get('/api/billing/checkout/validate/:token', publicApiLimiter, ...);
app.get('/api/welcome-messages/:type/user/:userId', publicApiLimiter, ...);
```

---

## 📊 **Banco de Dados**

### **Nenhuma Migration Necessária! ✅**

Todos os campos já existem:
- ✅ `welcome_messages` (já existe)
- ✅ `payment_link` (já existe)
- ✅ Tabelas de billing (já existem)

### **Verificar Dados Existentes:**

```sql
-- Ver mensagens configuradas
SELECT * FROM welcome_messages;

-- Ver usuários sem assinatura (potenciais para checkout externo)
SELECT id, nome, email
FROM usuarios
WHERE subscriptionActive = false OR subscriptionActive IS NULL;

-- Ver tokens que seriam gerados
SELECT
  id,
  nome,
  email,
  encode(CAST(CONCAT(id, ':', email) AS bytea), 'base64') as token
FROM usuarios
WHERE subscriptionActive = false
LIMIT 5;
```

---

## 🔄 **Rollback (Se Necessário)**

Se algo der errado, basta:

1. **Remover variáveis do .env:**
```bash
# Comentar
# WEBHOOK_BOAS_VINDAS_URL=...
```

2. **Restart do servidor:**
```bash
pm2 restart financehub
```

3. **Sistema volta ao comportamento anterior**
   - Checkout externo NÃO funcionará
   - Checkout normal continua funcionando

---

## 📝 **Arquivos Modificados (para revisão)**

### **Backend:**
- ✅ `server/utils/checkout-token.utils.ts` (NOVO)
- ✅ `server/controllers/billing.controller.ts` (modificado)
- ✅ `server/controllers/welcome-messages.controller.ts` (modificado)
- ✅ `server/controllers/admin.controller.ts` (modificado)
- ✅ `server/controllers/asaas-webhook.controller.ts` (modificado)
- ✅ `server/controllers/user.controller.ts` (modificado)
- ✅ `server/services/notification.service.ts` (modificado)
- ✅ `server/routes.ts` (modificado)

### **Frontend:**
- ✅ `client/src/pages/checkout/ExternalCheckout.tsx` (NOVO)
- ✅ `client/src/pages/billing/checkout.tsx` (modificado)
- ✅ `client/src/App.tsx` (modificado)

---

## ✅ **Checklist Final**

Antes de fazer deploy, confirme:

- [ ] `.env` atualizado com `FRONTEND_URL` e `BASE_URL`
- [ ] Build do frontend executado (`npm run build`)
- [ ] Servidor reiniciado
- [ ] Mensagem de boas-vindas configurada no admin
- [ ] Tag `{link_pagamento}` adicionada na mensagem
- [ ] Teste de validação de token funcionando
- [ ] Teste de buscar mensagem processada funcionando
- [ ] Teste de registro de usuário funcionando
- [ ] Webhook externo configurado (se usar)
- [ ] Logs sendo monitorados
- [ ] Documentação Swagger acessível (`/docs`)

---

## 🎉 **Pronto para Produção!**

Após seguir todos os passos acima, o sistema estará pronto para:

✅ Gerar links de checkout externos automaticamente
✅ Processar pagamentos sem login
✅ Ativar contas automaticamente
✅ Enviar mensagens com links corretos

---

## 📞 **Suporte Pós-Deploy**

Se encontrar problemas:

1. **Verificar logs:**
   ```bash
   pm2 logs financehub --lines 100
   ```

2. **Verificar variáveis de ambiente:**
   ```bash
   pm2 env 0 | grep FRONTEND_URL
   pm2 env 0 | grep BASE_URL
   ```

3. **Testar endpoint direto:**
   ```bash
   curl -v https://app.financehub.com/api/welcome-messages/welcome/user/1
   ```

4. **Verificar Swagger:**
   ```
   https://app.financehub.com/docs
   ```

---

**Última atualização:** 2025-01-13
**Versão:** 1.0.0
