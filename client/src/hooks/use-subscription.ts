import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Hook para gerenciar assinatura do usuário
 */

interface Subscription {
  id: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: {
    id: number;
    name: string;
    priceMonthly: string;
    features: string;
  };
}

interface SubscriptionResponse {
  hasSubscription: boolean;
  subscription?: Subscription;
  message?: string;
}

export function useSubscription() {
  return useQuery<SubscriptionResponse>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const response = await fetch('/api/billing/subscription', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason: string) => {
      const response = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel subscription');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidar cache da assinatura
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    }
  });
}
