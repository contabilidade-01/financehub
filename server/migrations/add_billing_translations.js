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
async function addBillingTranslations() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL não está definida no arquivo .env");
        process.exit(1);
    }
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL);
    try {
        console.log("Adicionando traduções de billing...\n");
        // Traduções para adicionar
        const translations = [
            // Português Brasileiro
            { locale: 'pt-br', key: 'navigation.sections.billing', value: 'ASSINATURA' },
            { locale: 'pt-br', key: 'navigation.billing_settings', value: 'Minha Assinatura' },
            { locale: 'pt-br', key: 'navigation.invoices', value: 'Faturas' },
            { locale: 'pt-br', key: 'navigation.billing', value: 'Pagamentos' },
            // Inglês
            { locale: 'en-us', key: 'navigation.sections.billing', value: 'BILLING' },
            { locale: 'en-us', key: 'navigation.billing_settings', value: 'My Subscription' },
            { locale: 'en-us', key: 'navigation.invoices', value: 'Invoices' },
            { locale: 'en-us', key: 'navigation.billing', value: 'Billing' },
            // Espanhol
            { locale: 'es-es', key: 'navigation.sections.billing', value: 'SUSCRIPCIÓN' },
            { locale: 'es-es', key: 'navigation.billing_settings', value: 'Mi Suscripción' },
            { locale: 'es-es', key: 'navigation.invoices', value: 'Facturas' },
            { locale: 'es-es', key: 'navigation.billing', value: 'Pagos' },
        ];
        let added = 0;
        let skipped = 0;
        for (const trans of translations) {
            try {
                // Verificar se já existe
                const existing = await sql `
          SELECT id FROM localization_strings
          WHERE string_key = ${trans.key}
            AND locale_code = ${trans.locale}
        `;
                if (existing.length > 0) {
                    console.log(`  ⊘ Já existe: ${trans.locale} - ${trans.key}`);
                    skipped++;
                }
                else {
                    // Inserir nova tradução
                    await sql `
            INSERT INTO localization_strings (string_key, locale_code, string_value, created_at)
            VALUES (${trans.key}, ${trans.locale}, ${trans.value}, NOW())
          `;
                    console.log(`  ✓ Adicionado: ${trans.locale} - ${trans.key} = "${trans.value}"`);
                    added++;
                }
            }
            catch (err) {
                console.error(`  ✗ Erro ao adicionar ${trans.locale} - ${trans.key}:`, err);
            }
        }
        console.log(`\n✅ Finalizado!`);
        console.log(`   ${added} traduções adicionadas`);
        console.log(`   ${skipped} traduções já existiam`);
    }
    catch (error) {
        console.error("\n❌ Erro ao executar migração:", error);
        process.exit(1);
    }
    finally {
        await sql.end();
    }
}
addBillingTranslations();
