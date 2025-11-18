import { SystemConfig } from '@/contexts/SystemConfigContext';

/**
 * Atualiza o título da página (tab do navegador)
 */
export function updateDocumentTitle(systemName: string, suffix?: string): void {
  if (suffix) {
    document.title = `${systemName} - ${suffix}`;
  } else {
    document.title = systemName;
  }
}

/**
 * Atualiza uma meta tag específica
 * Funciona tanto para meta[name] quanto meta[property] (Open Graph)
 */
export function updateMetaTag(nameOrProperty: string, content: string): void {
  // Tentar encontrar por name
  let meta = document.querySelector(`meta[name="${nameOrProperty}"]`);

  // Se não encontrou, tentar por property (Open Graph)
  if (!meta) {
    meta = document.querySelector(`meta[property="${nameOrProperty}"]`);
  }

  // Se encontrou, atualizar
  if (meta) {
    meta.setAttribute('content', content);
  } else {
    // Se não existe, criar
    const newMeta = document.createElement('meta');

    // Determinar se é name ou property
    if (nameOrProperty.startsWith('og:') || nameOrProperty.startsWith('twitter:')) {
      newMeta.setAttribute('property', nameOrProperty);
    } else {
      newMeta.setAttribute('name', nameOrProperty);
    }

    newMeta.setAttribute('content', content);
    document.head.appendChild(newMeta);
  }
}

/**
 * Atualiza todas as meta tags Open Graph
 */
export function updateOpenGraphTags(config: SystemConfig): void {
  updateMetaTag('og:title', `${config.system_name} - Dashboard Financeiro`);
  updateMetaTag('og:description', config.system_description);
  updateMetaTag('og:url', config.system_url);
  updateMetaTag('og:site_name', config.system_name);

  // Twitter Cards (opcional, mas recomendado)
  updateMetaTag('twitter:title', `${config.system_name} - Dashboard Financeiro`);
  updateMetaTag('twitter:description', config.system_description);
}

/**
 * Atualiza TODOS os metadados da página
 * Chamado quando o sistema carrega ou quando as configurações mudam
 */
export function updateAllMetadata(config: SystemConfig): void {
  // Título da página
  updateDocumentTitle(config.system_name, 'Dashboard Financeiro');

  // Meta description (SEO)
  updateMetaTag('description', config.system_description);

  // Keywords (se desejar adicionar)
  // updateMetaTag('keywords', 'finanças, gestão financeira, controle financeiro');

  // Open Graph e Twitter Cards
  updateOpenGraphTags(config);

  // Salvar no sessionStorage para uso rápido na próxima visita
  // (usado pelo script crítico no index.html)
  try {
    sessionStorage.setItem('system_config', JSON.stringify({
      system_name: config.system_name,
      system_description: config.system_description
    }));
  } catch (error) {
    console.error('[UpdateMetadata] Erro ao salvar no sessionStorage:', error);
  }
}

/**
 * Atualiza apenas o título da página (uso mais leve)
 * Útil para páginas internas que querem customizar o sufixo
 *
 * @example
 * updatePageTitle(config, 'Transações'); // "MeuSistema - Transações"
 */
export function updatePageTitle(config: SystemConfig, pageTitle?: string): void {
  if (pageTitle) {
    updateDocumentTitle(config.system_name, pageTitle);
  } else {
    updateDocumentTitle(config.system_name);
  }
}
