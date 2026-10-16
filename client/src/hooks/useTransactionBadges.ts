import { useState, useCallback, useEffect } from 'react';

interface TransactionBadge {
  id: string;
  type: 'transaction';
  count: number;
  timestamp: number;
}

interface UseTransactionBadgesReturn {
  badges: TransactionBadge[];
  addTransactionBadge: () => void;
  dismissBadge: (id: string) => void;
  clearAllBadges: () => void;
  markAsViewed: () => void;
  totalCount: number;
}

export function useTransactionBadges(): UseTransactionBadgesReturn {
  const [badges, setBadges] = useState<TransactionBadge[]>([]);

  const addTransactionBadge = useCallback(() => {
    const newBadge: TransactionBadge = {
      id: `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'transaction',
      count: 1,
      timestamp: Date.now(),
    };

    setBadges(prev => [...prev, newBadge]);
  }, []);

  const dismissBadge = useCallback((id: string) => {
    setBadges(prev => prev.filter(badge => badge.id !== id));
  }, []);

  const clearAllBadges = useCallback(() => {
    setBadges([]);
  }, []);

  const totalCount = badges.reduce((sum, badge) => sum + badge.count, 0);

  // Auto-dismiss badges after 10 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

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
  const markAsViewed = useCallback(() => {
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
