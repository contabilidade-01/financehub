import { Request, Response } from "express";
import { storage } from "../storage";
import { seedPlanoContasPessoal, createIngestionEvent, getConversaRecente, appendConversa } from "../storage";
import { uazapiService } from "../services/uazapi.service";
import { WhatsAppOnboardingService } from "../services/whatsapp-onboarding.service";
import { transcribeAudio, analyzeWithGemini, runAgent } from "../services/ai-agent.service";
import { classifyAiError } from "../utils/ai-errors";
import { notificarAdmin } from "../services/admin-notify";
import { generateRandomPassword } from "../utils/password-generator";
import {
  isSmtpConfigured,
  getPublicAppUrl,
  sendWelcomeWithPasswordEmail,
} from "../services/mailer";
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
// Onboarding / Cadastro / Degustação (15 dias)
//   aguardando_cadastro → aguardando_email → aguardando_confirmacao
//     → aguardando_tipo_pessoa → degustacao → degustacao_expirada
// ============================================
const TRIAL_DIAS = 15;
const SYSTEM_NAME = process.env.SYSTEM_NAME || "Magen";
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const ehAfirmativo = (text: string) => {
  const t = norm(text);
  return /\b(sim|quero|aceito|aceitar|ativar|bora|vamos|claro|pode|comecar|começar|ok|isso|quero sim|cadastrar)\b/.test(t) || t === "s" || t === "1" || t.includes("👍");
};
const ehNegativo = (text: string) => {
  const t = norm(text);
  return /\b(nao|não|depois|agora nao|agora não|negativo|dispensa)\b/.test(t) || t === "n" || t === "2";
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
const isPlaceholderEmail = (email?: string | null) =>
  !email || email.toLowerCase().endsWith("@tel.local");

function extrairEmail(text: string): string | null {
  const m = String(text || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!m) return null;
  const email = m[0].trim().toLowerCase();
  if (email.endsWith("@tel.local")) return null;
  return email;
}

const appUrl = () =>
  getPublicAppUrl() || process.env.BASE_URL || "https://app.controledinheiro.com.br";

const msgConviteCadastro = (nome?: string | null) =>
  `Olá ${primeiro(nome) || "tudo bem"}! 👋 Sou o assistente do *${SYSTEM_NAME}*.\n\nQuer se *cadastrar no sistema* para controlar suas finanças por aqui?\n\nResponda *SIM* para continuar.`;

const msgNudgeCadastro = () =>
  `Sem problema! Quando quiser se cadastrar no *${SYSTEM_NAME}*, é só mandar *SIM*. 😊`;

const msgPedirEmail = (nome?: string | null) =>
  `Perfeito${primeiro(nome) ? `, ${primeiro(nome)}` : ""}! ✅\n\nJá peguei seu *WhatsApp* automaticamente.\nAgora me envia o *melhor e-mail* para você acessar o sistema (ex.: seuemail@gmail.com).`;

const msgEmailInvalido = () =>
  `Não consegui identificar um e-mail válido. 😅\n\nMe envia de novo no formato *seuemail@dominio.com*.`;

const msgEmailEmUso = () =>
  `Esse e-mail já está cadastrado em outra conta. Envie outro e-mail, por favor.`;

const msgContaCriada = (opts: { nome?: string | null; email: string; senha: string }) =>
  `Pronto${primeiro(opts.nome) ? `, ${primeiro(opts.nome)}` : ""}! 🎉 Sua conta no *${SYSTEM_NAME}* foi criada.\n\n` +
  `*Login:* ${opts.email}\n` +
  `*Senha temporária:* ${opts.senha}\n` +
  `*Acesse:* ${appUrl()}\n\n` +
  `Também enviei esses dados no seu e-mail (se o envio estiver ativo).\n` +
  `Você pode *alterar a senha* quando quiser em *Configurações* ou em *Esqueci minha senha*.\n\n` +
  `Agora: posso liberar *${TRIAL_DIAS} dias grátis* pra você testar tudo?\nResponda *SIM* para ativar. 😊`;

const msgOferta = (nome?: string | null) =>
  `Olá ${primeiro(nome)}! 👋 Posso liberar *${TRIAL_DIAS} dias grátis* no *${SYSTEM_NAME}* para você testar tudo — é só responder *SIM* que eu ativo agora mesmo. 😊`;
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

async function finalizarCadastroComEmail(opts: {
  user: any;
  email: string;
  chatid: string;
  BaseUrl: string;
  token: string;
}): Promise<void> {
  const { user, email, chatid, BaseUrl, token } = opts;
  const senha = generateRandomPassword(8);
  const hashed = await bcrypt.hash(senha, 10);

  await storage.updateUser(user.id, {
    email,
    senha: hashed,
    status_assinatura: "aguardando_confirmacao",
  } as any);

  // WhatsApp com credenciais
  await uazapiService.sendText(
    BaseUrl,
    token,
    chatid,
    msgContaCriada({ nome: user.nome, email, senha })
  );

  // E-mail com as mesmas credenciais (se SMTP ok)
  if (isSmtpConfigured()) {
    try {
      await sendWelcomeWithPasswordEmail({
        to: email,
        nome: user.nome,
        password: senha,
        loginUrl: appUrl(),
        systemName: SYSTEM_NAME,
      });
      console.log(`[UazAPI Webhook] E-mail de boas-vindas enviado para ${email}`);
    } catch (err: any) {
      console.error(`[UazAPI Webhook] Falha ao enviar e-mail de boas-vindas:`, err?.message || err);
      await uazapiService.sendText(
        BaseUrl,
        token,
        chatid,
        `⚠️ Não consegui enviar o e-mail agora, mas seus dados de acesso já estão nesta conversa. Guarde a senha.`
      );
    }
  } else {
    console.warn("[UazAPI Webhook] SMTP não configurado — senha enviada só no WhatsApp");
  }

  await notificarAdmin(
    `🆕 Cadastro WhatsApp concluído: ${user.nome} | ${email} | tel ${user.telefone} | id=${user.id}`
  );
}

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

  // 1) Quer se cadastrar?
  if (status === "aguardando_cadastro") {
    if (ehAfirmativo(text)) {
      await storage.updateUser(user.id, { status_assinatura: "aguardando_email" } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgPedirEmail(user.nome));
    } else if (ehNegativo(text)) {
      await uazapiService.sendText(BaseUrl, token, chatid, msgNudgeCadastro());
    } else {
      await uazapiService.sendText(BaseUrl, token, chatid, msgNudgeCadastro());
    }
    return true;
  }

  // 2) Aguardando e-mail real
  if (status === "aguardando_email") {
    const email = extrairEmail(text);
    if (!email) {
      await uazapiService.sendText(BaseUrl, token, chatid, msgEmailInvalido());
      return true;
    }
    const existing = await storage.getUserByEmail(email);
    if (existing && existing.id !== user.id) {
      await uazapiService.sendText(BaseUrl, token, chatid, msgEmailEmUso());
      return true;
    }
    await finalizarCadastroComEmail({ user, email, chatid, BaseUrl, token });
    return true;
  }

  // 3) Aguardando o SIM da oferta de degustação
  if (status === "aguardando_confirmacao") {
    // Contas antigas ainda com @tel.local: coleta e-mail antes de seguir
    if (isPlaceholderEmail(user.email)) {
      await storage.updateUser(user.id, { status_assinatura: "aguardando_email" } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgPedirEmail(user.nome));
      return true;
    }
    if (ehAfirmativo(text)) {
      await storage.updateUser(user.id, { status_assinatura: "aguardando_tipo_pessoa" } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgPerguntaTipo(user.nome));
    } else {
      await uazapiService.sendText(BaseUrl, token, chatid, msgNudge());
    }
    return true;
  }

  // 4) Aguardando PF/PJ
  if (status === "aguardando_tipo_pessoa") {
    const tipo = detectarTipoPessoa(text);
    if (!tipo) {
      await uazapiService.sendText(BaseUrl, token, chatid, msgReperguntaTipo());
      return true;
    }
    const fim = dataTrialFim();
    if (tipo === "juridica") {
      await storage.updateUser(user.id, { ativo: true, tipo_pessoa: "juridica", status_assinatura: "degustacao", data_expiracao_assinatura: fim } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgAtivadoPJ(user.nome, fim));
      await notificarAdmin(`🆕 Nova degustação PJ: ${user.nome} (${user.telefone}) id=${user.id} — expira ${fmtData(fim)}`);

      // Iniciar fluxo guiado de cadastro de CNPJ e dados da empresa
      await storage.createWhatsAppOnboardingState({
        remoteJid: chatid,
        usuarioId: user.id,
        currentStep: 'ASKING_RESPONSIBLE',
        collectedData: JSON.stringify({}),
        updatedAt: new Date()
      });
      await uazapiService.sendText(BaseUrl, token, chatid, "Para configurar sua empresa e começar a registrar as finanças PJ, preciso de alguns dados. 🏢\n\nQual o seu *nome completo* (responsável pela empresa)?");
    } else {
      await storage.updateUser(user.id, { ativo: true, tipo_pessoa: "fisica", status_assinatura: "degustacao", data_expiracao_assinatura: fim } as any);
      await uazapiService.sendText(BaseUrl, token, chatid, msgAtivadoPF(user.nome, fim));
      await notificarAdmin(`🆕 Nova degustação PF: ${user.nome} (${user.telefone}) id=${user.id} — expira ${fmtData(fim)}`);
    }
    return true;
  }

  // Pós-degustação (expirada) ou conta inativa → aguarda validação do admin
  // Exceto quem ainda está no funil de cadastro (já tratado acima)
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
      // Rascunho: telefone/nome do WhatsApp; e-mail e senha só após confirmação
      console.log(`[UazAPI Webhook] Novo contato: ${senderName} (${chatid})`);
      const phoneRaw = chatid.split("@")[0]; // ex: 5511984630568
      const phone = phoneRaw.startsWith("55") ? phoneRaw.slice(2) : phoneRaw; // ex: 11984630568

      user = await storage.createUser({
        nome: senderName || "Usuário WhatsApp",
        email: `${phone}@tel.local`, // temporário até informar e-mail real
        telefone: phone,
        senha: generateRandomPassword(12), // descartada quando concluir o cadastro
        remoteJid: chatid,
        tipo_usuario: "normal",
        ativo: false,
        status_assinatura: "aguardando_cadastro",
      } as any);

      await storage.createWallet({
        usuario_id: user.id,
        nome: "Principal",
        descricao: "Carteira principal criada automaticamente",
      });

      await seedPlanoContasPessoal(user.id);
      console.log(`[UazAPI Webhook] Rascunho criado user ${user.id} — aguardando_cadastro`);

      await uazapiService.sendText(BaseUrl, token, chatid, msgConviteCadastro(senderName));
      return;
    }

    // Onboarding / degustação: se a mensagem for de confirmação, escolha PF/PJ,
    // expiração de trial ou conta inativa, o fluxo é tratado aqui e retornamos.
    if (await tratarOnboarding(user, text || "", chatid, BaseUrl, token)) return;

    // Se o usuário é PJ mas não tem empresa com CNPJ cadastrado, iniciar/continuar onboarding para pedir CNPJ
    if (user.tipo_pessoa === "juridica" && user.ativo) {
      const empresas = await storage.getEmpresasByUsuarioId(user.id);
      const temCnpj = empresas.some(e => e.cnpj && e.cnpj.trim().length > 0);
      if (!temCnpj) {
        const onboardingState = await storage.getWhatsAppOnboardingState(chatid);
        if (!onboardingState) {
          await storage.createWhatsAppOnboardingState({
            remoteJid: chatid,
            usuarioId: user.id,
            currentStep: 'ASKING_RESPONSIBLE',
            collectedData: JSON.stringify({}),
            updatedAt: new Date()
          });
          await uazapiService.sendText(BaseUrl, token, chatid, "Olá! Para continuar utilizando o ambiente PJ, precisamos cadastrar o CNPJ da sua empresa. 🏢\n\nQual o seu *nome completo* (responsável pela empresa)?");
          return;
        }
      }
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

    // Mídia ilegível (foto apagada/escura, documento borrado): a visão sinaliza
    // com "ILEGIVEL: <motivo>". Nesse caso pedimos reenvio em vez de mandar
    // conteúdo duvidoso para o agente registrar.
    if (/^\s*ILEG[IÍ]VEL\s*:/i.test(resolvedText)) {
      const motivo = resolvedText.replace(/^\s*ILEG[IÍ]VEL\s*:/i, "").trim();
      console.log(`[UazAPI Webhook] Mídia ilegível: ${motivo}`);
      await createIngestionEvent({
        usuario_id: user.id, remote_jid: chatid, tipo_mensagem: messageType,
        resultado: "ilegivel", etapa: "visao", detalhe: motivo || "ilegível", provider: "gemini",
      });
      const dica = messageType === "ImageMessage"
        ? "📷 A foto ficou difícil de ler" + (motivo ? ` (${motivo})` : "") + ". Pode reenviar?\n\n_Dicas:_\n• Boa iluminação, sem sombra\n• Enquadre o cupom inteiro, de cima\n• Foco nos valores\n\nOu me diga os valores por texto/áudio."
        : "📄 O documento ficou difícil de ler" + (motivo ? ` (${motivo})` : "") + ". Pode reenviar?\n\n_Dicas:_\n• Prefira o PDF original (não foto do papel)\n• Se for foto, capriche na nitidez\n\nOu me diga os valores por texto/áudio.";
      await uazapiService.sendText(BaseUrl, token, chatid, dica);
      return;
    }

    // -------------------------------------------------------------------------
    // FLUXO DE ONBOARDING PJ/PF (Intercepta a mensagem antes da IA)
    // -------------------------------------------------------------------------
    const onboarding = new WhatsAppOnboardingService();
    const { handled, response } = await onboarding.handleMessage(chatid, resolvedText, user.id, BaseUrl, token, user.tipo_pessoa);

    if (handled) {
      console.log(`[UazAPI Webhook] 📘 Onboarding interceptou a mensagem para ${chatid}`);
      await uazapiService.sendText(BaseUrl, token, chatid, response || "");
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

    // Buscar empresa ativa se for usuário PJ
    let empresaAtiva = null;
    if (user.tipo_pessoa === "juridica" && user.ativo) {
      const empresas = await storage.getEmpresasByUsuarioId(user.id);
      const comCnpj = empresas.find(e => e.cnpj && e.cnpj.trim().length > 0);
      if (comCnpj) {
        empresaAtiva = { id: comCnpj.id, nome: comCnpj.nome_fantasia || comCnpj.razao_social, cnpj: comCnpj.cnpj };
      } else if (empresas.length > 0) {
        // Fallback: usa a primeira empresa mesmo sem CNPJ (onboarding em andamento)
        empresaAtiva = { id: empresas[0].id, nome: empresas[0].nome_fantasia || empresas[0].razao_social, cnpj: null };
      }
    }

    // Mídia (foto/áudio/documento) → o texto é extração automática; o agente
    // deve confirmar antes de gravar lançamentos.
    const origemMidia = ["AudioMessage", "ImageMessage", "DocumentMessage"].includes(messageType);

    const agentContext = {
      userId: user.id,
      walletId: wallet.id,
      categories: categories.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
      tipoPessoa: user.tipo_pessoa || "fisica",
      empresaAtiva,
      origemMidia,
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
