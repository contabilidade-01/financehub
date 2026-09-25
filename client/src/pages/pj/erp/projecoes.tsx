import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFiltrosUrl } from "@/components/shared/FiltroBar";
import { cn } from "@/lib/utils";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";
import { COR, EIXO, TooltipPadrao, valorCurto } from "./graficos";

interface Projecao {
  hoje: string;
  fim: string;
  horizonte: number;
  agrupar: "dia" | "semana" | "mes";
  bancos: { id: number; nome: string; saldo: number }[];
  saldo_inicial: number;
  saldo_final: number;
  entradas: number;
  saidas: number;
  periodos: { inicio: string; fim: string; rotulo: string; entradas: number; saidas: number; saldo_final: number }[];
  primeiro_negativo: { data: string; saldo: number } | null;
  menor_saldo: { data: string; saldo: number };
  itens: { id?: number; data: string; descricao: string; tipo: "Receita" | "Despesa"; valor: number; origem: string; atrasado?: boolean; contato?: string | null }[];
}

const ORIGEM: Record<string, string> = { receber: "A receber", pagar: "A pagar", fatura: "Fatura de cartão", recorrencia: "Mensalidade prevista" };

export default function ProjecoesPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <Projecoes empresaId={empresaId} />
    </SomenteErp>
  );
}

const PADRAO = { horizonte: "90", agrupar: "", cenario: "com_recorrencias", conta_bancaria_id: "", inadimplencia_pct: "" };

function Projecoes({ empresaId }: { empresaId: number }) {
  const { valores: f, definir } = useFiltrosUrl(PADRAO);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const url = `/api/empresas/${empresaId}/erp/projecao?${qs}`;
  const { data, isLoading, error } = useQuery<Projecao>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`) });

  const serie = data ? [{ rotulo: "Hoje", saldo_final: data.saldo_inicial, inicio: data.hoje }, ...data.periodos] : [];
  const negativo = data?.primeiro_negativo;
  // Marca só quando o saldo vira negativo no futuro (se já está negativo, o alerta acima basta).
  const pontoNegativo = negativo && negativo.data !== data?.hoje ? data!.periodos.find((p) => p.inicio <= negativo.data && negativo.data <= p.fim) : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CabecalhoPagina
        titulo="Projeção de caixa"
        descricao="Saldo de hoje nos bancos, mais o que está para entrar, menos o que está para sair: contas a receber, contas a pagar, faturas de cartão e mensalidades."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Horizonte</Label>
            <Tabs value={f.horizonte} onValueChange={(v) => definir({ horizonte: v, agrupar: "" })}>
              <TabsList>
                {["30", "60", "90", "180", "365"].map((h) => <TabsTrigger key={h} value={h}>{h === "365" ? "1 ano" : `${h} dias`}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Agrupar por</Label>
            <Select value={f.agrupar || data?.agrupar || "semana"} onValueChange={(v) => definir({ agrupar: v })}>
              <SelectTrigger className="lg:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">Dia</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cenário</Label>
            <Select value={f.cenario} onValueChange={(v) => definir({ cenario: v })}>
              <SelectTrigger className="lg:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="com_recorrencias">Com mensalidades previstas</SelectItem>
                <SelectItem value="confirmados">Só lançamentos confirmados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conta bancária</Label>
            <Select value={f.conta_bancaria_id || "todas"} onValueChange={(v) => definir({ conta_bancaria_id: v === "todas" ? "" : v })}>
              <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {bancos.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.nome || b.banco}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="pj-inad">Inadimplência esperada (%)</Label>
            <Input id="pj-inad" className="lg:w-36" inputMode="decimal" placeholder="0" defaultValue={f.inadimplencia_pct} key={f.inadimplencia_pct}
              onBlur={(e) => definir({ inadimplencia_pct: e.target.value.replace(",", ".").replace(/[^\d.]/g, "") })} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Projetando…</div>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : data && (
        <>
          {negativo && (
            <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400" />
              <div>
                <div className="font-medium text-red-800 dark:text-red-300">
                  {negativo.data === data.hoje ? "O saldo já está negativo." : `O saldo fica negativo em ${dataBr(negativo.data)}.`}
                </div>
                <div className="text-red-800/80 dark:text-red-300/80">
                  Menor saldo previsto: {brl(data.menor_saldo.saldo)} em {dataBr(data.menor_saldo.data)}. Antecipe recebimentos ou renegocie pagamentos antes dessa data.
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { r: "Saldo hoje", v: data.saldo_inicial, d: `${data.bancos.length} conta(s) bancária(s)` },
              { r: "Entradas previstas", v: data.entradas, d: f.inadimplencia_pct ? `já com ${f.inadimplencia_pct}% de inadimplência` : "a receber no período" },
              { r: "Saídas previstas", v: data.saidas, d: "a pagar, faturas e mensalidades" },
              { r: `Saldo em ${dataBr(data.fim)}`, v: data.saldo_final, d: `menor: ${brl(data.menor_saldo.saldo)}`, sinal: true },
            ].map((k) => (
              <Card key={k.r}>
                <CardContent className="p-4">
                  <div className="text-xs font-medium text-muted-foreground">{k.r}</div>
                  <div className={cn("mt-1 text-xl font-semibold", k.sinal && (k.v < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"))}>{brl(k.v)}</div>
                  <div className="text-xs text-muted-foreground">{k.d}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Saldo projetado</CardTitle>
              <CardDescription>Saldo no fim de cada {data.agrupar === "dia" ? "dia" : data.agrupar === "semana" ? "semana" : "mês"}. Abaixo da linha do zero, falta dinheiro.</CardDescription>
            </CardHeader>
            <CardContent className="h-72 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="saldoProj" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR.saldo} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={COR.saldo} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={COR.grade} />
                  <XAxis dataKey="rotulo" {...EIXO} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis {...EIXO} tickFormatter={valorCurto} width={72} />
                  <ReferenceLine y={0} stroke={COR.eixo} />
                  <Tooltip content={<TooltipPadrao />} cursor={{ stroke: COR.eixo, strokeDasharray: "3 3" }} />
                  <Area type="monotone" baseValue={0} dataKey="saldo_final" name="Saldo" stroke={COR.saldo} strokeWidth={2} fill="url(#saldoProj)" activeDot={{ r: 4 }} />
                  {pontoNegativo && (
                    <ReferenceDot x={pontoNegativo.rotulo} y={pontoNegativo.saldo_final} r={5} fill={COR.critico} stroke="hsl(var(--card))" strokeWidth={2}
                      label={{ value: "fica negativo", position: "top", fill: COR.critico, fontSize: 11 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Por período</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-y bg-muted/60 text-xs text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Período</th>
                        <th className="px-2 py-2 text-right font-medium">Entradas</th>
                        <th className="px-2 py-2 text-right font-medium">Saídas</th>
                        <th className="px-4 py-2 text-right font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.periodos.filter((p) => p.entradas || p.saidas || data.agrupar !== "dia").map((p) => (
                        <tr key={p.inicio} className="border-b last:border-0">
                          <td className="px-4 py-1.5 tabular-nums">{data.agrupar === "semana" ? `${dataBr(p.inicio).slice(0, 5)} a ${dataBr(p.fim).slice(0, 5)}` : data.agrupar === "dia" ? dataBr(p.inicio) : p.rotulo}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{p.entradas ? brl(p.entradas) : "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{p.saidas ? brl(p.saidas) : "—"}</td>
                          <td className={cn("px-4 py-1.5 text-right font-medium tabular-nums", p.saldo_final < 0 && "text-red-700 dark:text-red-400")}>{brl(p.saldo_final)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">O que vence</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[420px] divide-y overflow-y-auto">
                  {!data.itens.length && <p className="p-4 text-sm text-muted-foreground">Nada previsto no período.</p>}
                  {data.itens.map((i, k) => (
                    <div key={`${i.origem}-${i.id}-${i.data}-${k}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{dataBr(i.data)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{i.descricao}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {ORIGEM[i.origem]}{i.contato ? ` · ${i.contato}` : ""}
                          {i.atrasado && <Badge variant="destructive" className="h-4 px-1 text-[10px] font-normal">atrasado</Badge>}
                        </div>
                      </div>
                      <span className={cn("shrink-0 tabular-nums", i.tipo === "Receita" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                        {i.tipo === "Receita" ? "+" : "−"}{brl(i.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
