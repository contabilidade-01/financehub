// migrate_localization.js
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function migrateLocalization() {
  console.log('🌐 Iniciando migração do sistema de localização...');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("❌ DATABASE_URL não está definida nas variáveis de ambiente");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    // ETAPA 1: Criar pasta locales com permissões corretas
    console.log('📁 Criando estrutura de pastas para localização...');
    
    const localesDir = path.resolve(process.cwd(), 'locales');
    
    // Criar diretório locales se não existir
    if (!fs.existsSync(localesDir)) {
      fs.mkdirSync(localesDir, { recursive: true, mode: 0o755 });
      console.log(`✅ Pasta criada: ${localesDir}`);
    } else {
      // Garantir permissões corretas mesmo se a pasta já existe
      fs.chmodSync(localesDir, 0o755);
      console.log(`✅ Permissões ajustadas: ${localesDir}`);
    }

    // ETAPA 2: Verificar se a tabela system_localization já existe
    console.log('🔍 Verificando estrutura existente...');
    
    const systemLocalizationExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_localization'
      );
    `);

    if (!systemLocalizationExists[0].exists) {
      console.log('📋 Criando tabela system_localization...');
      await db.execute(sql`
        CREATE TABLE system_localization (
          id SERIAL PRIMARY KEY,
          locale_code VARCHAR(10) NOT NULL UNIQUE,
          locale_name VARCHAR(100) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT false,
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          created_by INTEGER,
          updated_at TIMESTAMPTZ,
          updated_by INTEGER,
          
          CONSTRAINT unique_default_locale CHECK (
            (is_default = true AND is_active = true) OR is_default = false
          )
        );
      `);
      console.log('✅ Tabela system_localization criada!');
    } else {
      console.log('✅ Tabela system_localization já existe.');
    }

    // ETAPA 3: Verificar se a tabela localization_strings já existe
    const localizationStringsExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'localization_strings'
      );
    `);

    if (!localizationStringsExists[0].exists) {
      console.log('📋 Criando tabela localization_strings...');
      await db.execute(sql`
        CREATE TABLE localization_strings (
          id SERIAL PRIMARY KEY,
          string_key VARCHAR(255) NOT NULL,
          locale_code VARCHAR(10) NOT NULL,
          string_value TEXT NOT NULL,
          string_context VARCHAR(500),
          created_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at TIMESTAMPTZ,
          
          CONSTRAINT localization_strings_locale_code_fkey 
            FOREIGN KEY (locale_code) REFERENCES system_localization(locale_code) ON DELETE CASCADE,
          CONSTRAINT localization_strings_unique_key_locale UNIQUE(string_key, locale_code)
        );
      `);
      console.log('✅ Tabela localization_strings criada!');
    } else {
      console.log('✅ Tabela localization_strings já existe.');
    }

    // ETAPA 4: Criar foreign key para created_by e updated_by (com verificação)
    try {
      console.log('🔗 Verificando foreign keys...');
      
      // Verificar se FK para created_by existe
      const createdByFkExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE table_schema = 'public' 
          AND table_name = 'system_localization'
          AND constraint_name = 'system_localization_created_by_usuarios_id_fk'
        );
      `);

      if (!createdByFkExists[0].exists) {
        await db.execute(sql`
          ALTER TABLE system_localization 
          ADD CONSTRAINT system_localization_created_by_usuarios_id_fk 
          FOREIGN KEY (created_by) REFERENCES usuarios(id);
        `);
        console.log('✅ FK created_by adicionada!');
      }

      // Verificar se FK para updated_by existe
      const updatedByFkExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE table_schema = 'public' 
          AND table_name = 'system_localization'
          AND constraint_name = 'system_localization_updated_by_usuarios_id_fk'
        );
      `);

      if (!updatedByFkExists[0].exists) {
        await db.execute(sql`
          ALTER TABLE system_localization 
          ADD CONSTRAINT system_localization_updated_by_usuarios_id_fk 
          FOREIGN KEY (updated_by) REFERENCES usuarios(id);
        `);
        console.log('✅ FK updated_by adicionada!');
      }
    } catch (error) {
      console.log('⚠️  Aviso: Erro ao criar foreign keys (podem já existir):', error.message);
    }

    // ETAPA 5: Criar função e trigger para garantir apenas um idioma padrão
    console.log('🔧 Criando função e trigger para idioma único...');
    
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION ensure_single_default_locale()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.is_default = true THEN
          UPDATE system_localization 
          SET is_default = false 
          WHERE id != NEW.id AND is_default = true;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Remover trigger se já existir e recriar
    await db.execute(sql`
      DROP TRIGGER IF EXISTS trigger_single_default_locale ON system_localization;
    `);

    await db.execute(sql`
      CREATE TRIGGER trigger_single_default_locale
        BEFORE INSERT OR UPDATE ON system_localization
        FOR EACH ROW
        EXECUTE FUNCTION ensure_single_default_locale();
    `);
    console.log('✅ Trigger criado!');

    // ETAPA 6: Criar índices para performance (com verificação)
    console.log('📊 Criando índices...');
    
    const indexes = [
      {
        name: 'idx_localization_strings_key',
        sql: 'CREATE INDEX IF NOT EXISTS idx_localization_strings_key ON localization_strings(string_key);'
      },
      {
        name: 'idx_localization_strings_locale',
        sql: 'CREATE INDEX IF NOT EXISTS idx_localization_strings_locale ON localization_strings(locale_code);'
      },
      {
        name: 'idx_system_localization_is_default',
        sql: 'CREATE INDEX IF NOT EXISTS idx_system_localization_is_default ON system_localization(is_default);'
      },
      {
        name: 'idx_system_localization_is_active',
        sql: 'CREATE INDEX IF NOT EXISTS idx_system_localization_is_active ON system_localization(is_active);'
      }
    ];

    for (const index of indexes) {
      await db.execute(sql.raw(index.sql));
      console.log(`✅ Índice ${index.name} criado!`);
    }

    // ETAPA 7: Inserir idiomas iniciais (com verificação)
    console.log('🌐 Inserindo idiomas iniciais...');
    
    const initialLocales = [
      { code: 'pt-br', name: 'Português Brasil', active: true, default: true },
      { code: 'en-us', name: 'English US', active: false, default: false },
      { code: 'es-es', name: 'Español España', active: false, default: false }
    ];

    for (const locale of initialLocales) {
      await db.execute(sql`
        INSERT INTO system_localization (locale_code, locale_name, is_active, is_default) 
        VALUES (${locale.code}, ${locale.name}, ${locale.active}, ${locale.default})
        ON CONFLICT (locale_code) DO NOTHING
      `);
      console.log(`✅ Idioma ${locale.name} inserido/verificado!`);
    }

    // ETAPA 8: Criar arquivos JSON iniciais se não existirem
    console.log('📄 Criando arquivos JSON de localização...');
    
    const defaultJsonFiles = [
      {
        filename: 'pt-br.json',
        content: {
          common: {
            loading: "Carregando...",
            save: "Salvar",
            cancel: "Cancelar",
            delete: "Excluir",
            edit: "Editar",
            create: "Criar",
            update: "Atualizar"
          },
          navigation: {
            dashboard: "Dashboard",
            transactions: "Transações",
            categories: "Categorias",
            wallets: "Carteiras",
            reports: "Relatórios",
            settings: "Configurações",
            admin: "Administração",
            logout: "Sair"
          },
          dashboard: {
            title: "Dashboard",
            overview: "Visão Geral",
            totalBalance: "Saldo Total",
            monthlyIncome: "Receita Mensal",
            monthlyExpenses: "Despesas Mensais",
            welcomeMessage: "Bem-vindo ao seu controle financeiro!"
          },
          admin: {
            title: "Administração",
            access: {
              denied: "Acesso negado. Apenas super administradores podem acessar esta área."
            },
            localization: {
              title: "Gerenciamento de Localização",
              selector: {
                label: "Idioma do Sistema",
                placeholder: "Selecione um idioma"
              }
            }
          }
        }
      },
      {
        filename: 'en-us.json',
        content: {
          common: {
            loading: "Loading...",
            save: "Save",
            cancel: "Cancel",
            delete: "Delete",
            edit: "Edit",
            create: "Create",
            update: "Update"
          },
          navigation: {
            dashboard: "Dashboard",
            transactions: "Transactions",
            categories: "Categories",
            wallets: "Wallets",
            reports: "Reports",
            settings: "Settings",
            admin: "Administration",
            logout: "Logout"
          },
          dashboard: {
            title: "Dashboard",
            overview: "Overview",
            totalBalance: "Total Balance",
            monthlyIncome: "Monthly Income",
            monthlyExpenses: "Monthly Expenses",
            welcomeMessage: "Welcome to your financial control!"
          },
          admin: {
            title: "Administration",
            access: {
              denied: "Access denied. Only super administrators can access this area."
            },
            localization: {
              title: "Localization Management",
              selector: {
                label: "System Language",
                placeholder: "Select a language"
              }
            }
          }
        }
      }
    ];

    for (const file of defaultJsonFiles) {
      const filePath = path.join(localesDir, file.filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(file.content, null, 2), 'utf8');
        console.log(`✅ Arquivo ${file.filename} criado!`);
      } else {
        console.log(`✅ Arquivo ${file.filename} já existe.`);
      }
    }

    // ETAPA 9: Importar strings do pt-br.json se existir
    console.log('📥 Importando strings iniciais...');
    
    const ptBrPath = path.join(localesDir, 'pt-br.json');
    if (fs.existsSync(ptBrPath)) {
      const ptBrStrings = JSON.parse(fs.readFileSync(ptBrPath, 'utf8'));
      
      const flattenObject = (obj, prefix = '') => {
        let result = {};
        for (const key in obj) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            Object.assign(result, flattenObject(obj[key], newKey));
          } else {
            result[newKey] = String(obj[key]);
          }
        }
        return result;
      };

      const flatStrings = flattenObject(ptBrStrings);
      let importedCount = 0;
      
      for (const [key, value] of Object.entries(flatStrings)) {
        await db.execute(sql`
          INSERT INTO localization_strings (string_key, locale_code, string_value)
          VALUES (${key}, 'pt-br', ${value})
          ON CONFLICT (string_key, locale_code) DO UPDATE SET
            string_value = EXCLUDED.string_value,
            updated_at = CURRENT_TIMESTAMP
        `);
        importedCount++;
      }
      
      console.log(`✅ Importadas ${importedCount} strings para pt-br`);
    }

    console.log('🎉 Migração de localização concluída com sucesso!');
    console.log('📋 Resumo:');
    console.log('   - Tabelas criadas: system_localization, localization_strings');
    console.log('   - Pasta locales/ criada com permissões 755');
    console.log('   - Arquivos JSON iniciais criados');
    console.log('   - Idiomas configurados: pt-br (padrão), en-us, es-es');
    console.log('');
    console.log('🔧 Próximos passos:');
    console.log('   1. Implementar os controllers de localização');
    console.log('   2. Adicionar rotas de administração');
    console.log('   3. Criar componentes React de localização');
    console.log('   4. Substituir strings hardcoded por traduções');
    
  } catch (error) {
    console.error('❌ Erro na migração de localização:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Detecta se está sendo executado diretamente
const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;

if (isDirectExecution) {
  (async () => {
    try {
      await migrateLocalization();
      console.log('✅ Script de migração executado com sucesso!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Falha na migração:', error);
      process.exit(1);
    }
  })();
}

// Exportar para uso em outros módulos
export { migrateLocalization };