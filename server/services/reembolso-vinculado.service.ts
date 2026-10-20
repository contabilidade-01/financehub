/**
 * Reembolso vinculado entre dois usuários (caso pontual, atrás de FLAG_REEMBOLSO_VINCULADO).
 *
 * Cada reembolso pendente no "A Receber" do credor (transacoes.reembolsavel) ganha um
 * espelho no Contas a Pagar do devedor — PF (transacoes) ou PJ (empresas_transacoes,
 * 1ª empresa ativa), conforme o tipo_pessoa do devedor. Quando o credor dá baixa
 * (recebido), o espelho é baixado na mesma data.
 *
 * Só toca: os reembolsos do credor (leitura) e os lançamentos que ele mesmo criou no
 * devedor (registrados em reembolsos_espelhos). Nada roda com a flag desligada.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

/** Pares credor → devedor (e-mails do login). */
export const VINCULOS_REEMBOLSO: ReadonlyArray<{ credor: string; devedor: string }> = [
  { credor: "closur00001@gmail.com", devedor: "closur00002@gmail.com" },
];

type Destino = { tipo: "pf"; carteiraId: number } | { tipo: "pj"; empresaId: number };

let rodando = false;

async function usuarioPorEmail(email: string): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT id, nome, email, tipo_pessoa FROM usuarios WHERE LOWER(email) = LOWER(${email}) LIMIT 1
  `);
  return (r as any[])[0] ?? null;
}

async function carteiraDe(usuarioId: number): Promise<number | null> {
  const r = await db.execute(sql`SELECT id FROM carteiras WHERE usuario_id = ${usuarioId} ORDER BY id LIMIT 1`);
  const row = (r as any[])[0];
  return row ? Number(row.id) : null;
}

async function destinoDo(devedor: any): Promise<Destino | null> {
  if (devedor.tipo_pessoa === "juridica") {
    const r = await db.execute(sql`
      SELECT id FROM empresas WHERE usuario_id = ${devedor.id} AND ativo = true ORDER BY id LIMIT 1
    `);
    const row = (r as any[])[0];
    return row ? { tipo: "pj", empresaId: Number(row.id) } : null;
  }
  const carteiraId = await carteiraDe(devedor.id);
  return carteiraId ? { tipo: "pf", carteiraId } : null;
}

async function categoriaDespesa(destino: Destino, usuarioId: number): Promise<number | null> {
  const ordem = sql`CASE WHEN nome ILIKE '%reembols%' THEN 0 WHEN nome ILIKE 'outr%' THEN 1 ELSE 2 END, id`;
  const r = destino.tipo === "pj"
    ? await db.execute(sql`
        SELECT id FROM empresas_contas
        WHERE empresa_id = ${destino.empresaId} AND tipo = 'Despesa' AND COALESCE(sintetica, false) = false
        ORDER BY ${ordem} LIMIT 1
      `)
    : await db.execute(sql`
        SELECT id FROM categorias
        WHERE tipo = 'Despesa' AND (usuario_id = ${usuarioId} OR global = true)
        ORDER BY CASE WHEN usuario_id = ${usuarioId} THEN 0 ELSE 1 END, ${ordem} LIMIT 1
      `);
  const row = (r as any[])[0];
  return row ? Number(row.id) : null;
}

async function criarEspelho(destino: Destino, categoriaId: number, rec: any, credorNome: string): Promise<number> {
  const descricao = `Reembolso a ${credorNome}: ${rec.descricao}`.slice(0, 255);
  const venc = String(rec.data_vencimento || rec.data_transacao).slice(0, 10);
  const dataTx = String(rec.data_transacao).slice(0, 10);
  const r = destino.tipo === "pj"
    ? await db.execute(sql`
        INSERT INTO empresas_transacoes
          (empresa_id, categoria_id, descricao, valor, tipo, data_transacao, status, data_vencimento, origem, movimenta_caixa)
        VALUES
          (${destino.empresaId}, ${categoriaId}, ${descricao}, ${rec.valor}, 'Despesa', ${dataTx}, 'Pendente', ${venc}, 'manual', true)
        RETURNING id
      `)
    : await db.execute(sql`
        INSERT INTO transacoes
          (carteira_id, categoria_id, descricao, valor, tipo, data_transacao, status, data_vencimento, origem, movimenta_caixa)
        VALUES
          (${destino.carteiraId}, ${categoriaId}, ${descricao}, ${rec.valor}, 'Despesa', ${dataTx}, 'Pendente', ${venc}, 'manual', true)
        RETURNING id
      `);
  return Number((r as any[])[0].id);
}

const tabelaDestino = (destino: string) => (destino === "pj" ? sql`empresas_transacoes` : sql`transacoes`);

async function sincronizarPar(credorEmail: string, devedorEmail: string): Promise<void> {
  const { flagAtiva, FLAG_REEMBOLSO_VINCULADO } = await import("./feature-flags.service");
  const credor = await usuarioPorEmail(credorEmail);
  if (!credor || !(await flagAtiva(FLAG_REEMBOLSO_VINCULADO, credor.id))) return;
  const devedor = await usuarioPorEmail(devedorEmail);
  if (!devedor || devedor.id === credor.id) return;
  const carteiraCredor = await carteiraDe(credor.id);
  const destino = await destinoDo(devedor);
  if (!carteiraCredor || !destino) return;

  // 1) Reembolsos pendentes ainda sem espelho → cria no Contas a Pagar do devedor.
  const novos = (await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.data_transacao, t.data_vencimento
    FROM transacoes t
    WHERE t.carteira_id = ${carteiraCredor}
      AND COALESCE(t.reembolsavel, false) = true
      AND t.status = 'Pendente'
      AND NOT EXISTS (SELECT 1 FROM reembolsos_espelhos e WHERE e.transacao_receber_id = t.id)
    ORDER BY t.id
  `)) as any[];
  if (novos.length) {
    const categoriaId = await categoriaDespesa(destino, devedor.id);
    if (!categoriaId) {
      console.warn(`[ReembolsoVinculado] devedor ${devedor.id} sem categoria de despesa; nada criado.`);
    } else {
      const credorNome = String(credor.nome || credor.email).split(" ")[0];
      for (const rec of novos) {
        const pagarId = await criarEspelho(destino, categoriaId, rec, credorNome);
        await db.execute(sql`
          INSERT INTO reembolsos_espelhos (transacao_receber_id, devedor_usuario_id, destino, transacao_pagar_id)
          VALUES (${rec.id}, ${devedor.id}, ${destino.tipo}, ${pagarId})
        `);
      }
    }
  }

  const espelhos = (await db.execute(sql`
    SELECT e.id, e.destino, e.transacao_pagar_id,
           r.id AS rec_id, r.status AS rec_status, r.data_pagamento AS rec_pago_em,
           COALESCE(r.reembolsavel, false) AS rec_reembolsavel,
           r.valor AS rec_valor, r.data_transacao AS rec_data, r.data_vencimento AS rec_venc
    FROM reembolsos_espelhos e
    LEFT JOIN transacoes r ON r.id = e.transacao_receber_id AND r.carteira_id = ${carteiraCredor}
    WHERE e.devedor_usuario_id = ${devedor.id}
  `)) as any[];

  const hoje = new Date().toISOString().slice(0, 10);
  for (const e of espelhos) {
    const tabela = tabelaDestino(e.destino);
    if (!e.rec_id || !e.rec_reembolsavel) {
      // Reembolso excluído ou desmarcado pelo credor → some o espelho ainda pendente.
      await db.execute(sql`DELETE FROM ${tabela} WHERE id = ${e.transacao_pagar_id} AND status = 'Pendente'`);
      await db.execute(sql`DELETE FROM reembolsos_espelhos WHERE id = ${e.id}`);
    } else if (e.rec_status === "Efetivada") {
      // Credor deu baixa (recebido) → baixa o contas a pagar do devedor na mesma data.
      const data = e.rec_pago_em ? String(e.rec_pago_em).slice(0, 10) : hoje;
      await db.execute(sql`
        UPDATE ${tabela} SET status = 'Efetivada', data_pagamento = ${data}, movimenta_caixa = true
        WHERE id = ${e.transacao_pagar_id} AND status = 'Pendente'
      `);
    } else {
      // Ainda pendente → acompanha valor e datas editados pelo credor.
      await db.execute(sql`
        UPDATE ${tabela}
        SET valor = ${e.rec_valor},
            data_transacao = ${String(e.rec_data).slice(0, 10)},
            data_vencimento = ${String(e.rec_venc || e.rec_data).slice(0, 10)}
        WHERE id = ${e.transacao_pagar_id} AND status = 'Pendente'
          AND (valor <> ${e.rec_valor}
               OR data_transacao <> ${String(e.rec_data).slice(0, 10)}
               OR data_vencimento IS DISTINCT FROM ${String(e.rec_venc || e.rec_data).slice(0, 10)}::date)
      `);
    }
  }
}

/** Idempotente. Erros só vão para o log — nunca afetam quem chamou. */
export async function sincronizarReembolsosVinculados(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    for (const v of VINCULOS_REEMBOLSO) {
      try {
        await sincronizarPar(v.credor, v.devedor);
      } catch (err: any) {
        console.error(`[ReembolsoVinculado] ${v.credor} → ${v.devedor}:`, err?.message || err);
      }
    }
  } finally {
    rodando = false;
  }
}

const INTERVALO_MS = 2 * 60 * 1000;

export function iniciarSincronizacaoReembolsosVinculados(): void {
  setTimeout(() => { sincronizarReembolsosVinculados().catch(() => {}); }, 30 * 1000);
  setInterval(() => { sincronizarReembolsosVinculados().catch(() => {}); }, INTERVALO_MS);
}
