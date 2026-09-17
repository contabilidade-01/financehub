"use strict";
// Theme Manager - Sistema de Aplicação de Temas
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeManager = exports.ThemeManager = exports.defaultThemes = void 0;
exports.useThemeManager = useThemeManager;
// Temas padrão do sistema
exports.defaultThemes = {
    default: {
        name: 'Padrão Khesef',
        isDefault: true,
        lightConfig: {
            background: '0 0% 98%',
            foreground: '240 10% 3.9%',
            primary: '255 100% 70%',
            primaryForeground: '0 0% 98%',
            secondary: '157 100% 50%',
            secondaryForeground: '0 0% 9%',
            muted: '240 4.8% 95.9%',
            mutedForeground: '240 3.8% 46.1%',
            accent: '240 4.8% 95.9%',
            accentForeground: '240 5.9% 10%',
            border: '240 5.9% 90%',
            card: '0 0% 100%',
            cardForeground: '240 10% 3.9%',
            destructive: '0 84.2% 60.2%',
            destructiveForeground: '0 0% 98%',
        },
        darkConfig: {
            background: '240 10% 3.9%',
            foreground: '0 0% 98%',
            primary: '255 100% 70%',
            primaryForeground: '0 0% 98%',
            secondary: '157 100% 50%',
            secondaryForeground: '0 0% 9%',
            muted: '240 3.7% 15.9%',
            mutedForeground: '240 5% 64.9%',
            accent: '240 3.7% 15.9%',
            accentForeground: '0 0% 98%',
            border: '240 3.7% 15.9%',
            card: '240 10% 3.9%',
            cardForeground: '0 0% 98%',
            destructive: '0 62.8% 30.6%',
            destructiveForeground: '0 0% 98%',
        }
    }
};
// Classe para gerenciar temas
class ThemeManager {
    constructor() {
        this.currentTheme = null;
        this.isPreviewMode = false;
    }
    static getInstance() {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }
    // Normalizar tema para tratar inconsistências de campo (database vs frontend)
    normalizeTheme(theme) {
        // Se o tema já está no formato correto, retornar como está
        if (theme.lightConfig && theme.darkConfig) {
            return theme;
        }
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
                normalizedTheme.lightConfig = exports.defaultThemes.default.lightConfig;
            }
        }
        if (typeof normalizedTheme.darkConfig === 'string') {
            try {
                normalizedTheme.darkConfig = JSON.parse(normalizedTheme.darkConfig);
            }
            catch (error) {
                console.error('Erro ao fazer parse de darkConfig:', error);
                normalizedTheme.darkConfig = exports.defaultThemes.default.darkConfig;
            }
        }
        return normalizedTheme;
    }
    // Aplicar tema completo
    applyTheme(theme, mode, isPreview = false) {
        if (!theme) {
            console.warn('applyTheme: theme is null or undefined');
            return;
        }
        // Normalizar dados do tema (tratar possíveis inconsistências de campo)
        const normalizedTheme = this.normalizeTheme(theme);
        const config = mode === 'light' ? normalizedTheme.lightConfig : normalizedTheme.darkConfig;
        if (!config) {
            console.warn(`applyTheme: ${mode}Config is null or undefined`, normalizedTheme);
            return;
        }
        this.isPreviewMode = isPreview;
        if (!isPreview) {
            this.currentTheme = theme;
        }
        // Aplicar variables CSS
        this.applyCSSVariables(config, isPreview);
        // Salvar no localStorage se não for preview
        if (!isPreview) {
            this.saveThemeToStorage(theme, mode);
        }
    }
    // Aplicar apenas variables CSS
    applyCSSVariables(config, isPreview = false) {
        const root = document.documentElement;
        const styleId = isPreview ? 'theme-preview-style' : 'custom-theme-style';
        // Remover estilo anterior
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
        // Criar novo estilo
        const style = document.createElement('style');
        style.id = styleId;
        const cssVars = this.generateCSSVariables(config);
        const cssClass = isPreview ? '.theme-preview' : ':root';
        style.textContent = `
      ${cssClass} {
        ${cssVars}
      }
    `;
        document.head.appendChild(style);
        // Emitir evento para componentes que precisam reagir
        window.dispatchEvent(new CustomEvent('theme-changed', {
            detail: { config, isPreview }
        }));
        // Notificar script crítico sobre mudança de tema se não for preview
        if (!isPreview && typeof window !== 'undefined' && window.updateCriticalLogo) {
            const currentMode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            window.updateCriticalLogo(currentMode);
        }
    }
    // Converter HEX para HSL
    hexToHsl(hex) {
        if (!this.isValidHex(hex))
            return hex;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }
        return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    }
    // Gerar CSS variables a partir da config
    generateCSSVariables(config) {
        if (!config || typeof config !== 'object') {
            console.warn('generateCSSVariables: config is invalid', config);
            return '';
        }
        return Object.entries(config)
            .filter(([key, value]) => key && value) // Filtrar entradas válidas
            .map(([key, value]) => {
            // Converter camelCase para kebab-case
            const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            // Converter HEX para HSL se necessário (Tailwind CSS espera HSL)
            const cssValue = this.isValidHex(value) ? this.hexToHsl(value) : value;
            return `--${cssVar}: ${cssValue};`;
        })
            .join('\n        ');
    }
    // Salvar tema no localStorage
    saveThemeToStorage(theme, mode) {
        try {
            localStorage.setItem('custom-theme', JSON.stringify({
                theme,
                mode,
                appliedAt: new Date().toISOString()
            }));
        }
        catch (error) {
            console.error('Erro ao salvar tema no localStorage:', error);
        }
    }
    // Carregar tema do localStorage
    loadThemeFromStorage() {
        try {
            const stored = localStorage.getItem('custom-theme');
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    theme: parsed.theme,
                    mode: parsed.mode
                };
            }
        }
        catch (error) {
            console.error('Erro ao carregar tema do localStorage:', error);
        }
        return null;
    }
    // Aplicar tema do servidor
    async applyThemeFromServer(themeId, mode) {
        try {
            const response = await fetch(`/api/themes/${themeId}`, {
                credentials: 'include'
            });
            if (response.ok) {
                const theme = await response.json();
                this.applyTheme(theme, mode);
            }
            else {
                throw new Error('Falha ao carregar tema do servidor');
            }
        }
        catch (error) {
            console.error('Erro ao aplicar tema do servidor:', error);
            // Fallback para tema padrão
            this.applyTheme(exports.defaultThemes.default, mode);
        }
    }
    // Resetar para tema padrão
    resetToDefault(mode) {
        console.log(`🎨 Aplicando tema padrão para ${mode} mode...`);
        this.applyTheme(exports.defaultThemes.default, mode);
        // Notificar script crítico sobre a mudança
        if (typeof window !== 'undefined' && window.updateCriticalLogo) {
            window.updateCriticalLogo(mode);
        }
    }
    // Aplicar tema crítico INSTANTANEAMENTE (para evitar flash)
    applyCriticalTheme(mode) {
        const config = mode === 'light' ? exports.defaultThemes.default.lightConfig : exports.defaultThemes.default.darkConfig;
        // Aplicar cores críticas diretamente no document.documentElement
        const root = document.documentElement;
        // Remover estilos críticos anteriores
        const existingCritical = document.getElementById('critical-theme-style');
        if (existingCritical) {
            existingCritical.remove();
        }
        // CSS crítico inline no head para carregamento INSTANTÂNEO
        const criticalStyle = document.createElement('style');
        criticalStyle.id = 'critical-theme-style';
        criticalStyle.innerHTML = `
      :root {
        --background: ${this.isValidHex(config.background) ? this.hexToHsl(config.background) : config.background};
        --foreground: ${this.isValidHex(config.foreground) ? this.hexToHsl(config.foreground) : config.foreground};
        --primary: ${this.isValidHex(config.primary) ? this.hexToHsl(config.primary) : config.primary};
        --primary-foreground: ${this.isValidHex(config.primaryForeground) ? this.hexToHsl(config.primaryForeground) : config.primaryForeground};
        --muted: ${this.isValidHex(config.muted) ? this.hexToHsl(config.muted) : config.muted};
        --muted-foreground: ${this.isValidHex(config.mutedForeground) ? this.hexToHsl(config.mutedForeground) : config.mutedForeground};
        --border: ${this.isValidHex(config.border) ? this.hexToHsl(config.border) : config.border};
        --card: ${this.isValidHex(config.card) ? this.hexToHsl(config.card) : config.card};
        --card-foreground: ${this.isValidHex(config.cardForeground) ? this.hexToHsl(config.cardForeground) : config.cardForeground};
      }
      
      body {
        background-color: hsl(var(--background));
        color: hsl(var(--foreground));
        transition: none !important;
      }
      
      * {
        transition: none !important;
      }
    `;
        // Adicionar no HEAD IMEDIATAMENTE
        document.head.insertBefore(criticalStyle, document.head.firstChild);
        console.log(`⚡ Tema crítico aplicado INSTANTANEAMENTE para ${mode} mode`);
    }
    // Cancelar preview
    cancelPreview() {
        if (this.isPreviewMode) {
            const previewStyle = document.getElementById('theme-preview-style');
            if (previewStyle) {
                previewStyle.remove();
            }
            this.isPreviewMode = false;
        }
    }
    // Obter tema atual
    getCurrentTheme() {
        return this.currentTheme;
    }
    // Validar configuração de tema
    validateThemeConfig(config) {
        const requiredFields = [
            'background', 'foreground', 'primary', 'primaryForeground',
            'secondary', 'secondaryForeground', 'muted', 'mutedForeground',
            'accent', 'accentForeground', 'border', 'card', 'cardForeground',
            'destructive', 'destructiveForeground'
        ];
        return requiredFields.every(field => {
            const value = config[field];
            return value && typeof value === 'string' && this.isValidColor(value);
        });
    }
    // Validar formato de cor (HEX ou HSL)
    isValidHex(hex) {
        const hexPattern = /^#[0-9A-Fa-f]{6}$/;
        return hexPattern.test(hex.trim());
    }
    isValidHSL(hsl) {
        const hslPattern = /^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/;
        return hslPattern.test(hsl.trim());
    }
    isValidColor(color) {
        return this.isValidHex(color) || this.isValidHSL(color);
    }
    // Exportar tema
    exportTheme(theme) {
        return JSON.stringify(theme, null, 2);
    }
    // Importar tema
    importTheme(themeData) {
        try {
            const theme = JSON.parse(themeData);
            // Validar estrutura
            if (theme.name &&
                theme.lightConfig &&
                theme.darkConfig &&
                this.validateThemeConfig(theme.lightConfig) &&
                this.validateThemeConfig(theme.darkConfig)) {
                return theme;
            }
        }
        catch (error) {
            console.error('Erro ao importar tema:', error);
        }
        return null;
    }
    // Obter informações do tema aplicado
    getAppliedThemeInfo() {
        return {
            theme: this.currentTheme,
            mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            isPreview: this.isPreviewMode
        };
    }
    // Gerar tema baseado em cor principal
    generateThemeFromPrimary(primaryColor, name) {
        // Algoritmo simplificado para gerar tema harmonioso
        // Em um cenário real, usaria teoria das cores para gerar paleta completa
        return {
            name,
            lightConfig: Object.assign(Object.assign({}, exports.defaultThemes.default.lightConfig), { primary: primaryColor }),
            darkConfig: Object.assign(Object.assign({}, exports.defaultThemes.default.darkConfig), { primary: primaryColor })
        };
    }
}
exports.ThemeManager = ThemeManager;
// Instância singleton
exports.themeManager = ThemeManager.getInstance();
// Hook para React
function useThemeManager() {
    return {
        applyTheme: (theme, mode, isPreview = false) => exports.themeManager.applyTheme(theme, mode, isPreview),
        resetToDefault: (mode) => exports.themeManager.resetToDefault(mode),
        applyCriticalTheme: (mode) => exports.themeManager.applyCriticalTheme(mode),
        cancelPreview: () => exports.themeManager.cancelPreview(),
        getCurrentTheme: () => exports.themeManager.getCurrentTheme(),
        validateThemeConfig: (config) => exports.themeManager.validateThemeConfig(config),
        exportTheme: (theme) => exports.themeManager.exportTheme(theme),
        importTheme: (themeData) => exports.themeManager.importTheme(themeData),
        generateThemeFromPrimary: (color, name) => exports.themeManager.generateThemeFromPrimary(color, name),
        getAppliedThemeInfo: () => exports.themeManager.getAppliedThemeInfo(),
    };
}
