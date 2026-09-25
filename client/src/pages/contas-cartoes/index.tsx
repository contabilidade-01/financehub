import { useMemo, useState } from "react";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PeriodoSelector from "@/components/shared/PeriodoSelector";
import { Periodo, rangeDoPeriodo, rotuloPeriodo } from "@/lib/period";
import { CreditCard, Edit, Landmark, Plus, Trash2, Wallet } from "lucide-react";

type Conta = {
  id: number;
  nome: string;
  banco: string;
  tipo: string;
  cor: string | null;
  saldo: number;
  saldo_inicial?: number | string;
  ativo?: boolean;
  entradas?: number;
  saidas?: number;
  qtd_lancamentos?: number;
};

type Lancamento = {
  id: number;
  descricao: string;
  valor: number | string;
  tipo: string;
  data_transacao: string;
  status?: string;
  categoria?: string | null;
  forma_pagamento?: string | null;
  parcela_num?: number | null;
  parcela_total?: number | null;
};

type DetalheAberto = { id: number; nome: string } | null;

const OPCOES_PERIODO: Periodo[] = ["current_month", "last_month", "next_month", "custom"];

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const dataBR = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

const tipoLabel = (tipo: string) => {
  if (tipo === "poupanca") return "POUPANÇA";
  if (tipo === "carteira") return "CARTEIRA";
  return "CORRENTE";
};

const emptyConta = { nome: "", tipo: "corrente", banco: "", saldo_inicial: "0", cor: "#3B82F6" };

export default function ContasCartoesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [periodo, setPeriodo] = useState<Periodo>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = rangeDoPeriodo(periodo, customFrom, customTo);
  const periodoPronto = periodo !== "custom" || Boolean(range.de && range.ate);
  const periodoLabel = rotuloPeriodo(periodo, range.de, range.ate);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (range.de) p.set("de", range.de);
    if (range.ate) p.set("ate", range.ate);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [range.de, range.ate]);

  const [contaOpen, setContaOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<Conta | null>(null);
  const [contaForm, setContaForm] = useState(emptyConta);
  const [detalhe, setDetalhe] = useState<DetalheAberto>(null);

  const { data: contas = [], isLoading: loadingContas } = useQuery<Conta[]>({
    queryKey: [`/api/contas${qs}`],
    enabled: periodoPronto,
  });

  const detalheUrl = detalhe ? `/api/contas/${detalhe.id}/lancamentos${qs}` : null;

  const { data: detalheData, isLoading: loadingDetalhe } = useQuery<{
    saldo?: number;
    entradas?: number;
    saidas?: number;
    lancamentos: Lancamento[];
  }>({
    queryKey: [detalheUrl || "/api/noop"],
    enabled: !!detalheUrl && periodoPronto,
  });

  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo !== false), [contas]);
  const confirmar = useConfirm();

  const invalidate = () => {
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/contas") });
    qc.invalidateQueries({ queryKey: ["/api/vencimentos"] });
    qc.invalidateQueries({ queryKey: ["/api/wallet/current"] });
  };

  const createConta = useMutation({
    mutationFn: (data: any) => apiRequest("/api/contas", { method: "POST", data }),
    onSuccess: () => {
      invalidate();
      setContaOpen(false);
      setContaForm(emptyConta);
      toast({ title: "Conta criada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const updateConta = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest(`/api/contas/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      invalidate();
      setContaOpen(false);
      setEditingConta(null);
      setContaForm(emptyConta);
      toast({ title: "Conta atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const deleteConta = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/contas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Conta removida" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const openNewConta = () => {
    setEditingConta(null);
    setContaForm(emptyConta);
    setContaOpen(true);
  };

  const openEditConta = (c: Conta) => {
    setEditingConta(c);
    setContaForm({
      nome: c.nome || "",
      tipo: c.tipo || "corrente",
      banco: c.banco || "",
      saldo_inicial: String(c.saldo_inicial ?? 0),
      cor: c.cor || "#3B82F6",
    });
    setContaOpen(true);
  };

  const submitConta = () => {
    if (!contaForm.nome.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    const data = {
      nome: contaForm.nome.trim(),
      tipo: contaForm.tipo || "corrente",
      banco: contaForm.banco.trim() || undefined,
      saldo_inicial: Number(contaForm.saldo_inicial) || 0,
      cor: contaForm.cor || null,
    };
    if (editingConta) updateConta.mutate({ id: editingConta.id, data });
    else createConta.mutate(data);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="text-muted-foreground">
            Suas contas correntes e meios de pagamento · toque no saldo para ver os lançamentos.
            Cartões de crédito ficam em <b>Cartões de Crédito</b>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openNewConta}>
            <Plus className="h-4 w-4 mr-2" /> Nova conta
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <PeriodoSelector
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          opcoes={OPCOES_PERIODO}
        />
        <p className="text-sm text-muted-foreground capitalize">{periodoLabel}</p>
      </div>

      {/* Contas */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Contas</h2>
        </div>
        {!periodoPronto || loadingContas ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-lg" />
            ))}
          </div>
        ) : contasAtivas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma conta cadastrada. Crie a primeira para acompanhar saldos.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {contasAtivas.map((c) => {
              const cor = c.cor || "#3B82F6";
              const saldo = Number(c.saldo) || 0;
              return (
                <Card key={c.id} className="overflow-hidden">
                  <div
                    className="h-2 w-full"
                    style={{ background: `linear-gradient(90deg, ${cor}, ${cor}88)` }}
                  />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-label tracking-wide text-muted-foreground">
                          {tipoLabel(c.tipo)}
                        </p>
                        <CardTitle className="text-lg">{c.nome}</CardTitle>
                        {c.banco && c.banco !== c.nome && (
                          <p className="text-sm text-muted-foreground">{c.banco}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditConta(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (await confirmar({ title: "Remover esta conta?", confirmText: "Remover", destructive: true })) deleteConta.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg -mx-1 px-1 py-1 hover:bg-muted/50 transition-colors"
                      onClick={() => setDetalhe({ id: c.id, nome: c.nome })}
                    >
                      <p className="text-xs text-muted-foreground mb-1">Saldo do período</p>
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <span
                          className={`text-2xl font-numeric font-semibold ${
                            saldo < 0 ? "text-expense" : "text-foreground"
                          }`}
                        >
                          {money(saldo)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.qtd_lancamentos ?? 0} lançamento{(c.qtd_lancamentos ?? 0) === 1 ? "" : "s"} · ver detalhes
                      </p>
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Atalho para cartões de crédito */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Cartões de crédito</p>
              <p className="text-sm text-muted-foreground">
                Faturas, limites e lançamentos dos cartões ficam em uma tela dedicada.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/cartoes")}>
            Abrir Cartões de Crédito
          </Button>
        </CardContent>
      </Card>

      {/* Detalhe dos lançamentos da conta no período */}
      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Conta · {detalhe?.nome}</DialogTitle>
            <p className="text-sm text-muted-foreground capitalize">{periodoLabel}</p>
          </DialogHeader>
          {loadingDetalhe ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 px-3 py-2 mb-2">
                <p className="text-xs text-muted-foreground">Saldo do período</p>
                <p
                  className={`text-xl font-numeric font-semibold ${
                    Number(detalheData?.saldo ?? 0) < 0 ? "text-expense" : ""
                  }`}
                >
                  {money(Number(detalheData?.saldo ?? 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Entradas {money(Number(detalheData?.entradas) || 0)} · Saídas{" "}
                  {money(Number(detalheData?.saidas) || 0)}
                </p>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
                {(detalheData?.lancamentos || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum lançamento neste período.
                  </p>
                ) : (
                  (detalheData?.lancamentos || []).map((l) => {
                    const valor = Number(l.valor) || 0;
                    const receita = l.tipo === "Receita";
                    const parcela =
                      l.parcela_num && l.parcela_total ? ` (${l.parcela_num}/${l.parcela_total})` : "";
                    return (
                      <div
                        key={l.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {l.descricao}
                            {parcela}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dataBR(l.data_transacao)}
                            {l.categoria ? ` · ${l.categoria}` : ""}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-numeric font-semibold shrink-0 ${
                            receita ? "text-income" : "text-expense"
                          }`}
                        >
                          {receita ? "+" : "−"}
                          {money(Math.abs(valor))}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalhe(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conta */}
      <Dialog open={contaOpen} onOpenChange={setContaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingConta ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={contaForm.nome}
                onChange={(e) => setContaForm({ ...contaForm, nome: e.target.value })}
                placeholder="Ex.: Conta Nubank"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={contaForm.tipo}
                  onValueChange={(v) => setContaForm({ ...contaForm, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="carteira">Carteira</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <Input
                  type="color"
                  value={contaForm.cor}
                  onChange={(e) => setContaForm({ ...contaForm, cor: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input
                value={contaForm.banco}
                onChange={(e) => setContaForm({ ...contaForm, banco: e.target.value })}
                placeholder="Ex.: Itaú, Inter"
              />
            </div>
            {!editingConta && (
              <div className="space-y-1.5">
                <Label>Saldo inicial</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={contaForm.saldo_inicial}
                  onChange={(e) => setContaForm({ ...contaForm, saldo_inicial: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitConta} disabled={createConta.isPending || updateConta.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
