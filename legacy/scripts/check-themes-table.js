"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = __importDefault(require("postgres"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: '.env' });
async function checkThemesTable() {
    const client = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log('🔍 Verificando se a tabela custom_themes existe...');
        const tableExists = await client `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'custom_themes'
      );
    `;
        console.log('Tabela existe:', tableExists[0].exists);
        if (!tableExists[0].exists) {
            console.log('📋 Criando tabela custom_themes...');
            await client `CREATE TABLE IF NOT EXISTS custom_themes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        name VARCHAR(100) NOT NULL,
        light_config JSONB NOT NULL,
        dark_config JSONB NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`;
            await client `CREATE INDEX IF NOT EXISTS idx_custom_themes_user_id ON custom_themes(user_id)`;
            await client `CREATE INDEX IF NOT EXISTS idx_custom_themes_is_default ON custom_themes(is_default)`;
            await client `CREATE INDEX IF NOT EXISTS idx_custom_themes_created_at ON custom_themes(created_at)`;
            await client `ALTER TABLE custom_themes ADD CONSTRAINT custom_themes_user_id_usuarios_id_fk 
                   FOREIGN KEY (user_id) REFERENCES usuarios(id)`;
            console.log('✅ Tabela custom_themes criada com sucesso!');
        }
        else {
            console.log('✅ Tabela custom_themes já existe!');
            // Verificar se tem dados
            const count = await client `SELECT COUNT(*) FROM custom_themes`;
            console.log('Total de temas:', count[0].count);
        }
    }
    catch (error) {
        console.error('❌ Erro:', error);
    }
    finally {
        await client.end();
    }
}
checkThemesTable();
