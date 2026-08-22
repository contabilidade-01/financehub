import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, RefreshCw, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Assinatura = {
  id: number; nome: string; telefone: string | null; email: string;
  tipo_pessoa: "fisica" | "juridica"; ativo: boolean;
  status_assinatura: string | null; ciclo_assinatura: string | null;
  data_expiracao_assinatura: string | null;
  situacao: string; dias_para_vencer: number | null;
};

const CICLOS = [
  { value: "mensal", label: "Mensal", meses: 1 },
  { value: "trimestral", label: "Trimestral", meses: 3 },
  { value: "anual", label: "Anual", meses: 12 },
];
const cicloLabel = (c: string | null) => CICLOS.find((x) => x.value === c)?.label ?? "—";
const fmtDate = (d: string | null) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return "—"; } };
const hoje = () => new Date().toISOString().slice(0, 10);
const addMesesISO = (iso: string, meses: number) => { const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + meses); return d.toLocaleDateString("pt-BR"); };

const SIT: Record<string, { label: string; cls: string }> = {
  em_dia: { label: "Em dia", cls: "bg-emerald-500/15 text-emerald-600" },
  vence_breve: { label: "Vence em breve", cls: "bg-amber-500/15 text-amber-600" },
  vencido: { label: "Vencido", cls: "bg-rose-500/15 text-rose-600" },
  degustacao: { label: "Degustação", cls: "bg-blue-500/15 text-blue-600" },
  sem_data: { label: "Sem plano", cls: "bg-muted text-muted-foreground" },
};

export default function AdminAssinaturas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<string>("todos");
  const [definindo, setDefinindo] = useState<Assinatura | null>(null);
  const [form, setForm] = useState({ ciclo: "mensal", inicio: hoje() });
  const [linkCobranca, setLinkCobranca] = useState<string>("");

  const { data: lista = [], isLoading } = useQuery<Assinatura[]>({
    queryKey: ["/api/admin/assinaturas"],
    queryFn: () => apiRequest("/api/admin/assinaturas"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/assinaturas"] });

  const definirMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/admin/assinaturas/${id}/definir`, { method: "POST", data }),
    onSuccess: () => { invalidate(); setDefinindo(null); toast({ title: "Assinatura definida" }); },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err?.message || "Falha", variant: "destructive" }),
  });
  const renovarMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/assinaturas/${id}/renovar`, { method: "POST", data: {} }),
    onSuccess: () => { invalidate(); toast({ title: "Assinatura renovada" }); },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err?.message || "Defina o ciclo antes de renovar", variant: "destructive" }),
  });
  const linkMut = useMutation({
    mutationFn: ({ id, ciclo }: { id: number; ciclo: string }) => apiRequest(`/api/admin/assinaturas/${id}/gerar-link`, { method: "POST", data: { ciclo } }),
    onSuccess: (r: any) => { setLinkCobranca(r?.url || ""); toast({ title: "Link gerado", description: "Copie e envie ao cliente." }); },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err?.message || "Falha ao gerar link", variant: "destructive" }),
  });

  const resumo = useMemo(() => {
    const r = { total: lista.length, em_dia: 0, vence_breve: 0, vencido: 0, degustacao: 0 };
    for (const a of lista) { if (a.situacao in r) (r as any)[a.situacao]++; }
    return r;
  }, [lista]);

  const filtrada = filtro === "todos" ? lista : lista.filter((a) => a.situacao === filtro);

  const openDefinir = (a: Assinatura) => { setDefinindo(a); setForm({ ciclo: a.ciclo_assinatura || "mensal", inicio: hoje() }); setLinkCobranca(""); };
  const cicloMeses = CICLOS.find((c) => c.value === form.ciclo)?.meses ?? 1;

  return (
    <div className="space-y-6 p-2">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarClock className="h-6 w-6" /> Assinaturas & Vencimentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Defina o ciclo (mensal/trimestral/anual) de cada cliente e acompanhe os vencimentos. Cobrança automática virá depois.</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: "total", label: "Total", v: resumo.total, cls: "" },
          { k: "em_dia", label: "Em dia", v: resumo.em_dia, cls: "text-emerald-600" },
          { k: "vence_breve", label: "Vence ≤7d", v: resumo.vence_breve, cls: "text-amber-600" },
          { k: "vencido", label: "Vencidos", v: resumo.vencido, cls: "text-rose-600" },
          { k: "degustacao", label: "Degustação", v: resumo.degustacao, cls: "text-blue-600" },
        ].map((c) => (
          <Card key={c.k} className={filtro === c.k || (c.k === "total" && filtro === "todos") ? "ring-1 ring-primary" : "cursor-pointer"} onClick={() => setFiltro(c.k === "total" ? "todos" : c.k)}>
            <CardContent className="p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{c.label}</div>
              <div className={`text-2xl font-bold ${c.cls}`}>{c.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={filtro} onValueChange={setFiltro}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="vencido">Vencidos</TabsTrigger>
          <TabsTrigger value="vence_breve">Vence em breve</TabsTrigger>
          <TabsTrigger value="degustacao">Degustação</TabsTrigger>
          <TabsTrigger value="em_dia">Em dia</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtrada.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum cliente nesta situação.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtrada.map((a) => {
            const s = SIT[a.situacao] ?? SIT.sem_data;
            return (
              <Card key={a.id}>
                <CardContent className="p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium flex items-center gap-2">
                      {a.nome}
                      <Badge variant="outline" className="text-[10px]">{a.tipo_pessoa === "juridica" ? "PJ" : "PF"}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{a.telefone || a.email}</div>
                  </div>
                  <div className="text-sm text-center min-w-[90px]">
                    <div className="text-xs text-muted-foreground">Ciclo</div>
                    <div className="font-medium">{cicloLabel(a.ciclo_assinatura)}</div>
                  </div>
                  <div className="text-sm text-center min-w-[110px]">
                    <div className="text-xs text-muted-foreground">Vencimento</div>
                    <div className="font-medium">{fmtDate(a.data_expiracao_assinatura)}</div>
                    {a.dias_para_vencer != null && (
                      <div className="text-[11px] text-muted-foreground">{a.dias_para_vencer < 0 ? `há ${-a.dias_para_vencer}d` : `em ${a.dias_para_vencer}d`}</div>
                    )}
                  </div>
                  <Badge className={s.cls}>{s.label}</Badge>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => renovarMut.mutate(a.id)} disabled={!a.ciclo_assinatura || renovarMut.isPending}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Renovar
                    </Button>
                    <Button size="sm" onClick={() => openDefinir(a)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Definir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog definir assinatura */}
      <Dialog open={!!definindo} onOpenChange={(o) => !o && setDefinindo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Definir assinatura — {definindo?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ciclo</Label>
                <Select value={form.ciclo} onValueChange={(v) => setForm({ ...form, ciclo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CICLOS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Vencimento calculado: <strong className="text-foreground">{addMesesISO(form.inicio, cicloMeses)}</strong> ({cicloMeses} {cicloMeses === 1 ? "mês" : "meses"}).
            </div>

            {/* Cobrança automática (Asaas) — gera link para o cliente pagar */}
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="text-xs text-muted-foreground">
                <strong>Cobrança automática (Asaas):</strong> gera um link para o cliente preencher CPF/CNPJ e pagar — a assinatura recorrente é criada com o ciclo <strong>{form.ciclo}</strong>.
              </div>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => definindo && linkMut.mutate({ id: definindo.id, ciclo: form.ciclo })} disabled={linkMut.isPending}>
                {linkMut.isPending ? "Gerando…" : "Gerar link de cobrança"}
              </Button>
              {linkCobranca && (
                <div className="flex items-center gap-2">
                  <Input readOnly value={linkCobranca} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(linkCobranca); toast({ title: "Link copiado" }); }}>Copiar</Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefinindo(null)}>Cancelar</Button>
            <Button onClick={() => definindo && definirMut.mutate({ id: definindo.id, data: { ciclo: form.ciclo, inicio: form.inicio } })} disabled={definirMut.isPending}>
              {definirMut.isPending ? "Salvando…" : "Ativar manual"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
