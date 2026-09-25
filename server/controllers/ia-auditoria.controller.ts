import { Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Auditoria da IA do WhatsApp (super admin): cada mensagem com o resultado,
 * as ferramentas chamadas, os argumentos e o resumo da resposta de cada uma.
 * Filtros: resultado (sucesso/erro/...), usuario_id, busca no texto, dias.
 */
export async function listarEventosIa(req: Request, res: Response) {
  try {
    const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 50));
    const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 7));
    const resultado = String(req.query.resultado || "").trim();
    const usuarioId = Number(req.query.usuario_id) || null;
    const busca = String(req.query.q || "").trim();
    const rows = await db.execute(sql`
      SELECT e.id, e.data_criacao, e.usuario_id, u.nome AS usuario_nome, e.tipo_mensagem,
             e.mensagem_raw, e.resultado, e.etapa, e.detalhe, e.provider, e.modelo, e.decisoes
      FROM ingestion_events e
      LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.data_criacao > now() - (${dias} || ' days')::interval
        AND (${resultado} = '' OR e.resultado = ${resultado})
        AND (${usuarioId}::int IS NULL OR e.usuario_id = ${usuarioId})
        AND (${busca} = '' OR e.mensagem_raw ILIKE ${"%" + busca + "%"})
      ORDER BY e.id DESC
      LIMIT ${limite}
    `);
    const resumo = await db.execute(sql`
      SELECT resultado, count(*)::int AS total
      FROM ingestion_events
      WHERE data_criacao > now() - (${dias} || ' days')::interval
      GROUP BY resultado ORDER BY total DESC
    `);
    res.json({ eventos: rows, resumo });
  } catch (err: any) {
    console.error("[IA auditoria] erro:", err?.message);
    res.status(500).json({ error: "Erro ao listar eventos da IA" });
  }
}
