"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTransactionBadges = useTransactionBadges;
const react_1 = require("react");
function useTransactionBadges() {
    const [badges, setBadges] = (0, react_1.useState)([]);
    const addTransactionBadge = (0, react_1.useCallback)(() => {
        const newBadge = {
            id: `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'transaction',
            count: 1,
            timestamp: Date.now(),
        };
        setBadges(prev => [...prev, newBadge]);
    }, []);
    const dismissBadge = (0, react_1.useCallback)((id) => {
        setBadges(prev => prev.filter(badge => badge.id !== id));
    }, []);
    const clearAllBadges = (0, react_1.useCallback)(() => {
        setBadges([]);
    }, []);
    const totalCount = badges.reduce((sum, badge) => sum + badge.count, 0);
    // Auto-dismiss badges after 10 seconds
    (0, react_1.useEffect)(() => {
        const timers = [];
        badges.forEach(badge => {
            const timer = setTimeout(() => {
                dismissBadge(badge.id);
            }, 10000); // 10 seconds
            timers.push(timer);
        });
        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [badges, dismissBadge]);
    // Auto-clear badges when user interacts with transactions
    const markAsViewed = (0, react_1.useCallback)(() => {
        setBadges([]);
    }, []);
    return {
        badges,
        addTransactionBadge,
        dismissBadge,
        clearAllBadges,
        markAsViewed,
        totalCount,
    };
}
