import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, HandCoins } from "lucide-react";
import PeriodoSelector from "@/components/shared/PeriodoSelector";
import { Periodo, rangeDoPeriodo, rotuloPeriodo } from "@/lib/period";

interface ReembolsoPj {
  id: number;
  descricao: string;
  valor: string;
  data_transacao: string;
  data_vencimento: string | null;
  status: string;
  itens_agrupados: number | null;
  metodo_pagamento: string | null;
  categoria: string | null;
  categoria_codigo: string | null;
}

type StatusFiltro = "todos" | "Pendente" | "Efetivada";

const fmt = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const mesLabel = (iso: string) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const dataRef = (i: ReembolsoPj) => String(i.data_vencimento || i.data_transacao).slice(0, 10);

const OPCOES: Periodo[] = ["all", "current_month", "next_month", "next_3m", "next_12m", "current_year", "custom"];

export default function PjReembolsos({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [periodo, setPeriodo] = useState<Periodo>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState<StatusFiltro>("todos");

  const range = rangeDoPeriodo(periodo, customFrom, customTo);
  const periodoPronto = periodo !== "custom" || Boolean(range.de && range.ate);

  const params = new URLSearchParams();
  if (range.de) params.set("de", range.de);
  if (range.ate) params.set("ate", range.ate);
  if (status !== "todos") params.set("status", status);
  const qs = params.toString();
  const url = `/api/empresas/${empresaId}/reembolsos-pessoais${qs ? `?${qs}` : ""}`;

  const { data: itens = [], isLoading, isFetching } = useQuery<ReembolsoPj[]>({
    queryKey: [url],
    enabled: !!empresaId && periodoPronto,
  });

  const pagar = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/empresas/${empresaId}/reembolsos-pessoais/${id}/pagar`, { method: "PUT", credentials: "include" });
      if (!r.ok) throw new Error("Não foi possível marcar como pago.");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/reembolsos-pessoais") });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/dashboard/resumo") });
      toast({ title: "Reembolso marcado como pago." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const pendentes = itens.filter((i) => i.status === "Pendente");
  const totalPend = pendentes.reduce((s, i) => s + Number(i.valor), 0);
  const pagos = itens.filter((i) => i.status !== "Pendente");
  const totalPago = pagos.reduce((s, i) => s + Number(i.valor), 0);
  const itensAgrupados = pendentes.reduce((s, i) => s + (i.itens_agrupados || 1), 0);

  const grupos = new Map<string, ReembolsoPj[]>();
  for (const i of itens) {
    const k = dataRef(i).slice(0, 7);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(i);
  }
  const ordenados = [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-4 p-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HandCoins className="h-6 w-6" /> Reembolsos a Pagar — Pessoal
        </h1>
        <p className="text-muted-foreground text-sm">
          Valores que a empresa deve à pessoa (gastos no cartão/bolso pessoal). Separado das contas operacionais.
        </p>
      </div>

      <div className="space-y-3">
        <PeriodoSelector
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          opcoes={OPCOES}
        />
        <div className="flex flex-wrap gap-2">
          {([
            ["todos", "Todos"],
            ["Pendente", "Em aberto"],
            ["Efetivada", "Pagos"],
          ] as [StatusFiltro, string][]).map(([v, label]) => (
            <Button
              key={v}
              size="sm"
              variant={status === v ? "secondary" : "ghost"}
              onClick={() => setStatus(v)}
              className="h-7 text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Em aberto · {rotuloPeriodo(periodo, range.de, range.ate)}</p>
              <p className="text-2xl font-numeric font-semibold text-rose-500">{fmt(totalPend)}</p>
            </div>
            <Badge variant="secondary">{itensAgrupados} item(ns)</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Já reembolsado no período</p>
              <p className="text-2xl font-numeric font-semibold text-emerald-600">{fmt(totalPago)}</p>
            </div>
            <Badge variant="outline">{pagos.length} lote(s)</Badge>
          </CardContent>
        </Card>
      </div>

      {!periodoPronto ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Informe as datas inicial e final.</CardContent></Card>
      ) : isLoading || isFetching ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum reembolso {periodo === "all" && status === "todos" ? "importado ainda" : "nesse filtro"}.
          </CardContent>
        </Card>
      ) : (
        ordenados.map(([ym, lista]) => {
          const abertos = lista.filter((x) => x.status === "Pendente");
          const soma = abertos.reduce((s, x) => s + Number(x.valor), 0);
          return (
            <Card key={ym}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize flex items-center justify-between">
                  <span>{mesLabel(dataRef(lista[0]))}</span>
                  <span className="text-sm font-numeric font-normal text-rose-500">{fmt(soma)}</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {lista.length} iten{lista.length === 1 ? "" : "s"} · {abertos.length} em aberto
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {lista.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 border-t pt-2">
                    <div>
                      <p className="font-medium text-sm">{item.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.categoria_codigo ? `${item.categoria_codigo} — ` : ""}{item.categoria}
                        {item.itens_agrupados ? ` · ${item.itens_agrupados} itens` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-numeric text-sm">{fmt(item.valor)}</p>
                      {item.status === "Pendente" ? (
                        <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => pagar.mutate(item.id)} disabled={pagar.isPending}>
                          Marcar pago
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Pago</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
