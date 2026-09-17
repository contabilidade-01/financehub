"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTransactionShake = useTransactionShake;
const react_1 = require("react");
function useTransactionShake(duration = 300) {
    const [shakingTransactions, setShakingTransactions] = (0, react_1.useState)(new Set());
    const triggerTransactionShake = (0, react_1.useCallback)((transactionId) => {
        setShakingTransactions(prev => new Set(prev).add(transactionId));
        setTimeout(() => {
            setShakingTransactions(prev => {
                const newSet = new Set(prev);
                newSet.delete(transactionId);
                return newSet;
            });
        }, duration);
    }, [duration]);
    const clearTransactionShake = (0, react_1.useCallback)((transactionId) => {
        setShakingTransactions(prev => {
            const newSet = new Set(prev);
            newSet.delete(transactionId);
            return newSet;
        });
    }, []);
    return {
        shakingTransactions,
        triggerTransactionShake,
        clearTransactionShake
    };
}
