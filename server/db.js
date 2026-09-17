"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initializeDatabase = initializeDatabase;
const postgres_js_1 = require("drizzle-orm/postgres-js");
const postgres_1 = __importDefault(require("postgres"));
// Create SQL connection only if DATABASE_URL is available
let client = null;
let db = null;
exports.db = db;
if (process.env.DATABASE_URL) {
    client = (0, postgres_1.default)(process.env.DATABASE_URL);
    exports.db = db = (0, postgres_js_1.drizzle)(client);
}
// Export a function to initialize the database connection
function initializeDatabase(databaseUrl) {
    if (client) {
        client.end();
    }
    client = (0, postgres_1.default)(databaseUrl);
    exports.db = db = (0, postgres_js_1.drizzle)(client);
    return db;
}
