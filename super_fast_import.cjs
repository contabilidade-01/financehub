// super_fast_import.cjs - Importação ultra-rápida com transações
const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");
const { sql } = require("drizzle-orm");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function superFastImport(localeCode) {
  console.log(`🚀 SUPER FAST import para: ${localeCode}`);
  
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  try {
    // Verificar se o idioma existe
    const localeExists = await db.execute(sql`
      SELECT EXISTS (SELECT 1 FROM system_localization WHERE locale_code = ${localeCode});
    `);

    if (!localeExists[0].exists) {
      console.error(`❌ Idioma '${localeCode}' não configurado`);
      return;
    }

    // Ler e processar arquivo JSON
    const filePath = path.join(process.cwd(), 'locales', `${localeCode}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo ${localeCode}.json não encontrado`);
      return;
    }

    const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Flatten do objeto
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
    
    console.log(`📊 ${totalKeys} chaves encontradas`);

    // 🚀 IMPORTAÇÃO SUPER RÁPIDA COM TRANSAÇÃO ÚNICA
    console.log('⚡ Iniciando transação única...');
    
    await db.transaction(async (tx) => {
      // Deletar todas as strings existentes
      await tx.execute(sql`DELETE FROM localization_strings WHERE locale_code = ${localeCode}`);
      
      // Preparar valores para inserção em massa
      const entries = Object.entries(flatStrings);
      const values = entries.map(([key, value]) => `('${key.replace(/'/g, "''")}', '${localeCode}', '${value.replace(/'/g, "''")}')`).join(',\n  ');
      
      // Inserção em massa com SQL raw
      await tx.execute(sql.raw(`
        INSERT INTO localization_strings (string_key, locale_code, string_value)
        VALUES ${values}
      `));
      
      console.log(`✅ ${totalKeys} strings inseridas em transação única!`);
    });
    
    console.log(`🎉 ✅ ${localeCode} importado com sucesso!`);
    
  } catch (error) {
    console.error(`❌ Erro em ${localeCode}:`, error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Executar
const args = process.argv.slice(2);

if (args[0] === 'all') {
  (async () => {
    try {
      console.log('🌍 SUPER FAST import - TODOS os idiomas...');
      
      await superFastImport('pt-br');
      await superFastImport('en-us'); 
      await superFastImport('es-es');
      
      console.log('🎉 🚀 ✅ IMPORTAÇÃO COMPLETA FINALIZADA!');
    } catch (error) {
      console.error('❌ Falha:', error.message);
      process.exit(1);
    }
  })();
} else if (args[0]) {
  superFastImport(args[0]).catch((error) => {
    console.error('❌ Falha:', error.message);
    process.exit(1);
  });
} else {
  console.log('Uso: node super_fast_import.cjs <locale|all>');
  console.log('Ex: node super_fast_import.cjs all');
}