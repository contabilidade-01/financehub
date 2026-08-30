import { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { parseLancamentosPj, montarPreviewPj, commitImportPj } from "../services/import-lancamentos-pj.service";

const resolveEmpresa = async (empresaId: number, userId: number, res: Response) => {
  const empresa = await storage.getEmpresaById(empresaId);
  if (!empresa) { res.status(404).json({ error: "Empresa não encontrada." }); return null; }
  if (empresa.usuario_id !== userId) { res.status(403).json({ error: "Acesso negado." }); return null; }
  return empresa;
};

export const ImportLancamentosPjController = {
  async preview(req: Request, res: Response) {
    try {
      const empresaId = parseInt(req.params.id);
      if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
      const empresa = await resolveEmpresa(empresaId, req.user!.id, res);
      if (!empresa) return;
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });
      const parsed = parseLancamentosPj(file.buffer);
      if (parsed.linhas.length === 0 && parsed.erros.length === 0) {
        return res.status(400).json({ error: "Não encontrei lançamentos na planilha. Use Data, Descrição, Categoria, Forma, Valor." });
      }
      return res.json(await montarPreviewPj(empresaId, parsed));
    } catch (err: any) {
      console.error("[ImportPj] preview:", err?.message);
      return res.status(500).json({ error: "Falha ao ler a planilha: " + (err?.message || "erro interno") });
    }
  },

  async importar(req: Request, res: Response) {
    try {
      const empresaId = parseInt(req.params.id);
      if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
      const empresa = await resolveEmpresa(empresaId, req.user!.id, res);
      if (!empresa) return;
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });
      const parsed = parseLancamentosPj(file.buffer);
      if (parsed.linhas.length === 0) {
        return res.status(400).json({ error: "Nenhum lançamento válido para importar.", erros: parsed.erros });
      }
      return res.json(await commitImportPj(empresaId, parsed));
    } catch (err: any) {
      console.error("[ImportPj] importar:", err?.message);
      return res.status(500).json({ error: "Falha ao importar: " + (err?.message || "erro interno") });
    }
  },
};

const dataISO = (v: unknown): string | undefined =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

export const ReembolsosPjController = {
  // GET /api/empresas/:id/reembolsos-pessoais?de=YYYY-MM-DD&ate=YYYY-MM-DD&status=Pendente
  async listar(req: Request, res: Response) {
    try {
      const empresaId = parseInt(req.params.id);
      if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
      const empresa = await resolveEmpresa(empresaId, req.user!.id, res);
      if (!empresa) return;

      // Reembolso é conta a pagar: a data que importa é o vencimento.
      const ref = sql`COALESCE(t.data_vencimento, t.data_transacao)`;
      const de = dataISO(req.query.de);
      const ate = dataISO(req.query.ate);
      const status = typeof req.query.status === "string" ? req.query.status : "";

      const rows = await db.execute(sql`
        SELECT t.id, t.descricao, t.valor, t.data_transacao, t.data_vencimento, t.status,
               t.itens_agrupados, t.metodo_pagamento, c.nome AS categoria, c.codigo AS categoria_codigo
        FROM empresas_transacoes t
        JOIN empresas_contas c ON c.id = t.categoria_id
        WHERE t.empresa_id = ${empresaId}
          AND t.reembolso_pessoal = true
          ${de ? sql`AND ${ref} >= ${de}` : sql``}
          ${ate ? sql`AND ${ref} <= ${ate}` : sql``}
          ${status ? sql`AND t.status = ${status}` : sql``}
        ORDER BY ${ref} DESC, t.id DESC
      `);
      return res.json(rows);
    } catch (err) {
      console.error("[ReembolsosPj] listar:", err);
      return res.status(500).json({ error: "Erro interno." });
    }
  },

  async pagar(req: Request, res: Response) {
    try {
      const empresaId = parseInt(req.params.id);
      const transacaoId = parseInt(req.params.transacaoId);
      if (isNaN(empresaId) || isNaN(transacaoId)) return res.status(400).json({ error: "ID inválido." });
      const empresa = await resolveEmpresa(empresaId, req.user!.id, res);
      if (!empresa) return;
      const upd = await db.execute(sql`
        UPDATE empresas_transacoes
        SET status = 'Efetivada', movimenta_caixa = true
        WHERE id = ${transacaoId} AND empresa_id = ${empresaId} AND reembolso_pessoal = true
        RETURNING id, status
      `);
      if (!(upd as any[])[0]) return res.status(404).json({ error: "Reembolso não encontrado." });
      return res.json((upd as any[])[0]);
    } catch (err) {
      console.error("[ReembolsosPj] pagar:", err);
      return res.status(500).json({ error: "Erro interno." });
    }
  },
};
