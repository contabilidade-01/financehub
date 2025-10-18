// Script CRÍTICO para aplicar tema IMEDIATAMENTE
// Este script executa ANTES do React carregar para evitar flash de cor

(function() {
  console.log('⚡ EXECUTANDO SCRIPT CRÍTICO DE TEMA...');
  
  // Verificar preferência salva primeiro, depois sistema
  let mode = 'dark'; // fallback padrão
  
  try {
    // 1. Verificar localStorage (next-themes usa 'theme')
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
      mode = savedTheme;
      console.log(`🎨 Tema salvo encontrado: ${mode}`);
    } else {
      // 2. Se não há tema salvo, usar preferência do sistema
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      mode = isDark ? 'dark' : 'light';
      console.log(`🎨 Usando preferência do sistema: ${mode}`);
    }
  } catch (error) {
    // 3. Fallback se localStorage não estiver disponível
    console.warn('⚠️ Erro ao acessar localStorage, usando preferência do sistema');
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    mode = isDark ? 'dark' : 'light';
    console.log(`🎨 Fallback para sistema: ${mode}`);
  }
  
  // Temas padrão (hardcoded para velocidade máxima)
  const defaultThemes = {
    light: {
      background: '0 0% 98%',
      foreground: '240 10% 3.9%',
      primary: '255 100% 70%',
      primaryForeground: '0 0% 98%',
      muted: '240 4.8% 95.9%',
      mutedForeground: '240 3.8% 46.1%',
      border: '240 5.9% 90%',
      card: '0 0% 100%',
      cardForeground: '240 10% 3.9%',
    },
    dark: {
      background: '240 10% 3.9%',
      foreground: '0 0% 98%',
      primary: '255 100% 70%',
      primaryForeground: '0 0% 98%',
      muted: '240 3.7% 15.9%',
      mutedForeground: '240 5% 64.9%',
      border: '240 3.7% 15.9%',
      card: '240 10% 3.9%',
      cardForeground: '0 0% 98%',
    }
  };
  
  const config = defaultThemes[mode];
  
  // Aplicar CSS CRÍTICO no HEAD imediatamente
  const criticalStyle = document.createElement('style');
  criticalStyle.id = 'theme-critical-instant';
  criticalStyle.innerHTML = `
    :root {
      --background: ${config.background};
      --foreground: ${config.foreground};
      --primary: ${config.primary};
      --primary-foreground: ${config.primaryForeground};
      --muted: ${config.muted};
      --muted-foreground: ${config.mutedForeground};
      --border: ${config.border};
      --card: ${config.card};
      --card-foreground: ${config.cardForeground};
    }
    
    html {
      background-color: hsl(var(--background));
      transition: none !important;
    }
    
    body {
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      transition: none !important;
      margin: 0;
      padding: 0;
    }
    
    * {
      transition: none !important;
    }
    
    /* Loading screen styles */
    .critical-loading {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      font-family: system-ui, -apple-system, sans-serif;
    }
    
    .critical-loading-content {
      text-align: center;
    }
    
    .critical-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid hsl(var(--muted));
      border-top: 4px solid hsl(var(--primary));
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  // Inserir no início do HEAD para prioridade máxima
  document.head.insertBefore(criticalStyle, document.head.firstChild);
  
  // Aplicar background no HTML também
  document.documentElement.style.backgroundColor = `hsl(${config.background})`;
  
  console.log(`⚡ TEMA CRÍTICO APLICADO INSTANTANEAMENTE para ${mode} mode`);
  
  // Função para obter texto localizado baseado no idioma padrão
  function getLocalizedText() {
    // Tentar buscar do localStorage primeiro (cache)
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
    
    // Verificar se há DEFAULT_LOCALE no sessionStorage (configurado pelo servidor)
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
    
    // Fallback para português
    return 'Carregando sistema...';
  }

  const loadingText = getLocalizedText();
  
  // Função para atualizar logo baseado no tema
  let currentTheme = mode;
  let currentLogo = null;
  
  function updateLogo(theme) {
    const logoUrl = `/api/logo?theme=${theme}&t=${Date.now()}`; // Cache bust
    const loadingDiv = document.getElementById('critical-theme-loading');
    
    if (!loadingDiv) return;
    
    // Tentar carregar novo logo
    const logoImg = new window.Image();
    logoImg.onload = function() {
      // Logo carregou, atualizar conteúdo
      const logoElement = loadingDiv.querySelector('img');
      if (logoElement) {
        logoElement.src = logoUrl;
        logoElement.style.transition = 'opacity 0.2s ease';
        currentLogo = logoUrl;
      } else {
        // Se não havia logo antes, adicionar agora
        loadingDiv.innerHTML = `
          <div class="critical-loading-content">
            <img src="${logoUrl}" alt="Logo" style="width: 200px; height: 50px; object-fit: contain; margin-bottom: 16px; transition: opacity 0.2s ease;">
            <p style="margin: 0; font-size: 14px; opacity: 0.7;">${loadingText}</p>
          </div>
        `;
        currentLogo = logoUrl;
      }
      console.log(`🎨 Logo atualizado para tema: ${theme}`);
    };
    logoImg.onerror = function() {
      // Logo não existe para este tema, manter fallback
      const logoElement = loadingDiv.querySelector('img');
      if (logoElement) {
        // Remover logo e voltar ao fallback
        loadingDiv.innerHTML = `
          <div class="critical-loading-content">
            <div class="critical-spinner"></div>
            <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">FinanceHub</h2>
            <p style="margin: 0; font-size: 14px; opacity: 0.7;">${loadingText}</p>
          </div>
        `;
        currentLogo = null;
      }
    };
    logoImg.src = logoUrl;
  }
  
  // Adicionar loading screen temporário
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'critical-theme-loading';
  loadingDiv.className = 'critical-loading';
  
  // Definir conteúdo padrão inicialmente
  loadingDiv.innerHTML = `
    <div class="critical-loading-content">
      <div class="critical-spinner"></div>
      <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">FinanceHub</h2>
      <p style="margin: 0; font-size: 14px; opacity: 0.7;">${loadingText}</p>
    </div>
  `;
  
  // Tentar carregar logo inicial
  updateLogo(mode);
  
  // Adicionar ao body quando estiver pronto
  if (document.body) {
    document.body.appendChild(loadingDiv);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(loadingDiv);
    });
  }
  
  // Função global para atualizar logo do loading screen
  window.updateCriticalLogo = function(newTheme) {
    if (currentTheme !== newTheme) {
      console.log(`🎨 Detectada mudança de tema: ${currentTheme} → ${newTheme}`);
      currentTheme = newTheme;
      updateLogo(newTheme);
    }
  };
  
  // Detectar mudanças de tema através de observador de atributos
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        const newTheme = document.documentElement.getAttribute('data-theme');
        if (newTheme && newTheme !== currentTheme) {
          window.updateCriticalLogo(newTheme);
        }
      }
      // Também observar mudanças de classe que podem indicar mudança de tema
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const classList = document.documentElement.classList;
        const isDarkNow = classList.contains('dark');
        const newThemeFromClass = isDarkNow ? 'dark' : 'light';
        if (newThemeFromClass !== currentTheme) {
          window.updateCriticalLogo(newThemeFromClass);
        }
      }
    });
  });
  
  // Observar mudanças no elemento html
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class']
  });
  
  // Remover loading screen quando React carregar
  window.removeCriticalLoading = function() {
    const loading = document.getElementById('critical-theme-loading');
    if (loading) {
      // Parar observer
      observer.disconnect();
      
      loading.style.opacity = '0';
      setTimeout(() => {
        loading.remove();
      }, 200);
    }
  };
  
})();