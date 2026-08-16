import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obter o diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório contendo os arquivos Swagger
const swaggerDir = path.join(__dirname, 'server', 'swagger');

// Expressão regular para encontrar a configuração de segurança
const securityRegex = /(\s+\*\s+security:\s+\*\s+- cookieAuth:\s+\[\])/g;

// Novo texto de segurança para substituir
const newSecurityText = ' *     security:\n *       - cookieAuth: []\n *       - apiKeyAuth: []';

// Função para processar cada arquivo
function updateSwaggerFile(filePath) {
  try {
    // Ler o conteúdo do arquivo
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar se o padrão existe no arquivo
    if (securityRegex.test(content)) {
      // Substituir todas as ocorrências
      content = content.replace(securityRegex, newSecurityText);
      
      // Gravar o arquivo atualizado
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Atualizado: ${filePath}`);
      return true;
    } else {
      console.log(`Sem correspondência em: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`Erro ao processar ${filePath}:`, error);
    return false;
  }
}

// Ler diretório e processar arquivos
try {
  const files = fs.readdirSync(swaggerDir);
  let updatedCount = 0;
  
  files.forEach(file => {
    // Processar apenas arquivos .ts
    if (file.endsWith('.ts')) {
      const filePath = path.join(swaggerDir, file);
      if (updateSwaggerFile(filePath)) {
        updatedCount++;
      }
    }
  });
  
  console.log(`\nTotal de arquivos processados: ${files.length}`);
  console.log(`Arquivos atualizados: ${updatedCount}`);
} catch (error) {
  console.error('Erro ao ler diretório:', error);
}