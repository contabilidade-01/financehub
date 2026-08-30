import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, HandCoins } from "lucide-react";

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

const fmt = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const mesLabel = (iso: string) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export default function PjReembolsos({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: itens = [], isLoading } = useQuery<ReembolsoPj[]>({
    queryKey: [`/api/empresas/${empresaId}/reembolsos-pessoais`],
    enabled: !!empresaId,
  });

  const pagar = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/empresas/${empresaId}/reembolsos-pessoais/${id}/pagar`, { method: "PUT", credentials: "include" });
      if (!r.ok) throw new Error("Não foi possível marcar como pago.");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/reembolsos-pessoais`] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/dashboard/resumo`] });
      toast({ title: "Reembolso marcado como pago." });
    },
  });

  const pendentes = itens.filter((i) => i.status === "Pendente");
  const totalPend = pendentes.reduce((s, i) => s + Number(i.valor), 0);

  const grupos = new Map<string, ReembolsoPj[]>();
  for (const i of itens) {
    const k = String(i.data_transacao).slice(0, 7);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(i);
  }

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

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Em aberto</p>
            <p className="text-2xl font-numeric font-semibold text-rose-500">{fmt(totalPend)}</p>
          </div>
          <Badge variant="secondary">{pendentes.length} item(ns)</Badge>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum reembolso importado ainda.</CardContent></Card>
      ) : (
        [...grupos.entries()].map(([ym, lista]) => {
          const abertos = lista.filter((x) => x.status === "Pendente");
          const soma = abertos.reduce((s, x) => s + Number(x.valor), 0);
          return (
            <Card key={ym}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize flex items-center justify-between">
                  <span>{mesLabel(lista[0].data_transacao)}</span>
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
