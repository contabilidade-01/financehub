import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiltroBar, periodoPreset, useFiltrosUrl } from "@/components/shared/FiltroBar";
import { cn } from "@/lib/utils";
import type { Indicadores } from "@shared/indicadores-financeiros";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";
import { PainelIndicadores } from "./indicadores-ui";
import { MapaDinheiro, type Mapa, type NoMapa } from "./mapa-dinheiro";
import type { Contato } from "./contatos";
import type { CentroCusto } from "./centros-custo";

interface ContaRazao {
  conta_id: number;
  codigo: string;
  nome: string;
  parent_id: number | null;
  sintetica: boolean;
  saldo: number;
  qtd: number;
}
interface Razao {
  periodo: { de: string; ate: string };
  regime: string;
  contas: ContaRazao[];
  indicadores: Indicadores;
  mapa: Mapa;
}
interface Lancamentos {
  conta: { id: number; codigo: string; nome: string; sintetica: boolean };
  lancamentos: { id: number; data: string; descricao: string; valor: number; tipo: string; status: string; conta_codigo: string; conta_nome: string; contato_nome: string | null; centro_nome: string | null; banco_nome: string | null; acumulado: number }[];
  total: number;
}

export default function RazaoPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <RazaoGerencial empresaId={empresaId} />
    </SomenteErp>
  );
}

const mes = periodoPreset("mes");
const PADRAO = { periodo: "mes", de: mes.de, ate: mes.ate, regime: "caixa", centro_custo_id: "", contato_id: "", conta_bancaria_id: "" };

function RazaoGerencial({ empresaId }: { empresaId: number }) {
  const { valores: f, definir, limpar, ativos } = useFiltrosUrl(PADRAO);
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "periodo")).toString();
  const url = `/api/empresas/${empresaId}/erp/razao?${qs}`;
  const { data, isLoading, error } = useQuery<Razao>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: centros = [] } = useQuery<CentroCusto[]>({ queryKey: [`/api/empresas/${empresaId}/erp/centros-custo`], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/centros-custo`) });
  const { data: contatos = [] } = useQuery<Contato[]>({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`, "todos"], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/contatos`) });
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`) });

  const [contaAberta, setContaAberta] = useState<number | null>(null);
  const [fechados, setFechados] = useState<Set<number>>(new Set());

  // Árvore: grupos na ordem do plano com as contas de dentro.
  const arvore = useMemo(() => {
    const contas = data?.contas ?? [];
    const raiz = contas.filter((c) => !c.parent_id || !contas.some((p) => p.conta_id === c.parent_id));
    const filhos = (id: number) => contas.filter((c) => c.parent_id === id);
    return { raiz, filhos };
  }, [data?.contas]);

  const abrirDoMapa = (no: NoMapa) => {
    if (no.conta_id) setContaAberta(no.conta_id);
  };

  const linha = (c: ContaRazao, nivel: number): JSX.Element[] => {
    const filhos = arvore.filhos(c.conta_id);
    const aberto = !fechados.has(c.conta_id);
    const itens = [
      <tr key={c.conta_id} className={cn("border-b", c.sintetica ? "bg-muted/40 font-medium" : "hover:bg-muted/30")}>
        <td className="max-w-0 px-2 py-2" style={{ paddingLeft: `${8 + nivel * 16}px` }}>
          <div className="flex items-center gap-1">
            {filhos.length ? (
              <button type="button" onClick={() => setFechados((s) => { const n = new Set(s); n.has(c.conta_id) ? n.delete(c.conta_id) : n.add(c.conta_id); return n; })} aria-expanded={aberto} aria-label={aberto ? "Recolher" : "Expandir"}>
                {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : <span className="w-4" />}
            <button type="button" className="flex min-w-0 items-baseline gap-2 text-left hover:underline" onClick={() => setContaAberta(c.conta_id)}>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{c.codigo}</span>
              <span className="truncate">{c.nome}</span>
            </button>
          </div>
        </td>
        <td className="hidden px-2 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{c.qtd}</td>
        <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums sm:px-4", c.saldo < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
          {c.saldo < 0 ? "−" : "+"}{brl(Math.abs(c.saldo))}
        </td>
      </tr>,
    ];
    if (aberto) for (const fl of filhos) itens.push(...linha(fl, nivel + 1));
    return itens;
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CabecalhoPagina
        titulo="Razão e mapa do dinheiro"
        descricao="De onde veio e para onde foi cada real do período, conta por conta. Clique numa conta para ver os lançamentos."
      />

      <FiltroBar
        valores={f}
        definir={definir}
        limpar={limpar}
        ativos={ativos}
        periodo={{ rotulo: "Período" }}
        inicio={
          <Tabs value={f.regime} onValueChange={(v) => definir({ regime: v })}>
            <TabsList>
              <TabsTrigger value="caixa">Caixa</TabsTrigger>
              <TabsTrigger value="competencia">Competência</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        selects={[
          ...(centros.length ? [{ chave: "centro_custo_id", rotulo: "Centro de custo", opcoes: centros.map((c) => ({ valor: String(c.id), rotulo: c.nome })) }] : []),
          { chave: "contato_id", rotulo: "Cliente ou fornecedor", opcoes: contatos.map((c) => ({ valor: String(c.id), rotulo: c.nome })) },
          { chave: "conta_bancaria_id", rotulo: "Conta bancária", todos: "Todas", opcoes: bancos.map((b) => ({ valor: String(b.id), rotulo: b.nome || b.banco })) },
        ]}
      />
      <p className="-mt-3 text-xs text-muted-foreground">
        {data ? `${dataBr(data.periodo.de)} a ${dataBr(data.periodo.ate)} · regime de ${data.regime === "caixa" ? "caixa" : "competência"}` : ""}
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando…</div>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : data && (
        <>
          <PainelIndicadores ind={data.indicadores} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Mapa do dinheiro</CardTitle>
              <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-1)" }} />Entradas {brl(data.mapa.entradas)}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-2)" }} />Saídas {brl(data.mapa.saidas)}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: data.mapa.saldo >= 0 ? "var(--viz-3)" : "var(--viz-critico)" }} />
                  {data.mapa.saldo >= 0 ? "Sobra" : "Falta"} {brl(Math.abs(data.mapa.saldo))}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <MapaDinheiro mapa={data.mapa} onSelecionar={abrirDoMapa} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Razão por conta</CardTitle>
              <CardDescription>Entradas em verde, saídas em vermelho. Os grupos somam as contas de dentro.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!data.contas.length ? (
                <p className="p-6 text-sm text-muted-foreground">Sem lançamentos no período.</p>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <colgroup><col /><col className="hidden w-28 sm:table-column" /><col className="w-36" /></colgroup>
                  <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Conta</th>
                      <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Lançamentos</th>
                      <th className="px-4 py-2 text-right font-medium">Movimento</th>
                    </tr>
                  </thead>
                  <tbody>{arvore.raiz.flatMap((c) => linha(c, 0))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <LancamentosConta empresaId={empresaId} contaId={contaAberta} filtros={f} onFechar={() => setContaAberta(null)} />
    </div>
  );
}

function LancamentosConta({ empresaId, contaId, filtros, onFechar }: { empresaId: number; contaId: number | null; filtros: Record<string, string>; onFechar: () => void }) {
  const qs = new URLSearchParams(Object.entries(filtros).filter(([k, v]) => v && k !== "periodo")).toString();
  const url = `/api/empresas/${empresaId}/erp/razao/${contaId}?${qs}`;
  const { data, isLoading } = useQuery<Lancamentos>({ queryKey: [url], queryFn: () => apiErp(url), enabled: !!contaId });
  return (
    <Sheet open={!!contaId} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{data ? `${data.conta.codigo} ${data.conta.nome}` : "Lançamentos"}</SheetTitle>
          <SheetDescription>
            {data ? `${data.lancamentos.length} lançamento(s) · movimento ${data.total < 0 ? "−" : "+"}${brl(Math.abs(data.total))}` : ""}
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : data && (
          <div className="mt-4 space-y-3">
            <Button variant="outline" size="sm" asChild>
              <a href={`${url}&formato=csv`}><Download className="mr-2 h-4 w-4" />Exportar CSV</a>
            </Button>
            <div className="divide-y rounded-md border">
              {data.lancamentos.map((l) => (
                <div key={l.id} className="grid grid-cols-[5.75rem_1fr_auto] gap-x-3 px-3 py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{dataBr(l.data)}</span>
                  <div className="min-w-0">
                    <div className="truncate">{l.descricao}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[data.conta.sintetica && `${l.conta_codigo} ${l.conta_nome}`, l.contato_nome, l.centro_nome, l.banco_nome, l.status === "Pendente" && "a realizar"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("tabular-nums", l.tipo === "Receita" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                      {l.tipo === "Receita" ? "+" : "−"}{brl(l.valor)}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">{brl(l.acumulado)}</div>
                  </div>
                </div>
              ))}
              {!data.lancamentos.length && <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento no período.</p>}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
