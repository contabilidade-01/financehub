/**
 * Auditoria: lançamentos em `transacoes` (PF) de usuários PJ.
 * Uso: DATABASE_URL=... npx tsx scripts/auditar-pj-em-transacoes-pf.ts
 *
 * Não altera dados — só lista.
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Defina DATABASE_URL");
    process.exit(1);
  }

  const rows = await db.execute(sql`
    SELECT
      u.id AS usuario_id,
      u.nome,
      u.email,
      u.tipo_pessoa,
      u.ativo,
      t.id AS tx_id,
      t.descricao,
      t.valor,
      t.tipo,
      t.data_transacao,
      t.status,
      t.metodo_pagamento
    FROM usuarios u
    JOIN carteiras c ON c.usuario_id = u.id
    JOIN transacoes t ON t.carteira_id = c.id
    WHERE LOWER(COALESCE(u.tipo_pessoa, '')) = 'juridica'
    ORDER BY t.data_transacao DESC, t.id DESC
    LIMIT 500
  `);

  const list = ((rows as any).rows || rows) as any[];
  console.log(`Encontrados ${list.length} lançamento(s) PF de usuários PJ (máx 500).\n`);

  const porUser = new Map<number, any[]>();
  for (const r of list) {
    const id = Number(r.usuario_id);
    if (!porUser.has(id)) porUser.set(id, []);
    porUser.get(id)!.push(r);
  }

  for (const [uid, txs] of porUser) {
    const u = txs[0];
    console.log(`— #${uid} ${u.nome} (${u.email}) ativo=${u.ativo} · ${txs.length} tx`);
    for (const t of txs.slice(0, 15)) {
      console.log(
        `   tx#${t.tx_id} ${t.data_transacao} ${t.tipo} R$ ${t.valor} · ${String(t.descricao || "").slice(0, 60)} · status=${t.status} meio=${t.metodo_pagamento || "-"}`,
      );
    }
    if (txs.length > 15) console.log(`   … +${txs.length - 15} mais`);
  }

  // Possíveis duplicatas por valor+data+descrição vs empresas_transacoes
  console.log("\n--- Possíveis duplicatas (mesmo usuário, valor, data, descrição parecida) ---\n");
  const dups = await db.execute(sql`
    SELECT
      u.id AS usuario_id,
      u.nome,
      t.id AS tx_pf_id,
      et.id AS tx_pj_id,
      t.valor,
      t.data_transacao,
      t.descricao AS desc_pf,
      et.descricao AS desc_pj,
      et.empresa_id
    FROM usuarios u
    JOIN carteiras c ON c.usuario_id = u.id
    JOIN transacoes t ON t.carteira_id = c.id
    JOIN empresas e ON e.usuario_id = u.id
    JOIN empresas_transacoes et ON et.empresa_id = e.id
      AND et.data_transacao = t.data_transacao
      AND et.valor::numeric = t.valor::numeric
      AND LOWER(TRIM(et.descricao)) = LOWER(TRIM(t.descricao))
    WHERE LOWER(COALESCE(u.tipo_pessoa, '')) = 'juridica'
    ORDER BY t.data_transacao DESC
    LIMIT 100
  `);
  const dlist = ((dups as any).rows || dups) as any[];
  console.log(`${dlist.length} par(es) candidato(s) a duplicata.`);
  for (const d of dlist.slice(0, 30)) {
    console.log(
      `  user#${d.usuario_id} ${d.nome} · ${d.data_transacao} R$ ${d.valor} · PF#${d.tx_pf_id} ↔ PJ#${d.tx_pj_id} emp=${d.empresa_id}`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
