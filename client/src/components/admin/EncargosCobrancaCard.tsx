import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Encargos = { multa: number; jurosMes: number; multaMaxima: number; jurosMesMaximo: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Multa e juros de atraso das mensalidades (enviados ao Asaas). */
export function EncargosCobrancaCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Encargos>({
    queryKey: ["/api/admin/cobranca/encargos"],
    queryFn: () => apiRequest("/api/admin/cobranca/encargos"),
  });
  const [multa, setMulta] = useState("2");
  const [juros, setJuros] = useState("1");
  useEffect(() => {
    if (data) {
      setMulta(String(data.multa).replace(".", ","));
      setJuros(String(data.jurosMes).replace(".", ","));
    }
  }, [data]);

  const num = (s: string) => Number(String(s).replace(",", "."));
  const exemplo = (() => {
    const m = num(multa), j = num(juros);
    if (!Number.isFinite(m) || !Number.isFinite(j)) return null;
    const v = 200, dias = 3;
    const total = v + v * (m / 100) + v * (j / 100) * (dias / 30);
    return `Ex.: mensalidade de ${brl(v)} paga ${dias} dias depois do vencimento → ${brl(Math.round(total * 100) / 100)}.`;
  })();

  const salvar = useMutation({
    mutationFn: () => apiRequest("/api/admin/cobranca/encargos", { method: "PUT", data: { multa: num(multa), jurosMes: num(juros) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cobranca/encargos"] });
      toast({ title: "Encargos salvos", description: "Valem para as novas assinaturas. Use “Aplicar às assinaturas atuais” para as que já existem." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message || "Valores inválidos", variant: "destructive" }),
  });
  const aplicar = useMutation({
    mutationFn: () => apiRequest<{ total: number; atualizadas: number; falhas: { assinatura: string; motivo: string }[] }>("/api/admin/cobranca/encargos/aplicar", { method: "POST", data: {} }),
    onSuccess: (r) => toast({
      title: `Asaas atualizado: ${r.atualizadas}/${r.total} assinatura(s)`,
      description: r.falhas.length ? `${r.falhas.length} falha(s): ${r.falhas.slice(0, 3).map((f) => f.motivo).join("; ")}` : "Inclui as cobranças em aberto dessas assinaturas.",
      variant: r.falhas.length ? "destructive" : undefined,
    }),
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message || "Falha ao atualizar o Asaas", variant: "destructive" }),
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Multa e juros de atraso</CardTitle>
        <CardDescription>
          Enviados ao Asaas em cada assinatura. A multa entra uma vez no dia seguinte ao vencimento; os juros correm por dia.
          A tolerância de 3 dias é só de acesso — os encargos correm desde o vencimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="multa">Multa (%)</Label>
            <Input id="multa" inputMode="decimal" value={multa} onChange={(e) => setMulta(e.target.value)} />
            <p className="text-xs text-muted-foreground">Máx. {data?.multaMaxima ?? 2}% (CDC)</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="juros">Juros (% ao mês)</Label>
            <Input id="juros" inputMode="decimal" value={juros} onChange={(e) => setJuros(e.target.value)} />
            <p className="text-xs text-muted-foreground">Usual: 1% a.m.</p>
          </div>
        </div>
        {exemplo && <p className="text-sm text-muted-foreground">{exemplo}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          <Button variant="outline" onClick={() => aplicar.mutate()} disabled={aplicar.isPending || salvar.isPending}>
            {aplicar.isPending ? "Atualizando o Asaas…" : "Aplicar às assinaturas atuais"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
