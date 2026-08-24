import { z } from "zod";

// Definição das ferramentas disponíveis para o agente
const tools = {
  // Ferramenta para depositar um valor em uma meta
  depositar_meta: {
    description: "Deposita um valor em uma meta existente",
    parameters: z.object({
      titulo: z.string().describe("Título da meta"),
      valor: z.number().describe("Valor a ser depositado"),
    }),
    func: async ({ titulo, valor }: { titulo: string; valor: number }) => {
      // Lógica para depositar um valor em uma meta
      return `Depósito de R$ ${valor} na meta '${titulo}' realizado com sucesso.`;
    },
  },

  // Ferramenta para ajustar o saldo de uma meta
  ajustar_saldo_meta: {
    description: "Ajusta o saldo de uma meta para um valor específico",
    parameters: z.object({
      titulo: z.string().describe("Título da meta"),
      valor: z.number().describe("Novo valor do saldo da meta"),
    }),
    func: async ({ titulo, valor }: { titulo: string; valor: number }) => {
      // Lógica para ajustar o saldo de uma meta
      return `Saldo da meta '${titulo}' ajustado para R$ ${valor} com sucesso.`;
    },
  },

  // Ferramenta para sacar um valor de uma meta
  sacar_meta: {
    description: "Saca um valor de uma meta existente",
    parameters: z.object({
      titulo: z.string().describe("Título da meta"),
      valor: z.number().describe("Valor a ser sacado"),
    }),
    func: async ({ titulo, valor }: { titulo: string; valor: number }) => {
      // Lógica para sacar um valor de uma meta
      return `Saque de R$ ${valor} da meta '${titulo}' realizado com sucesso.`;
    },
  },

  // Ferramenta para excluir uma meta
  excluir_meta: {
    description: "Exclui uma meta existente",
    parameters: z.object({
      titulo: z.string().describe("Título da meta a ser excluída"),
    }),
    func: async ({ titulo }: { titulo: string }) => {
      // Lógica para excluir uma meta
      return `Meta '${titulo}' excluída com sucesso.`;
    },
  },

  // Ferramenta para obter o progresso de uma meta
  get_progresso: {
    description: "Obtém o progresso de uma meta",
    parameters: z.object({
      titulo: z.string().describe("Título da meta"),
    }),
    func: async ({ titulo }: { titulo: string }) => {
      // Lógica para obter o progresso de uma meta
      return `Progresso da meta '${titulo}': R$ 500`; // Valor de exemplo
    },
  },

  // Ferramenta para atualizar uma meta existente
  atualizar_meta: {
    description: "Atualiza os atributos de uma meta existente (valor alvo, prazo, título)",
    parameters: z.object({
      id: z.number().optional().describe("ID da meta a atualizar (opcional se fornecer titulo)"),
      titulo: z.string().optional().describe("Título da meta (opcional se fornecer ID)"),
      valor_alvo: z.number().optional().describe("Novo valor alvo em R$"),
      prazo: z.string().optional().describe("Nova data de prazo YYYY-MM-DD"),
    }),
    func: async (params: {
      id?: number;
      titulo?: string;
      valor_alvo?: number;
      prazo?: string;
    }) => {
      // Lógica para atualizar uma meta
      return `Meta atualizada com sucesso`;
    },
  },
};

// Função para construir o contexto dinâmico
const buildDynamicContext = (userInput: string) => {
  // Lógica para construir o contexto dinâmico
  return `Contexto dinâmico construído para: ${userInput}`;
};

// Prompt do sistema para o agente financeiro
const FINANCIAL_AGENT_SYSTEM_PROMPT = `Você é um assistente financeiro. Ajude os usuários a gerenciar suas metas financeiras.`;

export { tools, buildDynamicContext, FINANCIAL_AGENT_SYSTEM_PROMPT };
