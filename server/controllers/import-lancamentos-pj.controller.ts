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

      // A receber: data de referência = vencimento (previsão) ou lançamento.
      const ref = sql`COALESCE(t.data_vencimento, t.data_transacao)`;
      const de = dataISO(req.query.de);
      const ate = dataISO(req.query.ate);
      const status = typeof req.query.status === "string" ? req.query.status : "";

      const rows = await db.execute(sql`
        SELECT t.id, t.descricao, t.valor, t.data_transacao, t.data_vencimento, t.status, t.tipo,
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

  /** Marca recebido → vira Receita efetivada e passa a entrar em Transações/relatórios. */
  async receber(req: Request, res: Response) {
    try {
      const empresaId = parseInt(req.params.id);
      const transacaoId = parseInt(req.params.transacaoId);
      if (isNaN(empresaId) || isNaN(transacaoId)) return res.status(400).json({ error: "ID inválido." });
      const empresa = await resolveEmpresa(empresaId, req.user!.id, res);
      if (!empresa) return;

      const atual = await db.execute(sql`
        SELECT id, tipo, categoria_id, conta_bancaria_id, cartao_id
        FROM empresas_transacoes
        WHERE id = ${transacaoId} AND empresa_id = ${empresaId} AND reembolso_pessoal = true
        LIMIT 1
      `);
      const row = (atual as any[])[0];
      if (!row) return res.status(404).json({ error: "Reembolso não encontrado." });

      let categoriaId = Number(row.categoria_id);
      const catAtual = await storage.getEmpresaContaById(categoriaId);
      if (!catAtual || catAtual.tipo !== "Receita") {
        const contas = await storage.getEmpresasContasByEmpresaId(empresaId);
        const receita =
          contas.find((c: any) => c.codigo === "1.03") ||
          contas.find((c: any) => c.tipo === "Receita" && /outras/i.test(String(c.nome || ""))) ||
          contas.find((c: any) => c.tipo === "Receita");
        if (!receita) {
          return res.status(400).json({
            error: "Cadastre uma conta de Receita no plano de contas para receber o reembolso.",
          });
        }
        categoriaId = receita.id;
      }

      let contaBancariaId = row.conta_bancaria_id != null ? Number(row.conta_bancaria_id) : null;
      if (!contaBancariaId) {
        const { garantirCaixinhaPj } = await import("../services/meio-pagamento-pj");
        const caixa = await garantirCaixinhaPj(empresaId, req.user!.id);
        contaBancariaId = caixa.id;
      }

      const upd = await db.execute(sql`
        UPDATE empresas_transacoes
        SET status = 'Efetivada',
            tipo = 'Receita',
            categoria_id = ${categoriaId},
            movimenta_caixa = true,
            cartao_id = NULL,
            fatura_id = NULL,
            competencia = NULL,
            conta_bancaria_id = ${contaBancariaId},
            data_pagamento = CURRENT_DATE
        WHERE id = ${transacaoId} AND empresa_id = ${empresaId} AND reembolso_pessoal = true
        RETURNING id, status, tipo, categoria_id, conta_bancaria_id
      `);
      if (!(upd as any[])[0]) return res.status(404).json({ error: "Reembolso não encontrado." });
      return res.json((upd as any[])[0]);
    } catch (err) {
      console.error("[ReembolsosPj] receber:", err);
      return res.status(500).json({ error: "Erro interno." });
    }
  },

  /** Alias legado — mesmo comportamento de receber. */
  async pagar(req: Request, res: Response) {
    return ReembolsosPjController.receber(req, res);
  },
};
