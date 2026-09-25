import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiErp, brl, CabecalhoPagina, SomenteErp } from "./comum";
import type { CentroCusto } from "./centros-custo";

type Totais = { receita: number; variavel: number; margem: number; fixa: number; outras: number; resultado: number; margem_pct: number | null; resultado_pct: number | null };
interface Dre {
  periodo: { de: string; ate: string };
  regime: "caixa" | "competencia";
  meses: string[];
  linhas: { conta_id: number; codigo: string; nome: string; grupo: "receita" | "variavel" | "fixa" | "outras"; valores: Record<string, number>; total: number }[];
  totais: Totais;
  por_mes: Record<string, Totais>;
}

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function preset(p: string): { de: string; ate: string } {
  const h = hojeLocal();
  const [a, m] = h.split("-").map(Number);
  const ultimo = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();
  const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (p === "mes") return { de: iso(a, m, 1), ate: iso(a, m, ultimo(a, m)) };
  if (p === "mes_anterior") { const mm = m === 1 ? 12 : m - 1; const aa = m === 1 ? a - 1 : a; return { de: iso(aa, mm, 1), ate: iso(aa, mm, ultimo(aa, mm)) }; }
  if (p === "12m") { const d = new Date(a, m - 12, 1); return { de: iso(d.getFullYear(), d.getMonth() + 1, 1), ate: iso(a, m, ultimo(a, m)) }; }
  return { de: iso(a, 1, 1), ate: iso(a, 12, 31) };
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

function DreGerencial({ empresaId }: { empresaId: number }) {
  const [periodoTipo, setPeriodoTipo] = useState("ano");
  const [periodo, setPeriodo] = useState(preset("ano"));
  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");
  const [centro, setCentro] = useState("");
  const qs = `de=${periodo.de}&ate=${periodo.ate}&regime=${regime}${centro ? `&centro_custo_id=${centro}` : ""}`;
  const url = `/api/empresas/${empresaId}/erp/dre?${qs}`;
  const { data, isLoading, error } = useQuery<Dre>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: centros = [] } = useQuery<CentroCusto[]>({
    queryKey: [`/api/empresas/${empresaId}/erp/centros-custo`],
    queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/centros-custo`),
  });

  const blocos = useMemo(() => {
    if (!data) return [];
    const por = (g: string) => data.linhas.filter((l) => l.grupo === g);
    return [
      { titulo: "(+) Receitas", chave: "receita" as const, linhas: por("receita") },
      { titulo: "(−) Custos e despesas variáveis", chave: "variavel" as const, linhas: por("variavel") },
      { titulo: "(=) Margem de contribuição", chave: "margem" as const, linhas: [], total: true },
      { titulo: "(−) Despesas fixas", chave: "fixa" as const, linhas: por("fixa") },
      { titulo: "(−) Outras despesas", chave: "outras" as const, linhas: por("outras") },
      { titulo: "(=) Resultado", chave: "resultado" as const, linhas: [], total: true },
    ];
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CabecalhoPagina
        titulo="DRE gerencial"
        descricao="Resultado por conta do plano, mês a mês. Caixa: o que entrou e saiu. Competência: o que foi vendido e contratado no período, pago ou não."
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
            <Select value={periodoTipo} onValueChange={(v) => { setPeriodoTipo(v); if (v !== "personalizado") setPeriodo(preset(v)); }}>
              <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                <SelectItem value="ano">Este ano</SelectItem>
                <SelectItem value="12m">Últimos 12 meses</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodoTipo === "personalizado" && (
            <div className="flex gap-2">
              <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} /></div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Regime</Label>
            <Tabs value={regime} onValueChange={(v) => setRegime(v as any)}>
              <TabsList>
                <TabsTrigger value="caixa">Caixa</TabsTrigger>
                <TabsTrigger value="competencia">Competência</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {centros.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Centro de custo</Label>
              <Select value={centro || "todos"} onValueChange={(v) => setCentro(v === "todos" ? "" : v)}>
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

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { r: "Receitas", v: data.totais.receita },
            { r: "Margem de contribuição", v: data.totais.margem, p: data.totais.margem_pct },
            { r: "Despesas fixas", v: data.totais.fixa },
            { r: "Resultado", v: data.totais.resultado, p: data.totais.resultado_pct, sinal: true },
          ].map((k) => (
            <Card key={k.r}>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{k.r}</CardTitle></CardHeader>
              <CardContent>
                <div className={cn("text-xl font-semibold tabular-nums", k.sinal && (k.v >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"))}>{brl(k.v)}</div>
                {k.p != null && <div className="text-xs text-muted-foreground tabular-nums">{k.p.toFixed(1)}% da receita</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                    <th className="sticky left-0 z-10 min-w-[240px] bg-muted px-4 py-2 text-left font-medium">Conta</th>
                    {data.meses.map((m) => <th key={m} className="whitespace-nowrap px-3 py-2 text-right font-medium">{nomeMes(m)}</th>)}
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {blocos.map((b) => (
                    <Fragment key={b.chave}>
                      <tr className={cn("border-b", b.total ? "bg-muted/30 font-semibold" : "font-medium")}>
                        <td className="sticky left-0 z-10 bg-background px-4 py-2">{b.titulo}</td>
                        {data.meses.map((m) => (
                          <td key={m} className={cn("px-3 py-2 text-right tabular-nums", b.chave === "resultado" && (data.por_mes[m].resultado < 0 ? "text-red-700 dark:text-red-400" : ""))}>
                            {brl(data.por_mes[m][b.chave])}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right tabular-nums">{brl(data.totais[b.chave])}</td>
                      </tr>
                      {b.linhas.map((l) => (
                        <tr key={l.conta_id} className="border-b text-muted-foreground">
                          <td className="sticky left-0 z-10 bg-background px-4 py-1.5 pl-8"><span className="mr-2 tabular-nums">{l.codigo}</span>{l.nome}</td>
                          {data.meses.map((m) => <td key={m} className="px-3 py-1.5 text-right tabular-nums">{l.valores[m] ? brl(l.valores[m]) : "—"}</td>)}
                          <td className="px-4 py-1.5 text-right tabular-nums">{brl(l.total)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
