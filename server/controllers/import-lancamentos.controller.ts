import { Request, Response } from "express";
import { storage } from "../storage";
import { parseLancamentos, montarPreview, commitImport } from "../services/import-lancamentos.service";

/**
 * Importação de lançamentos PF (contas a pagar) a partir de planilha.
 * preview = dry-run (não grava); importar = grava com dedup.
 */
export const ImportLancamentosController = {
  // POST /api/importacao/lancamentos/preview  (multipart: arquivo)
  async preview(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });

      const wallet = await storage.getWalletByUserId(userId);
      if (!wallet) return res.status(400).json({ error: "Carteira não encontrada para este usuário." });

      const parsed = parseLancamentos(file.buffer);
      if (parsed.linhas.length === 0 && parsed.erros.length === 0) {
        return res.status(400).json({ error: "Não encontrei lançamentos na planilha. Confira o formato." });
      }
      const previewData = await montarPreview(userId, wallet.id, parsed);
      return res.json(previewData);
    } catch (err: any) {
      console.error("[ImportLancamentos] preview:", err?.message);
      return res.status(500).json({ error: "Falha ao ler a planilha: " + (err?.message || "erro interno") });
    }
  },

  // POST /api/importacao/lancamentos  (multipart: arquivo)
  async importar(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const file = (req as any).file;
      if (!file?.buffer) return res.status(400).json({ error: "Envie um arquivo (.xlsx ou .csv) no campo 'arquivo'." });

      const wallet = await storage.getWalletByUserId(userId);
      if (!wallet) return res.status(400).json({ error: "Carteira não encontrada para este usuário." });

      const parsed = parseLancamentos(file.buffer);
      if (parsed.linhas.length === 0) {
        return res.status(400).json({ error: "Nenhum lançamento válido para importar.", erros: parsed.erros });
      }
      const result = await commitImport(userId, wallet.id, parsed);
      return res.json(result);
    } catch (err: any) {
      console.error("[ImportLancamentos] importar:", err?.message);
      return res.status(500).json({ error: "Falha ao importar: " + (err?.message || "erro interno") });
    }
  },
};
