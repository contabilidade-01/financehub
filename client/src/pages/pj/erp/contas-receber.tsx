import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CategoriaCombobox } from "@/components/importacao/CategoriaCombobox";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";
import type { Contato } from "./contatos";
import type { CentroCusto } from "./centros-custo";

interface Receber {
  id: number;
  descricao: string;
  valor: string;
  status: "Pendente" | "Efetivada";
  data_transacao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  contato_nome: string | null;
  centro_nome: string | null;
  conta_codigo: string | null;
  conta_nome: string | null;
  conta_bancaria_nome: string | null;
}
interface Resposta {
  linhas: Receber[];
  resumo: { total_aberto: number; vencido: number; vence_7_dias: number; recebido_periodo: number };
  hoje: string;
}

export default function ContasReceberPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <ContasReceber empresaId={empresaId} />
    </SomenteErp>
  );
}

function ContasReceber({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"aberto" | "recebido" | "todos">("aberto");
  const [periodo, setPeriodo] = useState({ de: "", ate: "" });
  const url = `/api/empresas/${empresaId}/erp/receber?status=${status}&de=${periodo.de}&ate=${periodo.ate}`;
  const { data, isLoading } = useQuery<Resposta>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: plano = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas`) });
  const { data: contas = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`) });
  const { data: centros = [] } = useQuery<CentroCusto[]>({ queryKey: [`/api/empresas/${empresaId}/erp/centros-custo`], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/centros-custo`) });
  const { data: clientes = [] } = useQuery<Contato[]>({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`, "cliente"], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/contatos?tipo=cliente`) });
  const categorias = useMemo(() => plano.filter((c) => c.ativo !== false).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, codigo: c.codigo })), [plano]);

  const invalidar = () => {
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes(`/api/empresas/${empresaId}/erp/`) });
  };

  const [novo, setNovo] = useState<null | { descricao: string; valor: string; data_vencimento: string; data_competencia: string; parcelas: string; categoria_id: number | null; contato_id: number | null; centro_custo_id: string }>(null);
  const [baixa, setBaixa] = useState<null | { l: Receber; conta_bancaria_id: string; data_pagamento: string }>(null);
  const [salvando, setSalvando] = useState(false);

  const criarConta = async (nome: string, tipo: "Receita" | "Despesa") => {
    try {
      const c = await apiErp<{ id: number }>(`/api/empresas/${empresaId}/erp/contas-plano`, { method: "POST", body: { nome, tipo } });
      await qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas`] });
      return c.id;
    } catch (e: any) {
      toast({ title: "Não foi possível criar a conta", description: e?.message, variant: "destructive" });
      return null;
    }
  };

  const salvarNovo = async () => {
    if (!novo) return;
    setSalvando(true);
    try {
      const r = await apiErp<{ criados: any[] }>(`/api/empresas/${empresaId}/erp/receber`, {
        method: "POST",
        body: {
          ...novo,
          valor: novo.valor.replace(/\./g, "").replace(",", "."),
          parcelas: Number(novo.parcelas) || 1,
          centro_custo_id: novo.centro_custo_id || null,
          data_competencia: novo.data_competencia || undefined,
        },
      });
      toast({ title: r.criados.length > 1 ? `${r.criados.length} parcelas criadas` : "Conta a receber criada" });
      setNovo(null);
      invalidar();
    } catch (e: any) {
      toast({ title: "Não foi possível salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const salvarBaixa = async () => {
    if (!baixa) return;
    setSalvando(true);
    try {
      await apiErp(`/api/empresas/${empresaId}/erp/receber/${baixa.l.id}/baixa`, {
        method: "POST",
        body: { conta_bancaria_id: Number(baixa.conta_bancaria_id), data_pagamento: baixa.data_pagamento },
      });
      toast({ title: "Recebimento registrado", description: `${brl(baixa.l.valor)} entrou em caixa.` });
      setBaixa(null);
      invalidar();
    } catch (e: any) {
      toast({ title: "Não foi possível registrar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const hoje = data?.hoje || new Date().toISOString().slice(0, 10);
  const situacao = (l: Receber) => {
    if (l.status === "Efetivada") return <Badge variant="secondary" className="font-normal">Recebido {dataBr(l.data_pagamento)}</Badge>;
    const venc = String(l.data_vencimento || l.data_transacao).slice(0, 10);
    if (venc < hoje) return <Badge variant="destructive" className="font-normal">Vencido</Badge>;
    return <Badge variant="outline" className="font-normal">Em aberto</Badge>;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <CabecalhoPagina
        titulo="Contas a receber"
        descricao="Vendas a prazo, boletos e parcelas de clientes. Ao receber, o valor entra na conta bancária escolhida."
        acoes={
          <Button onClick={() => setNovo({ descricao: "", valor: "", data_vencimento: hoje, data_competencia: hoje, parcelas: "1", categoria_id: null, contato_id: null, centro_custo_id: "" })}>
            <Plus className="mr-2 h-4 w-4" />Nova conta a receber
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { rotulo: "Em aberto", valor: data?.resumo.total_aberto },
          { rotulo: "Vencido", valor: data?.resumo.vencido, destaque: "text-red-700 dark:text-red-400" },
          { rotulo: "Vence em 7 dias", valor: data?.resumo.vence_7_dias },
          { rotulo: "Recebido (filtro)", valor: data?.resumo.recebido_periodo, destaque: "text-emerald-700 dark:text-emerald-400" },
        ].map((k) => (
          <Card key={k.rotulo}>
            <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{k.rotulo}</CardTitle></CardHeader>
            <CardContent><div className={cn("text-xl font-semibold tabular-nums", k.destaque)}>{brl(k.valor)}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
          <TabsList>
            <TabsTrigger value="aberto">Em aberto</TabsTrigger>
            <TabsTrigger value="recebido">Recebidos</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <div className="space-y-1"><Label className="text-xs">Vencimento de</Label><Input type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">até</Label><Input type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} /></div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : !data?.linhas.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nada por aqui.</p>
          ) : (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Vencimento</th>
                    <th className="px-2 py-2 text-left font-medium">Descrição</th>
                    <th className="px-2 py-2 text-left font-medium">Cliente</th>
                    <th className="px-2 py-2 text-left font-medium">Conta</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 text-left font-medium">Situação</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums">{dataBr(l.data_vencimento || l.data_transacao)}</td>
                      <td className="px-2 py-2">{l.descricao}{l.centro_nome && <span className="ml-2 text-xs text-muted-foreground">{l.centro_nome}</span>}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.contato_nome || "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.conta_codigo} {l.conta_nome}</td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{brl(l.valor)}</td>
                      <td className="px-2 py-2">{situacao(l)}</td>
                      <td className="px-4 py-2 text-right">
                        {l.status === "Pendente" && (
                          <Button size="sm" variant="outline" onClick={() => setBaixa({ l, conta_bancaria_id: String(contas.find((c) => c.tipo !== "caixa")?.id ?? contas[0]?.id ?? ""), data_pagamento: hoje })}>Receber</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y md:hidden">
                {data.linhas.map((l) => (
                  <div key={l.id} className="space-y-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{dataBr(l.data_vencimento || l.data_transacao)}</span>
                      <span className="font-medium tabular-nums">{brl(l.valor)}</span>
                    </div>
                    <div className="text-sm">{l.descricao}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{l.contato_nome || ""}</span>
                      {l.status === "Pendente" ? (
                        <Button size="sm" variant="outline" onClick={() => setBaixa({ l, conta_bancaria_id: String(contas.find((c) => c.tipo !== "caixa")?.id ?? contas[0]?.id ?? ""), data_pagamento: hoje })}>Receber</Button>
                      ) : situacao(l)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Nova conta a receber */}
      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova conta a receber</DialogTitle>
            <DialogDescription>Com parcelas, o valor é dividido e os vencimentos seguem mês a mês.</DialogDescription>
          </DialogHeader>
          {novo && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nr-desc">Descrição</Label>
                <Input id="nr-desc" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="ex.: Venda NF 1234" />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <ContatoCombobox empresaId={empresaId} clientes={clientes} valor={novo.contato_id} onChange={(id) => setNovo({ ...novo, contato_id: id })} />
              </div>
              <div className="space-y-1.5">
                <Label>Conta de receita</Label>
                <CategoriaCombobox categorias={categorias} tipo="Receita" valor={novo.categoria_id} onChange={(id) => setNovo({ ...novo, categoria_id: id })} onCriar={criarConta} escopo="pj" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nr-valor">Valor total (R$)</Label>
                <Input id="nr-valor" inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nr-parc">Parcelas</Label>
                <Input id="nr-parc" inputMode="numeric" value={novo.parcelas} onChange={(e) => setNovo({ ...novo, parcelas: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nr-venc">Primeiro vencimento</Label>
                <Input id="nr-venc" type="date" value={novo.data_vencimento} onChange={(e) => setNovo({ ...novo, data_vencimento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nr-comp">Competência (data da venda)</Label>
                <Input id="nr-comp" type="date" value={novo.data_competencia} onChange={(e) => setNovo({ ...novo, data_competencia: e.target.value })} />
              </div>
              {centros.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Centro de custo</Label>
                  <Select value={novo.centro_custo_id || "nenhum"} onValueChange={(v) => setNovo({ ...novo, centro_custo_id: v === "nenhum" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      {centros.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={salvando || !novo?.descricao.trim() || !novo?.valor || !novo?.categoria_id}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recebimento */}
      <Dialog open={!!baixa} onOpenChange={(o) => !o && setBaixa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
            <DialogDescription>{baixa && `${baixa.l.descricao} · ${brl(baixa.l.valor)}`}</DialogDescription>
          </DialogHeader>
          {baixa && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Conta que recebeu</Label>
                <Select value={baixa.conta_bancaria_id} onValueChange={(v) => setBaixa({ ...baixa, conta_bancaria_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bx-data">Data do recebimento</Label>
                <Input id="bx-data" type="date" value={baixa.data_pagamento} onChange={(e) => setBaixa({ ...baixa, data_pagamento: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixa(null)}>Cancelar</Button>
            <Button onClick={salvarBaixa} disabled={salvando || !baixa?.conta_bancaria_id}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Cliente com busca e cadastro rápido (só o nome; o resto em Clientes e fornecedores). */
function ContatoCombobox({ empresaId, clientes, valor, onChange }: { empresaId: number; clientes: Contato[]; valor: number | null; onChange: (id: number | null) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const atual = clientes.find((c) => c.id === valor);
  const criar = async () => {
    try {
      const c = await apiErp<Contato>(`/api/empresas/${empresaId}/erp/contatos`, { method: "POST", body: { nome: busca.trim(), tipo: "cliente" } });
      await qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`] });
      onChange(c.id);
      setAberto(false);
      setBusca("");
    } catch (e: any) {
      toast({ title: "Não foi possível cadastrar", description: e?.message, variant: "destructive" });
    }
  };
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className={cn("h-9 w-full justify-between px-3 font-normal", !atual && "text-muted-foreground")}>
          <span className="truncate">{atual?.nome || "Opcional"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente…" value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">Nenhum cliente.</CommandEmpty>
            <CommandGroup>
              {valor && <CommandItem value="__nenhum" onSelect={() => { onChange(null); setAberto(false); }}>Sem cliente</CommandItem>}
              {clientes.map((c) => (
                <CommandItem key={c.id} value={`${c.nome} ${c.id}`} onSelect={() => { onChange(c.id); setAberto(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", valor === c.id ? "opacity-100" : "opacity-0")} />
                  {c.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {busca.trim().length >= 2 && !clientes.some((c) => c.nome.toLowerCase() === busca.trim().toLowerCase()) && (
            <div className="border-t p-1">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={criar}>
                <Plus className="mr-2 h-4 w-4" />Cadastrar “{busca.trim()}”
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
