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
// Carregar variáveis de ambiente
dotenv.config();
async function addSubscriptionActiveColumn() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL não está definida no arquivo .env");
        process.exit(1);
    }
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log("Adicionando coluna subscription_active à tabela usuarios...");
        // Adiciona a coluna se ela não existir
        await sql `
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS subscription_active boolean NOT NULL DEFAULT false
    `;
        console.log("✓ Coluna subscription_active adicionada com sucesso!");
        // Atualiza usuários existentes baseado no status_assinatura
        await sql `
      UPDATE usuarios
      SET subscription_active = true
      WHERE status_assinatura = 'ativa'
        AND (data_expiracao_assinatura IS NULL OR data_expiracao_assinatura > NOW())
    `;
        console.log("✓ Usuários existentes atualizados com base no status de assinatura!");
    }
    catch (error) {
        console.error("Erro ao executar migração:", error);
        process.exit(1);
    }
    finally {
        await sql.end();
    }
}
addSubscriptionActiveColumn();
