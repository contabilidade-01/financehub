import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * Tipos de configurações do sistema
 */
export interface SystemConfig {
  system_name: string;
  system_name_short: string;
  system_tagline: string;
  support_email: string;
  system_url: string;
  system_description: string;
}

/**
 * Resposta da API de configurações
 */
interface SystemSettingsResponse {
  success: boolean;
  data: {
    [key: string]: {
      value: string;
      metadata: any;
    };
  };
}

/**
 * Valores padrão (fallback se API falhar)
 */
const DEFAULT_CONFIG: SystemConfig = {
  system_name: 'FinanceHub',
  system_name_short: 'financehub',
  system_tagline: 'Gestão financeira inteligente e moderna',
  support_email: 'suporte@financehub.com',
  system_url: 'https://financehub.com',
  system_description: 'FinanceHub - Gerencie suas finanças pessoais com uma interface moderna e futurista. Acompanhe receitas, despesas e tenha controle total do seu dinheiro.'
};

/**
 * Context do sistema
 */
interface SystemConfigContextValue {
  config: SystemConfig;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const SystemConfigContext = createContext<SystemConfigContextValue | undefined>(undefined);

/**
 * Provider do SystemConfig
 */
export function SystemConfigProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useQuery<SystemSettingsResponse>({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const response = await fetch('/api/system/settings');

      if (!response.ok) {
        throw new Error('Erro ao carregar configurações do sistema');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos (antes era cacheTime)
    retry: 2,
    refetchOnWindowFocus: false
  });

  // Transforma os dados da API em um objeto de configuração simples
  const config: SystemConfig = React.useMemo(() => {
    if (!data?.success || !data?.data) {
      return DEFAULT_CONFIG;
    }

    try {
      return {
        system_name: data.data.system_name?.value || DEFAULT_CONFIG.system_name,
        system_name_short: data.data.system_name_short?.value || DEFAULT_CONFIG.system_name_short,
        system_tagline: data.data.system_tagline?.value || DEFAULT_CONFIG.system_tagline,
        support_email: data.data.support_email?.value || DEFAULT_CONFIG.support_email,
        system_url: data.data.system_url?.value || DEFAULT_CONFIG.system_url,
        system_description: data.data.system_description?.value || DEFAULT_CONFIG.system_description
      };
    } catch (err) {
      console.error('[SystemConfig] Erro ao processar configurações:', err);
      return DEFAULT_CONFIG;
    }
  }, [data]);

  const value: SystemConfigContextValue = {
    config,
    isLoading,
    error: error as Error | null,
    refetch
  };

  return (
    <SystemConfigContext.Provider value={value}>
      {children}
    </SystemConfigContext.Provider>
  );
}

/**
 * Hook para acessar configurações do sistema
 *
 * @example
 * const { config, isLoading } = useSystemConfig();
 * return <h1>{config.system_name}</h1>;
 */
export function useSystemConfig() {
  const context = useContext(SystemConfigContext);

  if (context === undefined) {
    throw new Error('useSystemConfig must be used within a SystemConfigProvider');
  }

  return context;
}

/**
 * Hook simplificado que retorna apenas a configuração (sem loading/error)
 * Útil quando você só precisa dos valores e não se importa com o estado de carregamento
 *
 * @example
 * const systemName = useSystemConfigValue('system_name');
 * return <h1>{systemName}</h1>;
 */
export function useSystemConfigValue<K extends keyof SystemConfig>(key: K): SystemConfig[K] {
  const { config } = useSystemConfig();
  return config[key];
}

/**
 * Hook que retorna toda a configuração como objeto
 * Útil para componentes que precisam de múltiplos valores
 *
 * @example
 * const config = useSystemConfigValues();
 * return (
 *   <>
 *     <h1>{config.system_name}</h1>
 *     <p>{config.system_tagline}</p>
 *   </>
 * );
 */
export function useSystemConfigValues(): SystemConfig {
  const { config } = useSystemConfig();
  return config;
}
