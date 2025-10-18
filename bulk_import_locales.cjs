// bulk_import_locales.js - Importação completa e eficiente
const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");
const { sql } = require("drizzle-orm");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function bulkImportLocale(localeCode) {
  console.log(`🌐 Importação BULK para idioma: ${localeCode}`);
  
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
      return;
    }

    // Verificar se o arquivo JSON existe
    const localesDir = path.resolve(process.cwd(), 'locales');
    const filePath = path.join(localesDir, `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo ${localeCode}.json não encontrado em: ${filePath}`);
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

    // 🚀 IMPORTAÇÃO BULK EFICIENTE
    console.log('🔥 Iniciando importação BULK...');
    
    // Primeiro, deletar todas as strings existentes para este idioma
    console.log(`🗑️  Limpando strings existentes para ${localeCode}...`);
    await db.execute(sql`
      DELETE FROM localization_strings WHERE locale_code = ${localeCode}
    `);
    
    // Preparar dados para inserção em lotes
    const entries = Object.entries(flatStrings);
    const batchSize = 50; // Inserir 50 por vez para ser mais seguro
    
    console.log(`📦 Inserindo em lotes de ${batchSize}...`);
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      // Inserir um por um no lote (mais seguro)
      for (const [key, value] of batch) {
        try {
          await db.execute(sql`
            INSERT INTO localization_strings (string_key, locale_code, string_value)
            VALUES (${key}, ${localeCode}, ${value})
            ON CONFLICT (string_key, locale_code) 
            DO UPDATE SET string_value = EXCLUDED.string_value, updated_at = CURRENT_TIMESTAMP
          `);
        } catch (error) {
          console.warn(`⚠️  Erro ao inserir ${key}: ${error.message}`);
        }
      }
      
      console.log(`   ✅ Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)} - ${batch.length} strings`);
    }
    
    console.log('🎉 Importação BULK concluída!');
    console.log('📊 Resumo:');
    console.log(`   - Total importado: ${totalKeys} strings`);
    console.log(`   - Idioma: ${localeCode}`);
    
  } catch (error) {
    console.error('❌ Erro na importação BULK:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Verificar argumentos da linha de comando
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('📚 Script de Importação BULK de Localização');
  console.log('');
  console.log('Uso:');
  console.log('  node bulk_import_locales.js <codigo-idioma>    # Importar idioma específico');
  console.log('  node bulk_import_locales.js all                # Importar todos os idiomas');
  console.log('');
  console.log('Exemplos:');
  console.log('  node bulk_import_locales.js pt-br');
  console.log('  node bulk_import_locales.js en-us');
  console.log('  node bulk_import_locales.js es-es');
  console.log('  node bulk_import_locales.js all');
  process.exit(0);
}

if (args[0] === 'all') {
  // Importar todos os idiomas
  (async () => {
    try {
      console.log('🌍 Importando TODOS os idiomas...');
      await bulkImportLocale('pt-br');
      await bulkImportLocale('en-us'); 
      await bulkImportLocale('es-es');
      console.log('🎉 ✅ TODOS os idiomas importados com sucesso!');
    } catch (error) {
      console.error('❌ Falha na importação completa:', error);
      process.exit(1);
    }
  })();
} else {
  const locale = args[0];
  if (!/^[a-z]{2}-[a-z]{2}$/.test(locale)) {
    console.error('❌ Formato de código de idioma inválido');
    console.log('💡 Use o formato: xx-yy (ex: pt-br, en-us, es-es)');
    process.exit(1);
  }
  
  bulkImportLocale(locale).catch((error) => {
    console.error('❌ Falha na importação:', error);
    process.exit(1);
  });
}