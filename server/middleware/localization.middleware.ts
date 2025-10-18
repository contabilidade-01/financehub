// server/middleware/localization.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { systemLocalization } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Adicionar ao Request
declare global {
  namespace Express {
    interface Request {
      locale?: string;
    }
  }
}

/**
 * Middleware para definir a localização da requisição
 * Busca o idioma padrão do sistema ou usa fallback
 */
export const setLocale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verificar header Accept-Language ou parâmetro de query
    const requestedLocale = req.headers['accept-language'] || req.query.locale as string;
    
    // Buscar idioma padrão do sistema
    const defaultLocale = await db.select({
      localeCode: systemLocalization.localeCode
    })
      .from(systemLocalization)
      .where(and(
        eq(systemLocalization.isDefault, true),
        eq(systemLocalization.isActive, true)
      ))
      .limit(1);

    // Se encontrou idioma padrão, usar ele, senão usar variável de ambiente como fallback
    const envDefaultLocale = process.env.DEFAULT_LOCALE || 'pt-br';
    req.locale = defaultLocale[0]?.localeCode || envDefaultLocale;
    
    // Se um idioma específico foi solicitado e é válido, usar ele
    if (requestedLocale && /^[a-z]{2}-[a-z]{2}$/.test(requestedLocale)) {
      const requestedLocaleExists = await db.select()
        .from(systemLocalization)
        .where(and(
          eq(systemLocalization.localeCode, requestedLocale),
          eq(systemLocalization.isActive, true)
        ))
        .limit(1);

      if (requestedLocaleExists.length > 0) {
        req.locale = requestedLocale;
      }
    }
    
    next();
  } catch (error) {
    console.error('Erro no middleware de localização:', error);
    req.locale = process.env.DEFAULT_LOCALE || 'pt-br'; // Fallback seguro
    next();
  }
};

/**
 * Middleware para definir headers de localização nas respostas
 */
export const setLocalizationHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Definir headers de localização
  const defaultLocale = process.env.DEFAULT_LOCALE || 'pt-br';
  res.set('Content-Language', req.locale || defaultLocale);
  res.set('X-Locale', req.locale || defaultLocale);
  
  next();
};

/**
 * Middleware combinado para localização completa
 */
export const localizationMiddleware = [setLocale, setLocalizationHeaders];