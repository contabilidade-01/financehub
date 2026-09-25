import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { themeManager, isLegacyDefaultTheme } from '@/utils/theme-manager';

// Normaliza dados de tema vindos do banco (colunas em minúsculas / JSON em string).
const normalizeThemeData = (theme: any) => {
  const normalizedTheme = {
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

  if (typeof normalizedTheme.lightConfig === 'string') {
    try {
      normalizedTheme.lightConfig = JSON.parse(normalizedTheme.lightConfig);
    } catch (error) {
      console.error('Erro ao fazer parse de lightConfig:', error);
    }
  }

  if (typeof normalizedTheme.darkConfig === 'string') {
    try {
      normalizedTheme.darkConfig = JSON.parse(normalizedTheme.darkConfig);
    } catch (error) {
      console.error('Erro ao fazer parse de darkConfig:', error);
    }
  }

  return normalizedTheme;
};

/** Modo salvo pelo usuário; o padrão do sistema é o tema claro. */
function getStoredMode(): 'light' | 'dark' {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

async function loadAndApply(mode: 'light' | 'dark'): Promise<void> {
  try {
    const response = await fetch(`/api/themes/active/${mode}`, { credentials: 'include' });
    if (response.ok) {
      const result = await response.json();
      const activeTheme = normalizeThemeData(result.data);
      if (isLegacyDefaultTheme(activeTheme)) {
        themeManager.resetToDefault(mode);
      } else {
        themeManager.applyTheme(activeTheme, mode, false);
      }
      return;
    }
  } catch {
    // sem rede / não autenticado: cai no padrão
  }
  themeManager.resetToDefault(mode);
}

export function useAutoTheme() {
  const { theme: currentMode } = useTheme();
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);
  const [themeLoadError, setThemeLoadError] = useState<string | null>(null);

  // Aplica as cores padrão imediatamente (antes do fetch) para evitar flash.
  useEffect(() => {
    themeManager.applyCriticalTheme(getStoredMode());
  }, []);

  // Carrega o tema ativo configurado pelo admin sempre que o modo muda.
  useEffect(() => {
    const mode: 'light' | 'dark' =
      currentMode === 'dark' || currentMode === 'light' ? currentMode : getStoredMode();
    let cancelled = false;
    setThemeLoadError(null);
    loadAndApply(mode)
      .catch((error) => {
        if (!cancelled) setThemeLoadError(`Erro ao carregar tema ativo para ${mode}: ${error}`);
      })
      .finally(() => {
        if (!cancelled) setIsThemeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentMode]);

  return {
    currentMode: currentMode as 'light' | 'dark' | 'system',
    isThemeLoaded,
    themeLoadError
  };
}
