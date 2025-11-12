import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Hook para operações de billing (faturas, pagamentos, etc.)
 */

interface Invoice {
  id: number;
  amount: string;
  status: string;
  dueDate: string;
  confirmedDate?: string;
  invoiceUrl?: string;
  description?: string;
  createdAt: string;
}

interface InvoicesResponse {
  total: number;
  payments: Invoice[];
}

interface CheckoutData {
  planId: number;
  cpfCnpj: string;
  creditCard: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string;
    phone: string;
    mobilePhone?: string;
  };
}

interface UpdateCardData {
  creditCard: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    addressComplement?: string;
    phone: string;
    mobilePhone?: string;
  };
}

export function useInvoices(limit: number = 50) {
  return useQuery<InvoicesResponse>({
    queryKey: ['invoices', limit],
    queryFn: async () => {
      const response = await fetch(`/api/billing/invoices?limit=${limit}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 2, // 2 minutos
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CheckoutData) => {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process checkout');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidar caches relevantes
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    }
  });
}

export function useUpdateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateCardData) => {
      const response = await fetch('/api/billing/update-card', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update card');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    }
  });
}

export function usePaymentHistory() {
  return useQuery({
    queryKey: ['payment-history'],
    queryFn: async () => {
      const response = await fetch('/api/billing/payment-history', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch payment history');
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}
