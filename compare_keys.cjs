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

function loadKeys(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(content);
    return flattenObject(jsonData);
  } catch (error) {
    console.error(`Erro ao processar ${filePath}:`, error.message);
    return {};
  }
}

console.log('🔍 Comparando chaves entre idiomas...\n');

// Carregar todas as chaves
const enKeys = loadKeys(path.join(__dirname, 'locales', 'en-us.json'));
const esKeys = loadKeys(path.join(__dirname, 'locales', 'es-es.json'));
const ptKeys = loadKeys(path.join(__dirname, 'locales', 'pt-br.json'));

const enKeysList = Object.keys(enKeys);
const esKeysList = Object.keys(esKeys);
const ptKeysList = Object.keys(ptKeys);

console.log(`📊 EN-US (BASE): ${enKeysList.length} chaves`);
console.log(`📊 ES-ES: ${esKeysList.length} chaves`);
console.log(`📊 PT-BR: ${ptKeysList.length} chaves\n`);

// Encontrar chaves faltantes em ES-ES
const missingInEs = enKeysList.filter(key => !esKeysList.includes(key));
console.log(`❌ Chaves faltantes em ES-ES (${missingInEs.length}):`);
missingInEs.forEach(key => console.log(`  - ${key}: "${enKeys[key]}"`));

console.log('\n' + '='.repeat(60) + '\n');

// Encontrar chaves faltantes em PT-BR  
const missingInPt = enKeysList.filter(key => !ptKeysList.includes(key));
console.log(`❌ Chaves faltantes em PT-BR (${missingInPt.length}):`);
missingInPt.forEach(key => console.log(`  - ${key}: "${enKeys[key]}"`));

console.log('\n' + '='.repeat(60) + '\n');

// Salvar resultado em arquivo para referência
const results = {
  base: 'en-us',
  baseKeyCount: enKeysList.length,
  missingInEs: {
    count: missingInEs.length,
    keys: missingInEs.map(key => ({ key, enValue: enKeys[key] }))
  },
  missingInPt: {
    count: missingInPt.length,
    keys: missingInPt.map(key => ({ key, enValue: enKeys[key] }))
  }
};

fs.writeFileSync('missing_keys_analysis.json', JSON.stringify(results, null, 2));
console.log('💾 Análise salva em: missing_keys_analysis.json');
console.log('\n🎯 Próximo passo: Equalizar todos os idiomas com base no EN-US');