import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TransactionType } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { ArrowUp, ArrowDown, Wallet as WalletIcon, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { QuickTransactionForm } from "@/components/shared/QuickTransactionForm";
import { useTranslation } from "@/contexts/LocalizationContext";

export default function WalletPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [walletName, setWalletName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>(TransactionType.INCOME);

  const { data: wallet, isLoading } = useQuery<Wallet>({
    queryKey: ["/api/wallet/current"],
  });

  const handleStartEdit = () => {
    setWalletName(wallet?.nome || "");
    setIsEditing(true);
  };

  const handleUpdateWallet = async () => {
    if (!walletName.trim()) {
      toast({
        title: t('common.error', 'Erro'),
        description: t('wallet.name_required', 'O nome da carteira não pode estar vazio.'),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdating(true);
      await apiRequest(`/api/wallet/${wallet?.id}`, {
        method: "PATCH",
        data: { nome: walletName }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      setIsEditing(false);
      toast({
        title: t('common.success', 'Sucesso'),
        description: t('wallet.updated_success', 'Carteira atualizada com sucesso.'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Erro'),
        description: t('wallet.update_error', 'Não foi possível atualizar a carteira.'),
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Função para lidar com o sucesso da transação
  const handleTransactionSuccess = () => {
    setTransactionModalOpen(false);
    queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
    queryClient.invalidateQueries({ queryKey: ["/api/transactions/recent"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
    
    toast({
      title: t('wallet.transaction_added', 'Transação adicionada'),
      description: t('wallet.transaction_success_description', `Nova ${transactionType === TransactionType.INCOME ? t('common.income', 'receita') : t('common.expenses', 'despesa')} registrada com sucesso.`),
    });
  };

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl md:text-3xl font-bold mb-1">{t('wallet.page_title', 'Minha Carteira')}</h1>
          <p className="text-gray-400">{t('wallet.page_description', 'Gerencie suas finanças em um só lugar')}</p>
        </motion.div>
      </div>
      
      {/* Modal de transação rápida */}
      <Dialog open={transactionModalOpen} onOpenChange={setTransactionModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <QuickTransactionForm 
            tipo={transactionType} 
            onSuccess={handleTransactionSuccess}
            onCancel={() => setTransactionModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="glass-card neon-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-bold">Carteira Principal</CardTitle>
              {!isEditing ? (
                <Button 
                  onClick={handleStartEdit} 
                  variant="ghost" 
                  className="text-primary hover:bg-primary/10"
                >
                  {t('common.edit', 'Edit')}
                </Button>
              ) : (
                <Button 
                  onClick={() => setIsEditing(false)} 
                  variant="ghost" 
                  className="text-gray-400 hover:bg-gray-500/10"
                >
                  Cancelar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <>
                  <Skeleton className="w-3/4 h-8 mb-4" />
                  <Skeleton className="w-1/2 h-6 mb-2" />
                  <Skeleton className="w-1/3 h-6" />
                </>
              ) : isEditing ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm text-gray-400 mb-2">Nome da carteira</h3>
                    <Input 
                      value={walletName} 
                      onChange={(e) => setWalletName(e.target.value)} 
                      className="bg-black/20"
                    />
                  </div>
                  <Button 
                    onClick={handleUpdateWallet} 
                    className="w-full"
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Salvando..." : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Salvar alterações
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <WalletIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm text-gray-400">Nome da carteira</h3>
                      <h2 className="text-xl font-bold">{wallet?.nome}</h2>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm text-gray-400 mb-1">Saldo atual</h3>
                    <h2 className="text-3xl font-orbitron text-primary mb-4">
                      {formatCurrency(Number(wallet?.saldo_atual) || 0)}
                    </h2>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="glass-card neon-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold">Ações Rápidas</CardTitle>
              <CardDescription>Adicione novas transações</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full bg-green-500/20 hover:bg-green-500/40 text-green-400 hover:text-white border-green-500/40"
                variant="outline"
                onClick={() => {
                  setTransactionType(TransactionType.INCOME);
                  setTransactionModalOpen(true);
                }}
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                {t('transactions.new_income', 'New Income')}
              </Button>
              
              <Button 
                className="w-full bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-white border-red-500/40"
                variant="outline"
                onClick={() => {
                  setTransactionType(TransactionType.EXPENSE);
                  setTransactionModalOpen(true);
                }}
              >
                <ArrowDown className="mr-2 h-4 w-4" />
                {t('transactions.new_expense', 'New Expense')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}