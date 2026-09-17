import { Request, Response } from "express";
import { storage } from "../storage";
import { getConversaRecente, appendConversa } from "../storage";
import { runAgent } from "../services/ai-agent.service";
import { deepseekStatusPublico } from "../services/deepseek.service";

/**
 * Orquestrador admin — chat com DeepSeek (não usa OpenAI do WhatsApp).
 * Super admin escolhe o usuário e conversa; as tools agem na carteira desse usuário.
 */

export async function statusOrquestrador(_req: Request, res: Response) {
  return res.json({
    provider: "deepseek",
    ...deepseekStatusPublico(),
    canal: "admin-orquestrador",
  });
}

export async function chatOrquestrador(req: Request, res: Response) {
  const status = deepseekStatusPublico();
  if (!status.configured) {
    return res.status(503).json({
      error: "DeepSeek não configurada",
      detalhe: "Defina DEEPSEEK_API_KEY no ambiente (só o orquestrador usa essa key).",
    });
  }

  const usuarioId = Number(req.body?.usuario_id);
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
    canal: "admin-orquestrador",
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
