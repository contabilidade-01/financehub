"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAutoTheme = useAutoTheme;
const react_1 = require("react");
const next_themes_1 = require("next-themes");
const theme_manager_1 = require("@/utils/theme-manager");
// Função para normalizar dados de tema vindos do banco
const normalizeThemeData = (theme) => {
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
    // Parse strings JSON se necessário
    if (typeof normalizedTheme.lightConfig === 'string') {
        try {
            normalizedTheme.lightConfig = JSON.parse(normalizedTheme.lightConfig);
        }
        catch (error) {
            console.error('Erro ao fazer parse de lightConfig:', error);
        }
    }
    if (typeof normalizedTheme.darkConfig === 'string') {
        try {
            normalizedTheme.darkConfig = JSON.parse(normalizedTheme.darkConfig);
        }
        catch (error) {
            console.error('Erro ao fazer parse de darkConfig:', error);
        }
    }
    return normalizedTheme;
};
function useAutoTheme() {
    const { theme: currentMode } = (0, next_themes_1.useTheme)();
    const [isThemeLoaded, setIsThemeLoaded] = (0, react_1.useState)(false);
    const [themeLoadError, setThemeLoadError] = (0, react_1.useState)(null);
    // Aplicar tema CRÍTICO IMEDIATAMENTE no primeiro render (antes de qualquer fetch)
    (0, react_1.useEffect)(() => {
        console.log('⚡ Aplicando tema CRÍTICO IMEDIATO para evitar flash...');
        // Verificar preferência salva primeiro, depois sistema
        let immediateMode = 'dark'; // fallback padrão
        try {
            const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
            if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
                immediateMode = savedTheme;
                console.log(`🎨 Hook: Tema salvo encontrado: ${immediateMode}`);
            }
            else {
                // Fallback para preferência do sistema
                immediateMode = (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
                console.log(`🎨 Hook: Usando preferência do sistema: ${immediateMode}`);
            }
        }
        catch (error) {
            console.warn('⚠️ Hook: Erro ao acessar localStorage, usando preferência do sistema');
            immediateMode = (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        theme_manager_1.themeManager.applyCriticalTheme(immediateMode);
    }, []); // Executar IMEDIATAMENTE
    (0, react_1.useEffect)(() => {
        // Função para carregar e aplicar tema ativo automaticamente
        const loadActiveTheme = async () => {
            try {
                if (!currentMode || currentMode === 'system')
                    return;
                setThemeLoadError(null);
                const mode = currentMode;
                console.log(`🔄 Carregando tema ativo para ${mode} mode...`);
                const response = await fetch(`/api/themes/active/${mode}`, {
                    credentials: 'include'
                });
                if (response.ok) {
                    const result = await response.json();
                    const activeTheme = normalizeThemeData(result.data);
                    console.log(`🎨 Auto-aplicando tema ativo para ${mode} mode:`, activeTheme.name);
                    // Aplicar o tema ativo automaticamente
                    theme_manager_1.themeManager.applyTheme(activeTheme, mode, false);
                    setIsThemeLoaded(true);
                }
                else if (response.status === 404) {
                    console.log(`No active theme found for ${mode} mode, using default`);
                    // Usar tema padrão quando não há tema ativo
                    theme_manager_1.themeManager.resetToDefault(mode);
                    setIsThemeLoaded(true);
                }
                else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            catch (error) {
                const errorMessage = `Erro ao carregar tema ativo para ${currentMode} mode: ${error}`;
                console.error(errorMessage);
                setThemeLoadError(errorMessage);
                // Fallback para tema padrão em caso de erro
                if (currentMode && currentMode !== 'system') {
                    theme_manager_1.themeManager.resetToDefault(currentMode);
                    setIsThemeLoaded(true);
                }
            }
        };
        // Carregar tema quando o modo mudar ou na inicialização
        if (currentMode && currentMode !== 'system') {
            loadActiveTheme();
        }
    }, [currentMode]);
    // Efeito PRINCIPAL para carregar tema IMEDIATAMENTE na inicialização
    (0, react_1.useEffect)(() => {
        const loadInitialTheme = async () => {
            try {
                console.log('🚀 Iniciando carregamento IMEDIATO de tema...');
                // Detectar o modo IMEDIATAMENTE sem esperar next-themes
                let initialMode = currentMode;
                if (!initialMode) {
                    try {
                        // Verificar preferência salva primeiro
                        const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
                        if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
                            initialMode = savedTheme;
                            console.log(`🎨 Hook inicial: Tema salvo encontrado: ${initialMode}`);
                        }
                        else {
                            // Fallback para preferência do sistema
                            initialMode = (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                            console.log(`🎨 Hook inicial: Usando preferência do sistema: ${initialMode}`);
                        }
                    }
                    catch (error) {
                        console.warn('⚠️ Hook inicial: Erro ao acessar localStorage');
                        initialMode = (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                    }
                }
                if (initialMode !== 'system') {
                    const mode = initialMode;
                    console.log(`🎨 Carregando tema INICIAL para ${mode} mode (ANTES de qualquer tela)...`);
                    try {
                        // Tentar carregar tema ativo sem autenticação primeiro
                        const response = await fetch(`/api/themes/active/${mode}`, {
                            credentials: 'include'
                        });
                        if (response.ok) {
                            const result = await response.json();
                            const activeTheme = normalizeThemeData(result.data);
                            console.log(`✅ SUCESSO: Aplicando tema inicial para ${mode} mode:`, activeTheme.name);
                            // Aplicar o tema ativo IMEDIATAMENTE
                            theme_manager_1.themeManager.applyTheme(activeTheme, mode, false);
                            setIsThemeLoaded(true);
                            return;
                        }
                        else if (response.status === 401) {
                            console.log(`🔒 Não autenticado, tentando endpoint público para ${mode} mode...`);
                            // Se não autenticado, tentar endpoint público ou fallback
                        }
                        else if (response.status === 404) {
                            console.log(`❌ Nenhum tema ativo encontrado para ${mode} mode`);
                        }
                    }
                    catch (fetchError) {
                        console.log(`⚠️ Erro na requisição, usando fallback:`, fetchError);
                    }
                    // FALLBACK: Sempre aplicar tema padrão se não conseguir carregar
                    console.log(`🎨 Aplicando tema PADRÃO para ${mode} mode...`);
                    theme_manager_1.themeManager.resetToDefault(mode);
                    setIsThemeLoaded(true);
                }
            }
            catch (error) {
                console.error('💥 Erro CRÍTICO ao carregar tema inicial:', error);
                setThemeLoadError(`Erro crítico: ${error}`);
                // FALLBACK CRÍTICO: Sempre aplicar um tema
                let fallbackMode = currentMode;
                if (!fallbackMode) {
                    try {
                        // Verificar preferência salva como último recurso
                        const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
                        if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
                            fallbackMode = savedTheme;
                            console.log(`🎨 Fallback crítico: Tema salvo encontrado: ${fallbackMode}`);
                        }
                        else {
                            fallbackMode = (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                            console.log(`🎨 Fallback crítico: Usando sistema: ${fallbackMode}`);
                        }
                    }
                    catch (error) {
                        fallbackMode = (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                    }
                }
                if (fallbackMode !== 'system') {
                    console.log(`🆘 FALLBACK CRÍTICO: Aplicando tema padrão para ${fallbackMode} mode`);
                    theme_manager_1.themeManager.resetToDefault(fallbackMode);
                    setIsThemeLoaded(true);
                }
            }
        };
        // EXECUTAR IMEDIATAMENTE - sem esperar nada
        loadInitialTheme();
    }, []); // Array vazio para executar APENAS uma vez na montagem IMEDIATA
    return {
        currentMode: currentMode,
        isThemeLoaded,
        themeLoadError
    };
}
