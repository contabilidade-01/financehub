import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ColorPicker } from '@/components/ui/color-picker';
import { ThemePreview, defaultLightTheme, defaultDarkTheme } from '@/components/ui/theme-preview';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useThemeManager, CustomTheme, ThemeConfig } from '@/utils/theme-manager';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/contexts/LocalizationContext';
import { 
  Palette, 
  Save, 
  RotateCcw, 
  Download, 
  Upload, 
  Sparkles, 
  Sun, 
  Moon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Trash2,
  Edit
} from 'lucide-react';

export function ThemeCustomizer() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { theme: currentMode } = useTheme();
  const themeManager = useThemeManager();
  
  // Estados principais com fallback
  const [lightTheme, setLightTheme] = useState<ThemeConfig>(defaultLightTheme || {
    background: '#FAFAFA',
    foreground: '#0F0F0F',
    primary: '#FF64B3',
    primaryForeground: '#FAFAFA',
    secondary: '#00D9A7',
    secondaryForeground: '#171717',
    muted: '#F5F5F5',
    mutedForeground: '#737373',
    accent: '#F5F5F5',
    accentForeground: '#262626',
    border: '#E5E5E5',
    card: '#FFFFFF',
    cardForeground: '#0F0F0F',
    destructive: '#EF4444',
    destructiveForeground: '#FAFAFA',
  });
  const [darkTheme, setDarkTheme] = useState<ThemeConfig>(defaultDarkTheme || {
    background: '#0F0F0F',
    foreground: '#FAFAFA',
    primary: '#FF64B3',
    primaryForeground: '#FAFAFA',
    secondary: '#00D9A7',
    secondaryForeground: '#171717',
    muted: '#262626',
    mutedForeground: '#A3A3A3',
    accent: '#262626',
    accentForeground: '#FAFAFA',
    border: '#262626',
    card: '#0F0F0F',
    cardForeground: '#FAFAFA',
    destructive: '#7F1D1D',
    destructiveForeground: '#FAFAFA',
  });
  const [activeMode, setActiveMode] = useState<'light' | 'dark'>(() => {
    // Inicializar com o modo atual do usuário ou light como fallback
    return (currentMode && currentMode !== 'system') ? currentMode as 'light' | 'dark' : 'light';
  });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [themeName, setThemeName] = useState('');
  const [savedThemes, setSavedThemes] = useState<CustomTheme[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null);
  
  // Estados de modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');

  // Função para normalizar dados de tema vindos do banco
  const normalizeThemeData = (theme: any): CustomTheme => {
    const normalizedTheme: CustomTheme = {
      id: theme.id,
      name: theme.name,
      lightConfig: theme.lightConfig || theme.lightconfig,
      darkConfig: theme.darkConfig || theme.darkconfig,
      isDefault: theme.isDefault || theme.isdefault,
      isActiveLight: theme.isActiveLight || theme.isactivelight,
      isActiveDark: theme.isActiveDark || theme.isactivedark,
      createdAt: theme.createdAt || theme.createdat,
      updatedAt: theme.updatedAt || theme.updatedat
    };

    // Parse strings JSON se necessário
    if (typeof normalizedTheme.lightConfig === 'string') {
      try {
        normalizedTheme.lightConfig = JSON.parse(normalizedTheme.lightConfig);
      } catch (error) {
        console.error('Erro ao fazer parse de lightConfig:', error);
        normalizedTheme.lightConfig = defaultLightTheme;
      }
    }

    if (typeof normalizedTheme.darkConfig === 'string') {
      try {
        normalizedTheme.darkConfig = JSON.parse(normalizedTheme.darkConfig);
      } catch (error) {
        console.error('Erro ao fazer parse de darkConfig:', error);
        normalizedTheme.darkConfig = defaultDarkTheme;
      }
    }

    return normalizedTheme;
  };

  // Auto-selecionar aba baseada no modo atual do usuário
  useEffect(() => {
    if (currentMode && currentMode !== 'system') {
      console.log(`🎨 Auto-selecionando aba ${currentMode} baseado no modo atual do usuário`);
      setActiveMode(currentMode as 'light' | 'dark');
    }
  }, [currentMode]);

  // Carregar temas salvos ao montar
  useEffect(() => {
    loadSavedThemes();
    loadActiveThemes(); // Carregar ambos os temas ativos
  }, []);

  // Carregar tema ativo quando mudar de modo (apenas aplicar, não recarregar configs)
  useEffect(() => {
    loadActiveThemeForCurrentMode();
  }, [activeMode]);

  // Aplicar tema inicial
  useEffect(() => {
    if (lightTheme && darkTheme) {
      const themeConfig: CustomTheme = {
        name: 'Tema Inicial',
        lightConfig: lightTheme,
        darkConfig: darkTheme
      };
      themeManager.applyTheme(themeConfig, activeMode, false);
    }
  }, [lightTheme, darkTheme]); // Quando os temas estiverem carregados

  const loadSavedThemes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/themes', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        setSavedThemes(result.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar temas:', error);
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.load_themes_error', 'Falha ao carregar temas salvos'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar temas ativos para ambos os modos
  const loadActiveThemes = async () => {
    try {
      console.log('🔄 Carregando temas ativos para ambos os modos...');
      
      // Carregar tema ativo para light mode
      const lightResponse = await fetch('/api/themes/active/light', {
        credentials: 'include'
      });
      
      // Carregar tema ativo para dark mode
      const darkResponse = await fetch('/api/themes/active/dark', {
        credentials: 'include'
      });
      
      let lightThemeData = null;
      let darkThemeData = null;
      
      // Processar light theme
      if (lightResponse.ok) {
        lightThemeData = await lightResponse.json();
        if (lightThemeData.data) {
          const normalizedLightTheme = normalizeThemeData(lightThemeData.data);
          if (normalizedLightTheme.lightConfig) {
            console.log('🌞 Tema ativo para light mode:', normalizedLightTheme.name);
            setLightTheme(normalizedLightTheme.lightConfig);
          }
        }
      } else {
        console.log('🌞 Nenhum tema ativo para light mode, usando padrão');
      }
      
      // Processar dark theme
      if (darkResponse.ok) {
        darkThemeData = await darkResponse.json();
        if (darkThemeData.data) {
          const normalizedDarkTheme = normalizeThemeData(darkThemeData.data);
          if (normalizedDarkTheme.darkConfig) {
            console.log('🌙 Tema ativo para dark mode:', normalizedDarkTheme.name);
            setDarkTheme(normalizedDarkTheme.darkConfig);
          }
        }
      } else {
        console.log('🌙 Nenhum tema ativo para dark mode, usando padrão');
      }
      
      // Aplicar o tema do modo atual
      const currentModeTheme = activeMode === 'light' ? lightThemeData : darkThemeData;
        
      if (currentModeTheme?.data) {
        const normalizedCurrentTheme = normalizeThemeData(currentModeTheme.data);
        if (normalizedCurrentTheme.lightConfig && normalizedCurrentTheme.darkConfig) {
          console.log(`🎨 Aplicando tema ativo para ${activeMode}:`, normalizedCurrentTheme.name);
          themeManager.applyTheme(normalizedCurrentTheme, activeMode);
        } else {
          console.log(`⚠️ Tema para ${activeMode} não tem configurações válidas, usando fallback`);
        }
      }
      
    } catch (error) {
      console.error('Erro ao carregar temas ativos:', error);
    }
  };

  // Carregar tema ativo para o modo atual (usado quando troca de modo)
  const loadActiveThemeForCurrentMode = async () => {
    try {
      const mode = activeMode;
      const response = await fetch(`/api/themes/active/${mode}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        const activeTheme = result.data;
        
        console.log(`🎨 Aplicando tema ativo para ${mode}:`, activeTheme.name);
        themeManager.applyTheme(activeTheme, mode);
      }
    } catch (error) {
      console.error(`Erro ao carregar tema ativo para ${mode}:`, error);
    }
  };

  // Aplicar preview do tema
  const applyPreview = () => {
    const themeConfig: CustomTheme = {
      name: 'Preview',
      lightConfig: lightTheme,
      darkConfig: darkTheme
    };
    
    themeManager.applyTheme(themeConfig, activeMode, true);
    setIsPreviewMode(true);
  };

  // Auto-aplicar tema quando trocar de modo
  React.useEffect(() => {
    if (!isPreviewMode && lightTheme && darkTheme) {
      const themeConfig: CustomTheme = {
        name: 'Tema Atual',
        lightConfig: lightTheme,
        darkConfig: darkTheme
      };
      themeManager.applyTheme(themeConfig, activeMode, false);
    }
  }, [activeMode, lightTheme, darkTheme, isPreviewMode]);

  // Cancelar preview
  const cancelPreview = () => {
    themeManager.cancelPreview();
    setIsPreviewMode(false);
  };

  // Resetar para tema padrão
  const resetToDefault = () => {
    setLightTheme(defaultLightTheme);
    setDarkTheme(defaultDarkTheme);
    cancelPreview();
    toast({
      title: t('admin.customize.toast.theme_reset', 'Tema resetado'),
      description: t('admin.customize.toast.theme_reset_desc', 'Configurações restauradas para o padrão')
    });
  };

  // Salvar tema
  const saveTheme = async () => {
    if (!themeName.trim()) {
      toast({
        title: t('admin.customize.toast.name_required', 'Nome obrigatório'),
        description: t('admin.customize.toast.name_required_desc', 'Digite um nome para o tema'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsSaving(true);
      const themeData: CustomTheme = {
        name: themeName,
        lightConfig: lightTheme,
        darkConfig: darkTheme
      };

      const response = await fetch('/api/themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(themeData)
      });

      if (response.ok) {
        const result = await response.json();
        
        // Aplicar o tema salvo automaticamente
        const savedTheme: CustomTheme = {
          id: result.data.id,
          name: result.data.name,
          lightConfig: result.data.lightConfig,
          darkConfig: result.data.darkConfig,
          isDefault: result.data.isDefault
        };
        
        // Aplicar no modo atual
        themeManager.applyTheme(savedTheme, activeMode);
        
        toast({
          title: t('admin.customize.toast.theme_saved_applied', 'Tema salvo e aplicado'),
          description: `${t('admin.customize.theme_name', 'Tema')} "${themeName}" ${t('admin.customize.toast.theme_saved_applied_desc', 'salvo e aplicado com sucesso')}`
        });
        setShowSaveModal(false);
        setThemeName('');
        loadSavedThemes();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao salvar tema');
      }
    } catch (error) {
      console.error('Erro ao salvar tema:', error);
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.save_theme_error', 'Falha ao salvar tema'),
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Aplicar tema salvo
  const applyTheme = async (theme: CustomTheme) => {
    try {
      // Normalizar tema antes de aplicar (tratar dados do banco)
      const normalizedTheme = normalizeThemeData(theme);
      
      setLightTheme(normalizedTheme.lightConfig);
      setDarkTheme(normalizedTheme.darkConfig);
      themeManager.applyTheme(normalizedTheme, activeMode);
      toast({
        title: t('admin.customize.toast.theme_applied', 'Tema aplicado'),
        description: `${t('admin.customize.theme_name', 'Tema')} "${normalizedTheme.name}" ${t('admin.customize.toast.theme_applied_desc', 'aplicado com sucesso')}`
      });
    } catch (error) {
      console.error('Erro ao aplicar tema:', error);
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.apply_theme_error', 'Falha ao aplicar tema'),
        variant: 'destructive'
      });
    }
  };

  // Editar tema salvo
  const editTheme = (theme: CustomTheme) => {
    const normalizedTheme = normalizeThemeData(theme);
    setEditingTheme(normalizedTheme);
    setLightTheme(normalizedTheme.lightConfig);
    setDarkTheme(normalizedTheme.darkConfig);
    setThemeName(normalizedTheme.name);
    toast({
      title: t('admin.customize.toast.editing_theme', 'Editando tema'),
      description: `${t('admin.customize.toast.editing_theme_desc', 'Carregando')} "${normalizedTheme.name}" ${t('admin.customize.toast.editing_theme_desc', 'para edição')}`
    });
  };

  // Salvar alterações do tema editado
  const saveEditedTheme = async () => {
    if (!editingTheme || !themeName.trim()) {
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.theme_name_required', 'Nome do tema é obrigatório'),
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsSaving(true);
      const themeData: CustomTheme = {
        id: editingTheme.id,
        name: themeName,
        lightConfig: lightTheme,
        darkConfig: darkTheme
      };

      const response = await fetch(`/api/themes/${editingTheme.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(themeData)
      });

      if (response.ok) {
        toast({
          title: t('admin.customize.toast.theme_updated', 'Tema atualizado'),
          description: `${t('admin.customize.theme_name', 'Tema')} "${themeName}" ${t('admin.customize.toast.theme_updated_desc', 'atualizado com sucesso')}`
        });
        setEditingTheme(null);
        setThemeName('');
        loadSavedThemes();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar tema');
      }
    } catch (error) {
      console.error('Erro ao atualizar tema:', error);
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.update_theme_error', 'Falha ao atualizar tema'),
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cancelar edição
  const cancelEdit = () => {
    setEditingTheme(null);
    setThemeName('');
    // Recarregar temas ativos
    loadActiveThemes();
  };

  // Ativar tema para modo específico
  const activateThemeForMode = async (themeId: number, mode: 'light' | 'dark') => {
    try {
      const response = await fetch(`/api/themes/${themeId}/activate-${mode}`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        toast({
          title: t('admin.customize.toast.theme_activated', 'Tema ativado'),
          description: `${t('admin.customize.toast.theme_activated_desc', 'Tema ativado para')} ${mode === 'light' ? t('admin.customize.toast.light_mode_text', 'modo claro') : t('admin.customize.toast.dark_mode_text', 'modo escuro')}`
        });
        loadSavedThemes(); // Recarregar para atualizar os estados
        loadActiveThemeForCurrentMode(); // Aplicar automaticamente
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao ativar tema');
      }
    } catch (error) {
      console.error('Erro ao ativar tema para modo:', error);
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.activate_theme_error', 'Falha ao ativar tema para o modo'),
        variant: 'destructive'
      });
    }
  };

  // Exportar tema
  const exportTheme = () => {
    const themeData: CustomTheme = {
      name: themeName || 'Tema Customizado',
      lightConfig: lightTheme,
      darkConfig: darkTheme
    };
    
    const exportData = themeManager.exportTheme(themeData);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-${themeName || 'custom'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importar tema
  const importTheme = () => {
    try {
      const theme = themeManager.importTheme(importData);
      if (theme) {
        setLightTheme(theme.lightConfig);
        setDarkTheme(theme.darkConfig);
        setThemeName(theme.name);
        setShowImportModal(false);
        setImportData('');
        toast({
          title: t('admin.customize.toast.theme_imported', 'Tema importado'),
          description: `${t('admin.customize.theme_name', 'Tema')} "${theme.name}" ${t('admin.customize.toast.theme_imported_desc', 'importado com sucesso')}`
        });
      } else {
        throw new Error(t('admin.customize.toast.invalid_theme_format', 'Formato de tema inválido'));
      }
    } catch (error) {
      toast({
        title: t('admin.customize.toast.error', 'Erro'),
        description: t('admin.customize.toast.invalid_theme_file', 'Arquivo de tema inválido'),
        variant: 'destructive'
      });
    }
  };

  // Atualizar cor específica
  const updateColor = (colorKey: keyof ThemeConfig, value: string) => {
    if (activeMode === 'light') {
      setLightTheme(prev => ({ ...prev, [colorKey]: value }));
    } else {
      setDarkTheme(prev => ({ ...prev, [colorKey]: value }));
    }
  };

  const currentTheme = activeMode === 'light' ? lightTheme : darkTheme;

  // Verificação de segurança
  if (!currentTheme) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-muted-foreground">{t('admin.customize.loading_theme_config', 'Carregando configuração de temas...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="w-6 h-6 text-primary" />
            {t('admin.customize.theme_customization', 'Personalização de Temas')}
          </h2>
          <p className="text-muted-foreground">
            {t('admin.customize.theme_customization_desc', 'Customize as cores do sistema para modo claro e escuro')}
          </p>
          
          {/* Indicador de Temas Ativos */}
          <div className="flex items-center gap-3 mt-3">
            <span className="text-sm font-medium text-muted-foreground">{t('admin.customize.active_themes', 'Temas Ativos')}:</span>
            {(() => {
              const activeLight = savedThemes.find(t => t.isActiveLight);
              const activeDark = savedThemes.find(t => t.isActiveDark);
              
              return (
                <div className="flex items-center gap-2">
                  {activeLight ? (
                    <Badge variant="outline" className="bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300">
                      <Sun className="w-3 h-3 mr-1" />
                      {t('admin.customize.light_colors', 'Light')}: {activeLight.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      <Sun className="w-3 h-3 mr-1" />
                      {t('admin.customize.light_colors', 'Light')}: {t('admin.customize.default_theme', 'Padrão')}
                    </Badge>
                  )}
                  
                  {activeDark ? (
                    <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
                      <Moon className="w-3 h-3 mr-1" />
                      {t('admin.customize.dark_colors', 'Dark')}: {activeDark.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      <Moon className="w-3 h-3 mr-1" />
                      {t('admin.customize.dark_colors', 'Dark')}: {t('admin.customize.default_theme', 'Padrão')}
                    </Badge>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isPreviewMode && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {t('admin.customize.preview_active', 'Preview Ativo')}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={isPreviewMode ? cancelPreview : applyPreview}
          >
            {isPreviewMode ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                {t('admin.customize.cancel_preview', 'Cancelar Preview')}
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                {t('admin.customize.preview', 'Visualizar')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel de Configuração */}
        <div className="space-y-6">
          {/* Seletor de Modo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {t('admin.customize.edit_mode', 'Modo de Edição')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as 'light' | 'dark')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="light" className="flex items-center gap-2">
                    <Sun className="w-4 h-4" />
                    {t('admin.customize.light_mode', 'Light Mode')}
                  </TabsTrigger>
                  <TabsTrigger value="dark" className="flex items-center gap-2">
                    <Moon className="w-4 h-4" />
                    {t('admin.customize.dark_mode', 'Dark Mode')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          {/* Editor de Cores */}
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.customize.theme_colors', 'Cores do Tema')} ({activeMode === 'light' ? t('admin.customize.light_colors', 'Claro') : t('admin.customize.dark_colors', 'Escuro')})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {/* Cores Principais */}
                <div>
                  <h4 className="font-medium mb-3">{t('admin.customize.main_colors', 'Cores Principais')}</h4>
                  <div className="space-y-3">
                    <ColorPicker
                      label={t('admin.customize.primary_color', 'Cor Primária')}
                      value={currentTheme.primary}
                      onChange={(value) => updateColor('primary', value)}
                    />
                    <ColorPicker
                      label={t('admin.customize.secondary_color', 'Cor Secundária')}
                      value={currentTheme.secondary}
                      onChange={(value) => updateColor('secondary', value)}
                    />
                    <ColorPicker
                      label={t('admin.customize.accent_color', 'Cor de Destaque')}
                      value={currentTheme.accent}
                      onChange={(value) => updateColor('accent', value)}
                    />
                  </div>
                </div>

                {/* Background e Textos */}
                <div>
                  <h4 className="font-medium mb-3">{t('admin.customize.background_texts', 'Background e Textos')}</h4>
                  <div className="space-y-3">
                    <ColorPicker
                      label={t('admin.customize.main_background', 'Fundo Principal')}
                      value={currentTheme.background}
                      onChange={(value) => updateColor('background', value)}
                    />
                    <ColorPicker
                      label={t('admin.customize.main_text', 'Texto Principal')}
                      value={currentTheme.foreground}
                      onChange={(value) => updateColor('foreground', value)}
                      showContrast={true}
                      contrastBackground={currentTheme.background}
                    />
                    <ColorPicker
                      label={t('admin.customize.card_background', 'Fundo do Card')}
                      value={currentTheme.card}
                      onChange={(value) => updateColor('card', value)}
                    />
                  </div>
                </div>

                {/* Cores Auxiliares */}
                <div>
                  <h4 className="font-medium mb-3">{t('admin.customize.auxiliary_colors', 'Cores Auxiliares')}</h4>
                  <div className="space-y-3">
                    <ColorPicker
                      label={t('admin.customize.muted_color', 'Cor Silenciada')}
                      value={currentTheme.muted}
                      onChange={(value) => updateColor('muted', value)}
                    />
                    <ColorPicker
                      label={t('admin.customize.border_color', 'Bordas')}
                      value={currentTheme.border}
                      onChange={(value) => updateColor('border', value)}
                    />
                    <ColorPicker
                      label={t('admin.customize.destructive_color', 'Cor Destrutiva')}
                      value={currentTheme.destructive}
                      onChange={(value) => updateColor('destructive', value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ações */}
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.customize.actions', 'Ações')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShowSaveModal(true)} className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {editingTheme ? t('admin.customize.save_changes', 'Salvar Alterações') : t('admin.customize.save_theme', 'Salvar Tema')}
                </Button>
                {editingTheme && (
                  <Button variant="outline" onClick={cancelEdit} className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    {t('admin.customize.cancel_edit', 'Cancelar Edição')}
                  </Button>
                )}
                
                <Button variant="outline" onClick={resetToDefault} className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  {t('admin.customize.reset', 'Resetar')}
                </Button>
                
                <Button variant="outline" onClick={exportTheme} className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  {t('admin.customize.export', 'Exportar')}
                </Button>
                
                <Button variant="outline" onClick={() => setShowImportModal(true)} className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {t('admin.customize.import', 'Importar')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <ThemePreview
            theme={currentTheme}
            mode={activeMode}
            title={`${t('admin.customize.preview_mode_title', 'Preview - Modo')} ${activeMode === 'light' ? t('admin.customize.light_mode_preview', 'Claro') : t('admin.customize.dark_mode_preview', 'Escuro')}`}
          />

          {/* Temas Salvos */}
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.customize.saved_themes', 'Temas Salvos')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">{t('admin.customize.loading_themes', 'Carregando temas...')}</p>
                </div>
              ) : savedThemes.length > 0 ? (
                <div className="space-y-2">
                  {savedThemes.map((theme) => (
                    <div key={theme.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{theme.name}</h4>
                          {theme.isDefault && (
                            <Badge variant="secondary" className="text-xs">{t('admin.customize.default_theme', 'Padrão')}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {theme.isActiveLight && (
                            <Badge variant="outline" className="text-xs bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300">
                              <Sun className="w-3 h-3 mr-1" />
                              {t('admin.customize.light_active', 'Ativo Light')}
                            </Badge>
                          )}
                          {theme.isActiveDark && (
                            <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
                              <Moon className="w-3 h-3 mr-1" />
                              {t('admin.customize.dark_active', 'Ativo Dark')}
                            </Badge>
                          )}
                          {!theme.isActiveLight && !theme.isActiveDark && (
                            <span className="text-xs text-muted-foreground">{t('admin.customize.inactive', 'Inativo')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => editTheme(theme)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          {t('admin.customize.edit', 'Editar')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applyTheme(theme)}
                        >
                          {t('admin.customize.apply', 'Aplicar')}
                        </Button>
                        <Button
                          variant={theme.isActiveLight ? "default" : "outline"}
                          size="sm"
                          onClick={() => activateThemeForMode(theme.id!, 'light')}
                          className={theme.isActiveLight ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500' : 'hover:bg-yellow-50 hover:border-yellow-300'}
                          title={theme.isActiveLight ? t('admin.customize.active_for_light', 'Ativo para Light Mode') : t('admin.customize.activate_for_light', 'Ativar para Light Mode')}
                        >
                          <Sun className="w-3 h-3 mr-1" />
                          {theme.isActiveLight ? t('admin.customize.light_active', 'Light Ativo') : t('admin.customize.activate_light', 'Ativar Light')}
                        </Button>
                        <Button
                          variant={theme.isActiveDark ? "default" : "outline"}
                          size="sm"
                          onClick={() => activateThemeForMode(theme.id!, 'dark')}
                          className={theme.isActiveDark ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500' : 'hover:bg-blue-50 hover:border-blue-300'}
                          title={theme.isActiveDark ? t('admin.customize.active_for_dark', 'Ativo para Dark Mode') : t('admin.customize.activate_for_dark', 'Ativar para Dark Mode')}
                        >
                          <Moon className="w-3 h-3 mr-1" />
                          {theme.isActiveDark ? t('admin.customize.dark_active', 'Dark Ativo') : t('admin.customize.activate_dark', 'Ativar Dark')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  {t('admin.customize.no_saved_themes', 'Nenhum tema salvo ainda')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Salvar Tema */}
      <Dialog open={showSaveModal} onOpenChange={(open) => {
        setShowSaveModal(open);
        if (!open) {
          // Se fechar o modal e estava editando, cancelar edição
          if (editingTheme) {
            cancelEdit();
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTheme ? t('admin.customize.edit_theme', 'Editar Tema') : t('admin.customize.save_theme', 'Salvar Tema')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="theme-name">{t('admin.customize.theme_name', 'Nome do Tema')}</Label>
              <Input
                id="theme-name"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder={t('admin.customize.theme_name_placeholder', 'Ex: Tema Corporativo')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowSaveModal(false);
              if (editingTheme) {
                cancelEdit();
              }
            }}>
              {t('admin.customize.cancel', 'Cancelar')}
            </Button>
            <Button onClick={editingTheme ? saveEditedTheme : saveTheme} disabled={isSaving}>
              {isSaving ? t('admin.customize.saving', 'Salvando...') : (editingTheme ? t('admin.customize.update', 'Atualizar') : t('admin.customize.save', 'Salvar'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Importar Tema */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.customize.import_theme', 'Importar Tema')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="import-data">{t('admin.customize.theme_data_json', 'Dados do Tema (JSON)')}</Label>
              <textarea
                id="import-data"
                className="w-full h-32 p-3 border rounded-md resize-none font-mono text-sm"
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder={t('admin.customize.paste_theme_code', 'Cole aqui o código JSON do tema...')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              {t('admin.customize.cancel', 'Cancelar')}
            </Button>
            <Button onClick={importTheme} disabled={!importData.trim()}>
              {t('admin.customize.import', 'Importar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}