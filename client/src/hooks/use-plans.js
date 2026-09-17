"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePlans = usePlans;
exports.usePlan = usePlan;
const react_query_1 = require("@tanstack/react-query");
/**
 * Planos que valem para um tipo de pessoa: PF vê o preço de PF, PJ o de PJ.
 * O servidor aplica a MESMA regra ao gerar a cobrança — o tipo vai na query
 * porque a rota de planos é pública e não enxerga a sessão. Sem `tipoPessoa`,
 * lista todos (usado antes do login, quando ainda não se sabe o tipo).
 */
function usePlans(tipoPessoa) {
    const tipo = tipoPessoa || undefined;
    return (0, react_query_1.useQuery)({
        queryKey: ['subscription-plans', tipo !== null && tipo !== void 0 ? tipo : 'todos'],
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
function usePlan(id) {
    return (0, react_query_1.useQuery)({
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
