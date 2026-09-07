/**
 * Limpeza cirúrgica: fantasmas PF de usuários PJ (Nelson tx#349, Rafael tx#350).
 *
 * Dry-run (só mostra):  npx tsx scripts/limpar-fantasmas-pj-em-pf.ts
 * Executar (lixeira):   npx tsx scripts/limpar-fantasmas-pj-em-pf.ts --executar
 *
 * NÃO toca em empresas_transacoes. Soft-delete → transacoes_lixeira (reversível).
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";

type Alvo = {
  txId: number;
  usuarioId: number;
  valor: string;
  descricaoContem: string;
  motivo: string;
};

/** Allowlist fechada — não generalize sem revisão humana. */
const ALVOS: Alvo[] = [
  {
    txId: 349,
    usuarioId: 29,
    valor: "2112.55",
    descricaoContem: "Pagamento de fatura",
    motivo: "Nelson PJ — fantasma PF que distorceu resumo semanal",
  },
  {
    txId: 350,
    usuarioId: 30,
    valor: "146.95",
    descricaoContem: "Abastecimento",
    motivo: "Rafael PJ — duplicata de empresas_transacoes #100",
  },
];

const EXECUTAR = process.argv.includes("--executar");

function normValor(v: unknown): string {
  return Number(v).toFixed(2);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Defina DATABASE_URL");
    process.exit(1);
  }

  console.log(EXECUTAR ? "MODO: EXECUTAR (soft-delete → lixeira)\n" : "MODO: dry-run (nada será apagado)\n");

  let ok = 0;
  let bloqueados = 0;

  for (const alvo of ALVOS) {
    console.log(`— tx#${alvo.txId} (user #${alvo.usuarioId}): ${alvo.motivo}`);

    const rows = await db.execute(sql`
      SELECT
        t.id, t.descricao, t.valor, t.tipo, t.status, t.data_transacao, t.carteira_id,
        u.id AS usuario_id, u.nome, u.email, u.tipo_pessoa, u.ativo
      FROM transacoes t
      JOIN carteiras c ON c.id = t.carteira_id
      JOIN usuarios u ON u.id = c.usuario_id
      WHERE t.id = ${alvo.txId}
      LIMIT 1
    `);
    const list = ((rows as any).rows || rows) as any[];
    const t = list[0];

    if (!t) {
      console.log("   já ausente (nada a fazer)\n");
      ok++;
      continue;
    }

    const falhas: string[] = [];
    if (Number(t.usuario_id) !== alvo.usuarioId) {
      falhas.push(`usuario_id=${t.usuario_id} ≠ ${alvo.usuarioId}`);
    }
    if (String(t.tipo_pessoa || "").toLowerCase() !== "juridica") {
      falhas.push(`tipo_pessoa=${t.tipo_pessoa} (esperado juridica)`);
    }
    if (normValor(t.valor) !== normValor(alvo.valor)) {
      falhas.push(`valor=${t.valor} ≠ ${alvo.valor}`);
    }
    if (!String(t.descricao || "").toLowerCase().includes(alvo.descricaoContem.toLowerCase())) {
      falhas.push(`descricao="${t.descricao}" sem "${alvo.descricaoContem}"`);
    }

    const fk = await db.execute(sql`
      SELECT id FROM faturas WHERE transacao_pagamento_id = ${alvo.txId} LIMIT 5
    `);
    const faturas = ((fk as any).rows || fk) as any[];
    if (faturas.length) {
      falhas.push(`ligado a fatura(s) PF: ${faturas.map((f) => f.id).join(",")}`);
    }

    console.log(
      `   achado: ${t.nome} · ${t.data_transacao} ${t.tipo} R$ ${t.valor} · ${t.descricao} · status=${t.status}`,
    );

    if (falhas.length) {
      bloqueados++;
      console.error(`   BLOQUEADO: ${falhas.join("; ")}\n`);
      continue;
    }

    if (!EXECUTAR) {
      console.log("   dry-run OK — passaria para lixeira com --executar\n");
      ok++;
      continue;
    }

    await db.execute(sql`
      INSERT INTO transacoes_lixeira (usuario_id, carteira_id, transacao_id, dados)
      SELECT ${alvo.usuarioId}, carteira_id, id, to_jsonb(t)
      FROM transacoes t
      WHERE id = ${alvo.txId} AND carteira_id = ${t.carteira_id}
    `);
    await db.execute(sql`
      DELETE FROM transacoes
      WHERE id = ${alvo.txId} AND carteira_id = ${t.carteira_id}
    `);
    console.log("   removido da PF → lixeira\n");
    ok++;
  }

  console.log(`Resumo: ok=${ok} bloqueados=${bloqueados}`);
  if (bloqueados) process.exit(1);
  if (!EXECUTAR) {
    console.log("\nPara aplicar: npm run limpar:fantasmas-pj-em-pf -- --executar");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
