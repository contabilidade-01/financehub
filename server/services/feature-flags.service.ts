/**
 * Feature flags por usuário — liberação gradual sem duas versões do app.
 *
 * Padrão: desligado. Flag inexistente = false (código novo não vaza).
 * Tabelas criadas sob demanda (padrão backup.service), fora do auto-migrate.
 *
 * Ciclo: nascer off → teste → liberar todos → 30 dias → limpar código → aposentar linha.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  FLAG_AGENTE_MEIO_PAGAMENTO,
  FLAGS_NO_CODIGO,
  DIAS_PARA_APOSENTAR,
  avaliarFlag,
  calcularDiasLiberada,
  prontaParaAposentar,
  auditarDivergenciasFlags,
} from "./feature-flags-logic";

export {
  FLAG_AGENTE_MEIO_PAGAMENTO,
  FLAGS_NO_CODIGO,
  DIAS_PARA_APOSENTAR,
  avaliarFlag,
  calcularDiasLiberada,
  prontaParaAposentar,
  auditarDivergenciasFlags,
};

const CACHE_TTL_MS = 5_000;

type CacheEntry = { value: boolean; exp: number };
const cacheFlag = new Map<string, CacheEntry>();
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
  await db.execute(sql`
    ALTER TABLE feature_flags
    ADD COLUMN IF NOT EXISTS liberado_todos_em TIMESTAMP
  `);
  // Piloto: regras de meio já no ar — nasce liberada.
  await db.execute(sql`
    INSERT INTO feature_flags (chave, descricao, ativo_todos)
    VALUES (
      ${FLAG_AGENTE_MEIO_PAGAMENTO},
      ${"Regras avançadas de meio (conta×cartão, ambiguidade, Inter≈Banco Inter). Desligar volta ao modo básico."},
      true
    )
    ON CONFLICT (chave) DO NOTHING
  `);
  // Flags já liberadas sem data: usa criado_em (não nasce "pronta" nem sem prazo).
  await db.execute(sql`
    UPDATE feature_flags
    SET liberado_todos_em = criado_em
    WHERE ativo_todos = true AND liberado_todos_em IS NULL
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
  liberado_todos_em: string | null;
  dias_liberada: number | null;
  pronta_aposentar: boolean;
  usuarios: number[];
  total_usuarios: number;
};

export async function listarFlagsAdmin(): Promise<FlagAdminRow[]> {
  await garantirTabelas();
  const flags = await db.execute(sql`
    SELECT chave, descricao, ativo_todos, liberado_todos_em, criado_em
    FROM feature_flags
    ORDER BY chave
  `);
  const rows = ((flags as any).rows || flags) as any[];
  const out: FlagAdminRow[] = [];
  for (const f of rows) {
    const us = await db.execute(sql`
      SELECT usuario_id FROM feature_flags_usuarios WHERE chave = ${f.chave} ORDER BY usuario_id
    `);
    const ids = (((us as any).rows || us) as any[]).map((r) => Number(r.usuario_id));
    const ativoTodos = f.ativo_todos === true || f.ativo_todos === "t" || f.ativo_todos === 1;
    const liberado = f.liberado_todos_em ? String(f.liberado_todos_em) : null;
    const dias = ativoTodos ? calcularDiasLiberada(liberado) : null;
    out.push({
      chave: f.chave,
      descricao: f.descricao ?? null,
      ativo_todos: ativoTodos,
      liberado_todos_em: liberado,
      dias_liberada: dias,
      pronta_aposentar: prontaParaAposentar(dias),
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
    INSERT INTO feature_flags (chave, descricao, ativo_todos, liberado_todos_em)
    VALUES (${k}, ${descricao || null}, false, NULL)
    ON CONFLICT (chave) DO NOTHING
  `);
  invalidarCacheFlags(k);
}

export async function setAtivoTodos(chave: string, ativo: boolean): Promise<void> {
  await garantirTabelas();
  if (ativo) {
    const r = await db.execute(sql`
      UPDATE feature_flags
      SET ativo_todos = true, liberado_todos_em = NOW()
      WHERE chave = ${chave}
    `);
    const n = (r as any).rowCount ?? (r as any).count;
    if (n === 0) throw new Error(`Flag '${chave}' não existe`);
  } else {
    const r = await db.execute(sql`
      UPDATE feature_flags
      SET ativo_todos = false, liberado_todos_em = NULL
      WHERE chave = ${chave}
    `);
    const n = (r as any).rowCount ?? (r as any).count;
    if (n === 0) throw new Error(`Flag '${chave}' não existe`);
    await db.execute(sql`DELETE FROM feature_flags_usuarios WHERE chave = ${chave}`);
  }
  invalidarCacheFlags(chave);
}

/** Remove a linha do banco. NÃO remove o if no código — faça isso antes. */
export async function aposentarFlag(chave: string): Promise<void> {
  await garantirTabelas();
  const r = await db.execute(sql`DELETE FROM feature_flags WHERE chave = ${chave}`);
  const n = (r as any).rowCount ?? (r as any).count;
  if (n === 0) throw new Error(`Flag '${chave}' não existe`);
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

export async function flagsDoUsuario(usuarioId: number): Promise<Record<string, boolean>> {
  await garantirTabelas();
  const flags = await listarFlagsAdmin();
  const out: Record<string, boolean> = {};
  for (const f of flags) {
    out[f.chave] = await flagAtiva(f.chave, usuarioId);
  }
  return out;
}

export async function listarChavesNoBanco(): Promise<string[]> {
  await garantirTabelas();
  const r = await db.execute(sql`SELECT chave FROM feature_flags ORDER BY chave`);
  return (((r as any).rows || r) as any[]).map((row) => String(row.chave));
}

export async function ensureFeatureFlagsBoot(): Promise<void> {
  try {
    await garantirTabelas();
  } catch (e: any) {
    console.error("[feature-flags] boot:", e?.message || e);
  }
}
