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
import type { EmpresaConta } from "@shared/schema";

type ContaBanc = { id: number; banco: string; nome?: string | null; ativo?: boolean };

type FaturaVenc = {
  id: number;
  competencia: string;
  data_vencimento: string;
  status: string;
  total: number | string;
  cartao_nome: string;
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
  parcela_num?: number | null;
  parcela_total?: number | null;
};

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function limitesMesAtual() {
  const hoje = new Date();
  return {
    de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
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

export default function PjVencimentos({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mes = limitesMesAtual();
  const [tab, setTab] = useState<"aberta" | "paga">("aberta");
  const [de, setDe] = useState(mes.de);
  const [ate, setAte] = useState(mes.ate);
  const [contaBancPorFatura, setContaBancPorFatura] = useState<Record<number, string>>({});
  const [contaContabPorFatura, setContaContabPorFatura] = useState<Record<number, string>>({});

  const base = `/api/empresas/${empresaId}`;

  const { data, isLoading } = useQuery<{ faturas: FaturaVenc[]; boletos: BoletoVenc[] }>({
    queryKey: [`${base}/vencimentos`, tab, de, ate],
    queryFn: () =>
      apiRequest(
        `${base}/vencimentos?status=${tab}&de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
      ),
    enabled: !!empresaId,
  });

  const { data: bancos = [] } = useQuery<ContaBanc[]>({
    queryKey: [`${base}/contas-bancarias`],
    queryFn: () => apiRequest(`${base}/contas-bancarias`),
    enabled: !!empresaId,
  });
  const bancosAtivos = useMemo(() => bancos.filter((c) => c.ativo !== false), [bancos]);

  const { data: contas = [] } = useQuery<EmpresaConta[]>({
    queryKey: [`${base}/contas`],
    enabled: !!empresaId,
  });
  const contasDespesa = useMemo(() => contas.filter((c) => c.tipo === "Despesa"), [contas]);

  const faturas = data?.faturas ?? [];
  const boletos = data?.boletos ?? [];
  const totalFaturas = faturas.reduce((s, f) => s + (Number(f.total) || 0), 0);
  const totalBoletos = boletos.reduce((s, b) => s + (Number(b.valor) || 0), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`${base}/vencimentos`] });
    qc.invalidateQueries({ queryKey: [`${base}/cartoes-com-saldo`] });
    qc.invalidateQueries({ queryKey: [`${base}/contas-bancarias`] });
    qc.invalidateQueries({ queryKey: [`${base}/transacoes`] });
    qc.invalidateQueries({ queryKey: [`${base}/dashboard/resumo`] });
  };

  const pagarFatura = useMutation({
    mutationFn: ({
      id,
      conta_contabil_id,
      conta_bancaria_id,
    }: {
      id: number;
      conta_contabil_id: number;
      conta_bancaria_id: number;
    }) =>
      apiRequest(`${base}/faturas/${id}/pagar`, {
        method: "POST",
        data: { conta_contabil_id, conta_bancaria_id },
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Fatura paga" });
    },
    onError: (e: any) =>
      toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const baixarBoleto = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`${base}/transacoes/${id}/pagar`, { method: "PUT", data: {} }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lançamento baixado" });
    },
    onError: (e: any) =>
      toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const rotuloBanco = (b: ContaBanc) => b.nome || b.banco;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vencimentos</h1>
          <p className="text-muted-foreground">
            Faturas de cartão e contas a pagar (Pix, boleto, TED…) do período
          </p>
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
            <p className="text-xs text-muted-foreground">Contas a pagar</p>
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
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nenhuma fatura no período
                    </p>
                  ) : (
                    faturas.map((f) => {
                      const dias = diasAte(f.data_vencimento);
                      const bd = badgeDias(dias);
                      const bancId =
                        contaBancPorFatura[f.id] ||
                        (bancosAtivos[0] ? String(bancosAtivos[0].id) : "");
                      const contabId =
                        contaContabPorFatura[f.id] ||
                        (contasDespesa[0] ? String(contasDespesa[0].id) : "");
                      return (
                        <div
                          key={f.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{f.cartao_nome}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {f.competencia}
                              </Badge>
                              <Badge className={`${bd.className} text-[10px]`}>{bd.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Vence {fmtData(f.data_vencimento)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-numeric font-semibold">
                              {money(Number(f.total) || 0)}
                            </span>
                            {tab === "aberta" && (
                              <>
                                <Select
                                  value={contabId}
                                  onValueChange={(v) =>
                                    setContaContabPorFatura((p) => ({ ...p, [f.id]: v }))
                                  }
                                >
                                  <SelectTrigger className="w-[180px] h-9">
                                    <SelectValue placeholder="Classificação" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {contasDespesa.map((c) => (
                                      <SelectItem key={c.id} value={String(c.id)}>
                                        {c.codigo} — {c.nome}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={bancId}
                                  onValueChange={(v) =>
                                    setContaBancPorFatura((p) => ({ ...p, [f.id]: v }))
                                  }
                                >
                                  <SelectTrigger className="w-[160px] h-9">
                                    <SelectValue placeholder="Pagar com..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {bancosAtivos.map((b) => (
                                      <SelectItem key={b.id} value={String(b.id)}>
                                        {rotuloBanco(b)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  disabled={
                                    !bancId ||
                                    !contabId ||
                                    pagarFatura.isPending
                                  }
                                  onClick={() =>
                                    pagarFatura.mutate({
                                      id: f.id,
                                      conta_contabil_id: Number(contabId),
                                      conta_bancaria_id: Number(bancId),
                                    })
                                  }
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" /> Pagar
                                </Button>
                              </>
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
                    <FileText className="h-4 w-4" /> Contas a pagar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {boletos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nenhum lançamento no período
                    </p>
                  ) : (
                    boletos.map((b) => {
                      const dias = diasAte(b.data_vencimento || b.data_transacao);
                      const bd = badgeDias(dias);
                      return (
                        <div
                          key={b.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium truncate">{b.descricao}</span>
                              {b.parcela_num && b.parcela_total && (
                                <Badge variant="outline" className="text-[10px]">
                                  {b.parcela_num}/{b.parcela_total}
                                </Badge>
                              )}
                              <Badge className={`${bd.className} text-[10px]`}>{bd.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Vence {fmtData(b.data_vencimento || b.data_transacao)}
                              {b.categoria ? ` · ${b.categoria}` : ""}
                              {b.forma_pagamento ? ` · ${b.forma_pagamento}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-numeric font-semibold">
                              {money(Number(b.valor) || 0)}
                            </span>
                            {tab === "aberta" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={baixarBoleto.isPending}
                                onClick={() => baixarBoleto.mutate(b.id)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Baixar
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
