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
import { rotuloModalidade } from "@shared/modalidade";

type Assinatura = {
  id: number; nome: string; telefone: string | null; email: string;
  tipo_pessoa: "fisica" | "juridica"; porte_pj?: string | null; ativo: boolean;
  status_assinatura: string | null; ciclo_assinatura: string | null;
  data_expiracao_assinatura: string | null;
  situacao: string; dias_para_vencer: number | null;
  com_consultoria?: boolean; plano_forcado_id?: number | null;
  conferido_em?: string | null; conferido_origem?: string | null;
};

// Conferência automática no Asaas: cada cliente a cada 5h (a manual reinicia).
const JANELA_CONFERENCIA_H = 5;
const horaSP = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function textoConferencia(a: Assinatura): string {
  if (!a.conferido_em) return "Pagamento ainda não conferido no Asaas";
  const em = new Date(a.conferido_em);
  const proxima = new Date(em.getTime() + JANELA_CONFERENCIA_H * 3_600_000);
  const como = a.conferido_origem === "manual" ? "manual" : "automática";
  return `Conferido ${horaSP(em)} (${como}) · próxima automática após ${horaSP(proxima)}`;
}

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
  em_dia: { label: "Em dia", cls: "bg-emerald-500/15 text-income" },
  vence_breve: { label: "Vence em breve", cls: "bg-amber-500/15 text-amber-600" },
  vencido: { label: "Vencido", cls: "bg-rose-500/15 text-expense" },
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

  // Preços vêm dos planos (editáveis em Pagamentos), não de valores fixos.
  const { data: planos = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/subscription-plans"],
    queryFn: () => apiRequest("/api/admin/subscription-plans"),
  });
  const fmt = (v?: string | number | null) =>
    v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const precoConsultoria = fmt(planos.find((p) => p.planCode === "mensal_pj_consultoria")?.priceMonthly);
  const precoBase = (a?: { porte_pj?: string | null } | null) => {
    const ativos = planos.filter((p) => p.active && p.tipoPessoa === "juridica");
    const porte = a?.porte_pj === "me" ? "me" : "mei";
    const doPorte = ativos.filter((p) => p.portePj === porte);
    const lista = doPorte.length ? doPorte : ativos.filter((p) => !p.portePj);
    return fmt(lista.sort((x, y) => Number(x.priceMonthly) - Number(y.priceMonthly))[0]?.priceMonthly);
  };

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
  const sincronizarMut = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/assinaturas/${id}/sincronizar-asaas`, { method: "POST", data: {} }),
    onSuccess: (r: any) => {
      invalidate();
      if (r?.ativado) {
        toast({ title: "Pagamento reconhecido", description: `Acesso liberado até ${r.acessoAte ? new Date(r.acessoAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}.` });
      } else {
        toast({ title: "Nada a liberar", description: `${r?.motivo || (r?.pagos ? "Os pagamentos do Asaas já estão refletidos." : "Nenhum pagamento confirmado no Asaas.")} A conferência automática deste cliente volta em ${JANELA_CONFERENCIA_H}h.` });
      }
    },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err?.message || "Falha ao consultar o Asaas", variant: "destructive" }),
  });
  const consultoriaMut = useMutation({
    mutationFn: ({ id, ativar }: { id: number; ativar: boolean }) => apiRequest(`/api/admin/assinaturas/${id}/consultoria`, { method: "POST", data: { ativar } }),
    onSuccess: (r: any, vars) => {
      invalidate();
      const alvo = lista.find((x) => x.id === vars.id);
      const base = r?.com_consultoria ? `Marcado: R$ ${precoConsultoria} (com consultoria)` : `Voltou ao padrão: R$ ${precoBase(alvo)}`;
      const desc = r?.asaas?.atualizado
        ? "Valor já sincronizado no Asaas (recorrência e cobrança em aberto)."
        : (r?.asaas?.motivo || "Vale na próxima cobrança/renovação.");
      toast({ title: base, description: desc });
    },
    onError: (err: any) => toast({ title: "Erro", description: err?.error || err?.message || "Falha", variant: "destructive" }),
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
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><CalendarClock className="h-6 w-6" /> Assinaturas & Vencimentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Defina o ciclo (mensal/trimestral/anual) de cada cliente e acompanhe os vencimentos. Cobrança automática virá depois.</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: "total", label: "Total", v: resumo.total, cls: "" },
          { k: "em_dia", label: "Em dia", v: resumo.em_dia, cls: "text-income" },
          { k: "vence_breve", label: "Vence ≤7d", v: resumo.vence_breve, cls: "text-amber-600" },
          { k: "vencido", label: "Vencidos", v: resumo.vencido, cls: "text-expense" },
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
                      <Badge variant="outline" className="text-xs">{rotuloModalidade(a, true)}</Badge>
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
                      <div className="text-xs text-muted-foreground">{a.dias_para_vencer < 0 ? `há ${-a.dias_para_vencer}d` : `em ${a.dias_para_vencer}d`}</div>
                    )}
                    {a.conferido_em && (
                      <div className="text-[11px] text-muted-foreground" title={textoConferencia(a)}>
                        Asaas: {horaSP(new Date(a.conferido_em))}{a.conferido_origem === "manual" ? " (manual)" : ""}
                      </div>
                    )}
                  </div>
                  <Badge className={s.cls}>{s.label}</Badge>
                  {a.tipo_pessoa === "juridica" && (
                    <button
                      type="button"
                      onClick={() => consultoriaMut.mutate({ id: a.id, ativar: !a.com_consultoria })}
                      disabled={consultoriaMut.isPending}
                      title={`Alternar cobrança: Base (R$ ${precoBase(a)}) ↔ Com consultoria (R$ ${precoConsultoria})`}
                      className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${a.com_consultoria ? "bg-violet-500/15 text-violet-600 border-violet-500/30" : "bg-muted text-muted-foreground border-transparent hover:bg-muted/70"}`}
                    >
                      {a.com_consultoria ? `Consultoria R$ ${precoConsultoria}` : `Base R$ ${precoBase(a)}`}
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" title={`Confere agora no Asaas se o cliente pagou e libera o acesso. ${textoConferencia(a)}`} onClick={() => sincronizarMut.mutate(a.id)} disabled={sincronizarMut.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Conferir pagamento
                    </Button>
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
                <strong>Cobrança no Asaas:</strong> envia nome, e-mail e telefone que já temos e abre a página do Asaas. O cliente só completa o que faltar (CPF/cartão/Pix). O acesso libera sozinho quando o pagamento confirmar. Ciclo: <strong>{form.ciclo}</strong>.
              </div>
              {definindo?.tipo_pessoa === "juridica" && (() => {
                const atualDef = lista.find((a) => a.id === definindo.id);
                const comConsult = atualDef?.com_consultoria ?? false;
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1.5">
                    <span className="text-xs">
                      Valor que será cobrado:{" "}
                      <strong className={comConsult ? "text-violet-600" : ""}>
                        {comConsult ? `Consultoria — R$ ${precoConsultoria}` : `Base — R$ ${precoBase(atualDef)}`}
                      </strong>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={consultoriaMut.isPending}
                      onClick={() => consultoriaMut.mutate({ id: definindo.id, ativar: !comConsult })}
                    >
                      {comConsult ? `Mudar para Base (${precoBase(atualDef)})` : `Cobrar Consultoria (${precoConsultoria})`}
                    </Button>
                  </div>
                );
              })()}
              <Button size="sm" variant="secondary" className="w-full" onClick={() => definindo && linkMut.mutate({ id: definindo.id, ciclo: form.ciclo })} disabled={linkMut.isPending || consultoriaMut.isPending}>
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
