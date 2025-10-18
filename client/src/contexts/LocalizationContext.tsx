import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import LoadingScreen from '@/components/shared/LoadingScreen';

interface LocalizationContextType {
  locale: string;
  t: (key: string, fallback?: string) => string;
  isLoading: boolean;
  error: string | null;
  availableLocales: Array<{
    localeCode: string;
    localeName: string;
    isDefault: boolean;
  }>;
  invalidateCache: () => void;
  changeLocale: (newLocale: string) => Promise<void>;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

interface LocalizationProviderProps {
  children: ReactNode;
}

// Cache keys para localStorage
const CACHE_KEYS = {
  LOCALE: 'financehub_locale',
  TRANSLATIONS: 'financehub_translations',
  AVAILABLE_LOCALES: 'financehub_available_locales',
  CACHE_TIMESTAMP: 'financehub_cache_timestamp',
};

// Cache válido por 10 minutos
const CACHE_DURATION = 10 * 60 * 1000;

interface CachedData {
  locale: string;
  translations: Record<string, string>;
  availableLocales: Array<{ localeCode: string; localeName: string; isDefault: boolean }>;
  timestamp: number;
}

export const LocalizationProvider: React.FC<LocalizationProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingDefaultLocale, setIsLoadingDefaultLocale] = useState(true);
  const [locale, setLocale] = useState<string>('pt-br');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [availableLocales, setAvailableLocales] = useState<Array<{
    localeCode: string;
    localeName: string;
    isDefault: boolean;
  }>>([]);

  // Função para carregar do cache
  const loadFromCache = (): CachedData | null => {
    try {
      const cachedLocale = localStorage.getItem(CACHE_KEYS.LOCALE);
      const cachedTranslations = localStorage.getItem(CACHE_KEYS.TRANSLATIONS);
      const cachedAvailableLocales = localStorage.getItem(CACHE_KEYS.AVAILABLE_LOCALES);
      const cachedTimestamp = localStorage.getItem(CACHE_KEYS.CACHE_TIMESTAMP);

      if (cachedLocale && cachedTranslations && cachedTimestamp) {
        const timestamp = parseInt(cachedTimestamp);
        const now = Date.now();
        
        // Verificar se o cache ainda é válido
        if (now - timestamp < CACHE_DURATION) {
          return {
            locale: cachedLocale,
            translations: JSON.parse(cachedTranslations),
            availableLocales: cachedAvailableLocales ? JSON.parse(cachedAvailableLocales) : [],
            timestamp,
          };
        }
      }
    } catch (error) {
      console.warn('Erro ao carregar cache de localização:', error);
    }
    return null;
  };

  // Função para salvar no cache
  const saveToCache = (data: Omit<CachedData, 'timestamp'>) => {
    try {
      const timestamp = Date.now();
      localStorage.setItem(CACHE_KEYS.LOCALE, data.locale);
      localStorage.setItem(CACHE_KEYS.TRANSLATIONS, JSON.stringify(data.translations));
      localStorage.setItem(CACHE_KEYS.AVAILABLE_LOCALES, JSON.stringify(data.availableLocales));
      localStorage.setItem(CACHE_KEYS.CACHE_TIMESTAMP, timestamp.toString());
    } catch (error) {
      console.warn('Erro ao salvar cache de localização:', error);
    }
  };

  // Buscar idioma padrão do sistema
  const { data: defaultLocale } = useQuery({
    queryKey: ['defaultLocale'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/localization/default');
        if (!response.ok) {
          return { localeCode: 'pt-br', localeName: 'Português Brasil' };
        }
        return response.json();
      } catch (error) {
        return { localeCode: 'pt-br', localeName: 'Português Brasil' };
      }
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Buscar idiomas ativos
  const { data: fetchedAvailableLocales = [] } = useQuery({
    queryKey: ['availableLocales'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/admin/localization/active');
        if (!response.ok) {
          return [];
        }
        return response.json();
      } catch (error) {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });

  // Buscar strings de tradução
  const { data: localizationStrings } = useQuery({
    queryKey: ['localizationStrings', locale],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/localization/strings/${locale}`);
        if (!response.ok) {
          return {};
        }
        return response.json();
      } catch (error) {
        return {};
      }
    },
    enabled: !!locale && isInitialized,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  // Inicialização com busca do idioma padrão do servidor
  useEffect(() => {
    const initializeLocalization = async () => {
      console.log('🌐 Inicializando localização...');
      
      // Primeiro, tentar buscar idioma padrão do servidor
      try {
        const response = await fetch('/api/localization/default');
        if (response.ok) {
          const defaultLocaleData = await response.json();
          console.log('🌐 Idioma padrão do servidor:', defaultLocaleData.localeCode);
          
          // Verificar se há cache válido
          const cachedData = loadFromCache();
          
          if (cachedData && cachedData.locale === defaultLocaleData.localeCode) {
            // Cache é válido e corresponde ao idioma padrão
            console.log('🌐 Usando cache válido:', cachedData.locale);
            setLocale(cachedData.locale);
            setTranslations(cachedData.translations);
            setAvailableLocales(cachedData.availableLocales);
            setIsLoadingDefaultLocale(false);
            setIsInitialized(true);
          } else {
            // Cache inválido ou idioma mudou, buscar traduções do servidor
            console.log('🌐 Cache inválido, buscando traduções do servidor:', defaultLocaleData.localeCode);
            setLocale(defaultLocaleData.localeCode);
            
            // Buscar traduções imediatamente
            try {
              const translationsResponse = await fetch(`/api/localization/strings/${defaultLocaleData.localeCode}`);
              if (translationsResponse.ok) {
                const translationsData = await translationsResponse.json();
                console.log('🌐 Traduções carregadas:', Object.keys(translationsData).length, 'strings');
                setTranslations(translationsData);
                
                // Salvar no cache
                saveToCache({
                  locale: defaultLocaleData.localeCode,
                  translations: translationsData,
                  availableLocales: [],
                });
              }
            } catch (translationError) {
              console.warn('🌐 Erro ao buscar traduções:', translationError);
              setTranslations({});
            }
            
            setIsLoadingDefaultLocale(false);
            setIsInitialized(true);
          }
          return;
        }
      } catch (error) {
        console.warn('🌐 Erro ao buscar idioma padrão:', error);
      }
      
      // Se falhou ao buscar do servidor, usar cache ou fallback
      const cachedData = loadFromCache();
      if (cachedData) {
        console.log('🌐 Usando cache como fallback:', cachedData.locale);
        setLocale(cachedData.locale);
        setTranslations(cachedData.translations);
        setAvailableLocales(cachedData.availableLocales);
      } else {
        console.log('🌐 Usando fallback pt-br');
        setLocale('pt-br');
        setTranslations({});
      }
      
      setIsLoadingDefaultLocale(false);
      setIsInitialized(true);
    };

    initializeLocalization();
  }, []);

  // Atualizar locale quando o idioma padrão for carregado
  useEffect(() => {
    if (defaultLocale?.localeCode && defaultLocale.localeCode !== locale && isInitialized) {
      console.log('🌐 Atualizando idioma do servidor:', defaultLocale.localeCode);
      setLocale(defaultLocale.localeCode);
    }
  }, [defaultLocale?.localeCode, isInitialized]);

  // Atualizar traduções quando os dados forem carregados
  useEffect(() => {
    if (localizationStrings && isInitialized) {
      console.log(`🌐 Atualizando traduções para ${locale}:`, Object.keys(localizationStrings).length, 'strings');
      setTranslations(localizationStrings);
      
      // Salvar no cache
      saveToCache({
        locale,
        translations: localizationStrings,
        availableLocales: fetchedAvailableLocales || availableLocales,
      });
    }
  }, [localizationStrings, locale, isInitialized, fetchedAvailableLocales]);

  // Atualizar lista de idiomas disponíveis
  useEffect(() => {
    if (fetchedAvailableLocales && fetchedAvailableLocales.length > 0) {
      setAvailableLocales(fetchedAvailableLocales);
    }
  }, [fetchedAvailableLocales]);

  // Função de tradução
  const t = (key: string, fallback?: string): string => {
    const translation = translations[key];
    return translation || fallback || key;
  };

  // Função para trocar idioma instantaneamente
  const changeLocale = async (newLocale: string): Promise<void> => {
    try {
      console.log(`🌐 Trocando idioma para: ${newLocale}`);
      
      // Buscar traduções do novo idioma
      const response = await fetch(`/api/localization/strings/${newLocale}`);
      if (response.ok) {
        const newTranslations = await response.json();
        
        // Atualizar estado imediatamente
        setLocale(newLocale);
        setTranslations(newTranslations);
        
        // Salvar no cache
        saveToCache({
          locale: newLocale,
          translations: newTranslations,
          availableLocales: availableLocales,
        });
        
        console.log(`🌐 Idioma alterado para ${newLocale} com ${Object.keys(newTranslations).length} traduções`);
      } else {
        throw new Error(`Falha ao carregar traduções para ${newLocale}`);
      }
    } catch (error) {
      console.error('Erro ao trocar idioma:', error);
      throw error;
    }
  };

  // Função para invalidar cache
  const invalidateCache = () => {
    try {
      localStorage.removeItem(CACHE_KEYS.LOCALE);
      localStorage.removeItem(CACHE_KEYS.TRANSLATIONS);
      localStorage.removeItem(CACHE_KEYS.AVAILABLE_LOCALES);
      localStorage.removeItem(CACHE_KEYS.CACHE_TIMESTAMP);
      console.log('🌐 Cache de localização invalidado');
      
      // Forçar atualização
      setIsInitialized(false);
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      console.warn('Erro ao invalidar cache:', error);
    }
  };

  const contextValue: LocalizationContextType = {
    locale,
    t,
    isLoading: !isInitialized,
    error: null,
    availableLocales,
    invalidateCache,
    changeLocale,
  };

  // Não renderizar até estar inicializado
  if (!isInitialized || isLoadingDefaultLocale) {
    return <LoadingScreen />;
  }

  return (
    <LocalizationContext.Provider value={contextValue}>
      {children}
    </LocalizationContext.Provider>
  );
};

// Hook para usar o contexto
export const useLocalization = (): LocalizationContextType => {
  const context = useContext(LocalizationContext);
  if (context === undefined) {
    throw new Error('useLocalization deve ser usado dentro de um LocalizationProvider');
  }
  return context;
};

// Hook simplificado apenas para tradução
export const useTranslation = () => {
  const { t, isLoading, error } = useLocalization();
  return { t, isLoading, error };
};