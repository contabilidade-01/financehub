import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import PeriodoSelector from "@/components/shared/PeriodoSelector";
import { Periodo, rangeDoPeriodo, rotuloPeriodo } from "@/lib/period";
import type { FluxoProjetado, FluxoProjetadoLinha } from "@shared/schema";

interface Props {
  /** Endpoint base, sem query string. */
  endpoint: string;
  titulo: string;
  subtitulo: string;
  habilitado?: boolean;
}

const OPCOES: Periodo[] = ["next_3m", "next_6m", "next_12m", "current_year", "current_month", "custom"];

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const fmtCurto = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FluxoProjetadoView({ endpoint, titulo, subtitulo, habilitado = true }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("next_12m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [comExtras, setComExtras] = useState(true);

  const range = rangeDoPeriodo(periodo, customFrom, customTo);
  const pronto = Boolean(range.de && range.ate);

  const params = new URLSearchParams();
  if (range.de) params.set("de", range.de);
  if (range.ate) params.set("ate", range.ate);
  const url = `${endpoint}?${params.toString()}`;

  const { data, isLoading, error } = useQuery<FluxoProjetado>({
    queryKey: [url],
    enabled: habilitado && pronto,
  });

  // Reembolsos ficam fora do caixa operacional; o toggle recalcula o acumulado
  // como se eles fossem liquidados no mês em que vencem.
  const saldos = useMemo(() => {
    if (!data) return [];
    if (!comExtras || data.extras.length === 0) return data.meses.map((m) => m.saldo_final);
    let acc = data.saldo_inicial;
    return data.meses.map((m, i) => {
      const extra = data.extras.reduce((s, l) => s + l.valores[i], 0);
      const sinal = data.escopo === "PJ" ? -extra : extra;
      acc = Math.round((acc + m.resultado + sinal) * 100) / 100;
      return acc;
    });
  }, [data, comExtras]);

  const exportarCsv = () => {
    if (!data) return;
    const cab = ["Grupo", "Código", "Conta", ...data.meses.map((m) => m.rotulo), "Total"];
    const linha = (l: FluxoProjetadoLinha) =>
      [l.grupo, l.codigo ?? "", l.nome, ...l.valores.map((v) => v.toFixed(2)), l.total.toFixed(2)];
    const linhas = [
      cab,
      ...data.receitas.map(linha),
      ...data.despesas.map(linha),
      ...data.extras.map(linha),
      ["", "", "Saldo acumulado", ...saldos.map((v) => v.toFixed(2)), ""],
    ];
    const csv = linhas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `fluxo-projetado-${data.escopo.toLowerCase()}-${data.periodo.de}-a-${data.periodo.ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filtros = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <PeriodoSelector
        periodo={periodo}
        onPeriodoChange={setPeriodo}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        opcoes={OPCOES}
      />
      {data && (
        <Button size="sm" variant="outline" onClick={exportarCsv}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      )}
    </div>
  );

  const cabecalho = (
    <div>
      <h2 className="text-xl font-bold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">
        {subtitulo} · {rotuloPeriodo(periodo, range.de, range.ate)}
      </p>
    </div>
  );

  if (!pronto) {
    return (
      <div className="space-y-4">
        {cabecalho}
        {filtros}
        <Card><CardContent className="p-8 text-center text-muted-foreground">Informe as datas inicial e final.</CardContent></Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {cabecalho}
        {filtros}
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        {cabecalho}
        {filtros}
        <Card><CardContent className="p-8 text-center text-muted-foreground">Não foi possível carregar a projeção.</CardContent></Card>
      </div>
    );
  }

  const saldoFinal = saldos.length ? saldos[saldos.length - 1] : data.saldo_inicial;
  const primeiroNegativo = data.meses.find((_, i) => saldos[i] < 0);

  const grupos = (linhas: FluxoProjetadoLinha[]) => {
    const map = new Map<string, FluxoProjetadoLinha[]>();
    for (const l of linhas) {
      if (!map.has(l.grupo)) map.set(l.grupo, []);
      map.get(l.grupo)!.push(l);
    }
    return [...map.entries()];
  };

  const colTotal = data.meses.length + 2;

  const linhaConta = (l: FluxoProjetadoLinha, negativa: boolean) => (
    <tr key={`${l.grupo}-${l.tipo}-${l.conta_id}`} className="border-b last:border-0 hover:bg-muted/40">
      <td className="sticky left-0 z-10 bg-background p-2 pl-6 text-sm">
        {l.codigo ? <span className="text-muted-foreground mr-1 font-numeric">{l.codigo}</span> : null}
        {l.nome}
      </td>
      {l.valores.map((v, i) => (
        <td
          key={i}
          className={`p-2 text-right font-numeric text-sm tabular-nums ${
            v === 0 ? "text-muted-foreground/50" : negativa ? "text-rose-500" : "text-emerald-600"
          }`}
          title={l.previstos[i] > 0 ? `${fmt(l.previstos[i])} ainda previsto` : undefined}
        >
          {fmtCurto(v)}
          {l.previstos[i] > 0 && v > 0 && <span className="ml-1 text-[10px] text-amber-500">•</span>}
        </td>
      ))}
      <td className="p-2 text-right font-numeric text-sm font-medium">{fmtCurto(l.total)}</td>
    </tr>
  );

  const linhaGrupo = (nome: string, linhas: FluxoProjetadoLinha[]) => {
    const somaMes = data.meses.map((_, i) => linhas.reduce((s, l) => s + l.valores[i], 0));
    return (
      <tr key={`g-${nome}`} className="bg-muted/60 border-b">
        <td className="sticky left-0 z-10 bg-muted/60 p-2 text-xs font-label">{nome}</td>
        {somaMes.map((v, i) => (
          <td key={i} className="p-2 text-right font-numeric text-xs font-semibold">{fmtCurto(v)}</td>
        ))}
        <td className="p-2 text-right font-numeric text-xs font-semibold">
          {fmtCurto(somaMes.reduce((s, v) => s + v, 0))}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {cabecalho}
      {filtros}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Saldo inicial</p>
            <p className="text-xl font-numeric font-semibold">{fmt(data.saldo_inicial)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Entradas do período</p>
            <p className="text-xl font-numeric font-semibold text-emerald-600">{fmt(data.totais.entradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Saídas do período</p>
            <p className="text-xl font-numeric font-semibold text-rose-500">{fmt(data.totais.saidas)}</p>
          </CardContent>
        </Card>
        <Card className={saldoFinal >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-rose-50 dark:bg-rose-950/20"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Saldo projetado ao final</p>
            <p className={`text-xl font-numeric font-semibold ${saldoFinal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmt(saldoFinal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {primeiroNegativo && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          O caixa fica negativo a partir de <b className="capitalize">{primeiroNegativo.rotulo}</b>.
        </div>
      )}

      {data.extras.length > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={comExtras} onChange={(e) => setComExtras(e.target.checked)} />
          Considerar “{data.extras_titulo}” no saldo acumulado
        </label>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-20 bg-muted/40 p-2 text-left text-xs font-label min-w-[220px]">Conta</th>
                {data.meses.map((m) => (
                  <th
                    key={m.mes}
                    className={`p-2 text-right text-xs font-label min-w-[92px] ${m.passado ? "text-muted-foreground" : ""}`}
                  >
                    {m.rotulo}
                    {!m.passado && <span className="block text-[9px] font-normal normal-case text-amber-500">previsto</span>}
                  </th>
                ))}
                <th className="p-2 text-right text-xs font-label min-w-[100px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {grupos(data.receitas).map(([nome, linhas]) => (
                <Fragment key={`r-${nome}`}>
                  {linhaGrupo(nome, linhas)}
                  {linhas.map((l) => linhaConta(l, false))}
                </Fragment>
              ))}

              {grupos(data.despesas).map(([nome, linhas]) => (
                <Fragment key={`d-${nome}`}>
                  {linhaGrupo(nome, linhas)}
                  {linhas.map((l) => linhaConta(l, true))}
                </Fragment>
              ))}

              <tr className="border-y-2 bg-background font-semibold">
                <td className="sticky left-0 z-10 bg-background p-2 text-sm">Resultado do mês</td>
                {data.meses.map((m) => (
                  <td key={m.mes} className={`p-2 text-right font-numeric text-sm ${m.resultado >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {fmtCurto(m.resultado)}
                  </td>
                ))}
                <td className="p-2 text-right font-numeric text-sm">{fmtCurto(data.totais.resultado)}</td>
              </tr>

              {data.extras.length > 0 && (
                <Fragment key="extras">
                  {linhaGrupo(data.extras_titulo, data.extras)}
                  {data.extras.map((l) => linhaConta(l, data.escopo === "PJ"))}
                </Fragment>
              )}

              <tr className="bg-muted/60 font-bold">
                <td className="sticky left-0 z-10 bg-muted/60 p-2 text-sm">Saldo acumulado</td>
                {saldos.map((v, i) => (
                  <td key={i} className={`p-2 text-right font-numeric text-sm ${v >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
                    {fmtCurto(v)}
                  </td>
                ))}
                <td className="p-2 text-right font-numeric text-sm">{fmtCurto(saldoFinal)}</td>
              </tr>

              {data.receitas.length === 0 && data.despesas.length === 0 && (
                <tr>
                  <td colSpan={colTotal} className="p-8 text-center text-muted-foreground">
                    Nenhum lançamento com vencimento nesse período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Data de referência é o vencimento (na falta dele, a data do lançamento). Meses futuros somam tudo que está
        em aberto; o ponto <span className="text-amber-500">•</span> marca valores ainda não efetivados. O saldo
        inicial considera apenas o que já foi efetivado antes do período.
      </p>
    </div>
  );
}
