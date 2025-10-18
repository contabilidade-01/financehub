import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpIcon, ArrowDownIcon, WalletIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/contexts/LocalizationContext";

interface WalletSummaryProps {
  isWalletLoading: boolean;
  isSummaryLoading: boolean;
  walletData?: {
    id: number;
    saldo_atual: number;
    nome: string;
  };
  summaryData?: {
    totalExpenses: number;
    totalIncome: number;
    expensesByCategory: Array<{
      categoryId: number;
      name: string;
      total: number;
      color: string;
      icon: string;
      percentage: number;
    }>;
    monthlyData: Array<{
      month: string;
      income: number;
      expense: number;
    }>;
  };
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  }
};

export default function WalletSummary({ isWalletLoading, isSummaryLoading, walletData, summaryData }: WalletSummaryProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  // Calculate monthly change percentage (placeholder for now)
  const monthlyChangePercentage = 2.5;
  
  const cardHoverOverlay = (
    <>
      {/* Overlay radial colorido no canto direito ocupando 1/3 do card, idêntico ao darkmode mas com opacidade maior no lightmode */}
      <div
        className="absolute top-0 right-0 h-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30"
        style={{
          width: '40%',
          borderTopRightRadius: '16px',
          borderBottomRightRadius: '16px',
          background: theme === 'light'
            ? 'radial-gradient(circle at 80% 50%, rgba(0,255,153,0.22) 0%, rgba(0,153,255,0.15) 40%, rgba(255,0,204,0.12) 70%, rgba(255,153,0,0.10) 100%)'
            : 'radial-gradient(circle at 80% 50%, rgba(0,255,153,0.18) 0%, rgba(0,153,255,0.12) 40%, rgba(255,0,204,0.10) 70%, rgba(255,153,0,0.10) 100%)',
        }}
      />
    </>
  );
  
  return (
    <motion.section
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1 }
      }}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.4 }}
    >
      <Card className={`${theme === 'light' ? 'bg-white border border-gray-200 shadow-sm' : 'glass-card neon-border'} rounded-2xl overflow-hidden`}>
        <CardContent className="p-5 md:p-6 relative">
          {theme !== 'light' && (
            <div className="absolute top-0 right-0 w-64 h-full opacity-10">
              <div className="w-full h-full bg-gradient-to-br from-secondary/20 to-primary/20 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/4"></div>
            </div>
          )}
          
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h2 className={`font-space text-xl ${theme === 'light' ? 'text-gray-900' : ''}`}>{t('wallet.title', 'Sua Carteira')}</h2>
                <p className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-400'} text-sm`}>
                  {t('wallet.updated_on', 'Atualizado em')} {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="mt-3 md:mt-0">
                <span className={`text-xs font-orbitron px-3 py-1 rounded-full ${theme === 'light' ? 'bg-gray-100 text-gray-700' : 'bg-dark'}`}>
                  {isWalletLoading ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    walletData?.nome || t('wallet.main_wallet', 'Principal')
                  )}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
              {/* Saldo Atual */}
              <motion.div 
                className="relative group"
                variants={itemVariants}
              >
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
                  border: '2px solid transparent',
                  borderRadius: '16px',
                  background: 'conic-gradient(from 0deg, #00ff99, #0099ff, #ff00cc, #ff9900, #00ff99 100%)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  padding: '2px',
                  zIndex: 1
                }} />
                {cardHoverOverlay}
                <div className={`${theme === 'light' ? 'bg-white shadow-md' : 'glass'} rounded-xl p-4 relative z-30 flex flex-col h-full`}>
                  <div className="flex items-center mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${theme === 'light' ? 'bg-primary/10' : 'bg-secondary/20'}`}>
                      <WalletIcon className={`h-4 w-4 ${theme === 'light' ? 'text-primary' : 'text-secondary'}`} />
                    </div>
                    <span className={`${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} text-sm font-semibold`}>{t('wallet.current_balance', 'Current Balance')}</span>
                  </div>
                  {isWalletLoading ? (
                    <Skeleton className="h-8 w-32 mb-2" />
                  ) : (
                    <h3 className={`text-2xl md:text-3xl font-orbitron font-bold mb-1 ${
                      (walletData?.saldo_atual || 0) < 0
                        ? theme === 'light' ? 'text-red-600' : 'text-[#dd0000]'
                        : theme === 'light' ? 'text-gray-900' : ''
                    }`}>
                      {formatCurrency(walletData?.saldo_atual || 0)}
                    </h3>
                  )}
                  <p className={`${theme === 'light' ? 'text-green-600' : 'text-green-400'} text-sm flex items-center font-medium`}>
                    <ArrowUpIcon className={`h-3 w-3 mr-1 ${theme === 'light' ? 'text-green-600' : 'text-green-400'}`} />
                    <span>+{monthlyChangePercentage}% {t('wallet.this_month', 'este mês')}</span>
                  </p>
                </div>
              </motion.div>
              
              {/* Receitas (Mês) */}
              <motion.div 
                className="relative group"
                variants={itemVariants}
              >
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
                  border: '2px solid transparent',
                  borderRadius: '16px',
                  background: 'conic-gradient(from 0deg, #00ff99, #0099ff, #ff00cc, #ff9900, #00ff99 100%)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  padding: '2px',
                  zIndex: 1
                }} />
                {cardHoverOverlay}
                <div className={`${theme === 'light' ? 'bg-white shadow-md' : 'glass'} rounded-xl p-4 relative z-30 flex flex-col h-full`}>
                  <div className="flex items-center mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${theme === 'light' ? 'bg-green-100' : 'bg-green-500/20'}`}>
                      <ArrowUpIcon className={`h-4 w-4 ${theme === 'light' ? 'text-green-600' : 'text-green-500'}`} />
                    </div>
                    <span className={`${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} text-sm font-semibold`}>{t('wallet.monthly_income', 'Monthly Income')}</span>
                  </div>
                  {isSummaryLoading ? (
                    <Skeleton className="h-8 w-32 mb-2" />
                  ) : (
                    <h3 className={`text-2xl md:text-3xl font-orbitron font-bold mb-1 ${theme === 'light' ? 'text-gray-900' : ''}`}>
                      {formatCurrency(summaryData?.totalIncome || 0)}
                    </h3>
                  )}
                  <p className={`${theme === 'light' ? 'text-green-600' : 'text-green-400'} text-sm flex items-center font-medium`}>
                    <ArrowUpIcon className={`h-3 w-3 mr-1 ${theme === 'light' ? 'text-green-600' : 'text-green-400'}`} />
                    <span>+12% {t('wallet.vs_last_month', 'vs. último mês')}</span>
                  </p>
                </div>
              </motion.div>
              
              {/* Despesas (Mês) */}
              <motion.div 
                className="relative group"
                variants={itemVariants}
              >
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
                  border: '2px solid transparent',
                  borderRadius: '16px',
                  background: 'conic-gradient(from 0deg, #00ff99, #0099ff, #ff00cc, #ff9900, #00ff99 100%)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  padding: '2px',
                  zIndex: 1
                }} />
                {cardHoverOverlay}
                <div className={`${theme === 'light' ? 'bg-white shadow-md' : 'glass'} rounded-xl p-4 relative z-30 flex flex-col h-full`}>
                  <div className="flex items-center mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${theme === 'light' ? 'bg-red-100' : 'bg-red-500/20'}`}>
                      <ArrowDownIcon className={`h-4 w-4 ${theme === 'light' ? 'text-red-600' : 'text-red-500'}`} />
                    </div>
                    <span className={`${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} text-sm font-semibold`}>{t('wallet.monthly_expenses', 'Monthly Expenses')}</span>
                  </div>
                  {isSummaryLoading ? (
                    <Skeleton className="h-8 w-32 mb-2" />
                  ) : (
                    <h3 className={`text-2xl md:text-3xl font-orbitron font-bold mb-1 ${theme === 'light' ? 'text-gray-900' : ''}`}>
                      {formatCurrency(summaryData?.totalExpenses || 0)}
                    </h3>
                  )}
                  <p className={`${theme === 'light' ? 'text-red-600' : 'text-red-400'} text-sm flex items-center font-medium`}>
                    <ArrowDownIcon className={`h-3 w-3 mr-1 ${theme === 'light' ? 'text-red-600' : 'text-red-400'}`} />
                    <span>-5% {t('wallet.vs_last_month', 'vs. último mês')}</span>
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
}
