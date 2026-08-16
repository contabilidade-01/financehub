// Import locales directly using server db connection
import { db } from './server/db';
import { systemLocalization, localizationStrings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

// Locales to import
const locales = [
  { code: 'pt-br', name: 'Português Brasil', isDefault: true },
  { code: 'en-us', name: 'English US', isDefault: false },
  { code: 'es-es', name: 'Español España', isDefault: false }
];

// Flatten object function
function flattenObject(obj: any, prefix = ''): Record<string, string> {
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
}

async function importLocale(localeCode: string, localeName: string, isDefault = false) {
  try {
    console.log(`🌐 Importing locale: ${localeCode} (${localeName})`);
    
    // 1. Check/create system localization entry
    let locale = await db.select()
      .from(systemLocalization)
      .where(eq(systemLocalization.localeCode, localeCode))
      .limit(1);

    if (locale.length === 0) {
      console.log(`  📝 Creating entry for ${localeCode}`);
      await db.insert(systemLocalization).values({
        localeCode,
        localeName,
        isActive: true,
        isDefault,
        createdBy: 1 // Admin user ID
      });
    } else {
      console.log(`  ✅ Entry already exists for ${localeCode}`);
    }

    // 2. Load JSON file
    const filePath = path.join(process.cwd(), 'locales', `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ File not found: ${filePath}`);
      return;
    }

    const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
          const existingString = await db.select()
            .from(localizationStrings)
            .where(and(
              eq(localizationStrings.stringKey, key),
              eq(localizationStrings.localeCode, localeCode)
            ))
            .limit(1);

          if (existingString.length > 0) {
            // Update existing string
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
            // Insert new string
            await db.insert(localizationStrings).values({
              stringKey: key,
              localeCode,
              stringValue: value
            });
            importedCount++;
          }
        } catch (error) {
          console.warn(`    ⚠️ Error with key ${key}:`, (error as Error).message);
        }
      }
      
      // Progress indicator
      if (i % (batchSize * 5) === 0) {
        console.log(`    📊 Progress: ${Math.min(i + batchSize, entries.length)}/${entries.length}`);
      }
    }

    console.log(`  ✅ Completed: ${importedCount} new, ${updatedCount} updated`);
    
  } catch (error) {
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
  } catch (error) {
    console.error('❌ Import error:', error);
  } finally {
    process.exit(0);
  }
}

main();