import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface TransactionBadgeProps {
  count: number;
  onDismiss: () => void;
}

export function TransactionBadge({ count, onDismiss }: TransactionBadgeProps) {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, x: 20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: 20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative"
    >
      <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-1.5 text-income text-sm font-medium shadow-lg backdrop-blur-sm">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="font-semibold">
          {count === 1 ? 'Nova Transação' : `${count} Novas Transações`}
        </span>
        <button
          onClick={onDismiss}
          className="ml-1 hover:bg-green-500/20 rounded p-0.5 transition-colors duration-200"
          title="Dispensar notificação"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

interface BadgeStackProps {
  badges: Array<{
    id: string;
    type: 'transaction';
    count: number;
    timestamp: number;
  }>;
  onDismiss: (id: string) => void;
}

export function BadgeStack({ badges, onDismiss }: BadgeStackProps) {
  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {badges.map((badge) => (
          <motion.div
            key={badge.id}
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            <TransactionBadge
              count={badge.count}
              onDismiss={() => onDismiss(badge.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
