import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useTransactionBadges } from '@/hooks/useTransactionBadges';
import { useTransactionShake } from '@/hooks/useTransactionShake';

interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
  timestamp?: string;
  connectionId?: string;
}

interface NotificationData {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  data?: {
    event: string;
    transaction?: any;
    transactionId?: number;
    userId?: number;
  };
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { addTransactionBadge, badges, dismissBadge, clearAllBadges, markAsViewed, totalCount } = useTransactionBadges();
  const { shakingTransactions, triggerTransactionShake, clearTransactionShake } = useTransactionShake(300);

  const connect = () => {
    try {
      // Só conectar se o usuário estiver autenticado
      if (!isAuthenticated || !user) {
        console.log('[WebSocket] Usuário não autenticado, não conectando');
        return;
      }

      const userId = user.id.toString();
      // Usar protocolo seguro se a página for HTTPS
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${userId}`;
      console.log('[WebSocket] Conectando em:', wsUrl);
      console.log('[WebSocket] Protocolo:', protocol);
      console.log('[WebSocket] Hostname:', window.location.hostname);
      console.log('[WebSocket] Port:', window.location.port);
      console.log('[WebSocket] Host:', window.location.host);
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WebSocket] ✅ Conectado');
        console.log('[WebSocket] URL:', wsUrl);
        console.log('[WebSocket] User ID:', userId);
        setIsConnected(true);
        setConnectionError(null);
      };

      wsRef.current.onmessage = async (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] 📨 Mensagem recebida:', message);

          switch (message.type) {
            case 'connection_established':
              console.log('[WebSocket] Conexão estabelecida:', message.message);
              break;

            case 'notification':
              await handleNotification(message.data as NotificationData);
              break;

            case 'pong':
              console.log('[WebSocket] Pong recebido');
              break;

            default:
              console.log('[WebSocket] Tipo de mensagem não reconhecido:', message.type);
          }
        } catch (error) {
          console.error('[WebSocket] Erro ao processar mensagem:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WebSocket] ❌ Conexão fechada:', event.code, event.reason);
        setIsConnected(false);
        
        // Tentar reconectar após 3 segundos se não foi fechamento intencional
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Tentando reconectar...');
            connect();
          }, 3000);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Erro:', error);
        setConnectionError('Erro de conexão WebSocket');
      };

    } catch (error) {
      console.error('[WebSocket] Erro ao conectar:', error);
      setConnectionError('Falha ao conectar WebSocket');
    }
  };

  const handleNotification = async (notification: NotificationData) => {
    console.log('[WebSocket] 🔔 Notificação recebida:', notification);
    console.log('[WebSocket] 📊 Dados da notificação:', notification.data);
    console.log('[WebSocket] 🎯 Evento:', notification.data?.event);
    console.log('[WebSocket] 🆔 Transaction ID:', notification.data?.transaction?.id);

    // Mostrar toast de notificação com informações específicas sobre transações
    if (notification.data?.event?.startsWith('transaction.')) {
      const eventType = notification.data.event;
      let title = notification.title;
      let description = notification.message;
      
      // Personalizar mensagens baseado no tipo de evento
      if (eventType === 'transaction.created') {
        title = '✨ Nova Transação';
        description = `Transação criada: ${notification.message}`;
      } else if (eventType === 'transaction.updated') {
        title = '📝 Transação Atualizada';
        description = `Transação modificada: ${notification.message}`;
      } else if (eventType === 'transaction.deleted') {
        title = '🗑️ Transação Excluída';
        description = `Transação removida: ${notification.message}`;
      }

      // Adicionar informação sobre personificação se aplicável
      if (notification.data?.isImpersonated) {
        description += ' (via personificação)';
      }

      toast({
        title,
        description,
        variant: notification.type === 'error' ? 'destructive' : 'default',
        duration: 4000, // Mostrar por 4 segundos
      });
    } else {
      // Notificações gerais
      toast({
        title: notification.title,
        description: notification.message,
        variant: notification.type === 'error' ? 'destructive' : 'default',
      });
    }

    // Atualizar cache do React Query baseado no tipo de evento
    if (notification.data?.event) {
      switch (notification.data.event) {
        case 'transaction.created':
          // Adicionar badge para nova transação
          addTransactionBadge();
          console.log('[WebSocket] 🏷️ Badge adicionada para nova transação');

          // Trigger do efeito de shake na transação específica
          if (notification.data?.transaction?.id) {
            triggerTransactionShake(notification.data.transaction.id);
            console.log('[WebSocket] 🎯 Efeito de shake ativado para transação:', notification.data.transaction.id);
          } else {
            console.log('[WebSocket] ❌ Transaction ID não encontrado na notificação');
          }

          // Invalidar queries relacionadas a transações
          console.log('[WebSocket] 🔄 Invalidando queries de transações...');
          console.log('[WebSocket] QueryClient antes da invalidação:', queryClient.getQueryData(['/api/transactions']));

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['/api/transactions'] }),
            queryClient.invalidateQueries({ queryKey: ['/api/transactions/recent'] }),
            queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] }),
            queryClient.invalidateQueries({ queryKey: ['/api/wallet/current'] })
          ]);

          console.log('[WebSocket] QueryClient após invalidação:', queryClient.getQueryData(['/api/transactions']));
          console.log('[WebSocket] ✅ Cache de transações invalidado, badge adicionada e shake ativado');
          break;

        case 'transaction.updated':
        case 'transaction.deleted':
          // Invalidar queries relacionadas a transações (sem badge)
          queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
          queryClient.invalidateQueries({ queryKey: ['/api/transactions/recent'] });
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
          queryClient.invalidateQueries({ queryKey: ['/api/wallet/current'] });
          console.log('[WebSocket] Cache de transações invalidado');
          break;
      }
    }

    // Handle billing/payment events (real-time updates)
    // These notifications come from webhook processing
    if (notification.id?.startsWith('payment-')) {
      console.log('[WebSocket] 💳 Evento de pagamento recebido');

      // Invalidar queries relacionadas a billing/pagamentos
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payment-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['subscription-plans'] }),
        queryClient.invalidateQueries({ queryKey: ['user-subscription'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-billing'] })
      ]);

      console.log('[WebSocket] ✅ Cache de billing invalidado - interface atualizada em tempo real');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Desconexão intencional');
      wsRef.current = null;
    }
    
    setIsConnected(false);
  };

  const sendPing = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, user]);

  // Ping periódico para manter a conexão viva
  useEffect(() => {
    if (isConnected) {
      const pingInterval = setInterval(sendPing, 30000); // A cada 30 segundos
      return () => clearInterval(pingInterval);
    }
  }, [isConnected]);

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    sendPing,
    // Badge functions
    badges,
    dismissBadge,
    clearAllBadges,
    markAsViewed,
    totalCount,
    // Transaction shake functions
    shakingTransactions,
    triggerTransactionShake,
    clearTransactionShake
  };
}
