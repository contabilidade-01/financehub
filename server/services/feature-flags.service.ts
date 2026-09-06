/**
 * Feature flags por usuário — liberação gradual sem duas versões do app.
 *
 * Padrão: desligado. Flag inexistente = false (código novo não vaza).
 * Tabelas criadas sob demanda (padrão backup.service), fora do auto-migrate.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export const FLAG_AGENTE_MEIO_PAGAMENTO = "agente_meio_pagamento";

const CACHE_TTL_MS = 5_000; // curto: desligar deve valer na mensagem seguinte

type CacheEntry = { value: boolean; exp: number };
const cacheFlag = new Map<string, CacheEntry>(); // chave|userId → bool
let tabelaPronta = false;

async function garantirTabelas(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_flags (
      chave       VARCHAR(60) PRIMARY KEY,
      descricao   TEXT,
      ativo_todos BOOLEAN NOT NULL DEFAULT false,
      criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_flags_usuarios (
      chave      VARCHAR(60) NOT NULL REFERENCES feature_flags(chave) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL,
      PRIMARY KEY (chave, usuario_id)
    )
  `);
  // Piloto: regras de meio já estão no ar para todos — flag nasce liberada.
  // Novas mudanças de risco devem nascer com ativo_todos=false.
  await db.execute(sql`
    INSERT INTO feature_flags (chave, descricao, ativo_todos)
    VALUES (
      ${FLAG_AGENTE_MEIO_PAGAMENTO},
      ${"Regras avançadas de meio (conta×cartão, ambiguidade, Inter≈Banco Inter). Desligar volta ao modo básico."},
      true
    )
    ON CONFLICT (chave) DO NOTHING
  `);
  tabelaPronta = true;
}

function cacheKey(chave: string, usuarioId: number | null): string {
  return `${chave}|${usuarioId ?? "anon"}`;
}

export function invalidarCacheFlags(chave?: string): void {
  if (!chave) {
    cacheFlag.clear();
    return;
  }
  for (const k of cacheFlag.keys()) {
    if (k.startsWith(`${chave}|`)) cacheFlag.delete(k);
  }
}

/**
 * Avaliação pura (testável sem banco). Flag inexistente = false.
 */
export function avaliarFlag(opts: {
  existe: boolean;
  ativoTodos: boolean;
  usuariosComFlag: number[];
  usuarioId: number | null;
}): boolean {
  if (!opts.existe) return false;
  if (opts.ativoTodos) return true;
  if (opts.usuarioId == null) return false;
  return opts.usuariosComFlag.includes(opts.usuarioId);
}

/**
 * Flag ligada para este usuário? Inexistente / erro → false.
 */
export async function flagAtiva(chave: string, usuarioId: number | null | undefined): Promise<boolean> {
  const uid = usuarioId != null && Number.isFinite(Number(usuarioId)) ? Number(usuarioId) : null;
  const ck = cacheKey(chave, uid);
  const hit = cacheFlag.get(ck);
  if (hit && hit.exp > Date.now()) return hit.value;

  let value = false;
  try {
    await garantirTabelas();
    const row = await db.execute(sql`
      SELECT ativo_todos FROM feature_flags WHERE chave = ${chave} LIMIT 1
    `);
    const flag = (row as any).rows?.[0] ?? (row as any)[0];
    if (!flag) {
      value = avaliarFlag({ existe: false, ativoTodos: false, usuariosComFlag: [], usuarioId: uid });
    } else {
      const ativoTodos = flag.ativo_todos === true || flag.ativo_todos === "t" || flag.ativo_todos === 1;
      let usuariosComFlag: number[] = [];
      if (!ativoTodos && uid != null) {
        const u = await db.execute(sql`
          SELECT usuario_id FROM feature_flags_usuarios
          WHERE chave = ${chave} AND usuario_id = ${uid}
          LIMIT 1
        `);
        const tem = (u as any).rows?.[0] ?? (u as any)[0];
        if (tem) usuariosComFlag = [uid];
      }
      value = avaliarFlag({ existe: true, ativoTodos, usuariosComFlag, usuarioId: uid });
    }
  } catch (e: any) {
    console.error(`[feature-flags] flagAtiva(${chave}):`, e?.message || e);
    value = false;
  }

  cacheFlag.set(ck, { value, exp: Date.now() + CACHE_TTL_MS });
  return value;
}

export type FlagAdminRow = {
  chave: string;
  descricao: string | null;
  ativo_todos: boolean;
  usuarios: number[];
  total_usuarios: number;
};

export async function listarFlagsAdmin(): Promise<FlagAdminRow[]> {
  await garantirTabelas();
  const flags = await db.execute(sql`
    SELECT chave, descricao, ativo_todos FROM feature_flags ORDER BY chave
  `);
  const rows = ((flags as any).rows || flags) as any[];
  const out: FlagAdminRow[] = [];
  for (const f of rows) {
    const us = await db.execute(sql`
      SELECT usuario_id FROM feature_flags_usuarios WHERE chave = ${f.chave} ORDER BY usuario_id
    `);
    const ids = (((us as any).rows || us) as any[]).map((r) => Number(r.usuario_id));
    out.push({
      chave: f.chave,
      descricao: f.descricao ?? null,
      ativo_todos: f.ativo_todos === true || f.ativo_todos === "t" || f.ativo_todos === 1,
      usuarios: ids,
      total_usuarios: ids.length,
    });
  }
  return out;
}

export async function criarFlag(chave: string, descricao?: string): Promise<void> {
  const k = String(chave || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 60);
  if (!k) throw new Error("Chave inválida");
  await garantirTabelas();
  await db.execute(sql`
    INSERT INTO feature_flags (chave, descricao, ativo_todos)
    VALUES (${k}, ${descricao || null}, false)
    ON CONFLICT (chave) DO NOTHING
  `);
  invalidarCacheFlags(k);
}

export async function setAtivoTodos(chave: string, ativo: boolean): Promise<void> {
  await garantirTabelas();
  const r = await db.execute(sql`
    UPDATE feature_flags SET ativo_todos = ${ativo} WHERE chave = ${chave}
  `);
  const n = (r as any).rowCount ?? (r as any).count;
  if (n === 0) throw new Error(`Flag '${chave}' não existe`);
  // Freio de emergência: ao desligar "todos", limpa também a lista individual
  // para ninguém ficar com o comportamento novo.
  if (!ativo) {
    await db.execute(sql`DELETE FROM feature_flags_usuarios WHERE chave = ${chave}`);
  }
  invalidarCacheFlags(chave);
}

export async function ligarUsuario(chave: string, usuarioId: number): Promise<void> {
  await garantirTabelas();
  const existe = await db.execute(sql`SELECT 1 FROM feature_flags WHERE chave = ${chave} LIMIT 1`);
  if (!((existe as any).rows?.[0] || (existe as any)[0])) {
    throw new Error(`Flag '${chave}' não existe`);
  }
  await db.execute(sql`
    INSERT INTO feature_flags_usuarios (chave, usuario_id)
    VALUES (${chave}, ${usuarioId})
    ON CONFLICT DO NOTHING
  `);
  invalidarCacheFlags(chave);
}

export async function desligarUsuario(chave: string, usuarioId: number): Promise<void> {
  await garantirTabelas();
  await db.execute(sql`
    DELETE FROM feature_flags_usuarios WHERE chave = ${chave} AND usuario_id = ${usuarioId}
  `);
  invalidarCacheFlags(chave);
}

/** Flags ativas para o usuário logado (UI). */
export async function flagsDoUsuario(usuarioId: number): Promise<Record<string, boolean>> {
  await garantirTabelas();
  const flags = await listarFlagsAdmin();
  const out: Record<string, boolean> = {};
  for (const f of flags) {
    out[f.chave] = await flagAtiva(f.chave, usuarioId);
  }
  return out;
}

/** Garante tabelas no boot (homologação / produção). */
export async function ensureFeatureFlagsBoot(): Promise<void> {
  try {
    await garantirTabelas();
  } catch (e: any) {
    console.error("[feature-flags] boot:", e?.message || e);
  }
}
