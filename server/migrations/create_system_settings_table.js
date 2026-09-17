"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = __importDefault(require("postgres"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function createSystemSettingsTable() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL não está definida no arquivo .env");
        process.exit(1);
    }
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log("Criando tabela de configurações do sistema...\n");
        // Criar tabela system_settings
        await sql `
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
        console.log("✓ Tabela system_settings criada!");
        // Criar índice para buscas rápidas por chave
        await sql `
      CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key)
    `;
        console.log("✓ Índice idx_system_settings_key criado!");
        // Verificar se já existem configurações
        const existing = await sql `
      SELECT COUNT(*) as count FROM system_settings
    `;
        if (existing[0].count === 0) {
            console.log("Inserindo configurações padrão...");
            // Inserir configurações padrão
            await sql `
        INSERT INTO system_settings (setting_key, setting_value, setting_metadata) VALUES
          ('system_name', 'Khesef', '{"type": "text", "label": "Nome do Sistema", "description": "Nome exibido em todo o sistema"}'),
          ('system_name_short', 'khesef', '{"type": "text", "label": "Nome Curto", "description": "Versão curta usada em emails e URLs (lowercase)"}'),
          ('system_tagline', 'Gestão financeira inteligente e moderna', '{"type": "text", "label": "Slogan/Tagline", "description": "Frase descritiva do sistema"}'),
          ('support_email', 'suporte@controledinheiro.com.br', '{"type": "email", "label": "Email de Suporte", "description": "Email de contato do suporte"}'),
          ('system_url', 'https://app.controledinheiro.com.br', '{"type": "url", "label": "URL do Sistema", "description": "URL principal do sistema"}'),
          ('system_description', 'Khesef - Gerencie suas finanças pessoais com uma interface moderna e futurista. Acompanhe receitas, despesas e tenha controle total do seu dinheiro.', '{"type": "textarea", "label": "Descrição do Sistema", "description": "Descrição para SEO e meta tags"}')
      `;
            console.log("✓ Configurações padrão inseridas!");
        }
        else {
            console.log("⊘ Configurações já existem");
        }
        // Criar função de trigger para updated_at
        await sql `
      CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
        console.log("✓ Função de trigger criada!");
        // Criar trigger
        await sql `
      DROP TRIGGER IF EXISTS trigger_update_system_settings_updated_at ON system_settings
    `;
        await sql `
      CREATE TRIGGER trigger_update_system_settings_updated_at
        BEFORE UPDATE ON system_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_system_settings_updated_at()
    `;
        console.log("✓ Trigger criado!");
        console.log("\n✅ Migração concluída com sucesso!");
        console.log("\nConfigurações disponíveis:");
        const settings = await sql `SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key`;
        settings.forEach((s) => {
            console.log(`  - ${s.setting_key}: ${s.setting_value}`);
        });
    }
    catch (error) {
        console.error("\n❌ Erro ao executar migração:", error);
        process.exit(1);
    }
    finally {
        await sql.end();
    }
}
createSystemSettingsTable();
