import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PeriodoSelector from "@/components/shared/PeriodoSelector";
import { Periodo, rangeDoPeriodo, rotuloPeriodo } from "@/lib/period";
import { CheckCircle2, CreditCard, Edit, HandCoins, Search, X } from "lucide-react";

interface Reembolso {
  id: number;
  descricao: string;
  valor: string;
  data_transacao: string;
  data_vencimento: string | null;
  categoria: string | null;
  forma_pagamento: string | null;
}

const OPCOES_PERIODO: Periodo[] = ["all", "month", "custom"];

const fmt = (valor: string | number) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (data: string) =>
  new Date(`${data.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");

const dataRef = (r: Reembolso) => String(r.data_vencimento || r.data_transacao).slice(0, 10);

export default function ReembolsosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: reembolsos = [], isLoading } = useQuery<Reembolso[]>({
    queryKey: ["/api/reembolsos"],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/reembolsos"] });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/transactions") });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/cartoes") });
  };

  const receber = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/reembolsos/${id}/receber`, { method: "PUT" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Reembolso marcado como recebido! ✅" });
    },
    onError: (error: any) =>
      toast({ title: "Erro", description: error?.message || error?.error, variant: "destructive" }),
  });

  // Edição direta do lançamento
  const [editItem, setEditItem] = useState<Reembolso | null>(null);
  const [editForm, setEditForm] = useState({ descricao: "", valor: "", data: "" });
  const abrirEdicao = (r: Reembolso) => {
    setEditItem(r);
    setEditForm({
      descricao: r.descricao || "",
      valor: String(r.valor ?? ""),
      data: String(r.data_transacao || "").slice(0, 10),
    });
  };
  const salvarEdicao = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest(`/api/transactions/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      invalidate();
      setEditItem(null);
      toast({ title: "Lançamento atualizado" });
    },
    onError: (error: any) =>
      toast({ title: "Erro", description: error?.message || error?.error, variant: "destructive" }),
  });
  const submitEdicao = () => {
    if (!editItem) return;
    const valor = Number(String(editForm.valor).replace(",", "."));
    if (!editForm.descricao.trim() || !(valor > 0)) {
      toast({ title: "Informe descrição e valor válidos", variant: "destructive" });
      return;
    }
    salvarEdicao.mutate({
      id: editItem.id,
      data: { descricao: editForm.descricao.trim(), valor, data_transacao: editForm.data },
    });
  };

  // Filtros
  const [periodo, setPeriodo] = useState<Periodo>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = rangeDoPeriodo(periodo, customFrom, customTo);
  const periodoLabel = rotuloPeriodo(periodo, range.de, range.ate);

  const [busca, setBusca] = useState("");
  const [formaFiltro, setFormaFiltro] = useState("todas");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [ordem, setOrdem] = useState("data_desc");

  const formas = useMemo(
    () => Array.from(new Set(reembolsos.map((r) => r.forma_pagamento).filter(Boolean))) as string[],
    [reembolsos],
  );
  const categorias = useMemo(
    () => Array.from(new Set(reembolsos.map((r) => r.categoria).filter(Boolean))) as string[],
    [reembolsos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = reembolsos.filter((r) => {
      const d = dataRef(r);
      if (range.de && d < range.de) return false;
      if (range.ate && d > range.ate) return false;
      if (q && !r.descricao.toLowerCase().includes(q)) return false;
      if (formaFiltro !== "todas" && (r.forma_pagamento || "") !== formaFiltro) return false;
      if (categoriaFiltro !== "todas" && (r.categoria || "") !== categoriaFiltro) return false;
      return true;
    });
    lista.sort((a, b) => {
      if (ordem === "valor_desc") return Number(b.valor) - Number(a.valor);
      if (ordem === "valor_asc") return Number(a.valor) - Number(b.valor);
      if (ordem === "data_asc") return dataRef(a).localeCompare(dataRef(b));
      return dataRef(b).localeCompare(dataRef(a)); // data_desc (padrão)
    });
    return lista;
  }, [reembolsos, range.de, range.ate, busca, formaFiltro, categoriaFiltro, ordem]);

  // Subtotais por cartão/forma + total geral do período.
  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; itens: Reembolso[]; subtotal: number }>();
    for (const r of filtrados) {
      const nome = r.forma_pagamento || "Sem cartão";
      const g = map.get(nome) || { nome, itens: [], subtotal: 0 };
      g.itens.push(r);
      g.subtotal += Number(r.valor) || 0;
      map.set(nome, g);
    }
    return Array.from(map.values()).sort((a, b) => b.subtotal - a.subtotal);
  }, [filtrados]);

  const total = filtrados.reduce((soma, item) => soma + Number(item.valor), 0);
  const temFiltroExtra = busca.trim() !== "" || formaFiltro !== "todas" || categoriaFiltro !== "todas";
  const limpar = () => {
    setBusca("");
    setFormaFiltro("todas");
    setCategoriaFiltro("todas");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <HandCoins className="h-8 w-8" /> A Receber
        </h1>
        <p className="text-muted-foreground capitalize">{periodoLabel}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Estes valores continuam na fatura do cartão, mas não entram nas suas despesas nem no saldo a pagar.
        </p>
      </div>

      {/* Período */}
      <PeriodoSelector
        periodo={periodo}
        onPeriodoChange={setPeriodo}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        opcoes={OPCOES_PERIODO}
      />

      {/* Total do período */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-muted-foreground">
            {filtrados.length} lançamento(s) a receber no período
          </span>
          <span className="text-2xl font-numeric font-bold text-blue-600">{fmt(total)}</span>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          {/* Filtros extras */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative md:max-w-xs md:flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={formaFiltro} onValueChange={setFormaFiltro}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="Cartão/forma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os cartões</SelectItem>
                {formas.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ordem} onValueChange={setOrdem}>
              <SelectTrigger className="md:w-44">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data_desc">Mais recentes</SelectItem>
                <SelectItem value="data_asc">Mais antigos</SelectItem>
                <SelectItem value="valor_desc">Maior valor</SelectItem>
                <SelectItem value="valor_asc">Menor valor</SelectItem>
              </SelectContent>
            </Select>
            {temFiltroExtra && (
              <Button variant="ghost" size="sm" onClick={limpar}>
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                Nenhum reembolso a receber neste período/filtro.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {grupos.map((g) => (
                <div key={g.nome} className="space-y-3">
                  {/* Cabeçalho do grupo com subtotal */}
                  <div className="flex items-center justify-between border-b border-border/60 pb-1">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{g.nome}</span>
                      <Badge variant="outline">{g.itens.length}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Subtotal: <b className="text-blue-600">{fmt(g.subtotal)}</b>
                    </span>
                  </div>

                  {g.itens.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                          <CreditCard className="h-5 w-5 mt-1 text-blue-500" />
                          <div>
                            <p className="font-medium">{item.descricao}</p>
                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{fmtData(item.data_vencimento || item.data_transacao)}</span>
                              {item.categoria && <span>• {item.categoria}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 md:justify-end">
                          <p className="font-bold text-blue-600">{fmt(item.valor)}</p>
                          <Button size="sm" variant="outline" onClick={() => abrirEdicao(item)}>
                            <Edit className="h-4 w-4 mr-1" /> Editar
                          </Button>
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
              ))}
            </div>
          )}
        </>
      )}

      {/* Dialog: editar lançamento */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input
                value={editForm.descricao}
                onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.valor}
                  onChange={(e) => setEditForm({ ...editForm, valor: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={editForm.data}
                  onChange={(e) => setEditForm({ ...editForm, data: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Continua como valor a receber no mesmo cartão. Para mudar o cartão/fatura, use a tela de Cartões de Crédito.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={submitEdicao} disabled={salvarEdicao.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
