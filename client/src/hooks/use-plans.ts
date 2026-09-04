import { useQuery } from '@tanstack/react-query';

/**
 * Hook para listar planos de assinatura
 */

interface SubscriptionPlan {
  id: number;
  planCode: string;
  name: string;
  description?: string;
  priceMonthly: string;
  tipoPessoa?: string | null;
  features: string;
  maxTransactions: number;
  maxWallets: number;
  maxCategories: number;
  active: boolean;
}

/**
 * Planos que valem para um tipo de pessoa: PF vê o preço de PF, PJ o de PJ.
 * O servidor aplica a MESMA regra ao gerar a cobrança — o tipo vai na query
 * porque a rota de planos é pública e não enxerga a sessão. Sem `tipoPessoa`,
 * lista todos (usado antes do login, quando ainda não se sabe o tipo).
 */
export function usePlans(tipoPessoa?: string | null) {
  const tipo = tipoPessoa || undefined;

  return useQuery<SubscriptionPlan[]>({
    queryKey: ['subscription-plans', tipo ?? 'todos'],
    queryFn: async () => {
      const url = tipo
        ? `/api/subscription-plans?tipo=${encodeURIComponent(tipo)}`
        : '/api/subscription-plans';
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 10, // 10 minutos
  });
}

export function usePlan(id: number) {
  return useQuery<SubscriptionPlan>({
    queryKey: ['subscription-plan', id],
    queryFn: async () => {
      const response = await fetch(`/api/subscription-plans/${id}`);

      if (!response.ok) {
        throw new Error('Failed to fetch plan');
      }

      return response.json();
    },
    enabled: !!id,
  });
}
