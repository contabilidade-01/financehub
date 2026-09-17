"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabaseStatus = getDatabaseStatus;
exports.runMigrations = runMigrations;
exports.verifyDatabase = verifyDatabase;
exports.getAllTables = getAllTables;
exports.generateDatabaseDDL = generateDatabaseDDL;
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../shared/schema");
const child_process_1 = require("child_process");
const postgres_1 = __importDefault(require("postgres"));
// Definir tabelas esperadas no sistema
const EXPECTED_TABLES = [
    { name: 'users', schema: schema_1.users },
    { name: 'wallets', schema: schema_1.wallets },
    { name: 'categories', schema: schema_1.categories },
    { name: 'paymentMethods', schema: schema_1.paymentMethods },
    { name: 'transactions', schema: schema_1.transactions },
    { name: 'apiTokens', schema: schema_1.apiTokens },
    { name: 'reminders', schema: schema_1.reminders },
    { name: 'userSessionsAdmin', schema: schema_1.userSessionsAdmin }
];
async function getDatabaseStatus(req, res) {
    var _a, _b;
    try {
        const status = {
            connected: false,
            tables: [],
            totalRecords: 0,
            migrationStatus: 'pending',
            lastMigration: null,
            errors: []
        };
        // Verificar conexão
        try {
            await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1`);
            status.connected = true;
        }
        catch (error) {
            status.errors.push(`Erro de conexão: ${error instanceof Error ? error.message : 'Desconhecido'}`);
            return res.json(status);
        }
        // Verificar existência das tabelas
        for (const expectedTable of EXPECTED_TABLES) {
            const tableInfo = {
                name: expectedTable.name,
                exists: false,
                recordCount: 0,
                indexes: []
            };
            try {
                // Verificar se a tabela existe
                const tableExists = await db_1.db.execute((0, drizzle_orm_1.sql) `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${expectedTable.name}
          )
        `);
                if ((_a = tableExists[0]) === null || _a === void 0 ? void 0 : _a.exists) {
                    tableInfo.exists = true;
                    // Contar registros
                    const countResult = await db_1.db.execute((0, drizzle_orm_1.sql) `
            SELECT COUNT(*) as count FROM ${drizzle_orm_1.sql.identifier(expectedTable.name)}
          `);
                    tableInfo.recordCount = parseInt(((_b = countResult[0]) === null || _b === void 0 ? void 0 : _b.count) || '0');
                    // Listar índices
                    const indexResult = await db_1.db.execute((0, drizzle_orm_1.sql) `
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = ${expectedTable.name}
            AND schemaname = 'public'
          `);
                    tableInfo.indexes = indexResult.rows.map(row => row.indexname);
                    status.totalRecords += tableInfo.recordCount;
                }
            }
            catch (error) {
                status.errors.push(`Erro ao verificar tabela ${expectedTable.name}: ${error instanceof Error ? error.message : 'Desconhecido'}`);
            }
            status.tables.push(tableInfo);
        }
        // Verificar status das migrações
        const allTablesExist = status.tables.every(table => table.exists);
        if (allTablesExist && status.errors.length === 0) {
            status.migrationStatus = 'completed';
            status.lastMigration = new Date().toISOString();
        }
        else if (status.errors.length > 0) {
            status.migrationStatus = 'error';
        }
        res.json(status);
    }
    catch (error) {
        console.error('Erro ao obter status do banco:', error);
        res.status(500).json({
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
}
async function runMigrations(req, res) {
    try {
        console.log('🔄 Iniciando execução de migrações...');
        // Executar drizzle-kit push
        try {
            const output = (0, child_process_1.execSync)('npx drizzle-kit push --force', {
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
        }
        catch (migrationError) {
            console.error('❌ Erro durante migração:', migrationError);
            res.status(500).json({
                success: false,
                message: 'Erro durante execução das migrações',
                error: migrationError instanceof Error ? migrationError.message : 'Erro desconhecido'
            });
        }
    }
    catch (error) {
        console.error('Erro na execução de migrações:', error);
        res.status(500).json({
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
}
async function verifyDatabase(req, res) {
    try {
        console.log('🔍 Verificando integridade do banco de dados...');
        const result = await verifyTablesIntegrity();
        res.json(Object.assign({ success: true, message: 'Verificação concluída' }, result));
    }
    catch (error) {
        console.error('Erro na verificação do banco:', error);
        res.status(500).json({
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
}
async function getAllTables(req, res) {
    try {
        console.log('🔍 Listando todas as tabelas do banco de dados...');
        // Buscar todas as tabelas do schema public
        const tablesResult = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT 
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
        const tables = tablesResult.map((row) => ({
            name: row.table_name,
            type: row.table_type
        }));
        res.json({
            success: true,
            tables: tables,
            total: tables.length
        });
    }
    catch (error) {
        console.error('Erro ao listar tabelas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
}
async function generateDatabaseDDL(req, res) {
    var _a;
    try {
        console.log('📋 Gerando DDL completo do banco de dados...');
        const client = (0, postgres_1.default)(process.env.DATABASE_URL || '', { prepare: false });
        try {
            // 1. Buscar todas as tabelas
            const tablesResult = await client `
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
                const columnsResult = await client `
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
                const primaryKeysResult = await client `
          SELECT 
            kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = 'public' 
          AND tc.table_name = ${tableName}
          AND tc.constraint_type = 'PRIMARY KEY'
        `;
                const uniqueKeysResult = await client `
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
                const foreignKeysResult = await client `
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
                const indexesResult = await client `
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
                const columnDefs = columnsResult.map((col) => {
                    let def = `  "${col.column_name}" ${col.data_type}`;
                    if (col.character_maximum_length) {
                        def += `(${col.character_maximum_length})`;
                    }
                    else if (col.numeric_precision && col.numeric_scale) {
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
                    const recordCount = ((_a = countResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
                    ddl += `-- Total de registros: ${recordCount}\n`;
                }
                catch (countError) {
                    ddl += `-- Total de registros: Erro ao contar (${countError instanceof Error ? countError.message : 'Desconhecido'})\n`;
                }
                ddl += `\n`;
            }
            await client.end();
            // Configurar headers para download
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="database_ddl_${new Date().toISOString().split('T')[0]}.sql"`);
            res.send(ddl);
        }
        catch (error) {
            await client.end();
            throw error;
        }
    }
    catch (error) {
        console.error('Erro ao gerar DDL:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
}
async function verifyTablesIntegrity() {
    var _a, _b;
    const result = {
        tablesCreated: 0,
        tablesTotal: EXPECTED_TABLES.length,
        totalRecords: 0,
        missingTables: [],
        errors: []
    };
    for (const expectedTable of EXPECTED_TABLES) {
        try {
            // Verificar se a tabela existe
            const tableExists = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${expectedTable.name}
        )
      `);
            if ((_a = tableExists.rows[0]) === null || _a === void 0 ? void 0 : _a.exists) {
                result.tablesCreated++;
                // Contar registros
                const countResult = await db_1.db.execute((0, drizzle_orm_1.sql) `
          SELECT COUNT(*) as count FROM ${drizzle_orm_1.sql.identifier(expectedTable.name)}
        `);
                result.totalRecords += parseInt(((_b = countResult.rows[0]) === null || _b === void 0 ? void 0 : _b.count) || '0');
            }
            else {
                result.missingTables.push(expectedTable.name);
            }
        }
        catch (error) {
            result.errors.push(`Erro ao verificar ${expectedTable.name}: ${error instanceof Error ? error.message : 'Desconhecido'}`);
        }
    }
    return result;
}
