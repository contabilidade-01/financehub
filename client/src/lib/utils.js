"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cn = cn;
exports.formatCurrency = formatCurrency;
exports.formatDate = formatDate;
exports.formatRelativeDate = formatRelativeDate;
exports.truncateText = truncateText;
exports.getRandomColor = getRandomColor;
exports.calculatePercentageChange = calculatePercentageChange;
exports.sumArray = sumArray;
exports.getInitials = getInitials;
exports.debounce = debounce;
exports.generateId = generateId;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
/**
 * Combines class values using clsx and tailwind-merge
 */
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
/**
 * Formats a number as currency (BRL)
 */
function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
/**
 * Formats a date using date-fns
 */
function formatDate(date, formatStr = "dd MMM, yyyy") {
    // If it's a string, parse it as ISO and treat as UTC
    if (typeof date === "string") {
        // Remove timezone information and treat as local date
        const dateOnly = date.split('T')[0];
        const [year, month, day] = dateOnly.split('-');
        const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return (0, date_fns_1.format)(localDate, formatStr, { locale: locale_1.ptBR });
    }
    // If it's already a Date object
    return (0, date_fns_1.format)(date, formatStr, { locale: locale_1.ptBR });
}
/**
 * Formats a date for display in a relative format (today, yesterday, etc.)
 */
function formatRelativeDate(date) {
    let parsedDate;
    // If it's a string, parse it as ISO and treat as UTC
    if (typeof date === "string") {
        // Remove timezone information and treat as local date
        const dateOnly = date.split('T')[0];
        const [year, month, day] = dateOnly.split('-');
        parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    else {
        parsedDate = date;
    }
    const now = new Date();
    // Same day
    if (parsedDate.getDate() === now.getDate() &&
        parsedDate.getMonth() === now.getMonth() &&
        parsedDate.getFullYear() === now.getFullYear()) {
        return "Hoje";
    }
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (parsedDate.getDate() === yesterday.getDate() &&
        parsedDate.getMonth() === yesterday.getMonth() &&
        parsedDate.getFullYear() === yesterday.getFullYear()) {
        return "Ontem";
    }
    // This week
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    if (parsedDate >= startOfWeek) {
        return (0, date_fns_1.format)(parsedDate, "EEEE", { locale: locale_1.ptBR });
    }
    // Default format
    return (0, date_fns_1.format)(parsedDate, "dd MMM, yyyy", { locale: locale_1.ptBR });
}
/**
 * Truncates text and adds ellipsis if needed
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, maxLength)}...`;
}
/**
 * Generates a random hex color
 */
function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
/**
 * Calculates percentage change between two numbers
 */
function calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0)
        return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}
/**
 * Sums an array of numbers
 */
function sumArray(arr) {
    return arr.reduce((acc, val) => acc + val, 0);
}
/**
 * Extracts initials from a name
 */
function getInitials(name) {
    if (!name)
        return "";
    const parts = name.split(" ");
    if (parts.length === 1)
        return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
/**
 * Debounce function to limit how often a function can be called
 */
function debounce(func, wait) {
    let timeout = null;
    return function (...args) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}
/**
 * Creates a random ID
 */
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
