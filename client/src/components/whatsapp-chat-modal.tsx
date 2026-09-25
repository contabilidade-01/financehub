"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { 
  Send, 
  Paperclip, 
  Smile, 
  Search, 
  MoreVertical, 
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Image,
  FileText,
  Mic,
  Camera,
  File,
  X,
  Users
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Contact {
  id: string
  name: string
  phone: string
  avatar?: string
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount?: number
  isOnline?: boolean
  status?: string
  isGroup?: boolean
}

interface Message {
  id: string
  text?: string
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker'
  timestamp: Date
  isOutgoing: boolean
  status?: 'sending' | 'sent' | 'delivered' | 'read'
  mediaUrl?: string
  fileName?: string
  fileSize?: number
  duration?: string
  replyTo?: Message
}

interface WhatsAppChatModalProps {
  isOpen: boolean
  onClose: () => void
  sessionName: string
  wahaUrl: string
  apiKey: string
}

export function WhatsAppChatModal({ 
  isOpen, 
  onClose, 
  sessionName,
  wahaUrl,
  apiKey 
}: WhatsAppChatModalProps) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [wahaWebSocketStatus, setWahaWebSocketStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wahaWebSocketRef = useRef<WebSocket | null>(null)

  // Buscar conversas da sessão apenas quando a modal abrir
  useEffect(() => {
    if (isOpen && sessionName && wahaUrl && apiKey) {
      console.log('=== MODAL WHATSAPP ABERTO ===')
      console.log('Configurações carregadas do banco:', {
        wahaUrl: wahaUrl || 'não definida',
        sessionName: sessionName || 'não definida',
        apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'não definida',
        temTodasConfiguracoes: !!(wahaUrl && sessionName && apiKey)
      })
      
      console.log('✅ Todas as configurações OK, buscando chats...')
      fetchChats()
      
      // Conectar ao WebSocket do WAHA para receber mensagens em tempo real
      connectToWahaWebSocket()
    } else if (isOpen) {
      console.warn('❌ Configurações incompletas!')
      const debugContacts: Contact[] = [
        {
          id: 'config-incomplete',
          name: 'Configuração Incompleta',
          phone: 'Debug',
          lastMessage: `URL: ${wahaUrl ? 'OK' : 'FALTA'} | API Key: ${apiKey ? 'OK' : 'FALTA'} | Session: ${sessionName ? 'OK' : 'FALTA'}`,
          lastMessageTime: new Date(),
          unreadCount: 0,
          isOnline: false
        }
      ]
      setContacts(debugContacts)
    }
    
    // Reset seleção quando modal fecha
    if (!isOpen) {
      setSelectedContact(null)
      setMessages([])
      disconnectFromWahaWebSocket()
    }
  }, [isOpen])

  // Escutar eventos do WAHA via sistema de notificações
  useEffect(() => {
    const handleWahaMessage = (event: CustomEvent) => {
      const { session, message } = event.detail
      console.log('[WhatsApp Modal] 📩 Evento de mensagem WAHA recebido:', { session, message })
      
      // Verificar se é da sessão atual
      if (session === sessionName) {
        console.log('[WhatsApp Modal] ✅ Mensagem é da sessão atual, processando...')
        handleNewMessage(message)
      } else {
        console.log('[WhatsApp Modal] ℹ️ Mensagem de outra sessão, ignorando')
      }
    }

    const handleWahaMessageStatus = (event: CustomEvent) => {
      const { session, status } = event.detail
      console.log('[WhatsApp Modal] 📊 Evento de status WAHA recebido:', { session, status })
      
      // Verificar se é da sessão atual
      if (session === sessionName) {
        console.log('[WhatsApp Modal] ✅ Status é da sessão atual, processando...')
        handleMessageStatus(status)
      }
    }

    // Adicionar listeners
    window.addEventListener('waha-message', handleWahaMessage as EventListener)
    window.addEventListener('waha-message-status', handleWahaMessageStatus as EventListener)

    // Cleanup
    return () => {
      window.removeEventListener('waha-message', handleWahaMessage as EventListener)
      window.removeEventListener('waha-message-status', handleWahaMessageStatus as EventListener)
    }
  }, [sessionName, selectedContact])

  // Cleanup do WebSocket quando o componente for desmontado
  useEffect(() => {
    return () => {
      disconnectFromWahaWebSocket()
    }
  }, [])

  // Auto-scroll para última mensagem
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Conectar ao WebSocket do WAHA para receber mensagens em tempo real
  const connectToWahaWebSocket = () => {
    if (!wahaUrl || !sessionName) {
      console.log('[WAHA WebSocket] Configurações incompletas')
      setWahaWebSocketStatus('disconnected')
      return
    }

    // Fechar conexão existente se houver
    if (wahaWebSocketRef.current) {
      wahaWebSocketRef.current.close()
    }

    setWahaWebSocketStatus('connecting')

    try {
      // Construir URL do WebSocket do WAHA
      const wsUrl = wahaUrl.replace('http://', 'ws://').replace('https://', 'wss://')
      const wahaWsUrl = `${wsUrl}/ws`
      
      console.log('[WAHA WebSocket] Conectando em:', wahaWsUrl)
      
      const ws = new WebSocket(wahaWsUrl)
      wahaWebSocketRef.current = ws

      ws.onopen = () => {
        console.log('[WAHA WebSocket] ✅ Conectado ao WAHA')
        setWahaWebSocketStatus('connected')
        
        // Configurar para receber eventos da sessão específica
        const subscribeMessage = {
          event: 'session.status',
          session: sessionName
        }
        ws.send(JSON.stringify(subscribeMessage))
        
        // Subscribir aos eventos de mensagem
        const subscribeMessages = {
          event: 'message',
          session: sessionName
        }
        ws.send(JSON.stringify(subscribeMessages))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('[WAHA WebSocket] Mensagem recebida:', data)
          
          handleWahaWebSocketMessage(data)
        } catch (error) {
          console.error('[WAHA WebSocket] Erro ao parsear mensagem:', error)
        }
      }

      ws.onclose = (event) => {
        console.log('[WAHA WebSocket] Desconectado:', event.code, event.reason)
        setWahaWebSocketStatus('disconnected')
        
        // Tentar reconectar após 5 segundos se a modal ainda estiver aberta
        if (isOpen) {
          setTimeout(() => {
            if (isOpen) {
              console.log('[WAHA WebSocket] Tentando reconectar...')
              connectToWahaWebSocket()
            }
          }, 5000)
        }
      }

      ws.onerror = (error) => {
        console.error('[WAHA WebSocket] Erro:', error)
        setWahaWebSocketStatus('disconnected')
      }
    } catch (error) {
      console.error('[WAHA WebSocket] Erro ao conectar:', error)
      setWahaWebSocketStatus('disconnected')
    }
  }

  // Desconectar do WebSocket do WAHA
  const disconnectFromWahaWebSocket = () => {
    if (wahaWebSocketRef.current) {
      console.log('[WAHA WebSocket] Desconectando...')
      wahaWebSocketRef.current.close()
      wahaWebSocketRef.current = null
    }
  }

  // Processar mensagens recebidas via WebSocket
  const handleWahaWebSocketMessage = (data: any) => {
    console.log('[WAHA WebSocket] Processando evento:', data.event)
    
    switch (data.event) {
      case 'message':
        handleNewMessage(data.payload)
        break
      case 'message.status':
        handleMessageStatus(data.payload)
        break
      case 'session.status':
        console.log('[WAHA WebSocket] Status da sessão:', data.payload)
        break
      default:
        console.log('[WAHA WebSocket] Evento não tratado:', data.event)
    }
  }

  // Processar nova mensagem recebida
  const handleNewMessage = (messageData: any) => {
    console.log('[WAHA WebSocket] 📩 Nova mensagem:', messageData)
    
    // Verificar se a mensagem é do contato atualmente selecionado
    if (selectedContact && messageData.from === selectedContact.id) {
      const newMessage: Message = {
        id: messageData.id || Math.random().toString(),
        text: sanitizeMessageText(messageData.body || messageData.text || ''),
        type: messageData.type || 'text',
        timestamp: messageData.timestamp ? new Date(messageData.timestamp * 1000) : new Date(),
        isOutgoing: messageData.fromMe || false,
        status: messageData.ack === 3 ? 'read' : messageData.ack === 2 ? 'delivered' : messageData.ack === 1 ? 'sent' : 'sending',
        mediaUrl: messageData.mediaUrl
      }
      
      // Adicionar a nova mensagem à lista (evitar duplicatas)
      setMessages(prev => {
        const messageExists = prev.some(msg => msg.id === newMessage.id)
        if (messageExists) {
          return prev
        }
        return [...prev, newMessage]
      })
      
      // Atualizar a última mensagem do contato na lista
      setContacts(prev => prev.map(contact => 
        contact.id === selectedContact.id 
          ? {
              ...contact,
              lastMessage: newMessage.text || '[Mídia]',
              lastMessageTime: newMessage.timestamp,
              unreadCount: (contact.unreadCount || 0) + (newMessage.isOutgoing ? 0 : 1)
            }
          : contact
      ))
    } else if (messageData.from) {
      // Atualizar contato na lista mesmo se não estiver selecionado
      setContacts(prev => prev.map(contact => 
        contact.id === messageData.from
          ? {
              ...contact,
              lastMessage: sanitizeMessageText(messageData.body || messageData.text || '[Mídia]'),
              lastMessageTime: messageData.timestamp ? new Date(messageData.timestamp * 1000) : new Date(),
              unreadCount: (contact.unreadCount || 0) + (messageData.fromMe ? 0 : 1)
            }
          : contact
      ))
    }
  }

  // Processar mudança de status de mensagem
  const handleMessageStatus = (statusData: any) => {
    console.log('[WAHA WebSocket] 📊 Status da mensagem:', statusData)
    
    // Atualizar status das mensagens existentes
    setMessages(prev => prev.map(msg => 
      msg.id === statusData.id 
        ? {
            ...msg,
            status: statusData.ack === 3 ? 'read' : statusData.ack === 2 ? 'delivered' : statusData.ack === 1 ? 'sent' : 'sending'
          }
        : msg
    ))
  }

  const fetchChats = async () => {
    try {
      setIsLoading(true)
      console.log('Buscando chats...', { wahaUrl, sessionName, apiKey: apiKey ? 'definida' : 'não definida' })
      
      // Primeiro testar se a sessão existe
      console.log('Testando status da sessão...')
      try {
        const sessionResponse = await fetch(`${wahaUrl}/api/${sessionName}/status`, {
          headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json'
          }
        })
        console.log('Status da sessão:', sessionResponse.status)
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          console.log('Dados da sessão:', sessionData)
        }
      } catch (error) {
        console.log('Erro ao verificar status da sessão:', error)
      }
      
      // Usar o endpoint correto da documentação com parâmetros
      const endpoint = `${wahaUrl}/api/${sessionName}/chats?sortBy=conversationTimestamp&sortOrder=desc&limit=50&offset=0`
      
      console.log('Usando endpoint da documentação:', endpoint)
      
      try {
        // Tentar com API Key se disponível
        const headers: any = {
          'Content-Type': 'application/json'
        }
        if (apiKey && apiKey.trim()) {
          headers['X-Api-Key'] = apiKey
        }
        
        const response = await fetch(endpoint, { headers })
        
        console.log(`Response status:`, response.status)
        
        if (response.ok) {
          const data = await response.json()
          console.log(`Chats recebidos:`, data)
          
          // Transformar dados da API em formato de contatos
          const formattedContacts = (Array.isArray(data) ? data : []).map((chat: any) => {
            console.log('Processando chat individual:', chat)
            
            // Extrair ID do objeto aninhado
            const chatId = chat.id?._serialized || chat.id?.user || chat.id || 'unknown'
            const cleanId = chatId.toString().replace('@c.us', '').replace('@g.us', '')
            const isGroup = chatId.includes('@g.us')
            
            // Extrair última mensagem do objeto aninhado
            let lastMessageText = 'Sem mensagens'
            let lastMessageTime = new Date()
            
            if (chat.lastMessage) {
              // Tentar diferentes estruturas de mensagem
              const rawMessageText = chat.lastMessage._data?.body || 
                                   chat.lastMessage.body || 
                                   chat.lastMessage.text || 
                                   'Mensagem sem texto'
              
              // Sanitizar a mensagem para evitar problemas de layout
              lastMessageText = sanitizeMessageText(rawMessageText)
              
              // Extrair timestamp da mensagem
              const timestamp = chat.lastMessage._data?.t || 
                               chat.lastMessage.timestamp || 
                               chat.lastMessage.time ||
                               chat.timestamp ||
                               Date.now() / 1000
              
              lastMessageTime = new Date(timestamp * 1000)
            }
            
            // Extrair nome do contato
            const contactName = chat.name || 
                               chat.pushName || 
                               chat.contact?.name ||
                               chat.contact?.pushname ||
                               (isGroup ? `Grupo ${cleanId}` : cleanId)
            
            const processedContact = {
              id: chatId,
              name: contactName,
              phone: cleanId,
              lastMessage: lastMessageText,
              lastMessageTime: lastMessageTime,
              unreadCount: chat.unreadCount || 0,
              isOnline: chat.isOnline || Math.random() > 0.5,
              isGroup: isGroup
            }
            
            console.log('Contato processado:', processedContact)
            return processedContact
          })
          
          console.log('Contatos formatados:', formattedContacts)
          setContacts(formattedContacts)
        } else {
          const errorText = await response.text()
          console.error('Erro na API:', response.status, errorText)
          
          // Criar dados de debug
          const debugContacts: Contact[] = [
            {
              id: 'debug-api-error',
              name: 'Erro na API',
              phone: 'Debug',
              lastMessage: `Status: ${response.status} - ${errorText.substring(0, 50)}`,
              lastMessageTime: new Date(),
              unreadCount: 0,
              isOnline: false
            },
            {
              id: 'debug-config',
              name: 'Configurações',
              phone: 'Debug', 
              lastMessage: `URL: ${wahaUrl} | Session: ${sessionName}`,
              lastMessageTime: new Date(),
              unreadCount: 0,
              isOnline: false
            }
          ]
          setContacts(debugContacts)
        }
      } catch (networkError) {
        console.error('Erro de rede:', networkError)
        
        const errorContacts: Contact[] = [
          {
            id: 'debug-network-error',
            name: 'Erro de Conexão',
            phone: 'Debug',
            lastMessage: `Não foi possível conectar com a API WAHA`,
            lastMessageTime: new Date(),
            unreadCount: 0,
            isOnline: false
          }
        ]
        setContacts(errorContacts)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const fetchMessages = async (contactId: string) => {
    console.log('📨 Iniciando fetchMessages para contactId:', contactId)
    console.log('🔧 Configurações:', { wahaUrl, sessionName, hasApiKey: !!apiKey })
    
    // Garantir que loading sempre seja resetado após 10 segundos como medida de segurança
    const timeoutId = setTimeout(() => {
      console.log('⚠️ Timeout de segurança - resetando isLoadingMessages')
      setIsLoadingMessages(false)
    }, 10000)
    
    try {
      setIsLoadingMessages(true)
      console.log('⏳ isLoadingMessages definido como true')
      
      const requestUrl = `${wahaUrl}/api/${sessionName}/chats/${contactId}/messages?limit=50`
      console.log('🌐 URL da requisição:', requestUrl)
      
      const response = await fetch(requestUrl, {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      
      console.log('📊 Response status:', response.status)
      console.log('✅ Resposta recebida, processando...')
      
      if (response.ok) {
        const data = await response.json()
        console.log('Mensagens recebidas:', data)
        
        // Transformar mensagens da API
        const formattedMessages = (Array.isArray(data) ? data : []).map((msg: any) => {
          // Tratar mensagens com base64 que podem causar problemas de layout
          let messageText = msg.body || msg.text || '';
          
          // Sanitizar a mensagem para evitar problemas de layout
          messageText = sanitizeMessageText(messageText);
          
          return {
            id: msg.id || Math.random().toString(),
            text: messageText,
            type: msg.type || 'text',
            timestamp: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
            isOutgoing: msg.fromMe || false,
            status: msg.ack === 3 ? 'read' : msg.ack === 2 ? 'delivered' : msg.ack === 1 ? 'sent' : 'sending',
            mediaUrl: msg.mediaUrl
          };
        });
        
        console.log('Mensagens formatadas:', formattedMessages)
        setMessages(formattedMessages)
      } else {
        const errorText = await response.text()
        console.error('Erro ao buscar mensagens:', response.status, errorText)
        
        // Mensagens de exemplo
        const exampleMessages: Message[] = [
          {
            id: '1',
            text: 'Olá! Como posso ajudá-lo?',
            type: 'text',
            timestamp: new Date(Date.now() - 60000),
            isOutgoing: false,
            status: 'read'
          },
          {
            id: '2', 
            text: 'Oi! Preciso de ajuda com o sistema.',
            type: 'text',
            timestamp: new Date(),
            isOutgoing: true,
            status: 'delivered'
          }
        ]
        setMessages(exampleMessages)
      }
    } catch (error) {
      console.error('❌ Erro capturado em fetchMessages:', error)
      console.error('📝 Detalhes do erro:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      
      // Mensagens de exemplo em caso de erro
      const exampleMessages: Message[] = [
        {
          id: '1',
          text: `Erro de conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          type: 'text',
          timestamp: new Date(),
          isOutgoing: false,
          status: 'read'
        }
      ]
      setMessages(exampleMessages)
      console.log('📝 Mensagens de erro definidas')
    } finally {
      console.log('🏁 Executando finally - limpando timeout e definindo isLoadingMessages como false')
      clearTimeout(timeoutId)
      setIsLoadingMessages(false)
      console.log('✅ isLoadingMessages definido como false')
    }
  }

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedContact) return

    const messageToSend = messageText
    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      text: messageToSend,
      type: 'text',
      timestamp: new Date(),
      isOutgoing: true,
      status: 'sending'
    }

    setMessages(prev => [...prev, tempMessage])
    setMessageText('')

    try {
      const response = await fetch(`${wahaUrl}/api/${sessionName}/sendText`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: selectedContact.id,
          text: messageToSend
        })
      })

      if (response.ok) {
        const result = await response.json()
        
        // Atualizar mensagem temporária com dados reais da API
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id 
            ? { 
                ...msg, 
                id: result.id || msg.id,
                status: 'sent',
                timestamp: result.timestamp ? new Date(result.timestamp * 1000) : msg.timestamp
              } 
            : msg
        ))
        
        // Atualizar última mensagem do contato
        setContacts(prev => prev.map(contact => 
          contact.id === selectedContact.id 
            ? {
                ...contact,
                lastMessage: messageToSend,
                lastMessageTime: new Date()
              }
            : contact
        ))
      } else {
        throw new Error('Falha ao enviar mensagem')
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      
      // Marcar mensagem como erro ao invés de remover
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessage.id 
          ? { ...msg, status: 'sending' } // Manter como sending para retry
          : msg
      ))
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedContact) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('chatId', selectedContact.id)
    formData.append('session', sessionName)

    try {
      const response = await fetch(`${wahaUrl}/api/${sessionName}/sendFile`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey
        },
        body: formData
      })

      if (response.ok) {
        // Atualizar lista de mensagens
        fetchMessages(selectedContact.id)
      }
    } catch (error) {
      console.error('Erro ao enviar arquivo:', error)
    }
  }

  const formatMessageTime = (date: Date) => {
    return format(date, 'HH:mm', { locale: ptBR })
  }

  const formatContactTime = (date?: Date) => {
    if (!date) return ''
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return format(date, 'HH:mm', { locale: ptBR })
    }
    return format(date, 'dd/MM/yyyy', { locale: ptBR })
  }

  // Função para tratar mensagens problemáticas
  const sanitizeMessageText = (text: string): string => {
    if (!text) return '';
    
    // Se parece ser base64 de imagem, retornar placeholder
    if (text.startsWith('/9j/') && text.length > 100) {
      return '[Imagem]';
    }
    
    // Se parece ser base64 de outro tipo de arquivo
    if (text.startsWith('data:') && text.length > 100) {
      return '[Arquivo]';
    }
    
    // Se é muito longo, truncar
    if (text.length > 500) {
      return text.substring(0, 500) + '...';
    }
    
    return text;
  }

  // Função para formatar texto com a formatação do WhatsApp
  const formatWhatsAppText = (text: string): React.ReactNode => {
    if (!text) return '';

    // Substituir quebras de linha por <br>
    const parts = text.split('\n');
    
    return parts.map((line, lineIndex) => {
      // Processar formatação em cada linha
      const formatLine = (str: string): React.ReactNode[] => {
        const elements: React.ReactNode[] = [];
        let currentText = str;
        let key = 0;

        // Padrões de formatação do WhatsApp
        const patterns = [
          { regex: /\*([^*]+)\*/g, tag: 'strong', className: 'font-bold' }, // *negrito*
          { regex: /_([^_]+)_/g, tag: 'em', className: 'italic' }, // _itálico_
          { regex: /~([^~]+)~/g, tag: 'del', className: 'line-through' }, // ~riscado~
          { regex: /```([^`]+)```/g, tag: 'code', className: 'bg-gray-200 dark:bg-gray-700 px-1 rounded font-mono text-sm' }, // ```código```
          { regex: /`([^`]+)`/g, tag: 'code', className: 'bg-gray-200 dark:bg-gray-700 px-1 rounded font-mono text-sm' } // `código`
        ];

        // Processar cada padrão
        for (const pattern of patterns) {
          const newElements: React.ReactNode[] = [];
          
          for (const element of elements.length > 0 ? elements : [currentText]) {
            if (typeof element === 'string') {
              const matches = Array.from(element.matchAll(pattern.regex));
              
              if (matches.length > 0) {
                let lastIndex = 0;
                
                for (const match of matches) {
                  // Adicionar texto antes do match
                  if (match.index! > lastIndex) {
                    const beforeText = element.substring(lastIndex, match.index);
                    if (beforeText) {
                      newElements.push(beforeText);
                    }
                  }
                  
                  // Criar elemento formatado
                  const formattedText = match[1]; // Texto sem os caracteres de formatação
                  const TagName = pattern.tag as keyof JSX.IntrinsicElements;
                  
                  newElements.push(
                    React.createElement(
                      TagName,
                      { key: `${lineIndex}-${key++}`, className: pattern.className },
                      formattedText
                    )
                  );
                  
                  lastIndex = match.index! + match[0].length;
                }
                
                // Adicionar texto após o último match
                if (lastIndex < element.length) {
                  const afterText = element.substring(lastIndex);
                  if (afterText) {
                    newElements.push(afterText);
                  }
                }
              } else {
                newElements.push(element);
              }
            } else {
              newElements.push(element);
            }
          }
          
          // Atualizar elementos para próxima iteração
          if (newElements.length > 0) {
            elements.splice(0, elements.length, ...newElements);
          }
        }

        return elements.length > 0 ? elements : [currentText];
      };

      const formattedLine = formatLine(line);
      
      return (
        <React.Fragment key={lineIndex}>
          {formattedLine}
          {lineIndex < parts.length - 1 && <br />}
        </React.Fragment>
      );
    });
  }

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phone.includes(searchQuery)
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[1200px] w-[90vw] h-[85vh] p-0 overflow-hidden">
        {/* Estilos CSS para scrollbars e layout estável */}
        <style>{`
          .whatsapp-modal ::-webkit-scrollbar {
            width: 6px;
          }
          .whatsapp-modal ::-webkit-scrollbar-track {
            background: #f1f5f9;
          }
          .whatsapp-modal ::-webkit-scrollbar-thumb {
            background: #9ca3af;
            border-radius: 3px;
          }
          .whatsapp-modal ::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
          .whatsapp-modal .message-container {
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
          }
          .whatsapp-modal .image-container {
            max-width: 100%;
            overflow: hidden;
          }
          .whatsapp-modal .image-container img {
            max-width: 100%;
            height: auto;
            object-fit: contain;
          }
        `}</style>
        
        <div className="flex h-full bg-muted dark:bg-gray-900 whatsapp-modal">
          {/* Lista de Conversas */}
          <div className={cn(
            "w-[380px] bg-white dark:bg-gray-800 border-r border-border dark:border-gray-700 flex flex-col h-full",
            selectedContact && "hidden md:flex"
          )}>
            {/* Header da lista - FIXO */}
            <div className="bg-muted/50 dark:bg-gray-900 p-4 border-b border-border dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Conversas</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Barra de pesquisa */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="Pesquisar ou começar uma nova conversa"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-border dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Lista de contatos - COM SCROLL VERTICAL */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{
              border: '1px solid red',
              maxHeight: '67vh',
              height: '65vh !important',
            }}> {/* Nao deve ter reload dos contatos quando o usuario clicar em um contato */}
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                  <p className="mb-4">Nenhuma conversa encontrada</p>
                  
                  {/* Botão de debug para testar API diretamente */}
                  <button
                    onClick={async () => {
                      console.log('=== TESTE DIRETO DA API WAHA ===')
                      console.log('Configurações:', {
                        wahaUrl,
                        sessionName,
                        apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'não definida'
                      })
                      
                      const testEndpoint = `${wahaUrl}/api/${sessionName}/chats`
                      console.log('URL de teste:', testEndpoint)
                      
                      try {
                        // Teste com API Key do banco
                        const headers: any = {
                          'Content-Type': 'application/json'
                        }
                        if (apiKey) {
                          headers['X-Api-Key'] = apiKey
                        }
                        
                        console.log('Headers:', headers)
                        
                        const response = await fetch(testEndpoint, { headers })
                        console.log('Status da resposta:', response.status)
                        console.log('Headers da resposta:', Object.fromEntries(response.headers.entries()))
                        
                        if (response.ok) {
                          const data = await response.json()
                          console.log('✅ DADOS RECEBIDOS:', data)
                          console.log('Tipo de dados:', Array.isArray(data) ? 'Array' : typeof data)
                          if (Array.isArray(data)) {
                            console.log('Quantidade de chats:', data.length)
                            if (data.length > 0) {
                              console.log('Exemplo de chat (primeiro):', data[0])
                            }
                          }
                        } else {
                          const errorText = await response.text()
                          console.error('❌ ERRO:', response.status, response.statusText)
                          console.error('Mensagem de erro:', errorText)
                        }
                        
                      } catch (error) {
                        console.error('❌ ERRO DE REDE:', error)
                      }
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Testar API com configurações do banco
                  </button>
                  <p className="text-xs mt-2 text-muted-foreground">Clique e veja o console (F12)</p>
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => {
                      console.log('🖱️ Contato clicado:', contact.name, 'ID:', contact.id)
                      setSelectedContact(contact)
                      console.log('👤 selectedContact atualizado')
                      fetchMessages(contact.id)
                    }}
                    className={cn(
                      "flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-border dark:border-gray-800",
                      selectedContact?.id === contact.id && "bg-muted dark:bg-gray-700"
                    )}
                  >
                    {/* Avatar */}
                    <div className="relative mr-3 flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                        {contact.avatar ? (
                          <img src={contact.avatar} className="w-full h-full rounded-full object-cover" />
                        ) : contact.isGroup ? (
                          <Users className="w-6 h-6 text-muted-foreground dark:text-gray-300" />
                        ) : (
                          <span className="text-lg font-semibold text-muted-foreground dark:text-gray-300">
                            {contact.name[0]?.toUpperCase() || '+'}
                          </span>
                        )}
                      </div>
                      {contact.isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                      )}
                    </div>

                    {/* Info do contato */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground dark:text-gray-100 truncate flex-1">
                          {contact.name}
                        </h3>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatContactTime(contact.lastMessageTime)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1 gap-2">
                        <p className="text-sm text-muted-foreground dark:text-gray-400 truncate flex-1">
                          {contact.lastMessage || contact.phone}
                        </p>
                        {contact.unreadCount && contact.unreadCount > 0 && (
                          <span className="bg-green-500 text-white text-xs rounded-full px-2 py-0.5 flex-shrink-0 min-w-[20px] text-center">
                            {contact.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Área do Chat */}
          {selectedContact ? (
            <div className="flex-1 flex flex-col h-full">
              {/* Header do chat - FIXO */}
              <div className="bg-muted/50 dark:bg-gray-900 p-4 border-b border-border dark:border-gray-700 border-t-4 border-t-red-500 flex items-center flex-shrink-0">
                <button
                  onClick={() => setSelectedContact(null)}
                  className="md:hidden mr-3 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                
                <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center mr-3">
                  {selectedContact.avatar ? (
                    <img src={selectedContact.avatar} className="w-full h-full rounded-full object-cover" />
                  ) : selectedContact.isGroup ? (
                    <Users className="w-5 h-5 text-muted-foreground dark:text-gray-300" />
                  ) : (
                    <span className="font-semibold text-muted-foreground dark:text-gray-300">
                      {selectedContact.name[0]?.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-gray-100">
                    {selectedContact.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {selectedContact.status || selectedContact.phone}
                    </p>
                    {/* Indicador de status do WebSocket */}
                    <div className="flex items-center gap-1">
                      {wahaWebSocketStatus === 'connected' && (
                        <>
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-income">Tempo real</span>
                        </>
                      )}
                      {wahaWebSocketStatus === 'connecting' && (
                        <>
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-yellow-600">Conectando...</span>
                        </>
                      )}
                      {wahaWebSocketStatus === 'disconnected' && (
                        <>
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span className="text-xs text-expense">Sem tempo real</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                  <Search className="w-5 h-5 text-muted-foreground dark:text-gray-400" />
                </button>
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full ml-2">
                  <MoreVertical className="w-5 h-5 text-muted-foreground dark:text-gray-400" />
                </button>
              </div>

              {/* Mensagens - COM SCROLL VERTICAL */}
              <div 
                className="flex-1 overflow-y-auto overflow-x-hidden p-4"
                style={{ 
                  maxHeight: '66vh',
                  height: '63vh !important',
                  overflowY: 'scroll',
                  backgroundColor: '#0b141a',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='whatsappPattern' patternUnits='userSpaceOnUse' width='100' height='100'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='0.3' opacity='0.08'%3E%3C!-- Elementos decorativos similares ao WhatsApp --%3E%3Cpath d='M20,20 Q25,15 30,20 Q35,25 30,30 Q25,35 20,30 Q15,25 20,20 Z' /%3E%3Cpath d='M50,10 Q55,5 60,10 Q65,15 60,20 Q55,25 50,20 Q45,15 50,10 Z' /%3E%3Cpath d='M80,30 Q85,25 90,30 Q95,35 90,40 Q85,45 80,40 Q75,35 80,30 Z' /%3E%3Cpath d='M10,50 Q15,45 20,50 Q25,55 20,60 Q15,65 10,60 Q5,55 10,50 Z' /%3E%3Cpath d='M40,40 Q45,35 50,40 Q55,45 50,50 Q45,55 40,50 Q35,45 40,40 Z' /%3E%3Cpath d='M70,60 Q75,55 80,60 Q85,65 80,70 Q75,75 70,70 Q65,65 70,60 Z' /%3E%3Cpath d='M30,70 Q35,65 40,70 Q45,75 40,80 Q35,85 30,80 Q25,75 30,70 Z' /%3E%3Cpath d='M60,80 Q65,75 70,80 Q75,85 70,90 Q65,95 60,90 Q55,85 60,80 Z' /%3E%3C!-- Formas adicionais para criar textura --%3E%3Ccircle cx='15' cy='15' r='2' fill='%23ffffff' opacity='0.03' /%3E%3Ccircle cx='45' cy='25' r='1.5' fill='%23ffffff' opacity='0.03' /%3E%3Ccircle cx='75' cy='45' r='2' fill='%23ffffff' opacity='0.03' /%3E%3Ccircle cx='25' cy='85' r='1.5' fill='%23ffffff' opacity='0.03' /%3E%3Ccircle cx='85' cy='75' r='2' fill='%23ffffff' opacity='0.03' /%3E%3C!-- Linhas sutis --%3E%3Cpath d='M0,30 Q20,25 40,30 Q60,35 80,30 Q100,25 120,30' stroke-opacity='0.02' /%3E%3Cpath d='M0,70 Q20,65 40,70 Q60,75 80,70 Q100,65 120,70' stroke-opacity='0.02' /%3E%3C/g%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23whatsappPattern)' /%3E%3C/svg%3E")`
                }}
              >
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground bg-white dark:bg-gray-800 px-4 py-2 rounded-lg">
                      Nenhuma mensagem ainda. Comece uma conversa!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex",
                          message.isOutgoing ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[70%] rounded-lg px-3 py-2 shadow-sm message-container",
                            message.isOutgoing
                              ? "bg-green-100 dark:bg-green-900"
                              : "bg-white dark:bg-gray-800"
                          )}
                        >
                          {/* Conteúdo da mensagem baseado no tipo */}
                          {message.type === 'text' && (
                            <div className="text-foreground dark:text-gray-100 break-words">
                              {formatWhatsAppText(message.text || '')}
                            </div>
                          )}

                          {message.type === 'image' && (
                            <div className="image-container">
                              <img 
                                src={message.mediaUrl} 
                                alt="Imagem" 
                                className="rounded-lg max-w-full h-auto max-h-64 object-contain cursor-pointer"
                                onClick={() => window.open(message.mediaUrl, '_blank')}
                                onError={(e) => {
                                  // Fallback para imagens que falharem
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallback = document.createElement('div');
                                  fallback.className = 'p-2 bg-muted dark:bg-gray-700 rounded text-sm text-muted-foreground';
                                  fallback.textContent = 'Imagem não carregada';
                                  target.parentNode?.appendChild(fallback);
                                }}
                                style={{ maxWidth: '100%', height: 'auto' }}
                              />
                              {message.text && (
                                <div className="text-foreground dark:text-gray-100 mt-2 break-words">
                                  {formatWhatsAppText(message.text)}
                                </div>
                              )}
                            </div>
                          )}

                          {message.type === 'document' && (
                            <div className="flex items-center gap-2 p-2 bg-muted/50 dark:bg-gray-700 rounded">
                              <FileText className="w-8 h-8 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground dark:text-gray-100">
                                  {message.fileName || 'Documento'}
                                </p>
                                {message.fileSize && (
                                  <p className="text-xs text-muted-foreground">
                                    {(message.fileSize / 1024).toFixed(2)} KB
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Horário e status */}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {formatMessageTime(message.timestamp)}
                            </span>
                            {message.isOutgoing && (
                              <span className="text-muted-foreground">
                                {message.status === 'read' && <CheckCheck className="w-4 h-4 text-blue-500" />}
                                {message.status === 'delivered' && <CheckCheck className="w-4 h-4" />}
                                {message.status === 'sent' && <Check className="w-4 h-4" />}
                                {message.status === 'sending' && <Clock className="w-3 h-3" />}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input de mensagem - RODAPÉ FIXO */}
              <div className="bg-muted/50 dark:bg-gray-900 p-2 border-t border-border dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {/* Botão de emoji */}
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                  >
                    <Smile className="w-6 h-6 text-muted-foreground dark:text-gray-400" />
                  </button>

                  {/* Botão de anexo */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                    >
                      <Paperclip className="w-6 h-6 text-muted-foreground dark:text-gray-400" />
                    </button>

                    {/* Menu de anexos */}
                    {showAttachMenu && (
                      <div className="absolute bottom-12 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 space-y-1">
                        <button
                          onClick={() => {
                            fileInputRef.current?.click()
                            setShowAttachMenu(false)
                          }}
                          className="flex items-center gap-3 w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          <File className="w-5 h-5 text-purple-500" />
                          <span className="text-sm">Documento</span>
                        </button>
                        <button className="flex items-center gap-3 w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                          <Image className="w-5 h-5 text-blue-500" />
                          <span className="text-sm">Fotos e vídeos</span>
                        </button>
                        <button className="flex items-center gap-3 w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                          <Camera className="w-5 h-5 text-expense" />
                          <span className="text-sm">Câmera</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Input de texto */}
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Digite uma mensagem"
                    className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-border dark:border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
                  />

                  {/* Botão de enviar ou gravar */}
                  {messageText.trim() ? (
                    <button
                      onClick={sendMessage}
                      className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-full"
                    >
                      <Send className="w-6 h-6" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsRecording(!isRecording)}
                      className={cn(
                        "p-2 rounded-full",
                        isRecording 
                          ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                          : "hover:bg-gray-200 dark:hover:bg-gray-700"
                      )}
                    >
                      <Mic className={cn(
                        "w-6 h-6",
                        isRecording ? "text-white" : "text-muted-foreground dark:text-gray-400"
                      )} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/50 dark:bg-gray-900">
              <div className="text-center">
                <div className="w-64 h-64 mx-auto mb-4 opacity-50">
                  <img 
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 303 172'%3E%3Cpath fill='%23DFE5E7' d='M151.5 0C67.8 0 0 38.3 0 85.5S67.8 171 151.5 171 303 132.7 303 85.5 235.2 0 151.5 0zm0 158.4c-76.4 0-138.3-32.6-138.3-72.9S75.1 12.6 151.5 12.6s138.3 32.6 138.3 72.9-61.9 72.9-138.3 72.9z'/%3E%3C/svg%3E"
                    alt="WhatsApp" 
                  />
                </div>
                <h3 className="text-2xl font-light text-muted-foreground mb-2">WhatsApp Web</h3>
                <p className="text-muted-foreground">
                  Selecione uma conversa para começar
                </p>
              </div>
            </div>
          )}

          {/* Input de arquivo oculto */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}