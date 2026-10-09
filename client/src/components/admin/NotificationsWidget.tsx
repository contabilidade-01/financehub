import { useState, useEffect } from 'react'
import { Bell, X, CheckCheck, Trash2, AlertCircle, Info, CheckCircle, AlertTriangle } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function NotificationsWidget() {
  const {
    notifications,
    unreadCount,
    isConnected,
    connectionStatus,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    sendTestNotification
  } = useNotifications()

  const [isOpen, setIsOpen] = useState(false)

  // Log para debug
  console.log('[NotificationsWidget] Renderizado com:', {
    notifications: notifications.length,
    unreadCount,
    isConnected,
    connectionStatus,
    notificationsList: notifications
  })

  // Verificar se o widget está recebendo atualizações
  useEffect(() => {
    console.log('[NotificationsWidget] 🔄 useEffect - notifications alteradas:', notifications.length)
  }, [notifications])

  useEffect(() => {
    console.log('[NotificationsWidget] 🔄 useEffect - unreadCount alterado:', unreadCount)
  }, [unreadCount])

  // Ícone baseado no tipo de notificação
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-expense" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-income" />
      default:
        return <Info className="w-4 h-4 text-blue-500" />
    }
  }

  // Cor da borda baseada no tipo
  const getBorderColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-l-red-500'
      case 'warning':
        return 'border-l-yellow-500'
      case 'success':
        return 'border-l-green-500'
      default:
        return 'border-l-blue-500'
    }
  }

  // Status da conexão
  const getConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Conectado" />
      case 'connecting':
        return <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Conectando..." />
      case 'error':
        return <div className="w-2 h-2 bg-red-500 rounded-full" title="Erro de conexão" />
      default:
        return <div className="w-2 h-2 bg-gray-400 rounded-full" title="Desconectado" />
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-5 text-xs px-1 flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          {/* Indicador de status da conexão */}
          <div className="absolute -bottom-1 -right-1">
            {getConnectionStatus()}
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        align="end" 
        className="w-80 max-h-96"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
            {getConnectionStatus()}
          </div>
        </DropdownMenuLabel>

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 px-2 py-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs h-7"
              >
                <CheckCheck className="w-3 h-3 mr-1" />
                Marcar todas como lidas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllNotifications}
                className="text-xs h-7 text-expense hover:text-red-700"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Limpar todas
              </Button>
            </div>
          </>
        )}

        <DropdownMenuSeparator />

        <ScrollArea className="max-h-64">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3 p-3 hover:bg-muted/50 border-l-4 transition-colors",
                    getBorderColor(notification.type),
                    !notification.read && "bg-muted/30"
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={cn(
                        "text-sm font-medium leading-none mb-1",
                        !notification.read && "font-semibold"
                      )}>
                        {notification.title}
                      </h4>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => clearNotification(notification.id)}
                          className="w-5 h-5 p-0 text-muted-foreground hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                      {notification.message}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.timestamp), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                        {notification.from && (
                          <span className="ml-2">
                            • de {notification.from.name}
                          </span>
                        )}
                      </div>
                      
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs h-6 px-2"
                        >
                          Marcar como lida
                        </Button>
                      )}
                    </div>

                    {notification.test && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        Teste
                      </Badge>
                    )}
                    
                    {notification.broadcast && (
                      <Badge variant="outline" className="mt-1 text-xs">
                        Broadcast
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DropdownMenuSeparator />
        <div className="p-2">
          <Button
            variant="outline"
            size="sm"
            onClick={sendTestNotification}
            className="w-full text-xs"
            disabled={!isConnected}
          >
            Enviar Notificação de Teste
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}