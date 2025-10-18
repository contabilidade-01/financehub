// verify_localization.js
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class LocalizationVerifier {
  constructor() {
    this.connectionString = process.env.DATABASE_URL;
    if (!this.connectionString) {
      throw new Error("❌ DATABASE_URL não está definida nas variáveis de ambiente");
    }
    this.client = postgres(this.connectionString, { max: 1 });
    this.db = drizzle(this.client);
    this.errors = [];
    this.warnings = [];
  }

  async verifyDatabaseStructure() {
    console.log('🔍 Verificando estrutura do banco de dados...');

    try {
      // 1. Verificar se tabelas existem
      const systemLocalizationExists = await this.db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'system_localization'
        );
      `);

      const localizationStringsExists = await this.db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'localization_strings'
        );
      `);

      if (!systemLocalizationExists[0].exists) {
        this.errors.push('❌ Tabela system_localization não encontrada');
        return false;
      }
      console.log('✅ Tabela system_localization encontrada');

      if (!localizationStringsExists[0].exists) {
        this.errors.push('❌ Tabela localization_strings não encontrada');
        return false;
      }
      console.log('✅ Tabela localization_strings encontrada');

      // 2. Verificar estrutura das colunas
      await this.verifyTableColumns();

      // 3. Verificar triggers e funções
      await this.verifyTriggersAndFunctions();

      // 4. Verificar foreign keys
      await this.verifyForeignKeys();

      // 5. Verificar índices
      await this.verifyIndexes();

      // 6. Verificar dados iniciais
      await this.verifyInitialData();

      return true;

    } catch (error) {
      this.errors.push(`❌ Erro ao verificar estrutura do banco: ${error.message}`);
      return false;
    }
  }

  async verifyTableColumns() {
    console.log('🔍 Verificando colunas das tabelas...');

    // Verificar colunas da system_localization
    const systemLocalizationColumns = await this.db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'system_localization'
      ORDER BY ordinal_position;
    `);

    const expectedSystemColumns = [
      'id', 'locale_code', 'locale_name', 'is_active', 'is_default', 
      'created_at', 'created_by', 'updated_at', 'updated_by'
    ];

    const actualSystemColumns = systemLocalizationColumns.map(col => col.column_name);
    
    for (const expectedCol of expectedSystemColumns) {
      if (!actualSystemColumns.includes(expectedCol)) {
        this.errors.push(`❌ Coluna '${expectedCol}' não encontrada em system_localization`);
      }
    }

    // Verificar colunas da localization_strings
    const localizationStringsColumns = await this.db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'localization_strings'
      ORDER BY ordinal_position;
    `);

    const expectedStringsColumns = [
      'id', 'string_key', 'locale_code', 'string_value', 'string_context', 
      'created_at', 'updated_at'
    ];

    const actualStringsColumns = localizationStringsColumns.map(col => col.column_name);
    
    for (const expectedCol of expectedStringsColumns) {
      if (!actualStringsColumns.includes(expectedCol)) {
        this.errors.push(`❌ Coluna '${expectedCol}' não encontrada em localization_strings`);
      }
    }

    console.log('✅ Verificação de colunas concluída');
  }

  async verifyTriggersAndFunctions() {
    console.log('🔍 Verificando triggers e funções...');

    // Verificar função ensure_single_default_locale
    const functionExists = await this.db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name = 'ensure_single_default_locale'
        AND routine_type = 'FUNCTION'
      );
    `);

    if (!functionExists[0].exists) {
      this.errors.push('❌ Função ensure_single_default_locale não encontrada');
    } else {
      console.log('✅ Função ensure_single_default_locale encontrada');
    }

    // Verificar trigger
    const triggerExists = await this.db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.triggers 
        WHERE trigger_schema = 'public' 
        AND trigger_name = 'trigger_single_default_locale'
      );
    `);

    if (!triggerExists[0].exists) {
      this.errors.push('❌ Trigger trigger_single_default_locale não encontrado');
    } else {
      console.log('✅ Trigger trigger_single_default_locale encontrado');
    }
  }

  async verifyForeignKeys() {
    console.log('🔍 Verificando foreign keys...');

    const foreignKeys = await this.db.execute(sql`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND (tc.table_name = 'system_localization' OR tc.table_name = 'localization_strings');
    `);

    const expectedForeignKeys = [
      'localization_strings_locale_code_fkey',
      'system_localization_created_by_usuarios_id_fk',
      'system_localization_updated_by_usuarios_id_fk'
    ];

    const actualForeignKeys = foreignKeys.map(fk => fk.constraint_name);
    
    for (const expectedFk of expectedForeignKeys) {
      if (!actualForeignKeys.includes(expectedFk)) {
        this.warnings.push(`⚠️  Foreign key '${expectedFk}' não encontrada (opcional)`);
      } else {
        console.log(`✅ Foreign key ${expectedFk} encontrada`);
      }
    }
  }

  async verifyIndexes() {
    console.log('🔍 Verificando índices...');

    const indexes = await this.db.execute(sql`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND (tablename = 'system_localization' OR tablename = 'localization_strings')
      AND indexname NOT LIKE '%_pkey';
    `);

    const expectedIndexes = [
      'idx_localization_strings_key',
      'idx_localization_strings_locale',
      'idx_system_localization_is_default',
      'idx_system_localization_is_active'
    ];

    const actualIndexes = indexes.map(idx => idx.indexname);
    
    for (const expectedIdx of expectedIndexes) {
      if (!actualIndexes.includes(expectedIdx)) {
        this.warnings.push(`⚠️  Índice '${expectedIdx}' não encontrado (recomendado para performance)`);
      } else {
        console.log(`✅ Índice ${expectedIdx} encontrado`);
      }
    }
  }

  async verifyInitialData() {
    console.log('🔍 Verificando dados iniciais...');

    // Verificar se existe pelo menos um idioma padrão
    const defaultLocale = await this.db.execute(sql`
      SELECT locale_code, locale_name, is_active, is_default 
      FROM system_localization 
      WHERE is_default = true AND is_active = true;
    `);

    if (defaultLocale.length === 0) {
      this.errors.push('❌ Nenhum idioma padrão ativo encontrado');
    } else {
      console.log(`✅ Idioma padrão: ${defaultLocale[0].locale_name} (${defaultLocale[0].locale_code})`);
    }

    // Verificar idiomas disponíveis
    const allLocales = await this.db.execute(sql`
      SELECT locale_code, locale_name, is_active 
      FROM system_localization 
      ORDER BY is_default DESC, locale_name;
    `);

    console.log(`📊 Total de idiomas configurados: ${allLocales.length}`);
    allLocales.forEach(locale => {
      const status = locale.is_active ? '🟢' : '🔴';
      console.log(`   ${status} ${locale.locale_name} (${locale.locale_code})`);
    });

    // Verificar strings importadas
    const stringsCount = await this.db.execute(sql`
      SELECT locale_code, COUNT(*) as count 
      FROM localization_strings 
      GROUP BY locale_code 
      ORDER BY count DESC;
    `);

    if (stringsCount.length > 0) {
      console.log('📝 Strings de localização por idioma:');
      stringsCount.forEach(item => {
        console.log(`   ${item.locale_code}: ${item.count} strings`);
      });
    } else {
      this.warnings.push('⚠️  Nenhuma string de localização importada ainda');
    }
  }

  verifyFileStructure() {
    console.log('📁 Verificando estrutura de arquivos...');

    const localesDir = path.resolve(process.cwd(), 'locales');
    
    // Verificar se pasta locales existe
    if (!fs.existsSync(localesDir)) {
      this.errors.push('❌ Pasta locales/ não encontrada');
      return false;
    }
    console.log('✅ Pasta locales/ encontrada');

    // Verificar permissões da pasta
    try {
      const stats = fs.statSync(localesDir);
      const permissions = (stats.mode & parseInt('777', 8)).toString(8);
      if (permissions !== '755') {
        this.warnings.push(`⚠️  Permissões da pasta locales/: ${permissions} (recomendado: 755)`);
      } else {
        console.log('✅ Permissões da pasta locales/ corretas (755)');
      }
    } catch (error) {
      this.warnings.push(`⚠️  Não foi possível verificar permissões: ${error.message}`);
    }

    // Verificar arquivos JSON
    const expectedFiles = ['pt-br.json', 'en-us.json'];
    const foundFiles = [];

    expectedFiles.forEach(filename => {
      const filePath = path.join(localesDir, filename);
      if (fs.existsSync(filePath)) {
        foundFiles.push(filename);
        console.log(`✅ Arquivo ${filename} encontrado`);
        
        // Verificar se o JSON é válido
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          JSON.parse(content);
          console.log(`✅ JSON válido: ${filename}`);
        } catch (error) {
          this.errors.push(`❌ JSON inválido em ${filename}: ${error.message}`);
        }
      } else {
        this.warnings.push(`⚠️  Arquivo ${filename} não encontrado`);
      }
    });

    // Listar arquivos extras
    const allFiles = fs.readdirSync(localesDir).filter(file => file.endsWith('.json'));
    const extraFiles = allFiles.filter(file => !expectedFiles.includes(file));
    
    if (extraFiles.length > 0) {
      console.log('📄 Arquivos adicionais encontrados:');
      extraFiles.forEach(file => {
        console.log(`   ${file}`);
      });
    }

    return foundFiles.length > 0;
  }

  async testLocalizationSystem() {
    console.log('🧪 Testando sistema de localização...');

    try {
      // Teste 1: Inserir idioma temporário
      console.log('🔬 Teste 1: Inserção de idioma temporário...');
      
      await this.db.execute(sql`
        INSERT INTO system_localization (locale_code, locale_name, is_active, is_default) 
        VALUES ('test-test', 'Test Language', false, false)
        ON CONFLICT (locale_code) DO NOTHING
      `);

      // Teste 2: Verificar constraint de idioma único padrão
      console.log('🔬 Teste 2: Verificando constraint de idioma padrão único...');
      
      try {
        await this.db.execute(sql`
          UPDATE system_localization 
          SET is_default = true, is_active = true 
          WHERE locale_code = 'test-test'
        `);
        
        // Verificar se apenas um idioma está como padrão
        const defaultCount = await this.db.execute(sql`
          SELECT COUNT(*) as count 
          FROM system_localization 
          WHERE is_default = true
        `);

        if (defaultCount[0].count > 1) {
          this.errors.push('❌ Trigger não está funcionando: múltiplos idiomas padrão detectados');
        } else {
          console.log('✅ Constraint de idioma padrão único funcionando');
        }

        // Reverter para pt-br como padrão
        await this.db.execute(sql`
          UPDATE system_localization 
          SET is_default = true, is_active = true 
          WHERE locale_code = 'pt-br'
        `);

      } catch (error) {
        this.warnings.push(`⚠️  Erro no teste de constraint: ${error.message}`);
      }

      // Teste 3: Inserir e remover string de teste
      console.log('🔬 Teste 3: Operações CRUD em strings...');
      
      await this.db.execute(sql`
        INSERT INTO localization_strings (string_key, locale_code, string_value)
        VALUES ('test.key', 'pt-br', 'Valor de teste')
        ON CONFLICT (string_key, locale_code) DO UPDATE SET
          string_value = EXCLUDED.string_value
      `);

      const testString = await this.db.execute(sql`
        SELECT * FROM localization_strings 
        WHERE string_key = 'test.key' AND locale_code = 'pt-br'
      `);

      if (testString.length === 0) {
        this.errors.push('❌ Falha ao inserir string de teste');
      } else {
        console.log('✅ Operações CRUD funcionando');
      }

      // Limpeza dos dados de teste
      await this.db.execute(sql`
        DELETE FROM localization_strings 
        WHERE string_key = 'test.key'
      `);

      await this.db.execute(sql`
        DELETE FROM system_localization 
        WHERE locale_code = 'test-test'
      `);

      console.log('🧹 Limpeza de dados de teste concluída');

    } catch (error) {
      this.errors.push(`❌ Erro no teste do sistema: ${error.message}`);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMO DA VERIFICAÇÃO');
    console.log('='.repeat(60));

    if (this.errors.length === 0) {
      console.log('🎉 VERIFICAÇÃO CONCLUÍDA COM SUCESSO!');
      console.log('✅ Sistema de localização está funcionando corretamente');
    } else {
      console.log('❌ VERIFICAÇÃO FALHOU!');
      console.log(`${this.errors.length} erro(s) encontrado(s):`);
      this.errors.forEach(error => console.log(`  ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  ${this.warnings.length} aviso(s):`);
      this.warnings.forEach(warning => console.log(`  ${warning}`));
    }

    console.log('='.repeat(60));
    
    return this.errors.length === 0;
  }

  async cleanup() {
    await this.client.end();
  }
}

// Função principal
async function runVerification() {
  const args = process.argv.slice(2);
  const filesOnly = args.includes('--files-only');
  const fullTest = args.includes('--full-test');

  const verifier = new LocalizationVerifier();

  try {
    let success = true;

    if (filesOnly) {
      console.log('📁 VERIFICAÇÃO DE ARQUIVOS APENAS\n');
      success = verifier.verifyFileStructure();
    } else {
      console.log('🔍 VERIFICAÇÃO COMPLETA DO SISTEMA DE LOCALIZAÇÃO\n');
      
      // Verificar estrutura do banco
      success = await verifier.verifyDatabaseStructure();
      
      // Verificar arquivos
      const filesOk = verifier.verifyFileStructure();
      success = success && filesOk;

      // Testes funcionais (apenas se --full-test)
      if (fullTest && success) {
        await verifier.testLocalizationSystem();
      }
    }

    // Imprimir resumo
    const finalSuccess = verifier.printSummary();
    
    process.exit(finalSuccess ? 0 : 1);

  } catch (error) {
    console.error('❌ Erro fatal na verificação:', error);
    process.exit(1);
  } finally {
    await verifier.cleanup();
  }
}

// Verificar argumentos da linha de comando
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('📚 Script de Verificação de Localização');
  console.log('');
  console.log('Uso:');
  console.log('  node verify_localization.js                 # Verificação completa');
  console.log('  node verify_localization.js --files-only    # Apenas arquivos');
  console.log('  node verify_localization.js --full-test     # Verificação + testes funcionais');
  console.log('');
  console.log('Ou via NPM:');
  console.log('  npm run localization:verify         # Verificação completa');
  console.log('  npm run localization:check-files    # Apenas arquivos');  
  console.log('  npm run localization:test           # Verificação + testes');
  process.exit(0);
}

// Executar verificação
runVerification();