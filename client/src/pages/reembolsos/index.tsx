import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, CreditCard, HandCoins } from "lucide-react";

interface Reembolso {
  id: number;
  descricao: string;
  valor: string;
  data_transacao: string;
  data_vencimento: string | null;
  categoria: string | null;
  forma_pagamento: string | null;
}

const fmt = (valor: string | number) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (data: string) =>
  new Date(`${data.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");

export default function ReembolsosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: reembolsos = [], isLoading } = useQuery<Reembolso[]>({
    queryKey: ["/api/reembolsos"],
  });

  const receber = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/reembolsos/${id}/receber`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reembolsos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Reembolso marcado como recebido! ✅" });
    },
    onError: (error: any) =>
      toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const total = reembolsos.reduce((soma, item) => soma + Number(item.valor), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <HandCoins className="h-8 w-8" /> A Receber
        </h1>
        <p className="text-muted-foreground">
          {reembolsos.length} reembolso(s) pendente(s) — Total: {fmt(total)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Estes valores continuam na fatura do cartão, mas não entram nas suas despesas nem no saldo a pagar.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : reembolsos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-medium">Nenhum reembolso pendente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reembolsos.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <CreditCard className="h-5 w-5 mt-1 text-blue-500" />
                  <div>
                    <p className="font-medium">{item.descricao}</p>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{fmtData(item.data_vencimento || item.data_transacao)}</span>
                      {item.forma_pagamento && <Badge variant="outline">{item.forma_pagamento}</Badge>}
                      {item.categoria && <span>• {item.categoria}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 md:justify-end">
                  <p className="font-bold text-blue-600">{fmt(item.valor)}</p>
                  <Button
                    size="sm"
                    onClick={() => receber.mutate(item.id)}
                    disabled={receber.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Recebido
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
