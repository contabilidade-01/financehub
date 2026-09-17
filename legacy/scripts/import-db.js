"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Import locales directly using server db connection
const db_1 = require("./server/db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Locales to import
const locales = [
    { code: 'pt-br', name: 'Português Brasil', isDefault: true },
    { code: 'en-us', name: 'English US', isDefault: false },
    { code: 'es-es', name: 'Español España', isDefault: false }
];
// Flatten object function
function flattenObject(obj, prefix = '') {
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
}
async function importLocale(localeCode, localeName, isDefault = false) {
    try {
        console.log(`🌐 Importing locale: ${localeCode} (${localeName})`);
        // 1. Check/create system localization entry
        let locale = await db_1.db.select()
            .from(schema_1.systemLocalization)
            .where((0, drizzle_orm_1.eq)(schema_1.systemLocalization.localeCode, localeCode))
            .limit(1);
        if (locale.length === 0) {
            console.log(`  📝 Creating entry for ${localeCode}`);
            await db_1.db.insert(schema_1.systemLocalization).values({
                localeCode,
                localeName,
                isActive: true,
                isDefault,
                createdBy: 1 // Admin user ID
            });
        }
        else {
            console.log(`  ✅ Entry already exists for ${localeCode}`);
        }
        // 2. Load JSON file
        const filePath = path_1.default.join(process.cwd(), 'locales', `${localeCode}.json`);
        if (!fs_1.default.existsSync(filePath)) {
            console.log(`  ❌ File not found: ${filePath}`);
            return;
        }
        const jsonContent = JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
        const flatStrings = flattenObject(jsonContent);
        console.log(`  📚 ${Object.keys(flatStrings).length} strings found`);
        let importedCount = 0;
        let updatedCount = 0;
        // 3. Insert/update strings in batches for better performance
        const batchSize = 100;
        const entries = Object.entries(flatStrings);
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            for (const [key, value] of batch) {
                try {
                    const existingString = await db_1.db.select()
                        .from(schema_1.localizationStrings)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.localizationStrings.stringKey, key), (0, drizzle_orm_1.eq)(schema_1.localizationStrings.localeCode, localeCode)))
                        .limit(1);
                    if (existingString.length > 0) {
                        // Update existing string
                        await db_1.db.update(schema_1.localizationStrings)
                            .set({
                            stringValue: value,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.localizationStrings.stringKey, key), (0, drizzle_orm_1.eq)(schema_1.localizationStrings.localeCode, localeCode)));
                        updatedCount++;
                    }
                    else {
                        // Insert new string
                        await db_1.db.insert(schema_1.localizationStrings).values({
                            stringKey: key,
                            localeCode,
                            stringValue: value
                        });
                        importedCount++;
                    }
                }
                catch (error) {
                    console.warn(`    ⚠️ Error with key ${key}:`, error.message);
                }
            }
            // Progress indicator
            if (i % (batchSize * 5) === 0) {
                console.log(`    📊 Progress: ${Math.min(i + batchSize, entries.length)}/${entries.length}`);
            }
        }
        console.log(`  ✅ Completed: ${importedCount} new, ${updatedCount} updated`);
    }
    catch (error) {
        console.error(`❌ Error importing ${localeCode}:`, error);
    }
}
async function main() {
    console.log('🚀 Starting locale import...\n');
    try {
        for (const locale of locales) {
            await importLocale(locale.code, locale.name, locale.isDefault);
            console.log('');
        }
        console.log('✅ Import completed successfully!');
    }
    catch (error) {
        console.error('❌ Import error:', error);
    }
    finally {
        process.exit(0);
    }
}
main();
