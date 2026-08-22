import { Request, Response } from "express";
import { storage } from "../storage";
import { seedPlanoContasPessoal, createIngestionEvent, getConversaRecente, appendConversa } from "../storage";
import { uazapiService } from "../services/uazapi.service";
import { transcribeAudio, analyzeWithGemini, runAgent } from "../services/ai-agent.service";
import { classifyAiError } from "../utils/ai-errors";
import { notificarAdmin } from "../services/admin-notify";
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

// ============================================
// Onboarding / Degustação (15 dias) — máquina de estados via status_assinatura
//   aguardando_confirmacao → aguardando_tipo_pessoa → degustacao → degustacao_expirada
// ============================================
const TRIAL_DIAS = 15;
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ehAfirmativo = (text: string) => {
  const t = norm(text);
  return /\b(sim|quero|aceito|aceitar|ativar|bora|vamos|claro|pode|comecar|começar|ok|isso|quero sim)\b/.test(t) || t === "s" || t === "1" || t.includes("👍");
};
const detectarTipoPessoa = (text: string): "fisica" | "juridica" | null => {
  const t = norm(text);
  if (/\b(pj|2|empresa|empresarial|juridica|negocio|cnpj|comercio)\b/.test(t)) return "juridica";
  if (/\b(pf|1|pessoal|pessoa fisica|fisica|particular|eu mesmo|minhas financas)\b/.test(t)) return "fisica";
  return null;
};
const dataTrialFim = () => new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000);
const fmtData = (d: Date) => d.toLocaleDateString("pt-BR");
const primeiro = (nome?: string | null) => (nome || "").split(" ")[0] || "";

const msgOferta = (nome?: string | null) =>
  `Olá ${primeiro(nome)}! 👋 Sou o assistente do *Controle Financeiro*.\n\nPosso liberar *${TRIAL_DIAS} dias grátis* para você testar tudo — é só responder *SIM* que eu ativo agora mesmo. 😊`;
const msgPerguntaTipo = (nome?: string | null) =>
  `Que ótimo, ${primeiro(nome)}! 🎉\n\nÉ para suas finanças *pessoais* ou da sua *empresa*?\n\nResponda:\n*1* — Pessoal (PF)\n*2* — Empresa (PJ)`;
const msgAtivadoPF = (nome: string | null | undefined, fim: Date) =>
  `Prontinho, ${primeiro(nome)}! ✅ Sua degustação de *${TRIAL_DIAS} dias* está ativa até *${fmtData(fim)}*.\n\nPode começar agora: me manda suas receitas e despesas por aqui que eu registro tudo. 📊`;
const msgAtivadoPJ = (nome: string | null | undefined, fim: Date) =>
  `Prontinho, ${primeiro(nome)}! ✅ Sua degustação *empresarial* de *${TRIAL_DIAS} dias* está ativa até *${fmtData(fim)}*.\n\nJá preparei o ambiente da sua empresa. Pode começar: me manda as entradas e saídas por aqui. 📊`;
const msgNudge = () => `Sem problema! Quando quiser testar os *${TRIAL_DIAS} dias grátis*, é só mandar *SIM*. 😉`;
const msgReperguntaTipo = () => `Só pra eu configurar certinho: responda *1* para *Pessoal (PF)* ou *2* para *Empresa (PJ)*.`;
const msgExpirado = (nome?: string | null) =>
  `Oi ${primeiro(nome)}! Seus *${TRIAL_DIAS} dias* de degustação chegaram ao fim. 🙌\n\nGostou? Nossa equipe vai entrar em contato para te ajudar a continuar. Qualquer coisa, estou por aqui!`;
const msgEmAnalise = (nome?: string | null) =>
  `Oi ${primeiro(nome)}! Sua conta está em análise no momento. Nossa equipe vai falar com você em breve para liberar o acesso. 😊`;

// Retorna true se a mensagem foi tratada pelo onboarding (não processar como transação).
async function tratarOnboarding(user: any, text: string, chatid: string, BaseUrl: string, token: string): Promise<boolean> {
  const status = user.status_assinatura || "";

  // Em degustação ativa: checa expiração dos 15 dias
  if (user.ativo && status === "degustacao") {
    const fim = user.data_expiracao_assinatura ? new Date(user.data_expiracao_assinatura) : null;
    if (fim && fim.getTime() < Date.now()) {
      await storage.updateUser(user.id, { ativo: false, status_assinatura: "degustacao_expirada" } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgExpirado(user.nome));
      await notificarAdmin(`⏰ Degustação EXPIRADA — validar/contatar cliente: ${user.nome} (${user.telefone}) id=${user.id}`);
      return true;
    }
    return false; // dentro do prazo → segue fluxo normal
  }

  // Aguardando o SIM da oferta
  if (status === "aguardando_confirmacao") {
    if (ehAfirmativo(text)) {
      await storage.updateUser(user.id, { status_assinatura: "aguardando_tipo_pessoa" } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgPerguntaTipo(user.nome));
    } else {
      await uazapiService.sendText(BaseUrl, token, chatid, msgNudge());
    }
    return true;
  }

  // Aguardando PF/PJ
  if (status === "aguardando_tipo_pessoa") {
    const tipo = detectarTipoPessoa(text);
    if (!tipo) {
      await uazapiService.sendText(BaseUrl, token, chatid, msgReperguntaTipo());
      return true;
    }
    const fim = dataTrialFim();
    if (tipo === "juridica") {
      try {
        const empresa = await storage.createEmpresa({
          usuario_id: user.id,
          razao_social: user.nome || "Minha Empresa",
          nome_fantasia: user.nome || null,
          segmento: "servicos",
        } as any);
        await storage.seedEmpresasContas(empresa.id);
      } catch (e) {
        console.error("[Onboarding] falha ao criar empresa PJ:", e);
      }
      await storage.updateUser(user.id, { ativo: true, tipo_pessoa: "juridica", status_assinatura: "degustacao", data_expiracao_assinatura: fim } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgAtivadoPJ(user.nome, fim));
      await notificarAdmin(`🆕 Nova degustação PJ: ${user.nome} (${user.telefone}) id=${user.id} — expira ${fmtData(fim)}`);
    } else {
      await storage.updateUser(user.id, { ativo: true, tipo_pessoa: "fisica", status_assinatura: "degustacao", data_expiracao_assinatura: fim } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgAtivadoPF(user.nome, fim));
      await notificarAdmin(`🆕 Nova degustação PF: ${user.nome} (${user.telefone}) id=${user.id} — expira ${fmtData(fim)}`);
    }
    return true;
  }

  // Pós-degustação (expirada) ou conta inativa → aguarda validação do admin
  if (status === "degustacao_expirada" || !user.ativo) {
    await uazapiService.sendText(BaseUrl, token, chatid, msgEmAnalise(user.nome));
    return true;
  }

  return false; // usuário ativo por outra via (assinante) → segue normal
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

    // Ignorar mensagens de GRUPO (chatid termina em @g.us)
    if (body.message.chatid.endsWith("@g.us")) {
      return; // Bot só responde em conversas privadas
    }

    // Ignorar tipos de mensagem não processáveis
    const supportedTypes = ["Conversation", "ExtendedTextMessage", "AudioMessage", "ImageMessage", "DocumentMessage"];
    if (!supportedTypes.includes(body.message.messageType)) {
      return; // ReactionMessage, StickerMessage, etc — ignorar silenciosamente
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
      const phoneRaw = chatid.split("@")[0]; // ex: 5511984630568
      // Remover código do país (55) — manter apenas DDD+número
      const phone = phoneRaw.startsWith("55") ? phoneRaw.slice(2) : phoneRaw; // ex: 11984630568

      user = await storage.createUser({
        nome: senderName || "Usuário WhatsApp",
        email: `${phone}@tel.local`, // placeholder mínimo — login será por telefone+senha
        telefone: phone,
        senha: "mudar@123",
        remoteJid: chatid,
        tipo_usuario: "normal",
        ativo: false,
        status_assinatura: "aguardando_confirmacao", // aguarda o SIM da degustação
      } as any);

      // Criar carteira
      await storage.createWallet({
        usuario_id: user.id,
        nome: "Principal",
        descricao: "Carteira principal criada automaticamente",
      });

      // Criar plano de contas pessoal (cópia do template base — editável pelo usuário)
      await seedPlanoContasPessoal(user.id);
      console.log(`[UazAPI Webhook] Plano de contas pessoal criado para user ${user.id}`);

      // Oferta de degustação (15 dias) — em vez de pedir assinatura direto.
      await uazapiService.sendText(BaseUrl, token, chatid, msgOferta(senderName));
      return;
    }

    // Onboarding / degustação: se a mensagem for de confirmação, escolha PF/PJ,
    // expiração de trial ou conta inativa, o fluxo é tratado aqui e retornamos.
    if (await tratarOnboarding(user, text || "", chatid, BaseUrl, token)) return;

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
        try {
          const audioData = await uazapiService.downloadMedia(BaseUrl, token, messageid);
          resolvedText = await transcribeAudio(audioData.base64Data, audioData.mimetype);
          console.log(`[UazAPI Webhook] Transcrição: "${resolvedText.slice(0, 80)}..."`);
        } catch (audioErr: any) {
          const c = classifyAiError(audioErr, "openai-whisper");
          console.error(`[UazAPI Webhook] ❌ Erro ao transcrever áudio (${c.kind}):`, c.detail);
          if (c.kind === "sem_credito" || c.kind === "auth") {
            console.error(`[ALERTA-ADMIN] 🚨 Whisper indisponível por '${c.kind}'.`);
          }
          await createIngestionEvent({
            usuario_id: user.id, remote_jid: chatid, tipo_mensagem: messageType,
            resultado: c.kind, etapa: "transcricao", detalhe: c.detail, provider: c.provider,
          });
          // Se for falta de crédito/config, avisa; senão mantém a dica de áudio.
          await uazapiService.sendText(BaseUrl, token, chatid,
            c.kind === "sem_credito" || c.kind === "auth"
              ? c.userMessage
              : "🎙️ Não consegui entender esse áudio. Pode tentar enviar novamente?\n\n_Dicas:_\n• Fale mais perto do microfone\n• Evite locais com muito ruído\n• Ou digite a mensagem por texto");
          return;
        }
        break;
      }

      case "ImageMessage": {
        console.log(`[UazAPI Webhook] Analisando imagem...`);
        try {
          const imgData = await uazapiService.downloadMedia(BaseUrl, token, messageid);
          const imgText = await analyzeWithGemini(imgData.base64Data, imgData.mimetype, "image");
          resolvedText = text ? `${imgText}, ${text}` : imgText;
          console.log(`[UazAPI Webhook] Análise imagem: "${resolvedText.slice(0, 80)}..."`);
        } catch (imgErr: any) {
          const c = classifyAiError(imgErr, "gemini");
          console.error(`[UazAPI Webhook] ❌ Erro ao analisar imagem (${c.kind}):`, c.detail);
          if (c.kind === "sem_credito" || c.kind === "auth") {
            console.error(`[ALERTA-ADMIN] 🚨 Gemini (visão) indisponível por '${c.kind}'.`);
          }
          await createIngestionEvent({
            usuario_id: user.id, remote_jid: chatid, tipo_mensagem: messageType,
            resultado: c.kind, etapa: "visao", detalhe: c.detail, provider: c.provider,
          });
          await uazapiService.sendText(BaseUrl, token, chatid,
            c.kind === "sem_credito" || c.kind === "auth"
              ? c.userMessage
              : "📷 Não consegui ler essa imagem. Pode tentar enviar novamente?\n\n_Dicas:_\n• Tire a foto com boa iluminação\n• Certifique-se que o texto/valores estejam legíveis\n• Ou digite os valores manualmente");
          return;
        }
        break;
      }

      case "DocumentMessage": {
        console.log(`[UazAPI Webhook] Analisando documento...`);
        try {
          const docData = await uazapiService.downloadMedia(BaseUrl, token, messageid);
          resolvedText = await analyzeWithGemini(docData.base64Data, docData.mimetype, "document");
          console.log(`[UazAPI Webhook] Análise doc: "${resolvedText.slice(0, 80)}..."`);
        } catch (docErr: any) {
          const c = classifyAiError(docErr, "gemini");
          console.error(`[UazAPI Webhook] ❌ Erro ao analisar documento (${c.kind}):`, c.detail);
          if (c.kind === "sem_credito" || c.kind === "auth") {
            console.error(`[ALERTA-ADMIN] 🚨 Gemini (documento) indisponível por '${c.kind}'.`);
          }
          await createIngestionEvent({
            usuario_id: user.id, remote_jid: chatid, tipo_mensagem: messageType,
            resultado: c.kind, etapa: "visao", detalhe: c.detail, provider: c.provider,
          });
          await uazapiService.sendText(BaseUrl, token, chatid,
            c.kind === "sem_credito" || c.kind === "auth"
              ? c.userMessage
              : "📄 Não consegui ler esse documento. Pode tentar enviar novamente?\n\n_Dicas:_\n• Formatos aceitos: PDF, imagens de notas fiscais\n• Se for um documento muito longo, tente enviar só a parte relevante\n• Ou digite os valores manualmente");
          return;
        }
        break;
      }

      default:
        console.log(`[UazAPI Webhook] Tipo de mensagem não suportado: ${messageType}`);
        return;
    }

    if (!resolvedText.trim()) {
      console.log(`[UazAPI Webhook] Mensagem vazia após resolução`);
      await uazapiService.sendText(BaseUrl, token, chatid,
        "🤔 Recebi sua mensagem mas não consegui identificar nenhum conteúdo. Pode repetir?\n\nVocê pode:\n• Enviar texto (ex: _gastei 50 no mercado_)\n• Enviar áudio descrevendo o gasto\n• Enviar foto de nota fiscal/cupom");
      return;
    }

    // ============================================
    // 3. PREPARAR CONTEXTO PARA O AGENTE
    // ============================================
    const wallet = await storage.getWalletByUserId(user.id);
    if (!wallet) {
      console.error(`[UazAPI Webhook] Wallet não encontrada para user ${user.id}`);
      await uazapiService.sendText(BaseUrl, token, chatid,
        "⚠️ Houve um problema com sua conta. Entre em contato com o suporte.");
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
    let agentResponse: string;
    try {
      console.log(`[UazAPI Webhook] Chamando agente IA para user ${user.id}...`);
      // F4.1 — histórico curto da conversa, para o agente ter contexto.
      const historico = await getConversaRecente(user.id, 6);
      agentResponse = await runAgent(resolvedText, agentContext, historico);
      console.log(`[UazAPI Webhook] Resposta agente: "${agentResponse.slice(0, 100)}..."`);
      // Persistir o turno (usuário + assistente) para a próxima mensagem.
      await appendConversa(user.id, "user", resolvedText);
      await appendConversa(user.id, "assistant", agentResponse);
    } catch (aiErr: any) {
      const c = classifyAiError(aiErr, "openai-chat");
      console.error(`[UazAPI Webhook] ❌ Erro no agente IA (${c.kind}):`, c.detail);
      // Falta de crédito ou problema de configuração precisa de atenção do admin.
      if (c.kind === "sem_credito" || c.kind === "auth") {
        console.error(`[ALERTA-ADMIN] 🚨 IA indisponível por '${c.kind}' — verifique o saldo/config do provedor (${c.provider}).`);
      }
      await createIngestionEvent({
        usuario_id: user.id, remote_jid: chatid, tipo_mensagem: messageType,
        mensagem_raw: resolvedText, resultado: c.kind, etapa: "agente",
        detalhe: c.detail, provider: c.provider,
      });
      await uazapiService.sendText(BaseUrl, token, chatid, c.userMessage);
      return;
    }

    // ============================================
    // 5. ENVIAR RESPOSTA VIA UAZAPI
    // ============================================
    try {
      // Verificar se resposta contém URL de imagem (gráfico)
      const imageUrlMatch = agentResponse.match(/https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|gif|svg|webp)/gi);

      if (imageUrlMatch && imageUrlMatch.length > 0) {
        const imageUrl = imageUrlMatch[0];
        const caption = agentResponse.replace(imageUrl, "").trim();
        await uazapiService.sendMedia(BaseUrl, token, chatid, imageUrl, caption);
      } else {
        const cleanResponse = agentResponse.replace(/<\/?[^>]+>/g, "");
        await uazapiService.sendText(BaseUrl, token, chatid, cleanResponse);
      }

      console.log(`[UazAPI Webhook] ✅ Resposta enviada para ${chatid}`);
      await createIngestionEvent({
        usuario_id: user.id, remote_jid: chatid, tipo_mensagem: messageType,
        mensagem_raw: resolvedText, resultado: "sucesso", etapa: "envio",
      });
    } catch (sendErr: any) {
      console.error(`[UazAPI Webhook] ❌ Erro ao enviar resposta:`, sendErr.message);
      // Última tentativa — mensagem mais simples
      try {
        await uazapiService.sendText(BaseUrl, token, chatid, agentResponse.slice(0, 500));
      } catch (_) { /* silent */ }
    }
  } catch (error: any) {
    console.error(`[UazAPI Webhook] ❌ Erro crítico no pipeline:`, error.message);
    try {
      await createIngestionEvent({
        remote_jid: req.body?.message?.chatid ?? null,
        tipo_mensagem: req.body?.message?.messageType ?? null,
        resultado: "bug", etapa: "pipeline", detalhe: (error?.message || String(error)).slice(0, 500),
      });
    } catch (_) { /* nunca falhar por causa do log */ }
    try {
      const { BaseUrl, token, message } = req.body;
      if (BaseUrl && token && message?.chatid) {
        await uazapiService.sendText(
          BaseUrl,
          token,
          message.chatid,
          "😓 Desculpe, aconteceu um erro inesperado. Tente novamente em alguns segundos.\n\nSe persistir, envie sua mensagem como texto simples."
        );
      }
    } catch (sendErr) {
      // Silenciar erro de fallback
    }
  }
};
