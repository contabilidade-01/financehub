"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditarDivergenciasFlags = exports.prontaParaAposentar = exports.calcularDiasLiberada = exports.avaliarFlag = exports.DIAS_PARA_APOSENTAR = exports.FLAGS_NO_CODIGO = exports.FLAG_AGENTE_MEIO_PAGAMENTO = void 0;
exports.invalidarCacheFlags = invalidarCacheFlags;
exports.flagAtiva = flagAtiva;
exports.listarFlagsAdmin = listarFlagsAdmin;
exports.criarFlag = criarFlag;
exports.setAtivoTodos = setAtivoTodos;
exports.aposentarFlag = aposentarFlag;
exports.ligarUsuario = ligarUsuario;
exports.desligarUsuario = desligarUsuario;
exports.flagsDoUsuario = flagsDoUsuario;
exports.listarChavesNoBanco = listarChavesNoBanco;
exports.ensureFeatureFlagsBoot = ensureFeatureFlagsBoot;
/**
 * Feature flags por usuário — liberação gradual sem duas versões do app.
 *
 * Padrão: desligado. Flag inexistente = false (código novo não vaza).
 * Tabelas criadas sob demanda (padrão backup.service), fora do auto-migrate.
 *
 * Ciclo: nascer off → teste → liberar todos → 30 dias → limpar código → aposentar linha.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const feature_flags_logic_1 = require("./feature-flags-logic");
Object.defineProperty(exports, "FLAG_AGENTE_MEIO_PAGAMENTO", { enumerable: true, get: function () { return feature_flags_logic_1.FLAG_AGENTE_MEIO_PAGAMENTO; } });
Object.defineProperty(exports, "FLAGS_NO_CODIGO", { enumerable: true, get: function () { return feature_flags_logic_1.FLAGS_NO_CODIGO; } });
Object.defineProperty(exports, "DIAS_PARA_APOSENTAR", { enumerable: true, get: function () { return feature_flags_logic_1.DIAS_PARA_APOSENTAR; } });
Object.defineProperty(exports, "avaliarFlag", { enumerable: true, get: function () { return feature_flags_logic_1.avaliarFlag; } });
Object.defineProperty(exports, "calcularDiasLiberada", { enumerable: true, get: function () { return feature_flags_logic_1.calcularDiasLiberada; } });
Object.defineProperty(exports, "prontaParaAposentar", { enumerable: true, get: function () { return feature_flags_logic_1.prontaParaAposentar; } });
Object.defineProperty(exports, "auditarDivergenciasFlags", { enumerable: true, get: function () { return feature_flags_logic_1.auditarDivergenciasFlags; } });
const CACHE_TTL_MS = 5000;
const cacheFlag = new Map();
let tabelaPronta = false;
async function garantirTabelas() {
    if (tabelaPronta)
        return;
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    CREATE TABLE IF NOT EXISTS feature_flags (
      chave       VARCHAR(60) PRIMARY KEY,
      descricao   TEXT,
      ativo_todos BOOLEAN NOT NULL DEFAULT false,
      criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    CREATE TABLE IF NOT EXISTS feature_flags_usuarios (
      chave      VARCHAR(60) NOT NULL REFERENCES feature_flags(chave) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (chave, usuario_id)
    )
  `);
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    ALTER TABLE feature_flags
    ADD COLUMN IF NOT EXISTS liberado_todos_em TIMESTAMP
  `);
    // Piloto: regras de meio já no ar — nasce liberada.
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO feature_flags (chave, descricao, ativo_todos)
    VALUES (
      ${feature_flags_logic_1.FLAG_AGENTE_MEIO_PAGAMENTO},
      ${"Regras avançadas de meio (conta×cartão, ambiguidade, Inter≈Banco Inter). Desligar volta ao modo básico."},
      true
    )
    ON CONFLICT (chave) DO NOTHING
  `);
    // Flags já liberadas sem data: usa criado_em (não nasce "pronta" nem sem prazo).
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE feature_flags
    SET liberado_todos_em = criado_em
    WHERE ativo_todos = true AND liberado_todos_em IS NULL
  `);
    tabelaPronta = true;
}
function cacheKey(chave, usuarioId) {
    return `${chave}|${usuarioId !== null && usuarioId !== void 0 ? usuarioId : "anon"}`;
}
function invalidarCacheFlags(chave) {
    if (!chave) {
        cacheFlag.clear();
        return;
    }
    for (const k of cacheFlag.keys()) {
        if (k.startsWith(`${chave}|`))
            cacheFlag.delete(k);
    }
}
/**
 * Flag ligada para este usuário? Inexistente / erro → false.
 */
async function flagAtiva(chave, usuarioId) {
    var _a, _b, _c, _d;
    const uid = usuarioId != null && Number.isFinite(Number(usuarioId)) ? Number(usuarioId) : null;
    const ck = cacheKey(chave, uid);
    const hit = cacheFlag.get(ck);
    if (hit && hit.exp > Date.now())
        return hit.value;
    let value = false;
    try {
        await garantirTabelas();
        const row = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT ativo_todos FROM feature_flags WHERE chave = ${chave} LIMIT 1
    `);
        const flag = (_b = (_a = row.rows) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : row[0];
        if (!flag) {
            value = (0, feature_flags_logic_1.avaliarFlag)({ existe: false, ativoTodos: false, usuariosComFlag: [], usuarioId: uid });
        }
        else {
            const ativoTodos = flag.ativo_todos === true || flag.ativo_todos === "t" || flag.ativo_todos === 1;
            let usuariosComFlag = [];
            if (!ativoTodos && uid != null) {
                const u = await db_1.db.execute((0, drizzle_orm_1.sql) `
          SELECT usuario_id FROM feature_flags_usuarios
          WHERE chave = ${chave} AND usuario_id = ${uid}
          LIMIT 1
        `);
                const tem = (_d = (_c = u.rows) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : u[0];
                if (tem)
                    usuariosComFlag = [uid];
            }
            value = (0, feature_flags_logic_1.avaliarFlag)({ existe: true, ativoTodos, usuariosComFlag, usuarioId: uid });
        }
    }
    catch (e) {
        console.error(`[feature-flags] flagAtiva(${chave}):`, (e === null || e === void 0 ? void 0 : e.message) || e);
        value = false;
    }
    cacheFlag.set(ck, { value, exp: Date.now() + CACHE_TTL_MS });
    return value;
}
async function listarFlagsAdmin() {
    var _a;
    await garantirTabelas();
    const flags = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT chave, descricao, ativo_todos, liberado_todos_em, criado_em
    FROM feature_flags
    ORDER BY chave
  `);
    const rows = (flags.rows || flags);
    const out = [];
    for (const f of rows) {
        const us = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT usuario_id FROM feature_flags_usuarios WHERE chave = ${f.chave} ORDER BY usuario_id
    `);
        const ids = (us.rows || us).map((r) => Number(r.usuario_id));
        const ativoTodos = f.ativo_todos === true || f.ativo_todos === "t" || f.ativo_todos === 1;
        const liberado = f.liberado_todos_em ? String(f.liberado_todos_em) : null;
        const dias = ativoTodos ? (0, feature_flags_logic_1.calcularDiasLiberada)(liberado) : null;
        out.push({
            chave: f.chave,
            descricao: (_a = f.descricao) !== null && _a !== void 0 ? _a : null,
            ativo_todos: ativoTodos,
            liberado_todos_em: liberado,
            dias_liberada: dias,
            pronta_aposentar: (0, feature_flags_logic_1.prontaParaAposentar)(dias),
            usuarios: ids,
            total_usuarios: ids.length,
        });
    }
    return out;
}
async function criarFlag(chave, descricao) {
    const k = String(chave || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, 60);
    if (!k)
        throw new Error("Chave inválida");
    await garantirTabelas();
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO feature_flags (chave, descricao, ativo_todos, liberado_todos_em)
    VALUES (${k}, ${descricao || null}, false, NULL)
    ON CONFLICT (chave) DO NOTHING
  `);
    invalidarCacheFlags(k);
}
async function setAtivoTodos(chave, ativo) {
    var _a, _b;
    await garantirTabelas();
    if (ativo) {
        const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE feature_flags
      SET ativo_todos = true, liberado_todos_em = NOW()
      WHERE chave = ${chave}
    `);
        const n = (_a = r.rowCount) !== null && _a !== void 0 ? _a : r.count;
        if (n === 0)
            throw new Error(`Flag '${chave}' não existe`);
    }
    else {
        const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE feature_flags
      SET ativo_todos = false, liberado_todos_em = NULL
      WHERE chave = ${chave}
    `);
        const n = (_b = r.rowCount) !== null && _b !== void 0 ? _b : r.count;
        if (n === 0)
            throw new Error(`Flag '${chave}' não existe`);
        await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM feature_flags_usuarios WHERE chave = ${chave}`);
    }
    invalidarCacheFlags(chave);
}
/** Remove a linha do banco. NÃO remove o if no código — faça isso antes. */
async function aposentarFlag(chave) {
    var _a;
    await garantirTabelas();
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `DELETE FROM feature_flags WHERE chave = ${chave}`);
    const n = (_a = r.rowCount) !== null && _a !== void 0 ? _a : r.count;
    if (n === 0)
        throw new Error(`Flag '${chave}' não existe`);
    invalidarCacheFlags(chave);
}
async function ligarUsuario(chave, usuarioId) {
    var _a;
    await garantirTabelas();
    const existe = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT 1 FROM feature_flags WHERE chave = ${chave} LIMIT 1`);
    if (!(((_a = existe.rows) === null || _a === void 0 ? void 0 : _a[0]) || existe[0])) {
        throw new Error(`Flag '${chave}' não existe`);
    }
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    INSERT INTO feature_flags_usuarios (chave, usuario_id)
    VALUES (${chave}, ${usuarioId})
    ON CONFLICT DO NOTHING
  `);
    invalidarCacheFlags(chave);
}
async function desligarUsuario(chave, usuarioId) {
    await garantirTabelas();
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    DELETE FROM feature_flags_usuarios WHERE chave = ${chave} AND usuario_id = ${usuarioId}
  `);
    invalidarCacheFlags(chave);
}
async function flagsDoUsuario(usuarioId) {
    await garantirTabelas();
    const flags = await listarFlagsAdmin();
    const out = {};
    for (const f of flags) {
        out[f.chave] = await flagAtiva(f.chave, usuarioId);
    }
    return out;
}
async function listarChavesNoBanco() {
    await garantirTabelas();
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT chave FROM feature_flags ORDER BY chave`);
    return (r.rows || r).map((row) => String(row.chave));
}
async function ensureFeatureFlagsBoot() {
    try {
        await garantirTabelas();
    }
    catch (e) {
        console.error("[feature-flags] boot:", (e === null || e === void 0 ? void 0 : e.message) || e);
    }
}
