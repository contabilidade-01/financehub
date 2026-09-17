"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localizationMiddleware = exports.setLocalizationHeaders = exports.setLocale = void 0;
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Middleware para definir a localização da requisição
 * Busca o idioma padrão do sistema ou usa fallback
 */
const setLocale = async (req, res, next) => {
    var _a;
    try {
        // Verificar header Accept-Language ou parâmetro de query
        const requestedLocale = req.headers['accept-language'] || req.query.locale;
        // Buscar idioma padrão do sistema
        const defaultLocale = await db_1.db.select({
            localeCode: schema_1.systemLocalization.localeCode
        })
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.systemLocalization.isDefault, true), (0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true)))
            .limit(1);
        // Se encontrou idioma padrão, usar ele, senão usar variável de ambiente como fallback
        const envDefaultLocale = process.env.DEFAULT_LOCALE || 'pt-br';
        req.locale = ((_a = defaultLocale[0]) === null || _a === void 0 ? void 0 : _a.localeCode) || envDefaultLocale;
        // Se um idioma específico foi solicitado e é válido, usar ele
        if (requestedLocale && /^[a-z]{2}-[a-z]{2}$/.test(requestedLocale)) {
            const requestedLocaleExists = await db_1.db.select()
                .from(schema_1.systemLocalization)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, requestedLocale), (0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true)))
                .limit(1);
            if (requestedLocaleExists.length > 0) {
                req.locale = requestedLocale;
            }
        }
        next();
    }
    catch (error) {
        console.error('Erro no middleware de localização:', error);
        req.locale = process.env.DEFAULT_LOCALE || 'pt-br'; // Fallback seguro
        next();
    }
};
exports.setLocale = setLocale;
/**
 * Middleware para definir headers de localização nas respostas
 */
const setLocalizationHeaders = (req, res, next) => {
    // Definir headers de localização
    const defaultLocale = process.env.DEFAULT_LOCALE || 'pt-br';
    res.set('Content-Language', req.locale || defaultLocale);
    res.set('X-Locale', req.locale || defaultLocale);
    next();
};
exports.setLocalizationHeaders = setLocalizationHeaders;
/**
 * Middleware combinado para localização completa
 */
exports.localizationMiddleware = [exports.setLocale, exports.setLocalizationHeaders];
