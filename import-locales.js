#!/usr/bin/env node

import { db } from './server/db.ts';
import { systemLocalization, localizationStrings } from './shared/schema.ts';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Locales disponíveis
const locales = [
  { code: 'pt-br', name: 'Português Brasil', isDefault: true },
  { code: 'en-us', name: 'English US', isDefault: false },
  { code: 'es-es', name: 'Español España', isDefault: false }
];

// Função para achatar objeto
function flattenObject(obj, prefix = '') {
  let result = {};
  
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

async function importLocale(localeCode, localeName, isDefault = false) {
  try {
    console.log(`🌐 Importando locale: ${localeCode} (${localeName})`);
    
    // 1. Verificar/criar entrada na tabela systemLocalization
    let locale = await db.select()
      .from(systemLocalization)
      .where(eq(systemLocalization.localeCode, localeCode))
      .limit(1);

    if (locale.length === 0) {
      console.log(`  📝 Criando entrada para ${localeCode}`);
      await db.insert(systemLocalization).values({
        localeCode,
        localeName,
        isActive: true,
        isDefault,
        createdBy: 1 // ID do admin
      });
    } else {
      console.log(`  ✅ Entrada já existe para ${localeCode}`);
    }

    // 2. Carregar arquivo JSON
    const filePath = path.join(__dirname, 'locales', `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ Arquivo não encontrado: ${filePath}`);
      return;
    }

    const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const flatStrings = flattenObject(jsonContent);
    
    console.log(`  📚 ${Object.keys(flatStrings).length} strings encontradas`);

    let importedCount = 0;
    let updatedCount = 0;
    
    // 3. Inserir/atualizar strings
    for (const [key, value] of Object.entries(flatStrings)) {
      try {
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
        console.warn(`    ⚠️ Erro na chave ${key}:`, error.message);
      }
    }

    console.log(`  ✅ Concluído: ${importedCount} novas, ${updatedCount} atualizadas`);
    
  } catch (error) {
    console.error(`❌ Erro ao importar ${localeCode}:`, error);
  }
}

async function main() {
  console.log('🚀 Iniciando importação de locales...\n');
  
  try {
    for (const locale of locales) {
      await importLocale(locale.code, locale.name, locale.isDefault);
      console.log('');
    }
    
    console.log('✅ Importação concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na importação:', error);
  } finally {
    process.exit(0);
  }
}

main();