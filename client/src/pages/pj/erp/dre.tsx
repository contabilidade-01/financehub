import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ESTRUTURA_DRE, type GrupoDre, type Indicadores, type SomasDre } from "@shared/indicadores-financeiros";
import { useFiltrosUrl, periodoPreset, PRESETS_PERIODO } from "@/components/shared/FiltroBar";
import { apiErp, brl, CabecalhoPagina, SomenteErp } from "./comum";
import { PainelIndicadores, pctBr } from "./indicadores-ui";
import type { CentroCusto } from "./centros-custo";

interface Dre {
  periodo: { de: string; ate: string };
  regime: "caixa" | "competencia";
  meses: string[];
  linhas: { conta_id: number; codigo: string; nome: string; grupo: GrupoDre; valores: Record<string, number>; total: number }[];
  somas: SomasDre;
  totais: Indicadores;
  por_mes: Record<string, { somas: SomasDre; indicadores: Indicadores }>;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (ym: string) => {
  const [a, m] = ym.split("-").map(Number);
  return `${MESES[m - 1]}/${String(a).slice(2)}`;
};

export default function DreGerencialPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <DreGerencial empresaId={empresaId} />
    </SomenteErp>
  );
}

const ano = periodoPreset("ano");
const PADRAO = { periodo: "ano", de: ano.de, ate: ano.ate, regime: "caixa", centro_custo_id: "" };

function DreGerencial({ empresaId }: { empresaId: number }) {
  const { valores: f, definir } = useFiltrosUrl(PADRAO);
  const qs = new URLSearchParams(Object.entries({ de: f.de, ate: f.ate, regime: f.regime, centro_custo_id: f.centro_custo_id }).filter(([, v]) => v)).toString();
  const url = `/api/empresas/${empresaId}/erp/dre?${qs}`;
  const { data, isLoading, error } = useQuery<Dre>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: centros = [] } = useQuery<CentroCusto[]>({
    queryKey: [`/api/empresas/${empresaId}/erp/centros-custo`],
    queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/centros-custo`),
  });
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternar = (t: string) => setAbertos((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  // Só mostra grupos com movimento (e sempre a receita e os totais).
  const estrutura = useMemo(() => {
    if (!data) return [];
    return ESTRUTURA_DRE.filter((e) =>
      e.tipo === "total"
        ? e.chave !== "lucro_bruto" || data.somas.cmv > 0 // sem CMV/CSP, lucro bruto = receita líquida
        : e.grupos[0] === "receita" || e.grupos.some((g) => data.somas[g]));
  }, [data]);

  const trocarPeriodo = (p: string) => {
    if (p === "personalizado") return definir({ periodo: p });
    const r = periodoPreset(p);
    definir({ periodo: p, de: r.de, ate: r.ate });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CabecalhoPagina
        titulo="DRE gerencial"
        descricao="Resultado por margem de contribuição, mês a mês. Caixa: o que entrou e saiu. Competência: o que foi vendido e contratado no período, pago ou não."
        acoes={
          <Button variant="outline" asChild>
            <a href={`${url}&formato=csv`}><Download className="mr-2 h-4 w-4" />Exportar CSV</a>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={f.periodo || "ano"} onValueChange={trocarPeriodo}>
              <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS_PERIODO.filter((p) => p.valor && !["proximos_30", "proximo_mes"].includes(p.valor)).map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {f.periodo === "personalizado" && (
            <div className="flex gap-2">
              <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={f.de} onChange={(e) => definir({ de: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={f.ate} onChange={(e) => definir({ ate: e.target.value })} /></div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Regime</Label>
            <Tabs value={f.regime} onValueChange={(v) => definir({ regime: v })}>
              <TabsList>
                <TabsTrigger value="caixa">Caixa</TabsTrigger>
                <TabsTrigger value="competencia">Competência</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {centros.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Centro de custo</Label>
              <Select value={f.centro_custo_id || "todos"} onValueChange={(v) => definir({ centro_custo_id: v === "todos" ? "" : v })}>
                <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {centros.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {data && <PainelIndicadores ind={data.totais} />}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
          ) : data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[260px] bg-muted px-4 py-2 text-left font-medium">Conta</th>
                    {data.meses.map((m) => <th key={m} className="whitespace-nowrap px-3 py-2 text-right font-medium">{nomeMes(m)}</th>)}
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">% receita</th>
                  </tr>
                </thead>
                <tbody>
                  {estrutura.map((e) => {
                    if (e.tipo === "total") {
                      const tot = Number(data.totais[e.chave] ?? 0);
                      return (
                        <tr key={e.titulo} className={cn("border-b font-semibold", e.destaque ? "bg-primary/5" : "bg-muted/30")}>
                          <td className={cn("sticky left-0 z-10 px-4 py-2", e.destaque ? "bg-[hsl(var(--background))]" : "bg-muted/60")}>{e.titulo}</td>
                          {data.meses.map((m) => {
                            const v = Number(data.por_mes[m].indicadores[e.chave] ?? 0);
                            return <td key={m} className={cn("px-3 py-2 text-right tabular-nums", v < 0 && "text-red-700 dark:text-red-400")}>{brl(v)}</td>;
                          })}
                          <td className={cn("px-4 py-2 text-right tabular-nums", tot < 0 && "text-red-700 dark:text-red-400")}>{brl(tot)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{data.totais.receita_bruta ? pctBr((tot / data.totais.receita_bruta) * 100) : "—"}</td>
                        </tr>
                      );
                    }
                    const contas = data.linhas.filter((l) => e.grupos.includes(l.grupo));
                    const soma = (m?: string) => e.grupos.reduce((s, g) => s + (m ? data.por_mes[m].somas[g] : data.somas[g]), 0);
                    const aberto = abertos.has(e.titulo);
                    return (
                      <Fragment key={e.titulo}>
                        <tr className="border-b font-medium">
                          <td className="sticky left-0 z-10 bg-background px-2 py-2">
                            <button type="button" className="flex w-full items-center gap-1 text-left disabled:cursor-default" onClick={() => alternar(e.titulo)} disabled={!contas.length} aria-expanded={aberto}>
                              {contas.length ? (aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />) : <span className="w-4" />}
                              {e.titulo}
                            </button>
                          </td>
                          {data.meses.map((m) => <td key={m} className="px-3 py-2 text-right tabular-nums">{brl(soma(m))}</td>)}
                          <td className="px-4 py-2 text-right tabular-nums">{brl(soma())}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{data.totais.receita_bruta ? pctBr((soma() / data.totais.receita_bruta) * 100) : "—"}</td>
                        </tr>
                        {aberto && contas.map((l) => (
                          <tr key={l.conta_id} className="border-b text-muted-foreground">
                            <td className="sticky left-0 z-10 bg-background px-4 py-1.5 pl-9"><span className="mr-2 tabular-nums">{l.codigo}</span>{l.nome}</td>
                            {data.meses.map((m) => <td key={m} className="px-3 py-1.5 text-right tabular-nums">{l.valores[m] ? brl(l.valores[m]) : "—"}</td>)}
                            <td className="px-4 py-1.5 text-right tabular-nums">{brl(l.total)}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums">{data.totais.receita_bruta ? pctBr((l.total / data.totais.receita_bruta) * 100) : "—"}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
