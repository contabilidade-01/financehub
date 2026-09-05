/**
 * Helper: carrega dotenv sem sobrescrever DATABASE_URL já setada,
 * e aborta com SKIP limpo se o pool não conectou.
 */
import { config } from "dotenv";
config({ override: false });

export function requireDbOrSkip(db: any, label: string): boolean {
  if (!db) {
    console.log(`SKIP (${label}): sem conexão — defina DATABASE_URL válida (ex.: Postgres local Docker).`);
    return false;
  }
  return true;
}

export async function pingDbOrSkip(db: any, label: string): Promise<boolean> {
  if (!requireDbOrSkip(db, label)) return false;
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (e: any) {
    console.log(`SKIP (${label}): banco inacessível — ${e?.code || e?.message || e}`);
    return false;
  }
}
