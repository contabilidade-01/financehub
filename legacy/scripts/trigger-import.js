// Trigger locale import via server API
// Using built-in fetch (Node.js 18+)

const serverUrl = 'http://localhost:5000';

// We need to login first to get session auth
async function loginAsAdmin() {
  const response = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'teste@teste.com',
      password: 'admin123' // Replace with actual admin password
    })
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  
  // Extract session cookie
  const setCookie = response.headers.get('set-cookie');
  return setCookie;
}

async function importLocale(localeCode, cookie) {
  const response = await fetch(`${serverUrl}/api/admin/localization/${localeCode}/import`, {
    method: 'POST',
    headers: {
      'Cookie': cookie
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Import failed for ${localeCode}: ${response.status} - ${error}`);
  }
  
  const result = await response.json();
  console.log(`✅ ${localeCode}: ${result.message} (imported: ${result.imported}, updated: ${result.updated})`);
}

async function main() {
  try {
    console.log('🔐 Logging in as admin...');
    const cookie = await loginAsAdmin();
    
    console.log('📥 Importing locales...');
    
    const locales = ['pt-br', 'en-us', 'es-es'];
    
    for (const locale of locales) {
      try {
        await importLocale(locale, cookie);
      } catch (error) {
        console.error(`❌ Error importing ${locale}:`, error.message);
      }
    }
    
    console.log('\n✅ Import completed!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();