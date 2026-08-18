import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, CheckCircle2, AlertTriangle, Clock, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ContaPagar {
  id: number;
  descricao: string;
  valor: string;
  data_vencimento: string;
  data_transacao: string;
  status: string;
  recorrente: boolean;
  classificacao_despesa: string | null;
  categoria: string;
  urgencia: string;
}

export default function ContasPagarPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("todas");

  const { data: contas = [], isLoading } = useQuery<ContaPagar[]>({
    queryKey: ["/api/contas-pagar", tab],
    queryFn: () => fetch(`/api/contas-pagar?status=${tab}`).then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("/api/transactions", { method: "POST", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contas-pagar"] });
      toast({ title: "Conta a pagar criada! 📋" });
      setShowForm(false);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const pagarMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/transactions/${id}/pagar`, { method: "PUT" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      qc.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Conta paga! ✅" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      descricao: fd.get("descricao"),
      valor: Number(fd.get("valor")),
      tipo: "Despesa",
      data_transacao: fd.get("data_vencimento"),
      data_vencimento: fd.get("data_vencimento"),
      status: "Pendente",
      recorrente: fd.get("recorrente") === "true",
      classificacao_despesa: fd.get("recorrente") === "true" ? "fixa" : "variavel",
      categoria_id: 1, // TODO: seletor de categoria
    });
  };

  const fmt = (n: string | number) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const urgenciaConfig: Record<string, { icon: any; color: string; label: string }> = {
    atrasada: { icon: AlertTriangle, color: "text-red-500", label: "Atrasada" },
    proxima: { icon: Clock, color: "text-amber-500", label: "Próxima" },
    futura: { icon: Calendar, color: "text-blue-500", label: "Futura" },
  };

  const totalPendente = contas.reduce((s, c) => s + Number(c.valor), 0);
  const atrasadas = contas.filter(c => c.urgencia === "atrasada");
  const proximas = contas.filter(c => c.urgencia === "proxima");
  const futuras = contas.filter(c => c.urgencia === "futura");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📋 Contas a Pagar</h1>
          <p className="text-muted-foreground">
            {contas.length} conta(s) pendente(s) — Total: {fmt(totalPendente)}
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-200 dark:border-red-900/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold text-red-600">{atrasadas.length}</p>
              <p className="text-sm text-muted-foreground">Atrasadas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-900/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-600">{proximas.length}</p>
              <p className="text-sm text-muted-foreground">Próximos 3 dias</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-900/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <Calendar className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-blue-600">{futuras.length}</p>
              <p className="text-sm text-muted-foreground">Futuras</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form nova conta */}
      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input name="descricao" placeholder="Descrição (ex: Aluguel, Internet)" required />
              <Input name="valor" type="number" step="0.01" placeholder="Valor (R$)" required />
              <Input name="data_vencimento" type="date" required />
              <Select name="recorrente" defaultValue="false">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">🔒 Fixa (todo mês)</SelectItem>
                  <SelectItem value="false">🔄 Pontual</SelectItem>
                </SelectContent>
              </Select>
              <div className="col-span-full flex justify-end">
                <Button type="submit" disabled={createMut.isPending}>Criar Conta</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de contas */}
      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : contas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-medium">Nenhuma conta pendente! 🎉</p>
            <p className="text-sm text-muted-foreground">Ou cadastre pelo WhatsApp: "tenho conta de R$200 vence dia 25"</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contas.map((conta) => {
            const config = urgenciaConfig[conta.urgencia] || urgenciaConfig.futura;
            const Icon = config.icon;
            const diasVencimento = Math.ceil(
              (new Date(conta.data_vencimento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );

            return (
              <Card key={conta.id} className={`${conta.urgencia === 'atrasada' ? 'border-red-300 dark:border-red-800' : ''}`}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${config.color}`} />
                    <div>
                      <p className="font-medium">{conta.descricao}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>Vence: {new Date(conta.data_vencimento).toLocaleDateString("pt-BR")}</span>
                        {conta.recorrente && <Badge variant="outline" className="text-[10px]">Fixa</Badge>}
                        {conta.categoria && <span>• {conta.categoria}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold">{fmt(conta.valor)}</p>
                      <p className={`text-xs ${config.color}`}>
                        {diasVencimento < 0 ? `${Math.abs(diasVencimento)} dias atrasada` :
                         diasVencimento === 0 ? "Vence HOJE" :
                         `em ${diasVencimento} dia(s)`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={conta.urgencia === "atrasada" ? "destructive" : "default"}
                      onClick={() => pagarMut.mutate(conta.id)}
                      disabled={pagarMut.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Pagar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
