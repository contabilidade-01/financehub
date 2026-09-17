"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTheme = exports.setStoredTheme = exports.getStoredTheme = exports.useTheme = exports.ThemeContext = void 0;
const react_1 = require("react");
exports.ThemeContext = (0, react_1.createContext)(undefined);
const useTheme = () => {
    const context = (0, react_1.useContext)(exports.ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
exports.useTheme = useTheme;
const getStoredTheme = () => {
    if (typeof window === 'undefined')
        return 'dark';
    return localStorage.getItem('theme') || 'dark';
};
exports.getStoredTheme = getStoredTheme;
const setStoredTheme = (theme) => {
    if (typeof window === 'undefined')
        return;
    localStorage.setItem('theme', theme);
};
exports.setStoredTheme = setStoredTheme;
const applyTheme = (theme) => {
    if (typeof document === 'undefined')
        return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff');
    }
};
exports.applyTheme = applyTheme;
