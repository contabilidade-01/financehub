import { ReactNode, useEffect } from 'react';
import { useAutoTheme } from '@/hooks/use-auto-theme';

interface AutoThemeProviderProps {
  children: ReactNode;
  /** Mantido por compatibilidade; os tokens padrão já vêm do CSS, então não bloqueamos a renderização. */
  showLoadingIndicator?: boolean;
}

/**
 * Aplica o tema ativo configurado pelo admin (admin/customize) por cima dos
 * tokens padrão de index.css. Não bloqueia a primeira renderização.
 */
export function AutoThemeProvider({ children }: AutoThemeProviderProps) {
  const { themeLoadError, currentMode } = useAutoTheme();

  // Cor da barra do navegador / status bar (PWA) acompanha o tema.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', currentMode === 'dark' ? '#0b1220' : '#ffffff');
  }, [currentMode]);

  if (themeLoadError) {
    console.error('Erro no carregamento do tema:', themeLoadError);
  }

  return <>{children}</>;
}
