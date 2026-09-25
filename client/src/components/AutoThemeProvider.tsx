import { ReactNode } from 'react';
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
  const { themeLoadError } = useAutoTheme();

  if (themeLoadError) {
    console.error('Erro no carregamento do tema:', themeLoadError);
  }

  return <>{children}</>;
}
