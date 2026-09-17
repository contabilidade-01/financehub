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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeftRight, CheckCircle2, CreditCard, Edit, Plus, ReceiptText, Trash2 } from "lucide-react";

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
  const hoje = new Date().toISOString().slice(0, 10);
  const freshNovo = () => ({ descricao: "", valor: "", data: hoje, categoria_id: "", parcelas: "1" });
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoForm, setNovoForm] = useState(freshNovo());
  // Cartão (criar/editar)
  const emptyCartao = { nome: "", banco: "", limite: "", dia_fechamento: "", dia_vencimento: "", cor: "#6366F1" };
  const [cartaoOpen, setCartaoOpen] = useState(false);
  const [editingCartao, setEditingCartao] = useState<Cartao | null>(null);
  const [cartaoForm, setCartaoForm] = useState(emptyCartao);
  // Mover lançamento (para outro cartão / competência)
  const [moverTx, setMoverTx] = useState<{ id: number; descricao: string } | null>(null);
  const [moverCartaoId, setMoverCartaoId] = useState<string>("");
  const [moverComp, setMoverComp] = useState<string>("");

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

  const { data: categorias = [] } = useQuery<{ id: number; nome: string; tipo: string }[]>({
    queryKey: ["/api/categories"],
  });
  const categoriasDespesa = useMemo(() => categorias.filter((c) => c.tipo === "Despesa"), [categorias]);

  const criarLancamento = useMutation({
    mutationFn: (data: any) => apiRequest("/api/transactions", { method: "POST", data }),
    onSuccess: () => {
      invalidate();
      setNovoOpen(false);
      setNovoForm(freshNovo());
      toast({ title: "Lançamento adicionado ao cartão" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const submitNovo = () => {
    if (!cardId) {
      toast({ title: "Selecione um cartão", variant: "destructive" });
      return;
    }
    const valor = Number(String(novoForm.valor).replace(",", "."));
    if (!novoForm.descricao.trim() || !(valor > 0)) {
      toast({ title: "Informe descrição e valor válidos", variant: "destructive" });
      return;
    }
    if (!novoForm.categoria_id) {
      toast({ title: "Escolha a categoria", variant: "destructive" });
      return;
    }
    criarLancamento.mutate({
      tipo: "Despesa",
      descricao: novoForm.descricao.trim(),
      valor,
      data_transacao: novoForm.data,
      categoria_id: Number(novoForm.categoria_id),
      forma_pagamento_id: cardId,
      parcelas: Number(novoForm.parcelas) || 1,
    });
  };

  const salvarCartao = useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: any }) =>
      id ? apiRequest(`/api/cartoes/${id}`, { method: "PUT", data }) : apiRequest("/api/cartoes", { method: "POST", data }),
    onSuccess: () => {
      invalidate();
      setCartaoOpen(false);
      setEditingCartao(null);
      setCartaoForm(emptyCartao);
      toast({ title: "Cartão salvo" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const excluirCartao = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cartoes/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Cartão removido" }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const moverLancamento = useMutation({
    mutationFn: (data: { transacao_id: number; cartao_id: number; competencia: string }) =>
      apiRequest("/api/faturas/mover-lancamento", { method: "POST", data }),
    onSuccess: () => {
      invalidate();
      setMoverTx(null);
      toast({ title: "Lançamento movido" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const recalcularFaturas = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/cartoes/${id}/recalcular-faturas`, { method: "POST", data: {} }),
    onSuccess: (r: any) => {
      invalidate();
      toast({
        title: "Faturas recalculadas",
        description: `${r?.movidas ?? 0} lançamento(s) reorganizado(s), ${r?.faturasRemovidas ?? 0} fatura(s) vazia(s) removida(s).`,
      });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const openNovoCartao = () => { setEditingCartao(null); setCartaoForm(emptyCartao); setCartaoOpen(true); };
  const openEditarCartao = (c: Cartao) => {
    setEditingCartao(c);
    setCartaoForm({
      nome: c.nome || "",
      banco: c.bandeira || "",
      limite: c.limite != null && c.limite !== "" ? String(c.limite) : "",
      dia_fechamento: c.dia_fechamento != null ? String(c.dia_fechamento) : "",
      dia_vencimento: c.dia_vencimento != null ? String(c.dia_vencimento) : "",
      cor: c.cor || "#6366F1",
    });
    setCartaoOpen(true);
  };
  const submitCartao = () => {
    const fech = Number(cartaoForm.dia_fechamento);
    const venc = Number(cartaoForm.dia_vencimento);
    if (!cartaoForm.nome.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    if (!(fech >= 1 && fech <= 31) || !(venc >= 1 && venc <= 31)) {
      toast({ title: "Fechamento/vencimento devem ser 1–31", variant: "destructive" }); return;
    }
    salvarCartao.mutate({
      id: editingCartao?.id ?? null,
      data: {
        nome: cartaoForm.nome.trim(),
        banco: cartaoForm.banco.trim() || null,
        bandeira: cartaoForm.banco.trim() || null,
        limite: cartaoForm.limite !== "" ? Number(cartaoForm.limite) : null,
        dia_fechamento: fech,
        dia_vencimento: venc,
        cor: cartaoForm.cor || null,
      },
    });
  };
  const abrirMover = (l: { id: number; descricao: string }) => {
    setMoverTx(l);
    setMoverCartaoId(cardId ? String(cardId) : (cartoes[0] ? String(cartoes[0].id) : ""));
    setMoverComp(detalhe?.fatura?.competencia || compAtual());
  };
  const submitMover = () => {
    if (!moverTx || !moverCartaoId || !/^\d{4}-\d{2}$/.test(moverComp)) {
      toast({ title: "Escolha o cartão e a competência (AAAA-MM)", variant: "destructive" });
      return;
    }
    moverLancamento.mutate({ transacao_id: moverTx.id, cartao_id: Number(moverCartaoId), competencia: moverComp });
  };

  const faturaSel = detalhe?.fatura;
  const compras = detalhe?.compras || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7" /> Cartões de Crédito
          </h1>
          <p className="text-muted-foreground">
            Escolha um cartão, navegue pelas faturas e confira os lançamentos de cada mês.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNovoCartao}>
            <Plus className="h-4 w-4 mr-2" /> Novo cartão
          </Button>
          <Button onClick={() => { setNovoForm(freshNovo()); setNovoOpen(true); }} disabled={!cardId}>
            <Plus className="h-4 w-4 mr-2" /> Novo lançamento
          </Button>
        </div>
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
            Nenhum cartão cadastrado. Use o botão <b>Novo cartão</b> acima para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((c) => {
            const ativo = c.id === cardId;
            const cor = c.cor || "#6366F1";
            const semDias = c.dia_fechamento == null || c.dia_vencimento == null;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setCardId(c.id)}
                className={`relative cursor-pointer text-left rounded-xl border p-4 transition-colors ${
                  ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground p-1"
                    title="Editar cartão"
                    onClick={(e) => { e.stopPropagation(); openEditarCartao(c); }}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-red-500 p-1"
                    title="Remover cartão"
                    onClick={(e) => { e.stopPropagation(); if (confirm("Remover este cartão?")) excluirCartao.mutate(c.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 pr-14">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />
                  <span className="font-semibold">{c.nome}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {c.bandeira ? `${c.bandeira} · ` : ""}fecha dia {c.dia_fechamento ?? "—"} · vence dia{" "}
                  {c.dia_vencimento ?? "—"}
                </p>
                {semDias && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    ⚠️ defina fechamento/vencimento para as faturas saírem certas
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">Limite</p>
                <p className="text-xl font-numeric font-semibold">{money(Number(c.limite) || 0)}</p>
              </div>
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-muted-foreground" />
                <p className="font-semibold">Faturas</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!cardId || recalcularFaturas.isPending}
                onClick={() => {
                  if (!cardId) return;
                  if (confirm("Recalcular as faturas deste cartão usando os dias de fechamento/vencimento atuais? Faturas pagas não são alteradas.")) {
                    recalcularFaturas.mutate(cardId);
                  }
                }}
                title="Reorganiza os lançamentos nas faturas certas pelos dias atuais do cartão"
              >
                Recalcular faturas
              </Button>
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
                        <th className="py-2 w-20"></th>
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
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  title="Mover para outro cartão/competência"
                                  onClick={() => abrirMover({ id: l.id, descricao: l.descricao })}
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </button>
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
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="Mover para uma fatura/cartão"
                      onClick={() => abrirMover({ id: l.id, descricao: l.descricao })}
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                    </button>
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

      {/* Modal: novo lançamento no cartão */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo lançamento no cartão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {cartaoSel ? cartaoSel.nome : "Selecione um cartão"} — a compra entra automaticamente na fatura do mês.
            </p>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input
                value={novoForm.descricao}
                onChange={(e) => setNovoForm({ ...novoForm, descricao: e.target.value })}
                placeholder="Ex.: Mercado, Assinatura…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor {Number(novoForm.parcelas) > 1 ? "total" : ""} (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={novoForm.valor}
                  onChange={(e) => setNovoForm({ ...novoForm, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={novoForm.data}
                  onChange={(e) => setNovoForm({ ...novoForm, data: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria *</Label>
                <Select
                  value={novoForm.categoria_id}
                  onValueChange={(v) => setNovoForm({ ...novoForm, categoria_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasDespesa.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={48}
                  value={novoForm.parcelas}
                  onChange={(e) => setNovoForm({ ...novoForm, parcelas: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitNovo} disabled={criarLancamento.isPending}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: criar/editar cartão */}
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
                placeholder="Ex.: Inter, Nubank Roxinho"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Banco/bandeira</Label>
                <Input
                  value={cartaoForm.banco}
                  onChange={(e) => setCartaoForm({ ...cartaoForm, banco: e.target.value })}
                  placeholder="Visa, Master…"
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
            <p className="text-xs text-muted-foreground">
              O dia de fechamento define em qual fatura cada compra entra. Corrigir esses dias acerta as próximas faturas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartaoOpen(false)}>Cancelar</Button>
            <Button onClick={submitCartao} disabled={salvarCartao.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: mover lançamento para outro cartão/competência */}
      <Dialog open={!!moverTx} onOpenChange={(o) => { if (!o) setMoverTx(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mover lançamento</DialogTitle>
          </DialogHeader>
          {moverTx && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{moverTx.descricao}</p>
              <div className="space-y-1.5">
                <Label>Cartão *</Label>
                <Select value={moverCartaoId} onValueChange={setMoverCartaoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {cartoes.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Competência (fatura) *</Label>
                <Input
                  type="month"
                  value={moverComp}
                  onChange={(e) => setMoverComp(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O vencimento é calculado pelos dias do cartão escolhido.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoverTx(null)}>Cancelar</Button>
            <Button onClick={submitMover} disabled={moverLancamento.isPending}>Mover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
