import { Request, Response } from "express";
import { storage } from "../storage";
import { uazapiService } from "../services/uazapi.service";
import { transcribeAudio, analyzeWithGemini, runAgent } from "../services/ai-agent.service";
import bcrypt from "bcryptjs";

/**
 * UazAPI Webhook Controller — substitui o N8N.
 *
 * Recebe POST do UazAPI com a mensagem do WhatsApp, processa o pipeline completo:
 * 1. Parse do payload
 * 2. Lookup/criação de usuário
 * 3. Resolução de conteúdo (texto/áudio/imagem/pdf)
 * 4. Agente IA (function calling)
 * 5. Resposta via UazAPI
 */

// Debounce: evita processar a mesma mensagem 2x (UazAPI pode enviar duplicados)
const processedMessages = new Map<string, number>();
const DEBOUNCE_TTL = 30000; // 30 segundos

function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  // Limpar entradas antigas a cada 100 mensagens
  if (processedMessages.size > 100) {
    for (const [key, ts] of processedMessages) {
      if (now - ts > DEBOUNCE_TTL) processedMessages.delete(key);
    }
  }
  if (processedMessages.has(messageId)) return true;
  processedMessages.set(messageId, now);
  return false;
}

interface UazapiWebhookBody {
  BaseUrl: string;
  token: string;
  EventType: string;
  owner: string;
  instanceName: string;
  message: {
    chatid: string;
    messageType: string;
    text: string;
    messageid: string;
    messageTimestamp: number;
    senderName: string;
    fromMe: boolean;
    mediaType?: string;
  };
}

export const handleUazapiWebhook = async (req: Request, res: Response) => {
  // Retornar 200 imediatamente para não travar o UazAPI
  res.status(200).json({ received: true });

  try {
    const body = req.body as UazapiWebhookBody;

    // Validar payload mínimo
    if (!body?.message || !body.message.chatid || body.message.fromMe) {
      return; // Ignorar mensagens enviadas por nós ou inválidas
    }

    const { BaseUrl, token, message } = body;
    const { chatid, messageType, text, messageid, senderName } = message;

    // Debounce: ignorar mensagem duplicada
    if (isDuplicate(messageid)) {
      console.log(`[UazAPI Webhook] Mensagem duplicada ignorada: ${messageid}`);
      return;
    }

    console.log(`[UazAPI Webhook] ${messageType} de ${senderName} (${chatid}): "${text?.slice(0, 50)}..."`);

    // ============================================
    // 1. LOOKUP USUÁRIO
    // ============================================
    let user = await storage.getUserByRemoteJid(chatid);

    if (!user) {
      // Criar usuário (mesmo padrão do N8N)
      console.log(`[UazAPI Webhook] Novo usuário: ${senderName} (${chatid})`);
      const phone = chatid.split("@")[0];

      user = await storage.createUser({
        nome: senderName || "Usuário WhatsApp",
        email: chatid, // usa chatid como email provisório
        telefone: phone,
        senha: "mudar@123",
        remoteJid: chatid,
        tipo_usuario: "normal",
        ativo: false,
      } as any);

      // Criar carteira
      await storage.createWallet({
        usuario_id: user.id,
        nome: "Principal",
        descricao: "Carteira principal criada automaticamente",
      });

      // Enviar mensagem de boas-vindas
      // Buscar mensagem customizada se existir (welcome_messages table)
      const welcomeMsg = `Olá ${senderName?.split(" ")[0] || ""}! 👋\n\nBem-vindo ao *Controle Financeiro*!\n\nPara começar, ative sua assinatura e depois é só me mandar suas receitas e despesas por aqui. 📊`;

      await uazapiService.sendText(BaseUrl, token, chatid, welcomeMsg);
      return;
    }

    // Verificar se está ativo
    if (!user.ativo) {
      console.log(`[UazAPI Webhook] Usuário inativo: ${user.nome} (${user.id})`);
      const inactiveMsg = `Olá ${user.nome?.split(" ")[0] || ""}! 👋\n\nSua conta ainda não está ativa. Para começar a usar o sistema, ative sua assinatura.`;
      await uazapiService.sendText(BaseUrl, token, chatid, inactiveMsg);
      return;
    }

    // ============================================
    // 2. RESOLVER CONTEÚDO (texto/áudio/imagem/pdf)
    // ============================================
    let resolvedText = "";

    switch (messageType) {
      case "Conversation":
      case "ExtendedTextMessage":
        resolvedText = text || "";
        break;

      case "AudioMessage": {
        console.log(`[UazAPI Webhook] Transcrevendo áudio...`);
        const audioData = await uazapiService.downloadMedia(BaseUrl, token, messageid);
        resolvedText = await transcribeAudio(audioData.base64Data, audioData.mimetype);
        console.log(`[UazAPI Webhook] Transcrição: "${resolvedText.slice(0, 80)}..."`);
        break;
      }

      case "ImageMessage": {
        console.log(`[UazAPI Webhook] Analisando imagem...`);
        const imgData = await uazapiService.downloadMedia(BaseUrl, token, messageid);
        const imgText = await analyzeWithGemini(imgData.base64Data, imgData.mimetype, "image");
        // Se tem legenda (text), concatenar
        resolvedText = text ? `${imgText}, ${text}` : imgText;
        console.log(`[UazAPI Webhook] Análise imagem: "${resolvedText.slice(0, 80)}..."`);
        break;
      }

      case "DocumentMessage": {
        console.log(`[UazAPI Webhook] Analisando documento...`);
        const docData = await uazapiService.downloadMedia(BaseUrl, token, messageid);
        resolvedText = await analyzeWithGemini(docData.base64Data, docData.mimetype, "document");
        console.log(`[UazAPI Webhook] Análise doc: "${resolvedText.slice(0, 80)}..."`);
        break;
      }

      default:
        console.log(`[UazAPI Webhook] Tipo de mensagem não suportado: ${messageType}`);
        return;
    }

    if (!resolvedText.trim()) {
      console.log(`[UazAPI Webhook] Mensagem vazia após resolução`);
      return;
    }

    // ============================================
    // 3. PREPARAR CONTEXTO PARA O AGENTE
    // ============================================
    const wallet = await storage.getWalletByUserId(user.id);
    if (!wallet) {
      console.error(`[UazAPI Webhook] Wallet não encontrada para user ${user.id}`);
      return;
    }

    const categories = await storage.getCategoriesByUserId(user.id);

    const agentContext = {
      userId: user.id,
      walletId: wallet.id,
      categories: categories.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
    };

    // ============================================
    // 4. CHAMAR AGENTE IA
    // ============================================
    console.log(`[UazAPI Webhook] Chamando agente IA para user ${user.id}...`);
    const agentResponse = await runAgent(resolvedText, agentContext);
    console.log(`[UazAPI Webhook] Resposta agente: "${agentResponse.slice(0, 100)}..."`);

    // ============================================
    // 5. ENVIAR RESPOSTA VIA UAZAPI
    // ============================================
    // Verificar se resposta contém URL de imagem (gráfico)
    const imageUrlMatch = agentResponse.match(/https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|gif|svg|webp)/gi);

    if (imageUrlMatch && imageUrlMatch.length > 0) {
      // Resposta com imagem: extrair URL e enviar como media
      const imageUrl = imageUrlMatch[0];
      const caption = agentResponse.replace(imageUrl, "").trim();
      await uazapiService.sendMedia(BaseUrl, token, chatid, imageUrl, caption);
    } else {
      // Resposta apenas texto: limpar HTML tags se houver
      const cleanResponse = agentResponse.replace(/<\/?[^>]+>/g, "");
      await uazapiService.sendText(BaseUrl, token, chatid, cleanResponse);
    }

    console.log(`[UazAPI Webhook] ✅ Resposta enviada para ${chatid}`);
  } catch (error: any) {
    console.error(`[UazAPI Webhook] ❌ Erro no pipeline:`, error.message);
    // Tentar enviar mensagem de erro ao usuário
    try {
      const { BaseUrl, token, message } = req.body;
      if (BaseUrl && token && message?.chatid) {
        await uazapiService.sendText(
          BaseUrl,
          token,
          message.chatid,
          "Desculpe, tive um probleminha técnico. Tente novamente em alguns segundos! 🔄"
        );
      }
    } catch (sendErr) {
      // Silenciar erro de fallback
    }
  }
};
