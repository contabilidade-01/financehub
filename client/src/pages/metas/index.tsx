import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Target, PiggyBank, Shield, TrendingUp, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Meta {
  id: number;
  titulo: string;
  tipo: string;
  valor_alvo: string;
  valor_atual: string;
  prazo: string | null;
  recorrencia: string | null;
  valor_recorrencia: string | null;
  ativo: boolean;
  progresso_pct: number;
  falta: number;
  meses_restantes: number | null;
}

const tipoIcons: Record<string, any> = {
  caixinha: PiggyBank,
  sonho: Target,
  reserva: Shield,
  limite_categoria: TrendingUp,
};

const tipoLabels: Record<string, string> = {
  caixinha: "Caixinha",
  sonho: "Sonho",
  reserva: "Reserva de Emergência",
  limite_categoria: "Limite por Categoria",
};

const tipoColors: Record<string, string> = {
  caixinha: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  sonho: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  reserva: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  limite_categoria: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export default function MetasPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [depositMeta, setDepositMeta] = useState<Meta | null>(null);
  const [depositValue, setDepositValue] = useState("");

  const { data: metas = [], isLoading } = useQuery<Meta[]>({
    queryKey: ["/api/metas"],
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("/api/metas", { method: "POST", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/metas"] });
      toast({ title: "Meta criada com sucesso! 🎯" });
      setShowForm(false);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const depositMut = useMutation({
    mutationFn: ({ id, valor }: { id: number; valor: number }) =>
      apiRequest(`/api/metas/${id}/depositar`, { method: "POST", data: { valor } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/metas"] });
      toast({ title: "Depósito realizado! 💰" });
      setDepositMeta(null);
      setDepositValue("");
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/metas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/metas"] });
      toast({ title: "Meta removida." });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      titulo: fd.get("titulo"),
      tipo: fd.get("tipo"),
      valor_alvo: Number(fd.get("valor_alvo")),
      prazo: fd.get("prazo") || null,
      recorrencia: fd.get("recorrencia") || null,
      valor_recorrencia: fd.get("valor_recorrencia") ? Number(fd.get("valor_recorrencia")) : null,
    });
  };

  const fmt = (n: string | number) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">🎯 Metas e Sonhos</h1>
          <p className="text-muted-foreground">Organize seus objetivos financeiros</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Meta
        </Button>
      </div>

      {/* Form nova meta */}
      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input name="titulo" placeholder="Nome da meta (ex: Viagem Europa)" required />
              <Select name="tipo" defaultValue="caixinha">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caixinha">🐷 Caixinha</SelectItem>
                  <SelectItem value="sonho">🎯 Sonho</SelectItem>
                  <SelectItem value="reserva">🛡️ Reserva de Emergência</SelectItem>
                  <SelectItem value="limite_categoria">📊 Limite por Categoria</SelectItem>
                </SelectContent>
              </Select>
              <Input name="valor_alvo" type="number" step="0.01" placeholder="Valor alvo (R$)" required />
              <Input name="prazo" type="date" placeholder="Prazo (opcional)" />
              <Select name="recorrencia">
                <SelectTrigger><SelectValue placeholder="Recorrência (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="diario">Diário</SelectItem>
                </SelectContent>
              </Select>
              <Input name="valor_recorrencia" type="number" step="0.01" placeholder="Guardar por período (R$)" />
              <div className="col-span-full flex justify-end">
                <Button type="submit" disabled={createMut.isPending}>Criar Meta</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de metas */}
      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : metas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Target className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma meta criada ainda.</p>
            <p className="text-sm text-muted-foreground">Crie pelo app ou mande no WhatsApp: "quero guardar R$500/mês pra viagem"</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {metas.map((meta) => {
            const Icon = tipoIcons[meta.tipo] || Target;
            return (
              <Card key={meta.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{meta.titulo}</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(meta.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <Badge className={`w-fit ${tipoColors[meta.tipo] || ''}`}>
                    {tipoLabels[meta.tipo] || meta.tipo}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>{fmt(meta.valor_atual)} / {fmt(meta.valor_alvo)}</span>
                    <span className="font-bold">{meta.progresso_pct}%</span>
                  </div>
                  <Progress value={meta.progresso_pct} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Falta: {fmt(meta.falta)}</span>
                    {meta.meses_restantes && <span>~{meta.meses_restantes} meses</span>}
                  </div>
                  {meta.prazo && (
                    <p className="text-xs text-muted-foreground">🗓 Prazo: {new Date(meta.prazo).toLocaleDateString("pt-BR")}</p>
                  )}
                  {meta.recorrencia && meta.valor_recorrencia && (
                    <p className="text-xs text-muted-foreground">💸 Guardando {fmt(meta.valor_recorrencia)}/{meta.recorrencia}</p>
                  )}
                  <Button size="sm" className="w-full" onClick={() => setDepositMeta(meta)}>
                    💰 Depositar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog depositar */}
      <Dialog open={!!depositMeta} onOpenChange={() => setDepositMeta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Depositar em: {depositMeta?.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Atual: {depositMeta && fmt(depositMeta.valor_atual)} / {depositMeta && fmt(depositMeta.valor_alvo)}
            </p>
            <Input
              type="number"
              step="0.01"
              placeholder="Valor a depositar (R$)"
              value={depositValue}
              onChange={(e) => setDepositValue(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={!depositValue || depositMut.isPending}
              onClick={() => depositMeta && depositMut.mutate({ id: depositMeta.id, valor: Number(depositValue) })}
            >
              Confirmar Depósito
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
