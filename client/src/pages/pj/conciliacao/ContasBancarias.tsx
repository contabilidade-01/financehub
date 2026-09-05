import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Trash2, Edit2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import PeriodoSelector from "@/components/shared/PeriodoSelector";
import { Periodo, rangeDoPeriodo, rotuloPeriodo } from "@/lib/period";

interface ContaBancaria {
  id: number;
  banco: string;
  agencia: string | null;
  numero: string | null;
  tipo: "corrente" | "poupanca" | "caixa";
  saldo_inicial: number;
  saldo_sistema?: number;
  saldo?: number;
  movimento?: number;
  entradas?: number;
  saidas?: number;
  qtd_lancamentos?: number;
  ativo: boolean;
  criado_em: string;
}

type Lancamento = {
  id: number;
  descricao: string;
  valor: number | string;
  tipo: string;
  data_transacao: string;
  categoria?: string | null;
  categoria_codigo?: string | null;
};

const OPCOES: Periodo[] = ["current_month", "last_month", "next_month", "custom"];

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const dataBR = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

export default function ContasBancarias({ empresaId }: { empresaId: number }) {
  const queryClient = useQueryClient();
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

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    banco: "",
    agencia: "",
    numero: "",
    tipo: "corrente",
    saldo_inicial: 0,
  });
  const [detalhe, setDetalhe] = useState<{ id: number; nome: string } | null>(null);

  const base = `/api/empresas/${empresaId}/contas-bancarias`;

  const { data: contas = [], isLoading } = useQuery<ContaBancaria[]>({
    queryKey: [`${base}${qs}`],
    queryFn: () => apiRequest(`${base}${qs}`),
    enabled: periodoPronto,
  });

  const detalheUrl = detalhe ? `${base}/${detalhe.id}/lancamentos${qs}` : null;
  const { data: detalheData, isLoading: loadingDetalhe } = useQuery<{
    saldo?: number;
    entradas?: number;
    saidas?: number;
    lancamentos: Lancamento[];
  }>({
    queryKey: [detalheUrl || "/api/noop"],
    queryFn: () => apiRequest(detalheUrl!),
    enabled: !!detalheUrl && periodoPronto,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0] || "").startsWith(base),
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest(base, { method: "POST", data }),
    onSuccess: () => {
      invalidate();
      setFormData({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest(`${base}/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setFormData({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });

  const handleOpenEdit = (conta: ContaBancaria) => {
    setEditingId(conta.id);
    setFormData({
      banco: conta.banco,
      agencia: conta.agencia || "",
      numero: conta.numero || "",
      tipo: conta.tipo,
      saldo_inicial: Number(conta.saldo_inicial) || 0,
    });
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingId(null);
    setFormData({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.banco.trim()) return;
    const payload = { ...formData, saldo_inicial: Number(formData.saldo_inicial) };
    if (editingId) await updateMutation.mutateAsync({ id: editingId, data: payload });
    else await createMutation.mutateAsync(payload);
    handleClose();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Contas Bancárias</h2>
          <p className="text-sm text-muted-foreground">
            Extrato por período · toque no saldo para ver os lançamentos
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => { setEditingId(null); setOpen(true); }}>
              <PlusCircle className="h-4 w-4" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar" : "Nova"} Conta Bancária</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="banco">Banco *</Label>
                <Input
                  id="banco"
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  placeholder="ex: Banco do Brasil"
                  required
                />
              </div>
              <div>
                <Label htmlFor="agencia">Agência</Label>
                <Input
                  id="agencia"
                  value={formData.agencia}
                  onChange={(e) => setFormData({ ...formData, agencia: e.target.value })}
                  placeholder="ex: 1234"
                />
              </div>
              <div>
                <Label htmlFor="numero">Número da Conta</Label>
                <Input
                  id="numero"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  placeholder="ex: 123456-7"
                />
              </div>
              <div>
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="caixa">Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="saldo">Saldo Inicial (R$)</Label>
                <Input
                  id="saldo"
                  type="number"
                  step="0.01"
                  value={formData.saldo_inicial}
                  onChange={(e) => setFormData({ ...formData, saldo_inicial: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} type="button">
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        <PeriodoSelector
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          opcoes={OPCOES}
        />
        <p className="text-sm text-muted-foreground capitalize">{periodoLabel}</p>
      </div>

      {!periodoPronto || isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : contas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhuma conta bancária cadastrada.</p>
          <p className="text-sm text-muted-foreground mt-1">Crie uma para começar a importar extratos.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contas.map((conta) => {
            const saldoPeriodo = Number(conta.saldo ?? conta.movimento ?? 0);
            return (
              <Card key={conta.id} className="p-4">
                <div className="space-y-2 mb-4">
                  <h3 className="font-bold text-lg">{conta.banco}</h3>
                  <p className="text-sm text-muted-foreground">
                    {conta.agencia && conta.numero ? `${conta.agencia} / ${conta.numero}` : "–"}
                  </p>
                  <p className="text-sm">
                    Tipo: <span className="font-medium capitalize">{conta.tipo}</span>
                  </p>
                  <button
                    type="button"
                    className="w-full text-left pt-2 border-t rounded-lg hover:bg-muted/40 -mx-1 px-1 py-1 transition-colors"
                    onClick={() => setDetalhe({ id: conta.id, nome: conta.banco })}
                  >
                    <p className="text-xs text-muted-foreground">Saldo do período</p>
                    <p
                      className={`text-xl font-bold ${
                        saldoPeriodo < 0 ? "text-red-500" : "text-foreground"
                      }`}
                    >
                      {money(saldoPeriodo)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {conta.qtd_lancamentos ?? 0} lançamento
                      {(conta.qtd_lancamentos ?? 0) === 1 ? "" : "s"} · ver detalhes
                    </p>
                  </button>
                  {conta.saldo_sistema != null && (
                    <div className="pt-1">
                      <p className="text-xs text-muted-foreground">Saldo acumulado (sistema)</p>
                      <p className="text-sm font-medium">{money(Number(conta.saldo_sistema))}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOpenEdit(conta)}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm("Remover esta conta?")) deleteMutation.mutate(conta.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 px-3 py-2 mb-2">
                <p className="text-xs text-muted-foreground">Saldo do período</p>
                <p
                  className={`text-xl font-semibold ${
                    Number(detalheData?.saldo ?? 0) < 0 ? "text-red-500" : ""
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
                    return (
                      <div
                        key={l.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{l.descricao}</p>
                          <p className="text-xs text-muted-foreground">
                            {dataBR(l.data_transacao)}
                            {l.categoria
                              ? ` · ${l.categoria_codigo ? `${l.categoria_codigo} — ` : ""}${l.categoria}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold shrink-0 ${
                            receita ? "text-emerald-600" : "text-red-500"
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
    </div>
  );
}
