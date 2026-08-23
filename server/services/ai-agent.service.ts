import axios from "axios";
import { storage, getDailySummary, getPeriodSummary, getWeeklySummary, getCategoryBreakdown, comparePeriods, createMeta, getMetasByUsuarioId, depositarMeta, deleteMeta, ajustarSaldoMeta, verificarOrcamentos, getContasAPagar, marcarComoPaga, marcarRecorrente, getFluxoCaixaResumo, getSaldoCartao, getCartoesComSaldo, getFaturaCartao, resolveMemoriaCategoria, aprenderMemoriaCategoria, resolveOuCriaFormaPagamento, criarCompraParcelada, getUltimaCompra, editarTransacoesPorIds, getStatusOrcamentoCategoria, softDeleteTransacao, softDeleteTodasTransacoes, restaurarUltimaExcluida, transacaoPertenceAoWallet, cadastrarOuAtualizarCartao, resolveMemoriaGlobal } from "../storage";
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
  const openAiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!openAiKey && !groqKey) throw new Error("OPENAI_API_KEY ou GROQ_API_KEY não configurada");

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
  const buffer = Buffer.from(base64Data, "base64");
  const FormData = (await import("form-data")).default;

  if (openAiKey) {
    try {
      const form = new FormData();
      form.append("file", buffer, { filename: `audio.${ext}`, contentType });
      form.append("model", "gpt-4o-transcribe");

      const response = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        form,
        {
          headers: { Authorization: `Bearer ${openAiKey}`, ...form.getHeaders() },
          timeout: 60000,
        }
      );
      if (response.data?.text) return response.data.text;
    } catch (openaiErr: any) {
      console.warn(`[Whisper] OpenAI falhou (${openaiErr.message}), tentando Groq Whisper...`);
    }
  }

  if (groqKey) {
    const form = new FormData();
    form.append("file", buffer, { filename: `audio.${ext}`, contentType });
    form.append("model", "whisper-large-v3");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: { Authorization: `Bearer ${groqKey}`, ...form.getHeaders() },
        timeout: 60000,
      }
    );
    return response.data.text || "";
  }

  throw new Error("Falha na transcrição de áudio em todos os provedores.");
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
        name: "excluir_transacao_por_filtro",
        description: "Exclui transações que correspondem aos filtros fornecidos (valor, descrição, data). Use quando o usuário quiser excluir transações sem fornecer o ID.",
        parameters: {
          type: "object",
          properties: {
            valor: { type: "number", description: "Valor da transação a ser excluída" },
            descricao: { type: "string", description: "Parte da descrição da transação a ser excluída" },
            data_transacao: { type: "string", description: "Data da transação no formato YYYY-MM-DD" },
            tipo: { type: "string", enum: ["Receita", "Despesa"], description: "Tipo da transação" }
          },
          required: ["valor"]
        }
      }
    },
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
            forma_pagamento: { type: "string", description: "Forma de pagamento/cartão (ex: 'Pix', 'Nubank', 'Cartão de Crédito'). Se for cartão e o usuário não disser qual, PERGUNTE antes." },
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
        description: "Remove uma transação pelo ID (vai para a lixeira, recuperável por 30 dias).",
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
        name: "excluir_todas",
        description: "Exclui TODAS as transações do usuário (vão para a lixeira, recuperáveis por 30 dias). Use SÓ quando o usuário pedir para apagar tudo E confirmar. SEMPRE confirme antes de chamar.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "restaurar_transacao",
        description: "Restaura a ÚLTIMA transação excluída (desfaz a exclusão). Use quando disserem 'me arrependi', 'volta o que apaguei', 'desfazer exclusão', 'restaura'.",
        parameters: { type: "object", properties: {} },
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
        name: "simular_meta_financeira",
        description: "Simula em quanto tempo o usuário atinge uma meta financeira guardando um valor mensal, considerando opcionalmente uma taxa de rentabilidade (juros compostos). Use para perguntas como 'em quanto tempo consigo R$ 100 mil guardando 5 mil por mês', 'simula x reais com juros de y%', etc.",
        parameters: {
          type: "object",
          properties: {
            valor_alvo: { type: "number", description: "Valor total desejado (ex: 100000)" },
            valor_atual: { type: "number", description: "Valor já guardado/atual (default 0)" },
            valor_mensal: { type: "number", description: "Quanto guarda por mês (ex: 5000)" },
            taxa_anual_pct: { type: "number", description: "Taxa de juros anual percentual estimada, ex: 10 para 10% a.a. (default 0 para sem juros)" }
          },
          required: ["valor_alvo", "valor_mensal"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "criar_meta",
        description: "Cria uma nova meta, caixinha, sonho ou limite de orçamento. Use quando o usuário quiser criar um objetivo financeiro.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Nome/título da meta (ex: 'Presente para esposa', 'Reserva de Emergência')" },
            tipo: { type: "string", enum: ["caixinha", "sonho", "reserva", "limite_categoria"], description: "Tipo da meta" },
            valor_alvo: { type: "number", description: "Valor alvo em R$" },
            prazo: { type: "string", description: "Data de prazo opcional YYYY-MM-DD" },
            categoria: { type: "string", description: "Nome da categoria (obrigatório se tipo for limite_categoria)" }
          },
          required: ["titulo", "tipo", "valor_alvo"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "deletar_meta",
        description: "Exclui ou desativa uma meta/caixinha existente. Use quando o usuário quiser apagar ou remover uma meta.",
        parameters: {
          type: "object",
          properties: {
            meta_id: { type: "number", description: "ID da meta a excluir" },
            titulo: { type: "string", description: "Título ou parte do título da meta caso não saiba o ID" }
          },
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
            meta_id: { type: "number", description: "ID da meta (opcional se fornecer titulo)" },
            titulo: { type: "string", description: "Título ou parte do nome da meta (opcional se fornecer meta_id)" },
            valor: { type: "number", description: "Valor a depositar em R$" },
          },
          required: ["valor"],
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
    {
      type: "function" as const,
      function: {
        name: "listar_cartoes",
        description: "Lista as formas de pagamento/cartões que o usuário já tem cadastrados. Use quando precisar perguntar 'em qual cartão?' e mostrar as opções.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "parcelar_compra",
        description: "Registra uma compra PARCELADA em várias vezes, agrupadas como UMA compra. Use quando disserem 'parcelado em Nx', 'em N vezes', 'dividido em N'. Cria uma parcela por mês.",
        parameters: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "O que foi comprado (ex.: 'cadeira')" },
            valor_total: { type: "number", description: "Valor TOTAL da compra (será dividido pelas parcelas)" },
            valor_parcela: { type: "number", description: "Valor de CADA parcela (use este OU valor_total)" },
            parcelas: { type: "number", description: "Número de parcelas (ex.: 10)" },
            forma_pagamento: { type: "string", description: "Ex.: 'Cartão de Crédito', 'Nubank', 'Magazine Luiza'" },
            categoria: { type: "string" },
            data_inicio: { type: "string", description: "AAAA-MM-DD (default hoje)" },
          },
          required: ["descricao", "parcelas"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "editar_ultima_compra",
        description: "Edita a ÚLTIMA compra registrada (todas as parcelas dela juntas). Use para 'muda o último pedido', 'a última compra foi no cartão X', 'troca a forma de pagamento da última compra', 'corrige a categoria da compra anterior'.",
        parameters: {
          type: "object",
          properties: {
            forma_pagamento: { type: "string", description: "Nova forma de pagamento (ex.: 'Cartão Magazine Luiza')" },
            categoria: { type: "string", description: "Nova categoria" },
            descricao: { type: "string", description: "Nova descrição (mantém o (i/N) das parcelas)" },
          },
        },
      },
    },
    // ---- Ferramentas de EMPRESA / PJ ----
    {
      type: "function" as const,
      function: {
        name: "listar_empresas",
        description: "Lista as empresas (PJ) do usuário. Use quando ele falar em 'empresa', 'PJ', 'CNPJ', 'meu negócio', ou antes de lançar/consultar algo de uma empresa e você não souber qual é.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "lancar_empresa",
        description: "Lança uma receita ou despesa NA EMPRESA (PJ), separada das finanças pessoais. Use quando o usuário deixar claro que é da empresa/negócio. Precisa saber de qual empresa e em qual conta do plano de contas.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa. Se houver dúvida, use listar_empresas e pergunte." },
            conta: { type: "string", description: "Nome ou código da conta do plano de contas da empresa (ex.: 'Consultoria', '3.1.1')." },
            descricao: { type: "string" },
            valor: { type: "number" },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
            data_transacao: { type: "string", description: "AAAA-MM-DD (default hoje)" },
          },
          required: ["empresa", "valor", "tipo"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "resumo_empresa",
        description: "Resumo financeiro de uma empresa no período (receitas, despesas, saldo). Use para 'como está minha empresa', 'quanto a empresa faturou', etc.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            de: { type: "string", description: "AAAA-MM-DD (opcional)" },
            ate: { type: "string", description: "AAAA-MM-DD (opcional)" },
          },
          required: ["empresa"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "dre_empresa",
        description: "DRE gerencial da empresa (Receita, Custos Variáveis, Margem de Contribuição, Despesas Fixas, Resultado). Use para 'DRE', 'demonstrativo', 'margem', 'lucro da empresa'.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            de: { type: "string", description: "AAAA-MM-DD (opcional)" },
            ate: { type: "string", description: "AAAA-MM-DD (opcional)" },
          },
          required: ["empresa"],
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
        // Normaliza o tipo para o padrão do banco ("Receita" | "Despesa").
        const tipo = /receita|entrada|income|recebimento/i.test(args.tipo || "")
          ? "Receita"
          : "Despesa";

        // Resolver categoria pelo nome (case-insensitive), preferindo o tipo.
        const nomeBusca = (args.categoria || "").toLowerCase();
        const cat = ctx.categories.find(
          (c) => c.nome.toLowerCase() === nomeBusca && c.tipo === tipo
        ) || ctx.categories.find(
          (c) => c.nome.toLowerCase() === nomeBusca
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
        // Cérebro coletivo (global agregado): usa o consenso da multidão quando
        // o modelo e a memória pessoal não resolveram.
        if (!categoriaId && args.descricao) {
          const g = await resolveMemoriaGlobal("pf", args.descricao);
          if (g) {
            const gc = ctx.categories.find(c => c.nome.toLowerCase() === g.categoria_nome.toLowerCase() && c.tipo === tipo)
              || ctx.categories.find(c => c.nome.toLowerCase() === g.categoria_nome.toLowerCase());
            if (gc) { categoriaId = gc.id; categoriaNome = gc.nome; }
          }
        }
        // Fallbacks: "Outros" do tipo → qualquer do tipo → qualquer categoria.
        if (!categoriaId) {
          const fb = ctx.categories.find(c => /outr/i.test(c.nome) && c.tipo === tipo)
            || ctx.categories.find(c => c.tipo === tipo)
            || ctx.categories[0];
          if (fb) { categoriaId = fb.id; categoriaNome = categoriaNome || fb.nome; }
        }
        // Defensivo: usuário sem categorias (plano de contas não criado) —
        // cria uma "Outros" na hora, para o lançamento nunca falhar por isso.
        if (!categoriaId) {
          try {
            const nova = await storage.createCategory({
              nome: "Outros", tipo, usuario_id: ctx.userId, global: false,
            } as any);
            categoriaId = nova.id;
            categoriaNome = categoriaNome || nova.nome;
          } catch {
            const todas = await storage.getCategoriesByUserId(ctx.userId);
            categoriaId = todas[0]?.id;
            categoriaNome = categoriaNome || todas[0]?.nome;
          }
        }
        if (!categoriaId) {
          console.error(`[AI Agent] insere_transacao: sem categoria disponível para user ${ctx.userId}`);
          return JSON.stringify({ error: "Não há categorias disponíveis para lançar. O plano de contas deste usuário não foi criado." });
        }

        // Forma de pagamento: resolve pelo nome (cadastra se não existir).
        let formaPagId: number | undefined;
        let formaPagNome: string | undefined;
        let cartaoIncompleto: any = undefined;
        if (args.forma_pagamento) {
          const fp = await resolveOuCriaFormaPagamento(ctx.userId, args.forma_pagamento);
          if (fp.id) { formaPagId = fp.id; formaPagNome = fp.nome; }
          if (fp.incompleto) cartaoIncompleto = { nome: fp.nome, faltando: fp.faltando };
        }

        const today = new Date().toISOString().slice(0, 10);
        const txData: any = {
          carteira_id: ctx.walletId,
          categoria_id: categoriaId,
          descricao: args.descricao || "Transação",
          valor: args.valor || 0,
          tipo,
          data_transacao: args.data_transacao || today,
          status: "Efetivada",
        };
        if (formaPagId) txData.forma_pagamento_id = formaPagId;

        try {
          const result = await storage.createTransaction(txData as any);
          // F4.2 — Aprender: se o modelo deu categoria real (não fallback).
          if (cat && args.descricao) {
            await aprenderMemoriaCategoria(ctx.userId, args.descricao, cat.id, cat.nome);
          }
          // Aviso na hora: status do orçamento da categoria (se houver limite).
          const orcamento = tipo === "Despesa"
            ? await getStatusOrcamentoCategoria(ctx.userId, ctx.walletId, categoriaId!)
            : null;
          return JSON.stringify({ success: true, id: result.id, ...txData, categoria: categoriaNome || "Outros", forma_pagamento: formaPagNome, orcamento, cartao_incompleto: cartaoIncompleto });
        } catch (dbErr: any) {
          // Loga a causa REAL (constraint, coluna, etc.) para diagnóstico.
          console.error(`[AI Agent] insere_transacao FALHOU no banco:`, dbErr?.message, "| payload:", JSON.stringify(txData));
          return JSON.stringify({ error: `Falha ao gravar a transação: ${dbErr?.message || "erro no banco"}` });
        }
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

        // Isolamento: só edita transação da própria carteira.
        const doDono = await transacaoPertenceAoWallet(args.id_transacao, ctx.walletId);
        if (!doDono) return JSON.stringify({ success: false, error: "Transação não encontrada nas suas transações." });
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
        // Soft delete + isolamento: só apaga se for da carteira do usuário.
        const ok = await softDeleteTransacao(args.id_transacao, ctx.walletId, ctx.userId);
        if (!ok) return JSON.stringify({ success: false, error: "Transação não encontrada nas suas transações." });
        return JSON.stringify({ success: true, recuperavel: true, msg: "Excluída (dá pra restaurar por 30 dias)." });
      }

      case "excluir_transacao_por_filtro": {
        const transacoes = await storage.getTransactionsByWalletId(ctx.walletId);

        const transacoesFiltradas = transacoes.filter(t => {
          const valorMatch = args.valor ? Number(t.valor) === args.valor : true;
          const descricaoMatch = args.descricao ? t.descricao.toLowerCase().includes(args.descricao.toLowerCase()) : true;
          const dataMatch = args.data_transacao ? t.data_transacao === args.data_transacao : true;
          const tipoMatch = args.tipo ? t.tipo === args.tipo : true;

          return valorMatch && descricaoMatch && dataMatch && tipoMatch;
        });

        if (transacoesFiltradas.length === 0) {
          return JSON.stringify({ error: "Nenhuma transação encontrada com os filtros fornecidos." });
        }

        for (const transacao of transacoesFiltradas) {
          await storage.deleteTransaction(transacao.id);
        }

        return JSON.stringify({
          success: true,
          excluidos: transacoesFiltradas.length,
          transacoes: transacoesFiltradas.map(t => ({
            id: t.id,
            descricao: t.descricao,
            valor: t.valor,
            data: t.data_transacao
          }))
        });
      }

      case "excluir_todas": {
        const n = await softDeleteTodasTransacoes(ctx.walletId, ctx.userId);
        return JSON.stringify({ success: true, excluidas: n, recuperavel: true, msg: `${n} transação(ões) movidas para a lixeira (recuperáveis por 30 dias).` });
      }

      case "restaurar_transacao": {
        const r = await restaurarUltimaExcluida(ctx.walletId);
        if (!r.restaurada) return JSON.stringify({ success: false, error: "Não há transações excluídas para restaurar." });
        return JSON.stringify({ success: true, restaurada: r.descricao || "última transação" });
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

      case "simular_meta_financeira": {
        const alvo = Number(args.valor_alvo) || 0;
        const atual = Number(args.valor_atual) || 0;
        const mensal = Number(args.valor_mensal) || 0;
        const taxaAnual = Number(args.taxa_anual_pct) || 0;

        if (alvo <= 0 || mensal <= 0) {
          return JSON.stringify({ error: "Informe um valor alvo e um valor mensal válidos." });
        }

        const falta = alvo - atual;
        if (falta <= 0) {
          return JSON.stringify({ mensagem: "Parabéns! O valor atual já atinge ou supera o valor alvo da meta! 🎉" });
        }

        let meses = 0;
        let montante = atual;
        const taxaMensal = taxaAnual > 0 ? Math.pow(1 + taxaAnual / 100, 1 / 12) - 1 : 0;

        if (taxaMensal === 0) {
          meses = Math.ceil(falta / mensal);
        } else {
          // Simulação mês a mês (máximo 600 meses / 50 anos para evitar loop infinito)
          while (montante < alvo && meses < 600) {
            montante = montante * (1 + taxaMensal) + mensal;
            meses++;
          }
        }

        const anos = Math.floor(meses / 12);
        const mRestantes = meses % 12;
        let tempoFormatado = "";
        if (anos > 0) tempoFormatado += `${anos} ano(s) `;
        if (mRestantes > 0 || anos === 0) tempoFormatado += `${mRestantes} mes(es)`;

        return JSON.stringify({
          sucesso: true,
          valor_alvo: alvo,
          valor_atual: atual,
          valor_mensal: mensal,
          taxa_anual_pct: taxaAnual,
          meses_necessarios: meses,
          tempo_formatado: tempoFormatado.trim(),
          montante_final: Math.round(montante * 100) / 100,
          rendimento_total: taxaAnual > 0 ? Math.round((montante - (atual + mensal * meses)) * 100) / 100 : 0
        });
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
        const metas = await getMetasByUsuarioId(ctx.userId);
        let targetId = args.meta_id;

        if (args.titulo) {
          const found = metas.find(m => m.titulo.toLowerCase().includes(args.titulo.toLowerCase()) || args.titulo.toLowerCase().includes(m.titulo.toLowerCase()));
          if (found) targetId = found.id;
        } else if (!targetId) {
          const textoUsuario = (ctx.userMessage || "").toLowerCase();
          const matchContexto = metas.find(m => {
            const palavras = m.titulo.toLowerCase().split(/\s+/);
            return palavras.some(p => p.length > 3 && textoUsuario.includes(p));
          });
          if (matchContexto) targetId = matchContexto.id;
        }

        if (!targetId && metas.length === 1) {
          targetId = metas[0].id;
        }

        if (!targetId) {
          return JSON.stringify({
            error: "Meta não encontrada. Por favor, forneça o nome exato ou o ID da meta.",
            metas_disponiveis: metas.map(m => ({ id: m.id, titulo: m.titulo }))
          });
        }

        const meta = await depositarMeta(targetId, args.valor);
        if (!meta) return JSON.stringify({ error: "Erro ao processar depósito: Meta não encontrada no banco de dados." });

        const alvo = parseFloat(meta.valor_alvo as string) || 0;
        const atual = parseFloat(meta.valor_atual as string) || 0;
        const pct = alvo > 0 ? Math.round((atual / alvo) * 100) : 0;

        return JSON.stringify({
          success: true,
          id: meta.id,
          titulo: meta.titulo,
          valor_depositado: args.valor,
          valor_atual: atual,
          valor_alvo: alvo,
          progresso_pct: pct,
          msg: `Depósito de R$ ${args.valor} realizado com sucesso na meta ${meta.titulo}.`
        });
      }

      case "sacar_meta": {
        const metas = await getMetasByUsuarioId(ctx.userId);
        let targetId = args.meta_id;

        if (args.titulo) {
          const found = metas.find(m => m.titulo.toLowerCase().includes(args.titulo.toLowerCase()) || args.titulo.toLowerCase().includes(m.titulo.toLowerCase()));
          if (found) targetId = found.id;
        } else if (!targetId) {
          const textoUsuario = (ctx.userMessage || "").toLowerCase();
          const matchContexto = metas.find(m => {
            const palavras = m.titulo.toLowerCase().split(/\s+/);
            return palavras.some(p => p.length > 3 && textoUsuario.includes(p));
          });
          if (matchContexto) targetId = matchContexto.id;
        }

        if (!targetId && metas.length === 1) {
          targetId = metas[0].id;
        }

        if (!targetId) {
          return JSON.stringify({
            error: "Meta não encontrada. Por favor, forneça o nome exato ou o ID da meta.",
            metas_disponiveis: metas.map(m => ({ id: m.id, titulo: m.titulo }))
          });
        }

        const meta = await sacarMeta(targetId, args.valor);
        if (!meta) return JSON.stringify({ error: "Erro ao processar saque: Meta não encontrada no banco de dados." });

        const alvo = parseFloat(meta.valor_alvo as string) || 0;
        const atual = parseFloat(meta.valor_atual as string) || 0;
        const pct = alvo > 0 ? Math.round((atual / alvo) * 100) : 0;

        return JSON.stringify({
          success: true,
          id: meta.id,
          titulo: meta.titulo,
          valor_sacado: args.valor,
          valor_atual: atual,
          valor_alvo: alvo,
          progresso_pct: pct,
          msg: `Saque de R$ ${args.valor} realizado com sucesso da meta ${meta.titulo}.`
        });
      }

      case "ajustar_saldo_meta": {
        const metas = await getMetasByUsuarioId(ctx.userId);
        let targetId = args.meta_id;

        if (args.titulo) {
          const found = metas.find(m => m.titulo.toLowerCase().includes(args.titulo.toLowerCase()) || args.titulo.toLowerCase().includes(m.titulo.toLowerCase()));
          if (found) targetId = found.id;
        } else if (!targetId) {
          const textoUsuario = (ctx.userMessage || "").toLowerCase();
          const matchContexto = metas.find(m => {
            const palavras = m.titulo.toLowerCase().split(/\s+/);
            return palavras.some(p => p.length > 3 && textoUsuario.includes(p));
          });
          if (matchContexto) targetId = matchContexto.id;
        }

        if (!targetId && metas.length === 1) {
          targetId = metas[0].id;
        }

        if (!targetId) {
          return JSON.stringify({
            error: "Meta não encontrada. Por favor, forneça o nome exato ou o ID da meta.",
            metas_disponiveis: metas.map(m => ({ id: m.id, titulo: m.titulo }))
          });
        }

        const meta = await ajustarSaldoMeta(targetId, args.valor);
        if (!meta) return JSON.stringify({ error: "Erro ao ajustar saldo: Meta não encontrada no banco de dados." });

        const alvo = parseFloat(meta.valor_alvo as string) || 0;
        const atual = parseFloat(meta.valor_atual as string) || 0;
        const pct = alvo > 0 ? Math.round((atual / alvo) * 100) : 0;

        return JSON.stringify({
          success: true,
          id: meta.id,
          titulo: meta.titulo,
          valor_ajustado: args.valor,
          valor_atual: atual,
          valor_alvo: alvo,
          progresso_pct: pct,
          msg: `Saldo da meta ${meta.titulo} ajustado para R$ ${args.valor}.`
        });
      }

      case "deletar_meta": {
        let targetId = args.meta_id;
        const metas = await getMetasByUsuarioId(ctx.userId);
        if (!targetId && args.titulo) {
          const found = metas.find(m => m.titulo.toLowerCase().includes(args.titulo.toLowerCase()));
          if (found) targetId = found.id;
        }
        if (!targetId) {
          return JSON.stringify({ error: "Meta não encontrada para exclusão." });
        }
        const ok = await deleteMeta(targetId);
        return JSON.stringify({ success: ok, id: targetId });
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
        // Upsert: se o cartão já existe (ex.: criado automaticamente numa compra),
        // atualiza em vez de falhar por nome duplicado.
        const c = await cadastrarOuAtualizarCartao(ctx.userId, {
          nome: args.nome,
          limite: args.limite,
          dia_fechamento: args.dia_fechamento,
          dia_vencimento: args.dia_vencimento,
          bandeira: args.bandeira,
          ultimos_digitos: args.ultimos_digitos,
        });
        const verbo = c.atualizado ? "atualizado" : "cadastrado";
        return JSON.stringify({ success: true, id: c.id, nome: c.nome, limite: args.limite, msg: `Cartão ${c.nome} ${verbo}! Limite: R$${args.limite}. Fecha dia ${args.dia_fechamento}, vence dia ${args.dia_vencimento}.` });
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

      case "listar_cartoes": {
        const doUsuario = await storage.getPaymentMethodsByUserId(ctx.userId);
        const globais = await storage.getGlobalPaymentMethods();
        const todos = [...doUsuario, ...globais]
          .filter((p: any) => p.ativo !== false)
          .map((p: any) => p.nome);
        // remove duplicados preservando ordem
        const nomes = Array.from(new Set(todos));
        if (nomes.length === 0) {
          return JSON.stringify({ cartoes: [], mensagem: "Nenhum cartão/forma cadastrado ainda. Peça o nome do cartão para cadastrar." });
        }
        return JSON.stringify({ cartoes: nomes });
      }

      case "parcelar_compra": {
        const parcelas = Math.max(1, Math.min(60, Number(args.parcelas) || 1));
        let valorParcela = Number(args.valor_parcela) || 0;
        if (!valorParcela && args.valor_total) valorParcela = Math.round((Number(args.valor_total) / parcelas) * 100) / 100;
        if (!valorParcela) return JSON.stringify({ error: "Informe valor_total ou valor_parcela." });

        // Categoria (por nome, com fallback Outros).
        const catP = ctx.categories.find(c => c.nome.toLowerCase() === (args.categoria || "").toLowerCase() && c.tipo === "Despesa")
          || ctx.categories.find(c => /outr/i.test(c.nome) && c.tipo === "Despesa")
          || ctx.categories.find(c => c.tipo === "Despesa")
          || ctx.categories[0];
        // Forma de pagamento (resolve/cria pelo nome).
        let formaId: number | null = null;
        let formaNome: string | undefined;
        let cartaoIncompletoP: any = undefined;
        if (args.forma_pagamento) {
          const fp = await resolveOuCriaFormaPagamento(ctx.userId, args.forma_pagamento);
          formaId = fp.id || null;
          formaNome = fp.nome;
          if (fp.incompleto) cartaoIncompletoP = { nome: fp.nome, faltando: fp.faltando };
        }
        const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(args.data_inicio || "") ? args.data_inicio : new Date().toISOString().slice(0, 10);

        const r = await criarCompraParcelada({
          walletId: ctx.walletId,
          categoriaId: catP!.id,
          descricao: args.descricao || "Compra",
          valorParcela,
          parcelas,
          formaPagamentoId: formaId,
          dataInicio,
        });
        const orcamentoP = await getStatusOrcamentoCategoria(ctx.userId, ctx.walletId, catP!.id);
        return JSON.stringify({
          success: true, compra_grupo: r.compra_grupo, parcelas: r.parcelas,
          valor_parcela: r.valor_parcela, total: Math.round(r.valor_parcela * r.parcelas * 100) / 100,
          categoria: catP?.nome, forma_pagamento: formaNome, ids: r.ids, orcamento: orcamentoP, cartao_incompleto: cartaoIncompletoP,
        });
      }

      case "editar_ultima_compra": {
        const compra = await getUltimaCompra(ctx.walletId);
        if (!compra || compra.ids.length === 0) {
          return JSON.stringify({ error: "Não encontrei uma compra recente para editar." });
        }
        const patch: any = {};
        let formaNome: string | undefined;
        let catNome: string | undefined;
        if (args.forma_pagamento) {
          const fp = await resolveOuCriaFormaPagamento(ctx.userId, args.forma_pagamento);
          if (fp.id) { patch.forma_pagamento_id = fp.id; formaNome = fp.nome; }
        }
        if (args.categoria) {
          const cat = ctx.categories.find(c => c.nome.toLowerCase() === args.categoria.toLowerCase());
          if (cat) { patch.categoria_id = cat.id; catNome = cat.nome; }
        }
        if (args.descricao) patch.descricao_base = String(args.descricao);
        if (Object.keys(patch).length === 0) {
          return JSON.stringify({ error: "Diga o que mudar: forma de pagamento, categoria ou descrição." });
        }
        const n = await editarTransacoesPorIds(compra.ids, patch);
        return JSON.stringify({
          success: true, parcelas_afetadas: n, compra: compra.descricao_base,
          forma_pagamento: formaNome, categoria: catNome, nova_descricao: args.descricao,
        });
      }

      // ---- EMPRESA / PJ ----
      case "listar_empresas": {
        const empresas = await storage.getEmpresasByUsuarioId(ctx.userId);
        if (empresas.length === 0) {
          return JSON.stringify({ mensagem: "Você ainda não tem empresa cadastrada. Cadastre pelo painel para começar a usar o modo PJ." });
        }
        return JSON.stringify({ empresas: empresas.map((e) => ({ id: e.id, nome: e.nome_fantasia || e.razao_social })) });
      }

      case "lancar_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa);
        if ("erro" in empresa) return JSON.stringify(empresa);

        const contas = await storage.getEmpresasContasByEmpresaId(empresa.id);
        const tipo = args.tipo === "Receita" ? "Receita" : "Despesa";
        // Resolve a conta pelo código ou nome; senão usa "Outros"/"Outras" do tipo.
        const alvo = (args.conta || "").toString().toLowerCase();
        let conta = alvo
          ? contas.find((c) => c.codigo.toLowerCase() === alvo || c.nome.toLowerCase() === alvo)
            || contas.find((c) => c.nome.toLowerCase().includes(alvo))
          : undefined;
        if (!conta) conta = contas.find((c) => c.tipo === tipo && /outr/i.test(c.nome));
        if (!conta) conta = contas.find((c) => c.tipo === tipo);
        if (!conta) {
          return JSON.stringify({ error: `A empresa não tem uma conta do tipo ${tipo} no plano de contas. Peça ao usuário para escolher uma conta.` });
        }

        const today = new Date().toISOString().slice(0, 10);
        const criada = await storage.createEmpresaTransacao({
          empresa_id: empresa.id,
          categoria_id: conta.id,
          descricao: args.descricao || "Lançamento",
          valor: args.valor || 0,
          tipo,
          data_transacao: args.data_transacao || today,
          status: "Efetivada",
          origem: "whatsapp",
        } as any);
        return JSON.stringify({
          success: true, id: criada.id, empresa: empresa.nome_fantasia || empresa.razao_social,
          conta: conta.nome, valor: args.valor, tipo, data: args.data_transacao || today,
        });
      }

      case "resumo_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const resumo = await storage.getEmpresaResumo(empresa.id, { de: args.de, ate: args.ate });
        return JSON.stringify({ empresa: empresa.nome_fantasia || empresa.razao_social, ...resumo });
      }

      case "dre_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const dre = await storage.getEmpresaDRE(empresa.id, { de: args.de, ate: args.ate });
        return JSON.stringify({ empresa: empresa.nome_fantasia || empresa.razao_social, ...dre });
      }

      default:
        return JSON.stringify({ error: `Tool '${name}' não reconhecida` });
    }
  } catch (err: any) {
    console.error(`[AI Agent] Erro ao executar tool '${name}':`, err.message);
    return JSON.stringify({ error: err.message });
  }
}

// Resolve a empresa do usuário por nome/parte; garante que pertence a ele.
async function resolverEmpresa(
  userId: number,
  nome: string,
): Promise<any> {
  const empresas = await storage.getEmpresasByUsuarioId(userId);
  if (empresas.length === 0) return { erro: true, error: "Nenhuma empresa cadastrada." };
  const alvo = (nome || "").toString().toLowerCase().trim();
  if (!alvo) {
    if (empresas.length === 1) return empresas[0];
    return { erro: true, error: "Especifique a empresa.", empresas: empresas.map((e) => e.nome_fantasia || e.razao_social) };
  }
  const matches = empresas.filter(
    (e) => (e.nome_fantasia || "").toLowerCase().includes(alvo) || (e.razao_social || "").toLowerCase().includes(alvo),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    if (empresas.length === 1) return empresas[0];
    return { erro: true, error: `Empresa '${nome}' não encontrada.`, empresas: empresas.map((e) => e.nome_fantasia || e.razao_social) };
  }
  return { erro: true, error: "Mais de uma empresa corresponde; peça para o usuário especificar.", empresas: matches.map((e) => e.nome_fantasia || e.razao_social) };
}

// ============================================
// AGENT LOOP — function calling até resposta
// ============================================

// Chama o modelo de chat com FALLBACK: tenta o principal (OpenAI) e, se falhar,
// um reserva (qualquer endpoint compatível com a API da OpenAI — ex.: Groq,
// OpenRouter, ou outro modelo). Configurar via env:
//   AI_FALLBACK_API_KEY, AI_FALLBACK_BASE_URL (default OpenAI), AI_MODEL_FALLBACK
async function callChatCompletion(messages: any[], tools: any[]): Promise<any> {
  const primaryKey = process.env.OPENAI_API_KEY;
  const primaryModel = process.env.AI_MODEL || "gpt-4o-mini";

  try {
    if (!primaryKey) throw new Error("OPENAI_API_KEY não configurada");
    const payload = { messages, tools, tool_choice: "auto", temperature: 0.3 };
    return await withRetry(
      () => axios.post(
        "https://api.openai.com/v1/chat/completions",
        { model: primaryModel, ...payload },
        { headers: { Authorization: `Bearer ${primaryKey}`, "Content-Type": "application/json" }, timeout: 60000 },
      ),
      { provider: "openai-chat" },
    );
  } catch (primaryErr) {
    const fbKey = process.env.AI_FALLBACK_API_KEY || process.env.GROQ_API_KEY;
    if (!fbKey) throw primaryErr; // sem reserva configurado
    const isGroq = !process.env.AI_FALLBACK_API_KEY && !!process.env.GROQ_API_KEY;
    const fbUrl = isGroq
      ? "https://api.groq.com/openai/v1/chat/completions"
      : (process.env.AI_FALLBACK_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
    const fbModel = isGroq ? "llama-3.3-70b-versatile" : (process.env.AI_MODEL_FALLBACK || "gpt-4o-mini");

    console.warn(`[AI] modelo principal falhou — usando reserva (${fbModel} em ${fbUrl})`);

    // LIMPEZA PARA FALLBACK: Modelos como Llama/Groq não suportam campos extras como 'annotations' em mensagens do assistant
    const cleanMessages = messages.map(m => {
      const { annotations, ...rest } = m;
      return rest;
    });

    return await withRetry(
      () => axios.post(
        fbUrl,
        { messages: cleanMessages, tools, tool_choice: "auto", temperature: 0.3, model: fbModel },
        { headers: { Authorization: `Bearer ${fbKey}`, "Content-Type": "application/json" }, timeout: 60000 },
      ),
      { provider: isGroq ? "groq-fallback" : "ai-fallback" },
    );
  }
}

export async function runAgent(
  userMessage: string,
  ctx: ToolContext,
  history: { role: string; content: string }[] = [],
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  let pjInstructions = "";
  if (ctx.tipoPessoa === "juridica" && (ctx as any).empresaAtiva) {
    const emp = (ctx as any).empresaAtiva;
    pjInstructions = `
## MODO EMPRESA (PJ) ATIVO
- Este usuário é PJ (Empresa: ${emp.nome}).
- TODAS as transações financeiras (receitas e despesas) enviadas por ele DEVEM ser lançadas na empresa utilizando a ferramenta 'lancar_empresa' (informando empresa: "${emp.nome}"). NUNCA use 'insere_transacao' (pessoal) para este usuário, a menos que ele especifique explicitamente que é uma transação pessoal.
`;
  }

  const systemPrompt = FINANCIAL_AGENT_SYSTEM_PROMPT + buildDynamicContext() + pjInstructions + `

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
  let ultimaToolExecutada: string | null = null;
  let ultimoResultadoTool: string | null = null;

  for (let i = 0; i < maxIterations; i++) {
    let response;
    try {
      response = await callChatCompletion(messages, tools);
    } catch (chatErr: any) {
      console.error(`[AI Agent] Erro em callChatCompletion na iteração ${i}:`, chatErr?.message);
      if (ultimoResultadoTool) {
        try {
          const parsed = JSON.parse(ultimoResultadoTool);
          if (ultimaToolExecutada === "listar_metas" && parsed.metas) {
            if (parsed.metas.length === 0) return "Nenhuma meta cadastrada no momento.";
            let txt = "🎯 *Suas Metas e Caixinhas:*\n\n";
            for (const m of parsed.metas) {
              const pct = m.progresso_pct || 0;
              txt += `• *${m.titulo}* (${m.tipo})\n  💰 R$ ${m.valor_atual} / R$ ${m.valor_alvo} (${pct}%)\n  Falta: R$ ${m.falta}\n\n`;
            }
            return txt.trim();
          }
        } catch {}
      }
      throw chatErr;
    }

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
      // Mapeamento de aliases para evitar erros de "function not defined"
      const toolAliases: Record<string, string> = {
        "deletar_meta": "deleteMeta",
        "excluir_meta": "deleteMeta",
        "atualizar_saldo_meta": "ajustarSaldoMeta",
        "ajustar_saldo_meta": "ajustarSaldoMeta",
        "depositar_valor_meta": "depositarMeta",
        "depositar_meta": "depositarMeta"
      };

      const finalFnName = toolAliases[fnName] || fnName;

      if (finalFnName === "deleteMeta") {
        const { id, titulo } = fnArgs;
        let metaId = id;
        if (titulo && !metaId) {
           const metas = await getMetasByUsuarioId(ctx.userId);
           const meta = metas.find(m => m.titulo.toLowerCase().includes(titulo.toLowerCase()));
           if (meta) metaId = meta.id;
        }
        if (!metaId) {
          const resStr = JSON.stringify({ error: "Meta não encontrada para exclusão." });
          ultimaToolExecutada = fnName;
          ultimoResultadoTool = resStr;
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
          continue;
        }
        const ok = await deleteMeta(metaId);
        const resStr = JSON.stringify({ success: ok, id: metaId });
        ultimaToolExecutada = fnName;
        ultimoResultadoTool = resStr;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
        continue;
      }
      if (finalFnName === "ajustarSaldoMeta") {
        const { titulo, valor, meta_id } = fnArgs;
        let targetId = meta_id;
        const metas = await getMetasByUsuarioId(ctx.userId);
        if (titulo && !targetId) {
          const meta = metas.find(m => m.titulo.toLowerCase().includes(titulo.toLowerCase()));
          if (meta) targetId = meta.id;
        }
        if (!targetId && metas.length === 1) targetId = metas[0].id;
        if (!targetId) {
          const resStr = JSON.stringify({ error: `Meta '${titulo}' não encontrada.` });
          ultimaToolExecutada = fnName;
          ultimoResultadoTool = resStr;
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
          continue;
        }
        const updated = await ajustarSaldoMeta(targetId, valor);
        const resStr = JSON.stringify({ success: true, meta: updated });
        ultimaToolExecutada = fnName;
        ultimoResultadoTool = resStr;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
        continue;
      }
      if (finalFnName === "depositarMeta") {
        const { titulo, valor, meta_id } = fnArgs;
        let targetId = meta_id;
        const metas = await getMetasByUsuarioId(ctx.userId);
        if (titulo && !targetId) {
          const meta = metas.find(m => m.titulo.toLowerCase().includes(titulo.toLowerCase()));
          if (meta) targetId = meta.id;
        }
        if (!targetId && metas.length === 1) targetId = metas[0].id;
        if (!targetId) {
          const resStr = JSON.stringify({ error: `Meta '${titulo}' não encontrada.` });
          ultimaToolExecutada = fnName;
          ultimoResultadoTool = resStr;
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
          continue;
        }
        const updated = await depositarMeta(targetId, valor);
        const resStr = JSON.stringify({ success: true, meta: updated });
        ultimaToolExecutada = fnName;
        ultimoResultadoTool = resStr;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
        continue;
      }


      const result = await executeTool(fnName, fnArgs, ctx);
      ultimaToolExecutada = fnName;
      ultimoResultadoTool = result;

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  if (ultimoResultadoTool && ultimaToolExecutada === "listar_metas") {
    try {
      const parsed = JSON.parse(ultimoResultadoTool);
      if (parsed.metas) {
        let txt = "🎯 *Suas Metas e Caixinhas:*\n\n";
        for (const m of parsed.metas) {
          txt += `• *${m.titulo}* — R$ ${m.valor_atual} / R$ ${m.valor_alvo} (${m.progresso_pct}%)\n`;
        }
        return txt.trim();
      }
    } catch {}
  }

  return "Desculpe, não consegui processar sua solicitação. Tente novamente.";
}
