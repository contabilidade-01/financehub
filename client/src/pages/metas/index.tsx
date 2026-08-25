import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Target, PiggyBank, Shield, TrendingUp, Trash2, Pencil } from "lucide-react";
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

// Rótulos por ambiente: PF fala de sonhos/caixinha; PJ fala de reservas/metas
// do negócio. O valor interno do "tipo" é o mesmo — só a linguagem muda.
const tipoLabelsPF: Record<string, string> = {
  caixinha: "Caixinha",
  sonho: "Sonho",
  reserva: "Reserva de Emergência",
  limite_categoria: "Limite por Categoria",
};

const tipoLabelsPJ: Record<string, string> = {
  caixinha: "Reserva de Caixa",
  sonho: "Meta de Investimento",
  reserva: "Capital de Giro / Emergência",
  limite_categoria: "Limite de Despesa",
};

type Variant = "pf" | "pj";

const copyByVariant = {
  pf: {
    titulo: "🎯 Metas e Sonhos",
    subtitulo: "Organize seus objetivos financeiros",
    placeholderNome: "Nome da meta (ex: Viagem Europa)",
    opcoes: [
      { value: "caixinha", label: "🐷 Caixinha" },
      { value: "sonho", label: "🎯 Sonho" },
      { value: "reserva", label: "🛡️ Reserva de Emergência" },
      { value: "limite_categoria", label: "📊 Limite por Categoria" },
    ],
    vazioDica: 'Crie pelo app ou mande no WhatsApp: "quero guardar R$500/mês pra viagem"',
    labels: tipoLabelsPF,
  },
  pj: {
    titulo: "🎯 Metas da Empresa",
    subtitulo: "Objetivos financeiros do seu negócio",
    placeholderNome: "Nome da meta (ex: Capital de giro, Reforma da loja)",
    opcoes: [
      { value: "caixinha", label: "🐷 Reserva de Caixa" },
      { value: "sonho", label: "🎯 Meta de Investimento" },
      { value: "reserva", label: "🛡️ Capital de Giro / Emergência" },
      { value: "limite_categoria", label: "📊 Limite de Despesa" },
    ],
    vazioDica: 'Crie pelo app ou mande no WhatsApp: "quero reservar R$2.000/mês pro 13º"',
    labels: tipoLabelsPJ,
  },
} as const;

const tipoColors: Record<string, string> = {
  caixinha: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  sonho: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  reserva: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  limite_categoria: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export default function MetasPage({ variant = "pf", empresaId }: { variant?: Variant; empresaId?: number }) {
  const copy = copyByVariant[variant];
  const tipoLabels = copy.labels;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [depositMeta, setDepositMeta] = useState<Meta | null>(null);
  const [depositValue, setDepositValue] = useState("");
  const [editMeta, setEditMeta] = useState<Meta | null>(null);
  const [toDelete, setToDelete] = useState<Meta | null>(null);
  // Tipo selecionado no form (para mostrar o seletor de conta no limite PJ).
  const [formTipo, setFormTipo] = useState<string>("caixinha");

  const { data: metas = [], isLoading } = useQuery<Meta[]>({
    queryKey: ["/api/metas"],
  });

  // Plano de contas PJ (só no ambiente PJ) — para vincular o limite de despesa
  // a uma conta específica. Filtra as contas de Despesa.
  const { data: contasPJ = [] } = useQuery<any[]>({
    queryKey: [`/api/empresas/${empresaId}/contas`],
    queryFn: () => apiRequest(`/api/empresas/${empresaId}/contas`),
    enabled: variant === "pj" && !!empresaId,
  });
  const contasDespesa = contasPJ.filter((c: any) => c.tipo === "Despesa");

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

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/metas/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/metas"] });
      toast({ title: "Meta atualizada! ✏️" });
      setEditMeta(null);
    },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/metas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/metas"] });
      toast({ title: "Meta removida." });
      setToDelete(null);
    },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err.message, variant: "destructive" }),
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editMeta) return;
    const fd = new FormData(e.currentTarget);
    updateMut.mutate({
      id: editMeta.id,
      data: {
        titulo: fd.get("titulo"),
        valor_alvo: Number(fd.get("valor_alvo")),
        prazo: fd.get("prazo") || null,
        recorrencia: fd.get("recorrencia") || null,
        valor_recorrencia: fd.get("valor_recorrencia") ? Number(fd.get("valor_recorrencia")) : null,
      },
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const contaId = fd.get("conta_id");
    createMut.mutate({
      titulo: fd.get("titulo"),
      tipo: fd.get("tipo"),
      valor_alvo: Number(fd.get("valor_alvo")),
      prazo: fd.get("prazo") || null,
      recorrencia: fd.get("recorrencia") || null,
      valor_recorrencia: fd.get("valor_recorrencia") ? Number(fd.get("valor_recorrencia")) : null,
      // Limite de despesa PJ: conta do plano de contas (opcional; null = total).
      conta_id: contaId ? Number(contaId) : null,
    });
  };

  const fmt = (n: string | number) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.titulo}</h1>
          <p className="text-muted-foreground">{copy.subtitulo}</p>
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
              <Input name="titulo" placeholder={copy.placeholderNome} required />
              <Select name="tipo" defaultValue="caixinha" onValueChange={setFormTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {copy.opcoes.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Limite de despesa PJ: escolher a conta do plano de contas (ou o total). */}
              {variant === "pj" && formTipo === "limite_categoria" && (
                <Select name="conta_id">
                  <SelectTrigger><SelectValue placeholder="Conta do limite (padrão: total de despesas)" /></SelectTrigger>
                  <SelectContent>
                    {contasDespesa.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.codigo} — {c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
            <p className="text-sm text-muted-foreground">{copy.vazioDica}</p>
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
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditMeta(meta)} title="Editar">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(meta)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
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

      {/* Dialog editar meta */}
      <Dialog open={!!editMeta} onOpenChange={(o) => !o && setEditMeta(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar meta</DialogTitle></DialogHeader>
          {editMeta && (
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <Input name="titulo" defaultValue={editMeta.titulo} placeholder="Nome da meta" required />
              <Input name="valor_alvo" type="number" step="0.01" defaultValue={editMeta.valor_alvo} placeholder="Valor alvo (R$)" required />
              <Input name="prazo" type="date" defaultValue={editMeta.prazo ? String(editMeta.prazo).slice(0, 10) : ""} />
              <Select name="recorrencia" defaultValue={editMeta.recorrencia || undefined}>
                <SelectTrigger><SelectValue placeholder="Recorrência (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="diario">Diário</SelectItem>
                </SelectContent>
              </Select>
              <Input name="valor_recorrencia" type="number" step="0.01" defaultValue={editMeta.valor_recorrencia || ""} placeholder="Guardar por período (R$)" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditMeta(null)}>Cancelar</Button>
                <Button type="submit" disabled={updateMut.isPending}>{updateMut.isPending ? "Salvando…" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>
              A meta <strong>{toDelete?.titulo}</strong> será removida. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => toDelete && deleteMut.mutate(toDelete.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
