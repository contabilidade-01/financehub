import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiltroBar, periodoPreset, useFiltrosUrl } from "@/components/shared/FiltroBar";
import { cn } from "@/lib/utils";
import { ROTULO_GRUPO_DRE, type GrupoDre, type Indicadores, type SomasDre } from "@shared/indicadores-financeiros";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";
import { PainelIndicadores, pctBr } from "./indicadores-ui";
import { COR, EIXO, Legenda, rotuloMes, TooltipPadrao, valorCurto } from "./graficos";
import type { CentroCusto } from "./centros-custo";

type Aging = Record<"a_vencer" | "1_30" | "31_60" | "61_90" | "90_mais", number>;
interface Painel {
  periodo: { de: string; ate: string };
  anterior: { de: string; ate: string };
  regime: string;
  indicadores: Indicadores;
  indicadores_anterior: Indicadores;
  somas: SomasDre;
  mensal: { mes: string; receitas: number; despesas: number; lucro_liquido: number }[];
  saldo_bancos: { total: number; bancos: { id: number; nome: string; saldo: number }[] };
  evolucao_saldo: { mes: string; saldo: number }[];
  top_clientes: { id: number; nome: string; total: number }[];
  top_fornecedores: { id: number; nome: string; total: number }[];
  receber: { resumo: { total_aberto: number; vencido: number; vence_7_dias: number }; aging: Aging };
  pagar: { resumo: { total_aberto: number; vencido: number; vence_7_dias: number }; aging: Aging };
  proximos_7_dias: { id: number; descricao: string; valor: number; tipo: "Receita" | "Despesa"; vencimento: string; contato: string | null }[];
  projecao: { periodos: { inicio: string; rotulo: string; saldo_final: number }[]; primeiro_negativo: { data: string; saldo: number } | null; saldo_final: number; menor_saldo: { data: string; saldo: number } };
}

export default function AnalisePage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <Analise empresaId={empresaId} />
    </SomenteErp>
  );
}

const mes = periodoPreset("mes");
const PADRAO = { periodo: "mes", de: mes.de, ate: mes.ate, regime: "caixa", centro_custo_id: "", conta_bancaria_id: "" };
const GRUPOS_DESPESA: GrupoDre[] = ["deducao", "cmv", "variavel", "fixa", "financeiro_despesa", "outras", "investimento", "nao_operacional_saida"];

function Analise({ empresaId }: { empresaId: number }) {
  const { valores: f, definir, limpar, ativos } = useFiltrosUrl(PADRAO);
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "periodo")).toString();
  const url = `/api/empresas/${empresaId}/erp/analise?${qs}`;
  const { data, isLoading, error } = useQuery<Painel>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: centros = [] } = useQuery<CentroCusto[]>({ queryKey: [`/api/empresas/${empresaId}/erp/centros-custo`], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/centros-custo`) });
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`) });

  const filtroRazao = `de=${f.de}&ate=${f.ate}&regime=${f.regime}${f.centro_custo_id ? `&centro_custo_id=${f.centro_custo_id}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <CabecalhoPagina
        titulo="Análise da empresa"
        descricao="Resultado, margens, ponto de equilíbrio e caixa num só lugar. Cada bloco leva ao detalhe."
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
          { chave: "conta_bancaria_id", rotulo: "Conta bancária", todos: "Todas", opcoes: bancos.map((b) => ({ valor: String(b.id), rotulo: b.nome || b.banco })) },
        ]}
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando…</div>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : data && (
        <>
          <p className="-mt-3 text-xs text-muted-foreground">
            {dataBr(data.periodo.de)} a {dataBr(data.periodo.ate)}, comparado com {dataBr(data.anterior.de)} a {dataBr(data.anterior.ate)}
          </p>

          <PainelIndicadores ind={data.indicadores} anterior={data.indicadores_anterior} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Resumo titulo="Saldo em bancos" valor={data.saldo_bancos.total} sinal detalhe={`${data.saldo_bancos.bancos.length} conta(s)`} href="/p/contas-bancarias" />
            <Resumo titulo="A receber em aberto" valor={data.receber.resumo.total_aberto} detalhe={data.receber.resumo.vencido ? `${brl(data.receber.resumo.vencido)} vencido` : "nada vencido"} alerta={data.receber.resumo.vencido > 0} href="/p/contas-receber" />
            <Resumo titulo="A pagar em aberto" valor={data.pagar.resumo.total_aberto} detalhe={data.pagar.resumo.vencido ? `${brl(data.pagar.resumo.vencido)} vencido` : "nada vencido"} alerta={data.pagar.resumo.vencido > 0} href="/p/contas-pagar" />
            <Resumo
              titulo="Saldo em 90 dias"
              valor={data.projecao.saldo_final}
              sinal
              detalhe={data.projecao.primeiro_negativo ? `negativo a partir de ${dataBr(data.projecao.primeiro_negativo.data)}` : `menor: ${brl(data.projecao.menor_saldo.saldo)}`}
              alerta={!!data.projecao.primeiro_negativo}
              href="/p/projecoes"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Receitas e despesas, 12 meses</CardTitle>
                <Legenda itens={[{ rotulo: "Receitas", cor: COR.receita }, { rotulo: "Despesas e custos", cor: COR.despesa }]} />
              </CardHeader>
              <CardContent className="h-64 px-2 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.mensal} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke={COR.grade} />
                    <XAxis dataKey="mes" tickFormatter={rotuloMes} {...EIXO} />
                    <YAxis tickFormatter={valorCurto} {...EIXO} width={72} />
                    <Tooltip content={<TooltipPadrao titulo={rotuloMes} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                    <Bar dataKey="receitas" name="Receitas" fill={COR.receita} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="despesas" name="Despesas e custos" fill={COR.despesa} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <PontoEquilibrio ind={data.indicadores} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Saldo em bancos no fim de cada mês</CardTitle>
              </CardHeader>
              <CardContent className="h-56 px-2 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.evolucao_saldo} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid vertical={false} stroke={COR.grade} />
                    <XAxis dataKey="mes" tickFormatter={rotuloMes} {...EIXO} />
                    <YAxis tickFormatter={valorCurto} {...EIXO} width={72} />
                    <ReferenceLine y={0} stroke={COR.eixo} />
                    <Tooltip content={<TooltipPadrao titulo={rotuloMes} />} cursor={{ stroke: COR.eixo, strokeDasharray: "3 3" }} />
                    <Line type="monotone" dataKey="saldo" name="Saldo" stroke={COR.saldo} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Para onde foi o dinheiro</CardTitle>
                <CardDescription>Saídas por grupo, em % da receita bruta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DespesasPorGrupo somas={data.somas} receita={data.indicadores.receita_bruta} />
                <Link href={`/p/razao?${filtroRazao}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Ver o mapa do dinheiro <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Atraso a receber e a pagar</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <BarrasAging titulo="A receber" aging={data.receber.aging} href="/p/contas-receber?status=vencido" />
                <BarrasAging titulo="A pagar" aging={data.pagar.aging} href="/p/contas-pagar?status=vencido" />
              </CardContent>
            </Card>
            <Ranking titulo="Maiores clientes" itens={data.top_clientes} vazio="Vincule clientes às vendas para ver o ranking." />
            <Ranking titulo="Maiores fornecedores" itens={data.top_fornecedores} vazio="Vincule fornecedores às despesas para ver o ranking." />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Próximos 7 dias</CardTitle></CardHeader>
              <CardContent className="p-0">
                {!data.proximos_7_dias.length ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">Nada vence nos próximos 7 dias.</p>
                ) : (
                  <div className="divide-y">
                    {data.proximos_7_dias.map((p) => (
                      <div key={`${p.tipo}-${p.id}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{dataBr(p.vencimento).slice(0, 5)}</span>
                        <span className="min-w-0 flex-1 truncate">{p.descricao}</span>
                        <span className={cn("shrink-0 tabular-nums", p.tipo === "Receita" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                          {p.tipo === "Receita" ? "+" : "−"}{brl(p.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  Projeção de caixa, 90 dias
                  {data.projecao.primeiro_negativo && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" />negativo em {dataBr(data.projecao.primeiro_negativo.data)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-48 px-2 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.projecao.periodos} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid vertical={false} stroke={COR.grade} />
                    <XAxis dataKey="rotulo" {...EIXO} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tickFormatter={valorCurto} {...EIXO} width={72} />
                    <ReferenceLine y={0} stroke={COR.eixo} />
                    <Tooltip content={<TooltipPadrao titulo={(l) => `Semana de ${l}`} />} cursor={{ stroke: COR.eixo, strokeDasharray: "3 3" }} />
                    <Line type="stepAfter" dataKey="saldo_final" name="Saldo previsto" stroke={COR.saldo} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-6 pb-4">
                <Link href="/p/projecoes" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Abrir projeção completa <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Resumo({ titulo, valor, detalhe, href, sinal, alerta }: { titulo: string; valor: number; detalhe: string; href: string; sinal?: boolean; alerta?: boolean }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="p-4">
          <div className="text-xs font-medium text-muted-foreground">{titulo}</div>
          <div className={cn("mt-1 text-xl font-semibold", sinal && valor < 0 && "text-red-700 dark:text-red-400")}>{brl(valor)}</div>
          <div className={cn("flex items-center gap-1 text-xs", alerta ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
            {alerta && <AlertTriangle className="h-3 w-3" />}{detalhe}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Receita do período contra o ponto de equilíbrio: quanto falta (ou sobra) para empatar. */
function PontoEquilibrio({ ind }: { ind: Indicadores }) {
  const pe = ind.ponto_equilibrio;
  const atingido = ind.ponto_equilibrio_atingido_pct;
  const largura = pe ? Math.min(100, (ind.receita_bruta / Math.max(pe, ind.receita_bruta)) * 100) : 0;
  const marca = pe ? Math.min(100, (pe / Math.max(pe, ind.receita_bruta)) * 100) : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ponto de equilíbrio</CardTitle>
        <CardDescription>Quanto é preciso vender para pagar as despesas fixas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pe === null ? (
          <p className="text-sm text-muted-foreground">
            {ind.receita_bruta ? "A margem de contribuição está negativa: cada venda aumenta o prejuízo. Revise preços e custos variáveis." : "Sem receita no período."}
          </p>
        ) : (
          <>
            <div>
              <div className="text-2xl font-semibold">{brl(pe)}</div>
              <div className="text-xs text-muted-foreground">
                {atingido === null ? "Sem despesas fixas no período" : `${pctBr(atingido, 0)} atingido com ${brl(ind.receita_bruta)} vendidos`}
              </div>
            </div>
            <div className="relative h-3 rounded-full bg-muted" aria-hidden>
              <div className="h-3 rounded-full" style={{ width: `${largura}%`, background: COR.receita }} />
              <div className="absolute -top-1 h-5 w-0.5 bg-foreground" style={{ left: `calc(${marca}% - 1px)` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Receita {brl(ind.receita_bruta)}</span>
              <span>Equilíbrio {brl(pe)}</span>
            </div>
            <p className="text-sm">
              {ind.receita_bruta >= pe
                ? <>Margem de segurança de <strong>{pctBr(ind.margem_seguranca_pct, 0)}</strong>: a receita pode cair isso antes de dar prejuízo.</>
                : <>Faltam <strong>{brl(pe - ind.receita_bruta)}</strong> em vendas para empatar.</>}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DespesasPorGrupo({ somas, receita }: { somas: SomasDre; receita: number }) {
  const itens = GRUPOS_DESPESA.map((g) => ({ g, v: somas[g] || 0 })).filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...itens.map((i) => i.v));
  if (!itens.length) return <p className="text-sm text-muted-foreground">Sem saídas no período.</p>;
  return (
    <div className="space-y-2.5">
      {itens.map((i) => (
        <div key={i.g}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{ROTULO_GRUPO_DRE[i.g]}</span>
            <span className="shrink-0 tabular-nums">{brl(i.v)} <span className="text-xs text-muted-foreground">{receita ? pctBr((i.v / receita) * 100, 0) : ""}</span></span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (i.v / max) * 100)}%`, background: COR.despesa }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const FAIXAS: { k: keyof Aging; r: string }[] = [
  { k: "a_vencer", r: "A vencer" }, { k: "1_30", r: "1–30 dias" }, { k: "31_60", r: "31–60" }, { k: "61_90", r: "61–90" }, { k: "90_mais", r: "90+" },
];

function BarrasAging({ titulo, aging, href }: { titulo: string; aging: Aging; href: string }) {
  const total = FAIXAS.reduce((s, f) => s + (aging[f.k] || 0), 0);
  const vencido = total - (aging.a_vencer || 0);
  return (
    <Link href={href} className="block space-y-1.5 rounded-md p-1 hover:bg-muted/40">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{titulo}</span>
        <span className="tabular-nums text-muted-foreground">{brl(total)}</span>
      </div>
      {total > 0 ? (
        <>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
            {FAIXAS.filter((f) => aging[f.k] > 0).map((f) => (
              <div key={f.k} title={`${f.r}: ${brl(aging[f.k])}`} style={{ width: `${(aging[f.k] / total) * 100}%`, background: f.k === "a_vencer" ? COR.receita : COR.critico, opacity: f.k === "a_vencer" ? 1 : 0.55 + FAIXAS.findIndex((x) => x.k === f.k) * 0.1 }} />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{vencido > 0 ? `${brl(vencido)} vencido (${pctBr((vencido / total) * 100, 0)})` : "Nada vencido"}</div>
        </>
      ) : <div className="text-xs text-muted-foreground">Nada em aberto</div>}
    </Link>
  );
}

function Ranking({ titulo, itens, vazio }: { titulo: string; itens: { id: number; nome: string; total: number }[]; vazio: string }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">
        {!itens.length && <p className="text-sm text-muted-foreground">{vazio}</p>}
        {itens.map((i) => (
          <div key={i.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{i.nome}</span>
              <span className="shrink-0 tabular-nums">{brl(i.total)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (i.total / max) * 100)}%`, background: COR.receita }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
