"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useInvoices = useInvoices;
exports.useCheckout = useCheckout;
exports.useUpdateCard = useUpdateCard;
exports.usePaymentHistory = usePaymentHistory;
const react_query_1 = require("@tanstack/react-query");
function useInvoices(limit = 50) {
    return (0, react_query_1.useQuery)({
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
function useCheckout() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (data) => {
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
function useUpdateCard() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (data) => {
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
function usePaymentHistory() {
    return (0, react_query_1.useQuery)({
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
