import { Request, Response } from "express";
import {
  validarEntrada,
  previa as previaPublico,
  criarAviso,
  enviarTeste,
  listarAvisos,
  detalheAviso,
  reenviarFalhas,
  avisosNoAppDoUsuario,
  marcarLido,
  linkApp,
  MODELOS,
  type Canal,
  type Publico,
} from "../services/avisos.service";
import { storage } from "../storage";

/** Quem está agindo de verdade (o admin, mesmo se estiver personificando alguém). */
function ator(req: Request): any {
  return (req as any).originalUser || (req as any).user;
}

function publicoDe(body: any): Publico {
  const p = body?.publico || {};
  if (p.tipo === "selecionados") return { tipo: "selecionados", usuarios: (p.usuarios || []).map(Number) };
  return { tipo: p.tipo };
}

export async function listar(_req: Request, res: Response) {
  try {
    return res.json({ avisos: await listarAvisos(), modelos: MODELOS, link_app: linkApp() });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar avisos" });
  }
}

export async function previa(req: Request, res: Response) {
  try {
    const p = publicoDe(req.body);
    if (p.tipo === "selecionados" && !p.usuarios.length) return res.json({ total: 0, com_whatsapp: 0, com_email: 0 });
    return res.json(await previaPublico(p));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro na prévia" });
  }
}

export async function teste(req: Request, res: Response) {
  try {
    const erro = validarEntrada({ ...req.body, publico: { tipo: "todos" } });
    if (erro) return res.status(400).json({ error: erro });
    const admin = await storage.getUserById(ator(req).id);
    const resultado = await enviarTeste(admin as any, String(req.body.titulo), String(req.body.mensagem), req.body.canais as Canal[]);
    return res.json({ resultado });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro no teste" });
  }
}

export async function enviar(req: Request, res: Response) {
  try {
    const erro = validarEntrada(req.body);
    if (erro) return res.status(400).json({ error: erro });
    const r = await criarAviso(Number(ator(req).id), {
      titulo: String(req.body.titulo),
      mensagem: String(req.body.mensagem),
      canais: req.body.canais as Canal[],
      publico: publicoDe(req.body),
    });
    return res.status(201).json(r);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao enviar" });
  }
}

export async function detalhe(req: Request, res: Response) {
  try {
    const d = await detalheAviso(Number(req.params.id));
    if (!d) return res.status(404).json({ error: "Aviso não encontrado" });
    return res.json(d);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro" });
  }
}

export async function reenviar(req: Request, res: Response) {
  try {
    return res.json(await reenviarFalhas(Number(req.params.id)));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro" });
  }
}

/** Avisos "no app" ainda não lidos pelo cliente logado (personificação não marca nada como lido). */
export async function meus(req: Request, res: Response) {
  try {
    const u = (req as any).user;
    if (!u?.id) return res.json({ avisos: [] });
    return res.json({ avisos: await avisosNoAppDoUsuario(Number(u.id)) });
  } catch {
    return res.json({ avisos: [] });
  }
}

export async function lido(req: Request, res: Response) {
  try {
    const u = (req as any).user;
    if ((req as any).originalUser) return res.json({ ok: true, personificando: true });
    await marcarLido(Number(u.id), Number(req.params.id));
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro" });
  }
}
