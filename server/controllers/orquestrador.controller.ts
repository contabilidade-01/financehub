import { Request, Response } from "express";
import { storage } from "../storage";
import { getConversaRecente, appendConversa } from "../storage";
import { runAgent } from "../services/ai-agent.service";
import { deepseekStatusPublico } from "../services/deepseek.service";
import {
  flagAtiva,
  FLAG_ORQUESTRADOR_DEEPSEEK,
  ligarUsuario,
  desligarUsuario,
  listarFlagsAdmin,
  criarFlag,
} from "../services/feature-flags.service";

/**
 * Orquestrador DeepSeek.
 * - super_admin: escolhe qualquer usuário alvo + libera acesso a outros
 * - usuário com flag orquestrador_deepseek: conversa só na própria carteira
 */

async function garantirFlagOrquestrador() {
  try {
    await criarFlag(
      FLAG_ORQUESTRADOR_DEEPSEEK,
      "Chat orquestrador (DeepSeek). Super admin sempre; demais se marcados.",
    );
  } catch {
    // já existe
  }
}

export async function usuarioPodeOrquestrador(req: Request): Promise<boolean> {
  const u = req.originalUser || req.user;
  if (!u) return false;
  if (u.tipo_usuario === "super_admin") return true;
  return flagAtiva(FLAG_ORQUESTRADOR_DEEPSEEK, u.id);
}

export async function statusOrquestrador(req: Request, res: Response) {
  const pode = await usuarioPodeOrquestrador(req);
  if (!pode) return res.status(403).json({ error: "Acesso negado ao orquestrador" });

  const u = req.originalUser || req.user!;
  const isSuper = u.tipo_usuario === "super_admin";
  return res.json({
    provider: "deepseek",
    ...deepseekStatusPublico(),
    canal: "orquestrador",
    is_super_admin: isSuper,
    pode_escolher_alvo: isSuper,
    flag: FLAG_ORQUESTRADOR_DEEPSEEK,
  });
}

/** Lista usuários com a flag do orquestrador liberada. */
export async function listarLiberados(_req: Request, res: Response) {
  await garantirFlagOrquestrador();
  const flags = await listarFlagsAdmin();
  const f = flags.find((x) => x.chave === FLAG_ORQUESTRADOR_DEEPSEEK);
  const ids = f?.usuarios || [];
  const usuarios = [];
  for (const id of ids) {
    try {
      const u = await storage.getUserById(id);
      if (u) usuarios.push({ id: u.id, nome: u.nome, email: u.email });
      else usuarios.push({ id, nome: null, email: null });
    } catch {
      usuarios.push({ id, nome: null, email: null });
    }
  }
  return res.json({
    chave: FLAG_ORQUESTRADOR_DEEPSEEK,
    ativo_todos: f?.ativo_todos ?? false,
    usuarios,
  });
}

export async function liberarUsuario(req: Request, res: Response) {
  const usuarioId = Number(req.body?.usuario_id);
  if (!Number.isFinite(usuarioId)) {
    return res.status(400).json({ error: "Informe usuario_id" });
  }
  const user = await storage.getUserById(usuarioId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  await garantirFlagOrquestrador();
  await ligarUsuario(FLAG_ORQUESTRADOR_DEEPSEEK, usuarioId);
  return res.json({
    success: true,
    chave: FLAG_ORQUESTRADOR_DEEPSEEK,
    usuario: { id: user.id, nome: user.nome, email: user.email },
  });
}

export async function revogarUsuario(req: Request, res: Response) {
  const usuarioId = Number(req.body?.usuario_id ?? req.params.usuarioId);
  if (!Number.isFinite(usuarioId)) {
    return res.status(400).json({ error: "Informe usuario_id" });
  }
  await desligarUsuario(FLAG_ORQUESTRADOR_DEEPSEEK, usuarioId);
  return res.json({ success: true, chave: FLAG_ORQUESTRADOR_DEEPSEEK, usuario_id: usuarioId });
}

export async function chatOrquestrador(req: Request, res: Response) {
  const pode = await usuarioPodeOrquestrador(req);
  if (!pode) return res.status(403).json({ error: "Acesso negado ao orquestrador" });

  const status = deepseekStatusPublico();
  if (!status.configured) {
    return res.status(503).json({
      error: "DeepSeek não configurada",
      detalhe: "Defina DEEPSEEK_API_KEY no ambiente (só o orquestrador usa essa key).",
    });
  }

  const actor = req.originalUser || req.user!;
  const isSuper = actor.tipo_usuario === "super_admin";

  let usuarioId = Number(req.body?.usuario_id);
  // Usuário liberado: só age na própria carteira
  if (!isSuper) {
    usuarioId = actor.id;
  }

  const texto = String(req.body?.texto || "").trim();
  if (!Number.isFinite(usuarioId) || !texto) {
    return res.status(400).json({ error: "Informe usuario_id e texto" });
  }

  const user = await storage.getUserById(usuarioId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  const wallet = await storage.getWalletByUserId(user.id);
  if (!wallet) {
    return res.status(400).json({ error: "Usuário sem carteira — orquestrador precisa de carteira PF" });
  }

  const categories = await storage.getCategoriesByUserId(user.id);
  let empresaAtiva = null;
  if (user.tipo_pessoa === "juridica" && user.ativo) {
    const empresas = await storage.getEmpresasByUsuarioId(user.id);
    const comCnpj = empresas.find((e) => e.cnpj && e.cnpj.trim().length > 0);
    const emp = comCnpj || empresas[0];
    if (emp) {
      empresaAtiva = {
        id: emp.id,
        nome: emp.nome_fantasia || emp.razao_social,
        cnpj: emp.cnpj || null,
        segmento: (emp as any).segmento || null,
      };
    }
  }

  const toolTrace: { name: string; args: Record<string, unknown>; resultPreview: string }[] = [];
  const agentContext: any = {
    userId: user.id,
    walletId: wallet.id,
    categories: categories.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
    tipoPessoa: user.tipo_pessoa || "fisica",
    empresaAtiva,
    origemMidia: false,
    toolTrace,
    canal: "orquestrador",
  };

  const historico = await getConversaRecente(user.id, 8);
  const t0 = Date.now();
  let resposta: string;
  try {
    resposta = await runAgent(texto, agentContext, historico, { llm: "deepseek" });
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || "Erro no orquestrador",
      provider: "deepseek",
      model: status.model,
      usuario: { id: user.id, nome: user.nome, email: user.email },
      tools: toolTrace,
    });
  }

  await appendConversa(user.id, "user", texto);
  await appendConversa(user.id, "assistant", resposta);

  return res.json({
    success: true,
    ms: Date.now() - t0,
    provider: "deepseek",
    model: status.model,
    usuario: { id: user.id, nome: user.nome, email: user.email },
    empresa: empresaAtiva,
    texto_enviado: texto,
    resposta,
    tools: toolTrace,
  });
}
