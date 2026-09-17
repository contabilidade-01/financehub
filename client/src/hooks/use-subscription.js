"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSubscription = useSubscription;
exports.useCancelSubscription = useCancelSubscription;
const react_query_1 = require("@tanstack/react-query");
function useSubscription() {
    return (0, react_query_1.useQuery)({
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
function useCancelSubscription() {
    const queryClient = (0, react_query_1.useQueryClient)();
    return (0, react_query_1.useMutation)({
        mutationFn: async (reason) => {
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
