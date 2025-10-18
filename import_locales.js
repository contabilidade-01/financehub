// import_locales.js
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function importLocaleStrings(localeCode) {
  console.log(`🌐 Importando strings para idioma: ${localeCode}`);
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("❌ DATABASE_URL não está definida nas variáveis de ambiente");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    // Verificar se o idioma existe no sistema
    const localeExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM system_localization 
        WHERE locale_code = ${localeCode}
      );
    `);

    if (!localeExists[0].exists) {
      console.error(`❌ Idioma '${localeCode}' não está configurado no sistema`);
      console.log('💡 Execute primeiro: npm run migrate:localization');
      console.log('💡 Ou adicione o idioma via painel administrativo');
      return;
    }

    // Verificar se o arquivo JSON existe
    const localesDir = path.resolve(process.cwd(), 'locales');
    const filePath = path.join(localesDir, `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo ${localeCode}.json não encontrado em: ${filePath}`);
      console.log('💡 Crie o arquivo de tradução primeiro ou verifique o nome do arquivo');
      return;
    }

    console.log(`📄 Lendo arquivo: ${filePath}`);
    
    let jsonContent;
    try {
      jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`❌ Erro ao parsear JSON: ${error.message}`);
      return;
    }
    
    // Função para converter objeto aninhado em chaves planas
    const flattenObject = (obj, prefix = '') => {
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
    };

    const flatStrings = flattenObject(jsonContent);
    const totalKeys = Object.keys(flatStrings).length;
    
    if (totalKeys === 0) {
      console.warn('⚠️  Nenhuma string encontrada no arquivo JSON');
      return;
    }

    console.log(`📊 Total de chaves encontradas: ${totalKeys}`);
    console.log('📥 Iniciando importação...');
    
    let importedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const [key, value] of Object.entries(flatStrings)) {
      try {
        // Verificar se a chave já existe
        const existingString = await db.execute(sql`
          SELECT id FROM localization_strings 
          WHERE string_key = ${key} AND locale_code = ${localeCode}
        `);

        if (existingString.length > 0) {
          // Atualizar string existente
          await db.execute(sql`
            UPDATE localization_strings 
            SET string_value = ${value}, updated_at = CURRENT_TIMESTAMP 
            WHERE string_key = ${key} AND locale_code = ${localeCode}
          `);
          updatedCount++;
        } else {
          // Inserir nova string
          await db.execute(sql`
            INSERT INTO localization_strings (string_key, locale_code, string_value)
            VALUES (${key}, ${localeCode}, ${value})
          `);
          importedCount++;
        }
      } catch (error) {
        console.warn(`⚠️  Erro ao processar chave '${key}': ${error.message}`);
        errorCount++;
      }
    }
    
    console.log('🎉 Importação concluída!');
    console.log('📊 Resumo:');
    console.log(`   - Strings novas: ${importedCount}`);
    console.log(`   - Strings atualizadas: ${updatedCount}`);
    console.log(`   - Erros: ${errorCount}`);
    console.log(`   - Total processado: ${importedCount + updatedCount}`);
    
    if (errorCount > 0) {
      console.log('⚠️  Algumas strings não puderam ser importadas. Verifique os warnings acima.');
    }
    
  } catch (error) {
    console.error('❌ Erro na importação:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function listAvailableLocales() {
  console.log('📋 Idiomas disponíveis para importação:');
  
  const localesDir = path.resolve(process.cwd(), 'locales');
  
  if (!fs.existsSync(localesDir)) {
    console.log('❌ Pasta locales/ não encontrada');
    console.log('💡 Execute: npm run migrate:localization');
    return;
  }

  const files = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));

  if (files.length === 0) {
    console.log('❌ Nenhum arquivo de localização encontrado em locales/');
    return;
  }

  files.forEach((locale, index) => {
    console.log(`   ${index + 1}. ${locale}`);
  });
  
  console.log('');
  console.log('💡 Use: npm run import:locale <codigo-idioma>');
  console.log('💡 Exemplo: npm run import:locale pt-br');
}

// Verificar argumentos da linha de comando
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('📚 Script de Importação de Localização');
  console.log('');
  console.log('Uso:');
  console.log('  node import_locales.js <codigo-idioma>    # Importar idioma específico');
  console.log('  node import_locales.js --list             # Listar idiomas disponíveis');
  console.log('');
  console.log('Exemplos:');
  console.log('  node import_locales.js pt-br');
  console.log('  node import_locales.js en-us');
  console.log('  node import_locales.js es-es');
  process.exit(0);
}

if (args[0] === '--list' || args[0] === '-l') {
  listAvailableLocales().catch(console.error);
} else {
  const locale = args[0];
  if (!/^[a-z]{2}-[a-z]{2}$/.test(locale)) {
    console.error('❌ Formato de código de idioma inválido');
    console.log('💡 Use o formato: xx-yy (ex: pt-br, en-us, es-es)');
    process.exit(1);
  }
  
  importLocaleStrings(locale).catch((error) => {
    console.error('❌ Falha na importação:', error);
    process.exit(1);
  });
}