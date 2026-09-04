import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  CreditCard,
  Edit,
  Landmark,
  Plus,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";

type Conta = {
  id: number;
  nome: string;
  banco: string;
  tipo: string;
  cor: string | null;
  saldo: number;
  saldo_inicial?: number | string;
  ativo?: boolean;
};

type FaturaRecente = {
  id: number;
  competencia: string;
  data_vencimento: string;
  status: string;
  total: number;
};

type Cartao = {
  id: number;
  nome: string;
  bandeira: string | null;
  cor: string | null;
  limite: number | string | null;
  usado: number;
  disponivel: number;
  percentual: number;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  faturas_recentes?: FaturaRecente[];
};

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const hasLimite = (limite: number | string | null | undefined) =>
  limite != null && limite !== "" && Number(limite) > 0;

const tipoLabel = (tipo: string) => {
  if (tipo === "poupanca") return "POUPANÇA";
  if (tipo === "carteira") return "CARTEIRA";
  return "CORRENTE";
};

const statusBadge = (s: string) => {
  if (s === "paga") return { t: "Paga", c: "bg-emerald-500/15 text-emerald-600" };
  if (s === "fechada") return { t: "Fechada", c: "bg-amber-500/15 text-amber-600" };
  return { t: "Aberta", c: "bg-blue-500/15 text-blue-600" };
};

const emptyConta = { nome: "", tipo: "corrente", banco: "", saldo_inicial: "0", cor: "#3B82F6" };
const emptyCartao = {
  nome: "",
  banco: "",
  limite: "",
  dia_fechamento: "",
  dia_vencimento: "",
  cor: "#6366F1",
};

export default function ContasCartoesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [contaOpen, setContaOpen] = useState(false);
  const [cartaoOpen, setCartaoOpen] = useState(false);
  const [editingConta, setEditingConta] = useState<Conta | null>(null);
  const [editingCartao, setEditingCartao] = useState<Cartao | null>(null);
  const [contaForm, setContaForm] = useState(emptyConta);
  const [cartaoForm, setCartaoForm] = useState(emptyCartao);

  const [pagarOpen, setPagarOpen] = useState<{ fatura: FaturaRecente; cartaoNome: string } | null>(null);
  const [contaPagamentoId, setContaPagamentoId] = useState<string>("");

  const { data: contas = [], isLoading: loadingContas } = useQuery<Conta[]>({
    queryKey: ["/api/contas"],
  });

  const { data: cartoes = [], isLoading: loadingCartoes } = useQuery<Cartao[]>({
    queryKey: ["/api/cartoes"],
  });

  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo !== false), [contas]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/contas"] });
    qc.invalidateQueries({ queryKey: ["/api/cartoes"] });
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

  const createCartao = useMutation({
    mutationFn: (data: any) => apiRequest("/api/cartoes", { method: "POST", data }),
    onSuccess: () => {
      invalidate();
      setCartaoOpen(false);
      setCartaoForm(emptyCartao);
      toast({ title: "Cartão criado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const updateCartao = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest(`/api/cartoes/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      invalidate();
      setCartaoOpen(false);
      setEditingCartao(null);
      setCartaoForm(emptyCartao);
      toast({ title: "Cartão atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const deleteCartao = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cartoes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Cartão removido" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const pagarFatura = useMutation({
    mutationFn: ({ id, conta_bancaria_id }: { id: number; conta_bancaria_id: number }) =>
      apiRequest(`/api/faturas/${id}/pagar`, { method: "POST", data: { conta_bancaria_id } }),
    onSuccess: () => {
      invalidate();
      setPagarOpen(null);
      setContaPagamentoId("");
      toast({ title: "Fatura paga" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const reabrirFatura = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/faturas/${id}/reabrir`, { method: "POST", data: {} }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Fatura reaberta" });
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

  const openNewCartao = () => {
    setEditingCartao(null);
    setCartaoForm(emptyCartao);
    setCartaoOpen(true);
  };

  const openEditCartao = (c: Cartao) => {
    setEditingCartao(c);
    setCartaoForm({
      nome: c.nome || "",
      banco: c.bandeira || "",
      limite: hasLimite(c.limite) ? String(c.limite) : "",
      dia_fechamento: c.dia_fechamento != null ? String(c.dia_fechamento) : "",
      dia_vencimento: c.dia_vencimento != null ? String(c.dia_vencimento) : "",
      cor: c.cor || "#6366F1",
    });
    setCartaoOpen(true);
  };

  const submitCartao = () => {
    const fech = Number(cartaoForm.dia_fechamento);
    const venc = Number(cartaoForm.dia_vencimento);
    if (!cartaoForm.nome.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    if (!(fech >= 1 && fech <= 31) || !(venc >= 1 && venc <= 31)) {
      toast({ title: "Dias de fechamento/vencimento devem ser 1–31", variant: "destructive" });
      return;
    }
    const data = {
      nome: cartaoForm.nome.trim(),
      banco: cartaoForm.banco.trim() || null,
      bandeira: cartaoForm.banco.trim() || null,
      limite: cartaoForm.limite !== "" ? Number(cartaoForm.limite) : null,
      dia_fechamento: fech,
      dia_vencimento: venc,
      cor: cartaoForm.cor || null,
    };
    if (editingCartao) updateCartao.mutate({ id: editingCartao.id, data });
    else createCartao.mutate(data);
  };

  const loading = loadingContas || loadingCartoes;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contas e Cartões</h1>
          <p className="text-muted-foreground">Saldos bancários e limites dos cartões de crédito</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNewConta}>
            <Plus className="h-4 w-4 mr-2" /> Nova conta
          </Button>
          <Button onClick={openNewCartao}>
            <Plus className="h-4 w-4 mr-2" /> Novo cartão
          </Button>
        </div>
      </div>

      {/* Contas */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Contas</h2>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
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
                    style={{
                      background: `linear-gradient(90deg, ${cor}, ${cor}88)`,
                    }}
                  />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-label tracking-wide text-muted-foreground">
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
                          onClick={() => {
                            if (confirm("Remover esta conta?")) deleteConta.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span
                        className={`text-2xl font-numeric font-semibold ${
                          saldo < 0 ? "text-red-500" : "text-foreground"
                        }`}
                      >
                        {money(saldo)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Cartões */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Cartões</h2>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : cartoes.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhum cartão cadastrado. Cadastre um para acompanhar limite e faturas.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cartoes.map((c) => {
              const cor = c.cor || "#6366F1";
              const limiteOk = hasLimite(c.limite);
              const pct = Math.min(100, Number(c.percentual) || 0);
              const faturas = c.faturas_recentes || [];
              return (
                <Card key={c.id} className="overflow-hidden">
                  <div
                    className="h-2 w-full"
                    style={{ background: `linear-gradient(90deg, ${cor}, ${cor}88)` }}
                  />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">{c.nome}</CardTitle>
                        {c.bandeira && (
                          <p className="text-sm text-muted-foreground">{c.bandeira}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Fecha dia {c.dia_fechamento ?? "—"} · Vence dia {c.dia_vencimento ?? "—"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditCartao(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Remover este cartão?")) deleteCartao.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {limiteOk ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Usado {money(Number(c.usado) || 0)}</span>
                          <span>Limite {money(Number(c.limite))}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : cor,
                            }}
                          />
                        </div>
                        <p className="text-sm text-emerald-600 font-medium">
                          Disponível {money(Number(c.disponivel) || 0)}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Usado {money(Number(c.usado) || 0)}</span>
                          <span>Sem limite</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full w-full rounded-full bg-muted-foreground/25" />
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Faturas recentes</p>
                      {faturas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma fatura ainda</p>
                      ) : (
                        <div className="space-y-2">
                          {faturas.map((f) => {
                            const sb = statusBadge(f.status);
                            return (
                              <div
                                key={f.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{f.competencia}</span>
                                    <Badge className={`${sb.c} text-[10px]`}>{sb.t}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{money(Number(f.total) || 0)}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  {f.status !== "paga" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setPagarOpen({ fatura: f, cartaoNome: c.nome });
                                        setContaPagamentoId(contasAtivas[0] ? String(contasAtivas[0].id) : "");
                                      }}
                                    >
                                      Pagar
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => reabrirFatura.mutate(f.id)}
                                      disabled={reabrirFatura.isPending}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                      Reabrir
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

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
            <Button
              onClick={submitConta}
              disabled={createConta.isPending || updateConta.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cartão */}
      <Dialog open={cartaoOpen} onOpenChange={setCartaoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCartao ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={cartaoForm.nome}
                onChange={(e) => setCartaoForm({ ...cartaoForm, nome: e.target.value })}
                placeholder="Ex.: Nubank Roxinho"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Banco/bandeira</Label>
                <Input
                  value={cartaoForm.banco}
                  onChange={(e) => setCartaoForm({ ...cartaoForm, banco: e.target.value })}
                  placeholder="Visa, Mastercard…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Limite (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cartaoForm.limite}
                  onChange={(e) => setCartaoForm({ ...cartaoForm, limite: e.target.value })}
                  placeholder="Sem limite"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha dia *</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={cartaoForm.dia_fechamento}
                  onChange={(e) => setCartaoForm({ ...cartaoForm, dia_fechamento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vence dia *</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={cartaoForm.dia_vencimento}
                  onChange={(e) => setCartaoForm({ ...cartaoForm, dia_vencimento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <Input
                  type="color"
                  value={cartaoForm.cor}
                  onChange={(e) => setCartaoForm({ ...cartaoForm, cor: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartaoOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submitCartao}
              disabled={createCartao.isPending || updateCartao.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pagar fatura */}
      <Dialog open={!!pagarOpen} onOpenChange={(o) => !o && setPagarOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagar fatura</DialogTitle>
          </DialogHeader>
          {pagarOpen && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {pagarOpen.cartaoNome} · {pagarOpen.fatura.competencia} ·{" "}
                {money(Number(pagarOpen.fatura.total) || 0)}
              </p>
              <div className="space-y-1.5">
                <Label>Pagar com a conta *</Label>
                <Select value={contaPagamentoId} onValueChange={setContaPagamentoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasAtivas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome} ({money(Number(c.saldo) || 0)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagarOpen(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!contaPagamentoId || pagarFatura.isPending}
              onClick={() => {
                if (!pagarOpen || !contaPagamentoId) return;
                pagarFatura.mutate({
                  id: pagarOpen.fatura.id,
                  conta_bancaria_id: Number(contaPagamentoId),
                });
              }}
            >
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
