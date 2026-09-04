import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, CreditCard, FileText } from "lucide-react";

type Conta = { id: number; nome: string; banco?: string; saldo?: number; ativo?: boolean };

type FaturaVenc = {
  id: number;
  competencia: string;
  data_vencimento: string;
  status: string;
  total: number | string;
  cartao_nome: string;
  cartao_cor?: string | null;
};

type BoletoVenc = {
  id: number;
  descricao: string;
  valor: string | number;
  data_vencimento: string | null;
  data_transacao: string;
  status: string;
  forma_pagamento?: string | null;
  categoria?: string | null;
};

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function limitesMesAtual() {
  const hoje = new Date();
  const de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  return { de: iso(de), ate: iso(ate) };
}

function diasAte(data: string | null | undefined): number | null {
  if (!data) return null;
  const d = new Date(String(data).slice(0, 10) + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

function badgeDias(dias: number | null) {
  if (dias == null) return { label: "—", className: "bg-muted text-muted-foreground" };
  if (dias < 0) return { label: `${Math.abs(dias)}d vencido`, className: "bg-red-500/15 text-red-600" };
  if (dias === 0) return { label: "Hoje", className: "bg-red-500/15 text-red-600" };
  if (dias <= 3) return { label: `${dias}d`, className: "bg-amber-500/15 text-amber-600" };
  return { label: `${dias}d`, className: "bg-emerald-500/15 text-emerald-600" };
}

function fmtData(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return String(d);
  }
}

export default function ContasPagarPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mes = limitesMesAtual();
  const [tab, setTab] = useState<"aberta" | "paga">("aberta");
  const [de, setDe] = useState(mes.de);
  const [ate, setAte] = useState(mes.ate);
  const [contaPorFatura, setContaPorFatura] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery<{ faturas: FaturaVenc[]; boletos: BoletoVenc[] }>({
    queryKey: ["/api/vencimentos", tab, de, ate],
    queryFn: () =>
      apiRequest(`/api/vencimentos?status=${tab}&de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`),
  });

  const { data: contas = [] } = useQuery<Conta[]>({
    queryKey: ["/api/contas"],
  });
  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo !== false), [contas]);

  const faturas = data?.faturas ?? [];
  const boletos = data?.boletos ?? [];

  const totalFaturas = faturas.reduce((s, f) => s + (Number(f.total) || 0), 0);
  const totalBoletos = boletos.reduce((s, b) => s + (Number(b.valor) || 0), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/vencimentos"] });
    qc.invalidateQueries({ queryKey: ["/api/cartoes"] });
    qc.invalidateQueries({ queryKey: ["/api/contas"] });
    qc.invalidateQueries({ queryKey: ["/api/transactions"] });
    qc.invalidateQueries({ queryKey: ["/api/wallet/current"] });
  };

  const pagarFatura = useMutation({
    mutationFn: ({ id, conta_bancaria_id }: { id: number; conta_bancaria_id: number }) =>
      apiRequest(`/api/faturas/${id}/pagar`, { method: "POST", data: { conta_bancaria_id } }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Fatura paga" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const baixarBoleto = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/transactions/${id}/pagar`, { method: "PUT" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lançamento baixado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const reabrirBoleto = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/transactions/${id}/reabrir`, { method: "PUT" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lançamento reaberto" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vencimentos</h1>
          <p className="text-muted-foreground">Faturas de cartão e boletos/PIX do período</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-10 w-[160px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-10 w-[160px]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Faturas</p>
            <p className="text-2xl font-numeric font-semibold">{money(totalFaturas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Boletos/PIX</p>
            <p className="text-2xl font-numeric font-semibold">{money(totalBoletos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-numeric font-semibold">{money(totalFaturas + totalBoletos)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "aberta" | "paga")}>
        <TabsList>
          <TabsTrigger value="aberta">Em aberto</TabsTrigger>
          <TabsTrigger value="paga">Pagos</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-6 mt-4">
          {isLoading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Faturas de cartão
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {faturas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma fatura no período</p>
                  ) : (
                    faturas.map((f) => {
                      const dias = diasAte(f.data_vencimento);
                      const bd = badgeDias(dias);
                      const contaId = contaPorFatura[f.id] || (contasAtivas[0] ? String(contasAtivas[0].id) : "");
                      return (
                        <div
                          key={f.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{f.cartao_nome}</span>
                              <Badge variant="outline" className="text-[10px]">{f.competencia}</Badge>
                              <Badge className={`${bd.className} text-[10px]`}>{bd.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Vence {fmtData(f.data_vencimento)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-numeric font-semibold">{money(Number(f.total) || 0)}</span>
                            {tab === "aberta" ? (
                              <>
                                <Select
                                  value={contaId}
                                  onValueChange={(v) =>
                                    setContaPorFatura((prev) => ({ ...prev, [f.id]: v }))
                                  }
                                >
                                  <SelectTrigger className="w-[180px] h-9">
                                    <SelectValue placeholder="Pagar com..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {contasAtivas.map((c) => (
                                      <SelectItem key={c.id} value={String(c.id)}>
                                        {c.nome}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  disabled={!contaId || pagarFatura.isPending}
                                  onClick={() =>
                                    pagarFatura.mutate({
                                      id: f.id,
                                      conta_bancaria_id: Number(contaId),
                                    })
                                  }
                                >
                                  Pagar
                                </Button>
                              </>
                            ) : (
                              <Badge className="bg-emerald-500/15 text-emerald-600">Paga</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Boletos / PIX / outros
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {boletos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nenhum boleto/PIX no período
                    </p>
                  ) : (
                    boletos.map((b) => {
                      const dataRef = b.data_vencimento || b.data_transacao;
                      return (
                        <div
                          key={b.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{b.descricao}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtData(dataRef)} · {b.forma_pagamento || "—"}
                              {b.categoria ? ` · ${b.categoria}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-numeric font-semibold">{money(Number(b.valor) || 0)}</span>
                            {tab === "aberta" ? (
                              <Button
                                size="sm"
                                disabled={baixarBoleto.isPending}
                                onClick={() => baixarBoleto.mutate(b.id)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Baixar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={reabrirBoleto.isPending}
                                onClick={() => reabrirBoleto.mutate(b.id)}
                              >
                                Reabrir
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
