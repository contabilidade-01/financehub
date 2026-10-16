import { Request, Response } from "express";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { users, wallets, categories, paymentMethods, transactions, apiTokens, reminders, userSessionsAdmin } from "../../shared/schema";
import { execSync } from 'child_process';
import postgres from "postgres";

interface TableInfo {
  name: string;
  exists: boolean;
  recordCount: number;
  indexes: string[];
}

interface DatabaseStatus {
  connected: boolean;
  tables: TableInfo[];
  totalRecords: number;
  migrationStatus: 'pending' | 'running' | 'completed' | 'error';
  lastMigration: string | null;
  errors: string[];
}

// Definir tabelas esperadas no sistema
const EXPECTED_TABLES = [
  { name: 'users', schema: users },
  { name: 'wallets', schema: wallets },
  { name: 'categories', schema: categories },
  { name: 'paymentMethods', schema: paymentMethods },
  { name: 'transactions', schema: transactions },
  { name: 'apiTokens', schema: apiTokens },
  { name: 'reminders', schema: reminders },
  { name: 'userSessionsAdmin', schema: userSessionsAdmin }
];

export async function getDatabaseStatus(req: Request, res: Response) {
  try {
    const status: DatabaseStatus = {
      connected: false,
      tables: [],
      totalRecords: 0,
      migrationStatus: 'pending',
      lastMigration: null,
      errors: []
    };

    // Verificar conexão
    try {
      await db.execute(sql`SELECT 1`);
      status.connected = true;
    } catch (error) {
      status.errors.push(`Erro de conexão: ${error instanceof Error ? error.message : 'Desconhecido'}`);
      return res.json(status);
    }

    // Verificar existência das tabelas
    for (const expectedTable of EXPECTED_TABLES) {
      const tableInfo: TableInfo = {
        name: expectedTable.name,
        exists: false,
        recordCount: 0,
        indexes: []
      };

      try {
        // Verificar se a tabela existe
        const tableExists = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${expectedTable.name}
          )
        `);

        if (tableExists[0]?.exists) {
          tableInfo.exists = true;

          // Contar registros
          const countResult = await db.execute(sql`
            SELECT COUNT(*) as count FROM ${sql.identifier(expectedTable.name)}
          `);
          tableInfo.recordCount = parseInt(countResult[0]?.count || '0');

          // Listar índices
          // postgres-js: db.execute devolve as linhas direto (array), sem `.rows`
          const indexResult: { indexname: string }[] = await db.execute(sql`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = ${expectedTable.name}
            AND schemaname = 'public'
          `);
          tableInfo.indexes = indexResult.map(row => row.indexname);

          status.totalRecords += tableInfo.recordCount;
        }
      } catch (error) {
        status.errors.push(`Erro ao verificar tabela ${expectedTable.name}: ${error instanceof Error ? error.message : 'Desconhecido'}`);
      }

      status.tables.push(tableInfo);
    }

    // Verificar status das migrações
    const allTablesExist = status.tables.every(table => table.exists);
    if (allTablesExist && status.errors.length === 0) {
      status.migrationStatus = 'completed';
      status.lastMigration = new Date().toISOString();
    } else if (status.errors.length > 0) {
      status.migrationStatus = 'error';
    }

    res.json(status);

  } catch (error) {
    console.error('Erro ao obter status do banco:', error);
    res.status(500).json({
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

export async function runMigrations(req: Request, res: Response) {
  try {
    console.log('🔄 Iniciando execução de migrações...');

    // Executar drizzle-kit push
    try {
      const output = execSync('npx drizzle-kit push --force', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 60000 // 60 segundos timeout
      });

      console.log('✅ Migrações executadas com sucesso');
      console.log(output);

      // Verificar se as tabelas foram criadas
      const statusAfterMigration = await verifyTablesIntegrity();

      res.json({
        success: true,
        message: 'Migrações executadas com sucesso',
        output: output,
        tablesCreated: statusAfterMigration.tablesCreated,
        totalRecords: statusAfterMigration.totalRecords
      });

    } catch (migrationError) {
      console.error('❌ Erro durante migração:', migrationError);
      
      res.status(500).json({
        success: false,
        message: 'Erro durante execução das migrações',
        error: migrationError instanceof Error ? migrationError.message : 'Erro desconhecido'
      });
    }

  } catch (error) {
    console.error('Erro na execução de migrações:', error);
    res.status(500).json({
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

export async function verifyDatabase(req: Request, res: Response) {
  try {
    console.log('🔍 Verificando integridade do banco de dados...');
    
    const result = await verifyTablesIntegrity();
    
    res.json({
      success: true,
      message: 'Verificação concluída',
      ...result
    });

  } catch (error) {
    console.error('Erro na verificação do banco:', error);
    res.status(500).json({
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

export async function getAllTables(req: Request, res: Response) {
  try {
    console.log('🔍 Listando todas as tabelas do banco de dados...');
    
    // Buscar todas as tabelas do schema public
    const tablesResult = await db.execute(sql`
      SELECT 
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables = tablesResult.map((row: any) => ({
      name: row.table_name,
      type: row.table_type
    }));

    res.json({
      success: true,
      tables: tables,
      total: tables.length
    });

  } catch (error) {
    console.error('Erro ao listar tabelas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

export async function generateDatabaseDDL(req: Request, res: Response) {
  try {
    console.log('📋 Gerando DDL completo do banco de dados...');
    
    const client = postgres(process.env.DATABASE_URL || '', { prepare: false });
    
    try {
      // 1. Buscar todas as tabelas
      const tablesResult = await client`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;

      let ddl = `-- DDL Completo do Banco de Dados\n`;
      ddl += `-- Gerado em: ${new Date().toISOString()}\n\n`;

      // 2. Para cada tabela, gerar DDL completo
      for (const tableRow of tablesResult) {
        const tableName = tableRow.table_name;
        
        // Buscar estrutura da tabela
        const columnsResult = await client`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
          ORDER BY ordinal_position
        `;

        // Buscar constraints (separadamente para evitar ambiguidade)
        const primaryKeysResult = await client`
          SELECT 
            kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = 'public' 
          AND tc.table_name = ${tableName}
          AND tc.constraint_type = 'PRIMARY KEY'
        `;

        const uniqueKeysResult = await client`
          SELECT 
            tc.constraint_name,
            kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = 'public' 
          AND tc.table_name = ${tableName}
          AND tc.constraint_type = 'UNIQUE'
        `;

        const foreignKeysResult = await client`
          SELECT 
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage ccu 
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_schema = 'public' 
          AND tc.table_name = ${tableName}
          AND tc.constraint_type = 'FOREIGN KEY'
        `;

        // Buscar índices
        const indexesResult = await client`
          SELECT 
            indexname,
            indexdef
          FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename = ${tableName}
        `;

        // Gerar DDL da tabela
        ddl += `-- ========================================\n`;
        ddl += `-- Tabela: ${tableName}\n`;
        ddl += `-- ========================================\n\n`;

        // CREATE TABLE
        ddl += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
        
        const columnDefs = columnsResult.map((col: any) => {
          let def = `  "${col.column_name}" ${col.data_type}`;
          
          if (col.character_maximum_length) {
            def += `(${col.character_maximum_length})`;
          } else if (col.numeric_precision && col.numeric_scale) {
            def += `(${col.numeric_precision},${col.numeric_scale})`;
          }
          
          if (col.is_nullable === 'NO') {
            def += ` NOT NULL`;
          }
          
          if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`;
          }
          
          return def;
        });
        
        ddl += columnDefs.join(',\n');
        ddl += `\n);\n\n`;

        // Adicionar constraints
        if (primaryKeysResult.length > 0) {
          ddl += `-- Primary Key\n`;
          ddl += `ALTER TABLE "${tableName}" ADD CONSTRAINT "${tableName}_pkey" PRIMARY KEY ("${primaryKeysResult[0].column_name}");\n\n`;
        }

        if (foreignKeysResult.length > 0) {
          ddl += `-- Foreign Keys\n`;
          for (const fk of foreignKeysResult) {
            ddl += `ALTER TABLE "${tableName}" ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table_name}" ("${fk.foreign_column_name}");\n`;
          }
          ddl += `\n`;
        }

        if (uniqueKeysResult.length > 0) {
          ddl += `-- Unique Constraints\n`;
          for (const uk of uniqueKeysResult) {
            ddl += `ALTER TABLE "${tableName}" ADD CONSTRAINT "${uk.constraint_name}" UNIQUE ("${uk.column_name}");\n`;
          }
          ddl += `\n`;
        }

        // Adicionar índices
        if (indexesResult.length > 0) {
          ddl += `-- Índices\n`;
          for (const idx of indexesResult) {
            if (!idx.indexname.includes('_pkey') && !idx.indexname.includes('_key')) {
              ddl += `${idx.indexdef};\n`;
            }
          }
          ddl += `\n`;
        }

        // Contar registros (usando query dinâmica segura)
        try {
          const countQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
          const countResult = await client.unsafe(countQuery);
          const recordCount = countResult[0]?.count || 0;
          ddl += `-- Total de registros: ${recordCount}\n`;
        } catch (countError) {
          ddl += `-- Total de registros: Erro ao contar (${countError instanceof Error ? countError.message : 'Desconhecido'})\n`;
        }
        ddl += `\n`;
      }

      await client.end();

      // Configurar headers para download
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="database_ddl_${new Date().toISOString().split('T')[0]}.sql"`);
      
      res.send(ddl);

    } catch (error) {
      await client.end();
      throw error;
    }

  } catch (error) {
    console.error('Erro ao gerar DDL:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

async function verifyTablesIntegrity() {
  const result = {
    tablesCreated: 0,
    tablesTotal: EXPECTED_TABLES.length,
    totalRecords: 0,
    missingTables: [] as string[],
    errors: [] as string[]
  };

  for (const expectedTable of EXPECTED_TABLES) {
    try {
      // Verificar se a tabela existe
      const tableExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${expectedTable.name}
        )
      `);

      if (tableExists[0]?.exists) {
        result.tablesCreated++;

        // Contar registros
        const countResult = await db.execute(sql`
          SELECT COUNT(*) as count FROM ${sql.identifier(expectedTable.name)}
        `);
        result.totalRecords += parseInt(countResult[0]?.count || '0');
      } else {
        result.missingTables.push(expectedTable.name);
      }

    } catch (error) {
      result.errors.push(`Erro ao verificar ${expectedTable.name}: ${error instanceof Error ? error.message : 'Desconhecido'}`);
    }
  }

  return result;
}