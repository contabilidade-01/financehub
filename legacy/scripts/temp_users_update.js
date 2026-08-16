// Script to update admin users page with registration date column
const fs = require('fs');

const filePath = 'client/src/pages/admin/users.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Replace all occurrences of the user info pattern with the updated version that includes registration date
const updatedContent = content.replace(
  /(\s+)<p className="text-sm text-gray-400">\s*\{user\.email\} • \{user\.transactionCount\} transações • Último acesso: \{formatLastAccess\(user\.lastAccess\)\}\s*<\/p>/g,
  `$1<p className="text-sm text-gray-400">
$1  {user.email} • {user.transactionCount} transações
$1</p>
$1<p className="text-xs text-gray-500">
$1  Cadastro: {new Date(user.data_cadastro).toLocaleDateString('pt-BR')} • Último acesso: {formatLastAccess(user.lastAccess)}
$1</p>`
);

fs.writeFileSync(filePath, updatedContent);
console.log('Admin users page updated with registration date column');