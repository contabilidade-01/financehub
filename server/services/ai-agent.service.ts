import axios from "axios";
import { storage } from "../storage";
import { FINANCIAL_AGENT_SYSTEM_PROMPT, buildDynamicContext } from "../prompts/financial-agent";
import { insertTransactionSchema } from "@shared/schema";

/**
 * AI Agent Service — processa mensagens financeiras com function calling.
 *
 * Pipeline:
 * 1. Recebe texto (já resolvido de áudio/imagem pelo controller)
 * 2. Chama GPT-4o-mini com tools
 * 3. Executa tool calls (storage direto, sem HTTP)
 * 4. Retorna resposta final em texto (formatado p/ WhatsApp)
 */

// ============================================
// WHISPER & GEMINI — conversão mídia → texto
// ============================================

/**
 * Transcreve áudio usando OpenAI Whisper (gpt-4o-transcribe)
 */
export async function transcribeAudio(base64Data: string, mimetype?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  // Determinar extensão pelo mimetype
  const mimeToExt: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/opus": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
    "video/mp4": "mp4",
  };
  const ext = mimeToExt[mimetype || ""] || "ogg";
  const contentType = mimetype || "audio/ogg";

  // Converte base64 para Buffer
  const buffer = Buffer.from(base64Data, "base64");

  // Cria FormData com o arquivo
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("file", buffer, { filename: `audio.${ext}`, contentType });
  form.append("model", "gpt-4o-transcribe");

  const response = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    form,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      timeout: 60000,
    }
  );

  return response.data.text || "";
}

/**
 * Analisa imagem/PDF usando Gemini Vision
 */
export async function analyzeWithGemini(base64Data: string, mimetype: string, type: "image" | "document"): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const prompt = type === "image"
    ? `Descreva todos os items da imagem (ela pode ser um cupom fiscal, nota fiscal ou apenas uma imagem com anotacoes de produtos que foram adquiridos ou comprados), retorne em um formato como no exemplo abaixo:
Comprei DESCRICAO DO ITEM 1 por VALOR
Comprei DESCRICAO DO ITEM 2 por VALOR

Ao responder os números do valor devem usar a notação decimal americana`
    : `Descreva todos os items do documento (ele pode ser um comprovante, extrato bancário, cupom fiscal, nota fiscal ou apenas um documento com anotacoes de produtos que foram adquiridos ou comprados), retorne em um formato como no exemplo abaixo:
Comprei DESCRICAO DO ITEM 1 por VALOR
Comprei DESCRICAO DO ITEM 2 por VALOR

Ao responder os números do valor devem usar a notação decimal americana`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimetype, data: base64Data } },
          ],
        },
      ],
    },
    { timeout: 60000 }
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ============================================
// TOOLS — definição p/ function calling
// ============================================

interface ToolContext {
  userId: number;
  walletId: number;
  categories: { id: number; nome: string; tipo: string }[];
}

function buildTools() {
  return [
    {
      type: "function" as const,
      function: {
        name: "insere_transacao",
        description: "Insere uma nova transação (receita ou despesa) para o usuário.",
        parameters: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Descrição da transação" },
            valor: { type: "number", description: "Valor numérico (ex: 50.00)" },
            tipo: { type: "string", enum: ["Receita", "Despesa"], description: "Tipo da transação" },
            data_transacao: { type: "string", description: "Data no formato YYYY-MM-DD" },
            categoria: { type: "string", description: "Nome da categoria (ex: Alimentação, Transporte)" },
          },
          required: ["descricao", "valor", "tipo", "data_transacao", "categoria"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "atualiza_transacao",
        description: "Atualiza uma transação existente pelo ID.",
        parameters: {
          type: "object",
          properties: {
            id_transacao: { type: "number", description: "ID/código da transação" },
            descricao: { type: "string" },
            valor: { type: "number" },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
            data_transacao: { type: "string" },
            categoria: { type: "string" },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "busca_transacao",
        description: "Busca detalhes de uma transação pelo ID.",
        parameters: {
          type: "object",
          properties: {
            id_transacao: { type: "number", description: "ID da transação" },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "transacoes_recentes",
        description: "Retorna as 5 últimas transações do usuário.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "deleta_transacao",
        description: "Remove uma transação pelo ID.",
        parameters: {
          type: "object",
          properties: {
            id_transacao: { type: "number", description: "ID da transação a deletar" },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "insere_lembrete",
        description: "Cria um lembrete para o usuário.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título do lembrete" },
            descricao: { type: "string", description: "Descrição formatada p/ WhatsApp" },
            data_lembrete: { type: "string", description: "Data/hora ISO (ex: 2026-08-20T09:00:00-03:00)" },
          },
          required: ["titulo", "data_lembrete"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "busca_lembretes",
        description: "Busca todos os lembretes do usuário.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "resumo_periodo",
        description: "Gera resumo financeiro (total receitas, total despesas, por categoria) do mês atual ou do mês informado.",
        parameters: {
          type: "object",
          properties: {
            mes: { type: "number", description: "Número do mês (1-12). Se omitido, usa mês atual." },
          },
        },
      },
    },
  ];
}

// ============================================
// TOOL EXECUTORS — chama storage direto
// ============================================

async function executeTool(name: string, args: any, ctx: ToolContext): Promise<string> {
  try {
    switch (name) {
      case "insere_transacao": {
        // Resolver categoria pelo nome
        const cat = ctx.categories.find(
          (c) => c.nome.toLowerCase() === (args.categoria || "").toLowerCase() && c.tipo === args.tipo
        ) || ctx.categories.find(
          (c) => c.nome.toLowerCase() === (args.categoria || "").toLowerCase()
        );

        const categoriaId = cat?.id || ctx.categories.find(c => c.nome === "Outros" && c.tipo === args.tipo)?.id || ctx.categories[0]?.id;

        const today = new Date().toISOString().slice(0, 10);
        const txData = {
          carteira_id: ctx.walletId,
          categoria_id: categoriaId,
          descricao: args.descricao || "Transação",
          valor: args.valor || 0,
          tipo: args.tipo || "Despesa",
          data_transacao: args.data_transacao || today,
          status: "Efetivada",
        };

        const result = await storage.createTransaction(txData as any);
        return JSON.stringify({ success: true, id: result.id, ...txData, categoria: cat?.nome || "Outros" });
      }

      case "atualiza_transacao": {
        const updateData: any = {};
        if (args.descricao) updateData.descricao = args.descricao;
        if (args.valor) updateData.valor = args.valor;
        if (args.tipo) updateData.tipo = args.tipo;
        if (args.data_transacao) updateData.data_transacao = args.data_transacao;
        if (args.categoria) {
          const cat = ctx.categories.find(c => c.nome.toLowerCase() === args.categoria.toLowerCase());
          if (cat) updateData.categoria_id = cat.id;
        }

        const result = await storage.updateTransaction(args.id_transacao, updateData);
        return JSON.stringify({ success: !!result, transaction: result });
      }

      case "busca_transacao": {
        const tx = await storage.getTransactionById(args.id_transacao);
        return JSON.stringify(tx || { error: "Transação não encontrada" });
      }

      case "transacoes_recentes": {
        const txs = await storage.getRecentTransactionsByWalletId(ctx.walletId, 5);
        return JSON.stringify(txs);
      }

      case "deleta_transacao": {
        const deleted = await storage.deleteTransaction(args.id_transacao);
        return JSON.stringify({ success: deleted });
      }

      case "insere_lembrete": {
        const reminder = await storage.createReminder({
          usuario_id: ctx.userId,
          titulo: args.titulo || "Lembrete",
          descricao: args.descricao || "",
          data_lembrete: args.data_lembrete || new Date().toISOString(),
        } as any);
        return JSON.stringify({ success: true, id: reminder.id, ...args });
      }

      case "busca_lembretes": {
        const reminders = await storage.getRemindersByUserId(ctx.userId);
        return JSON.stringify(reminders);
      }

      case "resumo_periodo": {
        const mes = args.mes || new Date().getMonth() + 1;
        const ano = new Date().getFullYear();
        const period = mes <= new Date().getMonth() + 1 ? "month" : "month";
        const totals = await storage.getIncomeExpenseTotals(ctx.walletId, period);
        const byCategory = await storage.getExpensesByCategory(ctx.walletId, period);
        return JSON.stringify({ period: `${mes}/${ano}`, ...totals, expensesByCategory: byCategory });
      }

      default:
        return JSON.stringify({ error: `Tool '${name}' não reconhecida` });
    }
  } catch (err: any) {
    console.error(`[AI Agent] Erro ao executar tool '${name}':`, err.message);
    return JSON.stringify({ error: err.message });
  }
}

// ============================================
// AGENT LOOP — function calling até resposta
// ============================================

export async function runAgent(userMessage: string, ctx: ToolContext): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  const systemPrompt = FINANCIAL_AGENT_SYSTEM_PROMPT + buildDynamicContext() + `

## Categorias Disponíveis
${ctx.categories.map(c => `- ${c.nome} (${c.tipo})`).join("\n")}`;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const tools = buildTools();
  const maxIterations = 8; // safety net

  for (let i = 0; i < maxIterations; i++) {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        timeout: 60000,
      }
    );

    const choice = response.data.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // Se não há tool calls, retorna resposta final
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return assistantMessage.content || "Pronto!";
    }

    // Executar cada tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments || "{}");

      console.log(`[AI Agent] Tool call: ${fnName}(${JSON.stringify(fnArgs)})`);
      const result = await executeTool(fnName, fnArgs, ctx);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  return "Desculpe, não consegui processar sua solicitação. Tente novamente.";
}
