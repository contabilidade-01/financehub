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
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDbOrSkip = requireDbOrSkip;
exports.pingDbOrSkip = pingDbOrSkip;
/**
 * Helper: carrega dotenv sem sobrescrever DATABASE_URL já setada,
 * e aborta com SKIP limpo se o pool não conectou.
 */
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ override: false });
function requireDbOrSkip(db, label) {
    if (!db) {
        console.log(`SKIP (${label}): sem conexão — defina DATABASE_URL válida (ex.: Postgres local Docker).`);
        return false;
    }
    return true;
}
async function pingDbOrSkip(db, label) {
    if (!requireDbOrSkip(db, label))
        return false;
    try {
        const { sql } = await Promise.resolve().then(() => __importStar(require("drizzle-orm")));
        await db.execute(sql `SELECT 1`);
        return true;
    }
    catch (e) {
        console.log(`SKIP (${label}): banco inacessível — ${(e === null || e === void 0 ? void 0 : e.code) || (e === null || e === void 0 ? void 0 : e.message) || e}`);
        return false;
    }
}
