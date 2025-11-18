import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SpinningBorder } from '@/components/ui/spinning-border';
import { WhatsAppChatModal } from '@/components/whatsapp-chat-modal';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/use-notifications';
import { Trash2, AlertTriangle, Palette, MessageSquare, Settings, Smartphone, CheckCircle2, XCircle, Phone, User, Wifi, WifiOff, Loader2, ChevronDown, ChevronRight, Link2, RefreshCw, Users, Plus, Play, Square, Edit2, QrCode, Key, MessageCircle, Bell, Copy, RotateCcw, Sparkles, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { ThemeCustomizer } from '@/components/theme-customizer';
import { LanguageSelector } from '@/components/admin/LanguageSelector';
import { useLocalization, useTranslation } from '@/contexts/LocalizationContext';
import { useSystemConfig } from '@/contexts/SystemConfigContext';

// Função para formatar número de telefone
const formatPhoneNumber = (phone: string) => {
  // Remove caracteres não numéricos
  const cleaned = phone.replace(/\D/g, '');
  
  // Se for um número brasileiro (55 + DDD + número)
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const countryCode = cleaned.slice(0, 2);
    const areaCode = cleaned.slice(2, 4);
    const firstPart = cleaned.slice(4, 5);
    const secondPart = cleaned.slice(5, 9);
    const thirdPart = cleaned.slice(9, 13);
    
    if (cleaned.length === 13) {
      // Formato com 9 dígitos: +55 (11) 9 9999-9999
      return `+${countryCode} (${areaCode}) ${firstPart} ${secondPart}-${thirdPart}`;
    } else if (cleaned.length === 12) {
      // Formato com 8 dígitos: +55 (11) 9999-9999
      const firstPartOld = cleaned.slice(4, 8);
      const secondPartOld = cleaned.slice(8, 12);
      return `+${countryCode} (${areaCode}) ${firstPartOld}-${secondPartOld}`;
    }
  }
  
  // Para outros formatos, apenas adiciona o +
  if (cleaned.length > 0) {
    return `+${cleaned}`;
  }
  
  return phone;
};

// Componente para configurações do sistema
function SystemConfigSection() {
  const { config, refetch } = useSystemConfig();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    system_name: config.system_name,
    system_name_short: config.system_name_short,
    system_tagline: config.system_tagline,
    support_email: config.support_email,
    system_url: config.system_url,
    system_description: config.system_description
  });

  const [isSaving, setIsSaving] = useState(false);

  // Atualizar form quando config mudar
  useEffect(() => {
    setFormData({
      system_name: config.system_name,
      system_name_short: config.system_name_short,
      system_tagline: config.system_tagline,
      support_email: config.support_email,
      system_url: config.system_url,
      system_description: config.system_description
    });
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch('/api/admin/system/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao salvar configurações');
      }

      // Invalidar cache e refetch
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      await refetch();

      // Forçar refresh da página para atualizar metadados e todos os componentes
      // (incluindo index.html)
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      toast({
        title: t('admin.customize.success', 'Sucesso'),
        description: t('admin.customize.system_config_saved', 'Configurações do sistema salvas com sucesso! A página será recarregada.'),
        variant: 'default'
      });
    } catch (error: any) {
      console.error('[SystemConfig] Erro ao salvar:', error);
      toast({
        title: t('admin.customize.error', 'Erro'),
        description: error.message || t('admin.customize.system_config_error', 'Erro ao salvar configurações'),
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">
          {t('admin.customize.system_settings', 'Configurações do Sistema')}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('admin.customize.system_settings_desc', 'Personalize o nome e informações exibidas em todo o sistema')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nome do Sistema */}
        <div className="space-y-2">
          <Label htmlFor="system_name">
            {t('admin.customize.system_name', 'Nome do Sistema')}
          </Label>
          <Input
            id="system_name"
            value={formData.system_name}
            onChange={(e) => handleChange('system_name', e.target.value)}
            placeholder="FinanceHub"
            maxLength={100}
          />
          <p className="text-xs text-muted-foreground">
            {t('admin.customize.system_name_help', 'Nome exibido em títulos, headers e interface')}
          </p>
        </div>

        {/* Nome Curto */}
        <div className="space-y-2">
          <Label htmlFor="system_name_short">
            {t('admin.customize.system_name_short', 'Nome Curto (lowercase)')}
          </Label>
          <Input
            id="system_name_short"
            value={formData.system_name_short}
            onChange={(e) => handleChange('system_name_short', e.target.value.toLowerCase())}
            placeholder="financehub"
            maxLength={50}
            pattern="[a-z0-9_-]+"
          />
          <p className="text-xs text-muted-foreground">
            {t('admin.customize.system_name_short_help', 'Usado em emails e URLs (apenas letras minúsculas, números, - e _)')}
          </p>
        </div>

        {/* Email de Suporte */}
        <div className="space-y-2">
          <Label htmlFor="support_email">
            {t('admin.customize.support_email', 'Email de Suporte')}
          </Label>
          <Input
            id="support_email"
            type="email"
            value={formData.support_email}
            onChange={(e) => handleChange('support_email', e.target.value)}
            placeholder="suporte@financehub.com"
          />
          <p className="text-xs text-muted-foreground">
            {t('admin.customize.support_email_help', 'Email de contato exibido aos usuários')}
          </p>
        </div>

        {/* URL do Sistema */}
        <div className="space-y-2">
          <Label htmlFor="system_url">
            {t('admin.customize.system_url', 'URL do Sistema')}
          </Label>
          <Input
            id="system_url"
            type="url"
            value={formData.system_url}
            onChange={(e) => handleChange('system_url', e.target.value)}
            placeholder="https://financehub.com"
          />
          <p className="text-xs text-muted-foreground">
            {t('admin.customize.system_url_help', 'URL principal do sistema')}
          </p>
        </div>
      </div>

      {/* Slogan */}
      <div className="space-y-2">
        <Label htmlFor="system_tagline">
          {t('admin.customize.system_tagline', 'Slogan/Tagline')}
        </Label>
        <Input
          id="system_tagline"
          value={formData.system_tagline}
          onChange={(e) => handleChange('system_tagline', e.target.value)}
          placeholder="Gestão financeira inteligente e moderna"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          {t('admin.customize.system_tagline_help', 'Frase descritiva exibida abaixo do nome')}
        </p>
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="system_description">
          {t('admin.customize.system_description', 'Descrição do Sistema (SEO)')}
        </Label>
        <Textarea
          id="system_description"
          value={formData.system_description}
          onChange={(e) => handleChange('system_description', e.target.value)}
          placeholder="Descrição completa para meta tags e SEO..."
          maxLength={500}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          {t('admin.customize.system_description_help', 'Descrição para buscadores (meta description)')}
        </p>
      </div>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          size="lg"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('admin.customize.saving', 'Salvando...')}
            </>
          ) : (
            t('admin.customize.save_settings', 'Salvar Configurações')
          )}
        </Button>
      </div>
    </div>
  );
}

// Componente para gerenciamento de idiomas
function LanguageManagementSection() {
  const { t, locale, availableLocales, isLoading, error } = useLocalization();
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Função para ativar/desativar idioma
  const handleToggleLanguage = async (localeCode: string, isActive: boolean) => {
    try {
      if (isActive) {
        // Se estiver ativando, define como padrão
        const response = await fetch(`/api/admin/localization/${localeCode}/set-default`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });
        if (response.ok) {
          toast({
            title: t('admin.customize.language_set_default', 'Idioma definido como padrão com sucesso')
          });
          // Invalidar queries para atualizar a interface automaticamente
          queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
          queryClient.invalidateQueries({ queryKey: ['defaultLocale'] });
        } else {
          throw new Error('Erro ao definir idioma como padrão');
        }
      } else {
        // Se estiver desativando, apenas desativa
        const response = await fetch(`/api/admin/localization/${localeCode}/toggle`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ isActive })
        });
        if (response.ok) {
          toast({
            title: t('admin.customize.language_deactivated', 'Idioma desativado com sucesso')
          });
          // Invalidar queries para atualizar a interface automaticamente
          queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
          queryClient.invalidateQueries({ queryKey: ['defaultLocale'] });
        } else {
          throw new Error('Erro ao desativar idioma');
        }
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar idioma',
        variant: 'destructive'
      });
    }
  };

  // Função para definir como padrão
  const handleSetDefault = async (localeCode: string) => {
    try {
      const response = await fetch(`/api/admin/localization/${localeCode}/set-default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (response.ok) {
        toast({
          title: t('admin.customize.default_language_set', 'Idioma padrão definido com sucesso')
        });
        // Invalidar queries para atualizar a interface automaticamente
        queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
        queryClient.invalidateQueries({ queryKey: ['defaultLocale'] });
      } else {
        throw new Error('Erro ao definir idioma padrão');
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao definir idioma padrão',
        variant: 'destructive'
      });
    }
  };

  if (isLoading) {
    return (
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          {t('admin.customize.loading_language', 'Carregando configurações de idioma...')}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
        <CardContent className="flex items-center justify-center py-10 text-destructive">
          <AlertTriangle className="h-6 w-6 mr-2" />
          {t('admin.customize.error_loading', 'Erro ao carregar configurações')}: {error}
        </CardContent>
      </Card>
    );
  }

  const currentLocale = availableLocales.find(l => l.localeCode === locale);

  return (
    <div className="space-y-6">
      {/* Status Atual do Idioma */}
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
        <CardHeader>
          <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'} flex items-center gap-2`}>
            <Globe className="h-5 w-5" />
            {t('admin.customize.current_language', 'Idioma Atual do Sistema')}
          </CardTitle>
          <CardDescription className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            {t('admin.customize.current_language_desc', 'Idioma atualmente ativo em todo o sistema')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {currentLocale?.localeName || 'Português Brasil'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Código: {currentLocale?.localeCode || locale}
                </p>
                {currentLocale?.isDefault && (
                  <div className="flex items-center gap-1 mt-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">Idioma Padrão</span>
                  </div>
                )}
              </div>
              <LanguageSelector variant="default" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Idiomas Disponíveis */}
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
        <CardHeader>
          <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'} flex items-center gap-2`}>
            <Settings className="h-5 w-5" />
            {t('admin.customize.language_activation', 'Ativação de Idiomas')}
          </CardTitle>
          <CardDescription className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            {t('admin.customize.language_activation_desc', 'Ative ou desative idiomas disponíveis no sistema')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableLocales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('admin.customize.no_languages_configured', 'Nenhum idioma configurado')}</p>
              <p className="text-sm">{t('admin.customize.configure_languages_admin', 'Configure idiomas através do painel administrativo')}</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {availableLocales.map((lang) => (
                <div 
                  key={lang.localeCode}
                  className={`p-4 rounded-lg border ${
                    lang.localeCode === locale 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{lang.localeName}</h4>
                        <div className="flex gap-1">
                          {lang.isDefault && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              {t('admin.customize.default_badge', 'Padrão')}
                            </span>
                          )}
                          {lang.localeCode === locale && (
                            <span className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full">
                              {t('admin.customize.active_badge', 'Ativo')}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {lang.localeCode}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Switch para ativar/desativar (apenas se não for o idioma atual ativo) */}
                      {lang.localeCode !== locale ? (
                        <div className="flex items-center gap-2">
                          <label className="text-sm">
                            {lang.isActive ? t('admin.customize.active_badge', 'Ativo') : t('admin.customize.inactive_badge', 'Inativo')}
                          </label>
                          <Switch
                            checked={lang.isActive}
                            onCheckedChange={(checked) => handleToggleLanguage(lang.localeCode, checked)}
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {t('admin.customize.current_active_language', 'Idioma ativo no momento')}
                        </div>
                      )}
                      
                      {/* Botão para definir como padrão (apenas se ativo e não for padrão) */}
                      {lang.isActive && !lang.isDefault && lang.localeCode !== locale && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(lang.localeCode)}
                        >
                          {t('admin.customize.set_as_default', 'Definir como Padrão')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gerenciamento Avançado */}
      <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
        <CardHeader>
          <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'} flex items-center gap-2`}>
            <Settings className="h-5 w-5" />
            {t('admin.customize.advanced_management', 'Gerenciamento Avançado')}
          </CardTitle>
          <CardDescription className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            {t('admin.customize.admin_panel_access', 'Acesso ao painel completo de configuração de idiomas')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('admin.customize.advanced_config_desc', 'Para configurações avançadas como adicionar novos idiomas, importar traduções ou modificar configurações do sistema, acesse o painel dedicado.')}
            </p>
            <Button 
              onClick={() => window.location.href = '/admin/language-settings'}
              className="w-full sm:w-auto"
            >
              <Globe className="h-4 w-4 mr-2" />
              {t('admin.customize.open_languages_panel', 'Abrir Painel de Idiomas')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Componente para testar notificações
function NotificationTestingCard() {
  const { 
    notifications, 
    unreadCount, 
    isConnected, 
    connectionStatus, 
    sendTestNotification 
  } = useNotifications();
  const { toast } = useToast();
  const [customNotification, setCustomNotification] = useState({
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    title: '',
    message: '',
    autoClose: 5000,
    persistent: false
  });
  const [isSending, setIsSending] = useState(false);

  const sendCustomNotification = async () => {
    if (!customNotification.title.trim() || !customNotification.message.trim()) {
      toast({
        title: t('common.error', 'Erro'),
        description: t('admin.customize.notifications.title_required', 'Título e mensagem são obrigatórios'),
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customNotification),
      });

      if (response.ok) {
        toast({
          title: t('common.success', 'Sucesso'),
          description: t('admin.customize.notifications.notification_sent', 'Notificação enviada com sucesso'),
        });
        // Limpar formulário
        setCustomNotification({
          type: 'info',
          title: '',
          message: '',
          autoClose: 5000,
          persistent: false
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao enviar notificação');
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendBroadcast = async () => {
    setIsSending(true);
    try {
      const response = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'info',
          title: 'Teste de Broadcast',
          message: `Mensagem de broadcast enviada às ${new Date().toLocaleTimeString('pt-BR')}`,
          autoClose: 5000,
          persistent: false
        }),
      });

      if (response.ok) {
        toast({
          title: 'Sucesso',
          description: 'Broadcast enviado para todos os SuperAdmins',
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao enviar broadcast');
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card className="glass-card neon-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('admin.customize.notifications_realtime', 'Sistema de Notificações em Tempo Real')}
        </CardTitle>
        <CardDescription>
          {t('admin.customize.notifications_desc', 'Teste e gerencie o sistema de notificações WebSocket para SuperAdmins')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status da Conexão */}
        <div className="p-4 bg-muted rounded-lg">
          <h3 className="font-medium mb-3">Status da Conexão WebSocket</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )} />
              <span className={getStatusColor(connectionStatus)}>
                {connectionStatus === 'connected' && t('admin.customize.status.connected', 'Conectado')}
                {connectionStatus === 'connecting' && t('admin.customize.status.connecting', 'Conectando...')}
                {connectionStatus === 'error' && t('admin.customize.status.error', 'Erro de conexão')}
                {connectionStatus === 'disconnected' && t('admin.customize.status.disconnected', 'Desconectado')}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {notifications.length} notificações | {unreadCount} não lidas
            </div>
          </div>
        </div>

        {/* Testes Rápidos */}
        <div className="space-y-4">
          <h3 className="font-medium">Testes Rápidos</h3>
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={sendTestNotification}
              disabled={!isConnected || isSending}
              size="sm"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Teste Simples
            </Button>
            <Button
              onClick={sendBroadcast}
              disabled={!isConnected || isSending}
              variant="outline"
              size="sm"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Broadcast para SuperAdmins
            </Button>
            <Button
              onClick={() => {
                console.log('[NotificationTest] 🔧 Teste de estado local')
                // Forçar uma notificação local para testar se o widget está funcionando
                const testNotif = {
                  id: `debug_${Date.now()}`,
                  type: 'success' as const,
                  title: 'Teste Local Debug',
                  message: 'Se você viu isso, o widget está funcionando!',
                  timestamp: new Date().toISOString(),
                  test: true
                }
                // Usando window para acessar o contexto globalmente
                if (typeof window !== 'undefined') {
                  console.log('[NotificationTest] Tentando forçar notificação:', testNotif)
                }
              }}
              variant="secondary"
              size="sm"
            >
              🔧 Teste Widget
            </Button>
          </div>
        </div>

        {/* Notificação Personalizada */}
        <div className="space-y-4">
          <h3 className="font-medium">Enviar Notificação Personalizada</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo</label>
              <select
                value={customNotification.type}
                onChange={(e) => setCustomNotification(prev => ({ 
                  ...prev, 
                  type: e.target.value as any 
                }))}
                className="w-full p-2 border rounded-md bg-background"
              >
                <option value="info">Informação</option>
                <option value="success">Sucesso</option>
                <option value="warning">Aviso</option>
                <option value="error">Erro</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Auto-fechar (ms)</label>
              <input
                type="number"
                value={customNotification.autoClose}
                onChange={(e) => setCustomNotification(prev => ({ 
                  ...prev, 
                  autoClose: parseInt(e.target.value) || 5000 
                }))}
                className="w-full p-2 border rounded-md bg-background"
                min="1000"
                max="30000"
                step="1000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <input
              type="text"
              value={customNotification.title}
              onChange={(e) => setCustomNotification(prev => ({ 
                ...prev, 
                title: e.target.value 
              }))}
              placeholder={t('admin.customize.placeholders.notification_title', 'Digite o título da notificação')}
              className="w-full p-2 border rounded-md bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mensagem</label>
            <textarea
              value={customNotification.message}
              onChange={(e) => setCustomNotification(prev => ({ 
                ...prev, 
                message: e.target.value 
              }))}
              placeholder={t('admin.customize.placeholders.notification_message', 'Digite a mensagem da notificação')}
              className="w-full p-2 border rounded-md bg-background h-20 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="persistent"
              checked={customNotification.persistent}
              onChange={(e) => setCustomNotification(prev => ({ 
                ...prev, 
                persistent: e.target.checked 
              }))}
            />
            <label htmlFor="persistent" className="text-sm">
              Notificação persistente (não exibe toast)
            </label>
          </div>

          <Button
            onClick={sendCustomNotification}
            disabled={!isConnected || isSending || !customNotification.title.trim() || !customNotification.message.trim()}
            className="w-full"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Enviar Notificação
          </Button>
        </div>

        {/* Lista de Notificações Recentes */}
        {notifications.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-medium">Notificações Recentes ({notifications.length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 border rounded-md border-l-4",
                    notification.type === 'error' && "border-l-red-500 bg-red-50 dark:bg-red-950/20",
                    notification.type === 'warning' && "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
                    notification.type === 'success' && "border-l-green-500 bg-green-50 dark:bg-green-950/20",
                    notification.type === 'info' && "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
                    !notification.read && "shadow-md"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{notification.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{new Date(notification.timestamp).toLocaleString('pt-BR')}</span>
                        {notification.from && (
                          <span>• de {notification.from.name}</span>
                        )}
                        {notification.test && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                            Teste
                          </span>
                        )}
                        {notification.broadcast && (
                          <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                            Broadcast
                          </span>
                        )}
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomizePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoLightUrl, setLogoLightUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [previewLight, setPreviewLight] = useState<string | null>(null);
  const [previewDark, setPreviewDark] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<null | 'light' | 'dark'>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState("personalizar");
  
  // Estados para mensagens de boas vindas
  const [welcomeMessages, setWelcomeMessages] = useState<any>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSavingMessage, setIsSavingMessage] = useState(false);
  
  // Estados para configuração WAHA
  const [wahaConfig, setWahaConfig] = useState<any>({});
  const [isLoadingWaha, setIsLoadingWaha] = useState(false);
  const [isSavingWaha, setIsSavingWaha] = useState(false);
  const [isTestingWaha, setIsTestingWaha] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    phoneNumber?: string;
    pushName?: string;
    status?: string;
    error?: string;
  } | null>(null);
  const [wahaSessions, setWahaSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [showEditSessionModal, setShowEditSessionModal] = useState<string | null>(null);
  const [newSessionData, setNewSessionData] = useState({
    sessionName: '',
    webhooks: [{ url: '', events: ['message'] }]
  });
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [editingWebhooks, setEditingWebhooks] = useState<any[]>([]);
  
  // Estado para webhook da sessão
  const [sessionWebhook, setSessionWebhook] = useState<any>(null);
  const [isLoadingSessionWebhook, setIsLoadingSessionWebhook] = useState(false);
  const [isRegeneratingWebhook, setIsRegeneratingWebhook] = useState(false);

  // Estados para QR Code e pareamento por código
  const [showQRModal, setShowQRModal] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<any>(null);
  const [showPairingCodeModal, setShowPairingCodeModal] = useState<string | null>(null);
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState<number>(5);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState<boolean>(false);
  const [isGeneratingQR, setIsGeneratingQR] = useState<boolean>(false);
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState('');
  const [pairingCodeSent, setPairingCodeSent] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [isSessionConnected, setIsSessionConnected] = useState<boolean>(false);
  const [connectedSessionInfo, setConnectedSessionInfo] = useState<any>(null);
  const [isRefreshingQR, setIsRefreshingQR] = useState<boolean>(false);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState<boolean>(false);

  // Estados para chat modal
  const [showChatModal, setShowChatModal] = useState<string | null>(null);

  // Buscar logo atual ao carregar
  useEffect(() => {
    fetch('/api/logo', { cache: 'no-store' })
      .then(res => res.ok ? res.url : null)
      .then(url => setLogoUrl(url))
      .catch(() => setLogoUrl(null));
  }, []);

  // Buscar logos atuais ao carregar
  useEffect(() => {
    fetch('/api/logo?theme=light', { cache: 'no-store' })
      .then(res => res.ok ? res.url : null)
      .then(url => setLogoLightUrl(url))
      .catch(() => setLogoLightUrl(null));
    fetch('/api/logo?theme=dark', { cache: 'no-store' })
      .then(res => res.ok ? res.url : null)
      .then(url => setLogoDarkUrl(url))
      .catch(() => setLogoDarkUrl(null));
  }, []);

  // Carregar configurações WAHA na inicialização
  useEffect(() => {
    loadWahaConfig();
  }, []);

  // Buscar mensagens de boas vindas
  useEffect(() => {
    if (activeTab === 'mensagens') {
      loadWelcomeMessages();
    }
    // if (activeTab === 'waha') {
    //   loadWahaConfig();
    // }
  }, [activeTab]);

  // Carregar webhook da sessão quando modal for aberto
  useEffect(() => {
    if (showEditSessionModal) {
      loadSessionWebhook(showEditSessionModal);
    } else {
      setSessionWebhook(null);
    }
  }, [showEditSessionModal]);

  const loadWelcomeMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch('/api/admin/welcome-messages', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        const messagesMap = data.data.reduce((acc: any, msg: any) => {
          acc[msg.type] = msg;
          return acc;
        }, {});
        setWelcomeMessages(messagesMap);
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
      toast({ title: t('admin.customize.notifications.messages_error', 'Erro ao carregar mensagens'), variant: 'destructive' });
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const saveWelcomeMessage = async (type: string, messageData: any) => {
    setIsSavingMessage(true);
    try {
      const response = await fetch(`/api/admin/welcome-messages/${type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(messageData)
      });
      
      if (response.ok) {
        toast({ title: t('admin.customize.notifications.message_saved', 'Mensagem salva com sucesso!') });
        loadWelcomeMessages(); // Recarregar mensagens
      } else {
        throw new Error('Erro ao salvar mensagem');
      }
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error);
      toast({ title: t('admin.customize.notifications.message_save_error', 'Erro ao salvar mensagem'), variant: 'destructive' });
    } finally {
      setIsSavingMessage(false);
    }
  };

  const loadWahaConfig = async () => {
    setIsLoadingWaha(true);
    try {
      const response = await fetch('/api/admin/waha-config', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setWahaConfig(data.data);
        // Se configurado, carregar sessões e testar conexão automaticamente
        if (data.data?.waha_url && data.data?.api_key) {
          loadWahaSessions(false, false);
          // Testar conexão automaticamente ao carregar
          setTimeout(() => {
            testWahaConnectionSilent();
          }, 500);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração WAHA:', error);
      toast({ title: 'Erro ao carregar configuração WAHA', variant: 'destructive' });
    } finally {
      setIsLoadingWaha(false);
    }
  };

  const loadWahaSessions = async (silent = false, showSpinner = false) => {
    // Só mostrar loading na primeira carga ou quando explícitamente solicitado
    if (!silent && !showSpinner) {
      setIsLoadingSessions(true);
    } else if (showSpinner) {
      setIsRefreshingSessions(true);
    }
    
    try {
      const response = await fetch('/api/admin/waha-sessions', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        // Se data.data for um array, usar diretamente
        // Se for um objeto com sessões, converter para array
        let sessions = [];
        if (Array.isArray(data.data)) {
          sessions = data.data;
        } else if (data.data && typeof data.data === 'object') {
          // Se for um objeto único de sessão
          sessions = [data.data];
        }
        setWahaSessions(sessions);
      } else {
        console.log('Não foi possível carregar sessões');
        // Só limpar sessões se não for uma atualização silenciosa
        if (!silent) {
          setWahaSessions([]);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar sessões WAHA:', error);
      // Só limpar sessões se não for uma atualização silenciosa
      if (!silent) {
        setWahaSessions([]);
      }
    } finally {
      if (!silent && !showSpinner) {
        setIsLoadingSessions(false);
      }
      if (showSpinner) {
        setIsRefreshingSessions(false);
      }
    }
  };

  const toggleSessionExpansion = (sessionName: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionName)) {
      newExpanded.delete(sessionName);
    } else {
      newExpanded.add(sessionName);
    }
    setExpandedSessions(newExpanded);
  };

  const createNewSession = async () => {
    if (!newSessionData.sessionName.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome da sessão é obrigatório',
        variant: 'destructive'
      });
      return;
    }

    setIsCreatingSession(true);
    try {
      const response = await fetch('/api/admin/waha-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionName: newSessionData.sessionName,
          webhooks: newSessionData.webhooks.filter(w => w.url.trim())
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Sessão criada!',
          description: `Sessão "${newSessionData.sessionName}" criada com sucesso`
        });
        setShowCreateSessionModal(false);
        setNewSessionData({ sessionName: '', webhooks: [{ url: '', events: ['message'] }] });
        loadWahaSessions(false); // Recarregar lista com loading
      } else {
        toast({
          title: 'Erro ao criar sessão',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao criar sessão:', error);
      toast({
        title: 'Erro ao criar sessão',
        description: 'Não foi possível conectar com o servidor',
        variant: 'destructive'
      });
    } finally {
      setIsCreatingSession(false);
    }
  };

  const updateSession = async (sessionName: string, webhooks: any[]) => {
    setIsUpdatingSession(true);
    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ webhooks })
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Sessão atualizada!',
          description: `Configuração da sessão "${sessionName}" atualizada com sucesso`
        });
        setShowEditSessionModal(null);
        loadWahaSessions(true); // Atualização silenciosa
      } else {
        toast({
          title: 'Erro ao atualizar sessão',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar sessão:', error);
      toast({
        title: 'Erro ao atualizar sessão',
        description: 'Não foi possível conectar com o servidor',
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingSession(false);
    }
  };

  // Carregar webhook da sessão
  const loadSessionWebhook = async (sessionName: string) => {
    setIsLoadingSessionWebhook(true);
    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/webhook`, {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        setSessionWebhook(data.data);
      } else {
        console.error('Erro ao carregar webhook da sessão:', data.message);
      }
    } catch (error) {
      console.error('Erro ao carregar webhook da sessão:', error);
    } finally {
      setIsLoadingSessionWebhook(false);
    }
  };

  // Regenerar webhook da sessão
  const regenerateSessionWebhook = async (sessionName: string) => {
    setIsRegeneratingWebhook(true);
    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/webhook/regenerate`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        setSessionWebhook(data.data);
        toast({
          title: 'Webhook regenerado!',
          description: 'Nova URL de webhook gerada com sucesso'
        });
      } else {
        toast({
          title: 'Erro ao regenerar webhook',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao regenerar webhook da sessão:', error);
      toast({
        title: 'Erro ao regenerar webhook',
        description: 'Não foi possível conectar com o servidor',
        variant: 'destructive'
      });
    } finally {
      setIsRegeneratingWebhook(false);
    }
  };

  // Copiar URL do webhook para clipboard
  const copyWebhookUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'URL copiada!',
        description: 'URL do webhook foi copiada para a área de transferência'
      });
    } catch (error) {
      console.error('Erro ao copiar URL:', error);
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar a URL',
        variant: 'destructive'
      });
    }
  };

  const startSession = async (sessionName: string) => {
    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/start`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Sessão iniciada!',
          description: `Sessão "${sessionName}" foi iniciada. Escaneie o QR Code no WhatsApp Web.`
        });
        loadWahaSessions(true); // Atualização silenciosa
      } else {
        toast({
          title: 'Erro ao iniciar sessão',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao iniciar sessão:', error);
      toast({
        title: 'Erro ao iniciar sessão',
        description: 'Não foi possível conectar com o servidor',
        variant: 'destructive'
      });
    }
  };

  const stopSession = async (sessionName: string) => {
    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/stop`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Sessão parada!',
          description: `Sessão "${sessionName}" foi parada com sucesso`
        });
        loadWahaSessions(true); // Atualização silenciosa
      } else {
        toast({
          title: 'Erro ao parar sessão',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao parar sessão:', error);
      toast({
        title: 'Erro ao parar sessão',
        description: 'Não foi possível conectar com o servidor',
        variant: 'destructive'
      });
    }
  };

  const deleteSession = async (sessionName: string) => {
    if (!confirm(`Tem certeza que deseja deletar a sessão "${sessionName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Sessão deletada!',
          description: `Sessão "${sessionName}" foi deletada com sucesso`
        });
        loadWahaSessions(false); // Recarregar com loading após deletar
      } else {
        toast({
          title: 'Erro ao deletar sessão',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao deletar sessão:', error);
      toast({
        title: 'Erro ao deletar sessão',
        description: 'Não foi possível conectar com o servidor',
        variant: 'destructive'
      });
    }
  };

  // useEffect para auto-refresh do QR Code
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (showQRModal && qrCodeData && isAutoRefreshing) {
      interval = setInterval(() => {
        setAutoRefreshCountdown((prev) => {
          if (prev <= 1) {
            // Reset countdown e refresh do QR Code
            if (showQRModal) {
              getQRCode(showQRModal);
            }
            return 10; // Aumentado para 10 segundos
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [showQRModal, qrCodeData, isAutoRefreshing]);
  
  // useEffect para verificar periodicamente se a sessão foi conectada
  useEffect(() => {
    let checkInterval: NodeJS.Timeout;
    
    if (showQRModal && !isGeneratingQR && qrCodeData) {
      // Verificar o status a cada 5 segundos (menos frequente)
      checkInterval = setInterval(async () => {
        const status = await checkSessionStatus(showQRModal);
        console.log(`Verificação periódica - Status da sessão ${showQRModal}: ${status}`);
        
        if (status === 'WORKING' || status === 'CONNECTED') {
          // Marcar como conectado e parar o auto-refresh
          setIsSessionConnected(true);
          setIsAutoRefreshing(false);
          setQrCodeData(null);
          
          // Buscar informações da sessão conectada
          const session = wahaSessions.find((s: any) => s.name === showQRModal);
          if (session) {
            setConnectedSessionInfo(session);
          }
          
          toast({ 
            title: '✅ WhatsApp conectado!', 
            description: 'Sua sessão foi conectada com sucesso e já está ativa.' 
          });
          
          // Garantir que a sessão está iniciada
          if (status !== 'WORKING') {
            try {
              await fetch(`/api/admin/waha-sessions/${showQRModal}/start`, {
                method: 'POST',
                credentials: 'include'
              });
            } catch (error) {
              console.log('Sessão já pode estar iniciada');
            }
          }
          
          // Fazer apenas uma atualização silenciosa final da lista
          setTimeout(() => {
            loadWahaSessions(true); // Atualização silenciosa
          }, 1000);
          
          // Fechar modal após 3 segundos
          setTimeout(() => {
            setShowQRModal(null);
            setIsSessionConnected(false);
            setConnectedSessionInfo(null);
          }, 3000);
        }
      }, 5000); // Aumentado para 5 segundos
    }
    
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [showQRModal, isGeneratingQR, qrCodeData]);

  // Função para verificar status da sessão
  const checkSessionStatus = async (sessionName: string) => {
    try {
      // Usar o estado local primeiro para evitar refreshs desnecessários
      const localSession = wahaSessions.find((s: any) => s.name === sessionName);
      
      // Só fazer requisição se estamos verificando para o modal de QRCode
      if (showQRModal === sessionName) {
        const response = await fetch(`/api/admin/waha-sessions`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const result = await response.json();
          const sessions = result.data || [];
          const session = sessions.find((s: any) => s.name === sessionName);
          
          // Atualização suave: só atualizar o estado se houve mudança
          if (session && localSession && session.status !== localSession.status) {
            // Atualizar apenas a sessão específica sem redesenhar toda a lista
            setWahaSessions(prevSessions => 
              prevSessions.map(s => 
                s.name === sessionName ? { ...s, ...session } : s
              )
            );
          }
          
          return session ? session.status : 'UNKNOWN';
        }
      }
      
      return localSession ? localSession.status : 'UNKNOWN';
    } catch (error) {
      console.error('Erro ao verificar status da sessão:', error);
    }
    return 'UNKNOWN';
  };

  // Função para iniciar sessão e obter QR Code
  const startSessionAndGetQR = async (sessionName: string) => {
    try {
      // Primeiro, iniciar a sessão
      toast({
        title: 'Iniciando sessão...',
        description: 'Preparando sessão para conexão WhatsApp'
      });

      const startResponse = await fetch(`/api/admin/waha-sessions/${sessionName}/start`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!startResponse.ok) {
        const startData = await startResponse.json();
        throw new Error(startData.message || 'Erro ao iniciar sessão');
      }

      // Mostrar modal de loading
      setShowQRModal(sessionName);
      setQrCodeData(null);
      setIsGeneratingQR(true);

      // Aguardar sessão ficar pronta e tentar obter QR Code
      let attempts = 0;
      const maxAttempts = 15; // 37.5 segundos total (15 x 2.5s)
      
      while (attempts < maxAttempts) {
        attempts++;
        
        // Aguardar antes de verificar status
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        const status = await checkSessionStatus(sessionName);
        console.log(`Tentativa ${attempts}: Status da sessão ${sessionName} = ${status}`);
        
        // Tentar obter QR Code independente do status
        try {
          const qrResponse = await fetch(`/api/admin/waha-sessions/${sessionName}/qr`, {
            credentials: 'include'
          });
          
          if (qrResponse.ok) {
            const result = await qrResponse.json();
            console.log('✅ QR Code obtido com sucesso:', result);
            console.log('📊 Dados do QR Code:', result.data);
            setQrCodeData(result.data);
            
            // Ativar auto-refresh e desativar loading
            setIsGeneratingQR(false);
            setIsAutoRefreshing(true);
            setAutoRefreshCountdown(10); // Começar com 10 segundos
            
            toast({
              title: 'QR Code gerado!',
              description: 'Escaneie com seu WhatsApp para conectar'
            });
            return; // Sucesso!
          } else {
            console.log(`Tentativa ${attempts}: QR Code não disponível ainda (${qrResponse.status})`);
          }
        } catch (qrError) {
          console.log(`Tentativa ${attempts}: Erro ao buscar QR Code:`, qrError);
        }
        
        // Parar se a sessão falhou
        if (status === 'FAILED' || status === 'STOPPED') {
          throw new Error(`Sessão falhou com status: ${status}`);
        }
      }
      
      // Se chegou aqui, todas as tentativas falharam
      throw new Error('Tempo limite excedido. Tente novamente em alguns instantes.');
      
    } catch (error) {
      console.error('Erro ao iniciar sessão e obter QR Code:', error);
      
      // Fechar modal se aberto
      setShowQRModal(null);
      setQrCodeData(null);
      setIsGeneratingQR(false);
      
      toast({ 
        title: 'Erro ao obter QR Code', 
        description: error instanceof Error ? error.message : 'Verifique se a configuração está correta.',
        variant: 'destructive' 
      });
    }
  };

  // Função para obter QR Code (para sessões já iniciadas)
  const getQRCode = async (sessionName: string) => {
    try {
      setIsGeneratingQR(true);
      
      // Primeiro verificar o status da sessão
      const status = await checkSessionStatus(sessionName);
      console.log(`Status da sessão ${sessionName}: ${status}`);
      
      // Se a sessão está conectada, mostrar status de sucesso
      if (status === 'WORKING' || status === 'CONNECTED') {
        setIsSessionConnected(true);
        setIsAutoRefreshing(false);
        setQrCodeData(null);
        setIsGeneratingQR(false);
        
        // Buscar informações da sessão conectada
        const session = wahaSessions.find((s: any) => s.name === sessionName);
        if (session) {
          setConnectedSessionInfo(session);
        }
        
        toast({ 
          title: '✅ WhatsApp conectado!', 
          description: 'Sua sessão foi conectada com sucesso e já está ativa.' 
        });
        
        // Garantir que a sessão está iniciada
        if (status !== 'WORKING') {
          try {
            await fetch(`/api/admin/waha-sessions/${sessionName}/start`, {
              method: 'POST',
              credentials: 'include'
            });
          } catch (error) {
            console.log('Sessão já pode estar iniciada');
          }
        }
        
        loadWahaSessions(true); // Atualização silenciosa
        
        // Fechar modal após 3 segundos
        setTimeout(() => {
          setShowQRModal(null);
          setIsSessionConnected(false);
          setConnectedSessionInfo(null);
        }, 3000);
        
        return;
      }
      
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/qr`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Erro ao obter QR Code');
      }

      const result = await response.json();
      console.log('✅ QR Code obtido via getQRCode:', result);
      console.log('📊 Dados do QR Code:', result.data);
      setQrCodeData(result.data);
      setIsGeneratingQR(false);
      setShowQRModal(sessionName);
    } catch (error) {
      console.error('Erro ao obter QR Code:', error);
      setIsGeneratingQR(false);
      toast({ 
        title: 'Erro ao obter QR Code', 
        description: 'Verifique se a sessão está iniciada.',
        variant: 'destructive' 
      });
    }
  };

  // Função para enviar código de pareamento
  const sendPairingCode = async (sessionName: string, phoneNumber: string) => {
    try {
      // Primeiro, tentar iniciar a sessão se necessário
      try {
        await fetch(`/api/admin/waha-sessions/${sessionName}/start`, {
          method: 'POST',
          credentials: 'include'
        });
        // Aguardar um pouco para inicializar
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (startError) {
        console.log('Sessão pode já estar iniciada ou erro ao iniciar');
      }

      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/pairing-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Erro ao enviar código de pareamento');
      }

      const result = await response.json();
      setPairingCodeSent(true);
      toast({ 
        title: 'Código enviado!', 
        description: 'Verifique seu WhatsApp e digite o código recebido.' 
      });
    } catch (error) {
      console.error('Erro ao enviar código:', error);
      toast({ 
        title: 'Erro ao enviar código', 
        description: 'Verifique o número informado.',
        variant: 'destructive' 
      });
    }
  };

  // Função para confirmar código de pareamento
  const confirmPairingCode = async (sessionName: string, code: string) => {
    try {
      const response = await fetch(`/api/admin/waha-sessions/${sessionName}/confirm-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ code })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Erro ao confirmar código');
      }

      const result = await response.json();
      toast({ 
        title: 'Pareamento confirmado!', 
        description: 'Sua sessão foi conectada com sucesso.' 
      });
      
      // Limpar estados e recarregar sessões
      setShowPairingCodeModal(null);
      setPairingPhoneNumber('');
      setPairingCode('');
      setPairingCodeSent(false);
      loadWahaSessions(true, false); // Atualização silenciosa após pareamento
    } catch (error) {
      console.error('Erro ao confirmar código:', error);
      toast({ 
        title: 'Erro ao confirmar código', 
        description: 'Código inválido ou expirado.',
        variant: 'destructive' 
      });
    }
  };

  const saveWahaConfig = async () => {
    setIsSavingWaha(true);
    try {
      const response = await fetch('/api/admin/waha-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(wahaConfig)
      });
      
      if (response.ok) {
        toast({ title: 'Configuração WAHA salva com sucesso!' });
        loadWahaConfig(); // Recarregar configurações
      } else {
        throw new Error('Erro ao salvar configuração WAHA');
      }
    } catch (error) {
      console.error('Erro ao salvar configuração WAHA:', error);
      toast({ title: 'Erro ao salvar configuração WAHA', variant: 'destructive' });
    } finally {
      setIsSavingWaha(false);
    }
  };

  // Função para testar conexão silenciosamente (ao carregar a página)
  const testWahaConnectionSilent = async () => {
    try {
      const response = await fetch('/api/admin/waha-config/test', {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Extrair informações da resposta
        const sessionData = data.data?.response;
        let phoneNumber = '';
        let pushName = '';
        let status = '';
        
        // Tentar extrair dados da sessão
        if (sessionData) {
          // Formato padrão da API WAHA
          if (sessionData.me) {
            phoneNumber = sessionData.me.id?.replace('@c.us', '').replace('@s.whatsapp.net', '') || '';
            pushName = sessionData.me.pushName || sessionData.me.name || '';
          }
          if (sessionData.status) {
            status = sessionData.status;
          }
          if (sessionData.engine?.state) {
            status = sessionData.engine.state;
          }
          // Fallback para outros formatos
          if (!phoneNumber && sessionData.id) {
            phoneNumber = sessionData.id.replace('@c.us', '').replace('@s.whatsapp.net', '');
          }
          if (!pushName && sessionData.pushName) {
            pushName = sessionData.pushName;
          }
        }
        
        setConnectionStatus({
          connected: true,
          phoneNumber: phoneNumber || '',
          pushName: pushName || '',
          status: status || 'API OK'
        });
      } else {
        setConnectionStatus({
          connected: false,
          error: data.message || 'Não foi possível conectar'
        });
      }
    } catch (error) {
      console.error('Erro ao testar conexão WAHA silenciosamente:', error);
      setConnectionStatus({
        connected: false,
        error: 'Erro ao conectar com o servidor'
      });
    }
  };
  
  // Função para testar conexão manualmente (botão)
  const testWahaConnection = async () => {
    setIsTestingWaha(true);
    setConnectionStatus(null);
    try {
      const response = await fetch('/api/admin/waha-config/test', {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Extrair informações da resposta
        const sessionData = data.data?.response;
        let phoneNumber = '';
        let pushName = '';
        let status = '';
        
        // Tentar extrair dados da sessão
        if (sessionData) {
          // Formato padrão da API WAHA
          if (sessionData.me) {
            phoneNumber = sessionData.me.id?.replace('@c.us', '').replace('@s.whatsapp.net', '') || '';
            pushName = sessionData.me.pushName || sessionData.me.name || '';
          }
          if (sessionData.status) {
            status = sessionData.status;
          }
          if (sessionData.engine?.state) {
            status = sessionData.engine.state;
          }
          // Fallback para outros formatos
          if (!phoneNumber && sessionData.id) {
            phoneNumber = sessionData.id.replace('@c.us', '').replace('@s.whatsapp.net', '');
          }
          if (!pushName && sessionData.pushName) {
            pushName = sessionData.pushName;
          }
        }
        
        setConnectionStatus({
          connected: true,
          phoneNumber: phoneNumber || 'Número não disponível',
          pushName: pushName || 'Nome não disponível',
          status: status || 'CONNECTED'
        });
        
        toast({ 
          title: 'Conexão testada com sucesso!', 
          description: phoneNumber ? `WhatsApp conectado: ${phoneNumber}` : 'WAHA está respondendo normalmente.'
        });
      } else {
        setConnectionStatus({
          connected: false,
          error: data.message || 'Não foi possível conectar'
        });
        
        toast({ 
          title: 'Falha no teste de conexão', 
          description: data.message,
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('Erro ao testar conexão WAHA:', error);
      setConnectionStatus({
        connected: false,
        error: 'Erro ao conectar com o servidor'
      });
      
      toast({ 
        title: 'Erro ao testar conexão', 
        description: 'Não foi possível conectar com o WAHA',
        variant: 'destructive' 
      });
    } finally {
      setIsTestingWaha(false);
    }
  };

  // Função para testar endpoints de QR Code
  const testQRCodeEndpoints = async () => {
    try {
      setIsTestingWaha(true);
      toast({
        title: 'Testando endpoints de QR Code...',
        description: 'Verificando todos os endpoints disponíveis'
      });

      const response = await fetch('/api/admin/waha-test-qr', {
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        const { qrTestResults, summary } = data;
        
        // Mostrar resultados em um toast detalhado
        const successfulEndpoints = summary.successfulEndpoints;
        const totalEndpoints = summary.totalEndpoints * summary.totalSessions;
        
        if (successfulEndpoints > 0) {
          toast({
            title: '✅ Endpoints de QR Code funcionais encontrados!',
            description: `${successfulEndpoints}/${totalEndpoints} endpoints funcionaram`,
          });
          
          // Log detalhado no console
          console.log('🔍 Resultados do teste de QR Code:', data);
        } else {
          toast({
            title: '❌ Nenhum endpoint de QR Code funcionou',
            description: 'Verifique a configuração do WAHA',
            variant: 'destructive'
          });
        }
      } else {
        toast({
          title: 'Erro no teste de QR Code',
          description: data.message || 'Falha ao testar endpoints',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao testar endpoints de QR Code:', error);
      toast({
        title: 'Erro ao testar endpoints',
        description: 'Não foi possível executar o teste',
        variant: 'destructive'
      });
    } finally {
      setIsTestingWaha(false);
    }
  };

  // Só superadmin pode acessar
  if (user?.tipo_usuario !== 'super_admin') {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle>Acesso negado</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Você não tem permissão para acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Simula fetch do logo atual (poderia ser um useEffect com fetch real)
  // Aqui, logoUrl pode ser inicializado com o logo padrão do sistema

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'light' | 'dark') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        toast({ title: 'Arquivo muito grande', description: 'O logo deve ter até 1MB.', variant: 'destructive' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (type === 'light') setPreviewLight(ev.target?.result as string);
        else setPreviewDark(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    const fileLight = (document.getElementById('logo-light-input') as HTMLInputElement)?.files?.[0];
    const fileDark = (document.getElementById('logo-dark-input') as HTMLInputElement)?.files?.[0];
    if (!fileLight && !fileDark) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      if (fileLight) formData.append('logo_light', fileLight);
      if (fileDark) formData.append('logo_dark', fileDark);
      const res = await fetch('/api/admin/logo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erro ao enviar logo');
      if (fileLight) setLogoLightUrl('/api/logo?theme=light&' + Date.now());
      if (fileDark) setLogoDarkUrl('/api/logo?theme=dark&' + Date.now());
      setPreviewLight(null);
      setPreviewDark(null);
      toast({ title: t('admin.customize.notifications.logo_updated', 'Logo atualizado com sucesso!') });
      // Disparar evento para Sidebar recarregar o logo
      window.dispatchEvent(new Event('logo-updated'));
    } catch (err) {
      toast({ title: t('admin.customize.notifications.logo_upload_error', 'Erro ao enviar logo'), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteLogo = async (theme: 'light' | 'dark') => {
    setIsDeleting(true);
    try {
      await fetch(`/api/admin/logo?theme=${theme}`, { method: 'DELETE', credentials: 'include' });
      if (theme === 'light') {
        setLogoLightUrl(null);
        setPreviewLight(null);
      }
      if (theme === 'dark') {
        setLogoDarkUrl(null);
        setPreviewDark(null);
      }
      // Forçar refetch do logo removendo cache
      fetch(`/api/logo?theme=${theme}&_=${Date.now()}`, { cache: 'reload' });
      window.dispatchEvent(new Event('logo-updated'));
      setShowDeleteModal(null);
      toast({ title: 'Logo removido com sucesso!' });
    } catch (err) {
      toast({ title: 'Erro ao remover logo', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">{t('admin.customize.title', 'Personalização do Sistema')}</h1>
      
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                <Settings className="h-5 w-5" />
                {t('admin.customize.settings', 'Configurações')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab("personalizar")}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3",
                    activeTab === "personalizar" && "bg-muted border-r-2 border-primary"
                  )}
                >
                  <Palette className="h-4 w-4" />
                  {t('admin.customize.customize_saas', 'Personalizar SaaS')}
                </button>
                <button
                  onClick={() => setActiveTab("mensagens")}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3",
                    activeTab === "mensagens" && "bg-muted border-r-2 border-primary"
                  )}
                >
                  <MessageSquare className="h-4 w-4" />
                  {t('admin.customize.welcome_messages', 'Mensagens de Boas Vindas')}
                </button>
                <button
                  onClick={() => setActiveTab("temas")}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3",
                    activeTab === "temas" && "bg-muted border-r-2 border-primary"
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                  {t('admin.customize.customize_colors', 'Personalizar Cores')}
                </button>
                <button
                  onClick={() => setActiveTab("idiomas")}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3",
                    activeTab === "idiomas" && "bg-muted border-r-2 border-primary"
                  )}
                >
                  <Globe className="h-4 w-4" />
                  {t('admin.customize.system_languages', 'Idiomas do Sistema')}
                </button>
                {false && (
                <button
                  onClick={() => setActiveTab("waha")}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3",
                    activeTab === "waha" && "bg-muted border-r-2 border-primary"
                  )}
                >
                  <Smartphone className="h-4 w-4" />
                  Integração WhatsApp
                </button>
                )}
                {false && (
                <button
                  onClick={() => setActiveTab("notificacoes")}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3",
                    activeTab === "notificacoes" && "bg-muted border-r-2 border-primary"
                  )}
                >
                  <Bell className="h-4 w-4" />
                  {t('admin.customize.notifications_realtime', 'Sistema de Notificações')}
                </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1">
          {activeTab === "personalizar" && (
            <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
              <CardHeader>
                <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{t('admin.customize.customize_saas', 'Personalizar SaaS')}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Seção de Configurações do Sistema */}
                <SystemConfigSection />

                <Separator className="my-8" />

                <div className="mb-6">
                  <h2 className="font-semibold mb-2">{t('admin.customize.system_logo', 'Logo do sistema')}</h2>
                  <p className="text-sm text-muted-foreground mb-4" dangerouslySetInnerHTML={{
                    __html: t('admin.customize.logo_description', 'Altere os logos exibidos no topo da página de login e no menu lateral. Tamanho recomendado: <b>230x60px</b> (PNG ou SVG).<br/>Você pode enviar uma versão para o modo claro e outra para o modo escuro.')
                  }}></p>
                  <div className="flex flex-col md:flex-row gap-6 items-center justify-center">
                    {/* Light logo */}
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs mb-1">{t('admin.customize.logo_light', 'Logo Light')}</span>
                      <SpinningBorder className="w-[230px] h-[60px]" borderSize={0} blurOffset={0} borderRadius={6}>
                        <div className="logo-inner bg-white">
                          {previewLight ? (
                            <img src={previewLight} alt="Preview logo light" />
                          ) : logoLightUrl ? (
                            <>
                              <img src={logoLightUrl} alt="Logo light atual" />
                              <button className="absolute top-1 right-1 text-red-500 hover:text-red-700" onClick={() => setShowDeleteModal('light')} title={t('admin.customize.buttons.remove_logo', 'Remover logo')}>
                                <Trash2 size={18} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem logo</span>
                          )}
                        </div>
                      </SpinningBorder>
                      <input
                        id="logo-light-input"
                        type="file"
                        accept="image/png,image/svg+xml"
                        className="hidden"
                        onChange={e => handleFileChange(e, 'light')}
                      />
                      <Button variant="outline" onClick={() => document.getElementById('logo-light-input')?.click()} disabled={isUploading}>
                        {t('admin.customize.select_logo_light', 'Selecionar Logo Light')}
                      </Button>
                    </div>
                    {/* Dark logo */}
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs mb-1">{t('admin.customize.logo_dark', 'Logo Dark')}</span>
                      <SpinningBorder className="w-[230px] h-[60px]" borderSize={0} blurOffset={0} borderRadius={6}>
                        <div className="logo-inner bg-zinc-900">
                          {previewDark ? (
                            <img src={previewDark} alt="Preview logo dark" />
                          ) : logoDarkUrl ? (
                            <>
                              <img src={logoDarkUrl} alt="Logo dark atual" />
                              <button className="absolute top-1 right-1 text-red-500 hover:text-red-700" onClick={() => setShowDeleteModal('dark')} title={t('admin.customize.buttons.remove_logo', 'Remover logo')}>
                                <Trash2 size={18} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem logo</span>
                          )}
                        </div>
                      </SpinningBorder>
                      <input
                        id="logo-dark-input"
                        type="file"
                        accept="image/png,image/svg+xml"
                        className="hidden"
                        onChange={e => handleFileChange(e, 'dark')}
                      />
                      <Button variant="outline" onClick={() => document.getElementById('logo-dark-input')?.click()} disabled={isUploading}>
                        {t('admin.customize.select_logo_dark', 'Selecionar Logo Dark')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 justify-center">
                    <Button onClick={handleUpload} disabled={(!previewLight && !previewDark) || isUploading}>
                      {isUploading ? t('admin.customize.saving', 'Salvando...') : t('admin.customize.save', 'Salvar')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "mensagens" && (
            <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
              <CardHeader>
                <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{t('admin.customize.welcome_messages', 'Mensagens de Boas Vindas')}</CardTitle>
                <CardDescription className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                  {t('admin.customize.welcome_messages_desc', 'Configure mensagens personalizadas para diferentes tipos de usuários.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingMessages ? (
                  <div className="space-y-8">
                    {/* Skeleton para Mensagem de Usuário Recém-Cadastrado */}
                    <div className="p-6 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div className="h-5 bg-green-300 dark:bg-green-700 rounded w-64 animate-pulse"></div>
                      </div>
                      <div className="h-4 bg-green-200 dark:bg-green-800 rounded w-full mb-4 animate-pulse"></div>
                      <div className="space-y-4">
                        <div>
                          <div className="h-4 bg-green-300 dark:bg-green-700 rounded w-32 mb-2 animate-pulse"></div>
                          <div className="h-10 bg-white dark:bg-gray-800 border border-green-300 rounded animate-pulse"></div>
                        </div>
                        <div>
                          <div className="h-4 bg-green-300 dark:bg-green-700 rounded w-40 mb-2 animate-pulse"></div>
                          <div className="h-32 bg-white dark:bg-gray-800 border border-green-300 rounded animate-pulse"></div>
                          <div className="h-3 bg-green-200 dark:bg-green-800 rounded w-56 mt-1 animate-pulse"></div>
                        </div>
                        <div>
                          <div className="h-4 bg-green-300 dark:bg-green-700 rounded w-36 mb-2 animate-pulse"></div>
                          <div className="h-20 bg-white dark:bg-gray-800 border border-green-300 rounded animate-pulse"></div>
                          <div className="h-3 bg-green-200 dark:bg-green-800 rounded w-48 mt-1 animate-pulse"></div>
                        </div>
                        <div className="h-10 bg-green-100 dark:bg-green-900 border border-green-300 rounded w-56 animate-pulse"></div>
                      </div>
                    </div>

                    {/* Skeleton para Mensagem de Usuário Não Ativo */}
                    <div className="p-6 border rounded-lg bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                        <div className="h-5 bg-orange-300 dark:bg-orange-700 rounded w-60 animate-pulse"></div>
                      </div>
                      <div className="h-4 bg-orange-200 dark:bg-orange-800 rounded w-full mb-4 animate-pulse"></div>
                      <div className="space-y-4">
                        <div>
                          <div className="h-4 bg-orange-300 dark:bg-orange-700 rounded w-32 mb-2 animate-pulse"></div>
                          <div className="h-10 bg-white dark:bg-gray-800 border border-orange-300 rounded animate-pulse"></div>
                        </div>
                        <div>
                          <div className="h-4 bg-orange-300 dark:bg-orange-700 rounded w-40 mb-2 animate-pulse"></div>
                          <div className="h-32 bg-white dark:bg-gray-800 border border-orange-300 rounded animate-pulse"></div>
                          <div className="h-3 bg-orange-200 dark:bg-orange-800 rounded w-56 mt-1 animate-pulse"></div>
                        </div>
                        <div>
                          <div className="h-4 bg-orange-300 dark:bg-orange-700 rounded w-32 mb-2 animate-pulse"></div>
                          <div className="h-10 bg-white dark:bg-gray-800 border border-orange-300 rounded animate-pulse"></div>
                          <div className="h-3 bg-orange-200 dark:bg-orange-800 rounded w-52 mt-1 animate-pulse"></div>
                        </div>
                        <div>
                          <div className="h-4 bg-orange-300 dark:bg-orange-700 rounded w-32 mb-2 animate-pulse"></div>
                          <div className="h-20 bg-white dark:bg-gray-800 border border-orange-300 rounded animate-pulse"></div>
                          <div className="h-3 bg-orange-200 dark:bg-orange-800 rounded w-64 mt-1 animate-pulse"></div>
                        </div>
                        <div className="h-10 bg-orange-100 dark:bg-orange-900 border border-orange-300 rounded w-48 animate-pulse"></div>
                      </div>
                    </div>

                    {/* Skeleton para Configurações Gerais */}
                    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                      <div className="h-5 bg-gray-300 dark:bg-gray-700 rounded w-40 mb-2 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full mb-4 animate-pulse"></div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-64 animate-pulse"></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-72 animate-pulse"></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gray-300 dark:bg-gray-700 rounded animate-pulse"></div>
                          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-56 animate-pulse"></div>
                        </div>
                        <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-48 mt-4 animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Mensagem para Usuário Recém-Cadastrado */}
                    <div className="p-6 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <h3 className="font-semibold text-green-800 dark:text-green-200">{t('admin.customize.new_user_welcome', 'Boas Vindas - Usuário Recém-Cadastrado')}</h3>
                      </div>
                      <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                        {t('admin.customize.new_user_desc', 'Mensagem exibida quando o usuário acabou de ser cadastrado, com orientações de boas vindas.')}
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2 text-green-800 dark:text-green-200">{t('admin.customize.message_title', 'Título da Mensagem')}</label>
                          <input 
                            type="text" 
                            placeholder={t('admin.customize.placeholders.welcome_title', 'Bem-vindo ao FinanceHub!')} 
                            className="w-full px-3 py-2 border border-green-300 rounded-md bg-white dark:bg-gray-800"
                            value={welcomeMessages.new_user?.title || ''}
                            onChange={(e) => setWelcomeMessages(prev => ({
                              ...prev,
                              new_user: { ...prev.new_user, title: e.target.value }
                            }))}
                          />
                        </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-green-800 dark:text-green-200">{t('admin.customize.message_content', 'Conteúdo da Mensagem')}</label>
                        <textarea 
                          placeholder="Olá {nome}! Seja bem-vindo ao FinanceHub. Estamos felizes em tê-lo conosco. Aqui você encontrará todas as ferramentas necessárias para gerenciar suas finanças de forma eficiente e organizada."
                          rows={6}
                          className="w-full px-3 py-2 border border-green-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.new_user?.message || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            new_user: { ...prev.new_user, message: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {t('admin.customize.use_name_placeholder', 'Use {nome} para incluir o nome do usuário')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-green-800 dark:text-green-200">{t('admin.customize.welcome_email', 'Email de Boas Vindas')}</label>
                        <textarea 
                          placeholder="Olá {nome}, seja bem-vindo ao FinanceHub! Sua conta foi criada com sucesso. Acesse nossa plataforma para começar a gerenciar suas finanças de forma inteligente."
                          rows={4}
                          className="w-full px-3 py-2 border border-green-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.new_user?.email_content || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            new_user: { ...prev.new_user, email_content: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {t('admin.customize.email_after_signup', 'Email enviado após o cadastro bem-sucedido')}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        className="border-green-300 text-green-700 hover:bg-green-100 dark:hover:bg-green-900"
                        onClick={() => saveWelcomeMessage('new_user', {
                          title: welcomeMessages.new_user?.title || '',
                          message: welcomeMessages.new_user?.message || '',
                          email_content: welcomeMessages.new_user?.email_content || '',
                          send_email_welcome: welcomeMessages.new_user?.send_email_welcome || true,
                          show_dashboard_message: welcomeMessages.new_user?.show_dashboard_message || true
                        })}
                        disabled={isSavingMessage}
                      >
                        {isSavingMessage ? t('admin.customize.saving', 'Salvando...') : t('admin.customize.save_welcome_message', 'Salvar Mensagem de Boas Vindas')}
                      </Button>
                    </div>
                  </div>

                  {/* Mensagem para Usuário Não Ativo */}
                  <div className="p-6 border rounded-lg bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <h3 className="font-semibold text-orange-800 dark:text-orange-200">{t('admin.customize.inactive_user_welcome', 'Boas Vindas - Usuário Não Ativo')}</h3>
                    </div>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                      {t('admin.customize.inactive_user_desc', 'Mensagem exibida para usuários que se cadastraram mas ainda não ativaram a conta através do pagamento.')}
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-orange-800 dark:text-orange-200">{t('admin.customize.message_title', 'Título da Mensagem')}</label>
                        <input 
                          type="text" 
                          placeholder={t('admin.customize.placeholders.activation_title', 'Ative sua conta para começar!')} 
                          className="w-full px-3 py-2 border border-orange-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.inactive_user?.title || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            inactive_user: { ...prev.inactive_user, title: e.target.value }
                          }))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-orange-800 dark:text-orange-200">{t('admin.customize.message_content', 'Conteúdo da Mensagem')}</label>
                        <textarea 
                          placeholder="Olá {nome}! Sua conta foi criada com sucesso, mas ainda não está ativa. Para acessar todos os recursos do FinanceHub, você precisa ativar sua assinatura. Clique no botão abaixo para efetuar o pagamento e começar a usar nossa plataforma."
                          rows={6}
                          className="w-full px-3 py-2 border border-orange-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.inactive_user?.message || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            inactive_user: { ...prev.inactive_user, message: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          Use {"{nome}"} para incluir o nome do usuário
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-orange-800 dark:text-orange-200">Link de Pagamento</label>
                        <input 
                          type="text" 
                          placeholder="https://financehub.com.br/pagamento" 
                          className="w-full px-3 py-2 border border-orange-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.inactive_user?.payment_link || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            inactive_user: { ...prev.inactive_user, payment_link: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          Link que será exibido no botão de ativação
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-orange-800 dark:text-orange-200">Email de Ativação</label>
                        <textarea 
                          placeholder="Olá {nome}, sua conta no FinanceHub foi criada com sucesso! Para começar a usar todos os recursos, você precisa ativar sua assinatura. Acesse o link abaixo para efetuar o pagamento: {link_pagamento}"
                          rows={4}
                          className="w-full px-3 py-2 border border-orange-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.inactive_user?.email_content || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            inactive_user: { ...prev.inactive_user, email_content: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                          {t('admin.customize.use_dynamic_placeholders', 'Use {nome} e {link_pagamento} para incluir informações dinâmicas')}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900"
                        onClick={() => saveWelcomeMessage('inactive_user', {
                          title: welcomeMessages.inactive_user?.title || '',
                          message: welcomeMessages.inactive_user?.message || '',
                          email_content: welcomeMessages.inactive_user?.email_content || '',
                          payment_link: welcomeMessages.inactive_user?.payment_link || '',
                          send_email_activation: welcomeMessages.inactive_user?.send_email_activation || true,
                          show_dashboard_message: welcomeMessages.inactive_user?.show_dashboard_message || true
                        })}
                        disabled={isSavingMessage}
                      >
                        {isSavingMessage ? t('admin.customize.saving', 'Salvando...') : t('admin.customize.save_activation_message', 'Salvar Mensagem de Ativação')}
                      </Button>
                    </div>
                  </div>

                  {/* Mensagem de Ativação por Super Admin */}
                  <div className="p-6 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <h3 className="font-semibold text-blue-800 dark:text-blue-200">Ativação de Conta - Por Super Admin</h3>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                      Mensagem enviada quando um Super Admin ativa manualmente a conta de um usuário inativo.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">{t('admin.customize.message_title', 'Título da Mensagem')}</label>
                        <input 
                          type="text" 
                          placeholder={t('admin.customize.placeholders.activated_title', 'Sua conta foi ativada!')} 
                          className="w-full px-3 py-2 border border-blue-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.activated?.title || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            activated: { ...prev.activated, title: e.target.value }
                          }))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">{t('admin.customize.message_content', 'Conteúdo da Mensagem')}</label>
                        <textarea 
                          placeholder="Olá {nome}! Temos uma ótima notícia: sua conta no FinanceHub foi ativada com sucesso! Agora você tem acesso completo a todos os recursos da plataforma."
                          rows={6}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.activated?.message || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            activated: { ...prev.activated, message: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Use {"{nome}"} para incluir o nome do usuário
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">Conteúdo do Email</label>
                        <textarea 
                          placeholder="Olá {nome}!\n\nSua conta no FinanceHub foi ativada com sucesso!\n\nAgora você tem acesso completo a todos os nossos recursos."
                          rows={4}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md bg-white dark:bg-gray-800"
                          value={welcomeMessages.activated?.email_content || ''}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            activated: { ...prev.activated, email_content: e.target.value }
                          }))}
                        />
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Conteúdo enviado via webhook quando o usuário é ativado
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900"
                        onClick={() => saveWelcomeMessage('activated', {
                          title: welcomeMessages.activated?.title || '',
                          message: welcomeMessages.activated?.message || '',
                          email_content: welcomeMessages.activated?.email_content || '',
                          send_email_activation: true,
                          show_dashboard_message: true
                        })}
                        disabled={isSavingMessage}
                      >
                        {isSavingMessage ? t('admin.customize.saving', 'Salvando...') : t('admin.customize.save_activation_message', 'Salvar Mensagem de Ativação')}
                      </Button>
                    </div>
                  </div>

                  {/* Configurações Gerais */}
                  <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-medium mb-2">{t('admin.customize.general_settings', 'Configurações Gerais')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('admin.customize.general_settings_desc', 'Configurações adicionais para as mensagens de boas vindas.')}
                    </p>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="enviar-email-boas-vindas" 
                          className="rounded"
                          checked={welcomeMessages.new_user?.send_email_welcome || false}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            new_user: { ...prev.new_user, send_email_welcome: e.target.checked }
                          }))}
                        />
                        <label htmlFor="enviar-email-boas-vindas" className="text-sm">
                          Enviar email de boas vindas automaticamente
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="enviar-email-ativacao" 
                          className="rounded"
                          checked={welcomeMessages.inactive_user?.send_email_activation || false}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            inactive_user: { ...prev.inactive_user, send_email_activation: e.target.checked }
                          }))}
                        />
                        <label htmlFor="enviar-email-ativacao" className="text-sm">
                          Enviar email de ativação para usuários não ativos
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="exibir-mensagem-dashboard" 
                          className="rounded"
                          checked={welcomeMessages.new_user?.show_dashboard_message || false}
                          onChange={(e) => setWelcomeMessages(prev => ({
                            ...prev,
                            new_user: { ...prev.new_user, show_dashboard_message: e.target.checked }
                          }))}
                        />
                        <label htmlFor="exibir-mensagem-dashboard" className="text-sm">
                          Exibir mensagem de boas vindas no dashboard
                        </label>
                      </div>
                      <Button 
                        onClick={() => {
                          saveWelcomeMessage('new_user', welcomeMessages.new_user || {});
                          saveWelcomeMessage('inactive_user', welcomeMessages.inactive_user || {});
                          saveWelcomeMessage('activated', welcomeMessages.activated || {});
                        }}
                        disabled={isSavingMessage}
                        className="mt-4"
                      >
                        {isSavingMessage ? t('admin.customize.saving', 'Salvando...') : t('admin.customize.save_all_messages', 'Salvar Todas as Mensagens')}
                      </Button>
                    </div>
                  </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "temas" && (
            <div>
              <ThemeCustomizer />
            </div>
          )}

          {activeTab === "idiomas" && (
            <LanguageManagementSection />
          )}

          {false && activeTab === "waha" && (
            <Card className={`glass-card neon-border ${theme === 'light' ? 'bg-white border border-gray-200' : ''}`}>
              <CardHeader>
                <CardTitle className={`${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>Integração WhatsApp (WAHA)</CardTitle>
                <CardDescription className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                  Configure a integração com o WAHA para envio de mensagens via WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingWaha ? (
                  <div className="space-y-6">
                    {/* Skeleton para configuração WAHA */}
                    <div className="space-y-4">
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
                      <div className="h-10 bg-white dark:bg-gray-800 border rounded animate-pulse"></div>
                    </div>
                    <div className="space-y-4">
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
                      <div className="h-10 bg-white dark:bg-gray-800 border rounded animate-pulse"></div>
                    </div>
                    <div className="space-y-4">
                      <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-28 animate-pulse"></div>
                      <div className="h-10 bg-white dark:bg-gray-800 border rounded animate-pulse"></div>
                    </div>
                    <div className="flex gap-3">
                      <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-24 animate-pulse"></div>
                      <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-32 animate-pulse"></div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-2">URL do WAHA *</label>
                        <input
                          type="url"
                          placeholder="https://whatsapp-waha-whatsapp.ie5w7f.easypanel.host"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                          value={wahaConfig.waha_url || ''}
                          onChange={(e) => setWahaConfig(prev => ({ ...prev, waha_url: e.target.value }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">URL base da instância WAHA</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">API Key</label>
                        <input
                          type="password"
                          placeholder={t('admin.customize.placeholders.auth_password', 'Deixe vazio se não usar autenticação')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                          value={wahaConfig.api_key || ''}
                          onChange={(e) => setWahaConfig(prev => ({ ...prev, api_key: e.target.value }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">Chave de API para autenticação (opcional)</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Nome da Sessão</label>
                        <input
                          type="text"
                          placeholder="financehub"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                          value={wahaConfig.session_name || ''}
                          onChange={(e) => setWahaConfig(prev => ({ ...prev, session_name: e.target.value }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">Nome da sessão WhatsApp no WAHA</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Webhook URL (Gerada Automaticamente)
                          <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">
                            {t('admin.customize.labels.webhook_hash', 'Hash')}: {wahaConfig.webhook_hash || t('admin.customize.labels.generating', 'Gerando...')}
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                            value={wahaConfig.webhook_url || t('admin.customize.labels.auto_generated', 'Será gerado automaticamente')}
                            readOnly
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (wahaConfig.webhook_url) {
                                navigator.clipboard.writeText(wahaConfig.webhook_url)
                                toast({ title: 'URL copiada!', description: 'URL do webhook copiada para a área de transferência' })
                              }
                            }}
                            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                            disabled={!wahaConfig.webhook_url}
                          >
                            Copiar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Regenerar hash do webhook? Isso criará uma nova URL e invalidará a atual.')) {
                                setWahaConfig(prev => ({ ...prev, regenerate_webhook_hash: true }))
                                saveWahaConfig()
                              }
                            }}
                            className="px-3 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm"
                            title="Regenerar hash de segurança"
                          >
                            🔄
                          </button>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 space-y-1">
                          <p>• URL única e segura gerada automaticamente para esta sessão</p>
                          <p>• Configure esta URL no WAHA para receber eventos em tempo real</p>
                          <p>• Hash de 5 caracteres: {wahaConfig.webhook_hash || 'será gerado'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="waha-enabled"
                        className="rounded"
                        checked={wahaConfig.enabled || false}
                        onChange={(e) => setWahaConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                      />
                      <label htmlFor="waha-enabled" className="text-sm">
                        Habilitar integração WAHA
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <Button 
                        onClick={saveWahaConfig}
                        disabled={isSavingWaha || !wahaConfig.waha_url}
                      >
                        {isSavingWaha ? t('admin.customize.saving', 'Salvando...') : t('admin.customize.buttons.save_config', 'Salvar Configuração')}
                      </Button>
                      
                      <Button 
                        variant="outline"
                        onClick={testWahaConnection}
                        disabled={isTestingWaha || !wahaConfig.waha_url}
                      >
                        {isTestingWaha ? t('admin.customize.buttons.testing', 'Testando...') : t('admin.customize.buttons.test_connection', 'Testar Conexão')}
                      </Button>
                      
                      <Button 
                        variant="outline"
                        onClick={testQRCodeEndpoints}
                        disabled={isTestingWaha || !wahaConfig.waha_url}
                      >
                        Testar Endpoints QR
                      </Button>
                    </div>

                    {/* Status da conexão melhorado */}
                    <div className={cn(
                      "p-4 border rounded-lg transition-all duration-300",
                      connectionStatus?.connected 
                        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                        : connectionStatus?.error
                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                    )}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-base flex items-center gap-2">
                          {connectionStatus?.connected ? (
                            <>
                              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                              <span className="text-green-800 dark:text-green-200">API Conectada</span>
                            </>
                          ) : connectionStatus?.error ? (
                            <>
                              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                              <span className="text-red-800 dark:text-red-200">Desconectado</span>
                            </>
                          ) : (
                            <>
                              <WifiOff className="w-5 h-5 text-gray-500" />
                              <span className="text-gray-700 dark:text-gray-300">Status da Integração</span>
                            </>
                          )}
                        </h3>
                        {isTestingWaha && (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        )}
                      </div>
                      
                      {connectionStatus?.connected ? (
                        <div className="space-y-3">
                          {/* Status da API */}
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">
                              API WAHA respondendo corretamente
                            </span>
                          </div>
                          
                          {/* Informações da sessão se disponível */}
                          {connectionStatus.phoneNumber && (
                            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Sessão Principal Detectada:</p>
                              
                              {/* Número do WhatsApp */}
                              {connectionStatus.phoneNumber && (
                                <div className="flex items-center gap-2 mb-1">
                                  <Phone className="w-4 h-4 text-gray-500" />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {formatPhoneNumber(connectionStatus.phoneNumber)}
                                  </span>
                                </div>
                              )}
                              
                              {/* Nome do perfil */}
                              {connectionStatus.pushName && (
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-gray-500" />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {connectionStatus.pushName}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                            URL e API Key estão configurados corretamente
                          </p>
                        </div>
                      ) : connectionStatus?.error ? (
                        <div className="space-y-2">
                          <p className="text-sm text-red-700 dark:text-red-300">
                            {connectionStatus.error}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Verifique se a URL, API Key e nome da sessão estão corretos.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-3 h-3 rounded-full animate-pulse",
                              wahaConfig.enabled ? 'bg-green-500' : 'bg-gray-400'
                            )}></div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {t('admin.customize.labels.integration', 'Integração')}: {wahaConfig.enabled ? t('admin.customize.status.enabled', 'Habilitada') : t('admin.customize.status.disabled', 'Desabilitada')}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            Clique em "Testar Conexão" para verificar o status do WhatsApp
                          </p>
                        </div>
                      )}
                      
                      {/* Última atualização */}
                      {wahaConfig.updated_at && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            <strong>Última atualização:</strong> {new Date(wahaConfig.updated_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Listagem de Sessões WhatsApp */}
                    {wahaConfig?.waha_url && wahaConfig?.api_key && (
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Sessões WhatsApp
                          </h3>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowCreateSessionModal(true)}
                            >
                              <Plus className="w-4 h-4" />
                              <span className="ml-2">Nova Sessão</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => loadWahaSessions(false, true)}
                              disabled={isRefreshingSessions}
                            >
                              {isRefreshingSessions ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                              <span className="ml-2">{isRefreshingSessions ? "Atualizando..." : "Atualizar"}</span>
                            </Button>
                          </div>
                        </div>

                        {isLoadingSessions && !isRefreshingSessions ? (
                          <div className="space-y-3">
                            {[1, 2].map(i => (
                              <div key={i} className="p-4 border rounded-lg animate-pulse">
                                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-48 mb-2"></div>
                                <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-32"></div>
                              </div>
                            ))}
                          </div>
                        ) : wahaSessions.length > 0 ? (
                          <div className="space-y-3">
                            {wahaSessions.map((session) => {
                              const isExpanded = expandedSessions.has(session.name);
                              const hasWebhooks = session.config?.webhooks && session.config.webhooks.length > 0;
                              
                              return (
                                <div
                                  key={session.name}
                                  className={cn(
                                    "border rounded-lg transition-all duration-200",
                                    session.status === 'WORKING' || session.status === 'CONNECTED'
                                      ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20"
                                      : "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20"
                                  )}
                                >
                                  {/* Header da Sessão */}
                                  <button
                                    onClick={() => toggleSessionExpansion(session.name)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                  >
                                    <div className="flex items-center gap-3">
                                      {isExpanded ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                      )}
                                      <div className="flex items-center gap-2">
                                        <div className={cn(
                                          "w-3 h-3 rounded-full",
                                          session.status === 'WORKING' || session.status === 'CONNECTED' ? "bg-green-500" : "bg-orange-500"
                                        )} />
                                        <span className="font-medium">{session.name}</span>
                                        {isRefreshingSessions && (
                                          <Loader2 className="w-4 h-4 animate-spin text-gray-500 ml-2" />
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                      <div className="flex items-center gap-3">
                                        <button 
                                          onClick={() => {
                                            console.log('Abrindo chat com configurações:', {
                                              sessionName: session.name,
                                              wahaUrl: wahaConfig.waha_url,
                                              apiKey: wahaConfig.api_key ? 'definida' : 'não definida'
                                            })
                                            setShowChatModal(session.name)
                                          }}
                                          className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors"
                                          title="Abrir chat"
                                        >
                                          <MessageCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        </button>
                                        {hasWebhooks && (
                                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                            <Link2 className="w-4 h-4" />
                                            <span>{session.config.webhooks.length} webhook(s)</span>
                                          </div>
                                        )}
                                      </div>
                                      <span className={cn(
                                        "px-2 py-1 rounded text-xs font-medium",
                                        session.status === 'WORKING' || session.status === 'CONNECTED'
                                          ? "bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200"
                                          : "bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200"
                                      )}>
                                        {session.status === 'WORKING' ? t('admin.customize.status.working', 'CONECTADO') : session.status}
                                      </span>
                                    </div>
                                  </button>

                                  {/* Conteúdo Expandido */}
                                  {isExpanded && (
                                    <div className="px-4 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                                      {/* Ações da Sessão */}
                                      <div className="flex flex-wrap gap-2 pt-2">
                                        {session.status === 'STOPPED' || session.status === 'FAILED' ? (
                                          <Button
                                            size="sm"
                                            onClick={() => startSession(session.name)}
                                            className="flex items-center gap-2"
                                          >
                                            <Play className="w-4 h-4" />
                                            Iniciar
                                          </Button>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => stopSession(session.name)}
                                            className="flex items-center gap-2"
                                          >
                                            <Square className="w-4 h-4" />
                                            Parar
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            const currentWebhooks = session.config?.webhooks || [];
                                            setEditingWebhooks(
                                              currentWebhooks.length > 0 
                                                ? [...currentWebhooks] 
                                                : [{ url: '', events: ['message'] }]
                                            );
                                            setShowEditSessionModal(session.name);
                                          }}
                                          className="flex items-center gap-2"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                          Editar Webhooks
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          onClick={() => deleteSession(session.name)}
                                          className="flex items-center gap-2"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                          Deletar
                                        </Button>
                                      </div>

                                      {/* Seção de Pareamento (quando não conectado) */}
                                      {!session.me && (
                                        <div className="mt-4 p-4 border-2 border-dashed border-orange-300 dark:border-orange-600 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                                          <div className="flex items-center gap-2 mb-3">
                                            <Smartphone className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                            <h4 className="font-medium text-orange-800 dark:text-orange-200">
                                              WhatsApp não conectado
                                            </h4>
                                          </div>
                                          <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                                            Esta sessão precisa ser conectada a um número do WhatsApp. Escolha uma das opções abaixo:
                                          </p>
                                          
                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => startSessionAndGetQR(session.name)}
                                              className="flex items-center gap-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900"
                                            >
                                              <QrCode className="w-4 h-4" />
                                              Conectar por QR Code
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => setShowPairingCodeModal(session.name)}
                                              className="flex items-center gap-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900"
                                            >
                                              <Key className="w-4 h-4" />
                                              Conectar por Código
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Informações do WhatsApp */}
                                      {session.me && (
                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                                            <Phone className="w-6 h-6 text-green-600 dark:text-green-400" />
                                            <div>
                                              <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                                              <p className="font-medium">
                                                {formatPhoneNumber(session.me.id?.replace('@c.us', '').replace('@s.whatsapp.net', '') || '')}
                                              </p>
                                            </div>
                                          </div>
                                          {session.me.pushName && (
                                            <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                                              <User className="w-6 h-6 text-green-600 dark:text-green-400" />
                                              <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Nome</p>
                                                <p className="font-medium">{session.me.pushName}</p>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Webhooks Configurados */}
                                      {hasWebhooks && (
                                        <div className="space-y-2">
                                          <h4 className="font-medium text-sm flex items-center gap-2">
                                            <Link2 className="w-4 h-4" />
                                            Webhooks Configurados
                                          </h4>
                                          {session.config.webhooks.map((webhook: any, idx: number) => (
                                            <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded-lg space-y-2">
                                              <div className="flex items-start justify-between">
                                                <div className="flex-grow">
                                                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">URL</p>
                                                  <p className="text-sm font-mono break-all">{webhook.url}</p>
                                                </div>
                                              </div>
                                              {webhook.events && webhook.events.length > 0 && (
                                                <div>
                                                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Eventos</p>
                                                  <div className="flex flex-wrap gap-1">
                                                    {webhook.events.map((event: string) => (
                                                      <span key={event} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded">
                                                        {event}
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                              {webhook.retries && (
                                                <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                                                  <span>Tentativas: {webhook.retries.attempts}</span>
                                                  <span>Delay: {webhook.retries.delaySeconds}s</span>
                                                  <span>Política: {webhook.retries.policy}</span>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Status do Engine */}
                                      {session.engine && (
                                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Detalhes da Conexão</p>
                                          <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                              <span className="text-gray-600 dark:text-gray-400">Engine:</span>
                                              <span className="ml-2 font-medium">{session.engine.engine}</span>
                                            </div>
                                            <div>
                                              <span className="text-gray-600 dark:text-gray-400">Estado:</span>
                                              <span className="ml-2 font-medium">{session.engine.state}</span>
                                            </div>
                                            {session.engine.WWebVersion && (
                                              <div className="col-span-2">
                                                <span className="text-gray-600 dark:text-gray-400">Versão:</span>
                                                <span className="ml-2 font-mono text-xs">{session.engine.WWebVersion}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-8 text-center border rounded-lg bg-gray-50 dark:bg-gray-900">
                            <Smartphone className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                            <p className="text-gray-600 dark:text-gray-400 mb-2">Nenhuma sessão encontrada</p>
                            <p className="text-sm text-gray-500 dark:text-gray-500">
                              Configure a integração e clique em "Testar Conexão" para verificar as sessões
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Informações sobre WAHA */}
                    <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                      <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Sobre o WAHA</h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                        WAHA (WhatsApp HTTP API) é uma solução para integrar WhatsApp Web com aplicações através de API REST.
                      </p>
                      <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                        <li>• Envio de mensagens de texto, imagens e documentos</li>
                        <li>• Recebimento de mensagens via webhook</li>
                        <li>• Gerenciamento de sessões WhatsApp</li>
                        <li>• Suporte a múltiplas sessões simultâneas</li>
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {false && activeTab === "notificacoes" && (
            <NotificationTestingCard />
          )}
        </div>
      </div>

      {/* Modal para criar nova sessão */}
      <Dialog open={showCreateSessionModal} onOpenChange={setShowCreateSessionModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar Nova Sessão WhatsApp</DialogTitle>
            <DialogDescription>
              Crie uma nova sessão WAHA para conectar um número do WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nome da Sessão *</label>
              <input
                type="text"
                placeholder={t('admin.customize.placeholders.session_name', 'Ex: atendimento-1, vendas, suporte')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                value={newSessionData.sessionName}
                onChange={(e) => setNewSessionData(prev => ({ ...prev, sessionName: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Utilize apenas letras, números e hífens. Ex: vendas-1</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Webhook (Opcional)</label>
              <input
                type="url"
                placeholder="https://meusite.com/webhook/whatsapp"
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                value={newSessionData.webhooks[0]?.url || ''}
                onChange={(e) => setNewSessionData(prev => ({
                  ...prev,
                  webhooks: [{ ...prev.webhooks[0], url: e.target.value }]
                }))}
              />
              <p className="text-xs text-gray-500 mt-1">URL para receber notificações de mensagens (opcional)</p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateSessionModal(false)}
              disabled={isCreatingSession}
            >
              Cancelar
            </Button>
            <Button 
              onClick={createNewSession}
              disabled={isCreatingSession || !newSessionData.sessionName.trim()}
            >
              {isCreatingSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Criando...
                </>
              ) : (
                t('admin.customize.buttons.create_session', 'Criar Sessão')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para editar webhooks da sessão */}
      <Dialog open={!!showEditSessionModal} onOpenChange={(open) => { if (!open) setShowEditSessionModal(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Webhooks - {showEditSessionModal}</DialogTitle>
            <DialogDescription>
              Configure os webhooks para receber notificações desta sessão.
            </DialogDescription>
          </DialogHeader>
          {showEditSessionModal && (
            <div className="space-y-4 py-4">
              {/* Webhook Principal da Sessão */}
              <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Webhook Principal da Sessão</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      URL única e segura para esta sessão receber eventos do WAHA
                    </p>
                  </div>
                  {sessionWebhook?.enabled && (
                    <div className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded-full">
                      Ativo
                    </div>
                  )}
                </div>
                
                {isLoadingSessionWebhook ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando webhook da sessão...
                  </div>
                ) : sessionWebhook ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Hash de Segurança
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">
                          {sessionWebhook.webhook_hash}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyWebhookUrl(sessionWebhook.webhook_hash)}
                          className="h-8"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        URL do Webhook
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sessionWebhook.webhook_url}
                          readOnly
                          className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border rounded-md font-mono"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyWebhookUrl(sessionWebhook.webhook_url)}
                          className="h-10"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => regenerateSessionWebhook(showEditSessionModal)}
                          disabled={isRegeneratingWebhook}
                          className="h-10"
                        >
                          {isRegeneratingWebhook ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <p>• Use esta URL no WAHA para enviar eventos diretamente para esta sessão</p>
                      <p>• O hash de segurança garante que apenas eventos desta sessão sejam aceitos</p>
                      <p>• Regenerar o webhook criará uma nova URL (a anterior ficará inválida)</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    Erro ao carregar webhook da sessão
                  </div>
                )}
              </div>
              
              {/* Divisor */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Webhooks Customizados (Opcional)</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Configure webhooks adicionais se necessário
                </p>
              </div>
              
              <div className="space-y-3">
                {editingWebhooks.map((webhook: any, index: number) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium">Webhook {index + 1}</label>
                      {editingWebhooks.length > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const newWebhooks = editingWebhooks.filter((_, i) => i !== index);
                            setEditingWebhooks(newWebhooks);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <input
                      type="url"
                      placeholder="https://meusite.com/webhook/whatsapp"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                      value={webhook.url || ''}
                      onChange={(e) => {
                        const newWebhooks = [...editingWebhooks];
                        newWebhooks[index] = { ...webhook, url: e.target.value };
                        setEditingWebhooks(newWebhooks);
                      }}
                    />
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Eventos</label>
                      <div className="flex flex-wrap gap-2">
                        {['message', 'session.status', 'message.any'].map(event => (
                          <label key={event} className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={webhook.events?.includes(event) || false}
                              onChange={(e) => {
                                const newWebhooks = [...editingWebhooks];
                                let events = webhook.events || ['message'];
                                if (e.target.checked) {
                                  events = [...events, event];
                                } else {
                                  events = events.filter(ev => ev !== event);
                                }
                                newWebhooks[index] = { ...webhook, events };
                                setEditingWebhooks(newWebhooks);
                              }}
                            />
                            {event}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button
                variant="outline"
                onClick={() => {
                  setEditingWebhooks([...editingWebhooks, { url: '', events: ['message'] }]);
                }}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Webhook
              </Button>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setShowEditSessionModal(null)}
                  disabled={isUpdatingSession}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => updateSession(showEditSessionModal, editingWebhooks.filter(w => w.url.trim()))}
                  disabled={isUpdatingSession}
                >
                  {isUpdatingSession ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Salvando...
                    </>
                  ) : (
                    t('admin.customize.buttons.save_webhooks', 'Salvar Webhooks')
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação de exclusão de logo */}
      <Dialog open={!!showDeleteModal} onOpenChange={open => { if (!open) setShowDeleteModal(null); }}>
        <DialogContent className="max-w-md glass-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" />
              Excluir Logo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Atenção:</strong> Esta ação irá remover <b>definitivamente</b> o logo customizado do sistema. Não será possível recuperar!
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm"><strong>Logo:</strong> {showDeleteModal === 'light' ? 'Light' : 'Dark'}</p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Tem certeza que deseja excluir este logo permanentemente?</p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowDeleteModal(null)} disabled={isDeleting}>Cancelar</Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (showDeleteModal) await handleDeleteLogo(showDeleteModal);
              }}
              disabled={isDeleting}
            >
              Excluir Permanentemente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para exibir QR Code */}
      <Dialog open={!!showQRModal} onOpenChange={() => {
        setShowQRModal(null);
        setQrCodeData(null);
        setIsGeneratingQR(false);
        setIsAutoRefreshing(false);
        setAutoRefreshCountdown(5);
        setIsSessionConnected(false);
        setConnectedSessionInfo(null);
      }}>
        <DialogContent className="w-[400px] max-h-[80vh] flex flex-col p-0 border border-gray-200 dark:border-gray-700 shadow-lg bg-white dark:bg-gray-900">
          {/* Header simples */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-center text-gray-900 dark:text-white">
              Conectar WhatsApp - {showQRModal}
            </h2>
          </div>
          
          {/* Conteúdo principal com altura fixa */}
          <div className="flex-1 px-6 py-6">
            {/* Área fixa para QR Code - altura constante */}
            <div className="h-80 flex flex-col items-center justify-center">
              {isSessionConnected ? (
                // Mostrar status de conectado
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">
                      WhatsApp Conectado!
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Sessão {showQRModal} conectada com sucesso
                    </p>
                    {connectedSessionInfo?.me && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center justify-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-700 dark:text-gray-300">
                            {formatPhoneNumber(connectedSessionInfo.me.id?.replace('@c.us', '').replace('@s.whatsapp.net', '') || '')}
                          </span>
                        </div>
                        {connectedSessionInfo.me.pushName && (
                          <div className="flex items-center justify-center gap-2 text-sm mt-1">
                            <User className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-700 dark:text-gray-300">
                              {connectedSessionInfo.me.pushName}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Fechando automaticamente...
                    </p>
                  </div>
                </div>
              ) : isGeneratingQR || isRefreshingQR ? (
                <div className="flex flex-col items-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isRefreshingQR ? t('admin.customize.buttons.update_qr', 'Atualizando QR Code...') : t('admin.customize.buttons.generate_qr', 'Gerando QR Code...')}
                  </span>
                  <p className="text-xs text-gray-500 text-center">
                    {isRefreshingQR ? "Buscando novo código" : "Iniciando sessão e preparando conexão"}
                  </p>
                </div>
              ) : qrCodeData ? (
                <div className="flex flex-col items-center space-y-4">
                  {/* Container fixo para QR Code - evita resize */}
                  <div className="w-60 h-60 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    {qrCodeData?.qr ? (
                      <div className="p-2 bg-white rounded-lg border border-gray-200">
                        <img src={qrCodeData.qr} alt="QR Code" className="w-56 h-56" />
                      </div>
                    ) : qrCodeData?.code ? (
                      <div className="p-2 bg-white rounded-lg border border-gray-200">
                        <div className="w-56 h-56 flex items-center justify-center text-sm break-all font-mono bg-gray-50 rounded">
                          {qrCodeData.code}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-2">
                        <div className="w-12 h-12 mx-auto bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">QR Code não disponível</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Status simples */}
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg w-full">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        Aguardando escaneamento
                      </span>
                    </div>
                    
                    {isAutoRefreshing && (
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        Auto-refresh em {autoRefreshCountdown}s
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500 mt-1">
                      Verificando status da conexão...
                    </div>
                  </div>
                  
                  {/* Instruções simples */}
                  <div className="text-center space-y-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Como conectar:
                    </p>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>1. WhatsApp → Menu → Aparelhos conectados</p>
                      <p>2. Conectar um aparelho → Escanear QR</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Preparando...</span>
                  <p className="text-xs text-gray-500">Aguarde um momento</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Footer simples */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              {!isSessionConnected && qrCodeData && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    if (showQRModal) {
                      setIsRefreshingQR(true);
                      setIsAutoRefreshing(false);
                      setAutoRefreshCountdown(10);
                      await getQRCode(showQRModal);
                      setIsRefreshingQR(false);
                    }
                  }}
                  disabled={isRefreshingQR || isGeneratingQR}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={cn("w-4 h-4", isRefreshingQR && "animate-spin")} />
                  {isRefreshingQR ? "Atualizando..." : "Atualizar"}
                </Button>
              )}
              {isSessionConnected && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Conectado com sucesso</span>
                </div>
              )}
              <Button 
                variant={isSessionConnected ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowQRModal(null);
                  setQrCodeData(null);
                  setIsGeneratingQR(false);
                  setIsAutoRefreshing(false);
                  setAutoRefreshCountdown(5);
                  setIsSessionConnected(false);
                  setConnectedSessionInfo(null);
                }}
              >
                {isSessionConnected ? t('admin.customize.buttons.finish', 'Concluir') : t('admin.customize.buttons.close', 'Fechar')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para pareamento por código */}
      <Dialog open={!!showPairingCodeModal} onOpenChange={() => {
        setShowPairingCodeModal(null);
        setPairingPhoneNumber('');
        setPairingCode('');
        setPairingCodeSent(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pareamento por Código - {showPairingCodeModal}</DialogTitle>
            <DialogDescription>
              {!pairingCodeSent ? 
                "Digite seu número de WhatsApp para receber um código de pareamento." :
                "Digite o código de pareamento recebido no seu WhatsApp."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!pairingCodeSent ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Número do WhatsApp</label>
                  <input
                    type="tel"
                    placeholder={t('admin.customize.placeholders.phone_number', 'Ex: 5541999887766')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800"
                    value={pairingPhoneNumber}
                    onChange={(e) => setPairingPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    maxLength={15}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Digite apenas números com código do país (55 para Brasil)
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 text-sm mb-2">
                    Como funciona:
                  </h4>
                  <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <li>1. Digite seu número completo com código do país</li>
                    <li>2. Clique em "Enviar Código"</li>
                    <li>3. Você receberá um código no seu WhatsApp</li>
                    <li>4. Digite o código recebido para completar o pareamento</li>
                  </ol>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Código de Pareamento</label>
                  <input
                    type="text"
                    placeholder={t('admin.customize.placeholders.pairing_code', 'Digite o código recebido')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 text-center font-mono text-lg"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value.replace(/\s/g, ''))}
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Digite o código que você recebeu no WhatsApp
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    📱 Código enviado para: <strong>{pairingPhoneNumber}</strong>
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Verifique suas mensagens no WhatsApp
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPairingCodeModal(null);
                setPairingPhoneNumber('');
                setPairingCode('');
                setPairingCodeSent(false);
              }}
            >
              Cancelar
            </Button>
            {!pairingCodeSent ? (
              <Button 
                onClick={() => showPairingCodeModal && sendPairingCode(showPairingCodeModal, pairingPhoneNumber)}
                disabled={!pairingPhoneNumber || pairingPhoneNumber.length < 10}
              >
                Enviar Código
              </Button>
            ) : (
              <Button 
                onClick={() => showPairingCodeModal && confirmPairingCode(showPairingCodeModal, pairingCode)}
                disabled={!pairingCode || pairingCode.length < 4}
              >
                Confirmar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
.logo-inner {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 8px;
  overflow: hidden;
  text-align: center;
}
.logo-inner img {
  display: block !important;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  margin: 0 auto !important;
  width: auto;
  height: auto;
}
`}</style>

      {/* Modal do Chat WhatsApp */}
      {showChatModal && (
        <WhatsAppChatModal
          isOpen={!!showChatModal}
          onClose={() => setShowChatModal(null)}
          sessionName={showChatModal}
          wahaUrl={wahaConfig.waha_url}
          apiKey={wahaConfig.api_key}
        />
      )}
    </div>
  );
}