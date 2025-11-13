# 📨 Integração de Mensagens de Boas-Vindas

## ✅ **Solução Implementada**

O sistema agora processa automaticamente a tag `{link_pagamento}` em mensagens de boas-vindas de **DUAS FORMAS**:

---

## 🎯 **Opção 1: Webhook Automático (Recomendado)**

### **Como Funciona:**

Quando um usuário se registra via `/api/auth/register`, o sistema **automaticamente**:

1. Busca a mensagem de tipo `welcome` no banco
2. Processa TODAS as tags incluindo `{link_pagamento}`
3. Envia webhook para seu sistema externo

### **Webhook Enviado:**

```json
POST [WEBHOOK_BOAS_VINDAS_URL]

{
  "evento": "usuario_registrado",
  "timestamp": "2025-01-13T10:30:00.000Z",
  "dominio": "https://financehub.com",
  "id": 123,
  "nome": "Pedro Silva",
  "email": "pedro@email.com",
  "telefone": "5511999999999",
  "tipo_usuario": "normal",
  "data_cadastro": "2025-01-13T10:30:00.000Z",
  "mensagem_boas_vindas": {
    "titulo": "Bem-vindo, Pedro Silva!",
    "mensagem": "Olá Pedro Silva! Sua conta foi criada com sucesso...\n\nClique aqui para ativar: http://localhost:5000/checkout/plans?tokenaccess=MTIzOnBlZHJvQGVtYWlsLmNvbQ==",
    "conteudo_email": "..."
  }
}
```

### **Configuração no .env:**

```env
# URL do webhook para enviar boas-vindas (prioritária)
WEBHOOK_BOAS_VINDAS_URL=https://prod-wf.pulsofinanceiro.net.br/webhook/boasvindas

# Ou usar a URL de ativação como fallback
WEBHOOK_ATIVACAO_URL=https://prod-wf.pulsofinanceiro.net.br/webhook/ativacao

# URL do frontend (para gerar links)
FRONTEND_URL=https://app.financehub.com
BASE_URL=https://app.financehub.com
```

### **No Make.com/n8n:**

1. Criar webhook para receber `usuario_registrado`
2. Extrair `mensagem_boas_vindas.mensagem`
3. Enviar para WhatsApp/Email
4. **O link já está processado!**

---

## 🔄 **Opção 2: API Manual**

Se preferir buscar a mensagem manualmente via API:

### **Endpoint:**
```
GET /api/welcome-messages/welcome/user/{{userId}}
```

### **Exemplo:**
```bash
curl -X GET "https://api.financehub.com/api/welcome-messages/welcome/user/123"
```

### **Response:**
```json
{
  "success": true,
  "data": {
    "title": "Bem-vindo, Pedro Silva!",
    "message": "Olá Pedro Silva! Clique: http://localhost:5000/checkout/plans?tokenaccess=MTIzOnBlZHJvQGVtYWlsLmNvbQ==",
    "email_content": "..."
  }
}
```

### **No Make.com/n8n:**

1. Quando usuário se registra, pegar o `userId`
2. Chamar a API: `GET /api/welcome-messages/welcome/user/{{userId}}`
3. Extrair `data.message`
4. Enviar para WhatsApp/Email

---

## 📋 **Comparação das Opções**

| Característica | Webhook Automático | API Manual |
|----------------|-------------------|------------|
| **Automático** | ✅ Sim | ❌ Não |
| **Requer chamada API** | ❌ Não | ✅ Sim |
| **Configuração** | Apenas .env | Make.com/n8n |
| **Performance** | ⚡ Rápido | 🐢 Mais lento |
| **Tags processadas** | ✅ Sim | ✅ Sim |
| **Recomendado** | ✅ Sim | ⚠️ Se necessário |

---

## 🎨 **Configurando Mensagem no Admin**

1. Acesse **Admin → Welcome Messages**
2. Selecione tipo: `welcome`
3. Configure a mensagem:

```
Título:
Bem-vindo, {nome}!

Mensagem:
Olá {nome}!

Sua conta foi criada com sucesso, mas ainda não está ativa.

Para acessar todos os recursos do FinanceHub, você precisa ativar sua assinatura.

Clique no botão abaixo para efetuar o pagamento e começar a usar nossa plataforma:

{link_pagamento}

Obrigado!
FinanceHub Team
```

4. Salvar

---

## 🧪 **Testando**

### **1. Registrar novo usuário:**

```bash
curl -X POST "http://localhost:5000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Pedro Silva",
    "email": "pedro@email.com",
    "senha": "123456",
    "telefone": "5511999999999"
  }'
```

### **2. Verificar logs do servidor:**

```
[UserRegister] Enviando webhook de boas-vindas...
[UserRegister] Webhook de boas-vindas enviado com sucesso
```

### **3. Verificar webhook recebido:**

No Make.com/n8n, você deve receber:
```json
{
  "mensagem_boas_vindas": {
    "mensagem": "...Clique aqui: http://localhost:5000/checkout/plans?tokenaccess=MTIzOnBlZHJvQGVtYWlsLmNvbQ=="
  }
}
```

---

## 🔍 **Troubleshooting**

### **Tag `{link_pagamento}` aparece literal:**

**Causa:** Webhook não está sendo processado ou API antiga sendo usada

**Solução:**
1. Verificar se variáveis de ambiente estão configuradas:
   ```bash
   echo $FRONTEND_URL
   echo $BASE_URL
   ```

2. Usar endpoint correto:
   - ✅ Correto: `/api/welcome-messages/welcome/user/123`
   - ❌ Errado: `/api/admin/welcome-messages/welcome` (sem userId)

3. Se usando webhook, verificar logs:
   ```bash
   grep "UserRegister" logs/app.log
   ```

### **Link não está sendo gerado:**

**Verificar:**
1. `FRONTEND_URL` ou `BASE_URL` está configurado no .env
2. Usuário tem ID e email válidos
3. Mensagem no banco contém a tag `{link_pagamento}`

### **Webhook não está sendo enviado:**

**Verificar:**
1. `WEBHOOK_BOAS_VINDAS_URL` está configurado
2. URL do webhook está acessível
3. Verificar logs de erro:
   ```bash
   grep "Erro ao enviar webhook" logs/app.log
   ```

---

## 📊 **Logs Importantes**

```bash
# Ver processamento de mensagens
[UserRegister] Enviando webhook de boas-vindas...
[UserRegister] Webhook de boas-vindas enviado com sucesso

# Ver tags sendo processadas
[NotificationService] Processando tags para userId: 123
[NotificationService] Tag {link_pagamento} substituída

# Ver token gerado
[CheckoutToken] Token gerado: MTIzOnBlZHJvQGVtYWlsLmNvbQ==
[CheckoutToken] Link: http://localhost:5000/checkout/plans?tokenaccess=...
```

---

## 🚀 **Migração (Se já tem integração)**

### **Se você está usando o endpoint antigo:**

```javascript
// ❌ ANTES (errado - tags não processadas)
const response = await fetch('/api/admin/welcome-messages/welcome');

// ✅ DEPOIS (correto - tags processadas)
const response = await fetch(`/api/welcome-messages/welcome/user/${userId}`);
```

### **Ou simplesmente:**

Configure `WEBHOOK_BOAS_VINDAS_URL` no .env e o sistema fará tudo automaticamente! 🎉

---

## 📞 **Suporte**

Se a tag ainda aparecer literal:

1. Verificar se endpoint correto está sendo usado
2. Verificar se `userId` é válido
3. Verificar se `FRONTEND_URL` está configurado
4. Consultar logs do servidor

---

**Última atualização:** 2025-01-13
