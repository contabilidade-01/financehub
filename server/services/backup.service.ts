/**
 * Backup do banco — 3x por dia, os 20 mais recentes guardados no próprio banco.
 *
 * O sistema não tinha backup nenhum: a tela de admin só baixava o DDL, ou seja,
 * a estrutura vazia. Perder o banco significava perder todos os lançamentos dos
 * usuários.
 *
 * O arquivo gerado é um .sql restaurável de verdade: estrutura (CREATE TABLE,
 * chaves, índices) + dados (INSERT) + acerto das sequências, para os próximos
 * IDs não colidirem com o que foi restaurado. Vai comprimido em gzip, porque
 * são 20 cópias morando dentro do próprio Postgres.
 *
 * Os horários são fixos (03h, 11h e 19h de Brasília) e cada um vira um "slot"
 * com índice único. Assim o backup não se perde quando o container reinicia no
 * meio do dia — o agendador confere o slot corrente e roda o que faltou — e
 * duas instâncias subindo juntas não geram cópia dobrada.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { gzipSync } from "zlib";
import postgres from "postgres";

/** Quantas cópias ficam guardadas. As mais antigas caem. */
export const MAX_BACKUPS = 20;

/** Horários de Brasília em que o backup roda. */
export const HORARIOS = [3, 11, 19];

/** De 10 em 10 minutos o agendador confere se o slot corrente já rodou. */
const INTERVALO_CHECAGEM_MS = 10 * 60 * 1000;

/**
 * Fora do dump: a própria tabela de backups (senão cada cópia carrega as
 * anteriores dentro dela e o tamanho explode) e as tabelas de sessão, que são
 * descartáveis e só fariam o arquivo crescer.
 */
const NAO_DUMPAR = new Set(["backups", "session", "sessions"]);

export type BackupResumo = {
  id: number;
  criado_em: string;
  tipo: string;
  slot: string | null;
  tamanho_bytes: number;
  linhas: number;
  tabelas: number;
  erro: string | null;
};

// -------------------------------------------------------------------- tabela

let tabelaPronta = false;

/**
 * Cria a tabela de backups na primeira necessidade.
 *
 * Fica aqui, e não em auto-migrate.ts, porque o subsistema de backup é
 * autocontido: quem chama qualquer função pública já garante o schema, e não
 * há um passo de migração competindo com o resto do time no mesmo arquivo.
 */
export async function garantirTabelaBackups(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backups (
      id SERIAL PRIMARY KEY,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
      tipo VARCHAR(20) NOT NULL DEFAULT 'automatico',
      slot VARCHAR(20),
      formato VARCHAR(20) NOT NULL DEFAULT 'sql.gz',
      tamanho_bytes BIGINT NOT NULL DEFAULT 0,
      linhas INTEGER NOT NULL DEFAULT 0,
      tabelas JSONB,
      erro TEXT,
      conteudo BYTEA
    )
  `);
  // Índice único do slot: dois processos subindo juntos não geram cópia dobrada.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_slot ON backups(slot) WHERE slot IS NOT NULL
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_backups_criado ON backups(criado_em DESC)
  `);
  tabelaPronta = true;
}

// ---------------------------------------------------------------- horários

/** Data e hora de Brasília, independente do fuso do servidor. */
function agoraBrasilia(): { dia: string; hora: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const p: any = Object.fromEntries(
      fmt.formatToParts(new Date()).map((x) => [x.type, x.value]),
    );
    // Alguns ICU devolvem "24" à meia-noite.
    return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
  } catch {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3 na mão
    return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
  }
}

function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * O slot corrente: o último horário previsto que já passou.
 * Antes das 3h da manhã, ainda vale o slot das 19h de ontem.
 */
export function calcularSlot(dia: string, hora: number): string {
  const passados = HORARIOS.filter((h) => h <= hora);
  if (!passados.length) {
    return `${diaAnterior(dia)}T${String(HORARIOS[HORARIOS.length - 1]).padStart(2, "0")}`;
  }
  return `${dia}T${String(passados[passados.length - 1]).padStart(2, "0")}`;
}

export function slotAtual(): string {
  const { dia, hora } = agoraBrasilia();
  return calcularSlot(dia, hora);
}

// ------------------------------------------------------------ montagem SQL

/** Um valor JS virando literal SQL. */
export function literal(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString("hex")}'::bytea`;
  if (Array.isArray(v)) return `ARRAY[${v.map(literal).join(", ")}]`;
  if (typeof v === "object") return `${aspas(JSON.stringify(v))}::jsonb`;
  return aspas(String(v));
}

/** standard_conforming_strings é o padrão, então basta dobrar a aspa simples. */
function aspas(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function ident(nome: string): string {
  return `"${String(nome).replace(/"/g, '""')}"`;
}

async function listarTabelas(client: any): Promise<string[]> {
  const rows = await client`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map((r: any) => r.table_name).filter((n: string) => !NAO_DUMPAR.has(n));
}

/** CREATE TABLE + chaves + índices de uma tabela. */
async function estruturaDaTabela(client: any, tabela: string): Promise<string> {
  const colunas = await client`
    SELECT column_name, data_type, is_nullable, column_default,
           character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tabela}
    ORDER BY ordinal_position
  `;
  const pk = await client`
    SELECT kcu.column_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = ${tabela}
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `;
  const indices = await client`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ${tabela}
  `;

  let out = `-- ${"-".repeat(60)}\n-- Tabela: ${tabela}\n-- ${"-".repeat(60)}\n`;
  const defs = colunas.map((c: any) => {
    let d = `  ${ident(c.column_name)} ${c.data_type}`;
    if (c.character_maximum_length) d += `(${c.character_maximum_length})`;
    else if (c.numeric_precision && c.numeric_scale != null) {
      d += `(${c.numeric_precision},${c.numeric_scale})`;
    }
    if (c.is_nullable === "NO") d += " NOT NULL";
    if (c.column_default) d += ` DEFAULT ${c.column_default}`;
    return d;
  });
  out += `CREATE TABLE IF NOT EXISTS ${ident(tabela)} (\n${defs.join(",\n")}\n);\n`;

  if (pk.length) {
    const cols = pk.map((k: any) => ident(k.column_name)).join(", ");
    out += `ALTER TABLE ${ident(tabela)} ADD CONSTRAINT ${ident(pk[0].constraint_name)} PRIMARY KEY (${cols});\n`;
  }
  for (const idx of indices as any[]) {
    // O índice da PK já vem junto com a constraint acima.
    if (pk.length && idx.indexname === pk[0].constraint_name) continue;
    out += `${String(idx.indexdef).replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ")};\n`;
  }
  return out + "\n";
}

/** INSERTs de uma tabela, em blocos, para não carregar tudo na memória. */
async function dadosDaTabela(
  client: any,
  tabela: string,
  escrever: (s: string) => void,
): Promise<number> {
  const LOTE = 500;
  let offset = 0;
  let total = 0;

  for (;;) {
    const linhas = await client.unsafe(
      `SELECT * FROM ${ident(tabela)} ORDER BY 1 LIMIT ${LOTE} OFFSET ${offset}`,
    );
    if (!linhas.length) break;

    const colunas = Object.keys(linhas[0]).map(ident).join(", ");
    for (const l of linhas) {
      const vals = Object.values(l).map(literal).join(", ");
      escrever(`INSERT INTO ${ident(tabela)} (${colunas}) VALUES (${vals});\n`);
    }
    total += linhas.length;
    if (linhas.length < LOTE) break;
    offset += LOTE;
  }
  return total;
}

/**
 * Acerta a sequência do id depois de restaurar. Sem isto, o próximo INSERT
 * tentaria reusar um id que já existe e o banco recusaria.
 */
function acertarSequencia(tabela: string): string {
  return (
    `SELECT setval(s.seq, COALESCE(m.max, 1), COALESCE(m.max, 0) > 0)\n` +
    `  FROM (SELECT pg_get_serial_sequence('${tabela.replace(/'/g, "''")}', 'id') AS seq) s,\n` +
    `       (SELECT MAX(id) AS max FROM ${ident(tabela)}) m\n` +
    ` WHERE s.seq IS NOT NULL;\n`
  );
}

/** Monta o .sql completo (estrutura + dados + sequências). */
export async function gerarDump(): Promise<{
  conteudo: string;
  tabelas: Array<{ nome: string; linhas: number }>;
  linhas: number;
}> {
  const client = postgres(process.env.DATABASE_URL || "", { prepare: false });
  const partes: string[] = [];
  const escrever = (s: string) => partes.push(s);
  const tabelas: Array<{ nome: string; linhas: number }> = [];
  let linhas = 0;

  try {
    const nomes = await listarTabelas(client);

    escrever(`-- Backup FinanceHub\n-- Gerado em: ${new Date().toISOString()}\n`);
    escrever(`-- Tabelas: ${nomes.length}\n`);
    escrever(`--\n-- Restauração:\n--   gunzip -c backup.sql.gz | psql "$DATABASE_URL"\n\n`);
    escrever(`BEGIN;\n`);
    // Desliga a checagem de FK durante a carga: as tabelas entram em ordem
    // alfabética, não em ordem de dependência. Precisa ser dono do banco.
    escrever(`SET session_replication_role = replica;\n\n`);

    escrever(`-- ============ ESTRUTURA ============\n\n`);
    for (const t of nomes) escrever(await estruturaDaTabela(client, t));

    escrever(`-- ============ DADOS ============\n\n`);
    for (const t of nomes) {
      escrever(`-- ${t}\n`);
      const n = await dadosDaTabela(client, t, escrever);
      escrever(`\n`);
      tabelas.push({ nome: t, linhas: n });
      linhas += n;
    }

    escrever(`-- ============ SEQUÊNCIAS ============\n\n`);
    for (const t of nomes) escrever(acertarSequencia(t));

    escrever(`\nSET session_replication_role = DEFAULT;\nCOMMIT;\n`);
  } finally {
    await client.end().catch(() => {});
  }

  return { conteudo: partes.join(""), tabelas, linhas };
}

// ------------------------------------------------------------- persistência

/** Gera e guarda um backup. `slot` só nos automáticos. */
export async function criarBackup(
  tipo: "automatico" | "manual",
  slot: string | null = null,
): Promise<{ ok: boolean; id?: number; tamanho?: number; linhas?: number; erro?: string }> {
  try {
    await garantirTabelaBackups();
    const { conteudo, tabelas, linhas } = await gerarDump();
    const gz = gzipSync(Buffer.from(conteudo, "utf8"), { level: 9 });

    const r = await db.execute(sql`
      INSERT INTO backups (tipo, slot, formato, tamanho_bytes, linhas, tabelas, conteudo)
      VALUES (${tipo}, ${slot}, 'sql.gz', ${gz.length}, ${linhas},
              ${JSON.stringify(tabelas)}::jsonb, ${gz})
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const id = (r as any[])[0]?.id;
    if (!id) {
      // Índice único do slot: outra instância já gravou este horário.
      return { ok: true, erro: "slot já gravado" };
    }

    await aplicarRetencao();
    console.log(
      `[Backup] ${tipo}${slot ? ` (${slot})` : ""}: ${linhas} linhas, ${(gz.length / 1024).toFixed(0)} KB`,
    );
    return { ok: true, id, tamanho: gz.length, linhas };
  } catch (e: any) {
    const erro = e?.message || "falha desconhecida";
    console.error("[Backup] falhou:", erro);
    // Registra a falha SEM conteúdo, para o admin ver que o horário não rodou.
    try {
      await db.execute(sql`
        INSERT INTO backups (tipo, slot, formato, tamanho_bytes, linhas, erro)
        VALUES (${tipo}, ${slot}, 'sql.gz', 0, 0, ${erro})
        ON CONFLICT DO NOTHING
      `);
    } catch { /* não deixa o erro do log derrubar o job */ }
    return { ok: false, erro };
  }
}

/** Mantém só os MAX_BACKUPS mais recentes. */
export async function aplicarRetencao(): Promise<number> {
  const r = await db.execute(sql`
    DELETE FROM backups
    WHERE id NOT IN (
      SELECT id FROM backups ORDER BY criado_em DESC, id DESC LIMIT ${MAX_BACKUPS}
    )
    RETURNING id
  `);
  return (r as any[]).length;
}

export async function listarBackups(): Promise<BackupResumo[]> {
  await garantirTabelaBackups();
  const r = await db.execute(sql`
    SELECT id, criado_em, tipo, slot, tamanho_bytes, linhas, tabelas, erro
    FROM backups ORDER BY criado_em DESC, id DESC
  `);
  return (r as any[]).map((b) => ({
    id: Number(b.id),
    criado_em: b.criado_em,
    tipo: b.tipo,
    slot: b.slot,
    tamanho_bytes: Number(b.tamanho_bytes) || 0,
    linhas: Number(b.linhas) || 0,
    tabelas: Array.isArray(b.tabelas) ? b.tabelas.length : 0,
    erro: b.erro || null,
  }));
}

/** O arquivo em si, para o download. */
export async function obterBackup(
  id: number,
): Promise<{ nome: string; conteudo: Buffer } | null> {
  await garantirTabelaBackups();
  const r = await db.execute(sql`
    SELECT id, criado_em, conteudo FROM backups WHERE id = ${id} LIMIT 1
  `);
  const b = (r as any[])[0];
  if (!b || !b.conteudo) return null;
  const data = new Date(b.criado_em).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return {
    nome: `financehub-backup-${data}.sql.gz`,
    conteudo: Buffer.isBuffer(b.conteudo) ? b.conteudo : Buffer.from(b.conteudo),
  };
}

// --------------------------------------------------------------- agendador

let timer: NodeJS.Timeout | null = null;

/** Roda o slot corrente se ele ainda não foi gravado. */
export async function rodarSlotPendente(): Promise<void> {
  await garantirTabelaBackups();
  const slot = slotAtual();
  const r = await db.execute(sql`SELECT 1 FROM backups WHERE slot = ${slot} LIMIT 1`);
  if ((r as any[]).length) return;
  await criarBackup("automatico", slot);
}

export function iniciarAgendadorBackups(): void {
  if (timer) return;
  const tentar = () => {
    rodarSlotPendente().catch((e) =>
      console.error("[Backup] agendador:", e?.message || e),
    );
  };
  // No boot também: se o servidor passou o horário fora do ar, recupera.
  setTimeout(tentar, 30_000);
  timer = setInterval(tentar, INTERVALO_CHECAGEM_MS);
  console.log(
    `[Backup] agendado para ${HORARIOS.map((h) => `${h}h`).join(", ")} (Brasília), guardando ${MAX_BACKUPS} cópias`,
  );
}
