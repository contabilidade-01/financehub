import { Request, Response } from 'express';
import { broadcastNotification } from '../websocket.js';
import { WahaSessionWebhooksController } from './waha-session-webhooks.controller.js';

// Interface para eventos do WAHA
interface WahaEvent {
  event: string;
  session: string;
  payload: any;
}

// Interface para dados de mensagem do WAHA
interface WahaMessage {
  id: string;
  from: string;
  to: string;
  body?: string;
  text?: string;
  type: string;
  timestamp: number;
  fromMe: boolean;
  ack?: number;
  mediaUrl?: string;
  chatId?: string;
}

// Interface para dados de sessão do WAHA
interface WahaSession {
  name: string;
  status: string;
  config?: any;
}

export class WahaWebhookController {
  /**
   * Receber eventos do WAHA via webhook (com hash de segurança)
   */
  static async receiveWahaEvent(req: Request, res: Response) {
    try {
      const webhookHash = req.params.hash;
      
      // Log enxuto: sem cabeçalhos de autenticação nem o corpo (contém PII).
      console.log(`[WAHA Webhook] ${req.method} ${req.path.replace(/\/webhook\/.+$/, '/webhook/:hash')} evento=${req.body?.event || '?'} sessão=${req.body?.session || '?'} ip=${req.ip}`);

      // Sem hash, qualquer um poderia forjar eventos. Rota legada só aceita se
      // WAHA_WEBHOOK_SEM_HASH=true estiver definido no ambiente.
      if (!webhookHash && process.env.WAHA_WEBHOOK_SEM_HASH !== 'true') {
        console.warn('[WAHA Webhook] ❌ Requisição sem hash rejeitada');
        return res.status(401).json({ error: 'Hash obrigatório' });
      }

      // Validar hash se fornecido
      let validatedSessionName = null;
      if (webhookHash) {
        const validation = await WahaSessionWebhooksController.validateSessionWebhookHash(webhookHash);
        if (!validation.isValid) {
          console.warn('[WAHA Webhook] ❌ Hash inválido:', webhookHash);
          return res.status(401).json({ 
            error: 'Hash inválido', 
            message: 'Webhook hash não autorizado' 
          });
        }
        validatedSessionName = validation.sessionName;
        console.log('[WAHA Webhook] ✅ Hash validado com sucesso para sessão:', validatedSessionName);
      }
      
      const event: WahaEvent = req.body;
      
      // Validar estrutura básica do evento
      if (!event.event || !event.session) {
        console.warn('[WAHA Webhook] ⚠️ Evento inválido - faltam campos obrigatórios');
        return res.status(400).json({ 
          error: 'Evento inválido', 
          message: 'Campos event e session são obrigatórios' 
        });
      }

      console.log(`\n🎯 [WAHA Webhook] PROCESSANDO EVENTO: ${event.event.toUpperCase()}`);
      console.log(`   📱 Sessão: ${event.session}`);
      console.log(`   🔑 Hash validado: ${validatedSessionName || 'N/A'}`);
      console.log('   ' + '-'.repeat(50));
      
      // Verificar se a sessão do evento corresponde à sessão validada pelo hash
      if (validatedSessionName && event.session !== validatedSessionName) {
        console.warn(`[WAHA Webhook] ⚠️ Sessão do evento (${event.session}) não corresponde à sessão do hash (${validatedSessionName})`);
        return res.status(403).json({ 
          error: 'Sessão não autorizada', 
          message: `Este webhook só aceita eventos da sessão: ${validatedSessionName}` 
        });
      }
      
      // Processar o evento baseado no tipo
      await WahaWebhookController.processWahaEvent(event);
      
      // Log de sucesso
      console.log(`\n✅ [WAHA Webhook] EVENTO PROCESSADO COM SUCESSO`);
      console.log(`   📧 Tipo: ${event.event}`);
      console.log(`   🏷️  Sessão: ${event.session}`);
      console.log(`   ✔️  Sessão validada: ${validatedSessionName || 'N/A'}`);
      console.log(`   ⏰ Processado em: ${new Date().toISOString()}`);
      console.log('='.repeat(80) + '\n');
      
      // Responder sucesso para o WAHA
      res.status(200).json({ 
        success: true, 
        message: 'Evento processado com sucesso',
        receivedAt: new Date().toISOString(),
        sessionName: event.session,
        validatedSessionName: validatedSessionName
      });
      
    } catch (error) {
      console.log('\n' + '='.repeat(80));
      console.error('[WAHA Webhook] ❌ ERRO AO PROCESSAR EVENTO');
      console.log('='.repeat(80));
      console.error(`🕒 Timestamp: ${new Date().toISOString()}`);
      console.error(`🌐 Método: ${req.method}`);
      console.error(`🔑 Hash: ${req.params.hash ? 'presente' : 'SEM HASH'}`);
      console.error(`📦 Evento: ${req.body?.event || '?'} sessão: ${req.body?.session || '?'}`);
      console.error('\n💥 Detalhes do erro:');
      console.error(error);
      console.log('='.repeat(80) + '\n');
      
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: 'Falha ao processar evento do WAHA',
        timestamp: new Date().toISOString()
      });
    }
  }


  /**
   * Processar diferentes tipos de eventos do WAHA
   */
  private static async processWahaEvent(event: WahaEvent) {
    switch (event.event) {
      case 'message':
        await WahaWebhookController.handleMessageEvent(event);
        break;
        
      case 'message.status':
        await WahaWebhookController.handleMessageStatusEvent(event);
        break;
        
      case 'session.status':
        await WahaWebhookController.handleSessionStatusEvent(event);
        break;
        
      case 'state.change':
        await WahaWebhookController.handleStateChangeEvent(event);
        break;
        
      default:
        console.log(`[WAHA Webhook] ℹ️ Evento não tratado: ${event.event}`);
    }
  }

  /**
   * Processar evento de nova mensagem
   */
  private static async handleMessageEvent(event: WahaEvent) {
    console.log('\n📩 [WAHA Webhook] PROCESSANDO NOVA MENSAGEM');
    console.log(`   📱 Sessão: ${event.session}`);
    console.log(`   📧 De: ${event.payload.from}`);
    console.log(`   📨 Para: ${event.payload.to}`);
    console.log(`   📝 Texto: ${event.payload.body || event.payload.text || '[sem texto]'}`);
    console.log(`   📂 Tipo: ${event.payload.type}`);
    console.log(`   👤 De mim: ${event.payload.fromMe ? 'Sim' : 'Não'}`);
    console.log(`   🕒 Timestamp: ${new Date(event.payload.timestamp * 1000).toISOString()}`);
    
    const messageData: WahaMessage = event.payload;
    
    // Criar notificação para enviar via WebSocket
    const notification = {
      id: `waha_message_${Date.now()}`,
      type: 'info' as const,
      title: 'Nova Mensagem WhatsApp',
      message: `Mensagem recebida na sessão ${event.session}`,
      timestamp: new Date().toISOString(),
      from: {
        id: 'waha',
        name: 'WAHA',
        role: 'system'
      },
      data: {
        event: 'waha.message',
        session: event.session,
        message: messageData
      }
    };

    // Enviar para todos os SuperAdmins conectados
    console.log(`   📡 Enviando notificação via WebSocket para SuperAdmins...`);
    broadcastNotification(notification);
    
    console.log(`   ✅ Mensagem processada e enviada via WebSocket`);
  }

  /**
   * Processar evento de mudança de status de mensagem
   */
  private static async handleMessageStatusEvent(event: WahaEvent) {
    console.log('\n📊 [WAHA Webhook] PROCESSANDO STATUS DE MENSAGEM');
    console.log(`   📱 Sessão: ${event.session}`);
    console.log(`   🆔 ID da mensagem: ${event.payload.id}`);
    console.log(`   ✅ Status (ACK): ${event.payload.ack}`);
    console.log(`   🕒 Timestamp: ${new Date(event.payload.timestamp * 1000).toISOString()}`);
    
    const statusData = event.payload;
    
    // Criar notificação para atualização de status
    const notification = {
      id: `waha_status_${Date.now()}`,
      type: 'info' as const,
      title: 'Status da Mensagem Atualizado',
      message: `Status atualizado na sessão ${event.session}`,
      timestamp: new Date().toISOString(),
      from: {
        id: 'waha',
        name: 'WAHA', 
        role: 'system'
      },
      data: {
        event: 'waha.message.status',
        session: event.session,
        status: statusData
      }
    };

    broadcastNotification(notification);
    console.log(`   ✅ Status de mensagem processado`);
  }

  /**
   * Processar evento de mudança de status da sessão
   */
  private static async handleSessionStatusEvent(event: WahaEvent) {
    console.log('\n🔄 [WAHA Webhook] PROCESSANDO STATUS DA SESSÃO');
    console.log(`   📱 Sessão: ${event.session}`);
    console.log(`   📊 Status: ${event.payload.status}`);
    console.log(`   🏷️  Nome: ${event.payload.name}`);
    
    const sessionData: WahaSession = event.payload;
    
    const notification = {
      id: `waha_session_${Date.now()}`,
      type: sessionData.status === 'WORKING' ? 'success' as const : 'warning' as const,
      title: 'Status da Sessão WhatsApp',
      message: `Sessão ${event.session}: ${sessionData.status}`,
      timestamp: new Date().toISOString(),
      from: {
        id: 'waha',
        name: 'WAHA',
        role: 'system'
      },
      data: {
        event: 'waha.session.status',
        session: event.session,
        sessionData
      }
    };

    broadcastNotification(notification);
    console.log(`   ✅ Status da sessão processado`);
  }

  /**
   * Processar evento de mudança de estado
   */
  private static async handleStateChangeEvent(event: WahaEvent) {
    console.log('\n🔀 [WAHA Webhook] PROCESSANDO MUDANÇA DE ESTADO');
    console.log(`   📱 Sessão: ${event.session}`);
    console.log(`   🔄 Estado: ${event.payload.state}`);
    console.log(`   💬 Mensagem: ${event.payload.message || 'N/A'}`);
    
    const stateData = event.payload;
    
    const notification = {
      id: `waha_state_${Date.now()}`,
      type: 'info' as const,
      title: 'Estado do WhatsApp Alterado',
      message: `Estado da sessão ${event.session} foi alterado`,
      timestamp: new Date().toISOString(),
      from: {
        id: 'waha',
        name: 'WAHA',
        role: 'system'
      },
      data: {
        event: 'waha.state.change',
        session: event.session,
        state: stateData
      }
    };

    broadcastNotification(notification);
    console.log(`   ✅ Mudança de estado processada`);
  }

  /**
   * Obter estatísticas dos eventos recebidos
   */
  static async getWebhookStats(req: Request, res: Response) {
    try {
      // Aqui você pode implementar estatísticas se necessário
      const stats = {
        message: 'Webhook funcionando corretamente',
        endpoint: '/api/waha/webhook',
        timestamp: new Date().toISOString(),
        status: 'active'
      };

      res.json(stats);
    } catch (error) {
      console.error('[WAHA Webhook] Erro ao obter estatísticas:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}