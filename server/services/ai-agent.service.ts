import axios from "axios";
import { storage, getDailySummary, getPeriodSummary, getWeeklySummary, getCategoryBreakdown, comparePeriods, createMeta, getMetasByUsuarioId, depositarMeta, deleteMeta, ajustarSaldoMeta, sacarMeta, verificarOrcamentos, getStatusOrcamentoContaPJ, getContasAPagar, marcarComoPaga, marcarRecorrente, getFluxoCaixaResumo, getSaldoCartao, getCartoesComSaldo, getFaturaCartao, resolveMemoriaCategoria, aprenderMemoriaCategoria, resolveOuCriaFormaPagamento, criarCompraParcelada, getUltimaCompra, editarTransacoesPorIds, getStatusOrcamentoCategoria, softDeleteTransacao, softDeleteTodasTransacoes, restaurarUltimaExcluida, softDeleteEmpresaTransacao, restaurarUltimaExcluidaPJ, transacaoPertenceAoWallet, cadastrarOuAtualizarCartao, resolveMemoriaGlobal } from "../storage";
import { buscarTransacoesPorFiltro, buscarEmpresaTransacoesPorFiltro, empresaTransacaoPertenceAEmpresa, type CandidatoTransacao } from "../storage";
import { FINANCIAL_AGENT_SYSTEM_PROMPT, buildDynamicContext } from "../prompts/financial-agent";
import { insertTransactionSchema } from "../../shared/schema";
import { withRetry } from "../utils/ai-errors";
import { resolverContaPj } from "./classificar-conta-pj";
import { atualizarTransacaoEmpresa, baixarTransacaoEmpresa } from "./empresa-transacao.service";
import { listarCartoes as listarCartoesPj, criarCartao as criarCartaoPj, listarFaturas as listarFaturasPj, getSaldoCartaoEmpresa } from "./fatura-pj.service";
import { sugerirNomeConta } from "./confirmacao-usuario";
import {
  pareceLancamentoSemMeio,
  registrarPendenteMeio,
  obterPendenteMeio,
  limparPendenteMeio,
  mensagemPedirMeio,
  respostaEhSoMeio,
} from "./atalho-meio-pj";
import {
  registrarOfertaCriarConta,
  limparOfertaCriarConta,
  criarContaEMoverLancamento,
  tentarResolverOfertaCriarConta,
  obterOfertaCriarConta,
} from "./oferta-criar-conta-pj";

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

  const alvo = type === "image"
    ? "a imagem (cupom fiscal, nota fiscal, comprovante ou uma foto com anotações de produtos comprados)"
    : "o documento (comprovante, extrato bancário, cupom/nota fiscal ou anotações de produtos comprados)";

  const prompt = `Você extrai dados financeiros de ${alvo}.

REGRA DE QUALIDADE (leia primeiro): se ${type === "image" ? "a imagem" : "o documento"} estiver ILEGÍVEL, muito apagada, desfocada, cortada, escura, ou se você NÃO tiver confiança razoável nos valores/itens, responda APENAS com uma linha começando por:
ILEGIVEL: <motivo curto> (ex.: "ILEGIVEL: foto muito escura, não dá pra ler os valores")
Não invente itens nem valores quando não tiver certeza.

Se estiver legível, liste os itens neste formato (um por linha):
Comprei DESCRICAO DO ITEM 1 por VALOR
Comprei DESCRICAO DO ITEM 2 por VALOR

E, quando houver na imagem/documento, acrescente ao final (só o que existir):
Total: VALOR
Data: AAAA-MM-DD
Estabelecimento: NOME
Forma de pagamento: FORMA

Os números de valor devem usar notação decimal americana (ponto como separador, ex.: 1234.56).`;

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
  tipoPessoa?: string;
  empresaAtiva?: { id: number; nome: string; cnpj: string | null; segmento?: string | null } | null;
  // true quando a mensagem veio de imagem/áudio/documento (extração automática).
  // Nesses casos o agente confirma antes de gravar (ver regra no runAgent).
  origemMidia?: boolean;
  // Texto da mensagem atual do usuário. Usado por depositar_meta/sacar_meta para
  // casar a meta pelo contexto quando o usuário não dá id/título exato.
  userMessage?: string;
  /** Preenchido pelo simulador de WhatsApp (homologação). */
  toolTrace?: { name: string; args: Record<string, unknown>; resultPreview: string }[];
}

// Ferramentas que o login PJ (empresa ativa) enxerga. Tudo que ficou de fora
// lê a CARTEIRA PESSOAL: era por isso que "total de receita em março" voltava
// zerado — o modelo chamava resumo_periodo (PF, vazio) em vez de resumo_empresa.
// Metas ficam na lista porque são por usuário e já têm empresa_id.
const TOOLS_PJ = new Set([
  "listar_empresas",
  "lancar_empresa",
  "parcelar_compra_empresa",
  "listar_todas_transacoes_empresa",
  "resumo_empresa",
  "dre_empresa",
  "comparar_periodos_empresa",
  "gastos_por_conta_empresa",
  "fluxo_caixa_empresa",
  "buscar_transacao_empresa_por_filtro",
  "busca_transacao_empresa",
  "atualiza_transacao_empresa",
  "deleta_transacao_empresa",
  "restaurar_transacao_empresa",
  "mover_lancamentos_empresa",
  "pagar_transacao_empresa",
  "criar_conta_empresa",
  "criar_conta_e_mover_empresa",
  "cadastrar_cartao_empresa",
  "criar_conta_bancaria_empresa",
  "listar_cartoes_empresa",
  "fatura_cartao_empresa",
  "saldo_cartao_empresa",
  "simular_meta_financeira",
  "criar_meta",
  "deletar_meta",
  "depositar_meta",
  "sacar_meta",
  "ajustar_saldo_meta",
  "listar_metas",
]);

// Equivalente PJ de cada ferramenta PF, para avisar o modelo quando ele insistir
// na versão pessoal (defesa extra, além da lista acima).
const EQUIVALENTE_PJ: Record<string, string> = {
  insere_transacao: "lancar_empresa",
  parcelar_compra: "parcelar_compra_empresa",
  atualiza_transacao: "atualiza_transacao_empresa",
  deleta_transacao: "deleta_transacao_empresa",
  restaurar_transacao: "restaurar_transacao_empresa",
  busca_transacao: "busca_transacao_empresa",
  buscar_transacao_por_filtro: "buscar_transacao_empresa_por_filtro",
  listar_todas_transacoes: "listar_todas_transacoes_empresa",
  transacoes_recentes: "listar_todas_transacoes_empresa",
  resumo_periodo: "resumo_empresa",
  resumo_dia: "resumo_empresa",
  resumo_semana: "resumo_empresa",
  resumo_customizado: "resumo_empresa",
  comparar_periodos: "comparar_periodos_empresa",
  gastos_por_categoria: "gastos_por_conta_empresa",
  fluxo_caixa: "fluxo_caixa_empresa",
  cadastrar_cartao: "cadastrar_cartao_empresa",
  listar_cartoes: "listar_cartoes_empresa",
  fatura_cartao: "fatura_cartao_empresa",
  saldo_cartao: "saldo_cartao_empresa",
  pagar_conta: "pagar_transacao_empresa",
};

const emModoPj = (ctx?: ToolContext) => ctx?.tipoPessoa === "juridica" && !!ctx?.empresaAtiva;

function buildTools(ctx?: ToolContext) {
  const todas = [
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
        description: "Insere uma nova transação (receita ou despesa). OBRIGATÓRIO informar forma_pagamento (Pix, boleto, dinheiro, nome do cartão…). Se o usuário não disse como pagou, NÃO chame esta tool — pergunte antes.",
        parameters: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Descrição da transação" },
            valor: { type: "number", description: "Valor numérico (ex: 50.00)" },
            tipo: { type: "string", enum: ["Receita", "Despesa"], description: "Tipo da transação" },
            data_transacao: { type: "string", description: "Data no formato YYYY-MM-DD" },
            categoria: { type: "string", description: "Nome da categoria (ex: Alimentação, Transporte)" },
            forma_pagamento: { type: "string", description: "Como pagou/recebeu: 'Pix', 'Boleto', 'Dinheiro', nome da conta ou do cartão. Obrigatório. NUNCA invente nome de cartão/banco que o usuário não disse." },
          },
          required: ["descricao", "valor", "tipo", "data_transacao", "categoria", "forma_pagamento"],
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
        description: "Busca detalhes de uma transação pelo código (ID). Use depois que o usuário informar o código, para conferir a transação ANTES de editar.",
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
        name: "buscar_transacao_por_filtro",
        description: "Procura transações por descrição, valor e/ou data, para descobrir QUAL o usuário quer editar. Use SEMPRE antes de editar quando ele não deu o código. Devolve 1 candidato, vários (para desambiguar) ou nenhum. NÃO altera nada.",
        parameters: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Parte da descrição (ex.: 'mercado', 'posto')." },
            valor: { type: "number", description: "Valor aproximado da transação." },
            data_inicio: { type: "string", description: "AAAA-MM-DD — início da janela de datas (ex.: 'ontem' → a data de ontem)." },
            data_fim: { type: "string", description: "AAAA-MM-DD — fim da janela de datas." },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
          },
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
        name: "listar_todas_transacoes",
        description: "Retorna TODAS as transações e despesas cadastradas na carteira, sem limite de quantidade. Use quando o usuário pedir o histórico completo, extrato completo ou 'todas as transações/despesas'.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "listar_todas_transacoes_empresa",
        description: "Retorna TODAS as transações e despesas da EMPRESA ativa, sem limite de quantidade. Use quando o usuário PJ pedir o histórico completo, extrato ou todas as transações da empresa.",
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
        name: "deleta_transacao_empresa",
        description: "Remove um lançamento da EMPRESA pelo ID (vai para a lixeira, recuperável por 30 dias). Só para usuário PJ.",
        parameters: {
          type: "object",
          properties: {
            id_transacao: { type: "number", description: "ID do lançamento em empresas_transacoes" },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "restaurar_transacao_empresa",
        description: "Restaura a ÚLTIMA exclusão da empresa (desfazer). Use em 'me arrependi', 'volta o que apaguei', 'desfazer'.",
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
        description: "Cadastra um cartão de crédito para o usuário (com nome, limite, dia de fechamento e vencimento). Use quando disserem 'cadastra meu cartão', 'tenho um cartão limite X'.",
        parameters: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome do cartão (como o usuário chama). NÃO invente." },
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
        description: "Mostra o saldo disponível de um cartão de crédito (limite - gastos do período). Use quando perguntarem 'quanto tenho no cartão', 'meu cartão tá no limite?'.",
        parameters: {
          type: "object",
          properties: {
            nome_cartao: { type: "string", description: "Nome do cartão (como cadastrado). Se omitido, mostra todos." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "fatura_cartao",
        description: "Lista todas as transações da fatura atual de um cartão (conciliação). Use quando pedirem 'fatura do cartão', 'o que gastei no cartão'.",
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
        description: "Registra uma compra PARCELADA em várias vezes. OBRIGATÓRIO informar forma_pagamento (quase sempre o cartão). Se o usuário não disse em qual cartão/forma, NÃO chame — pergunte antes.",
        parameters: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "O que foi comprado (ex.: 'cadeira')" },
            valor_total: { type: "number", description: "Valor TOTAL da compra (será dividido pelas parcelas)" },
            valor_parcela: { type: "number", description: "Valor de CADA parcela (use este OU valor_total)" },
            parcelas: { type: "number", description: "Número de parcelas (ex.: 10)" },
            forma_pagamento: { type: "string", description: "Cartão/forma (nome que o usuário disse). Obrigatório. NUNCA invente." },
            categoria: { type: "string" },
            data_inicio: { type: "string", description: "AAAA-MM-DD (default hoje)" },
            confirmar_sem_cartao: {
              type: "boolean",
              description: "So true depois que o usuario confirmar que o parcelamento NAO e num cartao de credito (carne, boleto parcelado).",
            },
          },
          required: ["descricao", "parcelas", "forma_pagamento"],
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
    {
      type: "function" as const,
      function: {
        name: "mover_lancamentos",
        description:
          "Move lancamentos JA REGISTRADOS (pelos codigos) para outra conta bancaria ou cartao de credito. Use para 'coloque esses lancamentos no cartao X', 'essa compra foi no cartao X e nao no Y'. Ajusta fatura, competencia e caixa junto. Confirme os codigos com o usuario antes de chamar.",
        parameters: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "number" },
              description: "Codigos dos lancamentos (todos os da compra, se for parcelada).",
            },
            destino: {
              type: "string",
              description: "Nome do cartao ou da conta de destino (como o usuario chama).",
            },
          },
          required: ["ids", "destino"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mover_lancamentos_empresa",
        description:
          "Move lancamentos JA REGISTRADOS DA EMPRESA (pelos codigos) para outra conta bancaria ou cartao de credito da empresa. Ajusta fatura, competencia e caixa junto. Confirme os codigos com o usuario antes de chamar.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            ids: { type: "array", items: { type: "number" }, description: "Codigos dos lancamentos." },
            destino: { type: "string", description: "Nome do cartao ou da conta bancaria de destino." },
          },
          required: ["ids", "destino"],
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
        description: "Lança receita/despesa NA EMPRESA (PJ) à vista — inclusive compra no CARTÃO em 1x (entra na fatura vigente). Só use parcelar_compra_empresa se o usuário DISSE que é parcelado (3x, em 5 vezes…). forma_pagamento = conta, Caixinha/dinheiro ou cartão. Dinheiro na frase → Caixinha. PIX/boleto pedem conta.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Opcional — ignorado; a empresa ativa do login é usada automaticamente." },
            conta: { type: "string", description: "Código ou nome da conta do plano da empresa (ex.: '3.01', 'Receita de Vendas'). Se não souber, pode omitir — o sistema escolhe a melhor conta e, se não achar, usa Outras." },
            descricao: { type: "string" },
            valor: { type: "number" },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
            data_transacao: { type: "string", description: "AAAA-MM-DD (default hoje)" },
            forma_pagamento: {
              type: "string",
              description: "Conta bancária, Caixinha/dinheiro ou cartão. Pode omitir se a frase do usuário já trouxer (ex.: 'em dinheiro', 'pix').",
            },
            parcelas: {
              type: "number",
              description: "Se > 1, a tool redireciona para parcelamento no cartão (mesma lógica de parcelar_compra_empresa).",
            },
            valor_parcela: {
              type: "number",
              description: "Valor de CADA parcela (ex.: 35). Use com parcelas quando o usuário disser '5x de 35'.",
            },
          },
          required: ["tipo"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "parcelar_compra_empresa",
        description: "Compra PARCELADA (2+ vezes) no CARTÃO da empresa. NÃO use se o usuário só disse 'no cartão' sem falar em parcelas — nesse caso use lancar_empresa (à vista 1x na fatura). Use quando houver '3x', 'em 5 vezes', 'parcelada em Nx'. Cria N lançamentos; 1ª na fatura vigente. Informe valor_parcela OU valor_total.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            descricao: { type: "string", description: "O que foi comprado (se o usuário não disse, use 'Compra parcelada')" },
            valor_total: { type: "number", description: "Total da compra. Use quando disser '300 em 3x' / 'valor de 300 parcelado'." },
            valor_parcela: { type: "number", description: "Valor de CADA parcela. Use quando disser '3x100' / '3x de 100' / '5x de 35'." },
            parcelas: { type: "number", description: "Número de parcelas (ex.: 3). Se omitir, o sistema tenta ler da frase do usuário." },
            forma_pagamento: { type: "string", description: "Nome do cartão (ex.: 'Itaú', 'Magalu'). Se omitir e houver só 1 cartão, o sistema usa esse. Se houver vários, a tool pede para escolher." },
            conta: { type: "string", description: "Conta do plano (opcional)" },
            data_inicio: { type: "string", description: "AAAA-MM-DD da 1ª parcela. Omita para usar HOJE → fatura vigente." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "resumo_empresa",
        description: "Resumo financeiro da empresa num período: total de RECEITA, total de DESPESA e saldo. Use para 'quanto a empresa faturou', 'total de receita em março', 'quanto gastei no mês', 'como está minha empresa'. Para um mês específico, passe 'mes' (e 'ano' se não for o ano corrente).",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            mes: { type: "number", description: "Mês 1-12. Use quando o usuário citar um mês (ex.: 'em março' → 3)." },
            ano: { type: "number", description: "Ano com 4 dígitos (default: ano corrente)." },
            de: { type: "string", description: "AAAA-MM-DD (alternativa a mes/ano, para períodos livres)" },
            ate: { type: "string", description: "AAAA-MM-DD (alternativa a mes/ano)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "comparar_periodos_empresa",
        description: "Compara dois períodos da empresa (receita, despesa, saldo e variação %). Use para 'compara esse mês com o anterior', 'a empresa melhorou?'.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            mes_a: { type: "number", description: "Mês do primeiro período (1-12)." },
            ano_a: { type: "number", description: "Ano do primeiro período." },
            mes_b: { type: "number", description: "Mês do segundo período (1-12)." },
            ano_b: { type: "number", description: "Ano do segundo período." },
          },
          required: ["mes_a", "mes_b"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "gastos_por_conta_empresa",
        description: "Quebra os lançamentos da empresa por conta do plano de contas no período. Use para 'quanto gastei com folha', 'onde a empresa mais gasta', 'gastos por categoria da empresa'.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            mes: { type: "number", description: "Mês 1-12 (opcional)." },
            ano: { type: "number", description: "Ano (opcional)." },
            de: { type: "string", description: "AAAA-MM-DD (opcional)" },
            ate: { type: "string", description: "AAAA-MM-DD (opcional)" },
            tipo: { type: "string", enum: ["Receita", "Despesa"], description: "Filtra só receitas ou só despesas (opcional)." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "fluxo_caixa_empresa",
        description: "Fluxo de caixa mês a mês da empresa no ano (receita, despesa e saldo de cada mês). Use para 'meu fluxo de caixa', 'como foi o ano', 'evolução mês a mês'.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            ano: { type: "number", description: "Ano com 4 dígitos (default: ano corrente)." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "buscar_transacao_empresa_por_filtro",
        description: "Procura lançamentos DA EMPRESA por descrição, valor e/ou data, para descobrir QUAL o usuário quer editar. Use SEMPRE antes de editar quando ele não deu o código. Devolve 1 candidato, vários (para desambiguar) ou nenhum.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            descricao: { type: "string", description: "Parte da descrição (ex.: 'mercado', 'posto')." },
            valor: { type: "number", description: "Valor aproximado do lançamento." },
            data_inicio: { type: "string", description: "AAAA-MM-DD — início da janela de datas." },
            data_fim: { type: "string", description: "AAAA-MM-DD — fim da janela de datas." },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "busca_transacao_empresa",
        description: "Busca um lançamento DA EMPRESA pelo código (ID). Use depois que o usuário informar o código, para conferir o lançamento ANTES de editar.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            id_transacao: { type: "number", description: "Código/ID do lançamento." },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "atualiza_transacao_empresa",
        description: "Edita um lançamento DA EMPRESA pelo código (ID). Só chame DEPOIS que o usuário confirmar a alteração. Envie apenas os campos que mudam.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            id_transacao: { type: "number", description: "Código/ID do lançamento." },
            descricao: { type: "string" },
            valor: { type: "number" },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
            data_transacao: { type: "string", description: "AAAA-MM-DD" },
            conta: { type: "string", description: "Código ou nome da conta do plano (ex.: '3.01', 'Folha de Pagamento')." },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "pagar_transacao_empresa",
        description: "Baixa (marca como paga) uma conta Pendente da empresa. Use quando disserem 'paguei', 'quitei', 'baixa essa conta'. Confirme antes se o usuário não deu o código.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            id_transacao: { type: "number", description: "Código/ID do lançamento pendente." },
            data_pagamento: { type: "string", description: "AAAA-MM-DD (opcional; default = hoje)." },
          },
          required: ["id_transacao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "criar_conta_empresa",
        description: "Cria uma nova conta no plano de contas da empresa. O CÓDIGO é gerado automaticamente na sequência — NÃO peça nem invente código. Use quando o usuário disser 'cria uma conta', 'preciso de uma categoria para X'. Se for para criar E mover um lançamento que caiu em Outras, prefira 'criar_conta_e_mover_empresa'.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            nome: { type: "string", description: "Nome da conta (ex.: 'Manutenção de Veículos')." },
            tipo: { type: "string", enum: ["Receita", "Despesa"], description: "Se é conta de entrada ou de saída." },
            classificacao: { type: "string", enum: ["FIXA", "VARIAVEL", "OUTRA"], description: "Despesa FIXA (todo mês, valor previsível) ou VARIAVEL (varia com a operação). Em dúvida, pergunte ao usuário." },
            grupo_gerencial: { type: "string", description: "Grupo do fluxo de caixa (opcional): receita, custo_variavel, despesa_fixa, investimento, nao_operacional, outras." },
          },
          required: ["nome", "tipo"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "criar_conta_e_mover_empresa",
        description: "Cria (ou reusa) uma conta no plano E move um lançamento para ela em um único passo. Use quando o usuário confirmar a oferta após cair em Outras (sim/pode/ok) ou pedir explicitamente criar a conta e mover. NÃO peça confirmação de novo — a resposta do usuário JÁ é a confirmação.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            id_transacao: { type: "number", description: "Código/ID do lançamento a mover." },
            nome: { type: "string", description: "Nome da conta a criar (ex.: 'Alimentação')." },
            tipo: { type: "string", enum: ["Receita", "Despesa"] },
            classificacao: { type: "string", enum: ["FIXA", "VARIAVEL", "OUTRA"], description: "Default VARIAVEL para despesa se omitir." },
            resposta_usuario: { type: "string", description: "Texto exato da confirmação do usuário (sim, pode, ok...). O sistema valida se é afirmação ou recusa." },
          },
          required: ["id_transacao", "nome", "tipo"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "cadastrar_cartao_empresa",
        description: "Cadastra OU atualiza um cartão de crédito DA EMPRESA (upsert pelo nome). Se já existir, só atualiza dias/limite — NÃO cria duplicata. Precisa do dia de fechamento e do dia de vencimento — pergunte os dois de uma vez se o usuário não disser. NUNCA invente esses dias nem o nome do cartão. Chame no máximo UMA vez por cartão no fluxo.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            nome: { type: "string", description: "Nome do cartão (como o usuário disse). NÃO invente." },
            dia_fechamento: { type: "number", description: "Dia do mês em que a fatura fecha (1-31)." },
            dia_vencimento: { type: "number", description: "Dia do mês em que a fatura vence (1-31)." },
            limite: { type: "number", description: "Limite do cartão em R$ (opcional)." },
            bandeira: { type: "string", description: "Visa, Mastercard, Elo... (opcional)" },
          },
          required: ["nome", "dia_fechamento", "dia_vencimento"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "criar_conta_bancaria_empresa",
        description: "Cadastra uma CONTA BANCÁRIA da empresa (Itaú, Bradesco, etc.) — NÃO é conta do plano de contas. Use quando o usuário quiser cadastrar conta para Pix/TED/boleto, ou quando a tool devolver precisa=cadastrar_conta. Confirme banco/nome com o usuário ANTES de chamar. Para dinheiro use a Caixinha (não precisa cadastrar).",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            nome: { type: "string", description: "Como o usuário chama (ex.: 'Conta corrente Itaú')." },
            banco: { type: "string", description: "Banco (ex.: 'Itaú', 'Bradesco'). Se omitir, usa o nome." },
            tipo: { type: "string", enum: ["corrente", "poupanca", "caixa"], description: "Default corrente." },
            saldo_inicial: { type: "number", description: "Saldo inicial em R$ (default 0)." },
          },
          required: ["nome"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "listar_cartoes_empresa",
        description: "Lista os cartões de crédito cadastrados na empresa.",
        parameters: {
          type: "object",
          properties: { empresa: { type: "string", description: "Nome (ou parte) da empresa." } },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "fatura_cartao_empresa",
        description: "Mostra as faturas de um cartão da empresa (competência, vencimento, total e status).",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            cartao: { type: "string", description: "Nome (ou parte) do cartão." },
          },
          required: ["cartao"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "saldo_cartao_empresa",
        description: "Mostra limite, usado e disponível de um cartão da empresa. Use para 'quanto tenho disponível no cartão', 'meu cartão tá no limite?'.",
        parameters: {
          type: "object",
          properties: {
            empresa: { type: "string", description: "Nome (ou parte) da empresa." },
            cartao: { type: "string", description: "Nome (ou parte) do cartão." },
          },
          required: ["cartao"],
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
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "sacar_meta",
        description: "Retira um valor de uma meta/sonho/caixinha. Use quando o usuário disser 'tirei X da meta Y', 'usei R$ Z da poupança'.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título da meta (ex: 'Juntar 100 mil', 'Viagem para a Disney')" },
            meta_id: { type: "number", description: "ID da meta (se conhecido)" },
            valor: { type: "number", description: "Valor a sacar em R$" },
          },
          required: ["valor"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "ajustar_saldo_meta",
        description: "Ajusta o saldo atual de uma meta para um valor específico. Use quando o usuário disser 'corrige o saldo da meta X para Y', 'atualiza o valor da poupança para Z'.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título da meta (ex: 'Juntar 100 mil', 'Viagem para a Disney')" },
            meta_id: { type: "number", description: "ID da meta (se conhecido)" },
            valor: { type: "number", description: "Novo valor do saldo em R$" },
          },
          required: ["valor"],
        },
      },
    },
  ];

  if (!emModoPj(ctx)) {
    // Conta jurídica sem empresa: zero tools de escrita (nem PF nem PJ).
    if (ctx?.tipoPessoa === "juridica") {
      return [];
    }
    return todas;
  }
  return todas.filter((t) => TOOLS_PJ.has(t.function.name));
}

// ============================================
// TOOL EXECUTORS — chama storage direto
// ============================================

async function executeTool(name: string, args: any, ctx: ToolContext): Promise<string> {
  try {
    // Isolamento: usuário PJ nunca grava na carteira pessoal — mesmo sem empresaAtiva.
    if (
      ctx.tipoPessoa === "juridica" &&
      !emModoPj(ctx) &&
      (name === "insere_transacao" ||
        name === "parcelar_compra" ||
        name === "editar_ultima_compra" ||
        name === "atualiza_transacao")
    ) {
      return JSON.stringify({
        erro: true,
        error:
          "Conta empresarial sem empresa ativa. Não é permitido lançar na carteira pessoal. Oriente o usuário a concluir o cadastro da empresa ou falar com o suporte.",
      });
    }

    // Isolamento PF × PJ: se o modelo insistir numa ferramenta pessoal com
    // empresa ativa, não lê a carteira PF — devolve o equivalente PJ.
    if (emModoPj(ctx) && !TOOLS_PJ.has(name)) {
      const equivalente = EQUIVALENTE_PJ[name];
      return JSON.stringify({
        erro: true,
        error: equivalente
          ? `Este usuário é PJ. Use '${equivalente}' (dados da empresa), não '${name}' (carteira pessoal).`
          : `'${name}' é uma ferramenta pessoal e não vale para este usuário PJ.`,
      });
    }

    switch (name) {
      case "insere_transacao": {
        // Normaliza o tipo para o padrão do banco ("Receita" | "Despesa").
        const tipo = /receita|entrada|income|recebimento/i.test(args.tipo || "")
          ? "Receita"
          : "Despesa";

        // Exige forma de pagamento — não inventa PIX nem deixa em branco.
        const formaInformada = String(args.forma_pagamento || "").trim();
        if (!formaInformada) {
          const cartoes = await getCartoesComSaldo(ctx.userId, ctx.walletId).catch(() => []);
          const nomesCartoes = (cartoes as any[]).map((c) => c.cartao_nome || c.nome).filter(Boolean);
          const sugestoes = [
            "Pix", "Boleto", "Dinheiro", "Débito",
            ...nomesCartoes.slice(0, 5),
          ];
          return JSON.stringify({
            precisa_forma: true,
            error: "Forma de pagamento não informada.",
            mensagem: "Pergunte ao usuário como pagou/recebeu antes de registrar. Não invente Pix.",
            sugestoes,
            exemplo: nomesCartoes.length
              ? `Foi no Pix, boleto, dinheiro ou no cartão (${nomesCartoes.join(", ")})?`
              : "Foi no Pix, boleto, dinheiro ou em qual cartão?",
          });
        }

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

        // Mesma regra do formulário/API: cartão → fatura + sem caixa; senão → conta padrão.
        try {
          const { aplicarMeioPagamentoPf } = await import("./meio-pagamento-pf");
          const meio = await aplicarMeioPagamentoPf({
            userId: ctx.userId,
            walletId: ctx.walletId,
            tipo,
            dataISO: String(txData.data_transacao).slice(0, 10),
            forma_pagamento_id: formaPagId ?? null,
            statusAtual: txData.status,
          });
          txData.forma_pagamento_id = meio.forma_pagamento_id;
          txData.conta_bancaria_id = meio.conta_bancaria_id;
          txData.fatura_id = meio.fatura_id;
          txData.competencia = meio.competencia;
          txData.movimenta_caixa = meio.movimenta_caixa;
          if (meio.status) txData.status = meio.status;
        } catch (meioErr: any) {
          return JSON.stringify({ error: meioErr?.message || "Meio de pagamento inválido" });
        }

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
        // Isolamento: só devolve transação da própria carteira (antes devolvia
        // a de qualquer usuário para quem acertasse o ID).
        const doDono = await transacaoPertenceAoWallet(args.id_transacao, ctx.walletId);
        if (!doDono) return JSON.stringify({ error: "Transação não encontrada nas suas transações." });
        const tx = await storage.getTransactionById(args.id_transacao);
        return JSON.stringify(tx || { error: "Transação não encontrada" });
      }

      case "buscar_transacao_por_filtro": {
        const achados = await buscarTransacoesPorFiltro(ctx.walletId, {
          descricao: args.descricao,
          valor: args.valor,
          data_inicio: args.data_inicio,
          data_fim: args.data_fim,
          tipo: args.tipo,
        });
        return JSON.stringify(respostaBusca(achados));
      }

      case "transacoes_recentes": {
        const txs = await storage.getRecentTransactionsByWalletId(ctx.walletId, 5);
        return JSON.stringify(txs);
      }

      case "listar_todas_transacoes": {
        const txs = await storage.getTransactionsByWalletId(ctx.walletId);
        return JSON.stringify(txs);
      }

      case "listar_todas_transacoes_empresa": {
        if (!ctx.empresaAtiva) {
          return JSON.stringify({ error: "Nenhuma empresa ativa selecionada para este usuário PJ." });
        }
        const txs = await storage.getEmpresaTransacoesByEmpresaId(ctx.empresaAtiva.id);
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
          await softDeleteTransacao(transacao.id, ctx.walletId, ctx.userId);
        }

        return JSON.stringify({
          success: true,
          recuperavel: true,
          excluidos: transacoesFiltradas.length,
          msg: `${transacoesFiltradas.length} movida(s) para a lixeira (recuperáveis por 30 dias).`,
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

      case "deleta_transacao_empresa": {
        if (!ctx.empresaAtiva) {
          return JSON.stringify({ error: "Nenhuma empresa ativa." });
        }
        const okPj = await softDeleteEmpresaTransacao(args.id_transacao, ctx.empresaAtiva.id, ctx.userId);
        if (!okPj) return JSON.stringify({ success: false, error: "Lançamento não encontrado nesta empresa." });
        return JSON.stringify({ success: true, recuperavel: true, msg: "Excluído da empresa (dá pra restaurar por 30 dias)." });
      }

      case "restaurar_transacao_empresa": {
        if (!ctx.empresaAtiva) {
          return JSON.stringify({ error: "Nenhuma empresa ativa." });
        }
        const rPj = await restaurarUltimaExcluidaPJ(ctx.empresaAtiva.id);
        if (!rPj.restaurada) {
          return JSON.stringify({ success: false, error: "Não há exclusões da empresa para restaurar." });
        }
        return JSON.stringify({ success: true, restaurada: rPj.descricao || "último lançamento" });
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
        // Limite de despesa: PF liga a categoria (categorias); PJ liga a conta do
        // plano de contas da empresa (empresas_contas). Se não achar a conta PJ,
        // conta_id fica null = limite do TOTAL de despesas da empresa.
        let categoriaId: number | null = null;
        let contaId: number | null = null;
        if (args.tipo === "limite_categoria" && args.categoria) {
          if (ctx.empresaAtiva) {
            const contas = await storage.getEmpresasContasByEmpresaId(ctx.empresaAtiva.id);
            const alvo = args.categoria.toLowerCase();
            const conta = contas.find(c => c.nome.toLowerCase() === alvo)
              || contas.find(c => c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase()));
            contaId = conta?.id ?? null;
          } else {
            const cat = ctx.categories.find(c => c.nome.toLowerCase() === args.categoria.toLowerCase());
            categoriaId = cat?.id || null;
          }
        }

        const meta = await createMeta(ctx.userId, {
          titulo: args.titulo,
          tipo: args.tipo,
          valor_alvo: args.valor_alvo,
          prazo: args.prazo || null,
          categoria_id: categoriaId,
          conta_id: contaId,
          recorrencia: args.recorrencia || null,
          valor_recorrencia: args.valor_recorrencia || null,
        } as any);
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

        // Isolamento: só age em meta do próprio usuário (nunca id cru vindo do modelo).
        if (targetId != null && !metas.some(m => m.id === Number(targetId))) targetId = undefined;

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

        // Isolamento: só age em meta do próprio usuário (nunca id cru vindo do modelo).
        if (targetId != null && !metas.some(m => m.id === Number(targetId))) targetId = undefined;

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

        // Isolamento: só age em meta do próprio usuário (nunca id cru vindo do modelo).
        if (targetId != null && !metas.some(m => m.id === Number(targetId))) targetId = undefined;

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
        // Isolamento: só exclui meta do próprio usuário (nunca id cru vindo do modelo).
        if (targetId != null && !metas.some(m => m.id === Number(targetId))) targetId = undefined;
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
          // Sem limite não há disponível: diz isso em texto, senão o template
          // do prompt imprimiria "Disponível: R$ null".
          return JSON.stringify(saldo.sem_limite
            ? { ...saldo, disponivel: null, limite: null, aviso: "Este cartão está sem limite cadastrado — informe o total usado e diga que não dá para calcular o disponível. Ofereça cadastrar o limite." }
            : saldo);
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
        const ativos = [...doUsuario, ...globais].filter((p: any) => p.ativo !== false);
        // Cartão de crédito é o que tem dias de fechamento e vencimento. Boleto,
        // Pix e "Nubank" solto são FORMAS — oferecê-los como cartão fazia a
        // compra parcelada cair fora da fatura, no caixa.
        const ehCartao = (p: any) => p.dia_fechamento != null && p.dia_vencimento != null;
        const nomes = Array.from(new Set(ativos.filter(ehCartao).map((p: any) => p.nome)));
        const outras = Array.from(new Set(ativos.filter((p: any) => !ehCartao(p)).map((p: any) => p.nome)));
        if (nomes.length === 0) {
          return JSON.stringify({
            cartoes: [],
            outras_formas: outras,
            mensagem: "Nenhum CARTÃO DE CRÉDITO cadastrado (com dia de fechamento e vencimento). Os nomes em outras_formas NÃO são cartão — não ofereça como cartão. Peça o nome do cartão para cadastrar.",
          });
        }
        return JSON.stringify({
          cartoes: nomes,
          outras_formas: outras,
          aviso: "Só o que está em 'cartoes' é cartão de crédito. Nunca ofereça 'outras_formas' como cartão.",
        });
      }

      case "mover_lancamentos": {
        const { moverLancamentosPf } = await import("./mover-meio.service");
        const r = await moverLancamentosPf(ctx.userId, ctx.walletId, args.ids, String(args.destino || ""));
        if (!r.ok) return JSON.stringify({ success: false, ...r });
        return JSON.stringify({
          success: true,
          movidos: r.afetados,
          destino: r.destino,
          tipo_destino: r.tipo_destino,
          faturas: r.faturas,
          ids: r.ids,
          mensagem: r.tipo_destino === "cartao"
            ? `Movi ${r.afetados} lançamento(s) para o cartão ${r.destino}. Eles saíram do caixa e entraram nas faturas ${r.faturas.join(", ")}.`
            : `Movi ${r.afetados} lançamento(s) para a conta ${r.destino}.`,
        });
      }

      case "parcelar_compra": {
        const formaParcelar = String(args.forma_pagamento || "").trim();
        if (!formaParcelar) {
          const cartoes = await getCartoesComSaldo(ctx.userId, ctx.walletId).catch(() => []);
          const nomesCartoes = (cartoes as any[]).map((c) => c.cartao_nome || c.nome).filter(Boolean);
          return JSON.stringify({
            precisa_forma: true,
            error: "Forma de pagamento não informada.",
            mensagem: "Pergunte em qual cartão/forma foi a compra parcelada. Não invente.",
            sugestoes: nomesCartoes.length ? nomesCartoes : ["nome do cartão"],
            exemplo: nomesCartoes.length
              ? `Em qual cartão? Você tem: ${nomesCartoes.join(", ")}.`
              : "Em qual cartão foi essa compra parcelada?",
          });
        }

        const parcelas = Math.max(1, Math.min(60, Number(args.parcelas) || 1));
        let valorParcela = Number(args.valor_parcela) || 0;
        const valorTotalArg = args.valor_total != null ? Number(args.valor_total) : null;
        if (!valorParcela && valorTotalArg) valorParcela = valorTotalArg / parcelas;
        if (!valorParcela) return JSON.stringify({ error: "Informe valor_total ou valor_parcela." });
        const valorTotal = valorTotalArg != null && Number.isFinite(valorTotalArg)
          ? valorTotalArg
          : valorParcela * parcelas;

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

        // Conta padrão se não for cartão completo (criarCompraParcelada já amarra fatura no cartão).
        let contaBancariaId: number | null = null;
        if (formaId) {
          const { cartaoPfDoUsuario } = await import("./fatura-pf.service");
          const cartao = await cartaoPfDoUsuario(formaId, ctx.userId);
          if (!cartao) {
            // A forma existe mas NÃO é cartão de crédito. Antes isso virava N
            // saídas de caixa em silêncio — o usuário dizia "Nubank" pensando no
            // "CC Nubank PF" e a compra não entrava em fatura nenhuma.
            if (!args.confirmar_sem_cartao) {
              const reais = await getCartoesComSaldo(ctx.userId, ctx.walletId).catch(() => []);
              const nomesReais = (reais as any[]).map((c) => c.cartao_nome || c.nome).filter(Boolean);
              return JSON.stringify({
                precisa_confirmar: true,
                error: `"${formaNome}" está cadastrado como forma de pagamento, não como cartão de crédito.`,
                cartoes_de_credito: nomesReais,
                mensagem: nomesReais.length
                  ? `Pergunte ao usuário: o parcelamento foi em algum destes cartões (${nomesReais.join(", ")})? Se ele confirmar que é carnê/boleto parcelado em "${formaNome}" mesmo, chame de novo com confirmar_sem_cartao=true.`
                  : `Pergunte se é carnê/boleto parcelado. Se for cartão, ele precisa cadastrar o cartão com dia de fechamento e vencimento.`,
              });
            }
            const { contaPadraoPf } = await import("./conta-bancaria.service");
            contaBancariaId = await contaPadraoPf(ctx.userId);
          }
        } else {
          const { contaPadraoPf } = await import("./conta-bancaria.service");
          contaBancariaId = await contaPadraoPf(ctx.userId);
        }

        const r = await criarCompraParcelada({
          walletId: ctx.walletId,
          categoriaId: catP!.id,
          descricao: args.descricao || "Compra",
          valorTotal,
          parcelas,
          formaPagamentoId: formaId,
          dataInicio,
          usuarioId: ctx.userId,
          contaBancariaId,
        });
        const orcamentoP = await getStatusOrcamentoCategoria(ctx.userId, ctx.walletId, catP!.id);
        return JSON.stringify({
          success: true, compra_grupo: r.compra_grupo, parcelas: r.parcelas,
          valor_parcela: r.valor_parcela, total: Math.round(valorTotal * 100) / 100,
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
        let formaIdEdit: number | null = null;
        if (args.forma_pagamento) {
          const fp = await resolveOuCriaFormaPagamento(ctx.userId, args.forma_pagamento);
          if (fp.id) { patch.forma_pagamento_id = fp.id; formaNome = fp.nome; formaIdEdit = fp.id; }
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

        // Se trocou a forma para um cartão (ou saiu dele), reaplica fatura/caixa em cada parcela.
        if (formaIdEdit != null) {
          try {
            const { aplicarMeioPagamentoPf } = await import("./meio-pagamento-pf");
            const { db } = await import("../db");
            const { sql } = await import("drizzle-orm");
            for (const id of compra.ids) {
              const row = await db.execute(sql`
                SELECT data_transacao, tipo, status FROM transacoes WHERE id = ${id} LIMIT 1
              `);
              const t = (row as any[])[0];
              if (!t) continue;
              const meio = await aplicarMeioPagamentoPf({
                userId: ctx.userId,
                walletId: ctx.walletId,
                tipo: t.tipo || "Despesa",
                dataISO: String(t.data_transacao).slice(0, 10),
                forma_pagamento_id: formaIdEdit,
                statusAtual: t.status,
              });
              await db.execute(sql`
                UPDATE transacoes SET
                  forma_pagamento_id = ${meio.forma_pagamento_id},
                  conta_bancaria_id = ${meio.conta_bancaria_id},
                  fatura_id = ${meio.fatura_id},
                  competencia = ${meio.competencia},
                  movimenta_caixa = ${meio.movimenta_caixa},
                  status = ${meio.status || t.status}
                WHERE id = ${id}
              `);
            }
          } catch (e: any) {
            return JSON.stringify({
              success: true, parcelas_afetadas: n, compra: compra.descricao_base,
              forma_pagamento: formaNome, categoria: catNome, nova_descricao: args.descricao,
              aviso: e?.message || "Forma alterada, mas fatura/caixa não foram recalculados.",
            });
          }
        }

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
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);

        const { detectarMeio, textoMeioDeDetect } = await import("./parse-meio");
        const { resolverMeioPorNomePj, aplicarMeioPagamentoPj } = await import("./meio-pagamento-pj");

        // Meio: frase do usuário manda — pistas (banco/cartão) e cartão genérico.
        const detUser = detectarMeio(ctx.userMessage || "");
        let meioTexto = "";
        if (detUser.tipo === "cartao_generico") {
          meioTexto = "cartao";
        } else if (detUser.tipo === "conta_generica") {
          meioTexto = "conta";
        } else if (detUser.tipo === "dinheiro" || detUser.tipo === "conta_necessaria") {
          meioTexto = textoMeioDeDetect(detUser);
        } else if (detUser.tipo === "nome") {
          // Mantém pista ("banco santander" / "cartao X") — não deixa o modelo apagar.
          meioTexto = textoMeioDeDetect(detUser) || String(args.forma_pagamento || "").trim();
        } else {
          meioTexto = String(args.forma_pagamento || "").trim();
          if (!meioTexto) meioTexto = textoMeioDeDetect(detUser);
        }
        if (!meioTexto) {
          const resolvidoVazio = await resolverMeioPorNomePj(empresa.id, ctx.userId, "");
          if (!resolvidoVazio.ok) {
            return JSON.stringify({
              error: resolvidoVazio.mensagem,
              precisa_meio: true,
              precisa: resolvidoVazio.precisa,
              sugestoes: resolvidoVazio.sugestoes,
              contas: resolvidoVazio.contas,
              cartoes: resolvidoVazio.cartoes,
              mensagem: resolvidoVazio.mensagem,
            });
          }
        }

        const parcelasN = Math.min(60, Math.max(1, Number(args.parcelas) || 1));
        const {
          textoSugereParcelamento,
          parseParcelamentoDoTexto,
        } = await import("./parse-parcelamento");
        const msgUser = ctx.userMessage || "";
        // Só a mensagem do usuário conta — ignore descrição inventada "Compra parcelada".
        const doTextoParc = parseParcelamentoDoTexto(msgUser);
        const qtdParcelas =
          parcelasN > 1 ? parcelasN : (Number(doTextoParc.parcelas) >= 2 ? Number(doTextoParc.parcelas) : 0);
        const userFalouParcelado = textoSugereParcelamento(msgUser);

        // Cartão sem falar em parcelas = à vista (1x) via lancar_empresa.
        // Parcelar só com 2+ parcelas explícitas (3x, em 5 vezes…).
        if (qtdParcelas >= 2) {
          return executeTool("parcelar_compra_empresa", {
            ...args,
            tipo: "Despesa",
            valor_parcela: args.valor_parcela ?? doTextoParc.valorParcela ?? undefined,
            valor_total: args.valor_total ?? (doTextoParc.modo === "total" ? doTextoParc.valorTotal : undefined),
            parcelas: qtdParcelas,
            forma_pagamento: args.forma_pagamento || doTextoParc.cartaoHint || meioTexto || undefined,
            data_inicio: args.data_transacao || args.data_inicio,
            descricao: args.descricao || "Compra parcelada",
          }, ctx);
        }
        if (userFalouParcelado && qtdParcelas < 2) {
          return JSON.stringify({
            error: "Faltou a quantidade de parcelas.",
            precisa_valor: true,
            precisa: "parcelas",
            mensagem:
              "Você falou em parcelado — em quantas vezes? (ex.: 3x, 5x de 35). Se foi à vista no cartão, diga \"à vista\" ou \"1x\".",
            exemplos: ["3x de 100 no Cartão Exemplo", "à vista no cartão"],
          });
        }

        if (!(Number(args.valor) > 0)) {
          return JSON.stringify({ error: "Informe o valor do lançamento." });
        }

        let resolvido = await resolverMeioPorNomePj(empresa.id, ctx.userId, meioTexto);
        // Se o arg falhou, tenta de novo com a frase do usuário.
        if (!resolvido.ok && msgUser) {
          const doMsg = textoMeioDeDetect(detectarMeio(msgUser));
          if (doMsg && doMsg !== meioTexto) {
            resolvido = await resolverMeioPorNomePj(empresa.id, ctx.userId, doMsg);
          }
        }
        if (!resolvido.ok) {
          return JSON.stringify({
            error: resolvido.mensagem,
            precisa_meio: true,
            precisa: resolvido.precisa,
            sugestoes: resolvido.sugestoes,
            contas: resolvido.contas,
            cartoes: resolvido.cartoes,
            mensagem: resolvido.mensagem,
            nome_sugerido: (resolvido as any).nome_sugerido,
            faltando: (resolvido as any).faltando,
            instrucao_agente: (resolvido as any).instrucao_agente,
          });
        }

        const contas = await storage.getEmpresasContasByEmpresaId(empresa.id);
        const tipo = args.tipo === "Receita" ? "Receita" : "Despesa";
        const { conta, usouOutras, motivo, ignorouInformada } = resolverContaPj({
          contas,
          tipo,
          contaInformada: args.conta,
          descricao: `${args.descricao || ""} ${ctx.userMessage || ""}`,
          segmento: ctx.empresaAtiva?.segmento || (empresa as any).segmento,
        });
        if (ignorouInformada) {
          console.log(`[Classificação PJ] palpite '${args.conta}' descartado (motivo=${motivo}) para "${args.descricao}" → ${conta?.codigo}`);
        }
        if (!conta) {
          return JSON.stringify({ error: `A empresa não tem uma conta do tipo ${tipo} no plano de contas. Peça ao usuário para escolher uma conta.` });
        }

        const today = new Date().toISOString().slice(0, 10);
        const dataISO = (args.data_transacao || today).slice(0, 10);
        let meio;
        try {
          meio = await aplicarMeioPagamentoPj({
            userId: ctx.userId,
            empresaId: empresa.id,
            tipo,
            dataISO,
            cartao_id: resolvido.cartao_id ?? null,
            conta_bancaria_id: resolvido.conta_bancaria_id ?? null,
            exigirMeio: true,
            statusAtual: "Efetivada",
          });
        } catch (meioErr: any) {
          return JSON.stringify({ error: meioErr?.message || "Meio de pagamento inválido.", precisa_meio: true });
        }

        const criada = await storage.createEmpresaTransacao({
          empresa_id: empresa.id,
          categoria_id: conta.id,
          descricao: args.descricao || "Lançamento",
          valor: Number(args.valor) || 0,
          tipo,
          data_transacao: dataISO,
          status: "Efetivada",
          origem: "whatsapp",
          cartao_id: meio.cartao_id,
          conta_bancaria_id: meio.conta_bancaria_id,
          fatura_id: meio.fatura_id,
          competencia: meio.competencia,
          movimenta_caixa: meio.movimenta_caixa,
          empresa_forma_pagamento_id: null,
          metodo_pagamento: meio.metodo_pagamento || resolvido.rotulo,
        } as any);
        const orcamento = tipo === "Despesa"
          ? await getStatusOrcamentoContaPJ(empresa.id, conta.id)
          : null;
        const empresaNome = empresa.nome_fantasia || empresa.razao_social;
        let pendente_criar_conta: any = null;
        if (usouOutras) {
          const nomeSugerido = sugerirNomeConta(
            String(args.descricao || ""),
            ctx.userMessage,
            args.conta,
          );
          const classificacao = tipo === "Receita" ? "OUTRA" : "VARIAVEL";
          await registrarOfertaCriarConta({
            userId: ctx.userId,
            empresaId: empresa.id,
            empresaNome: String(empresaNome),
            idTransacao: criada.id,
            nomeConta: nomeSugerido,
            tipo,
            classificacao,
          });
          pendente_criar_conta = {
            acao: "criar_conta_e_mover",
            id_transacao: criada.id,
            nome_sugerido: nomeSugerido,
            tipo,
            classificacao_sugerida: classificacao,
            ferramenta: "criar_conta_e_mover_empresa",
          };
        }
        return JSON.stringify({
          success: true, id: criada.id, empresa: empresaNome,
          descricao: args.descricao || "Lançamento",
          conta: `${conta.codigo} — ${conta.nome}`, valor: args.valor, tipo, data: dataISO,
          pago_com: resolvido.rotulo,
          meio: meio.isCartao ? "cartao" : "conta_bancaria",
          aviso_meio: resolvido.aviso || undefined,
          usou_outras: usouOutras,
          pendente_criar_conta,
          dica: usouOutras
            ? `Lancei em Outras. OFEREÇA criar a conta *${pendente_criar_conta.nome_sugerido}* e mover o lançamento. Quando o usuário confirmar (sim/pode/ok/claro/fechou/cria...), chame 'criar_conta_e_mover_empresa' com id_transacao=${criada.id} e nome=${pendente_criar_conta.nome_sugerido} — NÃO peça confirmação de novo. Se recusar (não/deixa/cancela), não crie.`
            : (resolvido.aviso
              ? resolvido.aviso
              : "Se a conta não for essa, dá para mudar depois em Transações PJ no app."),
          orcamento,
        });
      }

      case "parcelar_compra_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);

        const { listarCartoes, cartaoDoUsuario, competenciaDaCompra } = await import("./fatura-pj.service");
        const {
          resolverValoresParcelamento,
          parseParcelamentoDoTexto,
        } = await import("./parse-parcelamento");
        const { resolverMeioPorNomePj } = await import("./meio-pagamento-pj");

        const msg = `${ctx.userMessage || ""} ${args.descricao || ""}`;
        const doTexto = parseParcelamentoDoTexto(msg);
        const valores = resolverValoresParcelamento({ args, userMessage: msg });
        if (valores.incompleto) {
          return JSON.stringify({
            error: valores.incompleto,
            precisa_valor: true,
            mensagem: valores.incompleto,
            exemplos: ["3x de 100 no Cartão Exemplo", "compra parcelada de 300 em 3x"],
          });
        }

        const cartoes = await listarCartoes(empresa.id);
        const { detectarMeio, textoMeioDeDetect } = await import("./parse-meio");
        const detParc = detectarMeio(ctx.userMessage || "");
        let cartaoTexto = "";
        if (detParc.tipo === "cartao_generico") {
          cartaoTexto = ""; // força listar / único — ignora forma inventada
        } else {
          cartaoTexto = String(args.forma_pagamento || doTexto.cartaoHint || "").trim();
          if (!cartaoTexto) {
            const detMsg = textoMeioDeDetect(detParc);
            if (detMsg && detMsg !== "dinheiro" && detMsg !== "pix" && detMsg !== "boleto" && detMsg !== "ted" && detMsg !== "debito" && detMsg !== "doc" && detMsg !== "cartao") {
              cartaoTexto = detMsg;
            }
          }
        }
        let cartaoAuto = false;

        if (!cartaoTexto) {
          if (cartoes.length === 1) {
            cartaoTexto = cartoes[0].nome;
            cartaoAuto = true;
          } else if (cartoes.length === 0) {
            return JSON.stringify({
              precisa_meio: true,
              precisa: "cartao",
              error: "Nenhum cartão cadastrado na empresa.",
              mensagem:
                "Compra parcelada precisa de cartão. Qual o nome do cartão? (ex.: Itaú, Magalu). Posso cadastrar se ainda não existir.",
              sugestoes: [],
            });
          } else {
            return JSON.stringify({
              precisa_meio: true,
              precisa: "cartao",
              error: "Informe o cartão da compra parcelada.",
              sugestoes: cartoes.map((c: any) => c.nome),
              mensagem: `Em qual cartão foi a parcelada? Você tem: ${cartoes.map((c: any) => c.nome).join(", ")}.`,
            });
          }
        }

        const resolvido = await resolverMeioPorNomePj(
          empresa.id,
          ctx.userId,
          // Com flag avançada: força pista cartão. Sem flag: usa o texto cru.
          await (async () => {
            try {
              const { flagAtiva, FLAG_AGENTE_MEIO_PAGAMENTO } = await import("./feature-flags.service");
              const on = await flagAtiva(FLAG_AGENTE_MEIO_PAGAMENTO, ctx.userId);
              if (!on) return cartaoTexto;
            } catch { /* segue avançado */ }
            return /cartao|credito|\bcc\b/i.test(cartaoTexto) ? cartaoTexto : `cartão ${cartaoTexto}`;
          })(),
        );
        if (!resolvido.ok) {
          return JSON.stringify({
            error: resolvido.mensagem,
            precisa_meio: true,
            precisa: resolvido.precisa === "cadastrar_cartao" ? "cadastrar_cartao" : "cartao",
            sugestoes: resolvido.sugestoes?.length ? resolvido.sugestoes : cartoes.map((c: any) => c.nome),
            cartoes: cartoes.map((c: any) => c.nome),
            mensagem: resolvido.mensagem,
            nome_sugerido: (resolvido as any).nome_sugerido || cartaoTexto,
            faltando: (resolvido as any).faltando,
            instrucao_agente:
              (resolvido as any).instrucao_agente ||
              "Se precisa=cartao e a lista já tem o nome, use esse cartão — NÃO peça fechamento. Só cadastrar_cartao_empresa se precisa=cadastrar_cartao de verdade.",
          });
        }
        // Preferir cartão de mesmo nome se o texto casou só com conta.
        let cartaoId = resolvido.cartao_id ?? null;
        if (!cartaoId && resolvido.conta_bancaria_id) {
          const { casaNomeMeio } = await import("./meio-pagamento-pj");
          const mesmoNome = cartoes.find(
            (c: any) =>
              casaNomeMeio(resolvido.rotulo || cartaoTexto, c.nome) ||
              casaNomeMeio(cartaoTexto, c.nome),
          );
          if (mesmoNome) {
            cartaoId = mesmoNome.id;
            cartaoAuto = true;
          } else {
            return JSON.stringify({
              error: "Parcelamento exige cartão de crédito (não conta bancária).",
              precisa_meio: true,
              precisa: "cadastrar_cartao",
              sugestoes: cartoes.map((c: any) => c.nome),
              cartoes: cartoes.map((c: any) => c.nome),
              nome_sugerido: cartaoTexto,
              faltando: ["dia_fechamento", "dia_vencimento"],
              mensagem: cartoes.length
                ? `*${cartaoTexto}* é conta bancária. Para parcelar: use um cartão da lista (${cartoes.map((c: any) => c.nome).join(", ")}) OU diga fechamento e vencimento para cadastrar o *cartão* ${cartaoTexto}.`
                : `*${cartaoTexto}* parece conta/banco. Parcelado precisa de cartão — diga fechamento e vencimento para cadastrar o cartão ${cartaoTexto}.`,
              instrucao_agente:
                "Não trate conta como cartão. Se o usuário escolher um cartão da lista, parcelar com esse nome. Se quiser o cartão da mesma marca da conta, peça fechamento+vencimento e cadastrar_cartao_empresa — só depois parcelar COM valor/parcelas do histórico (nunca valor_parcela 0).",
            });
          }
        }
        if (!cartaoId) {
          return JSON.stringify({
            error: "Parcelamento exige cartão de crédito.",
            precisa_meio: true,
            precisa: "cadastrar_cartao",
            sugestoes: cartoes.map((c: any) => c.nome),
            cartoes: cartoes.map((c: any) => c.nome),
            nome_sugerido: cartaoTexto,
            faltando: ["dia_fechamento", "dia_vencimento"],
            mensagem: cartoes.length
              ? `Não achei o cartão "${cartaoTexto}". Qual destes? ${cartoes.map((c: any) => c.nome).join(", ")} — ou diga fechamento e vencimento para cadastrar.`
              : `Não há cartão "${cartaoTexto}". Diga o dia de fechamento e o dia de vencimento numa resposta só para eu cadastrar e registrar a compra.`,
            instrucao_agente:
              "Peça fechamento+vencimento numa pergunta só. cadastrar_cartao_empresa e em seguida parcelar_compra_empresa. Se o usuário já confirmou (sim/isso), não peça confirmação de novo.",
          });
        }

        const contas = await storage.getEmpresasContasByEmpresaId(empresa.id);
        const { conta, usouOutras } = resolverContaPj({
          contas,
          tipo: "Despesa",
          contaInformada: args.conta,
          descricao: `${args.descricao || ""} ${ctx.userMessage || ""}`,
          segmento: ctx.empresaAtiva?.segmento || (empresa as any).segmento,
        });
        if (!conta) {
          return JSON.stringify({ error: "A empresa não tem conta de Despesa no plano. Cadastre no app." });
        }

        // 1ª parcela: HOJE → fatura vigente (respeita dia de fechamento do cartão).
        const today = new Date().toISOString().slice(0, 10);
        const dataInicio = /^\d{4}-\d{2}-\d{2}/.test(args.data_inicio || "")
          ? String(args.data_inicio).slice(0, 10)
          : today;

        const cartao = await cartaoDoUsuario(cartaoId, ctx.userId);
        const cartaoRotulo = cartao?.nome || resolvido.rotulo || cartaoTexto;
        let competencia1a: string | null = null;
        if (cartao) {
          competencia1a = competenciaDaCompra(
            dataInicio,
            Number(cartao.dia_fechamento),
            Number(cartao.dia_vencimento),
          ).competencia;
        }

        const { criarCompraParceladaPj } = await import("../storage");
        let r;
        try {
          r = await criarCompraParceladaPj({
            empresaId: empresa.id,
            userId: ctx.userId,
            categoriaId: conta.id,
            descricao: args.descricao || "Compra parcelada",
            valorTotal: valores.valorTotal,
            parcelas: valores.parcelas,
            dataInicio,
            cartaoId,
            origem: "whatsapp",
          });
        } catch (e: any) {
          return JSON.stringify({ error: e?.message || "Erro ao parcelar no cartão." });
        }

        const orcamento = await getStatusOrcamentoContaPJ(empresa.id, conta.id);
        const empresaNome = empresa.nome_fantasia || empresa.razao_social;
        return JSON.stringify({
          success: true,
          empresa: empresaNome,
          descricao: args.descricao || "Compra parcelada",
          compra_grupo: r.compra_grupo,
          parcelas: r.parcelas,
          valor_parcela: r.valor_parcela,
          total: Math.round(valores.valorTotal * 100) / 100,
          cartao: cartaoRotulo,
          cartao_escolhido_automaticamente: cartaoAuto,
          conta: `${conta.codigo} — ${conta.nome}`,
          competencia_primeira: competencia1a,
          ids: r.ids,
          usou_outras: usouOutras,
          dica:
            `Lancei ${r.parcelas}× de R$ ${Number(r.valor_parcela).toFixed(2)}` +
            ` (total R$ ${valores.valorTotal.toFixed(2)}) no cartão *${cartaoRotulo}*` +
            (competencia1a ? `. 1ª parcela na fatura *${competencia1a}* (vigente)` : "") +
            `; demais nos meses seguintes.` +
            (cartaoAuto ? ` (usei o cartão ${cartaoRotulo})` : ""),
          orcamento,
        });
      }

      case "resumo_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const periodo = periodoDeArgs(args);
        const resumo = await storage.getEmpresaResumo(empresa.id, periodo);
        // Nomes explícitos: o modelo lia 'entradas'/'total_saidas' e não
        // relacionava com "total de receita" que o usuário pediu.
        return JSON.stringify({
          empresa: empresa.nome_fantasia || empresa.razao_social,
          periodo: resumo.periodo,
          receita_total: resumo.entradas,
          despesa_total: resumo.total_saidas,
          saldo: resumo.lucro_prejuizo,
          despesas_fixas: resumo.saidas_fixas,
          despesas_variaveis: resumo.saidas_variaveis,
          despesas_outras: resumo.saidas_outras,
          margem_contribuicao: resumo.margem_contribuicao,
          qtd_lancamentos: resumo.total_transacoes,
        });
      }

      case "dre_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const dre = await storage.getEmpresaDRE(empresa.id, periodoDeArgs(args));
        return JSON.stringify({ empresa: empresa.nome_fantasia || empresa.razao_social, ...dre });
      }

      case "comparar_periodos_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const anoCorrente = new Date().getFullYear();
        const pA = periodoDeArgs({ mes: args.mes_a, ano: args.ano_a ?? anoCorrente });
        const pB = periodoDeArgs({ mes: args.mes_b, ano: args.ano_b ?? anoCorrente });
        const [a, b] = await Promise.all([
          storage.getEmpresaResumo(empresa.id, pA),
          storage.getEmpresaResumo(empresa.id, pB),
        ]);
        const variacao = (novo: number, velho: number) =>
          velho === 0 ? null : Math.round(((novo - velho) / Math.abs(velho)) * 1000) / 10;
        return JSON.stringify({
          empresa: empresa.nome_fantasia || empresa.razao_social,
          periodo_a: { ...pA, receita_total: a.entradas, despesa_total: a.total_saidas, saldo: a.lucro_prejuizo },
          periodo_b: { ...pB, receita_total: b.entradas, despesa_total: b.total_saidas, saldo: b.lucro_prejuizo },
          variacao_pct: {
            receita: variacao(b.entradas, a.entradas),
            despesa: variacao(b.total_saidas, a.total_saidas),
            saldo: variacao(b.lucro_prejuizo, a.lucro_prejuizo),
          },
        });
      }

      case "gastos_por_conta_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const periodo = periodoDeArgs(args);
        const txs = await storage.getEmpresaTransacoesByEmpresaId(empresa.id, periodo);

        const porConta = new Map<string, { conta: string; tipo: string; total: number; qtd: number }>();
        for (const t of txs) {
          if (args.tipo && t.tipo !== args.tipo) continue;
          const chave = `${(t as any).categoria_codigo} — ${(t as any).categoria_nome}`;
          const atual = porConta.get(chave) || { conta: chave, tipo: t.tipo, total: 0, qtd: 0 };
          atual.total += Number(t.valor) || 0;
          atual.qtd += 1;
          porConta.set(chave, atual);
        }

        const contas = [...porConta.values()]
          .map((c) => ({ ...c, total: Math.round(c.total * 100) / 100 }))
          .sort((a, b) => b.total - a.total);
        return JSON.stringify({
          empresa: empresa.nome_fantasia || empresa.razao_social,
          periodo,
          contas,
        });
      }

      case "fluxo_caixa_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const ano = Number(args.ano) || new Date().getFullYear();
        const fluxo = await storage.getEmpresaFluxoCaixaMensal(empresa.id, ano);

        const tipoDaConta = new Map(fluxo.contas.map((c) => [c.id, c.tipo]));
        const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, receita: 0, despesa: 0, saldo: 0 }));
        for (const linha of fluxo.agregado) {
          const alvo = meses[linha.mes - 1];
          if (!alvo) continue;
          // 'agregado' vem com sinal (Receita +, Despesa −); o usuário quer valores absolutos.
          if (tipoDaConta.get(linha.conta_id) === "Receita") alvo.receita += Math.abs(linha.total);
          else alvo.despesa += Math.abs(linha.total);
        }
        for (const m of meses) {
          m.receita = Math.round(m.receita * 100) / 100;
          m.despesa = Math.round(m.despesa * 100) / 100;
          m.saldo = Math.round((m.receita - m.despesa) * 100) / 100;
        }

        return JSON.stringify({
          empresa: empresa.nome_fantasia || empresa.razao_social,
          ano,
          meses: meses.filter((m) => m.receita !== 0 || m.despesa !== 0),
        });
      }

      case "buscar_transacao_empresa_por_filtro": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const achados = await buscarEmpresaTransacoesPorFiltro(empresa.id, {
          descricao: args.descricao,
          valor: args.valor,
          data_inicio: args.data_inicio,
          data_fim: args.data_fim,
          tipo: args.tipo,
        });
        return JSON.stringify(respostaBusca(achados));
      }

      case "busca_transacao_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        // Isolamento: o lançamento tem que ser DESSA empresa.
        const daEmpresa = await empresaTransacaoPertenceAEmpresa(args.id_transacao, empresa.id);
        if (!daEmpresa) {
          return JSON.stringify({ error: `Não achei o lançamento de código ${args.id_transacao} nesta empresa. Confira o código com o usuário.` });
        }
        const tx = await storage.getEmpresaTransacaoById(args.id_transacao);
        return JSON.stringify({
          encontrou: true,
          transacao: tx,
          instrucao: "Mostre este lançamento e PEÇA CONFIRMAÇÃO antes de editar.",
        });
      }

      case "atualiza_transacao_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);

        const dados: any = {};
        if (args.descricao) dados.descricao = args.descricao;
        if (args.valor !== undefined && args.valor !== null) dados.valor = args.valor;
        if (args.tipo) dados.tipo = args.tipo;
        if (args.data_transacao) dados.data_transacao = args.data_transacao;
        if (args.conta) {
          const contas = await storage.getEmpresasContasByEmpresaId(empresa.id);
          const alvo = String(args.conta).toLowerCase().trim();
          const conta = contas.find((c) => c.codigo.toLowerCase() === alvo)
            || contas.find((c) => c.nome.toLowerCase().includes(alvo));
          if (!conta) {
            return JSON.stringify({ error: `Não achei a conta '${args.conta}' no plano desta empresa. Peça ao usuário para escolher outra.` });
          }
          dados.categoria_id = conta.id;
        }
        if (Object.keys(dados).length === 0) {
          return JSON.stringify({ error: "Nada para alterar: informe o que muda (valor, descrição, data, tipo ou conta)." });
        }

        // Mesmas validações da tela (serviço compartilhado com o controller).
        const r = await atualizarTransacaoEmpresa(empresa.id, args.id_transacao, ctx.userId, dados);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        return JSON.stringify({
          success: true,
          alterado: dados,
          antes: { descricao: r.anterior.descricao, valor: r.anterior.valor, data: r.anterior.data_transacao, tipo: r.anterior.tipo },
          transacao: r.transacao,
        });
      }

      case "mover_lancamentos_empresa": {
        const empresaMv = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresaMv) return JSON.stringify(empresaMv);
        const { moverLancamentosPj } = await import("./mover-meio.service");
        const r = await moverLancamentosPj(empresaMv.id, ctx.userId, args.ids, String(args.destino || ""));
        if (!r.ok) return JSON.stringify({ success: false, ...r });
        return JSON.stringify({
          success: true,
          movidos: r.afetados,
          destino: r.destino,
          tipo_destino: r.tipo_destino,
          faturas: r.faturas,
          ids: r.ids,
          mensagem: r.tipo_destino === "cartao"
            ? `Movi ${r.afetados} lançamento(s) para o cartão ${r.destino} (faturas ${r.faturas.join(", ")}).`
            : `Movi ${r.afetados} lançamento(s) para a conta ${r.destino}.`,
        });
      }

      case "pagar_transacao_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const r = await baixarTransacaoEmpresa(empresa.id, args.id_transacao, ctx.userId, args.data_pagamento);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        return JSON.stringify({
          success: true,
          mensagem: "Conta baixada (marcada como paga).",
          data_pagamento: (r.transacao as any)?.data_pagamento,
          transacao: r.transacao,
        });
      }

      case "criar_conta_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const tipo = args.tipo === "Receita" ? "Receita" : "Despesa";
        // Código sai da sequência do grupo — nunca vem do usuário.
        const conta = await storage.createEmpresaConta({
          empresa_id: empresa.id,
          nome: args.nome,
          tipo,
          classificacao: tipo === "Receita" ? "OUTRA" : (args.classificacao || "VARIAVEL"),
          grupo_gerencial: args.grupo_gerencial || null,
        } as any);
        return JSON.stringify({
          success: true,
          conta: `${conta.codigo} — ${conta.nome}`,
          codigo: conta.codigo,
          tipo: conta.tipo,
          classificacao: conta.classificacao,
        });
      }

      case "criar_conta_e_mover_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);

        if (args.resposta_usuario) {
          const { interpretarConfirmacao } = await import("./confirmacao-usuario");
          const v = interpretarConfirmacao(String(args.resposta_usuario));
          if (v === "nao") {
            await limparOfertaCriarConta(ctx.userId);
            return JSON.stringify({
              success: false,
              cancelado: true,
              mensagem: "Usuário recusou. Não crie a conta; mantenha o lançamento onde está.",
            });
          }
          if (v === "ambiguo") {
            return JSON.stringify({
              success: false,
              precisa_clarificar: true,
              mensagem: `Não deu para entender se é sim ou não. Pergunte só: "Pode criar a conta *${args.nome}* e mover o lançamento 🔍 ${args.id_transacao}? Responda *sim* ou *não*."`,
            });
          }
        }

        const r = await criarContaEMoverLancamento({
          userId: ctx.userId,
          empresaId: empresa.id,
          idTransacao: Number(args.id_transacao),
          nomeConta: String(args.nome || ""),
          tipo: args.tipo === "Receita" ? "Receita" : "Despesa",
          classificacao: args.classificacao || null,
        });
        await limparOfertaCriarConta(ctx.userId);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error });
        return JSON.stringify({
          success: true,
          conta_criada: r.contaCriada,
          conta: `${r.conta.codigo} — ${r.conta.nome}`,
          codigo: r.conta.codigo,
          id_transacao: args.id_transacao,
          mensagem: r.contaCriada
            ? `Conta criada e lançamento ${args.id_transacao} movido.`
            : `Conta já existia; lançamento ${args.id_transacao} movido.`,
        });
      }

      case "cadastrar_cartao_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const cartao = await criarCartaoPj(empresa.id, {
          nome: args.nome,
          bandeira: args.bandeira ?? null,
          limite: args.limite ?? null,
          dia_fechamento: args.dia_fechamento,
          dia_vencimento: args.dia_vencimento,
        });
        const verbo = cartao.atualizado ? "atualizado" : "cadastrado";
        return JSON.stringify({
          success: true,
          cartao: cartao.nome,
          id: cartao.id,
          atualizado: !!cartao.atualizado,
          dia_fechamento: cartao.dia_fechamento,
          dia_vencimento: cartao.dia_vencimento,
          limite: cartao.limite,
          mensagem: `Cartão *${cartao.nome}* ${verbo}.`,
          dica:
            "Cartão pronto. Em seguida: se a compra pendente tiver valor E parcelas no histórico da conversa, chame lancar_empresa ou parcelar_compra_empresa COM esses valores. " +
            "Se faltar valor ou parcelas, PERGUNTE — NUNCA chame parcelar com valor_parcela 0 / sem valor. " +
            "Cadastro de cartão sozinho NÃO registra a compra.",
        });
      }

      case "criar_conta_bancaria_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const nome = String(args.nome || "").trim();
        if (!nome) {
          return JSON.stringify({ error: "Informe o nome da conta (ex.: Conta corrente Itaú)." });
        }
        const banco = String(args.banco || nome).trim();
        const tipoRaw = String(args.tipo || "corrente").toLowerCase();
        const tipo =
          tipoRaw === "poupanca" || tipoRaw === "poupança"
            ? "poupanca"
            : tipoRaw === "caixa"
              ? "caixa"
              : "corrente";
        const { createContaBancaria } = await import("../storage");
        const criada = await createContaBancaria({
          empresa_id: empresa.id,
          usuario_id: ctx.userId,
          banco,
          nome,
          tipo,
          saldo_inicial: Number(args.saldo_inicial) || 0,
        });
        return JSON.stringify({
          success: true,
          id: criada.id,
          nome: criada.nome || criada.banco,
          banco: criada.banco,
          tipo: criada.tipo,
          mensagem: `Conta bancária *${criada.nome || criada.banco}* cadastrada. Já pode lançar Pix/TED/boleto nela.`,
          dica: "Se havia um lançamento pendente de meio, chame lancar_empresa de novo com forma_pagamento = nome desta conta.",
        });
      }

      case "listar_cartoes_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const cartoes = await listarCartoesPj(empresa.id);
        const { getContasBancariasByEmpresa } = await import("../storage");
        const contasRaw = await getContasBancariasByEmpresa(empresa.id);
        const contas = (contasRaw as any[])
          .filter((c) => c.ativo !== false)
          .map((c) => ({ id: c.id, nome: c.nome || c.banco, tipo: c.tipo }));
        return JSON.stringify({
          cartoes: cartoes.map((c) => ({
            id: c.id, nome: c.nome, limite: c.limite,
            dia_fechamento: c.dia_fechamento, dia_vencimento: c.dia_vencimento, ativo: c.ativo,
          })),
          contas,
          mensagem: cartoes.length === 0
            ? "A empresa ainda não tem cartão cadastrado. Contas bancárias estão em 'contas'."
            : undefined,
        });
      }

      case "fatura_cartao_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const cartoes = await listarCartoesPj(empresa.id);
        const alvo = String(args.cartao || "").toLowerCase().trim();
        const achados = cartoes.filter((c) => String(c.nome).toLowerCase().includes(alvo));
        if (achados.length === 0) {
          return JSON.stringify({ erro: true, error: `Não achei o cartão '${args.cartao}'.`, cartoes: cartoes.map((c) => c.nome) });
        }
        if (achados.length > 1) {
          return JSON.stringify({ erro: true, error: "Mais de um cartão corresponde; peça ao usuário para especificar.", cartoes: achados.map((c) => c.nome) });
        }
        const faturas = await listarFaturasPj(achados[0].id);
        return JSON.stringify({ cartao: achados[0].nome, faturas: faturas.slice(0, 6) });
      }

      case "saldo_cartao_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        const cartoes = await listarCartoesPj(empresa.id);
        const alvo = String(args.cartao || "").toLowerCase().trim();
        const achados = cartoes.filter((c) => String(c.nome).toLowerCase().includes(alvo));
        if (achados.length === 0) {
          return JSON.stringify({ erro: true, error: `Não achei o cartão '${args.cartao}'.`, cartoes: cartoes.map((c) => c.nome) });
        }
        if (achados.length > 1) {
          return JSON.stringify({ erro: true, error: "Mais de um cartão corresponde; peça ao usuário para especificar.", cartoes: achados.map((c) => c.nome) });
        }
        const saldo = await getSaldoCartaoEmpresa(achados[0].id);
        return JSON.stringify(saldo);
      }

      case "listar_formas_empresa": {
        // Legado: redireciona para cartões + contas (meio real).
        return executeTool("listar_cartoes_empresa", args, ctx);
      }

      case "cadastrar_forma_empresa": {
        const empresa = await resolverEmpresa(ctx.userId, args.empresa, ctx);
        if ("erro" in empresa) return JSON.stringify(empresa);
        return JSON.stringify({
          success: false,
          obsoleto: true,
          error:
            "Forma solta (PIX/boleto) não é meio. Para dinheiro use Caixinha; para Pix cadastre conta com criar_conta_bancaria_empresa; para cartão use cadastrar_cartao_empresa.",
          precisa: "cadastrar_conta",
          ferramenta: "criar_conta_bancaria_empresa",
          precisa_meio: true,
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

// Converte os argumentos de período das tools PJ em { de, ate }.
// Aceita mes/ano (o jeito que o usuário fala: "em março") ou de/ate soltos.
// Sem nada, devolve {} e o storage assume o mês corrente.
function periodoDeArgs(args: any): { de?: string; ate?: string } {
  if (args?.de || args?.ate) return { de: args.de, ate: args.ate };
  const mes = Number(args?.mes);
  if (!mes || mes < 1 || mes > 12) return {};
  const ano = Number(args?.ano) || new Date().getFullYear();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { de: iso(new Date(ano, mes - 1, 1)), ate: iso(new Date(ano, mes, 0)) };
}

// Formata o resultado de uma busca por filtro no padrão de desambiguação que o
// prompt manda seguir (mesmo espírito do resolverEmpresa).
function respostaBusca(achados: CandidatoTransacao[]) {
  if (achados.length === 0) {
    return {
      encontrou: false,
      motivo: "nenhum",
      instrucao: "Não achei nenhum lançamento com esses dados. PEÇA ao usuário o código da transação — ele foi enviado na confirmação de quando o lançamento foi registrado.",
    };
  }
  if (achados.length === 1) {
    return {
      encontrou: true,
      transacao: achados[0],
      instrucao: "Mostre este lançamento ao usuário e PEÇA CONFIRMAÇÃO antes de editar.",
    };
  }
  return {
    encontrou: false,
    motivo: "ambiguo",
    candidatos: achados,
    instrucao: "Achei mais de um lançamento parecido. LISTE os candidatos mostrando o código de cada um e peça ao usuário para escolher pelo código.",
  };
}

// Resolve a empresa do usuário. Em modo PJ usa SEMPRE ctx.empresaAtiva
// (o modelo não escolhe empresa — um login = uma empresa).
async function resolverEmpresa(
  userId: number,
  _nome: string,
  ctx?: ToolContext,
): Promise<any> {
  if (ctx?.empresaAtiva?.id) {
    const full = await storage.getEmpresaById(ctx.empresaAtiva.id);
    if (full && full.usuario_id === userId) return full;
  }
  const empresas = await storage.getEmpresasByUsuarioId(userId);
  if (empresas.length === 0) return { erro: true, error: "Nenhuma empresa cadastrada." };
  if (empresas.length === 1) return empresas[0];
  return {
    erro: true,
    error: "Mais de uma empresa neste login — contate o suporte.",
    empresas: empresas.map((e) => e.nome_fantasia || e.razao_social),
  };
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

  // Disponibiliza o texto atual para os handlers (ex.: casar meta pelo contexto).
  ctx.userMessage = userMessage;

  // Oferta "criar conta e mover" (PJ): respostas curtas sim/não executam sem depender do LLM.
  if (emModoPj(ctx)) {
    const resolved = await tentarResolverOfertaCriarConta(ctx.userId, userMessage);
    if (resolved.handled) return resolved.reply;
  }

  // PJ: "desc + valor" sem meio → uma pergunta só (não deixa o modelo pedir cartão).
  if (emModoPj(ctx) && ctx.empresaAtiva) {
    const empNome = ctx.empresaAtiva.nome;
    const soMeio = respostaEhSoMeio(userMessage);
    const pend = obterPendenteMeio(ctx.userId);
    if (pend && soMeio) {
      const raw = await executeTool(
        "lancar_empresa",
        {
          empresa: pend.empresaNome || empNome,
          descricao: pend.descricao,
          valor: pend.valor,
          tipo: pend.tipo,
          forma_pagamento: soMeio,
        },
        ctx,
      );
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      if (parsed?.id) {
        limparPendenteMeio(ctx.userId);
        const { montarReciboDeEscrita } = await import("./recibo-agente");
        return montarReciboDeEscrita({ tool: "lancar_empresa", raw, parsed });
      }
      if (parsed?.mensagem || parsed?.error) {
        return String(parsed.mensagem || parsed.error);
      }
      return "Não consegui lançar com esse meio. Diga dinheiro, pix + banco, ou o nome do cartão.";
    }

    const semMeio = pareceLancamentoSemMeio(userMessage);
    if (semMeio) {
      registrarPendenteMeio(ctx.userId, empNome, semMeio);
      return mensagemPedirMeio(semMeio);
    }
  }

  let pjInstructions = "";
  if (ctx.tipoPessoa === "juridica" && (ctx as any).empresaAtiva) {
    const emp = (ctx as any).empresaAtiva as { id: number; nome: string; segmento?: string | null };
    let planoLinhas = "";
    // Contas e cartões entram no contexto igual ao plano de contas. Sem isso o
    // modelo precisa chamar uma tool só para saber os nomes — e quando não
    // chama, responde "Aqui estão as contas: [Lista de contas bancárias]".
    let meiosBloco = "";
    try {
      const { getContasBancariasByEmpresa } = await import("../storage");
      const { listarCartoes } = await import("./fatura-pj.service");
      const bancarias = ((await getContasBancariasByEmpresa(emp.id)) as any[])
        .filter((c) => c.ativo !== false);
      const cartoesEmp = await listarCartoes(emp.id);
      const ehCaixa = (c: any) =>
        c.tipo === "caixa" || /^caixinha$/i.test(String(c.nome || c.banco || ""));
      const nomesBanco = bancarias.filter((c) => !ehCaixa(c)).map((c) => c.nome || c.banco);
      const temCaixinha = bancarias.some(ehCaixa);
      meiosBloco =
        `- Contas bancárias: ${nomesBanco.length ? nomesBanco.join(", ") : "NENHUMA cadastrada"}\n` +
        `- Dinheiro/espécie: ${temCaixinha ? "Caixinha" : "Caixinha (será criada no primeiro uso)"}\n` +
        `- Cartões de crédito: ${cartoesEmp.length ? cartoesEmp.map((c: any) => c.nome).join(", ") : "nenhum cadastrado"}` +
        (nomesBanco.length
          ? ""
          : `\n- Como não há conta bancária, Pix/débito/TED/boleto não têm de onde sair: ofereça cadastrar com 'criar_conta_bancaria_empresa'.`);
    } catch { /* segue sem a lista de meios */ }
    try {
      const contasPj = await storage.getEmpresasContasByEmpresaId(emp.id);
      planoLinhas = contasPj.map((c: any) => `- ${c.codigo} — ${c.nome} (${c.tipo})`).join("\n");
      if (!emp.segmento) {
        const full = await storage.getEmpresaById(emp.id);
        if (full) emp.segmento = (full as any).segmento;
      }
    } catch { /* segue sem plano na mensagem */ }
    const seg = emp.segmento ? `Segmento da empresa: ${emp.segmento}.` : "";
    pjInstructions = `
## MODO EMPRESA (PJ) ATIVO
- Este usuário é PJ (Empresa: ${emp.nome}). ${seg}
- TODAS as transações financeiras (receitas e despesas) enviadas por ele DEVEM ser lançadas na empresa utilizando a ferramenta 'lancar_empresa' (informando empresa: "${emp.nome}"). NUNCA use 'insere_transacao' (pessoal) para este usuário, a menos que ele especifique explicitamente que é uma transação pessoal.
- Fale em frases curtas e simples.
- **Meio de pagamento (decida na tool; perguntar é exceção):**
  1. Disse dinheiro / espécie / caixinha / "via caixa" / "em dinheiro" → é **Caixinha**. Chame 'lancar_empresa' (pode omitir forma_pagamento — a tool lê a frase). Avise "Lancei na Caixinha". NÃO pergunte conta.
  2. Disse Pix / débito / TED / boleto → pergunte **qual conta bancária** (liste as contas). Se a tool devolver precisa=cadastrar_conta (não há conta bancária, só Caixinha ou nenhuma), ofereça cadastrar com 'criar_conta_bancaria_empresa' (confirme banco/nome antes). **Não** grave Pix na Caixinha.
  3. Não disse nada → pergunte as **três** opções numa frase só: conta bancária, Caixinha (dinheiro) ou cartão. NUNCA assuma cartão. NUNCA escreva "Nenhum cartão cadastrado" nem peça fechamento/vencimento se o usuário não falou em cartão.
  6. **Ao perguntar, escreva os nomes reais** da seção "Meios de pagamento desta empresa" abaixo. Eles já estão aqui: não chame tool só para listar e NUNCA escreva marcador do tipo "[Lista de contas bancárias]".
  4. Se a mesma pergunta já foi feita e a resposta veio parecida (ex.: "em dinheiro" de novo), **não repita** — use o que ele disse e chame a tool.
  5. Se a tool devolver precisa_meio / aviso_meio, use mensagem/sugestões/contas/cartoes.
     Se a mensagem disser que a marca existe como conta E cartão (ambiguidade), PERGUNTE conta ou cartão — nunca escolha sozinho.
- **NÃO CHUTE a conta.** Só preencha 'conta' quando o usuário NOMEAR a conta ("lança no aluguel", "isso é folha") ou quando a descrição disser exatamente o que é ("compra de mercadoria", "paguei o DAS"). Nos demais casos, OMITA 'conta': o sistema classifica lendo a descrição e o plano inteiro da empresa, e acerta mais do que um palpite.

### Cartão de crédito — à vista é o padrão
- Disse "no cartão" / "no crédito" / "cartão de crédito" **sem nome** → a tool pergunta qual (ou usa o único). **NUNCA invente** nome de cartão/banco nos args (ex.: não coloque forma_pagamento inventada).
- Disse o nome do cartão **sem** falar em parcelas (3x, em 5 vezes…) → **à vista (1x)** na fatura com 'lancar_empresa'. NÃO pergunte quantas parcelas. NÃO invente a descrição "Compra parcelada".
- Só dispare 'parcelar_compra_empresa' quando o usuário **disse** que é parcelado com quantidade (ou "parcelada" sem Nx — aí pergunte "em quantas vezes?").

### Compra PARCELADA (cartão) — só quando o usuário parcelou
Dispare 'parcelar_compra_empresa' (NUNCA 'parcelar_compra' do PF, NUNCA várias 'lancar_empresa') somente com sinal claro de parcelamento **na mensagem do usuário**:
- padrões: "3x100", "3x de 100", "5x de 35", "em 3x", "em 3 vezes", "300 em 3x"
- palavra "parcelada/parcelado" **com** quantidade, ou sozinha → pergunte quantas vezes (não grave 1x como parcelado)

**Como montar os args (eficiência — não invente):**
| Frase do usuário | parcelas | valor_parcela | valor_total |
|---|---|---|---|
| "3x100 no cartão" / "3x de 100" | 3 | 100 | (omitir) |
| "compra parcelada de 300 em 3x" | 3 | (omitir) | 300 |
| "5x de 35" | 5 | 35 | (omitir) |
| "parcelada em 10x de 50" | 10 | 50 | (omitir) |

**1ª parcela = fatura vigente:** omita data_inicio (o sistema usa HOJE → competência atual do cartão). As demais parcelas vão para os meses seguintes automaticamente.

**Cenários incompletos — PERGUNTE, não grave:**
1. Sem cartão + vários cartões → pergunte "Em qual cartão?" (listar_cartoes_empresa / sugestões da tool).
2. Sem cartão + **só 1** cartão → chame a tool sem forma_pagamento; o sistema usa esse cartão e avisa.
3. Tool devolve precisa=cadastrar_cartao (cartão citado ainda não existe) → peça **fechamento e vencimento numa pergunta só**. Ao receber, chame 'cadastrar_cartao_empresa'. **Só depois** chame 'lancar_empresa' ou 'parcelar_compra_empresa' se valor+parcelas estiverem claros no histórico — **NUNCA** parcelar com valor_parcela 0. Se faltar valor, pergunte. Se a tool devolver precisa=cartao com cartão já na lista (ex.: "Banco Inter"), USE esse nome — não peça cadastro de novo.
3b. "Inter" / "cartão Inter" com cartão *Banco Inter* já cadastrado → use o existente. Nunca peça fechamento/vencimento de cartão que já aparece em cartoes/sugestões.
4. Usuário respondeu sim/isso/pode depois que você ofereceu registrar → **chame a tool agora**; não peça "Confirmando?" de novo.
5. Compra no cartão **sem** o usuário falar em parcelas → 'lancar_empresa' à vista (1x). Nunca pergunte "quantas parcelas?" nem use parcelar com 1x.
6. Só "compra parcelada" / "parcelado" sem Nx → pergunte "Em quantas vezes?" (não invente 1x nem 3x).
7. Só "em 3x no Itaú" sem valor → pergunte o valor (parcela ou total).
8. "no crédito" / "no cartão" sem nome → trate como falta de cartão (passos 1–3).
9. Tool devolve precisa_meio / precisa_valor → use a mensagem/sugestões/instrucao_agente; NÃO invente Magalu/Itaú/valores.

**Depois de gravar:** confirme em 1 frase: N× de R$X no cartão Y, 1ª na fatura competência_primeira, total R$Z.

Exemplo completo: "compra parcelada de 3x100 no cartão Itaú" →
parcelar_compra_empresa(empresa: "${emp.nome}", forma_pagamento: "Itaú", parcelas: 3, valor_parcela: 100, descricao: "Compra parcelada").
- Cuidado com armadilhas comuns: gasto com veículo (abastecimento, oficina, pneu, pedágio, cartório, despachante) NÃO é compra de mercadoria/CMV e NÃO é imposto. Imposto é só imposto mesmo (DAS, IPVA, licenciamento, taxa).
- Se não tiver certeza, mesmo assim LANCE (exceto parcelamento incompleto — aí pergunte). O sistema escolhe a melhor conta; se não achar, usa Outras. Diga a conta usada. Se cair em Outras (campo usou_outras / pendente_criar_conta), avise e OFEREÇA criar a conta sugerida e mover o lançamento.

### Oferta criar conta (após cair em Outras) — OBRIGATÓRIO
Quando 'lancar_empresa' devolver pendente_criar_conta:
1. Confirme o lançamento normalmente e pergunte, ex.: "Quer que eu crie a conta *Alimentação* e mova para lá?"
2. Na PRÓXIMA mensagem do usuário, interprete a resposta:
   - AFIRMAÇÃO (vale como SIM): sim, s, ss, pode, pode criar, ok, okay, blz, beleza, claro, fechou, isso, uhum, aham, confirmo, manda, vai, cria, crie, quero, yes, positivo, com certeza.
   - RECUSA (vale como NÃO): não, nao, n, nn, deixa, cancela, esquece, agora não, melhor não, não quero, não precisa, nope, nops, negativo.
   - Se misturar ou ficar dúbio → pergunte só: "Pode criar? Responda *sim* ou *não*."
3. Se for afirmação → chame IMEDIATAMENTE 'criar_conta_e_mover_empresa' com id_transacao e nome_sugerido do pendente (classificacao VARIAVEL se despesa e não disserem o contrário). NÃO peça confirmação de novo. NÃO use só 'criar_conta_empresa' sem mover.
4. Se for recusa → diga que manteve em Outras e NÃO chame criação.
5. A ferramenta 'criar_conta_e_mover_empresa' cria a conta E move o lançamento de uma vez — use sempre que a oferta for aceita.

### Ferramentas desta empresa (use SEMPRE as versões _empresa)
Este usuário NÃO tem carteira pessoal ativa. Toda consulta, edição e cadastro é da EMPRESA:
- Quanto faturou / total de receita / total de despesa / saldo de um mês → 'resumo_empresa' (passe 'mes' e, se citarem outro ano, 'ano'). NUNCA responda "não encontrei" sem antes chamar essa ferramenta.
- DRE, margem, lucro → 'dre_empresa'. Comparar dois meses → 'comparar_periodos_empresa'.
- Onde a empresa mais gasta / gasto por conta → 'gastos_por_conta_empresa'. Evolução do ano → 'fluxo_caixa_empresa'.
- Editar/corrigir um lançamento → 'buscar_transacao_empresa_por_filtro' → 'atualiza_transacao_empresa' (siga o fluxo da seção 5, sempre confirmando antes).
- Excluir lançamento → 'deleta_transacao_empresa' (confirma antes; vai à lixeira ~30 dias). Desfazer → 'restaurar_transacao_empresa'.
- Criar conta no plano → 'criar_conta_empresa'. Para criar E mover lançamento que caiu em Outras → 'criar_conta_e_mover_empresa'. O CÓDIGO é gerado automaticamente: não peça nem invente.
- Cartão de crédito da empresa → 'cadastrar_cartao_empresa' (peça dia de fechamento e dia de vencimento numa pergunta só; nunca invente esses dias), 'listar_cartoes_empresa', 'fatura_cartao_empresa', 'saldo_cartao_empresa' (limite/usado/disponível).
- Compra no cartão à vista (sem o usuário dizer parcelado) → 'lancar_empresa' com o nome do cartão (1x na fatura).
- Compra parcelada (2+ vezes) → 'parcelar_compra_empresa' (NÃO use parcelar_compra do PF).
- Meio de pagamento = CONTA BANCÁRIA, Caixinha (dinheiro) ou CARTÃO. Dinheiro na frase → Caixinha sem perguntar. Pix/boleto → conta bancária (ou 'criar_conta_bancaria_empresa' se não houver). Cartão novo → 'cadastrar_cartao_empresa' (fechamento + vencimento; nunca invente).
- Conta bancária nova (Itaú, Bradesco…) → 'criar_conta_bancaria_empresa' (confirme antes). NÃO confundir com 'criar_conta_empresa' (plano de contas).
- Baixar / marcar como paga uma conta Pendente → 'pagar_transacao_empresa' (depois de confirmar o lançamento).
- NÃO ofereça gráfico nem lembrete no modo empresa (ainda não existem no PJ). Responda com os números e, se couber, indique a tela de Relatórios PJ no app.

### Meios de pagamento desta empresa (nomes reais — cite estes, nunca invente nem escreva "[lista]")
${meiosBloco || "(não foi possível listar os meios — use listar_cartoes_empresa antes de perguntar)"}

### Plano de contas desta empresa
${planoLinhas || "(não foi possível listar as contas)"}
`;
    const ofertaPend = await obterOfertaCriarConta(ctx.userId);
    if (ofertaPend) {
      pjInstructions += `
### OFERTA PENDENTE (aguardando resposta do usuário)
Você ofereceu criar a conta *${ofertaPend.nomeConta}* (${ofertaPend.tipo}) e mover o lançamento 🔍 ${ofertaPend.idTransacao} da empresa ${ofertaPend.empresaNome}.
Se a mensagem atual for afirmação → chame 'criar_conta_e_mover_empresa' AGORA (empresa: "${ofertaPend.empresaNome}", id_transacao: ${ofertaPend.idTransacao}, nome: "${ofertaPend.nomeConta}", tipo: "${ofertaPend.tipo}", classificacao: "${ofertaPend.classificacao}", resposta_usuario: texto do usuário). Não peça confirmação de novo.
Se for recusa → confirme que manteve em Outras e não crie.
Se for ambíguo → pergunte só sim ou não.
`;
    }
  }

  // Quando o conteúdo veio de imagem/áudio/documento, o texto é uma EXTRAÇÃO
  // automática (pode ter erro de OCR/transcrição). Regra: confirmar antes de gravar.
  let midiaInstructions = "";
  if (ctx.origemMidia) {
    midiaInstructions = `

## ⚠️ CONTEÚDO EXTRAÍDO DE MÍDIA (foto/áudio/documento) — CONFIRME ANTES DE GRAVAR
- Esta mensagem foi extraída automaticamente de uma mídia e PODE conter erros de leitura/transcrição.
- NÃO registre lançamento(s) agora. Primeiro RESUMA o que entendeu: descrição, categoria provável, data e VALOR (e o total, se houver vários itens).
- Termine perguntando: "Confirma o lançamento? Responda *SIM* para registrar, ou me diga o que corrigir."
- Só use as ferramentas de lançamento (insere_transacao / lancar_empresa) DEPOIS que o usuário confirmar (ex.: responder "sim", "pode lançar", "confirmo") numa próxima mensagem.
- Se o usuário já mandou a mídia junto com uma confirmação explícita no texto (ex.: "pode lançar essa nota"), aí sim pode registrar direto.
- A MESMA regra vale para CRIAR CONTA do plano ('criar_conta_empresa') e para EDITAR lançamento: transcrição de áudio erra nome de conta e valor com facilidade. Repita o que entendeu ("criar a conta *Manutenção de Veículos* como Despesa Variável — confirma?") e só execute depois do "sim".`;
  }

  const categoriasBloco = (ctx.tipoPessoa === "juridica" && ctx.empresaAtiva)
    ? ""
    : `

## Categorias Disponíveis
${ctx.categories.map(c => `- ${c.nome} (${c.tipo})`).join("\n")}`;

  const systemPrompt = FINANCIAL_AGENT_SYSTEM_PROMPT + buildDynamicContext() + pjInstructions + midiaInstructions + categoriasBloco;

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

  // Com empresa ativa, só as ferramentas PJ entram na lista (isolamento).
  const tools = buildTools(ctx);
  const maxIterations = 8; // safety net
  let ultimaToolExecutada: string | null = null;
  let ultimoResultadoTool: string | null = null;
  const escritasNestaRodada: import("./recibo-agente").EscritaRodada[] = [];
  const { extrairEscritaOk, finalizarRespostaAgente } = await import("./recibo-agente");

  const registrarEscrita = (fnName: string, result: string) => {
    const e = extrairEscritaOk(fnName, result);
    if (e) escritasNestaRodada.push(e);
  };

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
      // Se já gravou nesta rodada, devolve recibo em vez de falhar sem feedback.
      if (escritasNestaRodada.length > 0) {
        return finalizarRespostaAgente({ content: "", escritas: escritasNestaRodada, userMessage });
      }
      throw chatErr;
    }

    const choice = response.data.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // Se não há tool calls, resposta final — recibo só se houve gravação.
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return finalizarRespostaAgente({
        content: assistantMessage.content || "Pronto!",
        escritas: escritasNestaRodada,
        userMessage,
      });
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
        const metas = await getMetasByUsuarioId(ctx.userId);
        let metaId = id;
        if (titulo && !metaId) {
           const meta = metas.find(m => m.titulo.toLowerCase().includes(titulo.toLowerCase()));
           if (meta) metaId = meta.id;
        }
        // Isolamento: só exclui meta do próprio usuário (nunca id cru vindo do modelo).
        if (metaId != null && !metas.some(m => m.id === Number(metaId))) metaId = undefined;
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
        registrarEscrita(fnName, resStr);
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
        // Isolamento: só ajusta meta do próprio usuário (nunca id cru vindo do modelo).
        if (targetId != null && !metas.some(m => m.id === Number(targetId))) targetId = undefined;
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
        registrarEscrita(fnName, resStr);
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
        // Isolamento: só deposita em meta do próprio usuário (nunca id cru vindo do modelo).
        if (targetId != null && !metas.some(m => m.id === Number(targetId))) targetId = undefined;
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
        registrarEscrita(fnName, resStr);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: resStr });
        continue;
      }


      const result = await executeTool(fnName, fnArgs, ctx);
      ultimaToolExecutada = fnName;
      ultimoResultadoTool = result;
      registrarEscrita(fnName, result);
      if (ctx.toolTrace) {
        ctx.toolTrace.push({
          name: fnName,
          args: fnArgs && typeof fnArgs === "object" ? fnArgs : {},
          resultPreview: String(result || "").slice(0, 800),
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  if (escritasNestaRodada.length > 0) {
    return finalizarRespostaAgente({ content: "", escritas: escritasNestaRodada, userMessage });
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
