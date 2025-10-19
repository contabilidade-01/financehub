// server/controllers/localization.controller.ts
import { Request, Response } from 'express';
import { db } from '../db';
import { systemLocalization, localizationStrings, users, insertLocalizationSchema, updateLocalizationSchema, insertStringSchema, updateStringSchema } from '@shared/schema';
import { eq, and, desc, asc, ne, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

/**
 * @swagger
 * /api/admin/localization:
 *   get:
 *     summary: Lista todos os idiomas configurados (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Lista de idiomas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   localeCode:
 *                     type: string
 *                   localeName:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *                   isDefault:
 *                     type: boolean
 *       403:
 *         description: Acesso negado
 */
export const getLocales = async (req: Request, res: Response) => {
  try {
    const locales = await db.select({
      id: systemLocalization.id,
      localeCode: systemLocalization.localeCode,
      localeName: systemLocalization.localeName,
      isActive: systemLocalization.isActive,
      isDefault: systemLocalization.isDefault,
      createdAt: systemLocalization.createdAt,
      updatedAt: systemLocalization.updatedAt,
    }).from(systemLocalization).orderBy(desc(systemLocalization.isDefault), asc(systemLocalization.localeName));
    
    res.json(locales);
  } catch (error) {
    console.error('Erro ao buscar idiomas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization:
 *   post:
 *     summary: Adiciona novo idioma (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - localeCode
 *               - localeName
 *             properties:
 *               localeCode:
 *                 type: string
 *                 example: "pt-br"
 *               localeName:
 *                 type: string
 *                 example: "Português Brasil"
 *               isActive:
 *                 type: boolean
 *                 default: false
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Idioma criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Acesso negado
 */
export const createLocale = async (req: Request, res: Response) => {
  try {
    const validatedData = insertLocalizationSchema.parse(req.body);
    
    // Validar código de idioma ISO 639-1
    if (!/^[a-z]{2}-[a-z]{2}$/.test(validatedData.localeCode)) {
      return res.status(400).json({ 
        error: 'Código de idioma inválido. Use o formato ISO 639-1 (ex: pt-br, en-us)' 
      });
    }

    const newLocale = await db.insert(systemLocalization).values({
      ...validatedData,
      createdBy: req.user!.id
    }).returning();

    res.status(201).json(newLocale[0]);
  } catch (error) {
    console.error('Erro ao criar idioma:', error);
    
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return res.status(400).json({ error: 'Código de idioma já existe' });
    }
    
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization/{id}:
 *   put:
 *     summary: Atualiza idioma existente (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do idioma
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               localeName:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Idioma atualizado com sucesso
 *       404:
 *         description: Idioma não encontrado
 *       403:
 *         description: Acesso negado
 */
export const updateLocale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateLocalizationSchema.parse(req.body);

    const updatedLocale = await db.update(systemLocalization)
      .set({
        ...validatedData,
        updatedBy: req.user!.id,
        updatedAt: new Date()
      })
      .where(eq(systemLocalization.id, parseInt(id)))
      .returning();

    if (updatedLocale.length === 0) {
      return res.status(404).json({ error: 'Idioma não encontrado' });
    }

    res.json(updatedLocale[0]);
  } catch (error) {
    console.error('Erro ao atualizar idioma:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization/{id}:
 *   delete:
 *     summary: Remove idioma (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do idioma
 *     responses:
 *       200:
 *         description: Idioma removido com sucesso
 *       400:
 *         description: Não é possível remover idioma padrão
 *       404:
 *         description: Idioma não encontrado
 *       403:
 *         description: Acesso negado
 */
export const deleteLocale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se é o idioma padrão
    const locale = await db.select()
      .from(systemLocalization)
      .where(eq(systemLocalization.id, parseInt(id)))
      .limit(1);

    if (locale.length === 0) {
      return res.status(404).json({ error: 'Idioma não encontrado' });
    }

    if (locale[0].isDefault) {
      return res.status(400).json({ 
        error: 'Não é possível remover o idioma padrão. Defina outro idioma como padrão primeiro.' 
      });
    }

    await db.delete(systemLocalization)
      .where(eq(systemLocalization.id, parseInt(id)));

    res.json({ message: 'Idioma removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover idioma:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/localization/default:
 *   get:
 *     summary: Busca o idioma padrão do sistema
 *     tags: [Localization]
 *     responses:
 *       200:
 *         description: Idioma padrão
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 localeCode:
 *                   type: string
 *                 localeName:
 *                   type: string
 *       404:
 *         description: Nenhum idioma padrão configurado
 */
export const getDefaultLocale = async (req: Request, res: Response) => {
  try {
    const defaultLocale = await db.select({
      localeCode: systemLocalization.localeCode,
      localeName: systemLocalization.localeName
    })
      .from(systemLocalization)
      .where(and(
        eq(systemLocalization.isDefault, true),
        eq(systemLocalization.isActive, true)
      ))
      .limit(1);

    if (defaultLocale.length === 0) {
      // Usar variável de ambiente como fallback
      const envDefaultLocale = process.env.DEFAULT_LOCALE || 'pt-br';
      console.log('🌐 Usando idioma padrão do .env:', envDefaultLocale);
      
      // Mapear códigos para nomes amigáveis
      const localeNames = {
        'pt-br': 'Português Brasil',
        'en-us': 'English US',
        'es-es': 'Español España'
      };
      
      return res.json({
        localeCode: envDefaultLocale,
        localeName: localeNames[envDefaultLocale as keyof typeof localeNames] || 'Idioma Padrão'
      });
    }

    res.json(defaultLocale[0]);
  } catch (error) {
    console.error('Erro ao buscar idioma padrão:', error);
    
    // Em caso de erro, usar variável de ambiente
    const envDefaultLocale = process.env.DEFAULT_LOCALE || 'pt-br';
    const localeNames = {
      'pt-br': 'Português Brasil',
      'en-us': 'English US', 
      'es-es': 'Español España'
    };
    
    res.json({
      localeCode: envDefaultLocale,
      localeName: localeNames[envDefaultLocale as keyof typeof localeNames] || 'Idioma Padrão'
    });
  }
};

/**
 * @swagger
 * /api/localization/strings/{localeCode}:
 *   get:
 *     summary: Busca strings de localização para um idioma específico
 *     tags: [Localization]
 *     parameters:
 *       - in: path
 *         name: localeCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Código do idioma (ex: pt-br)
 *     responses:
 *       200:
 *         description: Objeto com strings de localização
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *       404:
 *         description: Idioma não encontrado
 */
export const getLocalizationStrings = async (req: Request, res: Response) => {
  try {
    const { localeCode } = req.params;
    
    // Verificar se o idioma existe e está ativo
    const locale = await db.select()
      .from(systemLocalization)
      .where(and(
        eq(systemLocalization.localeCode, localeCode),
        eq(systemLocalization.isActive, true)
      ))
      .limit(1);

    if (locale.length === 0) {
      return res.status(404).json({ error: 'Idioma não encontrado ou não está ativo' });
    }
    
    const strings = await db.select({
      stringKey: localizationStrings.stringKey,
      stringValue: localizationStrings.stringValue
    })
      .from(localizationStrings)
      .where(eq(localizationStrings.localeCode, localeCode));

    // Converter para objeto chave-valor
    const stringMap: Record<string, string> = {};
    strings.forEach(s => {
      stringMap[s.stringKey] = s.stringValue;
    });

    res.json(stringMap);
  } catch (error) {
    console.error('Erro ao buscar strings de localização:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization/{localeCode}/import:
 *   post:
 *     summary: Importa strings de um arquivo JSON (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: localeCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Código do idioma
 *     responses:
 *       200:
 *         description: Strings importadas com sucesso
 *       404:
 *         description: Arquivo de localização não encontrado
 *       403:
 *         description: Acesso negado
 */
export const importStringsFromJson = async (req: Request, res: Response) => {
  try {
    const { localeCode } = req.params;
    
    // Verificar se o idioma existe
    const locale = await db.select()
      .from(systemLocalization)
      .where(eq(systemLocalization.localeCode, localeCode))
      .limit(1);

    if (locale.length === 0) {
      return res.status(404).json({ error: 'Idioma não encontrado no sistema' });
    }

    const filePath = path.join(process.cwd(), 'locales', `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo de localização não encontrado' });
    }

    const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Converter objeto aninhado para chaves planas
    const flattenObject = (obj: any, prefix = ''): Record<string, string> => {
      let result: Record<string, string> = {};
      
      for (const key in obj) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(result, flattenObject(obj[key], newKey));
        } else {
          result[newKey] = String(obj[key]);
        }
      }
      
      return result;
    };

    const flatStrings = flattenObject(jsonContent);
    let importedCount = 0;
    let updatedCount = 0;
    
    // Inserir/atualizar strings no banco
    for (const [key, value] of Object.entries(flatStrings)) {
      try {
        // Verificar se a string já existe
        const existingString = await db.select()
          .from(localizationStrings)
          .where(and(
            eq(localizationStrings.stringKey, key),
            eq(localizationStrings.localeCode, localeCode)
          ))
          .limit(1);

        if (existingString.length > 0) {
          // Atualizar string existente
          await db.update(localizationStrings)
            .set({
              stringValue: value,
              updatedAt: new Date()
            })
            .where(and(
              eq(localizationStrings.stringKey, key),
              eq(localizationStrings.localeCode, localeCode)
            ));
          updatedCount++;
        } else {
          // Inserir nova string
          await db.insert(localizationStrings).values({
            stringKey: key,
            localeCode,
            stringValue: value
          });
          importedCount++;
        }
      } catch (error) {
        console.warn(`Erro ao processar chave ${key}:`, error);
      }
    }

    res.json({ 
      message: 'Strings importadas com sucesso',
      imported: importedCount,
      updated: updatedCount,
      total: importedCount + updatedCount
    });
  } catch (error) {
    console.error('Erro ao importar strings:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization/active:
 *   get:
 *     summary: Lista idiomas ativos (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Lista de idiomas ativos
 */
export const getActiveLocales = async (req: Request, res: Response) => {
  try {
    const activeLocales = await db.select({
      localeCode: systemLocalization.localeCode,
      localeName: systemLocalization.localeName,
      isDefault: systemLocalization.isDefault
    })
      .from(systemLocalization)
      .where(eq(systemLocalization.isActive, true))
      .orderBy(desc(systemLocalization.isDefault), asc(systemLocalization.localeName));

    res.json(activeLocales);
  } catch (error) {
    console.error('Erro ao buscar idiomas ativos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization/{localeCode}/toggle:
 *   put:
 *     tags: [Localização]
 *     summary: Ativar/desativar idioma
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: localeCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Código do idioma
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 description: Estado de ativação do idioma
 *     responses:
 *       200:
 *         description: Status do idioma atualizado com sucesso
 *       404:
 *         description: Idioma não encontrado
 *       403:
 *         description: Acesso negado
 */
export const toggleLanguageStatus = async (req: Request, res: Response) => {
  try {
    const { localeCode } = req.params;
    const { isActive } = req.body;

    // Verificar se o idioma existe
    const existingLocale = await db.select()
      .from(systemLocalization)
      .where(eq(systemLocalization.localeCode, localeCode))
      .limit(1);

    if (existingLocale.length === 0) {
      return res.status(404).json({ error: 'Idioma não encontrado' });
    }

    // Não permitir desativar o último idioma ativo
    if (!isActive) {
      const activeCount = await db.select({ count: sql`count(*)` })
        .from(systemLocalization)
        .where(eq(systemLocalization.isActive, true));

      if (activeCount[0]?.count <= 1) {
        return res.status(400).json({ error: 'Não é possível desativar o último idioma ativo' });
      }
    }

    // Atualizar status
    await db.update(systemLocalization)
      .set({ 
        isActive,
        updatedAt: new Date()
      })
      .where(eq(systemLocalization.localeCode, localeCode));

    // Se estiver desativando e for o padrão, definir outro como padrão
    if (!isActive && existingLocale[0].isDefault) {
      const firstActive = await db.select()
        .from(systemLocalization)
        .where(and(
          eq(systemLocalization.isActive, true),
          ne(systemLocalization.localeCode, localeCode)
        ))
        .limit(1);

      if (firstActive.length > 0) {
        await db.update(systemLocalization)
          .set({ 
            isDefault: true,
            updatedAt: new Date()
          })
          .where(eq(systemLocalization.localeCode, firstActive[0].localeCode));
      }
    }

    res.json({ 
      message: isActive ? 'Idioma ativado com sucesso' : 'Idioma desativado com sucesso',
      localeCode,
      isActive
    });
  } catch (error) {
    console.error('Erro ao atualizar status do idioma:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization/{localeCode}/set-default:
 *   put:
 *     tags: [Localização]
 *     summary: Definir idioma como padrão
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - in: path
 *         name: localeCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Código do idioma
 *     responses:
 *       200:
 *         description: Idioma padrão definido com sucesso
 *       404:
 *         description: Idioma não encontrado
 *       400:
 *         description: Idioma deve estar ativo para ser padrão
 *       403:
 *         description: Acesso negado
 */
export const setDefaultLanguage = async (req: Request, res: Response) => {
  try {
    const { localeCode } = req.params;

    // Verificar se o idioma existe e está ativo
    const existingLocale = await db.select()
      .from(systemLocalization)
      .where(eq(systemLocalization.localeCode, localeCode))
      .limit(1);

    if (existingLocale.length === 0) {
      return res.status(404).json({ error: 'Idioma não encontrado' });
    }

    // Remover padrão de todos os outros idiomas
    await db.update(systemLocalization)
      .set({ 
        isDefault: false,
        updatedAt: new Date()
      })
      .where(ne(systemLocalization.localeCode, localeCode));

    // Definir este como padrão e ativá-lo automaticamente
    await db.update(systemLocalization)
      .set({ 
        isDefault: true,
        isActive: true,
        updatedAt: new Date()
      })
      .where(eq(systemLocalization.localeCode, localeCode));

    res.json({ 
      message: 'Idioma padrão definido com sucesso',
      localeCode
    });
  } catch (error) {
    console.error('Erro ao definir idioma padrão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};