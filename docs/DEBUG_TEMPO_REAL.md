# 🔍 Debug - Atualizações em Tempo Real

## Problema Identificado
A listagem de transações não está atualizando automaticamente quando novas transações são criadas.

## Logs Adicionados para Debug

### Frontend (Cliente)
- ✅ Logs detalhados no WebSocket quando notificações chegam
- ✅ Logs na invalidação das queries do React Query
- ✅ Logs quando transações são carregadas
- ✅ Logs quando efeito de shake é ativado
- ✅ Botões de debug na interface

### Backend (Servidor)
- ✅ Logs detalhados quando notificações são enviadas
- ✅ Logs na função broadcastNotification
- ✅ Logs na validação de sessão WebSocket

## Como Testar e Debuggar

### 1. Abrir Console do Navegador
1. Acesse a página de Transações
2. Abra o Console do navegador (F12)
3. Procure por logs que começam com `[WebSocket]` e `[Transactions]`

### 2. Verificar Conexão WebSocket
**Logs esperados:**
```
[WebSocket] Conectando em: ws://localhost:5000/ws?token=1
[WebSocket] ✅ Conectado
[WebSocket] URL: ws://localhost:5000/ws?token=1
[WebSocket] User ID: 1
[WebSocket] Conexão estabelecida: Conectado ao sistema de notificações
```

### 3. Criar Nova Transação
1. Clique em "Nova Transação"
2. Preencha os dados e salve
3. **Verifique no Console do Navegador:**
```
[WebSocket] 📨 Mensagem recebida: {type: "notification", data: {...}}
[WebSocket] 🔔 Notificação recebida: {...}
[WebSocket] 📊 Dados da notificação: {...}
[WebSocket] 🏷️ Badge adicionada para nova transação
[WebSocket] 🎯 Efeito de shake ativado
[WebSocket] 🔄 Invalidando queries de transações...
[WebSocket] QueryClient antes da invalidação: [...]
[WebSocket] QueryClient após invalidação: [...]
[WebSocket] ✅ Cache de transações invalidado, badge adicionada e shake ativado
```

### 4. Verificar Console do Servidor
**Logs esperados:**
```
=== ENVIANDO NOTIFICAÇÃO WEBSOCKET ===
Notificação: {...}
Usuário ID: 1
=====================================
[WebSocket] 🚀 INÍCIO broadcastNotification
[WebSocket] Enviando para usuários específicos: ["1"]
[WebSocket] Procurando usuário 1 (como string: 1): encontrado
[WebSocket] Enviando notificação para usuário 1 (Nome do Usuário)
[WebSocket] Notificação enviada para 1 conexões ativas
Resultado do broadcast: true
```

### 5. Usar Botões de Debug
- **🔍 Debug**: Mostra status do WebSocket, badges e transações
- **🔄 Refresh**: Força invalidação manual das queries
- **🎯 Shake**: Testa o efeito de shake manualmente

## Possíveis Problemas e Soluções

### Problema 1: WebSocket não conecta
**Sintomas:** Indicador mostra "Desconectado" (vermelho)
**Soluções:**
1. Verificar se servidor está rodando na porta 5000
2. Verificar se usuário está autenticado
3. Verificar logs de erro no console

### Problema 2: Notificações não chegam
**Sintomas:** Não aparecem logs de notificação no console
**Soluções:**
1. Verificar se WebSocket está conectado
2. Verificar logs do servidor para broadcast
3. Verificar se usuário tem sessão válida

### Problema 3: Queries não são invalidadas
**Sintomas:** Notificações chegam mas lista não atualiza
**Soluções:**
1. Usar botão "🔄 Refresh" para testar invalidação manual
2. Verificar logs de invalidação no console
3. Verificar se React Query está funcionando

### Problema 4: Badges não aparecem
**Sintomas:** Lista atualiza mas badges não aparecem
**Soluções:**
1. Verificar se `addTransactionBadge()` está sendo chamado
2. Verificar se componente BadgeStack está renderizando
3. Verificar logs de badge no console

## Próximos Passos

1. **Teste a conexão WebSocket** - Verifique se conecta corretamente
2. **Crie uma transação** - Veja se notificações chegam
3. **Verifique logs** - Use os logs detalhados para identificar o problema
4. **Use botões de debug** - Teste invalidação manual se necessário

## Arquivos com Logs Adicionados

- `client/src/hooks/useWebSocket.ts` - Logs detalhados de WebSocket
- `client/src/pages/transactions/index.tsx` - Logs de query e botões de debug
- `server/controllers/transaction.controller.ts` - Logs de notificação
- `server/websocket.ts` - Logs de validação e broadcast
