import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { translateCategoryName } from "@/utils/localization";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpIcon, ArrowDownIcon, Check, ChevronDown } from "lucide-react";

type ContaOpt = { id: number; nome: string; ativo?: boolean };
type CartaoOpt = { id: number; nome: string };

const hasLimite = (pm: PaymentMethod) =>
  pm.limite != null && String(pm.limite) !== "" && Number(pm.limite) > 0;

const ehCartaoPm = (pm: PaymentMethod | undefined) =>
  !!pm && pm.dia_fechamento != null && pm.dia_vencimento != null;

/** Forma genérica "Cartão de Crédito" — não é cartão real. */
const ehFormaCartaoGenerica = (nome: string | undefined | null) =>
  /^(cart[aã]o([_\s-]?de)?[_\s-]?cr[eé]dito|cartao_credito|credit[_\s-]?card|cart[aã]o)$/i.test(
    (nome || "").trim()
  );

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
  pago_com: z.string().min(1, t('validation.payment_method_required', 'Payment method is required')),
  tipo: z.string().min(1, t('validation.type_required', 'Type is required')),
  data_transacao: z.string().min(1, t('validation.date_required', 'Date is required')),
  reembolsavel: z.boolean().default(false),
  parcelas: z.coerce.number().int().min(1).default(1),
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

  const transactionFormSchema = createTransactionFormSchema(t);

  const { data: categories, isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"]
  });

  const { data: paymentMethods, isLoading: isPaymentMethodsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"]
  });

  const { data: contas = [] } = useQuery<ContaOpt[]>({
    queryKey: ["/api/contas"]
  });

  const { data: cartoes = [] } = useQuery<CartaoOpt[]>({
    queryKey: ["/api/cartoes"]
  });

  const { data: wallet } = useQuery<{ id: number }>({
    queryKey: ["/api/wallet/current"]
  });

  const formasSemLimite = useMemo(() => {
    const base = (paymentMethods || []).filter(
      (pm) => !hasLimite(pm) && pm.dia_fechamento == null && pm.dia_vencimento == null
    );
    // Se já há cartões reais, esconde a forma genérica "Cartão de Crédito".
    if (cartoes.length > 0) {
      return base.filter((pm) => !ehFormaCartaoGenerica(pm.nome));
    }
    return base;
  }, [paymentMethods, cartoes]);

  const contasAtivas = useMemo(
    () => contas.filter((c) => c.ativo !== false),
    [contas]
  );

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      descricao: "",
      valor: "",
      categoria_id: undefined,
      pago_com: "",
      tipo: TransactionType.EXPENSE,
      data_transacao: formatDate(new Date(), "yyyy-MM-dd"),
      reembolsavel: false,
      parcelas: 1,
    },
  });

  const tipoAtual = form.watch("tipo");

  const opcoesPagoCom = useMemo(() => {
    const opts: { value: string; label: string; group: string }[] = [];
    for (const c of contasAtivas) {
      opts.push({ value: `conta:${c.id}`, label: c.nome, group: "Contas" });
    }
    if (tipoAtual === TransactionType.EXPENSE) {
      for (const c of cartoes) {
        opts.push({ value: `cartao:${c.id}`, label: `CC ${c.nome}`, group: "Cartões" });
      }
    }
    for (const pm of formasSemLimite) {
      opts.push({ value: `forma:${pm.id}`, label: pm.nome, group: "Formas" });
    }
    return opts;
  }, [contasAtivas, cartoes, formasSemLimite, tipoAtual]);

  const defaultPagoCom = useMemo(() => {
    const pix = formasSemLimite.find((pm) => pm.nome.toLowerCase().includes("pix"));
    if (pix) return `forma:${pix.id}`;
    if (contasAtivas[0]) return `conta:${contasAtivas[0].id}`;
    if (opcoesPagoCom[0]) return opcoesPagoCom[0].value;
    return "";
  }, [formasSemLimite, contasAtivas, opcoesPagoCom]);

  const resolvePagoComFromTransaction = (tx: Transaction): string => {
    const fpId = tx.forma_pagamento_id;
    // Cartão real ou forma genérica de cartão têm prioridade sobre conta_bancaria_id
    // do backfill (senão toda edição aparece como "Carteira (principal)").
    if (fpId && cartoes.some((c) => c.id === fpId)) return `cartao:${fpId}`;
    if (fpId) {
      const pm = paymentMethods?.find((p) => p.id === fpId);
      if (ehCartaoPm(pm)) return `cartao:${fpId}`;
      if (ehFormaCartaoGenerica(pm?.nome) && cartoes[0]) return `cartao:${cartoes[0].id}`;
      if (fpId) return `forma:${fpId}`;
    }
    const contaId = (tx as any).conta_bancaria_id;
    if (contaId) return `conta:${contaId}`;
    return defaultPagoCom;
  };

  useEffect(() => {
    if (transaction) {
      form.reset({
        descricao: transaction.descricao,
        valor: String(transaction.valor),
        categoria_id: transaction.categoria_id,
        pago_com: resolvePagoComFromTransaction(transaction),
        tipo: transaction.tipo,
        reembolsavel: transaction.reembolsavel ?? false,
        parcelas: (transaction as any).parcela_total || 1,
        data_transacao: typeof transaction.data_transacao === "string"
          ? transaction.data_transacao.split("T")[0]
          : formatDate(transaction.data_transacao, "yyyy-MM-dd"),
      });
    }
  }, [transaction, form, cartoes, paymentMethods, defaultPagoCom]);

  useEffect(() => {
    if (!transaction && defaultPagoCom && !form.getValues("pago_com")) {
      form.setValue("pago_com", defaultPagoCom);
    }
  }, [defaultPagoCom, transaction, form]);

  const filteredCategories = categories?.filter(
    (category) => category.tipo === form.watch("tipo")
  );

  const onSubmit = async (data: TransactionFormValues) => {
    if (!wallet?.id) {
      toast({
        title: t("common.error", "Error"),
        description: t("transactions.no_wallet_available", "No wallet available"),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const [kind, idStr] = data.pago_com.split(":");
      const id = Number(idStr);

      let forma_pagamento_id: number | undefined;
      let conta_bancaria_id: number | undefined;
      let metodo_pagamento = "PIX";

      if (kind === "conta") {
        conta_bancaria_id = id;
        const conta = contasAtivas.find((c) => c.id === id);
        metodo_pagamento = conta?.nome || "Conta";
      } else if (kind === "cartao") {
        forma_pagamento_id = id;
        const cartao = cartoes.find((c) => c.id === id);
        metodo_pagamento = cartao?.nome || "Cartão";
      } else if (kind === "forma") {
        forma_pagamento_id = id;
        const pm = paymentMethods?.find((p) => p.id === id);
        metodo_pagamento = pm?.nome || "PIX";
      }

      const { pago_com, parcelas, ...rest } = data;
      const transactionData: Record<string, unknown> = {
        ...rest,
        reembolsavel: data.tipo === TransactionType.EXPENSE && data.reembolsavel,
        valor: data.valor,
        carteira_id: wallet.id,
        metodo_pagamento,
        status: transaction
          ? transaction.status
          : data.reembolsavel
            ? TransactionStatus.PENDING
            : TransactionStatus.COMPLETED,
        parcelas: data.tipo === TransactionType.EXPENSE ? Number(parcelas) || 1 : 1,
      };

      if (kind === "cartao") {
        transactionData.forma_pagamento_id = forma_pagamento_id;
        transactionData.conta_bancaria_id = null;
      } else if (kind === "conta") {
        transactionData.conta_bancaria_id = conta_bancaria_id;
        // Forma (PIX etc.) fica a cargo do backend se não enviada.
      } else if (kind === "forma") {
        transactionData.forma_pagamento_id = forma_pagamento_id;
      }

      if (transaction) {
        await apiRequest(`/api/transactions/${transaction.id}`, {
          method: "PUT",
          data: transactionData,
        });
        toast({
          title: t("transactions.transaction_updated", "Transaction updated"),
          description: t("transactions.update_success", "Transaction was successfully updated."),
        });
      } else {
        await apiRequest("/api/transactions", {
          method: "POST",
          data: transactionData,
        });
        toast({
          title: t("transactions.transaction_created", "Transaction created"),
          description: t("transactions.create_success", "Transaction was successfully created."),
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });

      if (onSuccess) onSuccess();
      form.reset({
        descricao: "",
        valor: "",
        categoria_id: undefined as any,
        pago_com: defaultPagoCom,
        tipo: TransactionType.EXPENSE,
        data_transacao: formatDate(new Date(), "yyyy-MM-dd"),
        reembolsavel: false,
        parcelas: 1,
      });
    } catch (error: any) {
      console.error("Erro ao salvar transação:", error);
      const errorMessage = error?.message || t("transactions.save_error", "Could not save the transaction.");
      const detailedError = error?.errors ? JSON.stringify(error.errors) : "";

      toast({
        title: t("common.error", "Error"),
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
            {transaction
              ? t("transactions.edit_transaction", "Edit Transaction")
              : t("transactions.new_transaction", "New Transaction")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {transaction
              ? t("transactions.edit_description", "Edit the transaction details below.")
              : t("transactions.fill_details", "Fill in the details to record a new transaction.")}
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
                  <FormLabel>{t("transactions.type", "Type")}</FormLabel>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant={field.value === TransactionType.EXPENSE ? "default" : "outline"}
                      className={`flex-1 ${
                        field.value === TransactionType.EXPENSE
                          ? theme === "light"
                            ? "bg-red-500 text-white hover:bg-red-600"
                            : "bg-red-500/20 text-red-400"
                          : ""
                      }`}
                      onClick={() => {
                        field.onChange(TransactionType.EXPENSE);
                        form.setValue("categoria_id", 0);
                      }}
                    >
                      <ArrowDownIcon className="mr-2 h-4 w-4" />
                      {t("transactions.type_labels.expense", "Despesa")}
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === TransactionType.INCOME ? "default" : "outline"}
                      className={`flex-1 ${
                        field.value === TransactionType.INCOME
                          ? theme === "light"
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : "bg-green-500/20 text-green-400"
                          : ""
                      }`}
                      onClick={() => {
                        field.onChange(TransactionType.INCOME);
                        form.setValue("categoria_id", 0);
                        form.setValue("parcelas", 1);
                      }}
                    >
                      <ArrowUpIcon className="mr-2 h-4 w-4" />
                      {t("transactions.type_labels.income", "Receita")}
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
                <FormLabel>{t("transactions.description", "Description")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("transactions.description_placeholder", "Transaction description")}
                    {...field}
                  />
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
                  <FormLabel>{t("transactions.amount", "Amount")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01" placeholder="0,00" {...field} />
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
                  <FormLabel>{t("transactions.date", "Date")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("tipo") === TransactionType.EXPENSE && (
              <FormField
                control={form.control}
                name="parcelas"
                render={({ field }) => (
                  <FormItem className="w-full md:w-28">
                    <FormLabel>Parcelas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...field}
                        value={field.value ?? 1}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          <FormField
            control={form.control}
            name="categoria_id"
            render={({ field }) => {
              const [isOpen, setIsOpen] = useState(false);
              const selectRef = useRef<HTMLDivElement>(null);

              useEffect(() => {
                const handleClickOutside = (event: MouseEvent) => {
                  if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                  }
                };
                if (isOpen) document.addEventListener("mousedown", handleClickOutside);
                return () => document.removeEventListener("mousedown", handleClickOutside);
              }, [isOpen]);

              const selectedCategory = filteredCategories?.find((category) => category.id === field.value);

              return (
                <FormItem className="relative">
                  <FormLabel>Classificação</FormLabel>
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
                            />
                            {translateCategoryName(selectedCategory.nome, t)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Selecione uma classificação</span>
                        )}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </FormControl>

                    {isOpen && (
                      <div
                        className={`relative z-50 w-full mt-1 rounded-md border shadow-md max-h-[300px] overflow-y-auto ${
                          theme === "light" ? "bg-white border-gray-200" : "bg-popover border-gray-700"
                        } text-popover-foreground`}
                      >
                        <div className="p-1">
                          {isCategoriesLoading ? (
                            <div className="flex items-center justify-center p-2">
                              <Loader2 className="h-4 w-4" />
                              <span className="ml-2">{t("common.loading", "Loading...")}</span>
                            </div>
                          ) : filteredCategories?.length === 0 ? (
                            <div className="p-2 text-center text-sm">Nenhuma classificação disponível</div>
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
                                  />
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
            name="pago_com"
            render={({ field }) => {
              const [isOpen, setIsOpen] = useState(false);
              const selectRef = useRef<HTMLDivElement>(null);

              useEffect(() => {
                function handleClickOutside(event: MouseEvent) {
                  if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                  }
                }
                document.addEventListener("mousedown", handleClickOutside);
                return () => document.removeEventListener("mousedown", handleClickOutside);
              }, []);

              const selected = opcoesPagoCom.find((o) => o.value === field.value);
              const loadingOpts = isPaymentMethodsLoading;

              return (
                <FormItem>
                  <FormLabel>Pago com</FormLabel>
                  <div className="relative" ref={selectRef}>
                    <FormControl>
                      <button
                        type="button"
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setIsOpen(!isOpen)}
                        disabled={loadingOpts}
                      >
                        <span className={selected ? "" : "text-muted-foreground"}>
                          {selected ? selected.label : "Selecione conta, cartão ou forma"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    </FormControl>
                    {isOpen && (
                      <div
                        className={`relative top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border p-1 shadow-md ${
                          theme === "light" ? "bg-white border-gray-200" : "bg-popover border-gray-700"
                        } text-popover-foreground`}
                      >
                        {loadingOpts ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            {t("common.loading", "Carregando...")}
                          </div>
                        ) : opcoesPagoCom.length > 0 ? (
                          <>
                            {(["Contas", "Cartões", "Formas"] as const).map((group) => {
                              const items = opcoesPagoCom.filter((o) => o.group === group);
                              if (items.length === 0) return null;
                              return (
                                <div key={group}>
                                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {group}
                                  </div>
                                  {items.map((o) => (
                                    <div
                                      key={o.value}
                                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                      onClick={() => {
                                        field.onChange(o.value);
                                        setIsOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          field.value === o.value ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      <span>{o.label}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Nenhuma opção disponível
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

          {form.watch("tipo") === TransactionType.EXPENSE && (
            <FormField
              control={form.control}
              name="reembolsavel"
              render={({ field }) => (
                <FormItem className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                  <label className="flex cursor-pointer items-start gap-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="mt-1 h-4 w-4 rounded border-input accent-primary"
                      />
                    </FormControl>
                    <span>
                      <span className="block text-sm font-medium">Despesa reembolsável</span>
                      <span className="block text-xs text-muted-foreground">
                        Continua na fatura do cartão, mas vai para A Receber e não reduz seu saldo nem entra nos
                        relatórios de despesas.
                      </span>
                    </span>
                  </label>
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4" />}
              {transaction
                ? t("transactions.submit.update", "Salvar alterações")
                : t("transactions.submit.create", "Criar transação")}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
