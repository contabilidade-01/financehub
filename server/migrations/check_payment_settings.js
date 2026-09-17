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
async function checkPaymentSettings() {
    var _a, _b;
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL não está definida no arquivo .env");
        process.exit(1);
    }
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log("Verificando configurações de pagamento...\n");
        const settings = await sql `
      SELECT
        id,
        provider,
        environment,
        LENGTH(api_key) as api_key_length,
        SUBSTRING(api_key, 1, 20) as api_key_prefix,
        SUBSTRING(api_key, LENGTH(api_key) - 10, 10) as api_key_suffix,
        enabled
      FROM payment_settings
      WHERE provider = 'asaas'
    `;
        if (settings.length === 0) {
            console.log("❌ Nenhuma configuração encontrada no banco");
        }
        else {
            console.log("✅ Configuração encontrada:");
            console.log(JSON.stringify(settings[0], null, 2));
            console.log("\n📋 Detalhes:");
            console.log(`  Provider: ${settings[0].provider}`);
            console.log(`  Environment: ${settings[0].environment}`);
            console.log(`  API Key Length: ${settings[0].api_key_length}`);
            console.log(`  API Key Prefix: ${settings[0].api_key_prefix}`);
            console.log(`  API Key Suffix: ${settings[0].api_key_suffix}`);
            console.log(`  Enabled: ${settings[0].enabled}`);
        }
        console.log("\n📝 Chave do .env:");
        console.log(`  Length: ${((_a = process.env.ASAAS_API_KEY) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        console.log(`  Prefix: ${(_b = process.env.ASAAS_API_KEY) === null || _b === void 0 ? void 0 : _b.substring(0, 20)}`);
    }
    catch (error) {
        console.error("\n❌ Erro:", error);
        process.exit(1);
    }
    finally {
        await sql.end();
    }
}
checkPaymentSettings();
