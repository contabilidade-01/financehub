"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_ts_1 = require("./server/db.ts");
const drizzle_orm_1 = require("drizzle-orm");
const schema_ts_1 = require("./shared/schema.ts");
async function run() {
    try {
        const wallet = await db_ts_1.db.select().from(schema_ts_1.wallets).where((0, drizzle_orm_1.eq)(schema_ts_1.wallets.usuario_id, 5)).limit(1);
        console.log('Carteira do usuário 5:', wallet);
        if (wallet.length > 0) {
            const txs = await db_ts_1.db.select().from(schema_ts_1.transactions).where((0, drizzle_orm_1.eq)(schema_ts_1.transactions.carteira_id, wallet[0].id));
            console.log('Total de transações:', txs.length);
            console.log('Transações:', JSON.stringify(txs, null, 2));
        }
    }
    catch (error) {
        console.error('Erro:', error);
    }
    process.exit(0);
}
run();
