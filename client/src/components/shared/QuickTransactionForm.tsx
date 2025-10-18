import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Category, PaymentMethod, TransactionStatus, TransactionType, Wallet } from "@shared/schema";
import { useTranslation } from "@/contexts/LocalizationContext";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Check, ChevronDown } from "lucide-react";

// Esquema de validação simplificado para transações rápidas
const createQuickTransactionSchema = (t: (key: string, fallback: string) => string) => z.object({
  descricao: z.string().min(3, {
    message: t('validation.description_min_length', 'Description must be at least 3 characters.'),
  }),
  valor: z.string().min(1, {
    message: t('validation.amount_required', 'Amount is required.'),
  }),
  categoria_id: z.number({
    required_error: t('validation.category_required', 'Select a category.'),
    invalid_type_error: t('validation.invalid_category', 'Invalid category.')
  }),
  forma_pagamento_id: z.number({
    required_error: t('validation.payment_method_required', 'Select a payment method.'),
    invalid_type_error: t('validation.invalid_payment_method', 'Invalid payment method.')
  }),
  data_transacao: z.string({
    required_error: t('validation.date_required', 'Date is required.'),
  }),
  tipo: z.enum([TransactionType.EXPENSE, TransactionType.INCOME], {
    required_error: t('validation.type_required', 'Type is required.'),
  })
});

type QuickTransactionValues = z.infer<ReturnType<typeof createQuickTransactionSchema>>;

interface QuickTransactionFormProps {
  tipo: TransactionType;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function QuickTransactionForm({ tipo, onSuccess, onCancel }: QuickTransactionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useTranslation();
  
  const quickTransactionSchema = createQuickTransactionSchema(t);

  // Buscar categorias
  const { data: categories = [], isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Buscar formas de pagamento
  const { data: paymentMethods = [], isLoading: isPaymentMethodsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
  });

  // Buscar carteira atual
  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["/api/wallet/current"],
  });

  // Filtrar categorias baseado no tipo
  const filteredCategories = categories.filter(
    (category) => category.tipo === tipo
  );

  // Find PIX payment method for default
  const pixPaymentMethod = paymentMethods.find(pm => pm.nome.toLowerCase().includes('pix'));

  // Inicializar formulário com valores padrão
  const form = useForm<QuickTransactionValues>({
    resolver: zodResolver(quickTransactionSchema),
    defaultValues: {
      descricao: "",
      valor: "",
      categoria_id: 0,
      forma_pagamento_id: pixPaymentMethod?.id || 0,
      data_transacao: new Date().toISOString().split('T')[0],
      tipo: tipo
    }
  });

  // Set PIX as default when payment methods load
  useEffect(() => {
    if (pixPaymentMethod && !form.getValues('forma_pagamento_id')) {
      form.setValue('forma_pagamento_id', pixPaymentMethod.id);
    }
  }, [pixPaymentMethod, form]);

  // Lidamos com a submissão do formulário
  const onSubmit = async (data: QuickTransactionValues) => {
    if (!wallet) {
      toast({
        title: "Erro",
        description: "Nenhuma carteira encontrada.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Find the selected payment method name
      const selectedPaymentMethod = paymentMethods.find(pm => pm.id === data.forma_pagamento_id);
      
      const transactionData = {
        ...data,
        valor: data.valor, // Manter como string como esperado pelo schema
        carteira_id: wallet.id,
        metodo_pagamento: selectedPaymentMethod?.nome || "PIX", // Use selected payment method name
        status: TransactionStatus.COMPLETED // Valor padrão
      };
      
      console.log("Dados enviados:", transactionData);
      
      const response = await apiRequest("/api/transactions", {
        method: "POST",
        data: transactionData
      });
      console.log("Resposta da criação:", response);
      
      // Invalidar queries para atualizar os dados
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      
      toast({
        title: "Transação criada",
        description: "A transação foi criada com sucesso.",
      });
      
      // Invalidate payment method totals cache
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      
      if (onSuccess) {
        onSuccess();
      }
      
      form.reset();
    } catch (error: any) {
      console.error("Erro ao salvar transação:", error);
      const errorMessage = error?.message || "Não foi possível salvar a transação.";
      const detailedError = error?.errors ? JSON.stringify(error.errors) : "";
      
      toast({
        title: "Erro",
        description: `${errorMessage} ${detailedError}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl">
          {tipo === TransactionType.INCOME ? t('transactions.new_income', 'New Income') : t('transactions.new_expense', 'New Expense')}
        </DialogTitle>
        <DialogDescription>
          {tipo === TransactionType.INCOME ? t('transactions.fill_details_income', 'Fill in the details to record a new income.') : t('transactions.fill_details_expense', 'Fill in the details to record a new expense.')}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('transactions.description', 'Description')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('transactions.description_placeholder', 'Transaction description')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="flex flex-col md:flex-row gap-4">
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('transactions.amount', 'Amount')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0,00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="data_transacao"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('transactions.date', 'Date')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <FormField
            control={form.control}
            name="categoria_id"
            render={({ field }) => {
              // Implementação personalizada sem animações
              const [isOpen, setIsOpen] = useState(false);
              const selectRef = useRef<HTMLDivElement>(null);
              
              // Fechamento ao clicar fora do componente
              useEffect(() => {
                const handleClickOutside = (event: MouseEvent) => {
                  if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                  }
                };
                
                if (isOpen) {
                  document.addEventListener('mousedown', handleClickOutside);
                }
                
                return () => {
                  document.removeEventListener('mousedown', handleClickOutside);
                };
              }, [isOpen]);
              
              // Determinar categoria selecionada
              const selectedCategory = filteredCategories?.find(
                category => category.id === field.value
              );
              
              return (
                <FormItem className="relative">
                  <FormLabel>{t('transactions.category', 'Category')}</FormLabel>
                  <div ref={selectRef} className="relative">
                    <FormControl>
                      <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {selectedCategory ? (
                          <div className="flex items-center">
                            <div 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: selectedCategory.cor || "#6C63FF" }}
                            ></div>
                            {selectedCategory.nome}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('transactions.select_category', 'Select a category')}</span>
                        )}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </FormControl>
                    
                    {isOpen && (
                      <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
                        <div className="p-1">
                          {isCategoriesLoading ? (
                            <div className="flex items-center justify-center p-2">
                              <Loader2 className="h-4 w-4" />
                              <span className="ml-2">{t('common.loading', 'Loading...')}</span>
                            </div>
                          ) : filteredCategories?.length === 0 ? (
                            <div className="p-2 text-center text-sm">
                              {t('transactions.no_categories', 'No categories available')}
                            </div>
                          ) : (
                            filteredCategories?.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                  field.onChange(Number(category.id));
                                  setIsOpen(false);
                                }}
                              >
                                {field.value === category.id && (
                                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                    <Check className="h-4 w-4" />
                                  </span>
                                )}
                                <div className="flex items-center">
                                  <div 
                                    className="w-3 h-3 rounded-full mr-2" 
                                    style={{ backgroundColor: category.cor || "#6C63FF" }}
                                  ></div>
                                  {category.nome}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="forma_pagamento_id"
            render={({ field }) => {
              // Implementação personalizada sem animações
              const [isOpen, setIsOpen] = useState(false);
              const selectRef = useRef<HTMLDivElement>(null);
              
              // Fechamento ao clicar fora do componente
              useEffect(() => {
                const handleClickOutside = (event: MouseEvent) => {
                  if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                  }
                };
                
                if (isOpen) {
                  document.addEventListener('mousedown', handleClickOutside);
                }
                
                return () => {
                  document.removeEventListener('mousedown', handleClickOutside);
                };
              }, [isOpen]);
              
              // Determinar forma de pagamento selecionada
              const selectedPaymentMethod = paymentMethods.find(
                pm => pm.id === field.value
              );
              
              return (
                <FormItem className="relative">
                  <FormLabel>{t('transactions.payment_method', 'Payment Method')}</FormLabel>
                  <div ref={selectRef} className="relative">
                    <FormControl>
                      <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {selectedPaymentMethod ? (
                          <span>{selectedPaymentMethod.nome}</span>
                        ) : (
                          <span className="text-muted-foreground">{t('transactions.select_payment_method', 'Select a payment method')}</span>
                        )}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </FormControl>
                    
                    {isOpen && (
                      <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
                        <div className="p-1">
                          {isPaymentMethodsLoading ? (
                            <div className="flex items-center justify-center p-2">
                              <Loader2 className="h-4 w-4" />
                              <span className="ml-2">{t('common.loading', 'Loading...')}</span>
                            </div>
                          ) : paymentMethods.length === 0 ? (
                            <div className="p-2 text-center text-sm">
                              {t('transactions.no_payment_methods', 'No payment methods available')}
                            </div>
                          ) : (
                            paymentMethods.map((paymentMethod) => (
                              <button
                                key={paymentMethod.id}
                                type="button"
                                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                  field.onChange(Number(paymentMethod.id));
                                  setIsOpen(false);
                                }}
                              >
                                {field.value === paymentMethod.id && (
                                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                    <Check className="h-4 w-4" />
                                  </span>
                                )}
                                <span>{paymentMethod.nome}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <DialogFooter className="flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              className="md:w-auto"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="md:w-auto">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4" />}
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}