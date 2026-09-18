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
import { ArrowLeftRight, CalendarDays, CheckCircle2, CreditCard, Edit, Plus, ReceiptText, Trash2 } from "lucide-react";
import { rotuloParcela } from "@shared/parcela-descricao";

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

const pad2 = (n: number) => String(n).padStart(2, "0");
const compToNum = (c: string) => {
  const [y, m] = String(c).split("-").map(Number);
  return (y || 0) * 12 + ((m || 1) - 1);
};
const numToComp = (n: number) => `${Math.floor(n / 12)}-${pad2((n % 12) + 1)}`;
const ultimoDiaMes = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
const diaLimitado = (ano: number, mes0: number, dia: number) =>
  Math.min(Math.max(1, Math.floor(dia) || 1), ultimoDiaMes(ano, mes0));
// Vencimento de uma competência dados os dias do cartão (espelha datasDaCompetencia do servidor).
const vencimentoDaComp = (comp: string, diaFech: number, diaVenc: number) => {
  const [ano, mes1] = String(comp).split("-").map(Number);
  const mes = (mes1 || 1) - 1;
  let vMes = mes;
  let vAno = ano;
  if (diaVenc < diaFech) {
    vMes += 1;
    if (vMes > 11) { vMes = 0; vAno += 1; }
  }
  return `${vAno}-${pad2(vMes + 1)}-${pad2(diaLimitado(vAno, vMes, diaVenc))}`;
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
  // Mover lançamento (para outro cartão / competência) — um ou vários
  const [moverIds, setMoverIds] = useState<number[] | null>(null);
  const [moverLabel, setMoverLabel] = useState("");
  const [moverCartaoId, setMoverCartaoId] = useState<string>("");
  const [moverComp, setMoverComp] = useState<string>("");
  const [todasParcelas, setTodasParcelas] = useState(true);
  const [recalcularComp, setRecalcularComp] = useState(false);
  const [criarNovaFatura, setCriarNovaFatura] = useState(false);
  const [previewParcelas, setPreviewParcelas] = useState<{ extra: number; ids: number[] } | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [diaOpen, setDiaOpen] = useState(false);
  const [diaValor, setDiaValor] = useState("5");
  const [diaTodasParcelas, setDiaTodasParcelas] = useState(true);

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

  // Faturas do cartão de DESTINO do "mover" (pode ser diferente do cartão em tela).
  const { data: moverFaturasResp } = useQuery<{ cartao: Cartao; faturas: Fatura[] }>({
    queryKey: [`/api/cartoes/${moverCartaoId}/faturas`],
    enabled: !!moverIds && !!moverCartaoId,
  });
  // Meses candidatos para o destino do "mover": faturas existentes + uma janela ao
  // redor do mês atual, para que meses ainda SEM fatura (ex.: setembro) também
  // possam ser escolhidos — o backend cria a fatura sob demanda ao mover.
  const moverOpcoes = useMemo(() => {
    const card = moverFaturasResp?.cartao;
    const diaF = Number(card?.dia_fechamento) || 1;
    const diaV = Number(card?.dia_vencimento) || 10;
    const todas = moverFaturasResp?.faturas || [];
    const porComp = new Map(todas.map((f) => [f.competencia, f]));
    const comps = new Set<string>();
    const base = compToNum(compAtual());
    for (let n = base - 6; n <= base + 6; n++) comps.add(numToComp(n));
    for (const f of todas) comps.add(f.competencia);
    return [...comps]
      .sort()
      .map((comp) => {
        const f = porComp.get(comp);
        return {
          competencia: comp,
          vencimento: f?.data_vencimento || vencimentoDaComp(comp, diaF, diaV),
          total: f ? Number(f.total) || 0 : null,
          paga: f?.status === "paga",
        };
      });
  }, [moverFaturasResp]);

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

  useEffect(() => {
    setSel(new Set());
  }, [faturaId, cardId]);

  useEffect(() => {
    if (!moverIds?.length || !todasParcelas) {
      setPreviewParcelas(null);
      return;
    }
    let cancel = false;
    apiRequest("/api/faturas/expandir-parcelas", { method: "POST", data: { transacao_ids: moverIds } })
      .then((r: any) => {
        if (!cancel) setPreviewParcelas({ extra: Number(r?.extra) || 0, ids: r?.ids || [] });
      })
      .catch(() => {
        if (!cancel) setPreviewParcelas(null);
      });
    return () => {
      cancel = true;
    };
  }, [moverIds, todasParcelas]);

  // Ao abrir o mover / carregar as faturas do destino: se a competência-alvo já
  // existe entre as faturas do cartão de destino, seleciona-a; senão, entra em
  // modo "criar nova fatura".
  useEffect(() => {
    if (!moverIds) return;
    const existe = moverOpcoes.some((o) => o.competencia === moverComp && !o.paga);
    setCriarNovaFatura(!existe);
  }, [moverOpcoes, moverIds, moverCartaoId]);

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
    mutationFn: (data: {
      transacao_ids: number[];
      cartao_id: number;
      competencia?: string;
      todas_parcelas: boolean;
    }) => apiRequest("/api/faturas/mover-lancamento", { method: "POST", data }),
    onSuccess: (r: any) => {
      invalidate();
      setMoverIds(null);
      setSel(new Set());
      const extra = r?.extra_parcelas ? ` (+${r.extra_parcelas} parcela(s) da mesma compra)` : "";
      const pagos = r?.ignorados_pagos ? ` ${r.ignorados_pagos} em fatura paga foram ignorados.` : "";
      toast({ title: `${r?.movidos ?? 0} lançamento(s) movido(s)${extra}`, description: pagos || undefined });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const alterarDia = useMutation({
    mutationFn: (data: { transacao_ids: number[]; dia: number; todas_parcelas: boolean }) =>
      apiRequest("/api/transactions/alterar-dia", { method: "POST", data }),
    onSuccess: (r: any) => {
      invalidate();
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/transactions") });
      setDiaOpen(false);
      setSel(new Set());
      const extra = r?.extra_parcelas ? ` (+${r.extra_parcelas} parcela(s) da mesma compra)` : "";
      toast({
        title: `Dia alterado em ${r?.alterados ?? 0} lançamento(s)${extra}`,
        description: r?.ignorados_pagos
          ? `${r.ignorados_pagos} em fatura paga foram ignorados.`
          : "Faturas recalculadas pelo novo dia.",
      });
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
  const abrirMover = (itens: { id: number; descricao: string }[]) => {
    if (!itens.length) return;
    setMoverIds(itens.map((i) => i.id));
    setMoverLabel(itens.length === 1 ? itens[0].descricao : `${itens.length} lançamentos selecionados`);
    setMoverCartaoId(cardId ? String(cardId) : (cartoes[0] ? String(cartoes[0].id) : ""));
    setMoverComp(detalhe?.fatura?.competencia || compAtual());
    setTodasParcelas(true);
    setRecalcularComp(itens.length > 1);
    setPreviewParcelas(null);
  };
  const submitMover = () => {
    if (!moverIds?.length || !moverCartaoId) {
      toast({ title: "Escolha o cartão de destino", variant: "destructive" });
      return;
    }
    if (!recalcularComp && !/^\d{4}-\d{2}$/.test(moverComp)) {
      toast({ title: "Escolha a competência (AAAA-MM) ou marque recalcular", variant: "destructive" });
      return;
    }
    moverLancamento.mutate({
      transacao_ids: moverIds,
      cartao_id: Number(moverCartaoId),
      competencia: recalcularComp ? undefined : moverComp,
      todas_parcelas: todasParcelas,
    });
  };

  const toggleSel = (id: number, on?: boolean) => {
    setSel((prev) => {
      const n = new Set(prev);
      const next = on ?? !n.has(id);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const faturaSel = detalhe?.fatura;
  const compras = detalhe?.compras || [];
  const idsFatura = compras.map((c) => c.id);
  const todosFaturaSel = idsFatura.length > 0 && idsFatura.every((id) => sel.has(id));

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
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {sel.size > 0 ? `${sel.size} selecionado(s)` : "Selecione para mover em massa"}
                  </p>
                  {sel.size > 0 && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSel(new Set())}>
                        Limpar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const fech = cartaoSel?.dia_fechamento;
                          setDiaValor(fech ? String(fech) : "5");
                          setDiaTodasParcelas(true);
                          setDiaOpen(true);
                        }}
                      >
                        <CalendarDays className="h-4 w-4 mr-1" /> Alterar dia
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const mapa = new Map<number, string>();
                          compras.forEach((c) => mapa.set(c.id, c.descricao));
                          semFatura.forEach((c) => mapa.set(c.id, c.descricao));
                          abrirMover(Array.from(sel).map((id) => ({ id, descricao: mapa.get(id) || `#${id}` })));
                        }}
                      >
                        <ArrowLeftRight className="h-4 w-4 mr-1" /> Mover selecionados
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="py-2 pr-2 w-8">
                          <input
                            type="checkbox"
                            aria-label="Selecionar todos"
                            checked={todosFaturaSel}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setSel((prev) => {
                                const n = new Set(prev);
                                idsFatura.forEach((id) => (on ? n.add(id) : n.delete(id)));
                                return n;
                              });
                            }}
                          />
                        </th>
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
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            Nenhum lançamento nesta fatura.
                          </td>
                        </tr>
                      ) : (
                        compras.map((l) => (
                          <tr key={l.id} className={`border-b border-border/50 ${sel.has(l.id) ? "bg-primary/5" : ""}`}>
                            <td className="py-2.5 pr-2">
                              <input
                                type="checkbox"
                                checked={sel.has(l.id)}
                                onChange={() => toggleSel(l.id)}
                                aria-label={`Selecionar ${l.descricao}`}
                              />
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap">{dataBR(l.data_transacao)}</td>
                            <td className="py-2.5 pr-3">{l.descricao}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground">
                              {rotuloParcela(l) || "—"}
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
                                  onClick={() => abrirMover([{ id: l.id, descricao: l.descricao }])}
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
              {sel.size > 0 && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      const mapa = new Map<number, string>();
                      semFatura.forEach((c) => mapa.set(c.id, c.descricao));
                      abrirMover(
                        Array.from(sel)
                          .filter((id) => mapa.has(id))
                          .map((id) => ({ id, descricao: mapa.get(id) || `#${id}` })),
                      );
                    }}
                  >
                    Mover selecionados
                  </button>
                </>
              )}
            </p>
            <div className="divide-y divide-border/50">
              {semFatura.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <label className="flex items-start gap-2 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={sel.has(l.id)}
                      onChange={() => toggleSel(l.id)}
                    />
                    <p className="text-sm">
                      <span className="text-muted-foreground">{dataBR(l.data_transacao)}</span> · {l.descricao}
                      {rotuloParcela(l) ? ` (${rotuloParcela(l)})` : ""}
                    </p>
                  </label>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-numeric font-semibold">{money(Number(l.valor) || 0)}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="Mover para uma fatura/cartão"
                      onClick={() => abrirMover([{ id: l.id, descricao: l.descricao }])}
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
      <Dialog open={!!moverIds} onOpenChange={(o) => { if (!o) setMoverIds(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{(moverIds?.length || 0) > 1 ? "Mover lançamentos" : "Mover lançamento"}</DialogTitle>
          </DialogHeader>
          {moverIds && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{moverLabel}</p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={todasParcelas}
                  onChange={(e) => setTodasParcelas(e.target.checked)}
                />
                <span>
                  Mover todas as parcelas desta compra
                  {previewParcelas?.extra ? (
                    <span className="block text-xs text-muted-foreground">
                      +{previewParcelas.extra} parcela(s) em outras faturas serão incluídas ({previewParcelas.ids.length} no total)
                    </span>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      Se for parcelada (ex.: 4/7), as irmãs vão junto para o cartão certo.
                    </span>
                  )}
                </span>
              </label>
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
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={recalcularComp}
                  onChange={(e) => setRecalcularComp(e.target.checked)}
                />
                <span>
                  Recalcular a fatura pela data da compra
                  <span className="block text-xs text-muted-foreground">
                    Usa o fechamento do cartão destino. Desmarque para escolher a competência na mão.
                  </span>
                </span>
              </label>
              {!recalcularComp && (
                <div className="space-y-1.5">
                  <Label>Fatura de destino *</Label>
                  <Select
                    value={criarNovaFatura ? "__nova__" : moverComp}
                    onValueChange={(v) => {
                      if (v === "__nova__") {
                        setCriarNovaFatura(true);
                      } else {
                        setCriarNovaFatura(false);
                        setMoverComp(v);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a fatura" />
                    </SelectTrigger>
                    <SelectContent>
                      {moverOpcoes.map((o) => (
                        <SelectItem key={o.competencia} value={o.competencia} disabled={o.paga}>
                          {compLabel(o.competencia)} · vence {dataBR(o.vencimento)}
                          {o.paga ? " · paga" : o.total != null ? ` · ${money(o.total)}` : " · nova"}
                        </SelectItem>
                      ))}
                      <SelectItem value="__nova__">+ Outro mês…</SelectItem>
                    </SelectContent>
                  </Select>
                  {criarNovaFatura && (
                    <div className="space-y-1 pt-1">
                      <Label className="text-xs">Mês da nova fatura (competência)</Label>
                      <Input
                        type="month"
                        value={moverComp}
                        onChange={(e) => setMoverComp(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Usa/cria a fatura desse mês no cartão de destino; o vencimento é calculado pelos dias do cartão.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Escolha pela data em que a fatura vence. Se for parcelada, as outras parcelas seguem nos meses seguintes.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoverIds(null)}>Cancelar</Button>
            <Button onClick={submitMover} disabled={moverLancamento.isPending}>Mover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={diaOpen} onOpenChange={setDiaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar dia da transação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {sel.size} lançamento(s). O mês de cada um permanece; só o dia muda.
              Compras depois do fechamento do cartão caem na fatura seguinte — por isso setembro
              estava virando outubro. Use um dia igual ou anterior ao fechamento.
            </p>
            <div className="space-y-1.5">
              <Label>Novo dia (1–31) *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={diaValor}
                onChange={(e) => setDiaValor(e.target.value)}
              />
              {cartaoSel?.dia_fechamento != null && (
                <p className="text-xs text-muted-foreground">
                  Este cartão fecha no dia {cartaoSel.dia_fechamento}. Dia {cartaoSel.dia_fechamento} ainda entra nesta fatura.
                </p>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={diaTodasParcelas}
                onChange={(e) => setDiaTodasParcelas(e.target.checked)}
              />
              <span>
                Aplicar em todas as parcelas da compra
                <span className="block text-xs text-muted-foreground">
                  Cada parcela mantém o próprio mês (4/7 em set, 5/7 em out…), só o dia muda.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiaOpen(false)}>Cancelar</Button>
            <Button
              disabled={alterarDia.isPending || sel.size === 0}
              onClick={() => {
                const dia = Number(diaValor);
                if (!(dia >= 1 && dia <= 31)) {
                  toast({ title: "Informe um dia entre 1 e 31", variant: "destructive" });
                  return;
                }
                alterarDia.mutate({
                  transacao_ids: Array.from(sel),
                  dia,
                  todas_parcelas: diaTodasParcelas,
                });
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
