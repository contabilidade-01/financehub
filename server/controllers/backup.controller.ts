/**
 * Backups do banco — endpoints de super admin.
 * Listar, gerar na hora e baixar o arquivo .sql.gz.
 */
import { Request, Response } from "express";
import {
  criarBackup,
  listarBackups,
  obterBackup,
  slotAtual,
  HORARIOS,
  MAX_BACKUPS,
} from "../services/backup.service";

export async function listar(_req: Request, res: Response) {
  try {
    const backups = await listarBackups();
    res.json({
      success: true,
      backups,
      politica: {
        horarios: HORARIOS,
        fuso: "America/Sao_Paulo",
        maximo: MAX_BACKUPS,
        slot_atual: slotAtual(),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Erro ao listar backups" });
  }
}

export async function gerarAgora(_req: Request, res: Response) {
  try {
    const r = await criarBackup("manual");
    if (!r.ok) return res.status(500).json({ success: false, message: r.erro });
    res.json({
      success: true,
      id: r.id,
      tamanho_bytes: r.tamanho,
      linhas: r.linhas,
      message: "Backup gerado.",
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Erro ao gerar backup" });
  }
}

export async function baixar(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Id inválido." });
    }
    const arquivo = await obterBackup(id);
    if (!arquivo) {
      return res.status(404).json({ success: false, message: "Backup não encontrado ou sem conteúdo." });
    }
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${arquivo.nome}"`);
    res.setHeader("Content-Length", String(arquivo.conteudo.length));
    res.end(arquivo.conteudo);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Erro ao baixar backup" });
  }
}
