import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { Category, Transaction, TransactionStatus, TransactionType, PaymentMethod } from "@shared/schema";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "@/contexts/LocalizationContext";
import { translatePaymentMethodName, translateCategoryName } from "@/utils/localization";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Removed Dialog imports as they're not needed when used in animated modal
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpIcon, ArrowDownIcon, Check, ChevronDown, X } from "lucide-react";

// Custom schema for form validation - will be created dynamically with translations
const createTransactionFormSchema = (t: (key: string, fallback: string) => string) => z.object({
  descricao: z.string().min(2, t('validation.description_min_length', 'Description must be at least 2 characters')),
  valor: z.string().min(1, t('validation.amount_required', 'Amount is required')).refine(
    (value) => !isNaN(parseFloat(value)) && parseFloat(value) > 0,
    t('validation.amount_positive', 'Amount must be greater than zero')
  ),
  categoria_id: z.number({
    required_error: t('validation.category_required', 'Category is required'),
    invalid_type_error: t('validation.category_required', 'Category is required'),
  }),
  forma_pagamento_id: z.number({
    required_error: t('validation.payment_method_required', 'Payment method is required'),
    invalid_type_error: t('validation.payment_method_required', 'Payment method is required'),
  }),
  tipo: z.string().min(1, t('validation.type_required', 'Type is required')),
  data_transacao: z.string().min(1, t('validation.date_required', 'Date is required')),
});

type TransactionFormValues = z.infer<ReturnType<typeof createTransactionFormSchema>>;

interface TransactionFormProps {
  transaction?: Transaction | null;
  onSuccess?: () => void;
}

export function TransactionForm({ transaction, onSuccess }: TransactionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  // Create schema with translations
  const transactionFormSchema = createTransactionFormSchema(t);
  
  // Fetch categories
  const { data: categories, isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"]
  });
  
  // Fetch payment methods
  const { data: paymentMethods, isLoading: isPaymentMethodsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"]
  });
  
  // Fetch wallets
  const { data: wallet } = useQuery<{ id: number }>({
    queryKey: ["/api/wallet/current"]
  });
  
  // Find PIX payment method for default
  const pixPaymentMethod = paymentMethods?.find(pm => pm.nome.toLowerCase().includes('pix'));
  
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      descricao: "",
      valor: "",
      categoria_id: undefined,
      forma_pagamento_id: pixPaymentMethod?.id || undefined,
      tipo: TransactionType.EXPENSE,
      data_transacao: formatDate(new Date(), "yyyy-MM-dd"),
    },
  });
  
  // Update form when editing a transaction
  useEffect(() => {
    if (transaction) {
      form.reset({
        descricao: transaction.descricao,
        valor: String(transaction.valor),
        categoria_id: transaction.categoria_id,
        forma_pagamento_id: transaction.forma_pagamento_id || pixPaymentMethod?.id || undefined,
        tipo: transaction.tipo,
        data_transacao: typeof transaction.data_transacao === 'string' 
          ? transaction.data_transacao.split('T')[0]
          : formatDate(transaction.data_transacao, "yyyy-MM-dd"),
      });
    }
  }, [transaction, form, pixPaymentMethod]);

  // Set PIX as default when payment methods load
  useEffect(() => {
    if (pixPaymentMethod && !transaction && !form.getValues('forma_pagamento_id')) {
      form.setValue('forma_pagamento_id', pixPaymentMethod.id);
    }
  }, [pixPaymentMethod, transaction, form]);
  
  // Filter categories based on selected transaction type
  const filteredCategories = categories?.filter(
    category => category.tipo === form.watch("tipo")
  );
  
  const onSubmit = async (data: TransactionFormValues) => {
    if (!wallet?.id) {
      toast({
        title: t('common.error', 'Error'),
        description: t('transactions.no_wallet_available', 'No wallet available'),
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Find the selected payment method name
      const selectedPaymentMethod = paymentMethods?.find(pm => pm.id === data.forma_pagamento_id);
      
      const transactionData = {
        ...data,
        valor: data.valor, // Manter como string como esperado pelo schema
        carteira_id: wallet.id,
        metodo_pagamento: selectedPaymentMethod?.nome || "PIX", // Use selected payment method name
        status: TransactionStatus.COMPLETED // Valor padrão
      };
      
      console.log("Dados enviados:", transactionData);
      
      if (transaction) {
        const response = await apiRequest(`/api/transactions/${transaction.id}`, {
          method: "PUT",
          data: transactionData
        });
        console.log("Resposta da atualização:", response);
        toast({
          title: t('transactions.transaction_updated', 'Transaction updated'),
          description: t('transactions.update_success', 'Transaction was successfully updated.'),
        });
      } else {
        const response = await apiRequest("/api/transactions", {
          method: "POST",
          data: transactionData
        });
        console.log("Resposta da criação:", response);
        toast({
          title: t('transactions.transaction_created', 'Transaction created'),
          description: t('transactions.create_success', 'Transaction was successfully created.'),
        });
      }
      
      // Invalidate payment method totals cache
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      
      if (onSuccess) {
        onSuccess();
      }
      
      form.reset();
    } catch (error: any) {
      console.error("Erro ao salvar transação:", error);
      const errorMessage = error?.message || t('transactions.save_error', 'Could not save the transaction.');
      const detailedError = error?.errors ? JSON.stringify(error.errors) : "";
      
      toast({
        title: t('common.error', 'Error'),
        description: `${errorMessage} ${detailedError}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  

  
  return (
    <>
      <div className="modal-header-sticky">
        <div className="flex flex-col items-center w-full">
          <h2 className="text-2xl font-semibold">
            {transaction ? t('transactions.edit_transaction', 'Edit Transaction') : t('transactions.new_transaction', 'New Transaction')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {transaction
              ? t('transactions.edit_description', 'Edit the transaction details below.')
              : t('transactions.fill_details', 'Fill in the details to record a new transaction.')}
          </p>
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('transactions.type', 'Type')}</FormLabel>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant={field.value === TransactionType.EXPENSE ? "default" : "outline"}
                      className={`flex-1 ${field.value === TransactionType.EXPENSE ? (theme === 'light' ? "bg-red-500 text-white hover:bg-red-600" : "bg-red-500/20 text-red-400") : ""}`}
                      onClick={() => {
                        field.onChange(TransactionType.EXPENSE);
                        form.setValue("categoria_id", 0); // Usar 0 em vez de undefined
                      }}
                    >
                      <ArrowDownIcon className="mr-2 h-4 w-4" />
                      {t('transactions.type_labels.expense', 'Despesa')}
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === TransactionType.INCOME ? "default" : "outline"}
                      className={`flex-1 ${field.value === TransactionType.INCOME ? (theme === 'light' ? "bg-green-500 text-white hover:bg-green-600" : "bg-green-500/20 text-green-400") : ""}`}
                      onClick={() => {
                        field.onChange(TransactionType.INCOME);
                        form.setValue("categoria_id", 0); // Usar 0 em vez de undefined
                      }}
                    >
                      <ArrowUpIcon className="mr-2 h-4 w-4" />
                      {t('transactions.type_labels.income', 'Receita')}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
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
                  <FormLabel>{t('transactions.category', 'Categoria')}</FormLabel>
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
                            {translateCategoryName(selectedCategory.nome, t)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('transactions.select_category', 'Selecione uma categoria')}</span>
                        )}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </FormControl>
                    
                    {isOpen && (
                      <div className={`relative z-50 w-full mt-1 rounded-md border shadow-md max-h-[300px] overflow-y-auto ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-popover border-gray-700'} text-popover-foreground`}>
                        <div className="p-1">
                          {isCategoriesLoading ? (
                            <div className="flex items-center justify-center p-2">
                              <Loader2 className="h-4 w-4" />
                              <span className="ml-2">{t('common.loading', 'Loading...')}</span>
                            </div>
                          ) : filteredCategories?.length === 0 ? (
                            <div className="p-2 text-center text-sm">
                              Nenhuma categoria disponível
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
                                  {translateCategoryName(category.nome, t)}
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
              // Custom payment method selector without animations
              const [isOpen, setIsOpen] = useState(false);
              const selectRef = useRef<HTMLDivElement>(null);
              
              // Close when clicking outside
              useEffect(() => {
                function handleClickOutside(event: MouseEvent) {
                  if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                  }
                }
                document.addEventListener('mousedown', handleClickOutside);
                return () => document.removeEventListener('mousedown', handleClickOutside);
              }, []);
              
              const selectedPaymentMethod = paymentMethods?.find(pm => pm.id === field.value);
              
              return (
                <FormItem>
                  <FormLabel>{t('transactions.payment_method.label', 'Forma de Pagamento')}</FormLabel>
                  <div className="relative" ref={selectRef}>
                    <FormControl>
                      <button
                        type="button"
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setIsOpen(!isOpen)}
                        disabled={isPaymentMethodsLoading}
                      >
                        <span className={selectedPaymentMethod ? "" : "text-muted-foreground"}>
                          {selectedPaymentMethod
                            ? translatePaymentMethodName(selectedPaymentMethod.nome, t)
                            : t('transactions.payment_method.placeholder', 'Selecione uma forma de pagamento')}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </FormControl>
                    {isOpen && (
                      <div className={`relative top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border p-1 shadow-md ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-popover border-gray-700'} text-popover-foreground`}>
                        {isPaymentMethodsLoading ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            {t('common.loading', 'Carregando...')}
                          </div>
                        ) : paymentMethods && paymentMethods.length > 0 ? (
                          paymentMethods.map((pm) => (
                            <div
                              key={pm.id}
                              className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                field.onChange(pm.id);
                                setIsOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${field.value === pm.id ? "opacity-100" : "opacity-0"}`} />
                              <span>{translatePaymentMethodName(pm.nome, t)}</span>
                              {pm.global && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  ({t('transactions.payment_method.global_badge', 'Global')})
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            {t('transactions.payment_method.empty', 'Nenhuma forma de pagamento disponível')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4" />}
              {transaction
                ? t('transactions.submit.update', 'Salvar alterações')
                : t('transactions.submit.create', 'Criar transação')}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
