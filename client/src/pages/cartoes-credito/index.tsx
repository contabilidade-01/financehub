import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, CreditCard, ReceiptText, Trash2 } from "lucide-react";

type Cartao = {
  id: number;
  nome: string;
  bandeira: string | null;
  cor: string | null;
  limite: number | string | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
};

type Fatura = {
  id: number;
  competencia: string; // YYYY-MM
  data_vencimento: string;
  status: string; // aberta | fechada | paga
  total: number | string;
};

type Compra = {
  id: number;
  descricao: string;
  valor: number | string;
  data_transacao: string;
  parcela_num: number | null;
  parcela_total: number | null;
  categoria?: string | null;
};

type LancCartao = Compra & { fatura_id: number | null };

type Conta = { id: number; nome: string; saldo: number };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const money = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const dataBR = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
};

const compLabel = (comp: string) => {
  const [y, m] = String(comp).split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MESES[mi]}/${y}` : comp;
};

const compAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function CartoesCreditoPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [cardId, setCardId] = useState<number | null>(null);
  const [faturaId, setFaturaId] = useState<number | null>(null);
  const [contaPagamentoId, setContaPagamentoId] = useState<string>("");

  const { data: cartoes = [], isLoading: loadingCartoes } = useQuery<Cartao[]>({
    queryKey: ["/api/cartoes"],
  });

  const { data: contas = [] } = useQuery<Conta[]>({ queryKey: ["/api/contas"] });

  const { data: faturasResp, isLoading: loadingFaturas } = useQuery<{ cartao: Cartao; faturas: Fatura[] }>({
    queryKey: [`/api/cartoes/${cardId}/faturas`],
    enabled: !!cardId,
  });

  const { data: detalhe, isLoading: loadingDetalhe } = useQuery<{ fatura: Fatura; compras: Compra[] }>({
    queryKey: [`/api/faturas/${faturaId}`],
    enabled: !!faturaId,
  });

  const { data: lancsResp } = useQuery<{ lancamentos: LancCartao[] }>({
    queryKey: [`/api/cartoes/${cardId}/lancamentos`],
    enabled: !!cardId,
  });

  const cartaoSel = useMemo(() => cartoes.find((c) => c.id === cardId) || null, [cartoes, cardId]);
  const faturas = useMemo(
    () => [...(faturasResp?.faturas || [])].sort((a, b) => a.competencia.localeCompare(b.competencia)),
    [faturasResp],
  );

  const totalAberto = useMemo(
    () => faturas.filter((f) => f.status !== "paga").reduce((s, f) => s + (Number(f.total) || 0), 0),
    [faturas],
  );
  const limite = Number(cartaoSel?.limite) || 0;
  const limiteDisponivel = limite - totalAberto;

  const semFatura = useMemo(
    () => (lancsResp?.lancamentos || []).filter((l) => l.fatura_id == null),
    [lancsResp],
  );

  // Seleciona o primeiro cartão automaticamente.
  useEffect(() => {
    if (cardId == null && cartoes.length > 0) setCardId(cartoes[0].id);
  }, [cartoes, cardId]);

  // Ao trocar de cartão / carregar faturas, escolhe uma fatura padrão (mês atual → 1ª em aberto → última).
  useEffect(() => {
    if (!faturas.length) {
      setFaturaId(null);
      return;
    }
    const aindaValida = faturas.some((f) => f.id === faturaId);
    if (aindaValida) return;
    const atual = faturas.find((f) => f.competencia === compAtual());
    const emAberto = faturas.find((f) => f.status !== "paga");
    setFaturaId((atual || emAberto || faturas[faturas.length - 1]).id);
  }, [faturas, faturaId]);

  const invalidate = () => {
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/cartoes") });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/faturas") });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/contas") });
    qc.invalidateQueries({ queryKey: ["/api/vencimentos"] });
    qc.invalidateQueries({ queryKey: ["/api/wallet/current"] });
  };

  const pagar = useMutation({
    mutationFn: ({ id, conta_bancaria_id }: { id: number; conta_bancaria_id: number }) =>
      apiRequest(`/api/faturas/${id}/pagar`, { method: "POST", data: { conta_bancaria_id } }),
    onSuccess: () => {
      invalidate();
      setContaPagamentoId("");
      toast({ title: "Fatura marcada como paga" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const excluirLancamento = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lançamento excluído" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const faturaSel = detalhe?.fatura;
  const compras = detalhe?.compras || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CreditCard className="h-7 w-7" /> Cartões de Crédito
        </h1>
        <p className="text-muted-foreground">
          Escolha um cartão, navegue pelas faturas e confira os lançamentos de cada mês.
        </p>
      </div>

      {/* Seletor de cartões */}
      {loadingCartoes ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : cartoes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum cartão cadastrado. Cadastre um cartão em <b>Contas e Cartões</b> para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((c) => {
            const ativo = c.id === cardId;
            const cor = c.cor || "#6366F1";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCardId(c.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />
                  <span className="font-semibold">{c.nome}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {c.bandeira ? `${c.bandeira} · ` : ""}fecha dia {c.dia_fechamento ?? "—"} · vence dia{" "}
                  {c.dia_vencimento ?? "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-3">Limite</p>
                <p className="text-xl font-numeric font-semibold">{money(Number(c.limite) || 0)}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Resumo do cartão selecionado */}
      {cartaoSel && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Cartão selecionado</p>
              <p className="text-lg font-semibold mt-1">{cartaoSel.nome}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Total em faturas em aberto</p>
              <p className="text-2xl font-numeric font-semibold text-red-500 mt-1">{money(totalAberto)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">Limite disponível (estimado)</p>
              <p
                className={`text-2xl font-numeric font-semibold mt-1 ${
                  limiteDisponivel < 0 ? "text-red-500" : "text-emerald-600"
                }`}
              >
                {money(limiteDisponivel)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline de faturas */}
      {cartaoSel && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-muted-foreground" />
              <p className="font-semibold">Faturas</p>
            </div>
            {loadingFaturas ? (
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-28 rounded-lg" />
                ))}
              </div>
            ) : faturas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma fatura ainda para este cartão.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {faturas.map((f) => {
                  const ativo = f.id === faturaId;
                  const paga = f.status === "paga";
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFaturaId(f.id)}
                      className={`rounded-lg border px-3 py-2 text-left min-w-[7rem] transition-colors ${
                        ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-xs font-semibold">{compLabel(f.competencia)}</p>
                      <p className="text-sm font-numeric">{money(Number(f.total) || 0)}</p>
                      <p className={`text-[11px] ${paga ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {paga ? "paga" : `vence ${dataBR(f.data_vencimento)}`}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detalhe da fatura selecionada */}
      {faturaId && (
        <Card>
          <CardContent className="py-4">
            {loadingDetalhe || !faturaSel ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Fatura {compLabel(faturaSel.competencia)}</h2>
                    <p className="text-sm text-muted-foreground">
                      Vencimento {dataBR(faturaSel.data_vencimento)} · {compras.length} lançamento
                      {compras.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total da fatura</p>
                    <p className="text-2xl font-numeric font-bold">{money(Number(faturaSel.total) || 0)}</p>
                  </div>
                </div>

                {/* Pagar com a conta */}
                <div className="flex flex-wrap items-end gap-3 mt-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Pagar com a conta</label>
                    <Select
                      value={contaPagamentoId}
                      onValueChange={setContaPagamentoId}
                      disabled={faturaSel.status === "paga"}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Escolha a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome} ({money(Number(c.saldo) || 0)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {faturaSel.status === "paga" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 text-emerald-600 px-3 py-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Fatura paga
                    </span>
                  ) : (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={!contaPagamentoId || pagar.isPending}
                      onClick={() =>
                        faturaId &&
                        pagar.mutate({ id: faturaId, conta_bancaria_id: Number(contaPagamentoId) })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Marcar como paga
                    </Button>
                  )}
                </div>

                {/* Lançamentos da fatura */}
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-2 pr-3">DATA</th>
                        <th className="text-left font-medium py-2 pr-3">DESCRIÇÃO</th>
                        <th className="text-left font-medium py-2 pr-3">PARCELA</th>
                        <th className="text-right font-medium py-2 pr-3">VALOR</th>
                        <th className="py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {compras.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            Nenhum lançamento nesta fatura.
                          </td>
                        </tr>
                      ) : (
                        compras.map((l) => (
                          <tr key={l.id} className="border-b border-border/50">
                            <td className="py-2.5 pr-3 whitespace-nowrap">{dataBR(l.data_transacao)}</td>
                            <td className="py-2.5 pr-3">{l.descricao}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground">
                              {l.parcela_num && l.parcela_total ? `${l.parcela_num}/${l.parcela_total}` : "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-right font-numeric font-semibold whitespace-nowrap">
                              {money(Number(l.valor) || 0)}
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-red-500 transition-colors"
                                title="Excluir lançamento"
                                onClick={() => {
                                  if (confirm("Excluir este lançamento?")) excluirLancamento.mutate(l.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lançamentos sem fatura vinculada */}
      {cartaoSel && semFatura.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="font-semibold">Lançamentos sem fatura vinculada</p>
            <p className="text-sm text-muted-foreground mb-3">
              Estes lançamentos estão no cartão mas não entram em nenhuma fatura.
            </p>
            <div className="divide-y divide-border/50">
              {semFatura.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="text-sm">
                    <span className="text-muted-foreground">{dataBR(l.data_transacao)}</span> · {l.descricao}
                    {l.parcela_num && l.parcela_total ? ` (${l.parcela_num}/${l.parcela_total})` : ""}
                  </p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-numeric font-semibold">{money(Number(l.valor) || 0)}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                      title="Excluir lançamento"
                      onClick={() => {
                        if (confirm("Excluir este lançamento?")) excluirLancamento.mutate(l.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
