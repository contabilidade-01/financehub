import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, CreditCard, Banknote, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPaymentMethodSchema, type PaymentMethod } from "@shared/schema";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/contexts/LocalizationContext";
import { translatePaymentMethodName } from "@/utils/localization";

const createFormSchema = (t: (key: string, fallback: string) => string) => insertPaymentMethodSchema.extend({
  nome: z.string().min(1, t('validation.name_required', 'Name is required')),
  descricao: z.string().optional(),
  icone: z.string().optional(),
  cor: z.string().optional()
});

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

const getPaymentMethodIcon = (nome: string, icone?: string) => {
  if (icone) return icone;
  
  const lowerName = nome.toLowerCase();
  if (lowerName.includes('cartão') || lowerName.includes('credit')) return 'CreditCard';
  if (lowerName.includes('pix')) return 'Smartphone';
  if (lowerName.includes('dinheiro') || lowerName.includes('cash')) return 'Banknote';
  return 'CreditCard';
};

const IconComponent = ({ iconName, className }: { iconName: string; className?: string }) => {
  switch (iconName) {
    case 'CreditCard':
      return <CreditCard className={className} />;
    case 'Smartphone':
      return <Smartphone className={className} />;
    case 'Banknote':
      return <Banknote className={className} />;
    default:
      return <CreditCard className={className} />;
  }
};

export default function PaymentMethodsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const formSchema = createFormSchema(t);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      descricao: "",
      icone: "",
      cor: "#3B82F6"
    }
  });

  const { data: paymentMethods = [], isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  const { data: paymentMethodTotals = [], isLoading: isTotalsLoading, isFetching: isTotalsFetching } = useQuery<{ paymentMethodId: number; total: number; incomeTotal: number; expenseTotal: number }[]>({
    queryKey: ["/api/payment-methods/totals"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: false
  });

  const getTotalsForPaymentMethod = (paymentMethodId: number) => {
    const totals = paymentMethodTotals.find(t => t.paymentMethodId === paymentMethodId);
    return {
      total: totals?.total || 0,
      incomeTotal: totals?.incomeTotal || 0,
      expenseTotal: totals?.expenseTotal || 0
    };
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("/api/payment-methods", { method: "POST", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Sucesso",
        description: "Forma de pagamento criada com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar forma de pagamento",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormData> }) => 
      apiRequest(`/api/payment-methods/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      setIsDialogOpen(false);
      setEditingMethod(null);
      form.reset();
      toast({
        title: "Sucesso",
        description: "Forma de pagamento atualizada com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar forma de pagamento",
        variant: "destructive",
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/payment-methods/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      toast({
        title: "Sucesso",
        description: "Forma de pagamento deletada com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao deletar forma de pagamento",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (data: FormData) => {
    if (editingMethod) {
      updateMutation.mutate({ id: editingMethod.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (method: PaymentMethod) => {
    if (method.global) {
      toast({
        title: "Não é possível editar",
        description: "Formas de pagamento globais não podem ser editadas",
        variant: "destructive",
      });
      return;
    }
    
    setEditingMethod(method);
    form.reset({
      nome: method.nome,
      descricao: method.descricao || "",
      icone: method.icone || "",
      cor: method.cor || "#3B82F6"
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (method: PaymentMethod) => {
    if (method.global) {
      toast({
        title: "Não é possível deletar",
        description: "Formas de pagamento globais não podem ser deletadas",
        variant: "destructive",
      });
      return;
    }

    if (confirm("Tem certeza que deseja deletar esta forma de pagamento?")) {
      deleteMutation.mutate(method.id);
    }
  };

  const handleNewPaymentMethod = () => {
    setEditingMethod(null);
    form.reset({
      nome: "",
      descricao: "",
      icone: "",
      cor: "#3B82F6"
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-48" />
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div>
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-3" />
                <div className="border-t pt-3 mt-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t('payment_methods.title', 'Formas de Pagamento')}</h1>
          <p className="text-muted-foreground">
            {t('payment_methods.subtitle', 'Gerencie suas formas de pagamento personalizadas')}
          </p>
        </div>
        <div className="w-full md:w-auto flex md:block justify-end">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
              <Button onClick={handleNewPaymentMethod} className="w-full md:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              {t('payment_methods.new_method', 'New Payment Method')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMethod ? t('payment_methods.edit_method', 'Edit Payment Method') : t('payment_methods.new_method', 'New Payment Method')}
              </DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.name', 'Name')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('payment_methods.form.name_placeholder', 'Ex: Debit Card')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.description', 'Description')}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder={t('payment_methods.form.description_placeholder', 'Optional payment method description')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="icone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.icon', 'Ícone')}</FormLabel>
                        <FormControl>
                          <Input placeholder="CreditCard, Smartphone, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="cor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.color', 'Cor')}</FormLabel>
                        <FormControl>
                          <Input type="color" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingMethod ? t('common.update', 'Update') : t('common.create', 'Create')}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paymentMethods.map((method) => (
          <Card key={method.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: method.cor || "#3B82F6" }}
                  >
                    <IconComponent 
                      iconName={getPaymentMethodIcon(method.nome, method.icone || undefined)}
                      className="h-4 w-4 text-white"
                    />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{translatePaymentMethodName(method.nome, t)}</CardTitle>
                    {method.global && (
                      <Badge variant="secondary" className="text-xs">
                        {t('common.global', 'Global')}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {!method.global && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(method)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(method)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            
            <CardContent className={method.descricao ? "" : "pt-0"}>
              {method.descricao && (
                <p className="text-sm text-muted-foreground mb-3">
                  {method.descricao}
                </p>
              )}
              <div className="border-t pt-3 mt-3">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground mb-2">{t('payment_methods.total_accumulated', 'Total Accumulated')}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('common.income_label', 'Income:')}</span>
                    {isTotalsFetching ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      <span className="text-sm font-medium text-green-600">
                        {formatCurrency(getTotalsForPaymentMethod(method.id).incomeTotal)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('common.expenses_label', 'Expenses:')}</span>
                    {isTotalsFetching ? (
                      <Skeleton className="h-4 w-20" />
                    ) : (
                      <span className="text-sm font-medium text-red-600">
                        {formatCurrency(getTotalsForPaymentMethod(method.id).expenseTotal)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {paymentMethods.length === 0 && (
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{t('payment_methods.no_methods', 'No payment methods found')}</h3>
          <p className="text-muted-foreground mb-4">
            {t('payment_methods.create_first', 'Create your first custom payment method')}
          </p>
          <Button onClick={handleNewPaymentMethod}>
            <Plus className="h-4 w-4 mr-2" />
            {t('payment_methods.new_method', 'New Payment Method')}
          </Button>
        </div>
      )}
    </div>
  );
}