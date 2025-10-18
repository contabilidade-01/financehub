import { ReactNode, useEffect, useState } from 'react';
import { useAutoTheme } from '@/hooks/use-auto-theme';

interface AutoThemeProviderProps {
  children: ReactNode;
  showLoadingIndicator?: boolean;
}

export function AutoThemeProvider({ children, showLoadingIndicator = false }: AutoThemeProviderProps) {
  // Este hook detecta mudanças de tema e aplica automaticamente o tema ativo
  const { isThemeLoaded, themeLoadError } = useAutoTheme();
  const [isInitialRender, setIsInitialRender] = useState(true);
  
  // Função para obter texto localizado sem depender do Context
  const getLocalizedLoadingText = () => {
    const cachedLocale = localStorage.getItem('financehub_locale');
    if (cachedLocale) {
      switch (cachedLocale) {
        case 'es-es':
          return 'Finalizando carga del tema...';
        case 'en-us':
          return 'Finalizing theme loading...';
        default:
          return 'Finalizando carregamento do tema...';
      }
    }
    
    const defaultLocale = sessionStorage.getItem('default_locale');
    if (defaultLocale) {
      switch (defaultLocale) {
        case 'es-es':
          return 'Finalizando carga del tema...';
        case 'en-us':
          return 'Finalizing theme loading...';
        default:
          return 'Finalizando carregamento do tema...';
      }
    }
    
    return 'Finalizando carregamento do tema...';
  };
  
  // Aguardar pelo menos 100ms para garantir que o tema seja aplicado
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialRender(false);
      
      // Remover loading crítico quando React estiver pronto
      if (typeof window !== 'undefined' && window.removeCriticalLoading) {
        window.removeCriticalLoading();
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Remover loading crítico quando tema for carregado
  useEffect(() => {
    if (isThemeLoaded && typeof window !== 'undefined' && window.removeCriticalLoading) {
      setTimeout(() => {
        window.removeCriticalLoading();
      }, 50);
    }
  }, [isThemeLoaded]);
  
  // O script crítico já está mostrando loading, então vamos apenas aguardar sem UI duplicada
  // Só mostrar loading se especificamente solicitado E não há loading crítico
  const criticalLoadingExists = typeof document !== 'undefined' && document.getElementById('critical-theme-loading');
  const shouldShowLoading = showLoadingIndicator && !isThemeLoaded && !themeLoadError && !criticalLoadingExists;
  
  console.log('🎨 AutoThemeProvider State:', {
    isInitialRender,
    isThemeLoaded,
    themeLoadError,
    shouldShowLoading,
    showLoadingIndicator,
    criticalLoadingExists: !!criticalLoadingExists
  });
  
  if (shouldShowLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-foreground mb-2">FinanceHub</h2>
          <p className="text-sm text-muted-foreground">{getLocalizedLoadingText()}</p>
        </div>
      </div>
    );
  }
  
  // Se houve erro, ainda mostrar as children mas logar o erro
  if (themeLoadError) {
    console.error('❌ Erro no carregamento do tema:', themeLoadError);
  }
  
  return <>{children}</>;
}