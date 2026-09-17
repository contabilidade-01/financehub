"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = __importDefault(require("postgres"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function checkSettings() {
    const sql = (0, postgres_1.default)(process.env.DATABASE_URL || '');
    try {
        const settings = await sql `SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key`;
        console.log('\n📊 Configurações do Sistema:\n');
        settings.forEach((s) => {
            console.log(`  ✓ ${s.setting_key}: ${s.setting_value}`);
        });
        console.log(`\nTotal: ${settings.length} configurações\n`);
    }
    catch (error) {
        console.error('Erro:', error);
    }
    finally {
        await sql.end();
    }
}
checkSettings();
