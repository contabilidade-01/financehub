# Configuração do Webhook WAHA

Este documento explica como configurar o webhook do WAHA para enviar eventos para nossa aplicação.

## 🔗 Endpoints do Webhook

### Webhook Seguro (Recomendado)
```
POST http://localhost:5000/api/waha/webhook/{HASH}
```
**Exemplo**: `http://localhost:5000/api/waha/webhook/A1b2C`

### Webhook Sem Segurança (Fallback)
```
POST http://localhost:5000/api/waha/webhook
```

## 🔐 Sistema de Hash por Sessão

- **Hash único por sessão**: Cada sessão WAHA possui seu próprio hash de 5 caracteres (Ex: `A1b2C`)
- **Geração automática**: Hash gerado automaticamente ao acessar/criar uma sessão
- **Segurança**: Cada URL só aceita eventos da sessão correspondente
- **Regeneração**: Possível regenerar hash individualmente para cada sessão

### Exemplos de URLs por Sessão:
- Sessão `vendas` → Hash `V3n4D` → URL: `http://localhost:5000/api/waha/webhook/V3n4D`
- Sessão `suporte` → Hash `S7p2E` → URL: `http://localhost:5000/api/waha/webhook/S7p2E`
- Sessão `financeiro` → Hash `F1n8O` → URL: `http://localhost:5000/api/waha/webhook/F1n8O`

## 📋 Configuração no WAHA

### 1. Via Painel Administrativo (Recomendado)

1. Acesse `/admin/customize` no painel
2. Vá para a seção "Integração WhatsApp (WAHA)"
3. Configure a sessão e salve
4. Copie a URL do webhook gerada automaticamente
5. Use esta URL no WAHA

### 2. Via API do WAHA

```bash
# Configurar webhook para uma sessão específica (substitua {HASH} pelo hash real)
curl -X POST \
  http://localhost:3000/api/sessions/default/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:5000/api/waha/webhook/{HASH}",
    "events": ["message", "message.status", "session.status", "state.change"],
    "hmac": false,
    "retries": 3,
    "customHeaders": [
      {
        "name": "X-Custom-Header",
        "value": "webhook-from-waha"
      }
    ]
  }'
```

### 3. Via Variáveis de Ambiente do WAHA

```bash
# No arquivo .env do WAHA (substitua {HASH} pelo hash real)
WHATSAPP_HOOK_URL=http://localhost:5000/api/waha/webhook/{HASH}
WHATSAPP_HOOK_EVENTS=message,message.status,session.status,state.change
```

### 4. Via Docker Compose

```yaml
# docker-compose.yml (substitua {HASH} pelo hash real)
version: '3.8'
services:
  waha:
    image: devlikeapro/waha
    environment:
      - WHATSAPP_HOOK_URL=http://host.docker.internal:5000/api/waha/webhook/{HASH}
      - WHATSAPP_HOOK_EVENTS=message,message.status,session.status,state.change
    ports:
      - "3000:3000"
```

## 📨 Eventos Suportados

### 1. Nova Mensagem (`message`)
```json
{
  "event": "message",
  "session": "default",
  "payload": {
    "id": "message_id_123",
    "from": "5511999999999@c.us",
    "to": "5511888888888@c.us",
    "body": "Olá! Como você está?",
    "type": "text",
    "timestamp": 1640995200,
    "fromMe": false,
    "ack": 1
  }
}
```

### 2. Status da Mensagem (`message.status`)
```json
{
  "event": "message.status",
  "session": "default", 
  "payload": {
    "id": "message_id_123",
    "ack": 2,
    "timestamp": 1640995300
  }
}
```

### 3. Status da Sessão (`session.status`)
```json
{
  "event": "session.status",
  "session": "default",
  "payload": {
    "name": "default",
    "status": "WORKING"
  }
}
```

### 4. Mudança de Estado (`state.change`)
```json
{
  "event": "state.change",
  "session": "default",
  "payload": {
    "state": "CONNECTED",
    "message": "WhatsApp conectado"
  }
}
```

## 🔄 Fluxo de Funcionamento

1. **WAHA recebe evento** → WhatsApp Web detecta nova mensagem
2. **WAHA envia webhook** → POST para `/api/waha/webhook`
3. **Servidor processa** → `WahaWebhookController.receiveWahaEvent()`
4. **Cria notificação** → Gera notificação estruturada
5. **Envia via WebSocket** → `broadcastNotification()` para SuperAdmins
6. **Frontend recebe** → `useNotifications` detecta evento WAHA
7. **Atualiza modal** → Event listener atualiza chat em tempo real

## 🛠️ Debugging

### Verificar se webhook está funcionando:
```bash
# Endpoint de estatísticas (requer autenticação SuperAdmin)
GET http://localhost:5000/api/waha/webhook/stats
```

### Logs no console:
- `[WAHA Webhook] 📨 Evento recebido:` - Evento chegou no servidor
- `[Notifications] 🟢 Evento WAHA detectado:` - Frontend detectou evento
- `[WhatsApp Modal] 📩 Evento de mensagem WAHA recebido:` - Modal processou mensagem

## ⚠️ Notas Importantes

1. **Sem Autenticação**: O endpoint `/api/waha/webhook` não requer autenticação para permitir que o WAHA envie eventos
2. **Apenas SuperAdmin**: Apenas usuários SuperAdmin conectados recebem as notificações via WebSocket
3. **Tempo Real**: Mensagens aparecem instantaneamente na modal se ela estiver aberta para a sessão correspondente
4. **Fallback**: Se o webhook falhar, a modal ainda funciona via polling do WebSocket direto do WAHA

## 🔧 Troubleshooting

### Webhook não está sendo chamado:
- Verificar se URL está correta no WAHA
- Verificar conectividade de rede
- Verificar logs do WAHA

### Mensagens não aparecem na modal:
- Verificar se usuário é SuperAdmin
- Verificar se WebSocket de notificações está conectado
- Verificar se modal está aberta para a sessão correta
- Verificar console do browser para logs

### Eventos duplicados:
- Normal ter webhook + WebSocket direto
- Sistema evita duplicatas por ID da mensagem