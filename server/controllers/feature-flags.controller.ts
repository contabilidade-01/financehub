import { Request, Response } from "express";
import {
  listarFlagsAdmin,
  criarFlag,
  setAtivoTodos,
  ligarUsuario,
  desligarUsuario,
  flagsDoUsuario,
  invalidarCacheFlags,
  aposentarFlag,
} from "../services/feature-flags.service";
import { storage } from "../storage";

export async function listarFlags(req: Request, res: Response) {
  try {
    const flags = await listarFlagsAdmin();
    // Enriquecer com nomes/emails dos usuários (busca leve).
    const allIds = [...new Set(flags.flatMap((f) => f.usuarios))];
    const mapa: Record<number, { id: number; nome: string | null; email: string | null }> = {};
    for (const id of allIds) {
      try {
        const u = await storage.getUserById(id);
        if (u) mapa[id] = { id: u.id, nome: u.nome ?? null, email: u.email ?? null };
      } catch {
        mapa[id] = { id, nome: null, email: null };
      }
    }
    return res.json({
      flags: flags.map((f) => ({
        ...f,
        usuarios_detalhe: f.usuarios.map((id) => mapa[id] || { id, nome: null, email: null }),
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar flags" });
  }
}

export async function criar(req: Request, res: Response) {
  try {
    const chave = String(req.body?.chave || "");
    const descricao = req.body?.descricao != null ? String(req.body.descricao) : undefined;
    await criarFlag(chave, descricao);
    return res.json({ success: true, chave });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao criar flag" });
  }
}

export async function liberarTodos(req: Request, res: Response) {
  try {
    const chave = String(req.params.chave || "");
    await setAtivoTodos(chave, true);
    invalidarCacheFlags(chave);
    return res.json({ success: true, chave, ativo_todos: true });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro" });
  }
}

export async function desligarTodos(req: Request, res: Response) {
  try {
    const chave = String(req.params.chave || "");
    await setAtivoTodos(chave, false);
    invalidarCacheFlags(chave);
    return res.json({ success: true, chave, ativo_todos: false });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro" });
  }
}

export async function ligarUser(req: Request, res: Response) {
  try {
    const chave = String(req.params.chave || "");
    const usuarioId = Number(req.body?.usuario_id);
    if (!Number.isFinite(usuarioId)) {
      return res.status(400).json({ error: "Informe usuario_id" });
    }
    await ligarUsuario(chave, usuarioId);
    return res.json({ success: true, chave, usuario_id: usuarioId });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro" });
  }
}

export async function desligarUser(req: Request, res: Response) {
  try {
    const chave = String(req.params.chave || "");
    const usuarioId = Number(req.body?.usuario_id ?? req.params.usuarioId);
    if (!Number.isFinite(usuarioId)) {
      return res.status(400).json({ error: "Informe usuario_id" });
    }
    await desligarUsuario(chave, usuarioId);
    return res.json({ success: true, chave, usuario_id: usuarioId });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro" });
  }
}

/** Flags do usuário autenticado (app). */
export async function minhasFlags(req: Request, res: Response) {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: "Não autenticado" });
    const flags = await flagsDoUsuario(uid);
    return res.json({ flags });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro" });
  }
}

/** Busca usuários para ligar flag (nome/email). */
export async function buscarUsuarios(req: Request, res: Response) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ usuarios: [] });
    const all = await storage.getAllUsers();
    const n = q.toLowerCase();
    const usuarios = (all as any[])
      .filter(
        (u) =>
          String(u.nome || "").toLowerCase().includes(n) ||
          String(u.email || "").toLowerCase().includes(n) ||
          String(u.telefone || "").includes(n) ||
          String(u.id) === q,
      )
      .slice(0, 20)
      .map((u) => ({ id: u.id, nome: u.nome, email: u.email, telefone: u.telefone }));
    return res.json({ usuarios });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro na busca" });
  }
}

/** Aposenta a linha no banco (só depois de limpar o if no código). */
export async function aposentar(req: Request, res: Response) {
  try {
    const chave = String(req.params.chave || "");
    await aposentarFlag(chave);
    return res.json({
      success: true,
      chave,
      mensagem:
        "Linha removida. Se o if (flagAtiva) ainda existir no código, a flag passa a valer false para todos.",
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao aposentar" });
  }
}
