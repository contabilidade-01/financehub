const fs = require('fs');
const path = require('path');

function flattenObject(obj, prefix = '') {
  let flattened = {};
  
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }
  
  return flattened;
}

function countKeys(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(content);
    const flattened = flattenObject(jsonData);
    return Object.keys(flattened).length;
  } catch (error) {
    console.error(`Erro ao processar ${filePath}:`, error.message);
    return 0;
  }
}

const locales = ['pt-br', 'en-us', 'es-es'];
const results = [];

console.log('🔍 Contando chaves em cada arquivo de idioma...\n');

for (const locale of locales) {
  const filePath = path.join(__dirname, 'locales', `${locale}.json`);
  const keyCount = countKeys(filePath);
  results.push({ locale, keyCount, filePath });
  
  console.log(`📄 ${locale.toUpperCase()}: ${keyCount} chaves`);
}

console.log('\n📊 RESUMO:');
const sortedResults = results.sort((a, b) => b.keyCount - a.keyCount);

sortedResults.forEach((result, index) => {
  const status = index === 0 ? '👑 MAIOR (BASE)' : `❌ Faltam ${sortedResults[0].keyCount - result.keyCount} chaves`;
  console.log(`${index + 1}. ${result.locale.toUpperCase()}: ${result.keyCount} chaves - ${status}`);
});

console.log(`\n🎯 IDIOMA BASE: ${sortedResults[0].locale.toUpperCase()} com ${sortedResults[0].keyCount} chaves`);