import axios from "axios";
import { storage, getDailySummary, getPeriodSummary, getWeeklySummary, getCategoryBreakdown, comparePeriods, createMeta, getMetasByUsuarioId, depositarMeta, verificarOrcamentos, getContasAPagar, marcarComoPaga, marcarRecorrente, getFluxoCaixaResumo, getSaldoCartao, getCartoesComSaldo, getFaturaCartao, resolveMemoriaCategoria, aprenderMemoriaCategoria } from "../storage";
import { FINANCIAL_AGENT_SYSTEM_PROMPT, buildDynamicContext } from "../prompts/financial-agent";
import { insertTransactionSchema } from "@shared/schema";
import { withRetry } from "../utils/ai-errors";

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

  const response = await withRetry(
    () => axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        timeout: 60000,
      }
    ),
    { provider: "openai-whisper" }
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

  const response = await withRetry(
    () => axios.post(
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
    ),
    { provider: "gemini" }
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
    {
      type: "function" as const,
      function: {
        name: "resumo_dia",
        description: "Retorna o TOTAL de receitas e despesas de um dia específico (default: hoje). Use quando perguntarem 'quanto gastei hoje', 'valor do dia', etc.",
        parameters: {
          type: "object",
          properties: {
            data: { type: "string", description: "Data no formato YYYY-MM-DD. Se omitido, usa hoje." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "resumo_semana",
        description: "Retorna o total de receitas e despesas da semana (segunda a domingo). Use quando perguntarem 'essa semana', 'semana passada', etc.",
        parameters: {
          type: "object",
          properties: {
            semana_offset: { type: "number", description: "0 = semana atual, -1 = semana passada, -2 = retrasada. Default: 0." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "resumo_customizado",
        description: "Retorna totais de receitas/despesas para um período customizado (de/até). Use para consultas como 'de 01/08 até 15/08', 'últimos 3 meses', etc.",
        parameters: {
          type: "object",
          properties: {
            data_inicio: { type: "string", description: "Data início YYYY-MM-DD" },
            data_fim: { type: "string", description: "Data fim YYYY-MM-DD" },
          },
          required: ["data_inicio", "data_fim"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "comparar_periodos",
        description: "Compara dois períodos lado a lado (ex: este mês vs mês passado). Mostra variação percentual de receita, despesa e saldo.",
        parameters: {
          type: "object",
          properties: {
            periodo1_inicio: { type: "string", description: "Início do 1º período (YYYY-MM-DD) — período de referência/anterior" },
            periodo1_fim: { type: "string", description: "Fim do 1º período (YYYY-MM-DD)" },
            periodo2_inicio: { type: "string", description: "Início do 2º período (YYYY-MM-DD) — período atual/recente" },
            periodo2_fim: { type: "string", description: "Fim do 2º período (YYYY-MM-DD)" },
          },
          required: ["periodo1_inicio", "periodo1_fim", "periodo2_inicio", "periodo2_fim"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "gastos_por_categoria",
        description: "Retorna breakdown de gastos por categoria com percentuais. Use quando perguntarem 'onde estou gastando mais', 'categorias', 'distribuição de gastos'.",
        parameters: {
          type: "object",
          properties: {
            data_inicio: { type: "string", description: "Data início YYYY-MM-DD. Se omitido, usa 1º dia do mês atual." },
            data_fim: { type: "string", description: "Data fim YYYY-MM-DD. Se omitido, usa hoje." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "gerar_grafico",
        description: "Gera um gráfico (imagem) dos gastos. Retorna URL da imagem para enviar ao usuário. Use quando pedirem gráfico, visualização, ou quando o resumo tem muitas categorias.",
        parameters: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["bar", "pizza"], description: "'bar' = barra últimos 7 dias, 'pizza' = por categoria" },
            data: { type: "string", description: "Data referência YYYY-MM-DD (default: hoje)" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "criar_meta",
        description: "Cria uma meta financeira (caixinha para guardar dinheiro, sonho, reserva de emergência, ou limite de gastos por categoria). Exemplos: 'quero guardar R$1000/mês pra viajar', 'limite R$500 em alimentação'.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Nome da meta (ex: 'Viagem Europa', 'Reserva Emergência', 'Limite Alimentação')" },
            tipo: { type: "string", enum: ["caixinha", "sonho", "reserva", "limite_categoria"], description: "Tipo: caixinha (guardar dinheiro), sonho (objetivo de longo prazo), reserva (emergência), limite_categoria (orçamento por categoria)" },
            valor_alvo: { type: "number", description: "Valor total da meta em R$ (ex: 10000 para R$10.000)" },
            prazo: { type: "string", description: "Data limite YYYY-MM-DD (opcional)" },
            categoria: { type: "string", description: "Nome da categoria (obrigatório se tipo=limite_categoria, ex: 'Alimentação')" },
            recorrencia: { type: "string", enum: ["diario", "semanal", "mensal"], description: "Frequência para guardar (opcional)" },
            valor_recorrencia: { type: "number", description: "Quanto guardar por período (ex: 500 = R$500/mês)" },
          },
          required: ["titulo", "tipo", "valor_alvo"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "depositar_meta",
        description: "Adiciona/deposita um valor em uma meta/caixinha existente. Use quando o usuário disser 'deposita X na caixinha', 'guardei X no sonho', etc.",
        parameters: {
          type: "object",
          properties: {
            meta_id: { type: "number", description: "ID da meta (pergunte qual se houver mais de uma)" },
            valor: { type: "number", description: "Valor a depositar em R$" },
          },
          required: ["meta_id", "valor"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "listar_metas",
        description: "Lista todas as metas/caixinhas/sonhos/limites do usuário com progresso atual. Use quando perguntarem 'como estão minhas metas', 'quanto falta', 'meus objetivos'.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "verificar_orcamento",
        description: "Verifica se o usuário está dentro dos limites de orçamento definidos por categoria. Mostra quanto gastou vs limite. Use quando perguntarem 'tô no limite?', 'estourei o orçamento?', 'como estão meus limites'.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "criar_conta_pagar",
        description: "Cria uma conta a pagar (despesa futura com data de vencimento). Use quando disserem 'tenho uma conta de X pra pagar dia Y', 'vence dia Z'. A transação fica com status Pendente até ser paga.",
        parameters: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Descrição da conta (ex: 'Aluguel', 'Internet', 'Cartão')" },
            valor: { type: "number", description: "Valor da conta" },
            data_vencimento: { type: "string", description: "Data de vencimento YYYY-MM-DD" },
            categoria: { type: "string", description: "Categoria da despesa" },
            recorrente: { type: "boolean", description: "Se é uma conta fixa mensal (true) ou pontual (false)" },
          },
          required: ["descricao", "valor", "data_vencimento"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "listar_contas_pagar",
        description: "Lista contas a pagar pendentes, organizadas por urgência (atrasadas, próximas, futuras). Use quando perguntarem 'quais minhas contas', 'o que tenho pra pagar', 'contas do mês'.",
        parameters: {
          type: "object",
          properties: {
            filtro: { type: "string", enum: ["todas", "atrasadas", "proximas"], description: "Filtro: 'atrasadas' (vencidas), 'proximas' (3 dias), 'todas' (default)" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "pagar_conta",
        description: "Marca uma conta como paga (status Efetivada + data_pagamento = hoje). Use quando disserem 'paguei a conta de X', 'quitei o aluguel'.",
        parameters: {
          type: "object",
          properties: {
            id_transacao: { type: "number", description: "ID da conta/transação a marcar como paga" },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "marcar_recorrente",
        description: "Marca uma despesa como fixa/recorrente (acontece todo mês). Use quando disserem 'o aluguel é fixo', 'internet é mensal', etc.",
        parameters: {
          type: "object",
          properties: {
            id_transacao: { type: "number", description: "ID da transação" },
            recorrente: { type: "boolean", description: "true = fixa mensal, false = variável/pontual" },
          },
          required: ["id_transacao", "recorrente"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "fluxo_caixa",
        description: "Mostra o fluxo de caixa do mês: Renda → Dízimos → Sonhos → Fixas → Variáveis → Sobra. Use quando perguntarem 'como está meu fluxo', 'sobra quanto', 'distribuição do mês'.",
        parameters: {
          type: "object",
          properties: {
            mes: { type: "number", description: "Mês (1-12). Default: mês atual." },
            ano: { type: "number", description: "Ano. Default: ano atual." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "cadastrar_cartao",
        description: "Cadastra um cartão de crédito para o usuário (com nome, limite, dia de fechamento e vencimento). Use quando disserem 'cadastra meu Nubank', 'tenho um cartão Inter limite 3000'.",
        parameters: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome do cartão (ex: 'Nubank', 'Inter', 'C6 Bank', 'Itaú Platinum')" },
            limite: { type: "number", description: "Limite do cartão em R$" },
            dia_fechamento: { type: "number", description: "Dia do mês que fecha a fatura (1-31)" },
            dia_vencimento: { type: "number", description: "Dia do mês para pagar a fatura (1-31)" },
            bandeira: { type: "string", description: "Bandeira: Visa, Mastercard, Elo, etc (opcional)" },
            ultimos_digitos: { type: "string", description: "Últimos 4 dígitos do cartão (opcional)" },
          },
          required: ["nome", "limite", "dia_fechamento", "dia_vencimento"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "saldo_cartao",
        description: "Mostra o saldo disponível de um cartão de crédito (limite - gastos do período). Use quando perguntarem 'quanto tenho no Nubank', 'meu cartão tá no limite?', 'disponível do Inter'.",
        parameters: {
          type: "object",
          properties: {
            nome_cartao: { type: "string", description: "Nome do cartão (ex: 'Nubank', 'Inter'). Se omitido, mostra todos." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "fatura_cartao",
        description: "Lista todas as transações da fatura atual de um cartão (conciliação). Use quando pedirem 'fatura do Nubank', 'o que gastei no Inter', 'detalhes do cartão'.",
        parameters: {
          type: "object",
          properties: {
            nome_cartao: { type: "string", description: "Nome do cartão" },
          },
          required: ["nome_cartao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "quanto_posso_gastar",
        description: "Calcula quanto o usuário ainda pode gastar hoje/no mês baseado na renda, despesas fixas projetadas e gastos já feitos. Use quando perguntarem 'quanto posso gastar', 'sobra pra hoje', 'tenho folga?'.",
        parameters: {
          type: "object",
          properties: {},
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

        // F4.2 — Memória: se o modelo não casou categoria, tenta o que o
        // usuário já ensinou (comerciante/descrição → categoria).
        let categoriaId = cat?.id;
        let categoriaNome = cat?.nome;
        if (!categoriaId && args.descricao) {
          const mem = await resolveMemoriaCategoria(ctx.userId, args.descricao);
          if (mem) {
            categoriaId = mem.categoria_id;
            categoriaNome = mem.categoria_nome;
          }
        }
        categoriaId = categoriaId || ctx.categories.find(c => c.nome === "Outros" && c.tipo === args.tipo)?.id || ctx.categories[0]?.id;

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

        // F4.2 — Aprender: se o modelo deu uma categoria real (não fallback)
        // e há descrição, memoriza para acertar da próxima vez.
        if (cat && args.descricao) {
          await aprenderMemoriaCategoria(ctx.userId, args.descricao, cat.id, cat.nome);
        }
        return JSON.stringify({ success: true, id: result.id, ...txData, categoria: categoriaNome || "Outros" });
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
        // Converter string para Date (Drizzle precisa de objeto Date para timestamp)
        const dataLembrete = new Date(args.data_lembrete || new Date().toISOString());
        const reminder = await storage.createReminder({
          usuario_id: ctx.userId,
          titulo: args.titulo || "Lembrete",
          descricao: args.descricao || "",
          data_lembrete: dataLembrete,
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
        const de = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const lastDay = new Date(ano, mes, 0).getDate();
        const ate = `${ano}-${String(mes).padStart(2, '0')}-${lastDay}`;
        const summary = await getPeriodSummary(ctx.walletId, de, ate);
        const cats = await getCategoryBreakdown(ctx.walletId, de, ate);
        return JSON.stringify({ period: `${mes}/${ano}`, de, ate, ...summary, categorias: cats });
      }

      case "resumo_dia": {
        const data = args.data || new Date().toISOString().slice(0, 10);
        const summary = await getDailySummary(ctx.walletId, data);
        return JSON.stringify({ data, ...summary });
      }

      case "resumo_semana": {
        const offset = args.semana_offset ?? 0;
        const summary = await getWeeklySummary(ctx.walletId, offset);
        return JSON.stringify(summary);
      }

      case "resumo_customizado": {
        const summary = await getPeriodSummary(ctx.walletId, args.data_inicio, args.data_fim);
        const cats = await getCategoryBreakdown(ctx.walletId, args.data_inicio, args.data_fim);
        return JSON.stringify({ de: args.data_inicio, ate: args.data_fim, ...summary, categorias: cats });
      }

      case "comparar_periodos": {
        const result = await comparePeriods(
          ctx.walletId,
          args.periodo1_inicio, args.periodo1_fim,
          args.periodo2_inicio, args.periodo2_fim
        );
        return JSON.stringify(result);
      }

      case "gastos_por_categoria": {
        const now = new Date();
        const de = args.data_inicio || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const ate = args.data_fim || now.toISOString().slice(0, 10);
        const cats = await getCategoryBreakdown(ctx.walletId, de, ate);
        return JSON.stringify({ de, ate, categorias: cats });
      }

      case "gerar_grafico": {
        const tipo = args.tipo || "bar";
        const data = args.data || new Date().toISOString().slice(0, 10);
        const baseUrl = process.env.BASE_URL || "http://localhost:5000";
        // Gera URL do endpoint de chart existente (requer auth — usar API key interna)
        const chartUrl = `${baseUrl}/api/charts/${tipo === "pizza" ? "pizza" : "bar"}?date=${data}`;
        return JSON.stringify({ chart_url: chartUrl, tipo, data, instrucao: "Envie esta URL como imagem para o usuário." });
      }

      case "criar_meta": {
        // Resolver categoria_id se tipo = limite_categoria
        let categoriaId: number | null = null;
        if (args.tipo === "limite_categoria" && args.categoria) {
          const cat = ctx.categories.find(c => c.nome.toLowerCase() === args.categoria.toLowerCase());
          categoriaId = cat?.id || null;
        }

        const meta = await createMeta(ctx.userId, {
          titulo: args.titulo,
          tipo: args.tipo,
          valor_alvo: args.valor_alvo,
          prazo: args.prazo || null,
          categoria_id: categoriaId,
          recorrencia: args.recorrencia || null,
          valor_recorrencia: args.valor_recorrencia || null,
        });
        return JSON.stringify({ success: true, id: meta.id, titulo: meta.titulo, tipo: meta.tipo, valor_alvo: args.valor_alvo });
      }

      case "depositar_meta": {
        const meta = await depositarMeta(args.meta_id, args.valor);
        if (!meta) return JSON.stringify({ error: "Meta não encontrada" });
        const alvo = parseFloat(meta.valor_alvo as string) || 0;
        const atual = parseFloat(meta.valor_atual as string) || 0;
        const pct = alvo > 0 ? Math.round((atual / alvo) * 100) : 0;
        return JSON.stringify({ success: true, id: meta.id, titulo: meta.titulo, valor_depositado: args.valor, valor_atual: atual, valor_alvo: alvo, progresso_pct: pct });
      }

      case "listar_metas": {
        const metas = await getMetasByUsuarioId(ctx.userId);
        if (metas.length === 0) return JSON.stringify({ metas: [], mensagem: "Nenhuma meta cadastrada." });
        return JSON.stringify({ metas: metas.map(m => ({
          id: m.id,
          titulo: m.titulo,
          tipo: m.tipo,
          valor_alvo: parseFloat(m.valor_alvo as string),
          valor_atual: parseFloat(m.valor_atual as string),
          progresso_pct: m.progresso_pct,
          falta: m.falta,
          meses_restantes: m.meses_restantes,
          prazo: m.prazo,
          recorrencia: m.recorrencia
        }))});
      }

      case "verificar_orcamento": {
        const orcamentos = await verificarOrcamentos(ctx.userId, ctx.walletId);
        if (orcamentos.length === 0) return JSON.stringify({ mensagem: "Nenhum limite de orçamento definido. Use 'criar_meta' com tipo 'limite_categoria' para definir." });
        return JSON.stringify({ orcamentos });
      }

      case "criar_conta_pagar": {
        const cat = ctx.categories.find(c => c.nome.toLowerCase() === (args.categoria || "").toLowerCase() && c.tipo === 'Despesa')
          || ctx.categories.find(c => c.nome === "Outros" && c.tipo === "Despesa");
        const categoriaId = cat?.id || ctx.categories[0]?.id;

        const txData = {
          carteira_id: ctx.walletId,
          categoria_id: categoriaId,
          descricao: args.descricao,
          valor: args.valor,
          tipo: "Despesa",
          data_transacao: args.data_vencimento,
          data_vencimento: args.data_vencimento,
          status: "Pendente",
          recorrente: args.recorrente || false,
          classificacao_despesa: args.recorrente ? "fixa" : "variavel",
        };

        const result = await storage.createTransaction(txData as any);
        return JSON.stringify({ success: true, id: result.id, ...txData, categoria: cat?.nome, msg: "Conta a pagar criada!" });
      }

      case "listar_contas_pagar": {
        const filtro = args.filtro || "todas";
        let contas;
        if (filtro === "atrasadas") {
          contas = await getContasAPagar(ctx.walletId, "atrasada");
        } else if (filtro === "proximas") {
          contas = await getContasAPagar(ctx.walletId, "proximas");
        } else {
          // Todas: busca atrasadas + próximas + futuras
          const atrasadas = await getContasAPagar(ctx.walletId, "atrasada");
          const proximas = await getContasAPagar(ctx.walletId, "proximas");
          const futuras = await getContasAPagar(ctx.walletId, "pendente");
          contas = [...atrasadas.map(c => ({...c, urgencia: 'atrasada'})), ...proximas.map(c => ({...c, urgencia: 'proxima'})), ...futuras];
        }
        if (!contas || contas.length === 0) return JSON.stringify({ mensagem: "Nenhuma conta pendente! 🎉" });
        return JSON.stringify({ contas, total: contas.length });
      }

      case "pagar_conta": {
        const result = await marcarComoPaga(args.id_transacao);
        if (!result) return JSON.stringify({ error: "Transação não encontrada" });
        return JSON.stringify({ success: true, id: args.id_transacao, msg: "Conta marcada como paga! ✅" });
      }

      case "marcar_recorrente": {
        const result = await marcarRecorrente(args.id_transacao, args.recorrente);
        if (!result) return JSON.stringify({ error: "Transação não encontrada" });
        return JSON.stringify({ success: true, id: args.id_transacao, recorrente: args.recorrente, msg: args.recorrente ? "Marcada como despesa fixa 🔒" : "Marcada como despesa variável 🔄" });
      }

      case "fluxo_caixa": {
        const resumo = await getFluxoCaixaResumo(ctx.walletId, args.mes, args.ano);
        return JSON.stringify(resumo);
      }

      case "cadastrar_cartao": {
        const cartao = await storage.createPaymentMethod({
          nome: args.nome,
          descricao: `Cartão ${args.bandeira || ''} final ${args.ultimos_digitos || '****'}`.trim(),
          icone: '💳',
          cor: '#FF6B35',
          usuario_id: ctx.userId,
          global: false,
          ativo: true,
          limite: args.limite,
          dia_fechamento: args.dia_fechamento,
          dia_vencimento: args.dia_vencimento,
          bandeira: args.bandeira || null,
          ultimos_digitos: args.ultimos_digitos || null,
        } as any);
        return JSON.stringify({ success: true, id: cartao.id, nome: cartao.nome, limite: args.limite, msg: `Cartão ${args.nome} cadastrado! Limite: R$${args.limite}. Fecha dia ${args.dia_fechamento}, vence dia ${args.dia_vencimento}.` });
      }

      case "saldo_cartao": {
        if (args.nome_cartao) {
          // Buscar cartão específico pelo nome
          const cartoes = await storage.getPaymentMethodsByUserId(ctx.userId);
          const globalPMs = await storage.getGlobalPaymentMethods();
          const todos = [...cartoes, ...globalPMs];
          const cartao = todos.find(c => c.nome.toLowerCase().includes(args.nome_cartao.toLowerCase()));
          if (!cartao) return JSON.stringify({ error: `Cartão '${args.nome_cartao}' não encontrado. Cadastre com: cadastrar_cartao.` });
          const saldo = await getSaldoCartao(cartao.id, ctx.walletId);
          return JSON.stringify(saldo);
        } else {
          // Mostrar todos
          const todos = await getCartoesComSaldo(ctx.userId, ctx.walletId);
          if (todos.length === 0) return JSON.stringify({ mensagem: "Nenhum cartão com limite cadastrado. Use 'cadastrar_cartao' para cadastrar." });
          return JSON.stringify({ cartoes: todos });
        }
      }

      case "fatura_cartao": {
        const cartoes = await storage.getPaymentMethodsByUserId(ctx.userId);
        const globalPMs = await storage.getGlobalPaymentMethods();
        const todos = [...cartoes, ...globalPMs];
        const cartao = todos.find(c => c.nome.toLowerCase().includes(args.nome_cartao.toLowerCase()));
        if (!cartao) return JSON.stringify({ error: `Cartão '${args.nome_cartao}' não encontrado.` });
        const fatura = await getFaturaCartao(cartao.id, ctx.walletId);
        return JSON.stringify(fatura);
      }

      case "quanto_posso_gastar": {
        const resumo = await getFluxoCaixaResumo(ctx.walletId);
        const now = new Date();
        const diasRestantes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
        const sobraMes = resumo.sobra;
        const porDia = diasRestantes > 0 ? sobraMes / diasRestantes : 0;
        return JSON.stringify({
          sobra_mes: Math.round(sobraMes * 100) / 100,
          dias_restantes: diasRestantes,
          por_dia: Math.round(porDia * 100) / 100,
          contas_pendentes: resumo.contas_pendentes,
          contas_atrasadas: resumo.contas_atrasadas,
          msg: sobraMes > 0
            ? `Você pode gastar ~R$${porDia.toFixed(2)} por dia (${diasRestantes} dias restantes)`
            : `⚠️ Sem folga! Despesas já ultrapassaram a renda em R$${Math.abs(sobraMes).toFixed(2)}`
        });
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

export async function runAgent(
  userMessage: string,
  ctx: ToolContext,
  history: { role: string; content: string }[] = [],
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  const systemPrompt = FINANCIAL_AGENT_SYSTEM_PROMPT + buildDynamicContext() + `

## Categorias Disponíveis
${ctx.categories.map(c => `- ${c.nome} (${c.tipo})`).join("\n")}`;

  // Histórico curto da conversa (memória entre mensagens) entra entre o
  // system prompt e a mensagem atual, para o agente manter contexto.
  const historico = (history || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...historico,
    { role: "user", content: userMessage },
  ];

  const tools = buildTools();
  const maxIterations = 8; // safety net

  for (let i = 0; i < maxIterations; i++) {
    const response = await withRetry(
      () => axios.post(
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
      ),
      { provider: "openai-chat" }
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
