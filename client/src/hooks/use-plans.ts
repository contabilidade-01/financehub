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
  features: string;
  maxTransactions: number;
  maxWallets: number;
  maxCategories: number;
  active: boolean;
}

export function usePlans() {
  return useQuery<SubscriptionPlan[]>({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const response = await fetch('/api/subscription-plans');

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
