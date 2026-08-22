import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, CreditCard, Lock, CheckCircle2, Trash2, ShoppingCart, FileUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { EmpresaConta } from "@shared/schema";

type Cartao = { id: number; nome: string; bandeira: string | null; dia_fechamento: number; dia_vencimento: number };
type Fatura = { id: number; competencia: string; data_fechamento: string; data_vencimento: string; status: string; total: number };
const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmt = (d: any) => { if (!d) return "—"; try { return new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return String(d); } };
const hoje = () => new Date().toISOString().slice(0, 10);
const stBadge = (s: string) => s === "paga" ? { t: "Paga", c: "bg-emerald-500/15 text-emerald-600" } : s === "fechada" ? { t: "Fechada", c: "bg-amber-500/15 text-amber-600" } : { t: "Aberta", c: "bg-blue-500/15 text-blue-600" };

export default function PjFaturas({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cartaoSel, setCartaoSel] = useState<number | null>(null);
  const [novoCartao, setNovoCartao] = useState(false);
  const [cForm, setCForm] = useState({ nome: "", bandeira: "", limite: "", dia_fechamento: "", dia_vencimento: "" });
  const [comprando, setComprando] = useState(false);
  const [compra, setCompra] = useState({ categoria_id: "", descricao: "", valor: "", data_transacao: hoje() });
  const [faturaAberta, setFaturaAberta] = useState<number | null>(null);
  const [pagando, setPagando] = useState<{ fatura: Fatura } | null>(null);
  const [pag, setPag] = useState({ conta_contabil_id: "", conta_bancaria_id: "", data_pagamento: hoje() });
  const concFileRef = useRef<HTMLInputElement>(null);
  const [conc, setConc] = useState<any>(null);
  const [concLoading, setConcLoading] = useState(false);

  const base = `/api/empresas/${empresaId}`;
  const { data: cartoes = [], isLoading } = useQuery<Cartao[]>({ queryKey: [`${base}/cartoes`], queryFn: () => apiRequest(`${base}/cartoes`), enabled: !!empresaId });
  const { data: contas = [] } = useQuery<EmpresaConta[]>({ queryKey: [`${base}/contas`], queryFn: () => apiRequest(`${base}/contas`), enabled: !!empresaId });
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`${base}/contas-bancarias`], queryFn: () => apiRequest(`${base}/contas-bancarias`), enabled: !!empresaId });

  const cartaoAtivo = cartaoSel ?? (cartoes[0]?.id ?? null);
  const { data: faturasData, isLoading: loadingF } = useQuery<{ cartao: Cartao; faturas: Fatura[] }>({
    queryKey: [`${base}/cartoes`, cartaoAtivo, "faturas"], queryFn: () => apiRequest(`${base}/cartoes/${cartaoAtivo}/faturas`), enabled: cartaoAtivo != null,
  });
  const { data: detalhe } = useQuery<{ fatura: Fatura; compras: any[]; total: number }>({
    queryKey: [`${base}/faturas`, faturaAberta], queryFn: () => apiRequest(`${base}/faturas/${faturaAberta}`), enabled: faturaAberta != null,
  });

  const leaves = useMemo(() => {
    const parents = new Set(contas.map((c) => (c as any).parent_id).filter(Boolean) as number[]);
    return contas.filter((c) => !parents.has(c.id)).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [contas]);

  const inval = () => {
    qc.invalidateQueries({ queryKey: [`${base}/cartoes`, cartaoAtivo, "faturas"] });
    qc.invalidateQueries({ queryKey: [`${base}/relatorios/fluxo-caixa`] });
    if (faturaAberta) qc.invalidateQueries({ queryKey: [`${base}/faturas`, faturaAberta] });
  };

  const createCartao = useMutation({
    mutationFn: (d: any) => apiRequest(`${base}/cartoes`, { method: "POST", data: d }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${base}/cartoes`] }); setNovoCartao(false); setCForm({ nome: "", bandeira: "", limite: "", dia_fechamento: "", dia_vencimento: "" }); toast({ title: "Cartão criado" }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message, variant: "destructive" }),
  });
  const delCartao = useMutation({
    mutationFn: (id: number) => apiRequest(`${base}/cartoes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${base}/cartoes`] }); setCartaoSel(null); toast({ title: "Cartão excluído" }); },
  });
  const addCompra = useMutation({
    mutationFn: (d: any) => apiRequest(`${base}/cartoes/${cartaoAtivo}/compras`, { method: "POST", data: d }),
    onSuccess: () => { inval(); setComprando(false); setCompra({ categoria_id: "", descricao: "", valor: "", data_transacao: hoje() }); toast({ title: "Compra registrada" }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message, variant: "destructive" }),
  });
  const fecharF = useMutation({
    mutationFn: (id: number) => apiRequest(`${base}/faturas/${id}/fechar`, { method: "POST", data: {} }),
    onSuccess: () => { inval(); toast({ title: "Fatura fechada" }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message, variant: "destructive" }),
  });
  const pagarF = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`${base}/faturas/${id}/pagar`, { method: "POST", data }),
    onSuccess: () => { inval(); setPagando(null); setFaturaAberta(null); toast({ title: "Fatura paga", description: "Saída lançada no caixa." }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message, variant: "destructive" }),
  });

  const submitCartao = () => {
    const f = Number(cForm.dia_fechamento), v = Number(cForm.dia_vencimento);
    if (!cForm.nome.trim()) { toast({ title: "Informe o nome", variant: "destructive" }); return; }
    if (!(f >= 1 && f <= 31) || !(v >= 1 && v <= 31)) { toast({ title: "Dias de fechamento/vencimento inválidos", variant: "destructive" }); return; }
    createCartao.mutate({ nome: cForm.nome, bandeira: cForm.bandeira || null, limite: cForm.limite ? Number(cForm.limite.replace(",", ".")) : null, dia_fechamento: f, dia_vencimento: v });
  };
  const submitCompra = () => {
    if (!compra.categoria_id) { toast({ title: "Classifique a conta contábil", variant: "destructive" }); return; }
    if (!compra.descricao.trim() || !compra.valor) { toast({ title: "Preencha descrição e valor", variant: "destructive" }); return; }
    addCompra.mutate({ categoria_id: Number(compra.categoria_id), descricao: compra.descricao, valor: Number(compra.valor.replace(",", ".")), data_transacao: compra.data_transacao });
  };
  const openPagar = (f: Fatura) => { setPagando({ fatura: f }); setPag({ conta_contabil_id: "", conta_bancaria_id: bancos[0] ? String(bancos[0].id) : "", data_pagamento: hoje() }); };
  const confirmPagar = () => {
    if (!pagando) return;
    if (!pag.conta_contabil_id) { toast({ title: "Escolha a conta contábil do pagamento", variant: "destructive" }); return; }
    pagarF.mutate({ id: pagando.fatura.id, data: { conta_contabil_id: Number(pag.conta_contabil_id), conta_bancaria_id: pag.conta_bancaria_id ? Number(pag.conta_bancaria_id) : null, data_pagamento: pag.data_pagamento } });
  };

  const onConcFile = async (file: File) => {
    if (!faturaAberta) return;
    setConcLoading(true); setConc(null);
    try {
      const fd = new FormData(); fd.append("arquivo", file);
      const res = await fetch(`${base}/faturas/${faturaAberta}/conciliar`, { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao conciliar");
      setConc(data); inval();
      toast({ title: "Conciliação concluída", description: `${data.conciliados_qtd} casado(s).` });
    } catch (e: any) { toast({ title: "Erro", description: e?.message, variant: "destructive" }); }
    finally { setConcLoading(false); if (concFileRef.current) concFileRef.current.value = ""; }
  };
  const lancarDoExtrato = (linha: any) => {
    setFaturaAberta(null);
    setCompra({ categoria_id: "", descricao: linha.descricao || "", valor: String(Math.abs(linha.valor)), data_transacao: String(linha.data).slice(0, 10) });
    setComprando(true);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6" /> Faturas de Cartão</h1>
          <p className="text-sm text-muted-foreground">Compras entram como competência; só o pagamento da fatura move o caixa.</p>
        </div>
        <Button onClick={() => setNovoCartao(true)}><Plus className="h-4 w-4 mr-2" /> Novo cartão</Button>
      </div>

      {isLoading ? <Skeleton className="h-28 w-full" /> : cartoes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum cartão PJ. Crie o primeiro.</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {cartoes.map((c) => (
              <button key={c.id} onClick={() => setCartaoSel(c.id)} className={`px-4 py-2 rounded-lg border text-sm text-left ${c.id === cartaoAtivo ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="font-medium flex items-center gap-2"><CreditCard className="h-4 w-4" /> {c.nome}</div>
                <div className="text-xs text-muted-foreground">Fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</div>
              </button>
            ))}
            {cartaoAtivo && <Button size="sm" variant="outline" onClick={() => setComprando(true)}><ShoppingCart className="h-4 w-4 mr-1" /> Registrar compra</Button>}
          </div>

          {loadingF ? <Skeleton className="h-40 w-full" /> : !faturasData || faturasData.faturas.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma fatura ainda. Registre compras neste cartão.</CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {faturasData.faturas.map((f) => {
                const sb = stBadge(f.status);
                return (
                  <Card key={f.id} className="cursor-pointer hover:border-primary/50" onClick={() => setFaturaAberta(f.id)}>
                    <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">{f.competencia}</CardTitle><Badge className={sb.c}>{sb.t}</Badge></div></CardHeader>
                    <CardContent className="space-y-1"><div className="text-lg font-bold">{money(f.total)}</div><div className="text-xs text-muted-foreground">Vence {fmt(f.data_vencimento)}</div></CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {faturasData?.cartao && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => delCartao.mutate(faturasData.cartao.id)}><Trash2 className="h-4 w-4 mr-1" /> Excluir cartão {faturasData.cartao.nome}</Button>}
        </>
      )}

      {/* Novo cartão */}
      <Dialog open={novoCartao} onOpenChange={setNovoCartao}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo cartão PJ</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nome *</Label><Input value={cForm.nome} onChange={(e) => setCForm({ ...cForm, nome: e.target.value })} placeholder="Ex.: Inter Empresas" /></div>
              <div className="space-y-1.5"><Label>Bandeira</Label><Input value={cForm.bandeira} onChange={(e) => setCForm({ ...cForm, bandeira: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Limite</Label><Input value={cForm.limite} onChange={(e) => setCForm({ ...cForm, limite: e.target.value })} inputMode="decimal" /></div>
              <div className="space-y-1.5"><Label>Fecha dia *</Label><Input value={cForm.dia_fechamento} onChange={(e) => setCForm({ ...cForm, dia_fechamento: e.target.value })} inputMode="numeric" /></div>
              <div className="space-y-1.5"><Label>Vence dia *</Label><Input value={cForm.dia_vencimento} onChange={(e) => setCForm({ ...cForm, dia_vencimento: e.target.value })} inputMode="numeric" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNovoCartao(false)}>Cancelar</Button><Button onClick={submitCartao} disabled={createCartao.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar compra */}
      <Dialog open={comprando} onOpenChange={setComprando}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar compra no cartão</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Descrição *</Label><Input value={compra.descricao} onChange={(e) => setCompra({ ...compra, descricao: e.target.value })} placeholder="Ex.: Material de escritório" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Valor *</Label><Input value={compra.valor} onChange={(e) => setCompra({ ...compra, valor: e.target.value })} inputMode="decimal" placeholder="0,00" /></div>
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={compra.data_transacao} onChange={(e) => setCompra({ ...compra, data_transacao: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Conta contábil *</Label>
              <Select value={compra.categoria_id} onValueChange={(v) => setCompra({ ...compra, categoria_id: v })}>
                <SelectTrigger><SelectValue placeholder="Classificar" /></SelectTrigger>
                <SelectContent>{leaves.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.codigo} — {c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setComprando(false)}>Cancelar</Button><Button onClick={submitCompra} disabled={addCompra.isPending}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe fatura */}
      <Dialog open={faturaAberta != null} onOpenChange={(o) => { if (!o) { setFaturaAberta(null); setConc(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Fatura {detalhe?.fatura?.competencia}</DialogTitle></DialogHeader>
          {!detalhe ? <Skeleton className="h-40" /> : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Vencimento {fmt(detalhe.fatura.data_vencimento)}</span><Badge className={stBadge(detalhe.fatura.status).c}>{stBadge(detalhe.fatura.status).t}</Badge></div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border/40 border rounded-md">
                {detalhe.compras.length === 0 ? <div className="p-4 text-center text-sm text-muted-foreground">Sem compras.</div> :
                  detalhe.compras.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0"><div className="truncate">{c.descricao}</div><div className="text-xs text-muted-foreground">{fmt(c.data_transacao)} · {c.categoria_codigo} {c.categoria_nome}</div></div>
                      <div className="font-medium shrink-0">{money(Number(c.valor))}</div>
                    </div>
                  ))}
              </div>
              <div className="flex items-center justify-between font-bold"><span>Total</span><span>{money(detalhe.total)}</span></div>

              {/* Conciliar extrato do cartão */}
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1"><FileUp className="h-4 w-4" /> Conciliar extrato do cartão</span>
                  <input ref={concFileRef} type="file" accept=".ofx,.csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onConcFile(f); }} />
                  <Button size="sm" variant="outline" onClick={() => concFileRef.current?.click()} disabled={concLoading}>{concLoading ? "Lendo…" : "Importar OFX/CSV/Excel"}</Button>
                </div>
                {conc && (
                  <div className="text-xs space-y-2">
                    <div className="flex flex-wrap gap-3">
                      <span className="text-emerald-600">✅ {conc.conciliados_qtd} casado(s)</span>
                      <span className="text-amber-600">⚠ {conc.extrato_sem_par.length} no extrato sem lançamento</span>
                      <span className="text-blue-600">ℹ {conc.compras_sem_par.length} lançado(s) fora do extrato</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-muted-foreground">
                      <span>Extrato: <strong>{money(conc.total_extrato)}</strong></span>
                      <span>Fatura: <strong>{money(conc.total_fatura)}</strong></span>
                      <span>Diferença: <strong className={Math.abs(conc.diferenca) > 0.005 ? "text-rose-500" : "text-emerald-600"}>{money(conc.diferenca)}</strong></span>
                    </div>
                    {conc.extrato_sem_par.length > 0 && (
                      <div className="border-t pt-2">
                        <div className="text-muted-foreground mb-1">No extrato, mas não lançado (clique para lançar):</div>
                        {conc.extrato_sem_par.slice(0, 20).map((l: any, i: number) => (
                          <button key={i} onClick={() => lancarDoExtrato(l)} className="flex w-full items-center justify-between px-2 py-1 rounded hover:bg-muted text-left">
                            <span className="truncate">{fmt(l.data)} · {l.descricao}</span>
                            <span className="font-medium shrink-0">{money(Math.abs(l.valor))} ＋</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                {detalhe.fatura.status === "aberta" && <Button variant="outline" onClick={() => fecharF.mutate(detalhe.fatura.id)} disabled={fecharF.isPending}><Lock className="h-4 w-4 mr-1" /> Fechar</Button>}
                {detalhe.fatura.status !== "paga" && <Button onClick={() => openPagar({ ...detalhe.fatura, total: detalhe.total })} disabled={detalhe.total <= 0}><CheckCircle2 className="h-4 w-4 mr-1" /> Pagar</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pagar */}
      <Dialog open={!!pagando} onOpenChange={(o) => !o && setPagando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pagar fatura {pagando?.fatura.competencia}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{money(Number(pagando?.fatura.total || 0))}</strong> · lança a saída no caixa.</div>
            <div className="space-y-1.5">
              <Label>Conta contábil (classificação) *</Label>
              <Select value={pag.conta_contabil_id} onValueChange={(v) => setPag({ ...pag, conta_contabil_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{leaves.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.codigo} — {c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Conta bancária</Label>
                <Select value={pag.conta_bancaria_id || "none"} onValueChange={(v) => setPag({ ...pag, conta_bancaria_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Nenhuma</SelectItem>{bancos.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.banco}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={pag.data_pagamento} onChange={(e) => setPag({ ...pag, data_pagamento: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPagando(null)}>Cancelar</Button><Button onClick={confirmPagar} disabled={pagarF.isPending}>Confirmar pagamento</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
