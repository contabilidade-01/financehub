import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { FiltroBar, useFiltrosUrl } from "@/components/shared/FiltroBar";
import { ContaPlanoCombobox, usePlanoContasPj } from "@/components/shared/ContaPlanoCombobox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";
import type { Contato } from "./contatos";
import type { CentroCusto } from "./centros-custo";

export type TipoTitulo = "Receita" | "Despesa";

interface Titulo {
  id: number;
  descricao: string;
  valor: string;
  status: "Pendente" | "Efetivada";
  data_transacao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  parcela_num: number | null;
  parcela_total: number | null;
  contato_nome: string | null;
  centro_nome: string | null;
  conta_codigo: string | null;
  conta_nome: string | null;
  conta_bancaria_id: number | null;
  conta_bancaria_nome: string | null;
  conciliado: boolean;
}
interface Resposta {
  linhas: Titulo[];
  resumo: { total_aberto: number; vencido: number; vence_7_dias: number; pago: number; qtd_aberto: number; qtd_vencido: number };
  aging: Record<"a_vencer" | "1_30" | "31_60" | "61_90" | "90_mais", number>;
  hoje: string;
}

/** Textos que mudam entre pagar e receber. */
const TX = {
  Receita: {
    titulo: "Contas a receber",
    descricao: "Vendas a prazo, boletos e parcelas de clientes. Ao receber, o valor entra na conta bancária escolhida e vira receita realizada.",
    rota: "receber",
    novo: "Nova conta a receber",
    pessoa: "Cliente",
    tipoContato: "cliente",
    conta: "Conta de receita",
    acao: "Receber",
    feito: "Recebido",
    feitos: "Recebidos",
    baixaTitulo: "Registrar recebimento",
    baixaData: "Data do recebimento",
    baixaBanco: "Conta que recebeu",
    baixaValor: "Valor recebido",
    jaFeito: "Já recebido",
    exemplo: "ex.: Venda NF 1234",
  },
  Despesa: {
    titulo: "Contas a pagar",
    descricao: "Fornecedores, boletos, aluguel e parcelas. Ao pagar, o valor sai da conta bancária escolhida e vira despesa realizada.",
    rota: "pagar",
    novo: "Nova conta a pagar",
    pessoa: "Fornecedor",
    tipoContato: "fornecedor",
    conta: "Conta de despesa",
    acao: "Pagar",
    feito: "Pago",
    feitos: "Pagos",
    baixaTitulo: "Registrar pagamento",
    baixaData: "Data do pagamento",
    baixaBanco: "Conta que pagou",
    baixaValor: "Valor pago",
    jaFeito: "Já pago",
    exemplo: "ex.: Aluguel da loja",
  },
} as const;

const FILTROS_PADRAO = {
  status: "aberto", periodo: "", de: "", ate: "", q: "", contato_id: "", categoria_id: "", centro_custo_id: "", conta_bancaria_id: "", valor_min: "", valor_max: "",
};

export function TitulosPage({ empresaId, tipo }: { empresaId: number; tipo: TipoTitulo }) {
  return (
    <SomenteErp>
      <Titulos empresaId={empresaId} tipo={tipo} />
    </SomenteErp>
  );
}

type Novo = {
  descricao: string; valor: string; data_vencimento: string; data_competencia: string;
  modo: "unica" | "parcelas" | "recorrente"; n: string; valor_modo: "total" | "parcela";
  categoria_id: number | null; contato_id: number | null; centro_custo_id: string;
  ja_pago: boolean; conta_bancaria_id: string; data_pagamento: string;
};

function Titulos({ empresaId, tipo }: { empresaId: number; tipo: TipoTitulo }) {
  const tx = TX[tipo];
  const { toast } = useToast();
  const confirmar = useConfirm();
  const qc = useQueryClient();
  const { valores: f, definir, limpar, ativos } = useFiltrosUrl(FILTROS_PADRAO);

  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "periodo")).toString();
  const url = `/api/empresas/${empresaId}/erp/${tx.rota}?${qs}`;
  const { data, isLoading } = useQuery<Resposta>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { contas: categorias, grupos, criarConta } = usePlanoContasPj(empresaId);
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`) });
  const { data: centros = [] } = useQuery<CentroCusto[]>({ queryKey: [`/api/empresas/${empresaId}/erp/centros-custo`], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/centros-custo`) });
  const { data: contatos = [] } = useQuery<Contato[]>({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`, tx.tipoContato], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/contatos?tipo=${tx.tipoContato}`) });

  const hoje = data?.hoje || new Date().toISOString().slice(0, 10);
  const linhas = data?.linhas ?? [];
  const bancoPadrao = String(bancos.find((c) => c.tipo !== "caixa")?.id ?? bancos[0]?.id ?? "");

  const [sel, setSel] = useState<Set<number>>(new Set());
  const selecionadas = linhas.filter((l) => sel.has(l.id));
  const abertasSel = selecionadas.filter((l) => l.status === "Pendente");
  const baixadasSel = selecionadas.filter((l) => l.status === "Efetivada");
  const totalSel = selecionadas.reduce((s, l) => s + Number(l.valor), 0);
  const alternar = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todasMarcadas = linhas.length > 0 && linhas.every((l) => sel.has(l.id));

  const [novo, setNovo] = useState<Novo | null>(null);
  const [baixa, setBaixa] = useState<null | { itens: Titulo[]; conta_bancaria_id: string; data_pagamento: string; valor_pago: string }>(null);
  const [salvando, setSalvando] = useState(false);

  const invalidar = () => {
    setSel(new Set());
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes(`/api/empresas/${empresaId}/`) });
  };

  const abrirNovo = () => setNovo({
    descricao: "", valor: "", data_vencimento: hoje, data_competencia: hoje, modo: "unica", n: "2", valor_modo: "total",
    categoria_id: null, contato_id: null, centro_custo_id: "", ja_pago: false, conta_bancaria_id: bancoPadrao, data_pagamento: hoje,
  });

  const salvarNovo = async () => {
    if (!novo) return;
    setSalvando(true);
    try {
      const r = await apiErp<{ criados: any[] }>(`/api/empresas/${empresaId}/erp/${tx.rota}`, {
        method: "POST",
        body: {
          descricao: novo.descricao,
          valor: novo.valor,
          data_vencimento: novo.data_vencimento,
          data_competencia: novo.data_competencia || undefined,
          categoria_id: novo.categoria_id,
          contato_id: novo.contato_id,
          centro_custo_id: novo.centro_custo_id || null,
          parcelas: novo.modo === "parcelas" ? Number(novo.n) || 1 : 1,
          valor_modo: novo.valor_modo,
          recorrencia: novo.modo === "recorrente" ? "mensal" : undefined,
          meses: novo.modo === "recorrente" ? Number(novo.n) || 1 : undefined,
          ja_pago: novo.modo === "unica" && novo.ja_pago,
          conta_bancaria_id: novo.ja_pago || novo.conta_bancaria_id ? Number(novo.conta_bancaria_id) || null : null,
          data_pagamento: novo.ja_pago ? novo.data_pagamento : undefined,
        },
      });
      toast({ title: r.criados.length > 1 ? `${r.criados.length} lançamentos criados` : novo.ja_pago ? "Lançamento registrado" : `${tx.titulo.replace("Contas", "Conta")} criada` });
      setNovo(null);
      invalidar();
    } catch (e: any) {
      toast({ title: "Não foi possível salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const abrirBaixa = (itens: Titulo[]) =>
    setBaixa({
      itens,
      conta_bancaria_id: String(itens.length === 1 && itens[0].conta_bancaria_id ? itens[0].conta_bancaria_id : bancoPadrao),
      data_pagamento: hoje,
      valor_pago: itens.length === 1 ? Number(itens[0].valor).toFixed(2).replace(".", ",") : "",
    });

  const salvarBaixa = async () => {
    if (!baixa) return;
    setSalvando(true);
    try {
      const individual = baixa.itens.length === 1;
      const r = await apiErp<{ baixados: number; complementos: number }>(`/api/empresas/${empresaId}/erp/baixas`, {
        method: "POST",
        body: {
          itens: baixa.itens.map((l) => ({ id: l.id, valor_pago: individual ? baixa.valor_pago : undefined })),
          conta_bancaria_id: Number(baixa.conta_bancaria_id),
          data_pagamento: baixa.data_pagamento,
        },
      });
      toast({
        title: r.baixados > 1 ? `${r.baixados} lançamentos baixados` : `${tx.feito} registrado`,
        description: r.complementos ? "A diferença foi lançada em juros/descontos no resultado financeiro." : undefined,
      });
      setBaixa(null);
      invalidar();
    } catch (e: any) {
      toast({ title: "Não foi possível dar baixa", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const estornar = async (itens: Titulo[]) => {
    const ok = await confirmar({
      title: itens.length > 1 ? `Estornar ${itens.length} baixas?` : "Estornar esta baixa?",
      description: "O lançamento volta a ficar em aberto e sai do caixa. Juros e descontos lançados na baixa são desfeitos.",
      confirmText: "Estornar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiErp(`/api/empresas/${empresaId}/erp/estornos`, { method: "POST", body: { ids: itens.map((l) => l.id) } });
      toast({ title: itens.length > 1 ? `${itens.length} baixas estornadas` : "Baixa estornada" });
      invalidar();
    } catch (e: any) {
      toast({ title: "Não foi possível estornar", description: e?.message, variant: "destructive" });
    }
  };

  const situacao = (l: Titulo) => {
    if (l.status === "Efetivada") return <Badge variant="secondary" className="font-normal">{tx.feito} {dataBr(l.data_pagamento)}</Badge>;
    const venc = String(l.data_vencimento || l.data_transacao).slice(0, 10);
    if (venc < hoje) return <Badge variant="destructive" className="font-normal">Vencido</Badge>;
    if (venc === hoje) return <Badge className="font-normal">Vence hoje</Badge>;
    return <Badge variant="outline" className="font-normal">Em aberto</Badge>;
  };

  const acaoLinha = (l: Titulo) =>
    l.status === "Pendente" ? (
      <Button size="sm" variant="outline" onClick={() => abrirBaixa([l])}>{tx.acao}</Button>
    ) : (
      <Button size="sm" variant="ghost" onClick={() => estornar([l])} aria-label={`Estornar ${l.descricao}`}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" />Estornar
      </Button>
    );

  const faixas = useMemo(() => [
    { k: "a_vencer", r: "A vencer" }, { k: "1_30", r: "1 a 30 dias" }, { k: "31_60", r: "31 a 60" }, { k: "61_90", r: "61 a 90" }, { k: "90_mais", r: "Mais de 90" },
  ] as const, []);
  const maxAging = Math.max(1, ...faixas.map((x) => data?.aging[x.k] ?? 0));

  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6", sel.size > 0 && "pb-28 md:pb-20")}>
      <CabecalhoPagina
        titulo={tx.titulo}
        descricao={tx.descricao}
        acoes={<Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />{tx.novo}</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { r: "Em aberto", v: data?.resumo.total_aberto, sub: data ? `${data.resumo.qtd_aberto} lançamento(s)` : "", filtro: "aberto" },
          { r: "Vencido", v: data?.resumo.vencido, sub: data ? `${data.resumo.qtd_vencido} lançamento(s)` : "", cor: "text-red-700 dark:text-red-400", filtro: "vencido" },
          { r: "Vence em 7 dias", v: data?.resumo.vence_7_dias, filtro: "a_vencer" },
          { r: `${tx.feitos} (no filtro)`, v: data?.resumo.pago, cor: "text-emerald-700 dark:text-emerald-400", filtro: "pago" },
        ].map((k) => (
          <button key={k.r} type="button" onClick={() => definir({ status: k.filtro })} className="text-left">
            <Card className={cn("h-full transition-colors hover:bg-muted/40", f.status === k.filtro && "ring-1 ring-primary")}>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{k.r}</div>
                <div className={cn("mt-1 text-xl font-semibold tabular-nums", k.cor)}>{brl(k.v)}</div>
                {k.sub && <div className="text-xs text-muted-foreground">{k.sub}</div>}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {data && data.resumo.total_aberto > 0 && (
        <Card>
          <CardContent className="grid grid-cols-5 gap-2 p-4">
            {faixas.map((x) => (
              <div key={x.k} className="min-w-0">
                <div className="flex h-12 flex-col justify-end overflow-hidden rounded-sm bg-muted">
                  <div
                    className={cn("w-full rounded-sm", x.k === "a_vencer" ? "bg-primary/70" : "bg-red-600/70 dark:bg-red-500/70")}
                    style={{ height: `${Math.round(((data.aging[x.k] ?? 0) / maxAging) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{x.r}</div>
                <div className="truncate text-xs font-medium tabular-nums">{brl(data.aging[x.k])}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <FiltroBar
        valores={f}
        definir={definir}
        limpar={limpar}
        ativos={ativos}
        busca={`Buscar por descrição ou ${tx.pessoa.toLowerCase()}`}
        periodo={{ rotulo: "Vencimento" }}
        valor
        inicio={
          <Tabs value={["aberto", "vencido", "pago", "todos"].includes(f.status) ? f.status : "aberto"} onValueChange={(v) => definir({ status: v })}>
            <TabsList>
              <TabsTrigger value="aberto">Em aberto</TabsTrigger>
              <TabsTrigger value="vencido">Vencidos</TabsTrigger>
              <TabsTrigger value="pago">{tx.feitos}</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        selects={[
          { chave: "contato_id", rotulo: tx.pessoa, opcoes: contatos.map((c) => ({ valor: String(c.id), rotulo: c.nome })) },
          { chave: "categoria_id", rotulo: "Conta do plano", todos: "Todas", opcoes: categorias.filter((c) => c.tipo === tipo).map((c) => ({ valor: String(c.id), rotulo: `${c.codigo} ${c.nome}` })) },
          ...(centros.length ? [{ chave: "centro_custo_id", rotulo: "Centro de custo", opcoes: centros.map((c) => ({ valor: String(c.id), rotulo: c.nome })) }] : []),
          { chave: "conta_bancaria_id", rotulo: "Conta bancária", todos: "Todas", opcoes: bancos.map((b) => ({ valor: String(b.id), rotulo: b.nome || b.banco })) },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : !linhas.length ? (
            <div className="space-y-2 p-6 text-sm text-muted-foreground">
              <p>Nada encontrado com estes filtros.</p>
              {ativos > 0 && <Button variant="link" className="h-auto p-0" onClick={limpar}>Limpar filtros</Button>}
            </div>
          ) : (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-2">
                      <Checkbox checked={todasMarcadas} onCheckedChange={(v) => setSel(v ? new Set(linhas.map((l) => l.id)) : new Set())} aria-label="Selecionar todos" />
                    </th>
                    <th className="px-2 py-2 text-left font-medium">Vencimento</th>
                    <th className="px-2 py-2 text-left font-medium">Descrição</th>
                    <th className="px-2 py-2 text-left font-medium">{tx.pessoa}</th>
                    <th className="px-2 py-2 text-left font-medium">Conta</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 text-left font-medium">Situação</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className={cn("border-b last:border-0", sel.has(l.id) && "bg-primary/5")}>
                      <td className="px-4 py-2"><Checkbox checked={sel.has(l.id)} onCheckedChange={() => alternar(l.id)} aria-label={`Selecionar ${l.descricao}`} /></td>
                      <td className="px-2 py-2 tabular-nums">{dataBr(l.data_vencimento || l.data_transacao)}</td>
                      <td className="px-2 py-2">
                        <div>{l.descricao}</div>
                        <div className="text-xs text-muted-foreground">
                          {[l.centro_nome, l.status === "Efetivada" && l.conta_bancaria_nome].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{l.contato_nome || "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground"><span className="tabular-nums">{l.conta_codigo}</span> {l.conta_nome}</td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{brl(l.valor)}</td>
                      <td className="px-2 py-2">{situacao(l)}</td>
                      <td className="px-4 py-2 text-right">{acaoLinha(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y md:hidden">
                {linhas.map((l) => (
                  <div key={l.id} className={cn("flex gap-3 px-4 py-3", sel.has(l.id) && "bg-primary/5")}>
                    <Checkbox className="mt-1" checked={sel.has(l.id)} onCheckedChange={() => alternar(l.id)} aria-label={`Selecionar ${l.descricao}`} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">{dataBr(l.data_vencimento || l.data_transacao)}</span>
                        <span className="font-medium tabular-nums">{brl(l.valor)}</span>
                      </div>
                      <div className="text-sm">{l.descricao}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{l.contato_nome || l.conta_nome || ""}</span>
                        <div className="flex shrink-0 items-center gap-2">{l.status === "Pendente" && situacao(l)}{acaoLinha(l)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ações em lote: fixas no rodapé (acima da navegação inferior no celular). */}
      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-3 md:bottom-4 md:left-auto md:right-6 md:px-0">
          <div className="mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-lg border bg-background p-3 shadow-lg">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{sel.size} selecionado(s)</span>
              <span className="ml-2 tabular-nums text-muted-foreground">{brl(totalSel)}</span>
            </div>
            {abertasSel.length > 0 && <Button size="sm" onClick={() => abrirBaixa(abertasSel)}>{tx.acao} {abertasSel.length > 1 ? `(${abertasSel.length})` : ""}</Button>}
            {baixadasSel.length > 0 && <Button size="sm" variant="outline" onClick={() => estornar(baixadasSel)}>Estornar ({baixadasSel.length})</Button>}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSel(new Set())} aria-label="Limpar seleção"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Novo título */}
      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tx.novo}</DialogTitle>
            <DialogDescription>Parcelado divide o valor; recorrente repete o mesmo valor todo mês. Marque "{tx.jaFeito}" para lançar o que já aconteceu.</DialogDescription>
          </DialogHeader>
          {novo && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nt-desc">Descrição</Label>
                <Input id="nt-desc" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder={tx.exemplo} />
              </div>
              <div className="space-y-1.5">
                <Label>{tx.pessoa}</Label>
                <ContatoCombobox empresaId={empresaId} tipo={tx.tipoContato} contatos={contatos} valor={novo.contato_id} onChange={(id) => setNovo({ ...novo, contato_id: id })} />
              </div>
              <div className="space-y-1.5">
                <Label>{tx.conta}</Label>
                <ContaPlanoCombobox categorias={categorias} grupos={grupos} tipo={tipo} valor={novo.categoria_id} onChange={(id) => setNovo({ ...novo, categoria_id: id })} onCriar={criarConta} escopo="pj" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Forma</Label>
                <Tabs value={novo.modo} onValueChange={(v) => setNovo({ ...novo, modo: v as Novo["modo"], ja_pago: v === "unica" ? novo.ja_pago : false })}>
                  <TabsList>
                    <TabsTrigger value="unica">Única</TabsTrigger>
                    <TabsTrigger value="parcelas">Parcelada</TabsTrigger>
                    <TabsTrigger value="recorrente">Recorrente mensal</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nt-valor">
                  {novo.modo === "parcelas" ? (novo.valor_modo === "total" ? "Valor total (R$)" : "Valor da parcela (R$)") : novo.modo === "recorrente" ? "Valor mensal (R$)" : "Valor (R$)"}
                </Label>
                <Input id="nt-valor" inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="0,00" />
              </div>
              {novo.modo !== "unica" && (
                <div className="space-y-1.5">
                  <Label htmlFor="nt-n">{novo.modo === "parcelas" ? "Parcelas" : "Quantos meses"}</Label>
                  <Input id="nt-n" inputMode="numeric" value={novo.n} onChange={(e) => setNovo({ ...novo, n: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
                </div>
              )}
              {novo.modo === "parcelas" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Tabs value={novo.valor_modo} onValueChange={(v) => setNovo({ ...novo, valor_modo: v as any })}>
                    <TabsList>
                      <TabsTrigger value="total">Informei o total</TabsTrigger>
                      <TabsTrigger value="parcela">Informei a parcela</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="nt-venc">{novo.modo === "unica" ? "Vencimento" : "Primeiro vencimento"}</Label>
                <Input id="nt-venc" type="date" value={novo.data_vencimento} onChange={(e) => setNovo({ ...novo, data_vencimento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nt-comp">Competência</Label>
                <Input id="nt-comp" type="date" value={novo.data_competencia} onChange={(e) => setNovo({ ...novo, data_competencia: e.target.value })} />
              </div>
              {centros.length > 0 && (
                <div className="space-y-1.5">
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
              {novo.modo === "unica" && (
                <label className="flex items-center gap-3 text-sm sm:col-span-2">
                  <Switch checked={novo.ja_pago} onCheckedChange={(v) => setNovo({ ...novo, ja_pago: v })} />
                  {tx.jaFeito}
                </label>
              )}
              {novo.ja_pago && (
                <>
                  <div className="space-y-1.5">
                    <Label>{tx.baixaBanco}</Label>
                    <Select value={novo.conta_bancaria_id} onValueChange={(v) => setNovo({ ...novo, conta_bancaria_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                      <SelectContent>{bancos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nt-pag">{tx.baixaData}</Label>
                    <Input id="nt-pag" type="date" value={novo.data_pagamento} onChange={(e) => setNovo({ ...novo, data_pagamento: e.target.value })} />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={salvando || !novo?.descricao.trim() || !novo?.valor || !novo?.categoria_id || (novo?.ja_pago && !novo.conta_bancaria_id)}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Baixa individual ou em lote */}
      <Dialog open={!!baixa} onOpenChange={(o) => !o && setBaixa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{baixa && baixa.itens.length > 1 ? `${tx.baixaTitulo} de ${baixa.itens.length} lançamentos` : tx.baixaTitulo}</DialogTitle>
            <DialogDescription>
              {baixa && (baixa.itens.length === 1
                ? `${baixa.itens[0].descricao} · ${brl(baixa.itens[0].valor)}`
                : `Total ${brl(baixa.itens.reduce((s, l) => s + Number(l.valor), 0))}. Todos na mesma data e conta; ou todos são baixados, ou nenhum.`)}
            </DialogDescription>
          </DialogHeader>
          {baixa && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tx.baixaBanco}</Label>
                <Select value={baixa.conta_bancaria_id} onValueChange={(v) => setBaixa({ ...baixa, conta_bancaria_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{bancos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bx-data">{tx.baixaData}</Label>
                <Input id="bx-data" type="date" value={baixa.data_pagamento} onChange={(e) => setBaixa({ ...baixa, data_pagamento: e.target.value })} />
              </div>
              {baixa.itens.length === 1 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bx-valor">{tx.baixaValor} (R$)</Label>
                  <Input id="bx-valor" inputMode="decimal" value={baixa.valor_pago} onChange={(e) => setBaixa({ ...baixa, valor_pago: e.target.value })} />
                  <DiferencaBaixa tipo={tipo} previsto={Number(baixa.itens[0].valor)} pago={baixa.valor_pago} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixa(null)}>Cancelar</Button>
            <Button onClick={salvarBaixa} disabled={salvando || !baixa?.conta_bancaria_id}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Explica o que acontece com a diferença entre o previsto e o pago. */
function DiferencaBaixa({ tipo, previsto, pago }: { tipo: TipoTitulo; previsto: number; pago: string }) {
  const t = pago.includes(",") ? pago.replace(/\./g, "").replace(",", ".") : pago;
  const v = Number(t);
  if (!t || !Number.isFinite(v)) return null;
  const dif = Math.round((v - previsto) * 100) / 100;
  if (Math.abs(dif) < 0.01) return null;
  const texto = tipo === "Despesa"
    ? dif > 0 ? `${brl(dif)} a mais vão para Juros e multas pagos.` : `${brl(-dif)} a menos vão para Descontos obtidos.`
    : dif > 0 ? `${brl(dif)} a mais vão para Juros e multas recebidos.` : `${brl(-dif)} a menos vão para Descontos concedidos.`;
  return <p className="text-xs text-muted-foreground">{texto}</p>;
}

/** Cliente/fornecedor com busca e cadastro rápido (só o nome; o resto em Clientes e fornecedores). */
function ContatoCombobox({ empresaId, tipo, contatos, valor, onChange }: { empresaId: number; tipo: string; contatos: Contato[]; valor: number | null; onChange: (id: number | null) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const atual = contatos.find((c) => c.id === valor);
  const criar = async () => {
    try {
      const c = await apiErp<Contato>(`/api/empresas/${empresaId}/erp/contatos`, { method: "POST", body: { nome: busca.trim(), tipo } });
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
          <CommandInput placeholder="Buscar…" value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">Ninguém encontrado.</CommandEmpty>
            <CommandGroup>
              {valor && <CommandItem value="__nenhum" onSelect={() => { onChange(null); setAberto(false); }}>Nenhum</CommandItem>}
              {contatos.map((c) => (
                <CommandItem key={c.id} value={`${c.nome} ${c.id}`} onSelect={() => { onChange(c.id); setAberto(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", valor === c.id ? "opacity-100" : "opacity-0")} />
                  {c.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {busca.trim().length >= 2 && !contatos.some((c) => c.nome.toLowerCase() === busca.trim().toLowerCase()) && (
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
