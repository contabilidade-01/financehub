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
async function fixPaymentSettingsKey() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL não está definida no arquivo .env");
        process.exit(1);
    }
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log("Limpando e reimportando chave API do Asaas...\n");
        // Deletar configuração existente
        await sql `DELETE FROM payment_settings WHERE provider = 'asaas'`;
        console.log("✓ Configuração antiga removida");
        // Pegar a chave do .env e remover aspas se houver
        let apiKey = process.env.ASAAS_API_KEY || '';
        // Remover aspas duplas do início e fim se existirem
        if (apiKey.startsWith('"') && apiKey.endsWith('"')) {
            apiKey = apiKey.slice(1, -1);
        }
        console.log(`\n📋 Nova chave:`);
        console.log(`  Length: ${apiKey.length}`);
        console.log(`  Prefix: ${apiKey.substring(0, 20)}...`);
        console.log(`  Suffix: ...${apiKey.substring(apiKey.length - 20)}`);
        if (!apiKey || apiKey.length < 50) {
            console.error("\n❌ Chave API inválida ou muito curta");
            console.error("Por favor, configure manualmente via interface admin em /admin/payment-settings");
            process.exit(0);
        }
        // Inserir nova configuração com a chave correta
        await sql `
      INSERT INTO payment_settings (provider, environment, api_key, enabled, created_at)
      VALUES (
        'asaas',
        ${process.env.ASAAS_ENVIRONMENT || 'sandbox'},
        ${apiKey},
        true,
        NOW()
      )
    `;
        console.log("\n✅ Nova configuração salva com sucesso!");
        console.log("\n💡 Dica: Você pode atualizar esta configuração via /admin/payment-settings");
    }
    catch (error) {
        console.error("\n❌ Erro:", error);
        process.exit(1);
    }
    finally {
        await sql.end();
    }
}
fixPaymentSettingsKey();
