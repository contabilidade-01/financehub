"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultLanguage = exports.toggleLanguageStatus = exports.getActiveLocales = exports.importStringsFromJson = exports.getLocalizationStrings = exports.getDefaultLocale = exports.deleteLocale = exports.updateLocale = exports.createLocale = exports.getLocales = void 0;
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
const getLocales = async (req, res) => {
    try {
        const locales = await db_1.db.select({
            id: schema_1.systemLocalization.id,
            localeCode: schema_1.systemLocalization.localeCode,
            localeName: schema_1.systemLocalization.localeName,
            isActive: schema_1.systemLocalization.isActive,
            isDefault: schema_1.systemLocalization.isDefault,
            createdAt: schema_1.systemLocalization.createdAt,
            updatedAt: schema_1.systemLocalization.updatedAt,
        }).from(schema_1.systemLocalization).orderBy((0, drizzle_orm_1.desc)(schema_1.systemLocalization.isDefault), (0, drizzle_orm_1.asc)(schema_1.systemLocalization.localeName));
        res.json(locales);
    }
    catch (error) {
        console.error('Erro ao buscar idiomas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.getLocales = getLocales;
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
const createLocale = async (req, res) => {
    try {
        const validatedData = schema_1.insertLocalizationSchema.parse(req.body);
        // Validar código de idioma ISO 639-1
        if (!/^[a-z]{2}-[a-z]{2}$/.test(validatedData.localeCode)) {
            return res.status(400).json({
                error: 'Código de idioma inválido. Use o formato ISO 639-1 (ex: pt-br, en-us)'
            });
        }
        const newLocale = await db_1.db.insert(schema_1.systemLocalization).values(Object.assign(Object.assign({}, validatedData), { createdBy: req.user.id })).returning();
        res.status(201).json(newLocale[0]);
    }
    catch (error) {
        console.error('Erro ao criar idioma:', error);
        if (error instanceof Error && error.message.includes('duplicate key')) {
            return res.status(400).json({ error: 'Código de idioma já existe' });
        }
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.createLocale = createLocale;
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
const updateLocale = async (req, res) => {
    try {
        const { id } = req.params;
        const validatedData = schema_1.updateLocalizationSchema.parse(req.body);
        const updatedLocale = await db_1.db.update(schema_1.systemLocalization)
            .set(Object.assign(Object.assign({}, validatedData), { updatedBy: req.user.id, updatedAt: new Date() }))
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.id, parseInt(id)))
            .returning();
        if (updatedLocale.length === 0) {
            return res.status(404).json({ error: 'Idioma não encontrado' });
        }
        res.json(updatedLocale[0]);
    }
    catch (error) {
        console.error('Erro ao atualizar idioma:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.updateLocale = updateLocale;
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
const deleteLocale = async (req, res) => {
    try {
        const { id } = req.params;
        // Verificar se é o idioma padrão
        const locale = await db_1.db.select()
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.id, parseInt(id)))
            .limit(1);
        if (locale.length === 0) {
            return res.status(404).json({ error: 'Idioma não encontrado' });
        }
        if (locale[0].isDefault) {
            return res.status(400).json({
                error: 'Não é possível remover o idioma padrão. Defina outro idioma como padrão primeiro.'
            });
        }
        await db_1.db.delete(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.id, parseInt(id)));
        res.json({ message: 'Idioma removido com sucesso' });
    }
    catch (error) {
        console.error('Erro ao remover idioma:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.deleteLocale = deleteLocale;
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
const getDefaultLocale = async (req, res) => {
    try {
        const defaultLocale = await db_1.db.select({
            localeCode: schema_1.systemLocalization.localeCode,
            localeName: schema_1.systemLocalization.localeName
        })
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.systemLocalization.isDefault, true), (0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true)))
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
                localeName: localeNames[envDefaultLocale] || 'Idioma Padrão'
            });
        }
        res.json(defaultLocale[0]);
    }
    catch (error) {
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
            localeName: localeNames[envDefaultLocale] || 'Idioma Padrão'
        });
    }
};
exports.getDefaultLocale = getDefaultLocale;
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
const getLocalizationStrings = async (req, res) => {
    try {
        const { localeCode } = req.params;
        // Verificar se o idioma existe e está ativo
        const locale = await db_1.db.select()
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode), (0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true)))
            .limit(1);
        if (locale.length === 0) {
            return res.status(404).json({ error: 'Idioma não encontrado ou não está ativo' });
        }
        const strings = await db_1.db.select({
            stringKey: schema_1.localizationStrings.stringKey,
            stringValue: schema_1.localizationStrings.stringValue
        })
            .from(schema_1.localizationStrings)
            .where((0, drizzle_orm_1.eq)(schema_1.localizationStrings.localeCode, localeCode));
        // Converter para objeto chave-valor
        const stringMap = {};
        strings.forEach(s => {
            stringMap[s.stringKey] = s.stringValue;
        });
        res.json(stringMap);
    }
    catch (error) {
        console.error('Erro ao buscar strings de localização:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.getLocalizationStrings = getLocalizationStrings;
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
const importStringsFromJson = async (req, res) => {
    try {
        const { localeCode } = req.params;
        // Verificar se o idioma existe
        const locale = await db_1.db.select()
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode))
            .limit(1);
        if (locale.length === 0) {
            return res.status(404).json({ error: 'Idioma não encontrado no sistema' });
        }
        const filePath = path_1.default.join(process.cwd(), 'locales', `${localeCode}.json`);
        if (!fs_1.default.existsSync(filePath)) {
            return res.status(404).json({ error: 'Arquivo de localização não encontrado' });
        }
        const jsonContent = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
        // Converter objeto aninhado para chaves planas
        const flattenObject = (obj, prefix = '') => {
            let result = {};
            for (const key in obj) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    Object.assign(result, flattenObject(obj[key], newKey));
                }
                else {
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
                const existingString = await db_1.db.select()
                    .from(schema_1.localizationStrings)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.localizationStrings.stringKey, key), (0, drizzle_orm_1.eq)(schema_1.localizationStrings.localeCode, localeCode)))
                    .limit(1);
                if (existingString.length > 0) {
                    // Atualizar string existente
                    await db_1.db.update(schema_1.localizationStrings)
                        .set({
                        stringValue: value,
                        updatedAt: new Date()
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.localizationStrings.stringKey, key), (0, drizzle_orm_1.eq)(schema_1.localizationStrings.localeCode, localeCode)));
                    updatedCount++;
                }
                else {
                    // Inserir nova string
                    await db_1.db.insert(schema_1.localizationStrings).values({
                        stringKey: key,
                        localeCode,
                        stringValue: value
                    });
                    importedCount++;
                }
            }
            catch (error) {
                console.warn(`Erro ao processar chave ${key}:`, error);
            }
        }
        res.json({
            message: 'Strings importadas com sucesso',
            imported: importedCount,
            updated: updatedCount,
            total: importedCount + updatedCount
        });
    }
    catch (error) {
        console.error('Erro ao importar strings:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.importStringsFromJson = importStringsFromJson;
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
const getActiveLocales = async (req, res) => {
    try {
        const activeLocales = await db_1.db.select({
            localeCode: schema_1.systemLocalization.localeCode,
            localeName: schema_1.systemLocalization.localeName,
            isDefault: schema_1.systemLocalization.isDefault
        })
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.systemLocalization.isDefault), (0, drizzle_orm_1.asc)(schema_1.systemLocalization.localeName));
        res.json(activeLocales);
    }
    catch (error) {
        console.error('Erro ao buscar idiomas ativos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.getActiveLocales = getActiveLocales;
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
const toggleLanguageStatus = async (req, res) => {
    var _a;
    try {
        const { localeCode } = req.params;
        const { isActive } = req.body;
        // Verificar se o idioma existe
        const existingLocale = await db_1.db.select()
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode))
            .limit(1);
        if (existingLocale.length === 0) {
            return res.status(404).json({ error: 'Idioma não encontrado' });
        }
        // Não permitir desativar o último idioma ativo
        if (!isActive) {
            const activeCount = await db_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
                .from(schema_1.systemLocalization)
                .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true));
            if (((_a = activeCount[0]) === null || _a === void 0 ? void 0 : _a.count) <= 1) {
                return res.status(400).json({ error: 'Não é possível desativar o último idioma ativo' });
            }
        }
        // Atualizar status
        await db_1.db.update(schema_1.systemLocalization)
            .set({
            isActive,
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode));
        // Se estiver desativando e for o padrão, definir outro como padrão
        if (!isActive && existingLocale[0].isDefault) {
            const firstActive = await db_1.db.select()
                .from(schema_1.systemLocalization)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.systemLocalization.isActive, true), (0, drizzle_orm_1.ne)(schema_1.systemLocalization.localeCode, localeCode)))
                .limit(1);
            if (firstActive.length > 0) {
                await db_1.db.update(schema_1.systemLocalization)
                    .set({
                    isDefault: true,
                    updatedAt: new Date()
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, firstActive[0].localeCode));
            }
        }
        res.json({
            message: isActive ? 'Idioma ativado com sucesso' : 'Idioma desativado com sucesso',
            localeCode,
            isActive
        });
    }
    catch (error) {
        console.error('Erro ao atualizar status do idioma:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.toggleLanguageStatus = toggleLanguageStatus;
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
const setDefaultLanguage = async (req, res) => {
    try {
        const { localeCode } = req.params;
        // Verificar se o idioma existe e está ativo
        const existingLocale = await db_1.db.select()
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode))
            .limit(1);
        if (existingLocale.length === 0) {
            return res.status(404).json({ error: 'Idioma não encontrado' });
        }
        // Remover padrão de todos os outros idiomas
        await db_1.db.update(schema_1.systemLocalization)
            .set({
            isDefault: false,
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.ne)(schema_1.systemLocalization.localeCode, localeCode));
        // Definir este como padrão e ativá-lo automaticamente
        await db_1.db.update(schema_1.systemLocalization)
            .set({
            isDefault: true,
            isActive: true,
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode));
        res.json({
            message: 'Idioma padrão definido com sucesso',
            localeCode
        });
    }
    catch (error) {
        console.error('Erro ao definir idioma padrão:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};
exports.setDefaultLanguage = setDefaultLanguage;
