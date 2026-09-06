import { Request, Response } from "express";
import { storage } from "../storage";
import { getConversaRecente, appendConversa } from "../storage";
import { runAgent } from "../services/ai-agent.service";

/**
 * Simulador de mensagem WhatsApp (somente homologação).
 * Exige SIMULADOR_WHATSAPP=true + super_admin.
 *
 * Mesmo pipeline do WhatsApp: histórico + runAgent (não envia UazAPI).
 */
export async function simularWhatsapp(req: Request, res: Response) {
  if (process.env.SIMULADOR_WHATSAPP !== "true") {
    return res.status(404).json({
      error: "Simulador indisponível neste ambiente",
      detalhe: "Defina SIMULADOR_WHATSAPP=true apenas na homologação",
    });
  }

  const usuarioId = Number(req.body?.usuario_id);
  const texto = String(req.body?.texto || "").trim();
  if (!Number.isFinite(usuarioId) || !texto) {
    return res.status(400).json({ error: "Informe usuario_id e texto" });
  }

  const user = await storage.getUser(usuarioId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  const phoneRaw = String(user.telefone || "").replace(/\D/g, "");
  const chatid = phoneRaw
    ? `${phoneRaw.startsWith("55") ? phoneRaw : `55${phoneRaw}`}@s.whatsapp.net`
    : `simulado${usuarioId}@s.whatsapp.net`;

  const wallet = await storage.getWalletByUserId(user.id);
  if (!wallet) {
    return res.status(400).json({ error: "Usuário sem carteira — não dá para simular o agente" });
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
  };

  const historico = await getConversaRecente(user.id, 6);
  const t0 = Date.now();
  let resposta: string;
  try {
    resposta = await runAgent(texto, agentContext, historico);
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || "Erro no agente",
      usuario: { id: user.id, nome: user.nome, email: user.email },
      tools: toolTrace,
    });
  }

  await appendConversa(user.id, "user", texto);
  await appendConversa(user.id, "assistant", resposta);

  // Payload espelho do webhook (documentação / debug) — não reenvia à UazAPI.
  const payloadUazapi = {
    EventType: "messages",
    BaseUrl: "https://simulador.local",
    token: "SIMULADOR",
    message: {
      chatid,
      messageType: "Conversation",
      text,
      messageid: `sim-${Date.now()}`,
      messageTimestamp: Math.floor(Date.now() / 1000),
      fromMe: false,
      senderName: user.nome || "Simulador",
    },
  };

  return res.json({
    success: true,
    ms: Date.now() - t0,
    usuario: { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone },
    empresa: empresaAtiva,
    texto_enviado: texto,
    resposta,
    tools: toolTrace,
    payload_uazapi_espelho: payloadUazapi,
    nota:
      "Mesmo runAgent + histórico do WhatsApp. Envio UazAPI não é chamado (homologação sem token).",
  });
}
