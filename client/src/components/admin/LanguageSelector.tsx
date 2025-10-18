import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalization, useTranslation } from '../../contexts/LocalizationContext';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { Globe, ChevronDown, RefreshCw } from 'lucide-react';

interface LanguageSelectorProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  variant = 'default',
  className = '' 
}) => {
  const { t } = useTranslation();
  const { locale, availableLocales, invalidateCache, changeLocale } = useLocalization();
  const queryClient = useQueryClient();

  // Verificar se o usuário é super admin
  const { data: userProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const response = await fetch('/api/auth/profile');
      if (!response.ok) {
        throw new Error('Falha ao buscar perfil do usuário');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Só mostrar para super admin
  if (!userProfile?.isSuperAdmin || availableLocales.length === 0) {
    return null;
  }

  const currentLocale = availableLocales.find(l => l.localeCode === locale);

  const handleLanguageChange = async (localeCode: string) => {
    if (localeCode === locale) {
      return; // Não fazer nada se for o mesmo idioma
    }
    
    try {
      console.log('Locale selecionado:', localeCode);
      // Trocar idioma instantaneamente
      await changeLocale(localeCode);
      
      // Invalidar caches do React Query para forçar refetch de dados
      queryClient.invalidateQueries({ queryKey: ['defaultLocale'] });
      queryClient.invalidateQueries({ queryKey: ['availableLocales'] });
      
      console.log('✅ Idioma alterado com sucesso para:', localeCode);
    } catch (error) {
      console.error('❌ Erro ao alterar idioma:', error);
      // Em caso de erro, usar método antigo como fallback
      invalidateCache();
    }
  };

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Globe className="h-4 w-4 text-muted-foreground" />
        <Badge variant="outline" className="text-xs">
          {currentLocale?.localeCode || locale}
        </Badge>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className={`flex items-center gap-2 ${className}`}
          size="sm"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            {currentLocale?.localeName || locale}
          </span>
          <Badge variant="secondary" className="hidden md:inline-flex">
            {currentLocale?.localeCode || locale}
          </Badge>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">
            {t('language.selector.title', 'Idioma do Sistema')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('language.selector.subtitle', 'Idiomas disponíveis')}
          </p>
        </div>
        <div className="border-t my-1" />
        {availableLocales.map((lang) => (
          <DropdownMenuItem
            key={lang.localeCode}
            onClick={() => handleLanguageChange(lang.localeCode)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span>{lang.localeName}</span>
              {lang.isDefault && (
                <Badge variant="default" className="text-xs">
                  {t('language.default', 'Padrão')}
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {lang.localeCode}
            </Badge>
          </DropdownMenuItem>
        ))}
        <div className="border-t my-1" />
        <DropdownMenuItem
          onClick={() => invalidateCache()}
          className="text-blue-600"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('language.selector.refresh', 'Atualizar Idioma')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.location.href = '/admin/language-settings'}
          className="text-primary"
        >
          <Globe className="h-4 w-4 mr-2" />
          {t('language.selector.manage', 'Gerenciar Idiomas')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};