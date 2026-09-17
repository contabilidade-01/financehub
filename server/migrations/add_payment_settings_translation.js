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
async function addPaymentSettingsTranslation() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL não está definida no arquivo .env");
        process.exit(1);
    }
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log("Adicionando tradução payment_settings...\n");
        const translations = [
            { locale: 'pt-br', key: 'navigation.payment_settings', value: 'Config. Pagamento' },
            { locale: 'en-us', key: 'navigation.payment_settings', value: 'Payment Settings' },
            { locale: 'es-es', key: 'navigation.payment_settings', value: 'Config. de Pago' },
        ];
        for (const trans of translations) {
            const existing = await sql `
        SELECT id FROM localization_strings
        WHERE string_key = ${trans.key} AND locale_code = ${trans.locale}
      `;
            if (existing.length === 0) {
                await sql `
          INSERT INTO localization_strings (string_key, locale_code, string_value, created_at)
          VALUES (${trans.key}, ${trans.locale}, ${trans.value}, NOW())
        `;
                console.log(`✓ ${trans.locale}: ${trans.key} = "${trans.value}"`);
            }
            else {
                console.log(`⊘ ${trans.locale}: ${trans.key} já existe`);
            }
        }
        console.log("\n✅ Traduções adicionadas!");
    }
    catch (error) {
        console.error("\n❌ Erro:", error);
        process.exit(1);
    }
    finally {
        await sql.end();
    }
}
addPaymentSettingsTranslation();
