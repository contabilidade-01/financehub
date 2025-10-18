import { useState, useEffect } from 'react';

interface LoadingScreenProps {
  text?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ text }) => {
  const [loadingText, setLoadingText] = useState('Carregando sistema...');

  useEffect(() => {
    const getLoadingText = async () => {
      if (text) {
        setLoadingText(text);
        return;
      }

      // Função para obter texto localizado sem depender do Context
      const getLocalizedLoadingText = () => {
        const cachedLocale = localStorage.getItem('financehub_locale');
        if (cachedLocale) {
          switch (cachedLocale) {
            case 'es-es':
              return 'Cargando sistema...';
            case 'en-us':
              return 'Loading system...';
            default:
              return 'Carregando sistema...';
          }
        }
        
        const defaultLocale = sessionStorage.getItem('default_locale');
        if (defaultLocale) {
          switch (defaultLocale) {
            case 'es-es':
              return 'Cargando sistema...';
            case 'en-us':
              return 'Loading system...';
            default:
              return 'Carregando sistema...';
          }
        }
        
        return 'Carregando sistema...';
      };

      setLoadingText(getLocalizedLoadingText());
    };

    getLoadingText();
  }, [text]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-500"></div>
        <p className="text-lg text-muted-foreground">{loadingText}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;